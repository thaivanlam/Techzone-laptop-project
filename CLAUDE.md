# TechZone Laptop Project — Working Instructions

This repository is a superproject containing two git submodules:

- [`backend/`](backend) — Spring Boot 3.5 / Spring Cloud 2025 microservices
  (`graduation-thesis-microservice-laptop-ecommerce-2`)
- [`frontend/`](frontend) — React 19 + Redux Toolkit + Tailwind CSS v4 SPA
  (`Ecom-Frontend-thesis-project-2025.1`)

## Documentation Workflow — required

All project documentation lives in [`docs/`](docs), indexed by
[`docs/README.md`](docs/README.md). It is the consolidated home for
documentation from **both** submodules.

1. **Read before working.** At the start of every task, read the documents in
   `docs/` relevant to the area being touched. Start from
   [`docs/README.md`](docs/README.md) to find them.
2. **Update with the code.** Any change to backend or frontend code must include
   an update to the affected document(s) in `docs/`, in the same change set.
   This covers endpoints, config keys, environment variables, data model,
   request flows, and design trade-offs.
3. **Mirror upstream docs.** If a new document appears inside `backend/` or
   `frontend/`, mirror it into the matching folder under `docs/` and add a row
   to the index and to the "Upstream Sources" table in `docs/README.md`.
4. **Index new documents.** Every new file in `docs/` gets a row in the index in
   `docs/README.md`.
5. **English only.** All documentation is written in English, regardless of the
   language used in conversation or commits.

## Documentation Map

| Area | Document |
|---|---|
| Services, ports, request flow | [docs/architecture/system-overview.md](docs/architecture/system-overview.md) |
| JWT, roles, gateway enforcement | [docs/architecture/security-model.md](docs/architecture/security-model.md) |
| Platform technology trade-offs | [docs/architecture/design-decisions.md](docs/architecture/design-decisions.md) |
| Backend modules and conventions | [docs/backend/overview.md](docs/backend/overview.md) |
| All HTTP endpoints | [docs/backend/api-reference.md](docs/backend/api-reference.md) |
| API Gateway internals | [docs/backend/services/api-gateway.md](docs/backend/services/api-gateway.md) |
| Config Server internals | [docs/backend/services/config-server.md](docs/backend/services/config-server.md) |
| Discovery Service internals | [docs/backend/services/discovery-service.md](docs/backend/services/discovery-service.md) |
| User Service internals | [docs/backend/services/user-service.md](docs/backend/services/user-service.md) |
| Product Service internals | [docs/backend/services/product-service.md](docs/backend/services/product-service.md) |
| Order Service internals | [docs/backend/services/order-service.md](docs/backend/services/order-service.md) |
| Notification Service internals | [docs/backend/services/notification-service.md](docs/backend/services/notification-service.md) |
| Frontend stack and structure | [docs/frontend/overview.md](docs/frontend/overview.md) |
| Frontend trade-offs | [docs/frontend/design-decisions.md](docs/frontend/design-decisions.md) |
| Startup, env vars, seeded users | [docs/operations/running-locally.md](docs/operations/running-locally.md) |

## Submodule Notes

- `backend/` and `frontend/` are independent git repositories. Commits inside
  them are separate from commits in this superproject; the superproject records
  only the submodule commit pointers.
- Documentation edits belong in `docs/` here. Only change a submodule's own
  `README.md` or `docs/` when the task specifically asks for it — and mirror the
  result into `docs/`.
