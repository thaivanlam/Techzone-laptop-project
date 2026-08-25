# API Gateway — Architecture Documentation

**Module:** `backend/api-gateway`
**Port:** `8080`
**Stack:** Spring Boot 3.5.7 · Spring Cloud 2025.0.0 · Spring Cloud Gateway (WebFlux) · Java 21

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [System Context](#2-system-context)
3. [Internal Structure](#3-internal-structure)
4. [Routing](#4-routing)
5. [Authentication & Authorization Filter](#5-authentication--authorization-filter)
6. [CORS](#6-cors)
7. [OpenAPI Aggregation](#7-openapi-aggregation)
8. [Configuration](#8-configuration)
9. [Deployment & Dependencies](#9-deployment--dependencies)
10. [Design Notes & Known Trade-offs](#10-design-notes--known-trade-offs)
11. [Cross-References](#11-cross-references)

---

## 1. Service Overview

The API Gateway is the single HTTP entry point for the platform. The frontend
talks only to `http://localhost:8080`; no business service is exposed directly
to the browser in the intended deployment.

It is a **reactive** (WebFlux) application — the only one in the backend. All
business services are servlet-based Spring MVC.

### Responsibilities

| Responsibility | Mechanism |
|---|---|
| Route by path prefix | `spring.cloud.gateway.routes` with `RewritePath` filters |
| Resolve service instances | `lb://SERVICE-NAME` URIs resolved through Eureka |
| Authenticate every request | `AuthenticationFilter` (a `GlobalFilter`) validating the JWT cookie |
| Authorize by role | `gateway.security.role-mappings` matched with `AntPathMatcher` |
| Allow the browser origin | `globalcors` configuration with credentials enabled |
| Aggregate API docs | `springdoc.swagger-ui.urls` pointing at each service's `/v3/api-docs` |

### What it does **not** do

- It does not issue, refresh, or revoke tokens — that is User Service's job.
- It does not forward a decoded identity downstream. Each business service
  re-reads and re-verifies the same cookie itself through its own `JwtService`
  and `AuthUtil`.
- It does not rate-limit, retry, or circuit-break.
- It has no route to Notification Service, which is reachable only inside the
  Docker network.

---

## 2. System Context

```
Browser (React SPA, :5173)
        │  fetch(..., { credentials: 'include' })
        ▼
┌───────────────────────────────────────────────┐
│ API Gateway  :8080                            │
│  AuthenticationFilter (order -100)            │
│   ├─ public path?      → forward              │
│   ├─ OPTIONS preflight → forward              │
│   ├─ cookie missing/invalid → 401             │
│   └─ role mismatch          → 403             │
│  RewritePath: /{svc}-manager/x → /x           │
└───────┬───────────────┬───────────────┬───────┘
        │ lb://         │ lb://         │ lb://
        ▼               ▼               ▼
  USER-SERVICE    PRODUCT-SERVICE   ORDER-SERVICE
     :8082            :8081             :8083
        └──────── register with ────────┘
                        ▼
              Discovery Service :8761
```

### External Dependencies

| Dependency | Purpose | Failure behaviour |
|---|---|---|
| Discovery Service (`:8761`) | Resolves `lb://` URIs | Route returns 503 until the registry cache is populated |
| User / Product / Order Service | Downstream targets | 503 when no instance is registered |
| Config Server | **Not used.** The gateway reads only its own `application.yaml` | n/a |

---

## 3. Internal Structure

```
com.ecommerce.api_gateway
├── ApiGatewayApplication.java         # @SpringBootApplication + @EnableConfigurationProperties
└── security/
    ├── AuthenticationFilter.java      # GlobalFilter, order -100
    ├── GatewaySecurityProperties.java # binds gateway.security.*
    └── JwtService.java                # HMAC verification + roles extraction
```

There are no controllers. Everything the gateway does is configuration plus one
global filter.

| Class | Role |
|---|---|
| `AuthenticationFilter` | Decides pass / 401 / 403 for every exchange |
| `GatewaySecurityProperties` | Type-safe binding of `gateway.security.public-paths` and `gateway.security.role-mappings` |
| `JwtService` | Parses and verifies the token, normalizes the `roles` claim |

---

## 4. Routing

Defined in `backend/api-gateway/src/main/resources/application.yaml`.

| Route id | Predicate | Target | Filter |
|---|---|---|---|
| `product-manager` | `Path=/product-manager/**` | `lb://PRODUCT-SERVICE` | `RewritePath=/product-manager/(?<segment>.*), /{segment}` |
| `user-manager` | `Path=/user-manager/**` | `lb://USER-SERVICE` | `RewritePath=/user-manager/(?<segment>.*), /{segment}` |
| `order-manager` | `Path=/order-manager/**` | `lb://ORDER-SERVICE` | `RewritePath=/order-manager/(?<segment>.*), /{segment}` |
| `eureka-server` | `Path=/eureka/main` | `${EUREKA_SERVER_URL}` | `SetPath=/` |
| `eureka-server-static` | `Path=/eureka/**` | `${EUREKA_SERVER_URL}` | — |

The two Eureka routes exist so the registry dashboard can be browsed through the
gateway: `/eureka/main` serves the HTML page and `/eureka/**` serves its static
assets.

### Rewriting example

```
GET /product-manager/api/public/products?pageSize=6
        ↓ RewritePath
GET /api/public/products?pageSize=6      →  PRODUCT-SERVICE:8081
```

Security rules are evaluated **before** the rewrite, so every pattern under
`gateway.security` must include the `/{service}-manager` prefix.

---

## 5. Authentication & Authorization Filter

`AuthenticationFilter` implements `GlobalFilter` and `Ordered` with
`getOrder() == -100`, so it runs ahead of the routing filters.

### Decision sequence

```
1. path matches a public-path pattern?        → chain.filter (allow)
2. method == OPTIONS (CORS preflight)?        → chain.filter (allow)
3. cookie "springBootEcom" missing or blank?  → 401 {"error":"Missing authentication token"}
4. signature invalid or token expired?        → 401 {"error":"Invalid or expired token"}
5. path matches a role-mapping pattern
   and the token has none of its roles?       → 403 {"error":"Insufficient permissions"}
6. otherwise                                  → chain.filter (allow)
```

Matching uses `AntPathMatcher`. When a path matches several role mappings the
required roles are **unioned**, and holding any one of them is sufficient.

### Error shape

Both failures return `application/json` with a single field:

```json
{ "error": "Invalid or expired token" }
```

This differs from the `APIResponse { message, status }` envelope the business
services use, so the frontend must handle two error shapes.

### Token handling — `JwtService`

- Key: `Keys.hmacShaKeyFor(Decoders.BASE64.decode(spring.app.jwtSecret))`.
- Verification: `Jwts.parser().verifyWith(key).build().parseSignedClaims(token)`.
- `MalformedJwtException`, `ExpiredJwtException`, `UnsupportedJwtException`, and
  `IllegalArgumentException` are caught, logged at WARN, and treated as invalid.
- `extractRoles` accepts either a JSON array **or** a comma-separated string,
  trimming blanks. Anything else yields an empty list.

### Public paths

```
/user-manager/api/auth/**          /order-manager/api/public/**
/user-manager/api/public/**        /order-manager/api/internal/**
/product-manager/api/public/**     /eureka/**
/product-manager/images/**         /swagger-ui/**
/v3/api-docs/**  and the per-service /{svc}-manager/v3/api-docs/**
```

### Role mappings

| Pattern | Required roles |
|---|---|
| `/product-manager/api/admin/**` | `ROLE_ADMIN` |
| `/product-manager/api/seller/**` | `ROLE_SELLER` |
| `/user-manager/api/admin/**` | `ROLE_ADMIN` |
| `/order-manager/api/admin/**` | `ROLE_ADMIN` |
| `/order-manager/api/seller/**` | `ROLE_ADMIN`, `ROLE_SELLER` |

`resolveRequiredRoles` unions the roles of *every* matching pattern and passes if
the token holds any one of them, so overlapping rules widen access rather than
narrow it.

Everything not listed as public and not listed here needs a **valid token but no
particular role**. The consequences are covered in
[../../architecture/security-model.md](../../architecture/security-model.md#enforcement-gaps-worth-knowing)
and repeated in [§10](#10-design-notes--known-trade-offs).

---

## 6. CORS

```yaml
spring.cloud.gateway.globalcors.cors-configurations."[/**]":
  allowedOrigins: [http://localhost:3000, http://localhost:5173, "${FRONTEND_URL:http://localhost:5173}"]
  allowedMethods: [GET, POST, PUT, DELETE, OPTIONS, PATCH]
  allowedHeaders: "*"
  allowCredentials: true
  maxAge: 3600
```

`allowCredentials: true` is what lets the browser attach the `springBootEcom`
cookie to cross-origin requests, so the SPA must send `credentials: 'include'`.
Because credentials are allowed, origins must be listed explicitly — `*` is not
permitted by the CORS specification in this mode.

`FRONTEND_URL` sits alongside the two literal localhost entries; in a deployment
where `FRONTEND_URL` is the real origin, both localhost origins remain allowed.

---

## 7. OpenAPI Aggregation

`springdoc-openapi-starter-webflux-ui` serves a Swagger UI at
`http://localhost:8080/swagger-ui.html` with a service selector:

| Name | Document URL |
|---|---|
| `USER-SERVICE` | `/user-manager/v3/api-docs` |
| `PRODUCT-SERVICE` | `/product-manager/v3/api-docs` |
| `ORDER-SERVICE` | `/order-manager/v3/api-docs` |

Each document is fetched through the gateway, which is why the corresponding
`/{svc}-manager/v3/api-docs/**` public paths exist. The business services
disable `springdoc.api-docs` under the `prod` profile, so the selector is only
useful in dev.

---

## 8. Configuration

The gateway does **not** use Config Server. All configuration is local, in
`backend/api-gateway/src/main/resources/application.yaml`.

| Key | Default | Purpose |
|---|---|---|
| `server.port` | `8080` | Listen port |
| `spring.app.jwtSecret` | hardcoded literal | HMAC key, must equal the one every service uses |
| `spring.app.jwtExpirationMs` | `3000000` | Present but unused here — only User Service mints tokens |
| `spring.ecom.app.jwtCookieName` | `springBootEcom` | Cookie the filter reads |
| `gateway.security.public-paths` | see [§5](#public-paths) | Paths that skip authentication |
| `gateway.security.role-mappings` | see [§role-mappings](#role-mappings) | Path → required roles |
| `frontend.url` | `${FRONTEND_URL:http://localhost:5173}` | Declared for reference |
| `eureka.instance.prefer-ip-address` | `true` | Register by IP |
| `eureka.client.register-with-eureka` / `fetch-registry` | `true` | The gateway both registers and reads the registry |

### Environment variables

| Variable | Default | Used by |
|---|---|---|
| `EUREKA_CLIENT_SERVICEURL_DEFAULTZONE` | `http://localhost:8761/eureka/` | Eureka client |
| `EUREKA_SERVER_URL` | `http://localhost:8761` | The two `eureka-*` routes |
| `FRONTEND_URL` | `http://localhost:5173` | CORS allowed origin |

---

## 9. Deployment & Dependencies

### Docker

Multi-stage build on `mcr.microsoft.com/openjdk/jdk:21-ubuntu`, exposing `8080`.

In `backend/docker-compose.yml` the gateway sits under the `prod` profile and
depends on `discovery-service` being healthy. The business services — and the
frontend container in the root `docker-compose.yml` — declare
`depends_on: api-gateway: condition: service_healthy`, so the gateway carries a
healthcheck:

```yaml
test: ["CMD-SHELL", "timeout 3 bash -c '</dev/tcp/127.0.0.1/8080' || exit 1"]
```

It is a TCP probe rather than `GET /actuator/health` because the gateway does
not depend on Spring Boot Actuator (Config Server and Discovery Service do, and
use the HTTP probe). A listening port therefore means "the process is up", not
"all routes resolve" — a route whose target has not registered with Eureka yet
still returns `503`.

### Maven dependencies

| Dependency | Version | Why |
|---|---|---|
| `spring-cloud-starter-gateway-server-webflux` | 2025.0.0 | Reactive gateway |
| `spring-cloud-starter-netflix-eureka-client` | 2025.0.0 | `lb://` resolution |
| `springdoc-openapi-starter-webflux-ui` | 2.8.17 | Aggregated Swagger UI |
| `jjwt-api` / `jjwt-impl` / `jjwt-jackson` | 0.13.0 | JWT parsing and verification |
| `reactor-test`, `spring-boot-starter-test` | — | Test scope |

The gateway pins jjwt **0.13.0** while Product Service pins **0.12.6**. Both
verify tokens issued by User Service, so the versions must stay
signature-compatible.

### Tests

`ApiGatewayApplicationTests` is a context-load smoke test only. Routing rules,
public-path matching, and role checks are untested.

---

## 10. Design Notes & Known Trade-offs

### 1. Identity is verified twice

The gateway validates the token and then forwards the original request
unchanged; it adds no `X-User-Email` or similar header. Every business service
therefore parses the same cookie again through its own `AuthUtil`. This keeps
services independently runnable in dev (bypassing the gateway) at the cost of
duplicated verification code in three modules.

### 2. The JWT secret is a literal in `application.yaml`

The same base64 string is repeated in the gateway's `application.yaml` and in
Config Server's `user-service.yml`, `product-service.yml`, and
`order-service.yml`. It is committed to the repository, so anyone with repo
access can mint a valid admin token. See
[../../architecture/decisions/0003-shared-hmac-jwt-secret.md](../../architecture/decisions/0003-shared-hmac-jwt-secret.md).

### 3. Role mappings do not cover every privileged path

- `/user-manager/api/auth/**` is public, and User Service's customer/seller
  listing and deletion endpoints live under it.
- Role checks are path-based only. The gateway knows *which* role a caller holds,
  never *which rows* they own, so ownership guards must live in the services.

Two entries used to sit here and were closed on 2026-08-25:
`/product-manager/api/seller/**` now requires `ROLE_SELLER`, and
`ProductSpecificationController` moved from `/api/products/{role}/...` to
`/api/{role}/products/...` so the role segment lands where the patterns match.
The move also restored anonymous reads of a laptop's specifications.

### 4. `/order-manager/api/internal/**` is a public path

The internal path is listed as public so service-to-service calls are not
blocked. Order Service currently exposes no `/api/internal/**` controller, so
nothing is reachable through it today, but the rule would expose any that is
added. Product Service's `/api/internal/**` is *not* in the public list — Order
Service reaches it directly at `product.service.base-url`, bypassing the gateway
entirely.

### 5. No resilience filters

There is no rate limiter, retry, timeout, or circuit breaker. A slow or failing
downstream service surfaces as a hanging or 503 request with no fallback.

### 6. Preflight requests skip authentication by design

`OPTIONS` is allowed through before the token check so the CORS preflight
succeeds. This is correct — a preflight carries no cookie — but it means the
filter's allow-list is effectively "public paths plus every `OPTIONS`".

---

## 11. Cross-References

| Topic | Document |
|---|---|
| End-to-end request flow and ports | [../../architecture/system-overview.md](../../architecture/system-overview.md) |
| JWT claims, roles, enforcement gaps | [../../architecture/security-model.md](../../architecture/security-model.md) |
| Why WebFlux, why Eureka, why cookie JWT | [../../architecture/design-decisions.md](../../architecture/design-decisions.md) |
| Every endpoint behind the gateway | [../api-reference.md](../api-reference.md) |
| Token issuer | [user-service.md](user-service.md) |
| Registry the `lb://` URIs resolve through | [discovery-service.md](discovery-service.md) |
| Startup order and env vars | [../../operations/running-locally.md](../../operations/running-locally.md) |
