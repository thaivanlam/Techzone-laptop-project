# Keycloak Migration Plan

The staged plan for carrying out [ADR-0012](decisions/0012-keycloak-oidc-authentication.md):
replacing hand-rolled JWT authentication with Keycloak, an OIDC provider, and
Spring Security resource servers.

**Status: implemented on 2026-09-12.** ADR-0012 is `Accepted`. The code matches
the end state of Stage 6; the stages below are kept as the record of how the change
was sized and sequenced. Where the implementation departed from them, and why, is in
[§11](#11-how-the-implementation-departed-from-this-plan) — read that before using
any section of this plan as a description of the code.

Related: [security-model.md](security-model.md) ·
[../backend/known-defects.md](../backend/known-defects.md) ·
[../quality/test-plan.md](../quality/test-plan.md)

---

## Table of Contents

1. [Scope](#1-scope)
2. [Target Architecture](#2-target-architecture)
3. [Realm Design](#3-realm-design)
4. [Stages](#4-stages)
5. [File Inventory](#5-file-inventory)
6. [Account and Password Migration](#6-account-and-password-migration)
7. [Test Strategy](#7-test-strategy)
8. [Risks and Open Questions](#8-risks-and-open-questions)
9. [Effort](#9-effort)
10. [Documents to Update When It Lands](#10-documents-to-update-when-it-lands)
11. [How the Implementation Departed From This Plan](#11-how-the-implementation-departed-from-this-plan)

---

## 1. Scope

### What this closes

| Defect | Closed by | Stage |
|---|---|---|
| SEC-01 — public signup accepts a self-selected `admin` role | Registration is Keycloak's; role assignment is an Admin API operation, not a request field | 3 |
| SEC-02 — user administration endpoints are fully public | The handlers move to `/api/admin/users/**`, under the existing `ROLE_ADMIN` gateway rule | 3 |
| SEC-04 — the JWT signing secret is committed | No service holds a signing key; validation is against the realm JWKS | 1–2 |
| SEC-13 — cookie flags, no revocation | Bearer transport, refresh-token rotation, real session revocation | 4 |
| BUG-03 — cookie outlives the token by 23 hours | No cookie; the adapter refreshes or fails closed | 4 |
| BUG-19 — `SignatureException` escapes the validity check | The four hand-written validators are deleted | 1–2 |
| OPS-11 — Swagger declares bearer but the services use cookies | The declaration becomes true | 2 |

### What this does not close

Stated here because it is the easiest thing to get wrong when reporting the
work: **every authorization defect survives this migration unchanged.**

- **SEC-05** (the ownership half) — `updateProduct`, `deleteProduct`,
  `updateProductImage` still never compare `product.sellerEmail` to the caller.
- **SEC-07** — `GET /carts` still returns every user's cart.
- **SEC-08** — order status is still mutable by any authenticated account.
- **SEC-09** — address update and delete still verify no ownership.
- **SEC-10, SEC-11** — the internal stock API and the mail endpoint are still
  unauthenticated on published host ports. Keycloak does not sit in front of
  them.
- **SEC-12** — the Eureka registry is still public and writable.

Keycloak authenticates a caller. It has no view of whether a given cart, order
or address belongs to them. Those checks are business code and remain to be
written.

### Non-goals

- Moving the identity key from `email` to `sub`. Deliberately deferred — see
  [§8](#8-risks-and-open-questions).
- Fine-grained authorization in Keycloak (resource/policy/permission). The
  gateway's path-to-role mapping stays where it is.
- Single sign-on with any external identity provider.

---

## 2. Target Architecture

```
                    ┌────────────────────┐
                    │      Keycloak      │
                    │   realm: techzone  │
                    │                    │
                    │  authentication    │
                    │  users, roles      │
                    │  token issuance    │
                    └─────────┬──────────┘
                              │
          ┌───────────────────┴────────────────────┐
          │                                        │
  Authorization Code                          JWKS (public keys)
      + PKCE (S256)                          fetched and cached
          │                                        │
          ▼                                        ▼
  ┌──────────────┐   Authorization:      ┌────────────────────┐
  │    React     │   Bearer <token>      │    API Gateway     │
  │  public      │ ────────────────────► │  Spring Security   │
  │  client      │                       │  resource server   │
  └──────────────┘                       └─────────┬──────────┘
                                                   │ header forwarded
                        ┌──────────────────────────┼──────────────────────────┐
                        ▼                          ▼                          ▼
                ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
                │ User Service │          │   Product    │          │    Order     │
                │              │          │   Service    │          │   Service    │
                │ resource srv │          │ resource srv │          │ resource srv │
                └──────────────┘          └──────────────┘          └──────────────┘
```

Two properties worth stating explicitly, because they are what make the design
acceptable:

1. **Validation is offline.** Each service caches the realm's JWKS and verifies
   the RS256 signature locally. Keycloak is not called per request, so it is not
   a latency or availability dependency of an authenticated read — only of
   sign-in. This preserves the property [ADR-0003](decisions/0003-shared-hmac-jwt-secret.md)
   was written to protect.
2. **Every service still validates independently.** The gateway is not a trust
   boundary that downstream services take on faith, which matters because
   SEC-10 shows their ports are reachable directly.

---

## 3. Realm Design

Realm `techzone`, exported to `backend/keycloak/realm-techzone.json` and
imported on container start with `--import-realm`.

### Clients

| Client ID | Type | Flows enabled | Notes |
|---|---|---|---|
| `techzone-spa` | public | Standard flow (Authorization Code) + PKCE `S256`. Direct access grants **off**. | Redirect URIs `http://localhost:5173/*`; Web origins `http://localhost:5173`. No secret — it is a browser application. |
| `techzone-admin-api` | confidential | Service accounts only | Holds `realm-management` roles `manage-users`, `view-users`, `query-users`. Used by user-service for the admin endpoints. Secret supplied as `KEYCLOAK_ADMIN_CLIENT_SECRET`, never committed. |
| `techzone-tests` | confidential | Direct access grants **on** | Exists only so automated tests can obtain a token with a password grant instead of driving a browser. Enabled in the `dev` realm profile only. |

### Realm roles

`ROLE_USER`, `ROLE_SELLER`, `ROLE_ADMIN` — spelled with the prefix so the
gateway's `role-mappings` in
[`../../backend/api-gateway/src/main/resources/application.yaml`](../../backend/api-gateway/src/main/resources/application.yaml)
need no value changes.

`ROLE_USER` is the realm's **default role**, which is the mechanism that closes
SEC-01: a self-registering user gets exactly that and cannot ask for more.

The three are **composite**, each including the one below it:

```
ROLE_ADMIN  ──includes──►  ROLE_SELLER  ──includes──►  ROLE_USER
```

> **This is load-bearing, not tidiness.** The seeded `admin` holds all three
> roles today, and the gateway maps `/product-manager/api/seller/**` to
> `ROLE_SELLER` alone — SEC-05 records that admin reaches seller endpoints only
> because it also carries `ROLE_SELLER`. Import an admin with `ROLE_ADMIN` by
> itself and every seller endpoint 403s for them: a regression created by the
> migration, in code the migration never touched. Composites put the hierarchy
> in the realm, where it is declared once and visible.

### Account creation

| Role | Created by | Through | Caller needs |
|---|---|---|---|
| `ROLE_USER` | the person themselves | Keycloak's registration page, reached by `keycloak.register()` | nothing |
| `ROLE_SELLER` | an admin | `POST /user-manager/api/admin/users` (Stage 3) | `ROLE_ADMIN` |
| `ROLE_ADMIN` | nobody, through the application | realm import, or the Keycloak admin console | console access |

**Decided 2026-09-12:** `POST /api/admin/users` enforces a server-side
**allow-list of `ROLE_SELLER` and `ROLE_USER`**. A request naming any other
role is rejected, and no endpoint in the platform can grant `ROLE_ADMIN`.

The reasoning is worth keeping: the alternative — letting the endpoint grant
whatever the caller names — puts "who may become an administrator" back inside
application code, which is the precise location the migration is taking it out
of. Behind a `ROLE_ADMIN` check that would be legitimate rather than a defect,
but it means any future flaw in that one handler is privilege escalation again.
The allow-list makes that impossible rather than unlikely. The cost is that
promoting an administrator now needs Keycloak console access; it is not a
dashboard operation any more.

> **Do not keep a self-written registration form that proxies through
> user-service.** A public client cannot create users, so the service would have
> to create them with its admin service account — reconstructing exactly the
> endpoint SEC-01 lives in, one layer down. If the Keycloak registration page
> needs to match the shop's styling, that is a Keycloak theme.

New accounts created by an admin get a **temporary password** (`temporary:
true`), which Keycloak forces the holder to replace at first login. Not an
emailed reset link: the mail path swallows its own failures
([BUG-06](../backend/known-defects.md#bug-06--a-failed-email-send-is-swallowed-and-the-message-is-lost)),
and account creation should not depend on it.

### Token claims

| Claim | Source | Consumed by |
|---|---|---|
| `email` | built-in, via the `email` scope | `AuthUtil.loggedInEmail()` in product-service and order-service |
| `preferred_username` | built-in | display only |
| `realm_access.roles` | built-in | gateway role check, `JwtAuthenticationConverter` |
| `sub` | built-in | recorded but not used as a key — see [§8](#8-risks-and-open-questions) |

Realm settings: login with email **on**, email as username **on**, duplicate
emails **off**, verify email off in `dev` and on in `prod`.

> **Claim shape gotcha.** Keycloak nests roles under `realm_access.roles`. The
> current code reads a flat `roles` claim. Every role-reading site changes —
> this is not a rename, the JSON shape differs.

### Token lifetimes

| Setting | Value | Why |
|---|---|---|
| Access token lifespan | 5 min | Short, because revocation now works through the refresh token |
| Refresh token / SSO session idle | 30 min | Replaces the 50-minute self-issued token |
| Refresh token rotation | on, reuse disabled | This is the SEC-13 revocation answer |

---

## 4. Stages

Each stage is independently landable, independently testable, and leaves the
stack working. The order is chosen so the frontend changes **last** — the
riskiest, most visible piece moves only once everything behind it already
accepts the new tokens.

### Stage 0 — Keycloak in Compose, wired to nothing

**Goal.** The realm exists and issues tokens. No service consumes them yet.

- Add a `keycloak` service to [`../../backend/docker-compose.yml`](../../backend/docker-compose.yml)
  (`quay.io/keycloak/keycloak`, pinned to an exact tag), on `ecommerce-network`,
  with a healthcheck and `--import-realm`.
- Keycloak gets its own logical database in the existing MySQL instance,
  consistent with [ADR-0008](decisions/0008-single-mysql-multiple-databases.md).
- Author `backend/keycloak/realm-techzone.json` — clients, roles, and the
  demo accounts from [§6](#6-account-and-password-migration).
- Admin credentials and the client secret come from the environment, following
  the existing pattern for `STRIPE_SECRET_KEY` and `MAIL_PASSWORD`.

**Verify.** A password grant against `techzone-tests` returns an RS256 token
whose `realm_access.roles` holds the expected role. The rest of the stack is
untouched and still passes its suites.

**Rollback.** Remove the service. Nothing depends on it.

### Stage 1 — Gateway accepts Keycloak tokens *as well as* cookies

**Goal.** Dual acceptance, so the backend can move before the frontend does.

- Add `spring-boot-starter-oauth2-resource-server` to the gateway.
- Add a `SecurityWebFilterChain` built **from the existing
  `GatewaySecurityProperties`**, so `public-paths` and `role-mappings` stay the
  single source of truth and keep their current values.
- Keep `AuthenticationFilter` for now, but make it skip any request already
  authenticated by the resource server.
- Preserve the JSON error envelope (`{"error": "..."}`) on 401 and 403 — the SPA
  and the system tests both read it.

**Verify.** `GatewaySecurityPolicyTest` passes unchanged for cookie tokens, and
a new case proves a Keycloak bearer token is accepted on the same routes. BUG-19's
characterisation test in `AuthenticationFilterTest` is **expected to go red**;
update it in this change set rather than deleting it, per the test-plan rule.

**Rollback.** Drop the filter chain; the cookie path is still intact.

### Stage 2 — Business services become resource servers

**Goal.** product-service and order-service trust the JWKS, not a shared secret.

- Add the resource-server starter to both; set `issuer-uri` in
  `config/product-service.yml` and `config/order-service.yml`.
- Register a `JwtAuthenticationConverter` reading `realm_access.roles`.
- Rewrite both `AuthUtil` classes to read the email from the authenticated
  `Jwt` in the `SecurityContext` instead of parsing a cookie by hand. The nine
  call sites of `loggedInEmail()` keep their signature and do not change.
- Delete `product-service/.../security/JwtService.java` and
  `order-service/.../security/JwtService.java`.
- Remove `spring.app.jwtSecret` from both config files.
- Fix the `SwaggerConfig` security scheme in both — it already declares bearer,
  which becomes correct here (OPS-11).

**Verify.** Both modules' unit and integration suites pass. `JwtServiceTest`
(product-service) is deleted along with the class it tests; note the deletion in
the test plan, since it currently pins BUG-19.

**Rollback.** Per service — order-service can stay on the old path while
product-service moves.

### Stage 3 — user-service stops issuing tokens

**Goal.** Close SEC-01 and SEC-02. This is the stage that removes the defect
the whole exercise started from.

- Delete `security/jwt/JwtUtils.java`, the sign-in and sign-up paths in
  `AuthServiceImpl`, and the cookie helpers.
- `AuthController` keeps `/api/auth/user` and `/api/auth/username` as profile
  reads backed by the token; `/signin`, `/signup` and `/signout` are removed —
  the SPA talks to Keycloak for those.
- Move `getSellers`, `getCustomers`, `deleteCustomer`, `deleteSeller` to a new
  controller at `/api/admin/users/...`, backed by the Keycloak Admin API through
  `techzone-admin-api`. **This is SEC-02's fix**, and the gateway rule for it
  already exists.
- Add `POST /api/admin/users` for the admin-creates-a-seller flow that
  [`addNewSellerFromDashboard`](../../frontend/src/store/action/index.js)
  currently gets by POSTing `roles: ["seller"]` at the public signup endpoint.
  It enforces the `ROLE_SELLER` / `ROLE_USER` allow-list, sets a temporary
  password, **and writes the local profile row in the same operation** — see
  [§3](#3-realm-design).
- Drop the `password` column from `User`; keep the table as the address owner.
- Add just-in-time provisioning as the *fallback* path: on the first
  authenticated request from a principal with no local row, upsert one from the
  token's `email` and `preferred_username`. Self-registered customers arrive
  this way; admin-created sellers already have a row.

**Verify.** `AuthControllerIntegrationTest` and `AuthServiceImplTest` are
rewritten against the new surface. Three regression tests, one per decision
above: a self-registered Keycloak user receives only `ROLE_USER` (SEC-01); a
`POST /api/admin/users` naming `ROLE_ADMIN` is rejected even when the caller
holds `ROLE_ADMIN` (the allow-list); and an admin token carries `ROLE_SELLER`
through the composite, so seller endpoints still answer 200 for it.

**Rollback.** The largest stage and the hardest to reverse; land it on its own
branch.

### Stage 4 — Frontend moves to Authorization Code + PKCE

**Goal.** The SPA stops handling passwords.

- Add `keycloak-js`, initialised with `pkceMethod: "S256"`. No client secret
  appears anywhere in the bundle.
- Replace `authenticateSigninUser` / `registerNewUser` in
  [`../../frontend/src/store/action/index.js`](../../frontend/src/store/action/index.js)
  with adapter calls; sign-out becomes the Keycloak logout endpoint.
- [`../../frontend/src/api/api.js`](../../frontend/src/api/api.js) drops
  `withCredentials` and gains a request interceptor attaching
  `Authorization: Bearer`, plus a response interceptor that refreshes once on
  401 and then fails closed — the BUG-03 fix.
- **Keep the shape of the `auth` Redux slice** (`user.roles` as a string array).
  That is what lets `PrivateRoute` and the other 21 components that read
  `state.auth` stay as they are. Only the slice's *source* changes, from a login
  response body to token claims.
- Remove the `localStorage` copy of the auth payload; the adapter owns the
  token, in memory.

**Verify.** Sign in, browse, cart, checkout, and the admin dashboard by hand
against a seeded stack — the [UAT checklist](../quality/uat-checklist.md) is
exactly this list.

**Rollback.** Revert the submodule pointer. The backend still accepts both token
types until Stage 6.

### Stage 5 — Tests

- `tests/lib/api.js` gains a token helper using the password grant against
  `techzone-tests`, so the system and acceptance suites need no browser.
- `tests/frontend/reducers.test.js` follows the auth slice's new source.
- `tests/load/order-checkout.jmx` fetches a token in a setup thread group rather
  than posting to `/signin`.
- The six backend test classes listed in [§5](#5-file-inventory) are rewritten
  or deleted with the classes they cover.

### Stage 6 — Remove the old path

Delete `AuthenticationFilter`, the `springBootEcom` cookie name property, and
the remaining `jwtSecret` keys from the three test `application.yaml` files.
Only after Stages 1–5 are all in.

---

## 5. File Inventory

Counts verified against `main` on 2026-09-12.

| Area | Files | What happens |
|---|---|---|
| Gateway security | 3 (`AuthenticationFilter`, `JwtService`, `GatewaySecurityProperties`) | Two deleted, one kept as the config source for the new filter chain |
| Service token parsing | 4 (`JwtService` ×2, `AuthUtil` ×2) | Two deleted, two rewritten against `SecurityContext` |
| `loggedInEmail()` call sites | 9 files across product and order | **Unchanged** — the method keeps its signature |
| user-service auth | `JwtUtils`, `AuthServiceImpl`, `AuthController`, `SecurityConfig`, `User`, `SignupRequest`, `LoginRequest` | Rewritten or deleted |
| Config holding `jwtSecret` | 4 main (`api-gateway/application.yaml`, 3 × `config/*.yml`) + 3 test | Key removed, `issuer-uri` added |
| Frontend reading `state.auth` | 22 | **Unchanged**, provided the slice shape is preserved |
| Frontend auth plumbing | `store/action/index.js`, `store/reducers/authReducer.js`, `api/api.js` | Rewritten |
| Backend tests touching auth | 6 classes | Rewritten or deleted |
| `tests/` | `lib/api.js`, 4 acceptance/system suites, `frontend/reducers.test.js`, `load/order-checkout.jmx` | Token acquisition rewritten |
| Compose | `docker-compose.yml`, new `backend/keycloak/` | Keycloak service, realm export |

---

## 6. Account and Password Migration

**Existing BCrypt hashes cannot be carried over.** Keycloak ships PBKDF2 and
Argon2 password hash providers; BCrypt needs a custom `PasswordHashProvider`
SPI, which is more work than this project's account set justifies.

For a thesis project with seeded demo accounts the answer is to **recreate the
accounts in the realm import** with known demo passwords, and accept that every
existing password is invalidated. Anything else would need the custom SPI or a
forced reset mail flow that depends on SMTP being reliable — which
[BUG-06](../backend/known-defects.md#bug-06--a-failed-email-send-is-swallowed-and-the-message-is-lost)
says it is not.

### The seeding coupling

[`../../backend/seed-db/run-seed.sh`](../../backend/seed-db/run-seed.sh) reads
`seller1`'s `user_id` and `email` out of the `user` table and passes them to
`catalogue.sql`, which stamps them onto all fourteen demo products. After the
migration, accounts live in Keycloak and the local `user` row appears only on
first login — so **a fresh stack would seed a catalogue owned by nobody**.

Two options; the first is preferred:

1. Have `run-seed.sh` insert the profile rows for the demo accounts directly,
   using the same emails as the realm import. Seeding stays one script and needs
   no login.
2. Have it obtain an admin token and provision through the Admin API. More
   faithful, but it makes seeding depend on Keycloak being healthy.

---

## 7. Test Strategy

| Level | Approach |
|---|---|
| Unit | No Keycloak. Build a `Jwt` with `Jwt.withTokenValue(...).claim("realm_access", Map.of("roles", List.of("ROLE_ADMIN")))` and assert on the converter and on `AuthUtil`. |
| Integration | `spring-security-test`'s `@WithMockJwtAuth` / `SecurityMockMvcRequestPostProcessors.jwt()`. Still no container. |
| System / acceptance | A real token from the `techzone-tests` client by password grant, fetched once in `tests/lib/api.js`. |
| Load | Same, in a JMeter setup thread group. |

Two suites deliberately pin *current, defective* behaviour and will go red on
purpose: `AuthenticationFilterTest.forgedTokenEscapesTheFilter` and
`JwtUtilsTest.tamperedTokenThrowsInsteadOfReturningFalse`, both for BUG-19.
Per [test-plan.md](../quality/test-plan.md), the expectation is updated in the
same change set — never deleted.

---

## 8. Risks and Open Questions

**1. Email as the identity key — accepted, and the largest one.**
The whole data model keys on email. Keycloak lets a user change theirs, and
nothing propagates that into `Order.email`, `Cart.userEmail`,
`ProductSnapshot.sellerEmail` or the `user` row. The result is silent data
orphaning with no error anywhere.

Mitigation for now: turn off self-service email change in the realm's account
console. The real fix — keying on `sub` — is a schema migration across the user
and order databases plus a backfill, and is deliberately out of scope. **It
should be its own ADR.**

**2. Two sources of truth.** Delete a user in Keycloak and their `user` row,
addresses and orders remain. There is no reconciliation and no
`admin-events` listener in this plan.

**3. Stage 3 is not easily reversible.** It deletes the token issuer. Land it
alone, on its own branch, with the stack demonstrably working after Stage 2.

**4. Container weight.** Compose already runs nine services plus Prometheus and
Grafana. A tenth affects cold start on a development laptop, which is the
environment [running-locally.md](../operations/running-locally.md) documents.

**5. Realm drift.** The exported realm is committed, but a change made through
the admin console at runtime is not. Either re-export deliberately as part of
any change, or treat the console as read-only. This needs a rule in the
developer guide, not just good intentions.

**6. Keycloak's own defaults.** Bringing in a product does not mean bringing in
a hardened one — the admin console and the admin account need the same "do not
publish this port" treatment that SEC-10 and SEC-12 describe for the services
that already exist.

**7. Administrator promotion leaves the application.** A consequence of the
allow-list, accepted deliberately. Two things follow: the dashboard loses an
operation it has today, and console access becomes the thing protecting
`ROLE_ADMIN` — so the console must not be published on a host port, which is
risk 6 restated with teeth. If the realm import is ever the only source of
admins, losing its credentials means losing administrative access to the
platform.

---

## 9. Effort

Ranges, for a single developer already familiar with the codebase. The spread is
wide because Stage 3 and Stage 4 both touch code whose current behaviour is only
partly covered by tests.

| Stage | Estimate |
|---|---|
| 0 — Keycloak in Compose, realm authored | 0.5–1 day |
| 1 — Gateway dual acceptance | 1–2 days |
| 2 — Two business services | 1–2 days |
| 3 — user-service rewrite, Admin API | 2–4 days |
| 4 — Frontend PKCE | 2–3 days |
| 5 — Tests | 1–2 days |
| 6 — Removing the old path, docs | 0.5–1 day |
| **Total** | **8–15 days** |

For comparison, the alternative recorded in ADR-0012 under "If this is
revisited" — RS256 with a key pair, no Keycloak — is roughly 1–2 days and closes
SEC-04 and BUG-19 but neither SEC-01 nor SEC-13.

---

## 10. Documents to Update When It Lands

Per the documentation workflow in [`../../CLAUDE.md`](../../CLAUDE.md), in the
same change set as the code:

| Document | Change |
|---|---|
| [decisions/0012](decisions/0012-keycloak-oidc-authentication.md) | `Proposed` → `Accepted` |
| [decisions/0003](decisions/0003-shared-hmac-jwt-secret.md), [decisions/0004](decisions/0004-cookie-based-jwt.md) | Status → `Superseded by ADR-0012`; no other edit |
| [decisions/README.md](decisions/README.md) | Index statuses; the "Authentication" pairing note |
| [security-model.md](security-model.md) | Rewritten — the flow diagram, token properties and claim table are all wrong after Stage 4 |
| [data-model.md](data-model.md) | `user.password` dropped; the identity-key note |
| [../backend/known-defects.md](../backend/known-defects.md) | SEC-01, SEC-02, SEC-04, SEC-13, BUG-03, BUG-19, OPS-11 → fixed, with dates; **the authorization entries explicitly left open** |
| [../backend/api-reference.md](../backend/api-reference.md) | `/signin`, `/signup`, `/signout` removed; `/api/admin/users/**` added |
| [../operations/configuration-reference.md](../operations/configuration-reference.md) | `jwtSecret`, `jwtCookieName`, `jwtExpirationMs` out; `issuer-uri`, Keycloak env vars in |
| [../operations/running-locally.md](../operations/running-locally.md) | Keycloak startup, demo accounts, new passwords |
| [../quality/test-plan.md](../quality/test-plan.md) | Token acquisition; the two characterisation tests that change |
| [../frontend/overview.md](../frontend/overview.md) | The `keycloak-js` dependency and the login flow |
| [../../CHANGELOG.md](../../CHANGELOG.md) | Under `[Unreleased]` — this is user-visible: everyone's password changes |
| [../dev-log/2026-MM.md](../dev-log/) | One entry per stage |

---

## 11. How the Implementation Departed From This Plan

Recorded on 2026-09-12, when the plan was carried out.

### Landed as one change, not seven

The stages were written for landing over days with a rollback point at each. The
implementation went straight to the Stage 6 end state in one change set: there is
no cookie path anywhere, and no dual acceptance was left behind. Stage 1's dual
acceptance was built first — as a `LegacyCookieAuthenticationWebFilter` feeding the
same `SecurityWebFilterChain`, which is the version of Stage 1 that actually works
(see below) — verified, and then removed with the rest of the old path.

**Stage 1 as written would not have worked.** It proposed a `SecurityWebFilterChain`
built from `GatewaySecurityProperties` *and* keeping `AuthenticationFilter` for
cookie requests. The chain is a `WebFilter` and runs before the gateway's
`GlobalFilter`s, so with `anyExchange().authenticated()` a cookie-only request is
refused before `AuthenticationFilter` ever sees it. Dual acceptance needs the
cookie to be turned into an `Authentication` *inside* the chain. Worth knowing if a
staged migration like this is ever attempted again.

### `issuer-uri` alone is not enough in Docker

§3 and Stage 2 name `issuer-uri`. Every resource server also sets `jwk-set-uri`.
The token's `iss` is the host the browser used (`localhost:8090`), which a container
cannot reach; the keys must be fetched from `keycloak:8090`. Spring Boot validates
the issuer from `issuer-uri` and fetches keys from `jwk-set-uri` when both are set,
and skips discovery at startup. The realm pins `KC_HOSTNAME` so `iss` does not
follow the request.

### Realm details the design did not anticipate

- `offline_access` and `uma_authorization` must be **declared** in the import:
  a composite cannot reference a built-in role the import has not created yet, and
  Keycloak 26 refuses to start otherwise.
- The service account's `realm-management` roles are expressed as a
  `service-account-techzone-admin-api` user entry.
- Client secrets use `${ENV_VAR:default}` substitution in the realm file, with
  named development defaults so a fresh clone can sign in. Verified against a live
  Keycloak 26.0.7.
- Password policy `length(8)`, brute-force protection and admin events were added.

### Things the file inventory missed

| Found | Done |
|---|---|
| `Product.sellerId` was stamped from the token's numeric `userId`, which a Keycloak token does not have | `loggedInUserId()` removed from product-service; `sellerId` left null for new products; column and DTO field kept. See ADR-0012's status note |
| `UserDTO` carried `password`, so the admin seller and customer lists returned every account's BCrypt hash | Field removed |
| `AccountController` (password verify / change) and `NotificationProducer.sendPasswordChangedEmail` | Removed; the SPA's Change Password dialog links to Keycloak's account console |
| The admin dashboard's `AddSellerForm` collected a username and a password | Now name and email only; shows the one-time temporary password until closed |
| `user.username` was `varchar(20)`; with email-as-username it holds an email | Widened to 50 |
| The gateway's 401 before routing carried no CORS headers | The chain reuses `spring.cloud.gateway.globalcors` as its `CorsConfigurationSource` |
| `@WebMvcTest` classes began loading the new `SecurityFilterChain` | The HTTP-contract tests switch filters off; separate `*SecurityTest` classes assert the rules |
| The JMeter plan's access token expires mid-run in the `load` and `stress` stages | The token request sits in the loop behind an `If` controller and refreshes a minute before expiry |

### Stage 3 — two small differences

- Demo profile rows are seeded by user-service's `CommandLineRunner` (option 1 of
  §6, but in Java rather than in `run-seed.sh`); `run-seed.sh` now looks the seller
  up by email.
- A just-in-time profile row gets no local role rows. Enforced roles come from the
  token; local roles only feed the dashboard's lists. This is part of "two sources
  of truth", not a new cost.

### Not verified in this change

The rewritten `tests/system` and `tests/acceptance` suites and the JMeter plan were
**not run against a live stack**. The four backend modules' suites and the frontend
reducer tests were (see Run E in
[../quality/test-report.md](../quality/test-report.md)), and the realm import was
exercised against a live Keycloak container. Stage 4's verification — walking the
[UAT checklist](../quality/uat-checklist.md) in a browser — is still to do.
