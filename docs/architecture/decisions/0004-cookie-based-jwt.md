# ADR-0004: Carry the JWT in a readable cookie, not an Authorization header

- **Status:** Accepted
- **Date:** 2026-08-22 (recorded retrospectively; the choice was made during backend development)
- **Affects:** user-service, api-gateway, frontend

## Context

The SPA must attach the token to every API call, and it also wants to display
who is signed in. An `Authorization` header requires the client to store the
token somewhere, read it back, and attach it on every request through an
interceptor. A cookie is attached by the browser automatically.

## Decision

The token is issued into a cookie named `springBootEcom` with
`httpOnly=false`, so the browser sends it on every request and the React app can
read it directly for display purposes.

## Consequences

**Positive.** No header plumbing in the client and no token-refresh interceptor
to write. The frontend reads user identity straight from the cookie, so no extra
round trip is needed to render the signed-in state. Because the SPA and the API
are served from one origin in the Docker stack, the cookie is first-party and no
CORS preflight is involved — see [ADR-0006](0006-config-server-native-profile.md)
for the related build-time configuration.

**Negative.** `httpOnly=false` is precisely what makes the token readable by
script, which means any XSS on the page can exfiltrate a valid session. This is
the cost paid for the convenience above, and it is not a small one.

**If this is revisited.** Set `httpOnly=true` + `Secure` + `SameSite=Strict`,
and add a `/me` endpoint supplying the user information the frontend currently
reads out of the cookie. The frontend change is small; the endpoint is the work.

## References

- Detail: [../security-model.md](../security-model.md)
- Frontend consumption: [../../frontend/overview.md](../../frontend/overview.md)
- Related: [ADR-0003](0003-shared-hmac-jwt-secret.md) — how the token is signed and validated
