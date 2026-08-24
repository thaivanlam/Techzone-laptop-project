# Running Locally

Three supported modes:

| Mode | What runs in Docker | Compose file |
|---|---|---|
| **1 — Full stack** | Backend **and** frontend | [`docker-compose.yml`](../../docker-compose.yml) (repo root) |
| **2 — Backend in Docker** | Backend only; the SPA runs on the Vite dev server | [`backend/docker-compose.yml`](../../backend/docker-compose.yml) |
| **3 — Hybrid dev** | Infrastructure only; business services run from the IDE | [`backend/docker-compose.yml`](../../backend/docker-compose.yml) |

Container topology, image internals, and the nginx proxy are documented in
[docker-setup.md](docker-setup.md).

Related documents: [../backend/overview.md](../backend/overview.md) ·
[../frontend/overview.md](../frontend/overview.md)

---

## Prerequisites

| Tool | Needed for |
|---|---|
| Docker + Docker Compose v2.20+ | All modes (`include` in the root file needs 2.20) |
| JDK 21 + Maven 3.9+ | Mode 3 (running services outside Docker) |
| Node.js >= 20.19.0 | Modes 2 and 3 (Vite dev server) |
| Stripe test secret key | Order Service payments |
| Gmail app password | Notification Service email |

Clone with submodules:

```bash
git clone --recurse-submodules <superproject-url>
# or, in an existing clone:
git submodule update --init --recursive
```

---

## Mode 1 — Full Stack in Docker

Everything, frontend included, runs as containers on one Docker network.

```bash
cp .env.example .env      # in the repo root, then fill in the secrets
docker compose up --build
```

Open http://localhost:5173. The SPA is served by nginx, which reverse-proxies
`/user-manager`, `/product-manager`, and `/order-manager` to `api-gateway:8080`
inside the Docker network — the browser only ever talks to one origin, so no
CORS configuration is involved.

The first build compiles seven Maven projects and installs the npm
dependencies, so expect several minutes. Later runs are cached.

### Root `.env`

`docker-compose.yml` reads this file for both the frontend and — through
`include` — every backend service, so it is the single configuration point.

| Variable | Default in `.env.example` | Meaning |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `prod` | Which Config Server profile the services load (`<service>-<profile>.yml`). `dev` points at `localhost`; `prod` points at Docker network hostnames. |
| `COMPOSE_PROFILES` | `prod` | Which containers Compose starts. `prod` starts the whole stack; empty starts **infrastructure only**. |
| `STRIPE_SECRET_KEY` | — | Required by Order Service for payments |
| `MAIL_PASSWORD` | — | Gmail app password, required by Notification Service |
| `VITE_STRIPE_PUBLISHABLE_KEY` | — | Stripe key baked into the frontend bundle **at build time** |
| `FRONTEND_PORT` | `5173` | Host port the frontend container publishes |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin and Stripe redirect target; must match `FRONTEND_PORT` |
| `VITE_BACK_END_URL` | empty | Axios base URL. Empty ⇒ same origin ⇒ nginx proxies. Set it to `http://localhost:8080` to have the browser call the gateway directly instead. **Build time.** |
| `API_GATEWAY_URL` | `http://api-gateway:8080` | Where the frontend container forwards proxied calls. **Run time** — no rebuild needed. |
| `IMAGE_BASE_URL` | `http://localhost:5173/product-manager/images` | Base URL Product Service returns for product images; routed through the frontend origin |
| `MYSQL_PORT` | `3306` | Host port for the MySQL container. Raise it (for example `3307`) when a native MySQL already holds 3306 — services always use `mysql:3306` inside the network. |

The two profile variables must agree. Setting `COMPOSE_PROFILES=prod` while
`SPRING_PROFILES_ACTIVE=dev` starts containers that try to reach `localhost`
inside their own network and will fail to find MySQL, RabbitMQ, or Eureka.

Values marked **build time** are inlined into the JavaScript bundle by Vite.
After changing one, rebuild:

```bash
docker compose build frontend && docker compose up -d frontend
```

> Do not run the root and the `backend/` Compose projects at the same time. They
> share fixed container names and would collide, and they use separate MySQL
> volumes. See [docker-setup.md](docker-setup.md#the-two-projects-are-mutually-exclusive).

---

## Mode 2 — Backend in Docker, Frontend on Vite

Useful while working on the SPA: hot module reload, no image rebuild.

```bash
cd backend
cp .env.example .env       # SPRING_PROFILES_ACTIVE=prod, COMPOSE_PROFILES=prod
docker-compose up --build
```

Then, in another terminal:

```bash
cd frontend
cp .env.example .env       # VITE_BACK_END_URL=http://localhost:8080
npm install
npm run dev
```

Here the browser calls the gateway on port 8080 directly, so CORS **is** in
play: `FRONTEND_URL` in `backend/.env` must match the origin Vite serves
(`http://localhost:5173`).

---

## Mode 3 — Hybrid Dev

Leave `COMPOSE_PROFILES` empty and set `SPRING_PROFILES_ACTIVE=dev` in
`backend/.env`. Compose then starts infrastructure only, and business services
run from the IDE or Maven against `localhost`.

```bash
cd backend
docker-compose up -d           # mysql, rabbitmq, config-server, discovery-service

# then, per service, in its own terminal:
cd user-service && ./mvnw spring-boot:run
cd product-service && ./mvnw spring-boot:run
cd order-service && ./mvnw spring-boot:run
cd notification-service && ./mvnw spring-boot:run
cd api-gateway && ./mvnw spring-boot:run
```

Start Config Server and Discovery Service first if running them outside Docker
too — every business service resolves configuration at startup and registers
with Eureka.

In `dev`, each service uses its own MySQL schema (for example
`laptop_ecommerce_graduation_project_user_service`) rather than the shared
`ecommerce` database used in `prod`.

The frontend runs on the Vite dev server exactly as in Mode 2.

---

## Endpoints

| Surface | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API Gateway | http://localhost:8080 |
| Eureka dashboard | http://localhost:8761 |
| RabbitMQ management | http://localhost:15672 (guest / guest) |
| Config Server | http://localhost:8888 |
| MySQL | localhost:3306 (root / root) |
| Swagger UI (dev only) | http://localhost:8080/user-manager/swagger-ui.html |

Swagger is disabled under the `prod` profile
(`springdoc.api-docs.enabled: false`).

---

## Seeded Users

Created on first startup by each service's `CommandLineRunner` if they do not
already exist.

| Username | Email | Password | Roles |
|---|---|---|---|
| `admin` | admin@example.com | `adminPass` | ADMIN + SELLER + USER |
| `seller1` | seller1@example.com | `password2` | SELLER |
| `user1` | user1@example.com | `password1` | USER |
| `user2` | user2@example.com | `password1` | USER |

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `include` is not a valid compose key | Docker Compose older than v2.20 — upgrade, or use Mode 2 |
| `bind: address already in use` on 3306 | A native MySQL is running on the host; set `MYSQL_PORT` to a free port such as `3307` |
| A container stays `health: starting` forever | Check `docker inspect -f '{{json .State.Health}}' <name>` — an `executable file not found` output means the probe binary is missing from the image |
| Container name conflict on `up` | The `backend/` Compose project is still running; `cd backend && docker-compose down` first |
| Frontend loads but every API call is `502` | The gateway is not up yet, or `API_GATEWAY_URL` points somewhere unreachable from the frontend container |
| API calls go to `undefined/user-manager/...` | The bundle was built without `VITE_BACK_END_URL` defined; rebuild the frontend image |
| Stripe redirect lands on the wrong port | `FRONTEND_URL` was changed without rebuilding the frontend image (it is baked in as `VITE_FRONTEND_URL`) |
| A service exits at startup with a config error | Config Server not healthy yet, or `CONFIG_SERVER_URL` unreachable from the container |
| Gateway returns 503 for a route | The target service has not registered with Eureka yet — check http://localhost:8761 |
| Login succeeds but later calls return 401 | JWT expired (~50 minutes) and there is no refresh; sign in again |
| CORS errors in the browser | Only possible in Modes 2 and 3: `FRONTEND_URL` does not match the origin the SPA is served from |
| Product images 404 | `IMAGE_BASE_URL` points at an origin that is not published, or was left at port 8080 while the gateway port changed |
| Order placement fails at checkout | Product Service is down — there is no circuit breaker, so the call fails hard |
| No confirmation or welcome email | RabbitMQ unreachable, or `MAIL_PASSWORD` is not a valid Gmail app password |
| Schema not created | The JDBC URLs rely on `createDatabaseIfNotExist=true`; confirm MySQL is healthy and credentials are correct |
