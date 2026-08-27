# Design Decisions and Trade-offs

The platform-level decisions that were once listed here now live one per file as
Architecture Decision Records, so that each carries its own status and can be
superseded without rewriting the others.

➜ **[decisions/](decisions/)** — the full index.

Frontend-specific decisions were never part of this file and remain in
[../frontend/design-decisions.md](../frontend/design-decisions.md).

---

## Quick map

| Question | Record |
|---|---|
| Why is the gateway reactive? | [ADR-0001](decisions/0001-spring-cloud-gateway-webflux.md) |
| Why Eureka and not Kubernetes? | [ADR-0002](decisions/0002-eureka-service-discovery.md) |
| Why does every service hold the same JWT secret? | [ADR-0003](decisions/0003-shared-hmac-jwt-secret.md) |
| Why is the token in a readable cookie? | [ADR-0004](decisions/0004-cookie-based-jwt.md) |
| Why is email sent through RabbitMQ? | [ADR-0005](decisions/0005-rabbitmq-for-notifications.md) |
| Why does changing a config value need a rebuild? | [ADR-0006](decisions/0006-config-server-native-profile.md) |
| Why do orders embed product data instead of referencing it? | [ADR-0007](decisions/0007-embedded-product-snapshot.md) |
| Why does one MySQL container serve three databases? | [ADR-0008](decisions/0008-single-mysql-multiple-databases.md) |
| Why RestTemplate rather than Feign or WebClient? | [ADR-0009](decisions/0009-resttemplate-for-service-calls.md) |
| Why Prometheus and Grafana, and why JMeter for load? | [ADR-0010](decisions/0010-prometheus-grafana-metrics.md) |

## Recording a new decision

Copy [decisions/template.md](decisions/template.md) to the next free number and
add a row to [decisions/README.md](decisions/README.md). Do not add decisions to
this file — it is an index, not a store.
