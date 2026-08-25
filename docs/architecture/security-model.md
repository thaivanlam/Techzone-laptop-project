# Security Model

Authentication is JWT-based, with the token carried in a browser cookie and
validated independently at the gateway and in each downstream service.

Related documents: [system-overview.md](system-overview.md) ·
[design-decisions.md](design-decisions.md) ·
[../backend/services/user-service.md](../backend/services/user-service.md)

---

## Authentication Flow

```
                     ┌─────────────────┐
  POST /signin ────► │  User Service   │ ──► BCrypt verify
                     │                 │ ──► Generate JWT (HS256)
                     │                 │ ──► Set-Cookie: springBootEcom=<token>
                     └─────────────────┘

  Subsequent requests:
  Cookie: springBootEcom=<jwt>
        │
        ▼
  ┌──────────────┐     Public path?  ──► Pass through
  │  API Gateway │     Valid JWT?    ──► Extract roles
  │  AuthFilter  │     Role match?   ──► Forward to service
  └──────────────┘     Otherwise     ──► 401/403 JSON error
        │
        ▼
  ┌──────────────┐
  │  Downstream  │     Re-parse JWT from cookie
  │   Service    │     Extract email as user identity
  └──────────────┘     No Spring Security context (except user-service)
```

**User Service is the sole token issuer.** Every other service only validates.

---

## Token Properties

| Property | Value | Source |
|---|---|---|
| Algorithm | HS256 (HMAC-SHA), shared symmetric secret | `JwtUtils` |
| Secret property | `spring.app.jwtSecret` | Config Server |
| Cookie name | `springBootEcom` | `spring.ecom.app.jwtCookieName` |
| Token expiry | 3,000,000 ms (~50 minutes) | `spring.app.jwtExpirationMs` |
| Cookie max age | 24 hours | `JwtUtils.generateJwtCookie()` |
| Cookie flags | `httpOnly=false`, `secure=false` | `JwtUtils` |

### Claims

| Claim | Content |
|---|---|
| `sub` | Username |
| `userId` | Numeric user ID |
| `email` | User email |
| `roles` | List of role names, e.g. `["ROLE_USER"]` |

Downstream services use the `email` claim as the identity key. They do not build
a Spring `SecurityContext`; they parse the cookie manually through a local
`AuthUtil` helper.

---

## Role Hierarchy

| Role | Capabilities |
|---|---|
| `ROLE_USER` | Browse catalog, manage cart, place orders, manage own addresses |
| `ROLE_SELLER` | Add/edit own products, view own orders |
| `ROLE_ADMIN` | Full access: all products, orders, users, analytics |

Roles are self-selected at registration (`"user"`, `"seller"`, `"admin"` in the
signup payload), and a single user may hold several. The seeded `admin` account
holds all three.

---

## Gateway Enforcement

The gateway classifies each incoming path using `application.yaml` in
`backend/api-gateway/src/main/resources/`.

### Public paths (no JWT required)

- `/user-manager/api/auth/**`
- `/product-manager/api/public/**`
- `/user-manager/v3/api-docs/**` and equivalent OpenAPI paths

### Role mappings (JWT required *and* role checked)

| Pattern | Required role |
|---|---|
| `/product-manager/api/admin/**` | `ROLE_ADMIN` |
| `/product-manager/api/seller/**` | `ROLE_SELLER` |
| `/user-manager/api/admin/**` | `ROLE_ADMIN` |
| `/order-manager/api/admin/**` | `ROLE_ADMIN` |
| `/order-manager/api/seller/**` | `ROLE_ADMIN` or `ROLE_SELLER` |

The two `seller` rules differ on purpose-by-accident, not by design: the product
rule admits `ROLE_SELLER` only. The seeded `admin` account holds all three roles,
so it still passes; an admin holding *only* `ROLE_ADMIN` would get `403` on
`/product-manager/api/seller/**`. The frontend never routes admins there — it
picks the `admin` endpoint whenever `roles` contains `ROLE_ADMIN`.

Everything else that is not public requires a **valid JWT but no specific
role** — any authenticated user may reach it.

### Enforcement gaps worth knowing

These follow directly from the rules above and are real, not hypothetical:

1. **Admin user operations are public.** Listing and deleting customers and
   sellers live under `/user-manager/api/auth/**`, which is a public path. No
   role check occurs at the gateway or in Spring Security.
2. **Seller product paths are role-checked but not ownership-checked.** Since
   2026-08-25 `/product-manager/api/seller/**` requires `ROLE_SELLER`, so a plain
   customer can no longer create, edit, or delete products. The handlers still
   never compare `product.sellerEmail` to the caller, so any seller can act on
   any other seller's product.
3. **Address ownership is not verified.** `updateAddress` and `deleteAddress`
   act on any address ID without checking that the caller owns it.
4. **Spring Security is effectively disabled** in user-service — `SecurityConfig`
   permits all requests, and there are no `@PreAuthorize` annotations or JWT
   authentication filter. All authorization is either at the gateway or ad hoc
   in service methods.

---

## Known Weaknesses

| Weakness | Impact | Mitigation if productionized |
|---|---|---|
| Symmetric shared secret | Any service holding the secret can forge tokens | RS256; only user-service holds the private key |
| `httpOnly=false` cookie | JavaScript can read the token, so XSS means token theft | `httpOnly=true`, `Secure=true`, `SameSite=Strict`, plus a `/me` endpoint for user info |
| No token revocation | A signed-out user's token stays valid until expiry (~50 min) | Token blacklist or short-lived access + refresh rotation |
| Self-selected admin role at signup | Anyone can register as admin | Invitation or approval workflow for elevated roles |
| No rate limiting | Credential stuffing and brute force are unthrottled | Gateway rate-limit filter (Redis-backed) |
