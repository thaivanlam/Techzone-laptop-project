# ADR-0003: Share one HMAC-SHA JWT secret across all services

- **Status:** Accepted
- **Date:** 2026-08-22 (recorded retrospectively; the choice was made during backend development)
- **Affects:** user-service, api-gateway, product-service, order-service

## Context

One service issues tokens; several others must decide whether a presented token
is genuine. The options are a shared symmetric secret, an asymmetric key pair,
or a call back to the issuer on every request. Calling back to the issuer per
request was ruled out immediately — it makes the auth service a hard dependency
of every read.

## Decision

Gateway, user-service, product-service, and order-service all hold the same
HMAC-SHA secret in `spring.app.jwtSecret`. User Service *creates* tokens; the
others *validate* independently and locally.

## Consequences

**Positive.** No OAuth2 authorization server, no asymmetric key distribution, no
JWKS endpoint to publish and rotate. Validation is a local computation, so no
service depends on user-service being up to authenticate a request.

**Negative.** Any service that can validate can also forge: the same key does
both. Compromising the least-hardened service compromises the entire auth
system. There is no revocation path either — a signature is checked, nothing is
looked up, so a token stays valid until it expires no matter what happens to the
account in the meantime.

**If this is revisited.** RS256 — the private key in user-service, the public
key everywhere else — contains the blast radius to the issuer, and is the change
to make first. Revocation needs a separate mechanism regardless of the
algorithm: a short access-token lifetime with refresh tokens, or a deny-list the
gateway consults.

## References

- Source: `spring.app.jwtSecret` in [`backend/config-server/src/main/resources/config/`](../../../backend/config-server/src/main/resources/config/)
- Detail: [../security-model.md](../security-model.md)
- Open defects that follow from this: [../../backend/known-defects.md](../../backend/known-defects.md)
- Related: [ADR-0004](0004-cookie-based-jwt.md) — how the token reaches the browser
