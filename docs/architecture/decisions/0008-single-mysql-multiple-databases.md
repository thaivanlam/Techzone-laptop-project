# ADR-0008: Run one MySQL instance holding three logical databases

- **Status:** Accepted
- **Date:** 2026-08-22 (recorded retrospectively; the choice was made during backend development)
- **Affects:** user-service, product-service, order-service, the Compose stack

## Context

Three services own persistent data and must not read each other's tables. The
microservice pattern calls for one data store per service; the practical
constraint is that the whole stack has to start on a single developer machine.

## Decision

One MySQL 8.0 container serves three logical databases — `ecommerce`,
`ecommerce_product`, `ecommerce_order` — each created on demand through
`?createDatabaseIfNotExist=true` on the service's JDBC URL.

## Consequences

**Positive.** One container, one set of credentials, one health check to wait
on. Schema separation is still enforced at the database level: no service has a
connection to another's schema, so the logical boundary holds even though the
process is shared.

**Negative.** It violates the independent-data-store principle in the ways that
actually bite under load. A migration in one service can hold locks that affect
another, and connection-pool exhaustion in one service starves the other two.
The failure modes are shared even though the schemas are not.

**If this is revisited.** Production should give each service its own instance.
The application change is nil — only the JDBC URLs move — so this is a
deployment-topology change rather than a code change, which is why it is
acceptable to defer.

## References

- Detail: [../../operations/database-seeding.md](../../operations/database-seeding.md)
- Compose definition: [`backend/docker-compose.yml`](../../../backend/docker-compose.yml)
- Related: [ADR-0007](0007-embedded-product-snapshot.md) — why cross-database joins never appear
