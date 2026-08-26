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

### Fixed

- Product specifications now load for signed-out visitors. The read endpoint sat
  outside the gateway's public-path pattern, so browsing a laptop anonymously
  returned `401` instead of its processor, RAM, storage, display, and GPU.
- The specification modal prefills the existing values again. It read a field the
  dashboard rows do not carry, so editing a product that already had
  specifications opened an empty form.

### Security

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
