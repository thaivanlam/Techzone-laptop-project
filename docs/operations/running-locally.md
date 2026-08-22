# Running Locally

Two supported modes: **full Docker** (everything in containers) and **hybrid
dev** (infrastructure in Docker, business services from the IDE). The mode is
selected by two variables in `backend/.env`.

Related documents: [../backend/overview.md](../backend/overview.md) ·
[../frontend/overview.md](../frontend/overview.md)

---

## Prerequisites

| Tool | Needed for |
|---|---|
| Docker + Docker Compose | Both modes |
| JDK 21 + Maven 3.9+ | Hybrid dev mode (running services outside Docker) |
| Node.js >= 20.19.0 | The frontend, in both modes |
| Stripe test secret key | Order Service payments |
| Gmail app password | Notification Service email |

Clone with submodules:

```bash
git clone --recurse-submodules <superproject-url>
# or, in an existing clone:
git submodule update --init --recursive
```

---

## Configuration — `backend/.env`

Copy the template and fill in the secrets:

```bash
cd backend
cp .env.example .env
```

| Variable | Values | Meaning |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `dev` \| `prod` | Which Config Server profile the services load (`<service>-<profile>.yml`). `dev` points at `localhost`; `prod` points at Docker network hostnames. |
| `COMPOSE_PROFILES` | empty \| `prod` | Which containers Compose starts. Empty starts **infrastructure only** (MySQL, RabbitMQ, config-server, discovery-service); `prod` starts the whole stack. |
| `STRIPE_SECRET_KEY` | `sk_test_...` | Required by Order Service for payments |
| `MAIL_PASSWORD` | Gmail app password | Required by Notification Service |
| `FRONTEND_URL` | default `http://localhost:5173` | CORS origin and Stripe redirect target |
| `IMAGE_BASE_URL` | default `http://localhost:8080/product-manager/images` | Base URL Product Service returns for product images |

The two profile variables must agree. Setting `COMPOSE_PROFILES=prod` while
`SPRING_PROFILES_ACTIVE=dev` starts containers that try to reach `localhost`
inside their own network and will fail to find MySQL, RabbitMQ, or Eureka.

---

## Mode 1 — Full Docker

With `SPRING_PROFILES_ACTIVE=prod` and `COMPOSE_PROFILES=prod` (the values in
`.env.example`):

```bash
cd backend
docker-compose up --build
```

Compose brings services up in dependency order using health checks:
MySQL and RabbitMQ → Config Server → Discovery Service → API Gateway → the four
business services.

Then start the frontend:

```bash
cd frontend
npm install
npm run dev
```

---

## Mode 2 — Hybrid Dev

Leave `COMPOSE_PROFILES` empty and set `SPRING_PROFILES_ACTIVE=dev`. Compose
then starts infrastructure only, and business services run from the IDE or
Maven against `localhost`.

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
| A service exits at startup with a config error | Config Server not healthy yet, or `CONFIG_SERVER_URL` unreachable from the container |
| Gateway returns 503 for a route | The target service has not registered with Eureka yet — check http://localhost:8761 |
| Login succeeds but later calls return 401 | JWT expired (~50 minutes) and there is no refresh; sign in again |
| CORS errors in the browser | `FRONTEND_URL` does not match the origin the SPA is served from |
| Order placement fails at checkout | Product Service is down — there is no circuit breaker, so the call fails hard |
| No confirmation or welcome email | RabbitMQ unreachable, or `MAIL_PASSWORD` is not a valid Gmail app password |
| Schema not created | The JDBC URLs rely on `createDatabaseIfNotExist=true`; confirm MySQL is healthy and credentials are correct |
