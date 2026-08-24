# TechZone Laptop — Documentation

Central documentation hub for the TechZone laptop e-commerce platform. This
repository is a superproject that contains two git submodules:

| Submodule | Upstream repository | Contents |
|---|---|---|
| [`backend/`](../backend) | `graduation-thesis-microservice-laptop-ecommerce-2` | Spring Boot 3.5 / Spring Cloud 2025 microservices |
| [`frontend/`](../frontend) | `Ecom-Frontend-thesis-project-2025.1` | React 19 + Redux Toolkit + Tailwind CSS v4 SPA |

Because the two code repositories evolve independently, **this `docs/` folder is
the single place where their documentation is consolidated**. Any document that
originates in either submodule is mirrored and maintained here.

---

## Index

### Architecture
| Document | What it covers |
|---|---|
| [architecture/system-overview.md](architecture/system-overview.md) | Services, ports, end-to-end request flow, order placement walkthrough |
| [architecture/security-model.md](architecture/security-model.md) | JWT issuance, cookie auth, gateway role enforcement, role hierarchy |
| [architecture/decisions/](architecture/decisions/) | Architecture Decision Records — one file per platform decision, with status and trade-offs |
| [architecture/design-decisions.md](architecture/design-decisions.md) | Index mapping "why is X the way it is?" to the ADR that answers it |

### Backend
| Document | What it covers |
|---|---|
| [backend/overview.md](backend/overview.md) | Backend module layout, per-service responsibilities, infrastructure |
| [backend/api-reference.md](backend/api-reference.md) | Every gateway-exposed endpoint, with access level |
| [backend/known-defects.md](backend/known-defects.md) | Verified defect register: severity, reproduction, fix, remediation order |
| [backend/services/api-gateway.md](backend/services/api-gateway.md) | Gateway routes, CORS, JWT filter, role enforcement |
| [backend/services/config-server.md](backend/services/config-server.md) | Centralised configuration: profiles, per-service property files |
| [backend/services/discovery-service.md](backend/services/discovery-service.md) | Eureka registry: who registers, lease timings, dashboard access |
| [backend/services/user-service.md](backend/services/user-service.md) | Full user-service architecture: layers, data model, JWT, RabbitMQ, config |
| [backend/services/product-service.md](backend/services/product-service.md) | Catalogue, faceted search, specifications, images, SKU, internal stock API |
| [backend/services/order-service.md](backend/services/order-service.md) | Cart lifecycle, order placement, Stripe, RabbitMQ, analytics |
| [backend/services/notification-service.md](backend/services/notification-service.md) | RabbitMQ consumer, messaging topology, Gmail SMTP delivery |

### Frontend
| Document | What it covers |
|---|---|
| [frontend/overview.md](frontend/overview.md) | Stack, project structure, routing, state management, key features |
| [frontend/design-decisions.md](frontend/design-decisions.md) | Frontend trade-offs (Redux style, MUI + Tailwind, cart strategy, …) |

### Operations
| Document | What it covers |
|---|---|
| [operations/running-locally.md](operations/running-locally.md) | The three startup modes, environment variables, endpoints, seeded users |
| [operations/docker-setup.md](operations/docker-setup.md) | Compose file layout, container topology, frontend image, nginx API proxy |
| [operations/database-seeding.md](operations/database-seeding.md) | Entrypoint database creation, the one-shot catalogue seeder, `product_seq`, verification procedure |

### Development Log
| Document | What it covers |
|---|---|
| [dev-log/README.md](dev-log/README.md) | Entry format, why the log is kept, what must never be written into it |
| [dev-log/2026-08.md](dev-log/2026-08.md) | August 2026: superproject setup, docs consolidation, Compose stack, Stripe build-time key fix |

Release-level history lives in [`CHANGELOG.md`](../CHANGELOG.md) at the
repository root, not in this folder.

---

## Document Conventions

- **Language:** all documents are written in **English**, regardless of the
  language used in commit messages, issues, or conversation.
- **Format:** GitHub-flavored Markdown. Diagrams use Mermaid where a rendered
  diagram helps, and fenced ASCII blocks where a simple flow is clearer.
- **Naming:** lower-kebab-case filenames (`system-overview.md`).
- **Scope:** one topic per file. If a file grows past roughly 500 lines, split it
  and link the parts from this index.
- **Source links:** when a document describes code, link to the file in the
  submodule (for example `backend/api-gateway/src/main/resources/application.yaml`)
  so a reader can jump from prose to implementation.

## Maintenance Rules

1. **Read before changing.** Before working on a task, read the documents in
   this folder that relate to the area being touched.
2. **Update with the code.** Any change to backend or frontend code must be
   accompanied by an update to the affected document(s) here, in the same
   change set — endpoints, config keys, data model, flows, and trade-offs all
   count.
3. **New documents get indexed.** When a new document is added, add a row to the
   Index above.
4. **Upstream docs get mirrored.** If a document appears in the `backend/` or
   `frontend/` submodule, mirror it into the matching folder here rather than
   leaving it only in the submodule.
5. **Record removals.** When a feature is deleted, delete or clearly mark the
   documentation for it — stale docs are worse than missing docs.
6. **Log the session.** Every work session that changes code or configuration
   gets an entry in the current month's file under [`dev-log/`](dev-log/),
   added in the same change set. The reference documents record what the system
   *is*; the log records how it got there.

7. **Record decisions as ADRs.** A platform-level choice — a framework, a
   protocol, a data-boundary rule — gets a new file in
   [`architecture/decisions/`](architecture/decisions/). Accepted ADRs are never
   edited in place; a decision that no longer holds is superseded by a new one.

## Upstream Sources

| Document here | Mirrored from |
|---|---|
| `architecture/system-overview.md`, `architecture/security-model.md`, `architecture/decisions/*.md`, `backend/overview.md`, `backend/api-reference.md`, `operations/running-locally.md` | `backend/README.md` |
| `backend/services/user-service.md` | `backend/user-service/docs/ARCHITECTURE.md` |
| `backend/services/api-gateway.md`, `backend/services/config-server.md`, `backend/services/discovery-service.md`, `backend/services/product-service.md`, `backend/services/order-service.md`, `backend/services/notification-service.md` | Written here — no upstream document exists; derived from the module sources |
| `backend/known-defects.md` | Written here — derived from a source audit of the backend modules |
| `frontend/overview.md`, `frontend/design-decisions.md` | `frontend/README.md` |
| `operations/docker-setup.md` | Written here — describes the superproject's own `docker-compose.yml` and `frontend/Dockerfile` |
| `operations/database-seeding.md` | Written here — describes `backend/init-db/` and `backend/seed-db/` |
| `dev-log/*.md` | Written here — a record of this repository's own work sessions; no upstream equivalent |
