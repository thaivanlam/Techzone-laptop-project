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
| Authenticate every request | OAuth2 resource server: verifies the Keycloak RS256 bearer token against the realm JWKS |
| Authorize by role | `SecurityWebFilterChain` built from `gateway.security.role-mappings` (`GatewaySecurityConfig`) |
| Allow the browser origin | `globalcors` configuration, also applied inside the security chain |
| Aggregate API docs | `springdoc.swagger-ui.urls` pointing at each service's `/v3/api-docs` |

### What it does **not** do

- It does not issue, refresh, or revoke tokens — that is Keycloak's job
  (ADR-0012). It holds no signing key and cannot mint a token.
- It does not forward a decoded identity downstream. It forwards the
  `Authorization` header unchanged, and each business service verifies the same
  token again as a resource server of its own.
- It does not route to Keycloak. The browser reaches Keycloak directly on `:8090`.
- It does not rate-limit, retry, or circuit-break.
- It has no route to Notification Service, which is reachable only inside the
  Docker network.

---

## 2. System Context

```
Browser (React SPA, :5173) ───── sign-in redirect ─────► Keycloak :8090
        │  Authorization: Bearer <RS256 token>                   │
        ▼                                                        │ JWKS
┌───────────────────────────────────────────────┐                │ (cached)
│ API Gateway  :8080                            │ ◄──────────────┘
│  SecurityWebFilterChain (GatewaySecurityConfig)│
│   ├─ OPTIONS preflight → forward              │
│   ├─ public path?      → forward              │
│   ├─ no token          → 401                  │
│   ├─ token unverifiable→ 401                  │
│   └─ role mismatch     → 403                  │
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
| Keycloak (`:8090`) | Public keys (JWKS) for token verification | Keys are fetched on first use and cached; until then, and if Keycloak is unreachable with an empty cache, protected routes answer 401. Already-cached keys keep working while Keycloak is down |
| Config Server | **Not used.** The gateway reads only its own `application.yaml` | n/a |

---

## 3. Internal Structure

```
com.ecommerce.api_gateway
├── ApiGatewayApplication.java         # @SpringBootApplication + @EnableConfigurationProperties
└── security/
    ├── GatewaySecurityConfig.java       # SecurityWebFilterChain + CORS source
    ├── GatewaySecurityProperties.java   # binds gateway.security.*
    ├── KeycloakRealmRoleConverter.java  # realm_access.roles → authorities
    └── JsonErrorResponses.java          # the {"error": "..."} envelope
```

There are no controllers. Everything the gateway does is configuration plus one
security filter chain.

| Class | Role |
|---|---|
| `GatewaySecurityConfig` | Builds the chain from `GatewaySecurityProperties`; decides pass / 401 / 403 |
| `GatewaySecurityProperties` | Type-safe binding of `gateway.security.public-paths` and `gateway.security.role-mappings` — still the single statement of the policy |
| `KeycloakRealmRoleConverter` | Reads `realm_access.roles`, used verbatim as authorities (no prefix added) |
| `JsonErrorResponses` | Entry point and access-denied handler writing the same bodies the old filter did |

`AuthenticationFilter` and `JwtService` were **deleted** on 2026-09-12 (ADR-0012).

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

## 5. Authentication & Authorization

`GatewaySecurityConfig` defines a `SecurityWebFilterChain`. It is a WebFlux
`WebFilter`, so it runs before Spring Cloud Gateway's handler mapping — ahead of
routing and of every `GlobalFilter`.

### Decision sequence

```
1. method == OPTIONS (CORS preflight)?        → permit
2. path matches a public-path pattern?        → permit
3. path matches a role-mapping pattern?       → hasAnyAuthority(its roles)
4. otherwise                                  → authenticated()

Authentication, for 3 and 4:
   no Authorization: Bearer header            → 401 {"error":"Missing authentication token"}
   signature, iss or exp does not verify      → 401 {"error":"Invalid or expired token"}
   authenticated, role missing                → 403 {"error":"Insufficient permissions"}
```

Spring Security evaluates the rules **in order and stops at the first match**. The
filter this replaced unioned the roles of every matching mapping. The shipped
patterns are disjoint, so no route changed — but two overlapping mappings would
now behave differently, and the narrower one has to be listed first.

### Error shape

Every refusal returns `application/json` with a single field — byte-for-byte what
the deleted filter produced, because the SPA and the `tests/` suites read it:

```json
{ "error": "Invalid or expired token" }
```

This differs from the `APIResponse { message, status }` envelope the business
services use, so the frontend must handle two error shapes.

### Token verification

- `spring.security.oauth2.resourceserver.jwt.jwk-set-uri` — public keys, fetched
  from the address the container can reach, and cached.
- `spring.security.oauth2.resourceserver.jwt.issuer-uri` — the public issuer,
  compared with `iss`. Setting both skips OIDC discovery at startup.
- Any failure — bad signature, wrong issuer, expired, malformed — is a
  `JwtException` handled by the resource server's entry point as a 401. There is no
  hand-written catch list to get wrong: that was BUG-19, closed.
- Principal name: the `email` claim.

The `springBootEcom` cookie is not read by anything. Presenting one is the same as
presenting nothing (`GatewayBearerTokenSecurityTest.legacyCookieIsNotACredential`).

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

The first matching pattern wins, and the caller passes if the token holds any one
of its roles.

`ROLE_ADMIN` reaches `/product-manager/api/seller/**` only because the realm's
`ROLE_ADMIN` is a composite that includes `ROLE_SELLER`, which Keycloak expands into
the token. Both directions are tested.

Everything not listed as public and not listed here needs a **valid token but no
particular role**. The consequences are covered in
[../../architecture/security-model.md](../../architecture/security-model.md#what-this-model-does-not-do)
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

Since ADR-0012 no cookie carries a credential; the token is an ordinary
`Authorization` header, which `allowedHeaders: "*"` already covers, and the SPA no
longer sets `withCredentials`. `allowCredentials: true` is kept, and because it is,
origins must still be listed explicitly.

`GatewaySecurityConfig` registers this same map as the security chain's
`CorsConfigurationSource`. Without that, a 401 raised before routing would carry no
CORS headers and the browser would report an opaque CORS failure instead of letting
the SPA read the error.

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
| `spring.security.oauth2.resourceserver.jwt.issuer-uri` | `${KEYCLOAK_ISSUER_URI:http://localhost:8090/realms/techzone}` | Expected `iss`; compared, never fetched |
| `spring.security.oauth2.resourceserver.jwt.jwk-set-uri` | `${KEYCLOAK_JWK_SET_URI:http://localhost:8090/realms/techzone/protocol/openid-connect/certs}` | Where public keys are fetched |
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
| `KEYCLOAK_ISSUER_URI` | `http://localhost:8090/realms/techzone` | Resource server |
| `KEYCLOAK_JWK_SET_URI` | `http://localhost:8090/...` locally, `http://keycloak:8090/...` in Compose | Resource server |

---

## 9. Deployment & Dependencies

### Docker

Multi-stage build on `mcr.microsoft.com/openjdk/jdk:21-ubuntu`, exposing `8080`.

In `backend/docker-compose.yml` the gateway sits under the `prod` profile and
depends on `discovery-service` and `keycloak` being healthy. The business services — and the
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
| `spring-boot-starter-oauth2-resource-server` | Boot 3.5.7 | Token verification against the JWKS; brings Spring Security |
| `reactor-test`, `spring-boot-starter-test`, `spring-security-test` | — | Test scope |

jjwt is no longer a dependency of any module (the 0.13.0 / 0.12.6 skew recorded as
OPS-03 is moot).

### Tests

| Class | Level | Covers |
|---|---|---|
| `KeycloakRealmRoleConverterTest` | unit | The `realm_access.roles` claim shape; a flat `roles` claim is ignored |
| `GatewayBearerTokenSecurityTest` | integration | The full truth table against the real chain with a mocked decoder: public paths, SEC-10 and SEC-12 characterisations, 401 for missing / forged / expired tokens, the old cookie ignored, role mappings, composite admin roles in both directions |
| `GatewaySecurityPolicyTest` | integration | The deployed `application.yaml` still says what the tests assume |
| `ApiGatewayApplicationTests` | smoke | Context loads |

`AuthenticationFilterTest` was deleted with the class it tested; its cases —
including the SEC-10 characterisation and the BUG-19 one, inverted — are carried
by `GatewayBearerTokenSecurityTest`.

---

## 10. Design Notes & Known Trade-offs

### 1. Identity is verified twice

The gateway verifies the token and forwards the original request unchanged; it adds
no `X-User-Email` or similar header. Every business service verifies the same token
again as a resource server. Since ADR-0012 that costs no duplicated code — it is
Spring Security configuration in each service — and it matters, because SEC-10
records that the service ports are published and a request may never have passed
the gateway.

### 2. Keycloak is on the sign-in path

Token *verification* is offline once the JWKS is cached, so an authenticated
request does not depend on Keycloak. Obtaining a token does. The gateway itself
will still start while Keycloak is down: setting `jwk-set-uri` avoids discovery at
boot.

### 3. Role mappings do not cover every privileged path

- Role checks are path-based only. The gateway knows *which* role a caller holds,
  never *which rows* they own, so ownership guards must live in the services.

Three entries used to sit here. On 2026-09-12 User Service's customer and seller
administration moved from the public `/user-manager/api/auth/**` to
`/user-manager/api/admin/users/**`, under the existing `ROLE_ADMIN` rule (SEC-02).
Two were closed on 2026-08-25:
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
succeeds. This is correct — a preflight carries no `Authorization` header — but it
means the chain's allow-list is effectively "public paths plus every `OPTIONS`".

---

## 11. Cross-References

| Topic | Document |
|---|---|
| End-to-end request flow and ports | [../../architecture/system-overview.md](../../architecture/system-overview.md) |
| JWT claims, roles, enforcement gaps | [../../architecture/security-model.md](../../architecture/security-model.md) |
| Why WebFlux, why Eureka, why Keycloak | [../../architecture/design-decisions.md](../../architecture/design-decisions.md) |
| Every endpoint behind the gateway | [../api-reference.md](../api-reference.md) |
| Token issuer | [user-service.md](user-service.md) |
| Registry the `lb://` URIs resolve through | [discovery-service.md](discovery-service.md) |
| Startup order and env vars | [../../operations/running-locally.md](../../operations/running-locally.md) |
