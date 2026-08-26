# VS Code Debug Setup for Hybrid Dev (Mode 3)

How to run the five business services (`user-service`, `product-service`,
`order-service`, `notification-service`, `api-gateway`) straight from VS Code
with a working debugger, while Docker supplies only the infrastructure
(MySQL, RabbitMQ, Config Server, Discovery Service). This is Mode 3 in
[operations/running-locally.md](../operations/running-locally.md#mode-3--hybrid-dev);
this document is the IDE-specific half of it.

`.vscode/` is excluded by the root `.gitignore`, so `settings.json` and
`launch.json` are per-machine — this page is what a new machine copies from.

---

## Prerequisites

| Tool | Needed for |
|---|---|
| VS Code extension `vscjava.vscode-java-pack` (Extension Pack for Java) | Building and debugging the Maven modules |
| VS Code extension `vscjava.vscode-spring-boot-dashboard` | One-click run/debug per Spring Boot module, without hand-written launch configs |
| Docker Desktop, running | The infra containers (Mode 3 still uses Compose for these) |
| A JDK that can target Java 21, and one that can target Java 17 | See [Step 3](#step-3--map-jdk-runtimes) — `notification-service` targets 17, the other four target 21 |

---

## Step 1 — Set the env files

Copy the Mode 3 templates from [`env/`](../../env/) at the repo root instead
of hand-editing `.env.example`:

```bash
cp env/mode3-hybrid-dev.backend.env backend/.env
cp env/mode3-hybrid-dev.frontend.env frontend/.env
```

This sets `SPRING_PROFILES_ACTIVE=dev` and empties `COMPOSE_PROFILES` in
`backend/.env`, and points the frontend at `http://localhost:8080` in
`frontend/.env`.

## Step 2 — Start the infra containers

```bash
cd backend
docker-compose up -d
docker-compose ps
```

Wait until `mysql`, `rabbitmq`, `config-server` and `discovery-service` all
report `healthy`.

If this errors with a container name conflict, the root (Mode 1) Compose
project is still around from a previous run — the two projects share fixed
container names and cannot coexist (see
[docker-setup.md](../operations/docker-setup.md#the-two-projects-are-mutually-exclusive)).
Run `docker compose down` from the repo root first, then retry.

## Step 3 — Free port 3306, if needed

The `*-dev.yml` files in
[`backend/config-server/src/main/resources/config/`](../../backend/config-server/src/main/resources/config/)
hardcode `jdbc:mysql://localhost:3306/...` — they do not read `MYSQL_PORT`.
If a native `mysqld` already listens on 3306 on the host, the `mysql`
container above fails to bind that port. The `MYSQL_PORT` override that helps
in Mode 1 does not apply here; stop the native service instead. On Windows,
from an elevated PowerShell:

```powershell
Stop-Service -Name MySQL80
```

(The service name may differ — `Get-Service -Name "MySQL*"` lists what is
installed. Restart it later with `Start-Service -Name MySQL80` once you are
done with hybrid dev.)

## Step 4 — Map JDK runtimes

Four modules declare `<java.version>21</java.version>`; `notification-service`
declares `17` (see [developer-guide.md §1](developer-guide.md#1-one-time-setup)).
If you do not have the exact JDK 21 build installed, a newer JDK can still
compile and run code targeting release 21 — point `JavaSE-21` at it. Add to
your own `.vscode/settings.json`:

```json
{
  "java.configuration.runtimes": [
    { "name": "JavaSE-17", "path": "<path to a JDK 17 install>" },
    { "name": "JavaSE-21", "path": "<path to a JDK >= 21 install>" }
  ]
}
```

## Step 5 — Add the launch configurations

Create `.vscode/launch.json` with one configuration per service, each on the
`dev` Spring profile, plus a compound to start all five together. Every
configuration sets `cwd` explicitly to `${workspaceFolder}/backend` —
`${workspaceFolder}` here is the **superproject root** (this repo's top-level
folder, the one containing `backend/` and `frontend/` as subfolders), not
`backend/` itself. Without that `cwd`, a Java debug config with no `cwd`
launches with the superproject root as its working directory, and
`product-service` cannot find its image folder: `ImagePathUtils` only knows
how to recover when the process starts from `backend/` (one level above
`product-service/`), not from the superproject root (two levels above). The
symptom is every product image 404ing while the catalogue itself loads fine:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "java",
      "name": "user-service (dev)",
      "request": "launch",
      "mainClass": "com.ecommerce.user_service.UserServiceApplication",
      "projectName": "user-service",
      "cwd": "${workspaceFolder}/backend",
      "vmArgs": "-Dspring.profiles.active=dev"
    },
    {
      "type": "java",
      "name": "product-service (dev)",
      "request": "launch",
      "mainClass": "com.ecommerce.product_service.ProductServiceApplication",
      "projectName": "product-service",
      "cwd": "${workspaceFolder}/backend",
      "vmArgs": "-Dspring.profiles.active=dev"
    },
    {
      "type": "java",
      "name": "order-service (dev)",
      "request": "launch",
      "mainClass": "com.ecommerce.order_service.OrderServiceApplication",
      "projectName": "order-service",
      "cwd": "${workspaceFolder}/backend",
      "vmArgs": "-Dspring.profiles.active=dev"
    },
    {
      "type": "java",
      "name": "notification-service (dev)",
      "request": "launch",
      "mainClass": "vn.vti.dtn2504.notificationservice.NotificationServiceApplication",
      "projectName": "notification-service",
      "cwd": "${workspaceFolder}/backend",
      "vmArgs": "-Dspring.profiles.active=dev"
    },
    {
      "type": "java",
      "name": "api-gateway (dev)",
      "request": "launch",
      "mainClass": "com.ecommerce.api_gateway.ApiGatewayApplication",
      "projectName": "api-gateway",
      "cwd": "${workspaceFolder}/backend",
      "vmArgs": "-Dspring.profiles.active=dev"
    }
  ],
  "compounds": [
    {
      "name": "All business services (dev)",
      "configurations": [
        "user-service (dev)",
        "product-service (dev)",
        "order-service (dev)",
        "notification-service (dev)",
        "api-gateway (dev)"
      ],
      "stopAll": true
    }
  ]
}
```

`config-server` and `discovery-service` are deliberately left out — they run
in Docker in this mode.

Only `product-service` actually reads from disk relative to its working
directory (product images); the other four services get `cwd` for
consistency, so none of them silently depends on wherever VS Code happens to
default to.

## Step 6 — Run

Open **Run and Debug** (`Ctrl+Shift+D`), pick a configuration — or the "All
business services (dev)" compound — from the dropdown, and press `F5`.
Alternatively, the **Spring Boot Dashboard** panel lists every Maven module
in the workspace with its own ▶ / 🐞 buttons.

## Step 7 — Frontend

```bash
cd frontend
npm install
npm run dev
```

## Step 8 — Seed the catalogue

`dev` uses its own per-service database
(`laptop_ecommerce_graduation_project_product_service`, etc. — see
[running-locally.md](../operations/running-locally.md#mode-3--hybrid-dev)),
not the `ecommerce_product` schema the demo seeder targets by default, so a
fresh Mode 3 stack has zero products even with the `seed` profile on. Point
the same seeder at the `dev` schemas instead, from `backend/`, once
`product-service` has started at least once (it needs to have created its
tables):

```bash
docker compose --profile seed run --rm \
  -e PRODUCT_DB=laptop_ecommerce_graduation_project_product_service \
  -e USER_DB=laptop_ecommerce_graduation_project_user_service \
  db-seed
```

Full mechanics — what this loads, the `product_seq` id-collision gotcha, how
to reset and re-seed — are in
[database-seeding.md](../operations/database-seeding.md#seeding-under-the-dev-profile-mode-3).
Safe to re-run: it skips itself once the catalogue holds any product.

## Step 9 — Verify

```bash
curl -s "http://localhost:8080/product-manager/api/public/products?pageSize=1"
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" \
  "http://localhost:8080/product-manager/images/seed/asus-rog-strix-g16.jpg"
```

Expect a `200` with one product, and `200 image/jpeg` for the image. A `200`
with an empty product list means Step 8 has not run yet; a `404` on the image
with products present means Step 5's `cwd` did not take effect — restart the
`product-service (dev)` debug session (stopping and pressing `F5` again isn't
enough to pick up a `launch.json` edit if VS Code cached the old config; use
the Restart button, or fully stop then start).

---

## Endpoints

Same as any other mode — see
[running-locally.md#endpoints](../operations/running-locally.md#endpoints).

## Troubleshooting

General Compose issues (port conflicts, health checks, container name
collisions) are covered in
[troubleshooting-runbook.md](../operations/troubleshooting-runbook.md) and
the troubleshooting table in
[running-locally.md](../operations/running-locally.md#troubleshooting). Issues
specific to this setup:

| Symptom | Cause |
|---|---|
| `mysql` container fails to start / `bind: address already in use` on 3306 | A native `mysqld` holds 3306 — see [Step 3](#step-3--free-port-3306-if-needed) |
| A service fails to start from VS Code with an "unsupported class file version" or similar JDK error | `java.configuration.runtimes` does not have an entry covering that module's `java.version` — see [Step 4](#step-4--map-jdk-runtimes) |
| Products load but every product image 404s | `product-service (dev)` launched without `cwd` set to `${workspaceFolder}/backend` — see [Step 5](#step-5--add-the-launch-configurations) |
| The shop is empty, `db-seed` never ran or logs "already holds 0" nothing | `dev` uses a different schema than the seeder's default — see [Step 8](#step-8--seed-the-catalogue) |
