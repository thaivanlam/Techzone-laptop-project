# Techzone-laptop-project

Superproject for the TechZone laptop e-commerce platform, a microservices-based
system built for the graduation thesis *"Laptop E-commerce Platform Using
Microservices Architecture"*.

## Repository Layout

| Path | Description |
|---|---|
| [`backend/`](backend) | Spring Boot 3.5 / Spring Cloud 2025 microservices (submodule) |
| [`frontend/`](frontend) | React 19 + Redux Toolkit + Tailwind CSS v4 SPA (submodule) |
| [`docs/`](docs) | Consolidated documentation for both submodules |

## Getting Started

```bash
git clone --recurse-submodules <this-repo-url>
# in an existing clone:
git submodule update --init --recursive
```

Startup instructions, environment variables, and seeded accounts:
[`docs/operations/running-locally.md`](docs/operations/running-locally.md).

## Documentation

Start at [`docs/README.md`](docs/README.md) — it indexes architecture, backend,
frontend, and operations documents, and records the conventions and maintenance
rules for keeping them in sync with the code.

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE).
Copyright © 2025 Thái Văn Lâm.
