# ADR-0001: Use the WebFlux variant of Spring Cloud Gateway

- **Status:** Accepted
- **Date:** 2026-08-22 (recorded retrospectively; the choice was made during backend development)
- **Affects:** api-gateway

## Context

Every browser request enters the platform through one component, which proxies
it to a business service and enforces authentication on the way. That component
therefore holds an open connection for the whole duration of each downstream
call, and the target load for the project is on the order of 1000 concurrent
users.

Spring Cloud Gateway ships in two variants: a servlet-based one and a reactive
one built on Project Reactor and Netty.

## Decision

The gateway depends on `spring-cloud-starter-gateway-server-webflux` — the
reactive, non-blocking variant. Authentication is implemented as a reactive
filter returning `Mono<Void>`.

## Consequences

**Positive.** One thread can hold thousands of in-flight connections, because a
thread is occupied only while a request is actively being processed, not while
it waits on a downstream response. A servlet gateway allocates a thread per
request and would exhaust its pool far earlier at the target concurrency — for a
component whose work is almost entirely waiting on I/O, this is the difference
that matters.

**Negative.** Reactive code is harder to debug. `AuthenticationFilter` composes
`Mono<Void>` chains, so error handling is less intuitive than a servlet filter's
synchronous `doFilter()`: stack traces are assembled from the operator chain
rather than the call stack, and a missing `.subscribe()` fails silently. Project
Reactor carries a real learning curve for anyone maintaining this afterwards.

**If this is revisited.** Only a move to a service mesh or an infrastructure
ingress (see [ADR-0002](0002-eureka-service-discovery.md)) would displace it; at
that point routing and auth leave application code entirely.

## References

- Source: [`backend/api-gateway/src/main/resources/application.yaml`](../../../backend/api-gateway/src/main/resources/application.yaml)
- Detail: [../../backend/services/api-gateway.md](../../backend/services/api-gateway.md)
- Related: [ADR-0003](0003-shared-hmac-jwt-secret.md) — what the gateway filter validates
