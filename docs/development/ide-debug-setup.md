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
`dev` Spring profile, plus a compound to start all five together:

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
      "vmArgs": "-Dspring.profiles.active=dev"
    },
    {
      "type": "java",
      "name": "product-service (dev)",
      "request": "launch",
      "mainClass": "com.ecommerce.product_service.ProductServiceApplication",
      "projectName": "product-service",
      "vmArgs": "-Dspring.profiles.active=dev"
    },
    {
      "type": "java",
      "name": "order-service (dev)",
      "request": "launch",
      "mainClass": "com.ecommerce.order_service.OrderServiceApplication",
      "projectName": "order-service",
      "vmArgs": "-Dspring.profiles.active=dev"
    },
    {
      "type": "java",
      "name": "notification-service (dev)",
      "request": "launch",
      "mainClass": "vn.vti.dtn2504.notificationservice.NotificationServiceApplication",
      "projectName": "notification-service",
      "vmArgs": "-Dspring.profiles.active=dev"
    },
    {
      "type": "java",
      "name": "api-gateway (dev)",
      "request": "launch",
      "mainClass": "com.ecommerce.api_gateway.ApiGatewayApplication",
      "projectName": "api-gateway",
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

---

## Endpoints

Same as any other mode — see
[running-locally.md#endpoints](../operations/running-locally.md#endpoints).

## Troubleshooting

General Compose issues (port conflicts, health checks, container name
collisions) are covered in
[troubleshooting-runbook.md](../operations/troubleshooting-runbook.md) and
the troubleshooting table in
[running-locally.md](../operations/running-locally.md#troubleshooting). Two
issues specific to this setup:

| Symptom | Cause |
|---|---|
| `mysql` container fails to start / `bind: address already in use` on 3306 | A native `mysqld` holds 3306 — see [Step 3](#step-3--free-port-3306-if-needed) |
| A service fails to start from VS Code with an "unsupported class file version" or similar JDK error | `java.configuration.runtimes` does not have an entry covering that module's `java.version` — see [Step 4](#step-4--map-jdk-runtimes) |
