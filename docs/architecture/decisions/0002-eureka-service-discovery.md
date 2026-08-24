# ADR-0002: Use Eureka for service discovery instead of Kubernetes

- **Status:** Accepted
- **Date:** 2026-08-22 (recorded retrospectively; the choice was made during backend development)
- **Affects:** discovery-service, api-gateway, all business services

## Context

The gateway must resolve a logical service name to a running instance, and the
business services must be reachable without hard-coded hosts across three
different run modes (full Docker, hybrid, fully local). The whole platform runs
on a single host under Docker Compose.

## Decision

A standalone Eureka server runs as `discovery-service`; the gateway and the four
business services register with it and resolve each other through it.

## Consequences

**Positive.** Discovery costs nothing beyond one more Spring Boot JAR — no
cluster, no manifests, no ingress controller. It works identically in all three
run modes, which is what makes the hybrid mode (infrastructure in Docker,
business services on the host) practical at all.

**Negative.** An extra network hop for resolution. No peer replication is
configured, so the registry is a single point of failure. None of the
infrastructure-level traffic management a real platform eventually wants —
canary routing, circuit breaking, retries at the mesh layer — is available.

**If this is revisited.** Kubernetes DNS-based discovery is the production
answer and would suit a deployed system better, but it brings cluster
management, Helm charts, and ingress controllers that a graduation project does
not justify.

## References

- Detail: [../../backend/services/discovery-service.md](../../backend/services/discovery-service.md)
- Related: [ADR-0001](0001-spring-cloud-gateway-webflux.md) — the main consumer of the registry
