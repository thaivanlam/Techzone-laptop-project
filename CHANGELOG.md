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
- [`docs/operations/database-seeding.md`](docs/operations/database-seeding.md)
  — entrypoint database creation, the one-shot catalogue seeder, and the
  `product_seq` handling the seeder depends on.
- [`docs/dev-log/`](docs/dev-log/) — a monthly development log recording how
  each change came about, with its redaction rules.
- [`docs/architecture/decisions/`](docs/architecture/decisions/) — Architecture
  Decision Records, one numbered file per platform decision, each with a status
  and its trade-offs, plus a template for recording new ones.
- `backend/` and `frontend/` wired in as git submodules.

### Changed

- Backend Compose health checks now gate dependent services on readiness rather
  than container start, so the full-Docker stack comes up in one command.
- `docs/architecture/design-decisions.md` is now an index onto the ADRs; the
  decisions themselves moved into `docs/architecture/decisions/`. Documents that
  deep-linked to its headings now link to the corresponding ADR.
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
