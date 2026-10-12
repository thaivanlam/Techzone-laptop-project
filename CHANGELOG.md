# Changelog

All notable changes to the TechZone laptop e-commerce platform are recorded
here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file covers the **superproject** — the Compose stack, the documentation,
and the submodule pointers it records. Changes internal to a service are
summarised here only when they affect how the platform is run or consumed;
the detail lives in `docs/` and in each submodule's own history.

Section order within a release: `Added`, `Changed`, `Deprecated`, `Removed`,
`Fixed`, `Security`. Omit a section rather than writing "none".

For the session-by-session account of how a change came about, see
[`docs/dev-log/`](docs/dev-log/).

---

## [Unreleased]

No version has been tagged yet. Everything below ships in the first release.

### Added

- **Resource overlays for the seven backend JVM containers.** Two optional
  Compose files cap their memory and CPU and set their JVM flags; without one,
  the stack runs exactly as before, with no limits.
  `backend/docker-compose.dev.yml` makes the stack small for everyday work — in
  the first measurement the seven services went from about 2.4 GiB to
  1.5–1.6 GiB — and must not be used for load runs, where
  `backend/docker-compose.benchmark.yml` bounds the services without changing
  how they perform:

  ```bash
  docker compose -f docker-compose.yml -f backend/docker-compose.dev.yml up -d
  ```

  Under the development overlay CPU-heavy requests are slower; run the live
  test suites with `REQUEST_TIMEOUT_MS=30000`. See
  [`docs/operations/resource-limits.md`](docs/operations/resource-limits.md).

- **Sign-in through Keycloak.** Signing in, registering and signing out now
  happen on the TechZone account service — a Keycloak 26 container on port
  **8090**, with the realm imported from `backend/keycloak/realm-techzone.json` —
  and the shop receives an RS256 access token by Authorization Code + PKCE.
  Every service verifies that token itself. Password reset, account lockout after
  repeated failures and "sign out everywhere" come with it.
  [ADR-0012](docs/architecture/decisions/0012-keycloak-oidc-authentication.md).
- `POST /user-manager/api/admin/users` — an administrator creates a seller (or
  customer) account, which starts with a one-time temporary password the holder
  must change at first sign-in. The admin dashboard's **Add Seller** form uses it.

- **A record of every development session**, kept in a separate private
  repository. `scripts/export_session.py` distils the AI assistant's local
  transcripts — which the tool deletes after 30 days — into one markdown file
  per session: each prompt as it was typed and the reply that closed that turn,
  plus the session's duration, the files it modified and the commits it
  produced. Secrets and live-host addresses are masked automatically, and a
  `SessionEnd` hook regenerates the record when a session ends, then commits and
  pushes it to that repository — a record that never leaves one laptop is not
  kept, since the transcript behind it expires. `--no-push` and `--no-commit`
  (or `TECHZONE_SESSION_HISTORY_AUTOPUSH=0` / `…_AUTOCOMMIT=0`) leave that to a
  person. The records are **not in this repository** — it is public and they
  quote whole conversations; see
  [`docs/dev-log/sessions.md`](docs/dev-log/sessions.md) and
  [ADR-0011](docs/architecture/decisions/0011-session-records-in-a-private-repository.md).

- **Metrics on every service.** All seven backend services now expose a
  Micrometer registry at `/actuator/prometheus`, with request histograms so
  latency percentiles can be computed rather than guessed. A new
  `observability` Compose profile adds Prometheus (scraping every 10s, 15-day
  retention, three alert rules) and Grafana (two dashboards provisioned from
  the repository: a service overview, and per-endpoint latency for the
  ordering and catalogue APIs):

  ```bash
  COMPOSE_PROFILES=prod,observability docker compose up -d
  ```

  Grafana is published on `GRAFANA_PORT` (3001 by default), Prometheus on
  `PROMETHEUS_PORT` (9090). Neither is started by the default profile. See
  [`docs/operations/observability.md`](docs/operations/observability.md) and
  [ADR-0010](docs/architecture/decisions/0010-prometheus-grafana-metrics.md).
- **JMeter load tests** in [`tests/load/`](tests/load/README.md): two plans —
  anonymous catalogue browsing, and register-to-placed-order — runnable at
  smoke, load, stress and spike stages through `run.sh` / `run.ps1`, with an
  HTML report per run. The plan, thresholds and procedure are in
  [`docs/quality/performance-testing.md`](docs/quality/performance-testing.md),
  together with the first recorded run: 11 060 samples at 20 concurrent users
  across both plans, zero errors, and nothing close to saturation. The run also
  found a new defect —
  [`BUG-22`](docs/backend/known-defects.md#bug-22--a-payment-method-shorter-than-four-characters-fails-the-order-with-500):
  an order placed with a payment method shorter than four characters fails with
  500 after stock has already been decremented.
- Self-service password change from **Profile → Security**, available to
  every role (customer, seller, admin). The current password is verified
  first, with a visible "Verifying…" / "Verified" state, before the new
  password and confirmation are accepted; a successful change queues a
  "password changed" email through the existing notification pipeline. New
  endpoints: `POST /user-manager/api/users/password/verify` and
  `PUT /user-manager/api/users/password`.
- Root `docker-compose.yml` running the full stack — MySQL, RabbitMQ, config
  server, discovery, the four business services, the API gateway, and the
  frontend — on one `ecommerce-network`. The backend service definitions are
  pulled in with Compose `include` so they keep a single source of truth.
- Two-stage `frontend/Dockerfile`: a Vite build followed by nginx serving the
  static bundle, with a templated reverse proxy to the API gateway so the SPA
  and the API share one origin.
- Consolidated `docs/` folder covering architecture, the backend services, the
  frontend, and operations, indexed by [`docs/README.md`](docs/README.md).
- Per-service backend architecture documents for the gateway, config server,
  discovery service, user, product, order, and notification services.
- [`docs/backend/known-defects.md`](docs/backend/known-defects.md) — a defect
  register from a source audit, with severity, reproduction, and proposed fix
  for each entry.
- [`docs/quality/bug-taxonomy.md`](docs/quality/bug-taxonomy.md) — the twelve
  defect classes the platform can produce, each with the instance found here,
  and a classification of every entry in the defect register.
- [`docs/operations/database-seeding.md`](docs/operations/database-seeding.md)
  — entrypoint database creation, the one-shot catalogue seeder, and the
  `product_seq` handling the seeder depends on.
- [`docs/dev-log/`](docs/dev-log/) — a monthly development log recording how
  each change came about, with its redaction rules.
- [`env/`](env/) — secret-free `.env` templates, one pair per startup mode, so
  switching between the three modes in
  [`docs/operations/running-locally.md`](docs/operations/running-locally.md)
  no longer means hand-editing a shared `.env`.
- [`docs/development/ide-debug-setup.md`](docs/development/ide-debug-setup.md)
  — VS Code setup for running the five business services with a debugger in
  Mode 3 (hybrid dev), including a ready-to-copy `launch.json`.
- [`docs/architecture/decisions/`](docs/architecture/decisions/) — Architecture
  Decision Records, one numbered file per platform decision, each with a status
  and its trade-offs, plus a template for recording new ones.
- An automated test suite at four levels — **350 tests**, none of which existed
  before. 191 unit tests (JUnit 5 + Mockito on the backend, Node's built-in
  runner on the front-end reducers and helpers), 59 integration tests (Spring
  Boot slices against in-memory H2, plus the order→product HTTP contract), 60
  system tests and 33 acceptance tests driving the running stack through the API
  Gateway. 342 of the 350 have been executed and are green; the remaining 8
  place real orders and run only behind `RUN_DESTRUCTIVE=1`.
- [`tests/`](tests) — the superproject test project: `frontend/` unit tests,
  `system/` and `acceptance/` end-to-end suites, and Gherkin feature files
  stating each acceptance scenario in business language. No npm dependencies;
  the suites skip themselves with an explanation when the stack is not running.
- Test-only configuration for five backend modules
  (`src/test/resources/application.y*ml`) so the backend suites run with no
  Config Server, no Eureka, no MySQL and no broker. H2 is now a test-scoped
  dependency of product, order and user services.
- [`docs/quality/uat-checklist.md`](docs/quality/uat-checklist.md) — the manual
  acceptance pass: interface, payment form, email delivery, responsiveness and
  accessibility, with a sign-off block.
- Three new entries in the defect register, all found by writing and running the
  suite rather than by reading the source: **BUG-19** (a forged JWT signature
  escapes the validity check), **BUG-20** (the cart page answers `500` for a
  customer who has never had a cart), and **BUG-21** (two concurrent adds
  permanently break a cart). None is fixed yet; each is recorded with a
  reproduction and a proposed fix.
- [`docs/requirements/`](docs/requirements/) — a Software Requirements
  Specification and a companion user-story document. Business goals, user
  classes, 62 numbered functional and non-functional requirements each carrying
  its delivery status, constraints, explicit scope boundaries, and a
  traceability matrix from story to test case.
- [`docs/architecture/data-model.md`](docs/architecture/data-model.md) — the
  physical schema: three logical databases, thirteen tables column by column, ER
  diagrams, identifier generation, the four cross-database references, and the
  data-integrity gaps that follow from them.
- The UML diagram set, split by family and indexed by
  [`docs/architecture/uml-diagrams.md`](docs/architecture/uml-diagrams.md):
  [use cases](docs/architecture/uml-use-cases.md),
  [structure](docs/architecture/uml-structure.md) (component, deployment, domain
  class, layering) and [behaviour](docs/architecture/uml-behaviour.md) (four
  sequence diagrams, the order state machine, the search activity flow).
- [`docs/development/developer-guide.md`](docs/development/developer-guide.md)
  — onboarding and working conventions: the two-commit submodule rule, everyday
  commands, backend and frontend layering, how to add an endpoint or a screen
  end to end, the five algorithms worth knowing, and the definition of a landed
  change.
- [`docs/quality/test-plan.md`](docs/quality/test-plan.md),
  [`test-cases.md`](docs/quality/test-cases.md) and
  [`test-report.md`](docs/quality/test-report.md) — the QA plan (levels,
  environments, entry and exit criteria, risk-based priorities), 97 traceable
  test cases, and a validation report recording the runs.
- [`docs/operations/configuration-reference.md`](docs/operations/configuration-reference.md)
  — every environment variable, Config Server property and gateway rule in one
  table, with what reads it and when a change takes effect.
- [`docs/operations/troubleshooting-runbook.md`](docs/operations/troubleshooting-runbook.md)
  — a symptom index and six step-by-step recovery runbooks, health checks,
  backup and restore, and what to collect before escalating.
- [`docs/user-guide/`](docs/user-guide/) — end-user documentation for
  non-technical readers: an installation guide, separate manuals for customers,
  sellers and administrators, and an FAQ.
- `backend/` and `frontend/` wired in as git submodules.
- Fourteen product photographs for the demo catalogue, one per seeded laptop, in
  `backend/product-service/images/seed/`. They are Creative Commons and
  public-domain images from Wikimedia Commons, downscaled to 900px wide (1.7MB
  in total), and ship inside the product-service container image so a seeded
  shop has pictures on a cold start with nothing to upload. Author and licence
  per file are in that directory's `CREDITS.md`.

### Changed

- **Breaking — everyone's password changes.** The demo accounts were recreated in
  Keycloak; existing BCrypt passwords could not be carried over. Sign in with the
  **email address**: `admin@example.com`, `seller1@example.com`,
  `user1@example.com`, `user2@example.com` — see
  [`docs/operations/running-locally.md`](docs/operations/running-locally.md#seeded-users).
- **Breaking for API consumers.** Authentication is `Authorization: Bearer
  <token>`; the `springBootEcom` cookie is gone. User administration moved from
  `/user-manager/api/auth/{sellers,customers}` to
  `/user-manager/api/admin/users/{sellers,customers}` and requires `ROLE_ADMIN`.
- Registration no longer offers a role. Every new account is a customer; sellers
  are created by an administrator; administrators are appointed only in the
  Keycloak console.
- **Profile → Change Password** opens Keycloak's account console instead of an
  in-shop form.
- The stack gains a tenth container. Keycloak starts with the infrastructure in
  every run mode, and new variables configure it (`KEYCLOAK_*`,
  `VITE_KEYCLOAK_*`) — see
  [`docs/operations/configuration-reference.md`](docs/operations/configuration-reference.md).
- An idle session now ends after 30 minutes and the next action goes to the
  sign-in page, rather than the shop failing silently after 50 minutes.

- The root [`README.md`](README.md) is now the project's front page rather than
  a pointer file: a header banner, a Mermaid service diagram, stack badges, a
  three-step quick start, and collapsible sections for run modes, environment
  variables, endpoints, and demo accounts. Every fact in it links to the
  document in `docs/` that owns it. Includes a screenshot gallery captured
  against the running stack — storefront, product specifications, cart,
  Stripe checkout, and the admin dashboard.

- Backend Compose health checks now gate dependent services on readiness rather
  than container start, so the full-Docker stack comes up in one command.
- `docs/architecture/design-decisions.md` is now an index onto the ADRs; the
  decisions themselves moved into `docs/architecture/decisions/`. Documents that
  deep-linked to its headings now link to the corresponding ADR.
- Seeded products now carry a real photograph instead of `default.png`, which no
  file backed — the demo shop showed fourteen broken images. `product.image` now
  holds `seed/<slug>.jpg`, resolved through `IMAGE_BASE_URL` as before.
- Listing cards no longer stretch product photos. The card image filled its 3:2
  box with no `object-fit`, so anything not exactly 3:2 was distorted; it now
  uses `object-cover`.
- **Breaking for API consumers.** The product specification endpoints moved from
  `/product-manager/api/products/{role}/{productId}/specifications` to
  `/product-manager/api/{role}/products/{productId}/specifications`, so the role
  segment matches the scheme every other endpoint follows. The old paths are
  gone, not aliased.

### Removed

- `POST /user-manager/api/auth/signin`, `/signup` and `/signout`;
  `POST /user-manager/api/users/password/verify` and `PUT /user-manager/api/users/password`.
  They answer 404.
- The `password` column of the `user` table (no longer mapped — drop it by hand on
  an existing database) and the `password` field of the admin seller and customer
  lists, which returned password hashes.

### Fixed

- A checkout that fails no longer costs stock (`BUG-01`). The stock for every
  line of an order is now reserved in one all-or-nothing call before the order is
  written, and given back if the order then fails — including when the
  confirmation email cannot be queued. Previously an order that failed on a later
  line left the earlier lines' stock reduced with no order to show for it.
  Product Service gained two internal endpoints for this,
  `POST /api/internal/products/reduce-stock` and `.../restore-stock`.

- A forged token is refused with `401` instead of `500` (`BUG-19`).
- The browser no longer believes it is signed in after its session has expired
  (`BUG-03`).

- Product specifications now load for signed-out visitors. The read endpoint sat
  outside the gateway's public-path pattern, so browsing a laptop anonymously
  returned `401` instead of its processor, RAM, storage, display, and GPU.
- The specification modal prefills the existing values again. It read a field the
  dashboard rows do not carry, so editing a product that already had
  specifications opened an empty form.

### Security

- **Fixed — anyone could register as an administrator (`SEC-01`).** There is no
  longer a sign-up request that carries a role, and no endpoint in the platform
  can grant `ROLE_ADMIN`.
- **Fixed — user administration was public (`SEC-02`).** Listing and deleting
  customers and sellers requires `ROLE_ADMIN`, checked at the gateway and in
  user-service.
- **Fixed — the token signing secret was in the repository (`SEC-04`).** No
  component holds a signing key; tokens are signed by Keycloak and verified
  against its public keys.
- **Fixed — sign-out did not end the session (`SEC-13`).** Sign-out revokes the
  session; tokens live five minutes and are no longer readable from a cookie or
  `localStorage`.
- **Not fixed by the Keycloak move**, and stated so nobody assumes otherwise:
  ownership is still unchecked on products, carts, orders and addresses (`SEC-05`,
  `SEC-07`, `SEC-08`, `SEC-09`), and the internal stock API, the mail endpoint and
  the Eureka registry are still unauthenticated (`SEC-10`–`SEC-12`). The two
  Keycloak client secrets and the console password have published development
  defaults that must be overridden before the stack is reachable by anyone else.

- **BUG-21 recorded — the most serious of the three found while testing.** Two
  concurrent "add to cart" requests for the same product both insert a cart
  line, because the check-then-insert has no locking and there is no unique
  constraint on `cart_item (cart_id, product_id)`. From that moment every cart
  request for that account answers `500` for ever, since the repository method
  is declared to return a single entity — the cart cannot be opened, added to,
  or checked out, and only a manual `DELETE` in SQL recovers it. Reachable by
  double-clicking the add button or having the shop open in two tabs.
  Documented in
  [`docs/backend/known-defects.md`](docs/backend/known-defects.md#bug-21--two-concurrent-adds-of-the-same-product-permanently-break-a-cart)
  with the recovery SQL and the fix. Not yet fixed.
- **BUG-19 recorded.** All four JWT validity checks (gateway, product, order and
  user services) catch four jjwt exception types but not `SignatureException`,
  so a token with a valid structure and a forged signature escapes the check
  instead of returning `false`. The request is still refused, but the caller
  sees a `500` where a `401` belongs — at the gateway that is an oracle telling
  an attacker their token was well formed. Found while writing the JWT unit
  tests; documented in
  [`docs/backend/known-defects.md`](docs/backend/known-defects.md#bug-19--a-forged-jwt-signature-escapes-the-validity-check),
  with three characterisation tests pinning the current behaviour. Not yet
  fixed.
- Product specification writes and deletes are role-checked at the gateway. The
  controller's base path put the `admin`/`seller`/`public` segment one position
  too deep for any gateway pattern to match, so the endpoints were reachable by
  any signed-in account; a seller could write through the admin endpoint. The
  admin panel compounded this by passing a hard-coded "is admin" flag to the
  modal for every user.
- Seller product endpoints (`/product-manager/api/seller/**`) now require
  `ROLE_SELLER`. Previously any signed-in customer could create, rename,
  re-price, re-image, or delete any product. Sellers still are not checked
  against product ownership — see `SEC-05` in
  [`docs/backend/known-defects.md`](docs/backend/known-defects.md).
- `.env` is excluded from version control from the initial commit onward. No
  real credential has entered this repository's history; secrets are supplied
  locally from `.env.example` and documented by variable name only.

---

<!--
Cutting a release:
  1. Move the [Unreleased] entries into a new `## [x.y.z] - YYYY-MM-DD` section.
  2. Leave [Unreleased] in place with its sections emptied.
  3. Tag the superproject commit `vx.y.z` — the tag records the submodule
     pointers, which is what makes the release reproducible.
-->
