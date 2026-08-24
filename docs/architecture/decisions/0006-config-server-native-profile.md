# ADR-0006: Run Config Server on the native profile, not Git-backed

- **Status:** Accepted
- **Date:** 2026-08-22 (recorded retrospectively; the choice was made during backend development)
- **Affects:** config-server, all services that fetch configuration

## Context

Six services need consistent configuration across three run modes, with secrets
injected from the environment rather than committed. Spring Cloud Config Server
can serve that configuration from a Git repository or from its own classpath.

## Decision

`spring.profiles.active=native`, with the per-service YAML under
`classpath:/config` — so configuration is baked into the config-server JAR at
build time. Secrets stay as `${STRIPE_SECRET_KEY}`-style placeholders resolved
from the environment on the client side.

## Consequences

**Positive.** No second repository to create, host, and grant credentials to.
Configuration is versioned in the same commit as the code that reads it, so a
checkout of any commit is internally consistent — which is what makes the three
run modes reproducible.

**Negative.** Changing any configuration value requires rebuilding and
redeploying the config-server container. There is no runtime refresh, so the
`/actuator/refresh` workflow that is half the point of a config server is
unavailable. This is the same class of trap as the frontend's build-time
environment variables — a file is edited, nothing changes, and the cause is that
the value was frozen at build time.

**If this is revisited.** A Git-backed config server allows runtime changes and
is the usual production pattern; the migration is a profile switch plus a
repository, and the YAML files move unchanged.

## References

- Source: [`backend/config-server/src/main/resources/config/`](../../../backend/config-server/src/main/resources/config/)
- Detail: [../../backend/services/config-server.md](../../backend/services/config-server.md)
- The same build-time trap on the frontend: [../../operations/docker-setup.md](../../operations/docker-setup.md)
