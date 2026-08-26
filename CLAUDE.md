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
6. **Log the session.** Every work session that changes code or configuration
   gets an entry at the top of the current month's file in
   [`docs/dev-log/`](docs/dev-log) (`YYYY-MM.md`), in the same change set.
   Follow the format and the redaction rules in
   [`docs/dev-log/README.md`](docs/dev-log/README.md) — name secret variables,
   never their values, and never write a live host's address.
7. **Record decisions as ADRs.** A platform-level choice gets a new numbered
   file in [`docs/architecture/decisions/`](docs/architecture/decisions), copied
   from `template.md`. Accepted ADRs are immutable — supersede, never rewrite.
8. **Update the changelog on release.** [`CHANGELOG.md`](CHANGELOG.md) records
   user-visible changes per version. Add to `[Unreleased]` as work lands; move
   those entries into a version section when a release is tagged.
9. **Keep the tests with the code.** Backend behaviour changes come with a unit
   or integration test in the same module
   (`backend/<service>/src/test/java/.../unit|integration/`); anything that
   crosses a service boundary or changes what a user can do comes with a system
   or acceptance test in [`tests/`](tests). Several tests deliberately pin
   *current, defective* behaviour and name the defect ID — fixing that defect
   means updating its test in the same change set, never deleting it. The map is
   in [docs/quality/test-plan.md](docs/quality/test-plan.md).

## Documentation Map

| Area | Document |
|---|---|
| What the system must do, and its delivery status | [docs/requirements/srs.md](docs/requirements/srs.md) |
| Requirements as user stories, with acceptance criteria | [docs/requirements/user-stories.md](docs/requirements/user-stories.md) |
| Services, ports, request flow | [docs/architecture/system-overview.md](docs/architecture/system-overview.md) |
| JWT, roles, gateway enforcement | [docs/architecture/security-model.md](docs/architecture/security-model.md) |
| Database schema, ER diagrams, integrity gaps | [docs/architecture/data-model.md](docs/architecture/data-model.md) |
| Use case, sequence, class, deployment diagrams | [docs/architecture/uml-diagrams.md](docs/architecture/uml-diagrams.md) |
| Platform technology trade-offs | [docs/architecture/decisions/](docs/architecture/decisions/) (ADRs) |
| Working on the code: setup, conventions, workflow | [docs/development/developer-guide.md](docs/development/developer-guide.md) |
| Running services from VS Code with a debugger (Mode 3 hybrid dev) | [docs/development/ide-debug-setup.md](docs/development/ide-debug-setup.md) |
| Backend modules and conventions | [docs/backend/overview.md](docs/backend/overview.md) |
| All HTTP endpoints | [docs/backend/api-reference.md](docs/backend/api-reference.md) |
| Verified defects, and the classes they fall into | [docs/backend/known-defects.md](docs/backend/known-defects.md), [docs/quality/bug-taxonomy.md](docs/quality/bug-taxonomy.md) |
| How the system is tested, at four levels | [docs/quality/test-plan.md](docs/quality/test-plan.md), [tests/README.md](tests/README.md) |
| Manual acceptance pass | [docs/quality/uat-checklist.md](docs/quality/uat-checklist.md) |
| QA plan, test cases, last validation run | [docs/quality/test-plan.md](docs/quality/test-plan.md), [docs/quality/test-cases.md](docs/quality/test-cases.md), [docs/quality/test-report.md](docs/quality/test-report.md) |
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
| Every config key, and when a change takes effect | [docs/operations/configuration-reference.md](docs/operations/configuration-reference.md) |
| Diagnosing and recovering a broken stack | [docs/operations/troubleshooting-runbook.md](docs/operations/troubleshooting-runbook.md) |
| Guides for customers, sellers, admins, installers | [docs/user-guide/](docs/user-guide/) |
| How each change came about | [docs/dev-log/](docs/dev-log) |
| Released, user-visible changes | [CHANGELOG.md](CHANGELOG.md) |

## Submodule Notes

- `backend/` and `frontend/` are independent git repositories. Commits inside
  them are separate from commits in this superproject; the superproject records
  only the submodule commit pointers.
- Documentation edits belong in `docs/` here. Only change a submodule's own
  `README.md` or `docs/` when the task specifically asks for it — and mirror the
  result into `docs/`.
