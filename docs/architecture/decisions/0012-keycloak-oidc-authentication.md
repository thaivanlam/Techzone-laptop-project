# ADR-0012: Delegate authentication to Keycloak and validate OIDC access tokens

- **Status:** Accepted (2026-09-12)
- **Date:** 2026-09-12
- **Affects:** api-gateway, user-service, product-service, order-service, frontend, Compose, config-server, `tests/`

## Context

The platform issues its own tokens. `user-service` verifies a BCrypt password,
mints an HS256 JWT, and returns it in a cookie; the gateway and two business
services each verify that token locally with a copy of the same symmetric
secret. Every part of that — the sign-up form, the token, the cookie, the four
validators — is code written for this project.

Five entries in [`../../backend/known-defects.md`](../../backend/known-defects.md)
are defects *in that code* rather than consequences of a considered design
choice:

| Defect | What it is |
|---|---|
| SEC-01 (Critical) | The public sign-up payload carries `roles`, and `AuthServiceImpl` maps `"admin"` onto `ROLE_ADMIN` |
| SEC-04 (Critical) | The HMAC secret is a literal in four tracked files, so anyone with repository access can mint any token |
| SEC-13 (Medium) | `httpOnly=false`, `secure=false`, no `SameSite`, and no revocation path at all |
| BUG-03 (High) | The cookie's `maxAge` is 24 h against a 50-minute token, so the SPA believes it is signed in for 23 hours after it is not |
| BUG-19 (Medium) | `SignatureException` is missing from the catch list in all four validators, so a forged token answers 500 instead of 401 |

Each has a local fix. But they share a cause: authentication is hand-rolled, and
these are the ordinary mistakes hand-rolled authentication makes. Fixing them
one at a time leaves the next one unwritten rather than prevented.

Separately, [ADR-0003](0003-shared-hmac-jwt-secret.md) already records that the
shared symmetric secret means *any service that can validate can also forge*,
and names RS256 as "the change to make first". [ADR-0004](0004-cookie-based-jwt.md)
records the cookie's readability as a deliberate concession to a SPA that needed
to read its own claims.

The question is therefore not "how do we fix SEC-01", but whether this project
should be writing an authentication system at all.

## Decision

Authentication moves to **Keycloak**. The platform stops issuing tokens and
becomes a consumer of OIDC access tokens.

**Realm and clients.** One realm, `techzone`. Two clients:

| Client | Type | Flow |
|---|---|---|
| `techzone-spa` | public | Authorization Code + PKCE (`S256`), no client secret |
| `techzone-admin-api` | confidential, service account | Client Credentials, used only by user-service to reach the Admin API |

The SPA is a public client precisely because it cannot hold a secret: a secret
shipped in a JavaScript bundle is not a secret. PKCE is what replaces it.

**Token format and trust.** Access tokens are RS256 JWTs. The gateway and each
business service validate them locally against the realm's JWKS endpoint
(`/realms/techzone/protocol/openid-connect/certs`), configured as
`spring.security.oauth2.resourceserver.jwt.issuer-uri`. No service holds a
signing key, so no service can forge a token. Validation stays a local
computation against a cached key set — Keycloak is not on the path of an
already authenticated request.

**Token transport.** `Authorization: Bearer <token>`. The `springBootEcom`
cookie is removed. This supersedes [ADR-0004](0004-cookie-based-jwt.md).

**Roles.** Three realm roles named `ROLE_USER`, `ROLE_SELLER`, `ROLE_ADMIN` —
spelled with the prefix so the gateway's existing `role-mappings` block in
`api-gateway/src/main/resources/application.yaml` keeps its current values.
Keycloak places them in `realm_access.roles`, not in a flat `roles` claim, so
each service registers a `JwtAuthenticationConverter` that reads them from
there.

They are **composite**: `ROLE_ADMIN` includes `ROLE_SELLER`, which includes
`ROLE_USER`. This is not a refinement — it is required for the platform to keep
working. The seeded `admin` holds all three roles today, and the gateway rule
for `/product-manager/api/seller/**` maps `ROLE_SELLER` alone, so an admin
granted only `ROLE_ADMIN` would lose every seller endpoint. Composite roles
state that hierarchy once, in the realm, instead of leaving it implicit in which
rows the seed script happened to write.

**Identity key.** The `email` claim remains the identity key, because
`Order.email`, `Cart.userEmail`, `ProductSnapshot.sellerEmail` and
`Address → User` are all keyed on it today. The realm is configured with
email-as-username, email required, and email uniqueness enforced.

**The local `user` table survives**, as a profile and address owner rather than
a credential store: `Address` holds a foreign key to it. Rows are provisioned
just-in-time from token claims on the first authenticated request. The
`password` column is dropped.

**Account creation.** Each role is created by a different party, through a
different door:

| Role | Created by | Through | Caller needs |
|---|---|---|---|
| `ROLE_USER` | the person themselves | Keycloak's registration page | nothing |
| `ROLE_SELLER` | an admin | `POST /user-manager/api/admin/users` | `ROLE_ADMIN` |
| `ROLE_ADMIN` | nobody, through the application | realm import, or the Keycloak admin console | console access |

`ROLE_USER` is the realm's **default role**, assigned automatically and not
requestable. That is what closes SEC-01, and it is worth stating precisely: the
fix is not that the `roles` field is validated more carefully, it is that there
is no `roles` field. Assigning a role became a different API requiring a
different token.

`POST /user-manager/api/admin/users` — which replaces the admin dashboard's
current habit of POSTing `roles: ["seller"]` at the public signup endpoint —
accepts an **allow-list of `ROLE_SELLER` and `ROLE_USER` only**, enforced
server-side. No endpoint in the platform can grant `ROLE_ADMIN`. Promotion to
administrator happens in the Keycloak console, outside the application
entirely, so that an application-level flaw cannot become privilege escalation
a second time. New accounts receive a temporary password that Keycloak forces
the holder to change at first login, rather than an emailed reset link — the
mail path is unreliable by [BUG-06](../../backend/known-defects.md#bug-06--a-failed-email-send-is-swallowed-and-the-message-is-lost)
and is not something account creation should depend on.

The endpoint also writes the local profile row in the same operation, so a
seller created by an admin exists in MySQL before their first sign-in.
Just-in-time provisioning is the fallback for self-registered users, not the
only path.

## Consequences

**Positive.** SEC-01, SEC-04, SEC-13, BUG-03 and BUG-19 close together, and
SEC-02 and OPS-11 close as a side effect of the endpoints moving and the
declared security scheme becoming genuinely bearer. Several hundred lines of
authentication code are deleted rather than fixed — `JwtUtils`, three copies of
`JwtService`, the hand-written `AuthenticationFilter`, the sign-in and sign-up
service paths. Revocation, refresh-token rotation, password policy, account
lockout and audit logging arrive as configuration rather than as work.

**Negative.**

- **Keycloak becomes a hard dependency for sign-in.** Token *validation* stays
  offline, but nobody can obtain a token while Keycloak is down. This is the
  dependency [ADR-0003](0003-shared-hmac-jwt-secret.md) explicitly ruled out
  per-request; it is accepted here per-login, which is a far smaller blast
  radius but not zero.
- **A tenth container**, several hundred megabytes of memory, and a slower cold
  start on a Compose file that already runs nine services plus Prometheus and
  Grafana.
- **Realm state becomes configuration.** The realm export is committed and has
  to stay in step with the code, or a fresh clone authenticates differently
  from a running stack.
- **Email as identity key stays fragile**, and is now fragile across a boundary
  the project does not own: changing an email in Keycloak silently orphans that
  user's orders, cart and addresses. The `sub` claim is the correct key; this
  ADR does not adopt it, because doing so is a data migration across two
  databases.
- **Two sources of truth about a user.** Keycloak holds the account, MySQL
  holds the profile and addresses. They can drift, and nothing reconciles them.
- **Existing BCrypt passwords cannot be imported.** Keycloak ships PBKDF2 and
  Argon2 hash providers, not BCrypt; importing them needs a custom
  `PasswordHashProvider` SPI. Demo accounts are recreated in the realm import
  instead, which invalidates every existing password.
- **Every test that authenticates changes.** Six backend test classes and the
  whole of `tests/` sign in through `POST /user-manager/api/auth/signin`.
- **Authentication stops being demonstrable from the source.** For a thesis this
  cuts both ways: it is the professionally correct answer, and it moves the
  mechanism being assessed into a third-party product.
- **Creating an administrator now requires Keycloak console access.** A
  deliberate consequence of the allow-list, not an oversight, but it means the
  admin dashboard can no longer perform one operation it could before.

**What this does not buy.** Nothing in the authorization half of the defect
register. SEC-05 (the ownership half), SEC-07, SEC-08, SEC-09, SEC-10, SEC-11
and SEC-12 are untouched by this ADR — they are missing checks in business
code, and Keycloak has no view of whether a given cart belongs to the caller.
The migration must not be reported as having made the platform secure.

**If this is revisited.** The smaller alternative, and the one to fall back to
if this is abandoned midway, is to keep self-issued tokens and change only the
algorithm: RS256 with the private key in user-service and the public key
everywhere else. That closes SEC-04 and reduces BUG-19 to a one-line fix, costs
no frontend change and no new container, and is what
[ADR-0003](0003-shared-hmac-jwt-secret.md) already nominated. It leaves SEC-01,
SEC-13 and BUG-03 to be fixed by hand.

## Status note

**Accepted and implemented on 2026-09-12.** [ADR-0003](0003-shared-hmac-jwt-secret.md)
and [ADR-0004](0004-cookie-based-jwt.md) are now `Superseded by ADR-0012`;
neither was otherwise edited.

The plan that carried it out, with the file-level inventory and a record of
where the implementation departed from it, is
[`../keycloak-migration-plan.md`](../keycloak-migration-plan.md).

Two details settled during implementation that this record should carry, because
neither is obvious from the decision above:

- **Two URLs, not one.** `issuer-uri` alone is not enough once Keycloak runs in
  Compose. The `iss` claim holds whatever host the *browser* used, so it must be
  the published address and can only ever be compared; the JWKS has to be fetched
  from an address the *service* can reach, which inside Docker is the container
  name. Every service therefore sets `jwk-set-uri` as well, and the realm pins
  `KC_HOSTNAME` so the issuer does not follow the request. Setting the two to the
  same value is the usual cause of "401 on every request in one mode and not the
  other".
- **`Product.sellerId` is no longer populated.** An OIDC access token carries no
  numeric user id, and the local row that has one lives in another service's
  database. The column and the DTO field are kept so seeded rows and the API
  shape are unchanged, and `sellerEmail` — which is what every query and every
  ownership comparison actually uses — is unaffected. Dropping the column belongs
  to whichever ADR moves the identity key onto `sub`.

## References

- Source: [`backend/api-gateway/.../security/AuthenticationFilter.java`](../../../backend/api-gateway/src/main/java/com/ecommerce/api_gateway/security/AuthenticationFilter.java)
- Source: [`backend/user-service/.../security/jwt/JwtUtils.java`](../../../backend/user-service/src/main/java/com/ecommerce/user_service/security/jwt/JwtUtils.java)
- Source: [`backend/api-gateway/src/main/resources/application.yaml`](../../../backend/api-gateway/src/main/resources/application.yaml) — `public-paths`, `role-mappings`
- Plan: [`../keycloak-migration-plan.md`](../keycloak-migration-plan.md)
- Supersedes on acceptance: [ADR-0003](0003-shared-hmac-jwt-secret.md), [ADR-0004](0004-cookie-based-jwt.md)
- Related: [`../security-model.md`](../security-model.md), [`../../backend/known-defects.md`](../../backend/known-defects.md)
