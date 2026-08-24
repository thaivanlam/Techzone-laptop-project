# Backend Overview

The backend ([`backend/`](../../backend)) is a Maven multi-module microservices
system on **Spring Boot 3.5.7** / **Spring Cloud 2025** / **Java 21**.

Related documents: [api-reference.md](api-reference.md) ·
[known-defects.md](known-defects.md) ·
[../architecture/system-overview.md](../architecture/system-overview.md) ·
[../operations/running-locally.md](../operations/running-locally.md)

Every module has its own architecture document under [`services/`](services):
[api-gateway](services/api-gateway.md) · [config-server](services/config-server.md) ·
[discovery-service](services/discovery-service.md) · [user-service](services/user-service.md) ·
[product-service](services/product-service.md) · [order-service](services/order-service.md) ·
[notification-service](services/notification-service.md)

---

## Module Layout

```
backend/
├── api-gateway/            # Spring Cloud Gateway (WebFlux) — :8080
├── config-server/          # Spring Cloud Config, native profile — :8888
├── discovery-service/      # Eureka server — :8761
├── user-service/           # Identity, auth, addresses — :8082
├── product-service/        # Catalog, categories, specs, images — :8081
├── order-service/          # Cart, orders, Stripe payments — :8083
├── notification-service/   # RabbitMQ consumer → SMTP — :8084
└── docker-compose.yml      # Backend stack: MySQL, RabbitMQ, all services
```

The repo root adds [`../../docker-compose.yml`](../../docker-compose.yml), which
`include`s this file and attaches the frontend container to the same network —
see [../operations/docker-setup.md](../operations/docker-setup.md).

---

## Infrastructure Services

### API Gateway (`:8080`)

The single entry point. Responsibilities:

- **Routing** — strips the `/{service}-manager` prefix and forwards to a Eureka-
  resolved instance (`lb://USER-SERVICE`, etc.).
- **Authentication** — `AuthenticationFilter` validates the `springBootEcom` JWT
  cookie on every non-public path.
- **Authorization** — `role-mappings` in `application.yaml` gate admin and
  seller path patterns. See
  [../architecture/security-model.md](../architecture/security-model.md#gateway-enforcement).
- **CORS** — allows the frontend origin (`FRONTEND_URL`, default
  `http://localhost:5173`) with credentials.

Key file: `backend/api-gateway/src/main/resources/application.yaml`.
Full document: [services/api-gateway.md](services/api-gateway.md).

### Config Server (`:8888`)

Serves configuration from `classpath:/config` using the `native` profile. Each
service resolves three layers: its own bootstrap `application.yaml`, the shared
`<service>.yml`, and the profile-specific `<service>-dev.yml` or
`<service>-prod.yml`.

Key directory: `backend/config-server/src/main/resources/config/`.
Full document: [services/config-server.md](services/config-server.md).

### Discovery Service (`:8761`)

A single-node Eureka registry. Every business service registers on startup, and
the gateway resolves `lb://` URIs through it. No peer replication is configured.

Full document: [services/discovery-service.md](services/discovery-service.md).

---

## Business Services

### User Service (`:8082`) — `/user-manager/**`

Identity and profile. Registration, login with BCrypt verification, JWT issuance
into the `springBootEcom` cookie, paginated customer/seller listing and
deletion, and address CRUD. Publishes a welcome-email message to RabbitMQ on
signup. It is the platform's only token issuer.

Full document: [services/user-service.md](services/user-service.md).

### Product Service (`:8081`) — `/product-manager/**`

The catalog. Categories, products with technical specifications (CPU, RAM,
storage, display, GPU), image upload, and filtered/paginated public search by
keyword, category, price range, brand, processor, RAM, and storage. Exposes
`/api/internal/**` endpoints that Order Service calls to validate and reduce
stock.

Database: `ecommerce_product`. Full document:
[services/product-service.md](services/product-service.md).

### Order Service (`:8083`) — `/order-manager/**`

Cart and checkout. Cart CRUD, order placement, Stripe `PaymentIntent` creation,
order status transitions for customer/seller/admin, and analytics aggregates.
Calls Product Service synchronously over `RestTemplate` for stock, and publishes
order confirmations to RabbitMQ.

Cart and order items embed a `ProductSnapshot` rather than referencing Product
by foreign key — see
[../architecture/design-decisions.md](../architecture/design-decisions.md#why-productsnapshot-embedded-instead-of-a-foreign-key-to-product).

Database: `ecommerce_order`. Full document:
[services/order-service.md](services/order-service.md).

### Notification Service (`:8084`) — not exposed through the gateway

A RabbitMQ consumer (`notification-exchange` / `notification-routing-key`,
`concurrentConsumers=3`) that sends transactional email through Gmail SMTP. It
also exposes `POST /api/v1/notifications/sendMail` for direct invocation, though
the normal path is asynchronous.

Full document: [services/notification-service.md](services/notification-service.md).

---

## Shared Conventions

| Concern | Convention |
|---|---|
| Layering | `controller/` → `service/` → `repositories/` → `model/`, with `payload/` DTOs |
| Persistence | Spring Data JPA, `spring.jpa.hibernate.ddl-auto: update` |
| Mapping | ModelMapper for entity ↔ DTO |
| Pagination | `pageNumber`, `pageSize`, `sortBy`, `sortOrder` query params with `AppConstants` defaults |
| Errors | `@RestControllerAdvice` global handler returning `APIResponse(message, status)` |
| Identity | JWT cookie parsed manually by a per-service `AuthUtil`; no `SecurityContext` downstream |
| API docs | springdoc-openapi, enabled in `dev`, disabled in `prod` |
| Build | Multi-stage Dockerfile per service (OpenJDK 21 builder + runtime; notification-service is still on JDK 17) |

---

## Testing Status

Coverage is minimal across the backend — each service has a Spring context-load
smoke test only. Login, signup, JWT validation, cart mutation, stock reduction,
and address CRUD are untested.
