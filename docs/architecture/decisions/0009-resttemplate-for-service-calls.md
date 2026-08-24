# ADR-0009: Call Product Service from Order Service with RestTemplate

- **Status:** Accepted
- **Date:** 2026-08-22 (recorded retrospectively; the choice was made during backend development)
- **Affects:** order-service, product-service

## Context

Placing an order must decrement stock, which product-service owns. The call has
to happen before the order is confirmed, so it is synchronous by nature. Three
clients were available: `RestTemplate`, `WebClient`, and Spring Cloud OpenFeign.

## Decision

Order Service calls Product Service's internal `reduce-stock` endpoint over
synchronous `RestTemplate`.

## Consequences

**Positive.** The simplest option, and consistent with the servlet stack both
services already run on — no reactive types leaking into otherwise blocking
code, and a stack trace that reads top to bottom.

**Negative.** `RestTemplate` is in maintenance mode, so it is a dependency with
no future. It blocks the calling thread: the `reduce-stock` call holds the
order-placement thread until product-service answers, and under high concurrency
that exhausts the Tomcat pool — the same failure the gateway's reactive choice
in [ADR-0001](0001-spring-cloud-gateway-webflux.md) was made to avoid, one layer
down. There is no timeout, retry, or circuit breaker around the call.

**If this is revisited.** Spring Cloud OpenFeign is the smaller step —
declarative, far less boilerplate, and it integrates with Eureka and
Resilience4j for the missing timeout and circuit breaker. WebClient is
non-blocking but imports reactive complexity into a servlet application.
Adding a timeout is worth doing regardless of which client stays.

## References

- Detail: [../../backend/services/order-service.md](../../backend/services/order-service.md)
- Endpoint: [../../backend/api-reference.md](../../backend/api-reference.md)
- Related: [ADR-0007](0007-embedded-product-snapshot.md) — the data half of the same boundary
