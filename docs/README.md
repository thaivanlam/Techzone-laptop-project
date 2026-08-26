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

### Requirements
| Document | What it covers |
|---|---|
| [requirements/srs.md](requirements/srs.md) | Software Requirements Specification: business goals, user classes, every functional and non-functional requirement with its delivery status, constraints, scope boundaries |
| [requirements/user-stories.md](requirements/user-stories.md) | The same requirements as stories per role, with acceptance criteria, epics, and the traceability matrix onto test cases |

### Architecture
| Document | What it covers |
|---|---|
| [architecture/system-overview.md](architecture/system-overview.md) | Services, ports, end-to-end request flow, order placement walkthrough |
| [architecture/security-model.md](architecture/security-model.md) | JWT issuance, cookie auth, gateway role enforcement, role hierarchy |
| [architecture/data-model.md](architecture/data-model.md) | The physical schema: three databases, thirteen tables, ER diagrams, id generation, cross-boundary references, integrity gaps |
| [architecture/uml-diagrams.md](architecture/uml-diagrams.md) | Index of the UML set: which diagram answers which question, how to read them, and what they do not show |
| [architecture/uml-use-cases.md](architecture/uml-use-cases.md) | Use case diagram, actors, the use-case-to-requirement map, and intended versus actual access |
| [architecture/uml-structure.md](architecture/uml-structure.md) | Component, deployment, domain class and backend layering diagrams, with the connector inventory |
| [architecture/uml-behaviour.md](architecture/uml-behaviour.md) | Four sequence diagrams, the order state machine, and the faceted-search activity flow |
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

### Development
| Document | What it covers |
|---|---|
| [development/developer-guide.md](development/developer-guide.md) | Setup, the submodule rule, everyday commands, backend and frontend conventions, adding an endpoint or a screen, the algorithms worth knowing, landing a change |

### Quality
| Document | What it covers |
|---|---|
| [quality/test-plan.md](quality/test-plan.md) | The QA plan: objectives, the four levels and what each covers, environments, tooling, how to run every suite, entry and exit criteria, risk-based priorities, the characterisation-test convention, and what is deliberately not covered |
| [quality/test-cases.md](quality/test-cases.md) | 97 test cases with steps, expected results and traceability to requirements |
| [quality/test-report.md](quality/test-report.md) | Validation report: runs recorded, suite inventory, coverage gaps, what the suites found on their own, release readiness |
| [quality/uat-checklist.md](quality/uat-checklist.md) | The manual acceptance pass: interface, payment form, email, responsiveness, accessibility, with a sign-off block |
| [quality/bug-taxonomy.md](quality/bug-taxonomy.md) | The twelve defect classes, each with the instance found here, and a classification of every entry in the defect register |

### Operations
| Document | What it covers |
|---|---|
| [operations/running-locally.md](operations/running-locally.md) | The three startup modes, environment variables, endpoints, seeded users |
| [operations/docker-setup.md](operations/docker-setup.md) | Compose file layout, container topology, frontend image, nginx API proxy |
| [operations/database-seeding.md](operations/database-seeding.md) | Entrypoint database creation, the one-shot catalogue seeder, `product_seq`, verification procedure |
| [operations/configuration-reference.md](operations/configuration-reference.md) | Every environment variable, Config Server property and gateway rule, with when a change takes effect |
| [operations/troubleshooting-runbook.md](operations/troubleshooting-runbook.md) | Symptom index and step-by-step recovery runbooks, health checks, backup and restore, what to collect when escalating |

### End-User Guides
| Document | What it covers |
|---|---|
| [user-guide/installation.md](user-guide/installation.md) | Installing and starting the platform, for a non-developer: prerequisites, keys, settings, verification |
| [user-guide/customer-guide.md](user-guide/customer-guide.md) | Shopping: account, search and filters, basket, checkout with test cards, orders, addresses |
| [user-guide/seller-guide.md](user-guide/seller-guide.md) | Listing products: fields, photos, specifications, stock, fulfilling orders |
| [user-guide/admin-guide.md](user-guide/admin-guide.md) | Running the shop: dashboard, categories, products, orders, accounts, and the security caveats |
| [user-guide/faq.md](user-guide/faq.md) | Common questions by audience, with the known quirks explained |

### Development Log
| Document | What it covers |
|---|---|
| [dev-log/README.md](dev-log/README.md) | Entry format, why the log is kept, what must never be written into it |
| [dev-log/2026-08.md](dev-log/2026-08.md) | August 2026: superproject setup, docs consolidation, Compose stack, Stripe build-time key fix |

### Assets
| Path | What it holds |
|---|---|
| [assets/banner.svg](assets/banner.svg) | Header banner rendered at the top of the root [`README.md`](../README.md) |
| [assets/screenshots/](assets/screenshots/) | Interface captures for the root README's screenshot grid (currently empty; the grid stays commented out until they exist) |

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
| `quality/bug-taxonomy.md` | Written here — derived from `backend/known-defects.md` and the dev log; no upstream equivalent |
| `quality/test-plan.md`, `quality/test-cases.md`, `quality/test-report.md`, `quality/uat-checklist.md` | Written here — describe the test suites in `backend/*/src/test/` and in `tests/`, and record their runs; no upstream equivalent |
| `requirements/srs.md`, `requirements/user-stories.md` | Written here — derived from the delivered behaviour, the API reference and the defect register; no upstream equivalent |
| `architecture/data-model.md` | Written here — derived from the JPA entities, `backend/init-db/` and `backend/seed-db/` |
| `architecture/uml-diagrams.md`, `architecture/uml-use-cases.md`, `architecture/uml-structure.md`, `architecture/uml-behaviour.md` | Written here — derived from the controllers, services, entities, Compose files and `frontend/src/App.jsx` |
| `development/developer-guide.md` | Written here — the working conventions of this repository; no upstream equivalent |
| `operations/configuration-reference.md` | Written here — consolidates `.env.example`, `config-server/…/config/*.yml` and the gateway's `application.yaml` |
| `operations/troubleshooting-runbook.md` | Written here — operator procedures for the Compose stack; no upstream equivalent |
| `user-guide/*.md` | Written here — end-user documentation for the delivered interface; no upstream equivalent |
| `frontend/overview.md`, `frontend/design-decisions.md` | `frontend/README.md` |
| `operations/docker-setup.md` | Written here — describes the superproject's own `docker-compose.yml` and `frontend/Dockerfile` |
| `operations/database-seeding.md` | Written here — describes `backend/init-db/` and `backend/seed-db/` |
| *(not mirrored)* `backend/product-service/images/seed/CREDITS.md` | Lives upstream on purpose. It is the CC BY / CC BY-SA attribution for the seed catalogue photographs, and those licences require the credit to travel **with** the files; a copy here would be a second thing to keep in sync. `operations/database-seeding.md` links to it. |
| `assets/*` | Written here — visual assets for the root `README.md`; no upstream equivalent |
| `dev-log/*.md` | Written here — a record of this repository's own work sessions; no upstream equivalent |
