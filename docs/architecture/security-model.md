# Security Model

Authentication is delegated to **Keycloak**, an OIDC provider. The platform
issues no tokens and stores no credentials: the SPA obtains an RS256 access token
from Keycloak by Authorization Code + PKCE, sends it as
`Authorization: Bearer <token>`, and the gateway and every business service verify
it independently against the realm's public keys.

This replaced a hand-rolled HS256 JWT carried in a readable cookie on
2026-09-12. The decision, and what it did and did not fix, is
[ADR-0012](decisions/0012-keycloak-oidc-authentication.md); the record of what the
platform did before is [ADR-0003](decisions/0003-shared-hmac-jwt-secret.md) and
[ADR-0004](decisions/0004-cookie-based-jwt.md).

Related documents: [system-overview.md](system-overview.md) ·
[keycloak-migration-plan.md](keycloak-migration-plan.md) ·
[../backend/services/user-service.md](../backend/services/user-service.md) ·
[../backend/known-defects.md](../backend/known-defects.md)

---

## Authentication Flow

```
  ┌──────────────┐  1. redirect to /realms/techzone/protocol/openid-connect/auth
  │   React SPA  │     (code_challenge, S256)            ┌──────────────────┐
  │ techzone-spa │ ────────────────────────────────────► │     Keycloak     │
  │ public client│                                       │  realm: techzone │
  │              │  2. user enters password ON KEYCLOAK  │                  │
  │              │ ◄──────────────────────────────────── │  accounts        │
  │              │     authorization code                │  credentials     │
  │              │  3. code + code_verifier ───────────► │  roles           │
  │              │ ◄──────── access token (RS256, 5 min) │  sessions        │
  └──────┬───────┘           refresh token (rotating)    └────────┬─────────┘
         │                                                        │
         │ Authorization: Bearer <access token>                   │ JWKS (public keys)
         ▼                                                        │ fetched once, cached
  ┌──────────────┐  public path?          ──► pass through        │
  │  API Gateway │  signature / iss / exp ──► 401 {"error": ...}  │
  │  resource    │  role-mapping match?   ──► 403 {"error": ...}  │ ◄──────────────┤
  │  server      │  otherwise             ──► forward, header kept│
  └──────┬───────┘                                                │
         ▼                                                        │
  ┌──────────────┐  verifies the same token again, locally        │
  │ user/product │  JwtAuthenticationToken in the SecurityContext │ ◄──────────────┘
  │ order service│  AuthUtil.loggedInEmail() reads the email claim
  └──────────────┘
```

Two properties make the design acceptable:

1. **Validation is offline.** Each service caches the realm's JWKS and verifies
   the RS256 signature itself. Keycloak is a dependency of *signing in*, not of an
   already authenticated request.
2. **Every service validates independently.** The gateway is not a trust boundary
   downstream services take on faith — SEC-10 records that their ports are
   published on the host, so a request may never have passed the gateway.

**No component of the platform can mint a token.** None holds a signing key.

---

## Clients

| Client | Type | Flows | Used by |
|---|---|---|---|
| `techzone-spa` | public | Authorization Code + PKCE (`S256`). Direct access grants **off**. | The React SPA. No secret, because a browser bundle cannot keep one. |
| `techzone-admin-api` | confidential | Service account only | user-service, to reach the Admin API. Holds `manage-users`, `view-users`, `query-users` on `realm-management` — not `manage-realm`. Secret: `KEYCLOAK_ADMIN_CLIENT_SECRET`. |
| `techzone-tests` | confidential | Direct access grants (password) | The `tests/` suites and the JMeter plan, so they need no browser. Development realm only. Secret: `KEYCLOAK_TESTS_CLIENT_SECRET`. |

The realm is `backend/keycloak/realm-techzone.json`, imported on container start.

---

## Token Properties

| Property | Value | Where it is set |
|---|---|---|
| Algorithm | RS256, realm key pair | Keycloak |
| Transport | `Authorization: Bearer <token>` | `frontend/src/api/api.js` |
| Access token lifespan | 5 minutes | `accessTokenLifespan` in the realm |
| SSO session idle | 30 minutes | `ssoSessionIdleTimeout` |
| Refresh token rotation | On, reuse disabled | `revokeRefreshToken`, `refreshTokenMaxReuse: 0` |
| Brute-force protection | On, 10 failures | `bruteForceProtected`, `failureFactor` |
| Password policy | At least 8 characters, not equal to the username | `passwordPolicy` |
| Where the SPA keeps it | In memory, inside `keycloak-js` | Never `localStorage`, never a cookie |
| Issuer | `http://localhost:8090/realms/techzone` | Pinned by `KC_HOSTNAME` |

### Claims the platform reads

| Claim | Content | Read by |
|---|---|---|
| `email` | The account's email | `AuthUtil.loggedInEmail()` in all three services; the principal name in every `JwtAuthenticationConverter` |
| `preferred_username` | Equal to the email — the realm is email-as-username | user-service, when it provisions a profile row |
| `realm_access.roles` | Realm roles, composites already expanded | `KeycloakRealmRoleConverter` in the gateway and every service |
| `sub` | Keycloak's UUID for the account | The SPA's `auth.user.id`. **Not** used as a key — see "Identity key" below |

> **Claim shape.** Roles are nested under `realm_access.roles`, not in a flat
> `roles` claim. Reading the old shape out of a new token silently yields no
> authorities — a 403 everywhere with nothing in the logs — which is why
> `KeycloakRealmRoleConverterTest` pins it.

### Two URLs, not one

Every resource server sets **both** `issuer-uri` and `jwk-set-uri`:

| Key | Value inside Docker | Purpose |
|---|---|---|
| `issuer-uri` | `http://localhost:8090/realms/techzone` | Compared with the `iss` claim. Never fetched. |
| `jwk-set-uri` | `http://keycloak:8090/realms/techzone/protocol/openid-connect/certs` | Fetched, to get the public keys. |

`iss` is whatever host the *browser* used; the keys have to come from an address
the *service* can reach. Setting both to the same value works in one run mode and
answers 401 on every request in another. See
[../operations/configuration-reference.md](../operations/configuration-reference.md).

---

## Roles

| Role | Capabilities | Composite of |
|---|---|---|
| `ROLE_USER` | Browse catalog, manage cart, place orders, manage own addresses | — |
| `ROLE_SELLER` | Add and edit products, view orders for them | `ROLE_USER` |
| `ROLE_ADMIN` | All products, orders, users, analytics | `ROLE_SELLER` |

**The composites are load-bearing.** `/product-manager/api/seller/**` maps
`ROLE_SELLER` alone. An administrator reaches it only because Keycloak expands
`ROLE_ADMIN → ROLE_SELLER → ROLE_USER` into the token before signing it. A realm
that granted `ROLE_ADMIN` on its own would lock every administrator out of every
seller endpoint. Both directions are asserted in `GatewayBearerTokenSecurityTest`
and `ProductServiceSecurityTest`.

### Who creates which account

| Role | Created by | Through | Caller needs |
|---|---|---|---|
| `ROLE_USER` | The person themselves | Keycloak's registration page | Nothing |
| `ROLE_SELLER` | An administrator | `POST /user-manager/api/admin/users` | `ROLE_ADMIN` |
| `ROLE_ADMIN` | Nobody, through the application | Realm import, or the Keycloak admin console | Console access |

`ROLE_USER` is the realm's **default role** — assigned automatically and not
requestable. `POST /api/admin/users` accepts a server-side allow-list of
`ROLE_SELLER` and `ROLE_USER` only; a request naming `ROLE_ADMIN` is refused even
when the caller is an administrator. No endpoint in the platform can grant it.
New accounts get a temporary password that Keycloak forces the holder to change.

---

## Enforcement

### At the gateway

`GatewaySecurityConfig` builds a `SecurityWebFilterChain` at startup from
`gateway.security` in `backend/api-gateway/src/main/resources/application.yaml`,
so that block stays the single written statement of the policy. Rules apply in
this order:

1. `OPTIONS` pre-flight — permitted.
2. `gateway.security.public-paths` — permitted.
3. `gateway.security.role-mappings` — `hasAnyAuthority` of the listed roles.
4. Everything else — any authenticated caller.

| Pattern | Required role |
|---|---|
| `/product-manager/api/admin/**` | `ROLE_ADMIN` |
| `/product-manager/api/seller/**` | `ROLE_SELLER` |
| `/user-manager/api/admin/**` | `ROLE_ADMIN` |
| `/order-manager/api/admin/**` | `ROLE_ADMIN` |
| `/order-manager/api/seller/**` | `ROLE_ADMIN` or `ROLE_SELLER` |

Spring Security stops at the **first** matching rule, where the filter it replaced
unioned every match. The shipped patterns are disjoint, so no route changed — but
two overlapping patterns would now behave differently.

Error bodies are unchanged, because the SPA and the suites read them:

| Situation | Status | Body |
|---|---|---|
| No token on a protected path | 401 | `{"error":"Missing authentication token"}` |
| Token presented but not verifiable, expired, or wrong issuer | 401 | `{"error":"Invalid or expired token"}` |
| Authenticated, role missing | 403 | `{"error":"Insufficient permissions"}` |

The chain also applies `spring.cloud.gateway.globalcors`, so a 401 raised before
routing still carries CORS headers and the browser can read it.

### In each service

Each service has its own `SecurityConfig` that mirrors the gateway's rules with
the routing prefix stripped (`/api/admin/**`, `/api/seller/**`, anything else
authenticated). Permitted without a token: `/api/public/**`, `/images/**`,
OpenAPI and Swagger paths, `/actuator/**`, and in user-service `/api/auth/**`.

### Identity key

Email is still the platform's identity key: `Order.email`, `Cart.userEmail`,
`ProductSnapshot.sellerEmail` and `Address → User` all use it. user-service keeps
a local `user` row as the profile and address owner — without a password column —
created from token claims the first time an unknown caller makes a request
(`AuthUtil.loggedInUser()`), or up front when an administrator creates a seller.

---

## What this model does not do

Keycloak authenticates a caller. It has no view of whether a given cart, order,
product or address belongs to them. **Every authorization defect in the register
survived the migration unchanged**, and several have tests pinning them:

| Defect | Gap |
|---|---|
| SEC-05 (ownership half) | `updateProduct`, `deleteProduct`, `updateProductImage` never compare `sellerEmail` to the caller |
| SEC-07 | `GET /order-manager/api/carts` returns every user's cart |
| SEC-08 | Order status is mutable by any authenticated account |
| SEC-09 | Address update and delete verify no ownership |
| SEC-10 | `/api/internal/**` is unauthenticated, and service ports are published |
| SEC-11 | The mail endpoint is unauthenticated |
| SEC-12 | The Eureka registry is public and writable |

The platform must not be described as secure because it now uses Keycloak.

---

## Known Weaknesses

| Weakness | Impact | Mitigation |
|---|---|---|
| Keycloak is a hard dependency of signing in | Nobody can obtain a token while it is down; validation of existing tokens continues | Run it highly available; this is accepted in ADR-0012 |
| Email is the identity key, across a boundary the project does not own | Changing an email in Keycloak silently orphans that user's orders, cart and addresses | Self-service email change is off in the realm. The fix is keying on `sub`, which needs its own ADR |
| Two sources of truth about a user | Keycloak holds the account, MySQL the profile and roles the dashboard lists; nothing reconciles them | Deleting through `/api/admin/users` removes both. An admin-events listener would close the rest |
| `start-dev` in Compose | HTTPS not enforced, admin console on a published port | Development only. `start` with TLS and an unpublished console for anything shared |
| Development secrets have defaults | `techzone-admin-api-dev-secret` and `techzone-tests-dev-secret` are in the realm file and the Compose defaults | Override `KEYCLOAK_ADMIN_CLIENT_SECRET` and `KEYCLOAK_TESTS_CLIENT_SECRET`; disable `techzone-tests` outside development |
| Promoting an administrator needs console access | The dashboard can no longer do it | Deliberate: it keeps privilege escalation out of application code |
| No gateway rate limiting | Brute force against the API is unthrottled | Keycloak's brute-force protection covers sign-in itself; the API still needs a rate-limit filter |
