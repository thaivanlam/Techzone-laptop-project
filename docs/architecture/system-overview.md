# System Overview

The TechZone platform is a laptop e-commerce system built as a set of Spring
Boot microservices behind a Spring Cloud Gateway, with a React single-page
application as the client. It supports three user roles (Customer, Seller,
Admin), a product catalog with technical specifications, a shopping cart,
Stripe-powered checkout, and asynchronous email notifications.

Related documents: [security-model.md](security-model.md) ·
[design-decisions.md](design-decisions.md) ·
[../backend/api-reference.md](../backend/api-reference.md) ·
[../frontend/overview.md](../frontend/overview.md)

---

## Services and Ports

| Service | Port | Responsibility | Database |
|---|---|---|---|
| **Frontend** | 5173 | React SPA; in Docker, nginx also reverse-proxies API calls to the gateway | — |
| **API Gateway** | 8080 | Routing, JWT validation, CORS, role-based filtering | — |
| **Config Server** | 8888 | Centralized configuration (native profile, classpath) | — |
| **Discovery Service** | 8761 | Eureka service registry | — |
| **User Service** | 8082 | Registration, login (BCrypt), JWT generation, addresses, user CRUD | MySQL `ecommerce` |
| **Product Service** | 8081 | Categories, products, specifications, image upload, brand/filter queries | MySQL `ecommerce_product` |
| **Order Service** | 8083 | Cart CRUD, order placement, Stripe payments, order status, analytics | MySQL `ecommerce_order` |
| **Notification Service** | 8084 | Consumes RabbitMQ messages, sends transactional email via SMTP | — |

Supporting infrastructure: **MySQL 8.0** (one container, one logical database
per service) and **RabbitMQ 3** (management UI on 15672).

Every container, the frontend included, joins the same `ecommerce-network`
bridge and addresses the others by service name. See
[../operations/docker-setup.md](../operations/docker-setup.md).

---

## Request Flow

```
Browser (:5173)
   │
   ▼
API Gateway (:8080)  ──── JWT cookie validation
   │                       Route rewriting (/product-manager/** → /**)
   │                       CORS + role-based access control
   │
   ├──► User Service (:8082)          Auth, addresses, user management
   ├──► Product Service (:8081)       Catalog, categories, specs, images
   └──► Order Service (:8083)         Cart, checkout, Stripe payments
           │
           ├──► Product Service       (REST: stock validation & reduction)
           ├──► Stripe API            (PaymentIntent creation)
           └──► RabbitMQ              (Async: order confirmation email)
                   │
                   ▼
               Notification Service (:8084)  ──► Gmail SMTP
```

### Gateway Path Rewriting

The frontend never addresses a microservice directly. It calls the gateway with
a service prefix, which the gateway strips before forwarding:

| External path | Target service | Forwarded as |
|---|---|---|
| `/user-manager/**` | User Service (`:8082`) | `/**` |
| `/product-manager/**` | Product Service (`:8081`) | `/**` |
| `/order-manager/**` | Order Service (`:8083`) | `/**` |

Service instances are resolved through Eureka (`lb://USER-SERVICE`, etc.), so
the gateway holds no hardcoded host addresses.

---

## Walkthrough: Placing an Order

1. The React frontend sends
   `POST /order-manager/api/order/users/payments/stripe` with the JWT cookie.
2. The **API Gateway** `AuthenticationFilter` checks whether the path is public.
   It is not, so the filter extracts the JWT from the `springBootEcom` cookie,
   validates the signature against the shared HMAC secret, and reads the roles.
   The path matches no `role-mappings` entry requiring ADMIN or SELLER, so the
   request passes.
3. The gateway rewrites `/order-manager/**` → `/**` and forwards to
   `ORDER-SERVICE`, resolved through **Eureka**.
4. **Order Service** receives the request. `AuthUtil` re-parses the JWT cookie to
   extract the user's email, which is the identity key — there is no session or
   `SecurityContext` in downstream services.
5. The service loads the user's cart from MySQL. For each cart item it calls
   **Product Service** at `/api/internal/products/{id}` to validate stock, then
   `POST /api/internal/products/{id}/reduce-stock` to decrement inventory.
6. A `Payment` entity is persisted alongside the `Order`. For Stripe, the
   frontend has already obtained a `clientSecret` from
   `/order-manager/api/order/stripe-client-secret`, which created a Stripe
   `PaymentIntent`.
7. Order confirmation is published to RabbitMQ
   (`notification-exchange` / `notification-routing-key`).
8. **Notification Service** consumes the message and sends the confirmation
   email through Gmail SMTP.

---

## Cross-Service Data Boundaries

Each service owns its own logical database and never queries another service's
tables. Two mechanisms bridge the boundary:

- **Synchronous REST** — Order Service calls Product Service's
  `/api/internal/**` endpoints for stock validation and reduction.
- **Embedded snapshots** — `OrderItem` and `CartItem` embed a `ProductSnapshot`
  (name, price, image) instead of a foreign key, capturing product state at the
  time of the order. See
  [decisions/0007-embedded-product-snapshot.md](decisions/0007-embedded-product-snapshot.md).
- **Asynchronous messaging** — user registration and order confirmation events
  are published to RabbitMQ and consumed by Notification Service.

---

## Known Limitations

- No circuit breaker: if Product Service is down, order placement fails with an
  unhandled exception instead of a graceful fallback.
- No distributed tracing; cross-service debugging means correlating container
  logs by hand.
- No rate limiting at the gateway.
- Config Server uses the native profile, so configuration is baked in at build
  time.
- Single Eureka instance, no peer replication.
- JWT cookie uses `httpOnly=false`, and there is no token revocation.
- `getAllSellerOrders` loads all orders into memory before filtering
  (in-memory pagination).

## Roadmap

- Resilience4j circuit breaker for inter-service calls
- Prometheus + Grafana for observability
- Centralized logging (ELK or Loki)
- Redis for a session/cache layer
- Kubernetes deployment manifests
- Load testing with JMeter (Smoke → Load → Stress → Spike)
