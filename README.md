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

cp .env.example .env      # then fill in STRIPE_SECRET_KEY and MAIL_PASSWORD
docker compose up --build # frontend on http://localhost:5173
```

[`docker-compose.yml`](docker-compose.yml) runs the whole platform — the backend
microservices (included from [`backend/docker-compose.yml`](backend/docker-compose.yml))
and the frontend container — on one Docker network. Requires Docker Compose
v2.20+.

Startup modes, environment variables, and seeded accounts:
[`docs/operations/running-locally.md`](docs/operations/running-locally.md).
Container topology and image details:
[`docs/operations/docker-setup.md`](docs/operations/docker-setup.md).

## Documentation

Start at [`docs/README.md`](docs/README.md) — it indexes architecture, backend,
frontend, and operations documents, and records the conventions and maintenance
rules for keeping them in sync with the code.

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE).
Copyright © 2025 Thái Văn Lâm.
