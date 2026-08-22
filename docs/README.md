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
| [architecture/design-decisions.md](architecture/design-decisions.md) | Platform-wide technology choices and their trade-offs |

### Backend
| Document | What it covers |
|---|---|
| [backend/overview.md](backend/overview.md) | Backend module layout, per-service responsibilities, infrastructure |
| [backend/api-reference.md](backend/api-reference.md) | Every gateway-exposed endpoint, with access level |
| [backend/services/user-service.md](backend/services/user-service.md) | Full user-service architecture: layers, data model, JWT, RabbitMQ, config |

### Frontend
| Document | What it covers |
|---|---|
| [frontend/overview.md](frontend/overview.md) | Stack, project structure, routing, state management, key features |
| [frontend/design-decisions.md](frontend/design-decisions.md) | Frontend trade-offs (Redux style, MUI + Tailwind, cart strategy, …) |

### Operations
| Document | What it covers |
|---|---|
| [operations/running-locally.md](operations/running-locally.md) | Docker Compose and dev-mode startup, environment variables, seeded users |

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

## Upstream Sources

| Document here | Mirrored from |
|---|---|
| `architecture/system-overview.md`, `architecture/security-model.md`, `architecture/design-decisions.md`, `backend/overview.md`, `backend/api-reference.md`, `operations/running-locally.md` | `backend/README.md` |
| `backend/services/user-service.md` | `backend/user-service/docs/ARCHITECTURE.md` |
| `frontend/overview.md`, `frontend/design-decisions.md` | `frontend/README.md` |
