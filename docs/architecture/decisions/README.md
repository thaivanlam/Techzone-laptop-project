# Architecture Decision Records

One file per platform-level decision, numbered in the order they were recorded
and never renumbered. Each states what was chosen, what it bought, and what it
cost.

An ADR is **immutable once accepted**. A decision that no longer holds is not
edited — a new ADR is written, and the old one's status becomes
`Superseded by ADR-NNNN`. The history of what the platform used to be is part of
what these records are for.

New decision? Copy [`template.md`](template.md) to the next free number.

---

## Index

| # | Decision | Status | Affects |
|---|---|---|---|
| [0001](0001-spring-cloud-gateway-webflux.md) | Use the WebFlux variant of Spring Cloud Gateway | Accepted | api-gateway |
| [0002](0002-eureka-service-discovery.md) | Use Eureka for service discovery instead of Kubernetes | Accepted | discovery-service, all services |
| [0003](0003-shared-hmac-jwt-secret.md) | Share one HMAC-SHA JWT secret across all services | Accepted | user-service, gateway, product, order |
| [0004](0004-cookie-based-jwt.md) | Carry the JWT in a readable cookie, not an Authorization header | Accepted | user-service, gateway, frontend |
| [0005](0005-rabbitmq-for-notifications.md) | Deliver notification email asynchronously over RabbitMQ | Accepted | order, user, notification |
| [0006](0006-config-server-native-profile.md) | Run Config Server on the native profile, not Git-backed | Accepted | config-server, all services |
| [0007](0007-embedded-product-snapshot.md) | Embed a ProductSnapshot in order and cart items | Accepted | order-service |
| [0008](0008-single-mysql-multiple-databases.md) | Run one MySQL instance holding three logical databases | Accepted | user, product, order, Compose |
| [0009](0009-resttemplate-for-service-calls.md) | Call Product Service from Order Service with RestTemplate | Accepted | order-service, product-service |
| [0010](0010-prometheus-grafana-metrics.md) | Measure the platform with Micrometer, Prometheus and Grafana | Accepted | all services, Compose, `tests/load/` |

## Reading them together

Several records answer the same underlying question and are best read as pairs:

- **Authentication** — [0003](0003-shared-hmac-jwt-secret.md) (how a token is
  trusted) and [0004](0004-cookie-based-jwt.md) (how it travels). Both trade
  security margin for simplicity, and both are the source of entries in
  [`../../backend/known-defects.md`](../../backend/known-defects.md).
- **The service boundary** — [0007](0007-embedded-product-snapshot.md) (data
  across it) and [0009](0009-resttemplate-for-service-calls.md) (calls across
  it), with [0008](0008-single-mysql-multiple-databases.md) explaining why the
  boundary is logical rather than physical.
- **Blocking versus non-blocking** — [0001](0001-spring-cloud-gateway-webflux.md)
  chose non-blocking at the edge for exactly the reason
  [0009](0009-resttemplate-for-service-calls.md) accepts blocking one layer in.
  The contrast is deliberate and worth being able to defend.

## Scope

These are platform-level decisions. Frontend-specific trade-offs — Redux style,
MUI alongside Tailwind, the cart strategy — stay in
[`../../frontend/design-decisions.md`](../../frontend/design-decisions.md),
which is scoped to a single submodule rather than to the platform.
