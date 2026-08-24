# ADR-0005: Deliver notification email asynchronously over RabbitMQ

- **Status:** Accepted
- **Date:** 2026-08-22 (recorded retrospectively; the choice was made during backend development)
- **Affects:** order-service, user-service, notification-service

## Context

Placing an order and registering an account both trigger email. Email is slow
and unreliable in a way the rest of the request is not: an SMTP handshake, a DNS
lookup, and possible retries add roughly 1–3 seconds. Doing that inside the
checkout request means the customer waits for the mail server.

## Decision

Producing services publish a message to RabbitMQ and return immediately.
`notification-service` consumes the queue and performs SMTP delivery, running
`concurrentConsumers=3`.

## Consequences

**Positive.** Checkout latency no longer includes mail delivery — the order
response returns as soon as the order is persisted. Mail throughput scales by
consumer count rather than by request threads, and a failing mail server slows
delivery instead of failing orders.

**Negative.** One more piece of infrastructure that must be running for the
stack to be complete. Delivery is now fire-and-forget from the producer's point
of view: a message can be lost if RabbitMQ crashes between publish and
consumption. Durable queues narrow that window but do not close it, and nothing
tells the user their confirmation never arrived.

**If this is revisited.** Mail that is genuinely critical — a password reset,
where silence blocks the user entirely — needs publisher confirms, a bounded
retry policy, and a dead-letter queue that someone actually monitors. Order
confirmations tolerate the current design; password resets do not.

## References

- Detail: [../../backend/services/notification-service.md](../../backend/services/notification-service.md)
- Producer side: [../../backend/services/order-service.md](../../backend/services/order-service.md)
