# Configuration Reference

Every knob the platform has, in one place: what sets it, what reads it, when it
takes effect, and what breaks if it is wrong.

Startup procedures are in [running-locally.md](running-locally.md); container
topology in [docker-setup.md](docker-setup.md). This document is the lookup
table behind both.

---

## Table of Contents

1. [Where Configuration Comes From](#1-where-configuration-comes-from)
2. [Root `.env` — the Full Stack](#2-root-env--the-full-stack)
3. [`backend/.env` — Backend Only](#3-backendenv--backend-only)
4. [Frontend `.env` — Build-Time Values](#4-frontend-env--build-time-values)
5. [Config Server Properties, Service by Service](#5-config-server-properties-service-by-service)
6. [API Gateway Configuration](#6-api-gateway-configuration)
7. [Profiles: `dev` versus `prod`](#7-profiles-dev-versus-prod)
8. [Secrets](#8-secrets)
9. [Ports](#9-ports)
10. [When a Change Takes Effect](#10-when-a-change-takes-effect)
11. [Misconfiguration Symptoms](#11-misconfiguration-symptoms)

---

## 1. Where Configuration Comes From

Four sources, resolved in this order for a backend service:

```
1. Environment variable          (docker-compose.yml → .env)
        ↓ overrides
2. Profile file from Config Server   <service>-<profile>.yml
        ↓ overrides
3. Shared file from Config Server    <service>.yml
        ↓ overrides
4. The service's own application.yaml (bootstrap: name, config-server URL)
```

Config Server runs the **native** profile, serving files from its own classpath
at `backend/config-server/src/main/resources/config/`. They are baked into its
image, so changing one means rebuilding config-server — the trade-off is
recorded in
[../architecture/decisions/0006-config-server-native-profile.md](../architecture/decisions/0006-config-server-native-profile.md).

The frontend is different in kind: `VITE_*` values are **inlined into the
JavaScript bundle at build time** and are not configuration at run time at all.
The one exception is `API_GATEWAY_URL`, which nginx reads when the container
starts.

---

## 2. Root `.env` — the Full Stack

Read by [`docker-compose.yml`](../../docker-compose.yml) at the repository root,
which passes values to the frontend and — through Compose `include` — to every
backend service. Copy `.env.example` and fill it in.

| Variable | Default | Read by | Effect |
|---|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `prod` | every backend service | Which Config Server profile loads. `dev` → localhost hostnames; `prod` → Docker network names |
| `COMPOSE_PROFILES` | `prod` | Compose | Which containers start. Empty → infrastructure only; `prod` → everything; `prod,seed` → also the one-shot catalogue seeder |
| `STRIPE_SECRET_KEY` | — | order-service | Stripe API calls. Without it, checkout fails |
| `MAIL_PASSWORD` | — | notification-service | Gmail app password. Without it, no email is sent |
| `VITE_STRIPE_PUBLISHABLE_KEY` | — | frontend **build** | Stripe Elements in the browser |
| `FRONTEND_PORT` | `5173` | Compose | Host port the SPA is published on |
| `FRONTEND_URL` | `http://localhost:5173` | gateway CORS, product/order/user services, Stripe return URL | Must match `FRONTEND_PORT` |
| `VITE_BACK_END_URL` | *(empty)* | frontend **build** | Axios base URL. Empty → same origin → nginx proxies. `http://localhost:8080` → the browser calls the gateway directly, and CORS applies |
| `API_GATEWAY_URL` | `http://api-gateway:8080` | frontend nginx, at container start | Where proxied `/​*-manager` calls go |
| `IMAGE_BASE_URL` | `http://localhost:5173/product-manager/images` | product-service | Base URL returned with every product image |
| `MYSQL_PORT` | `3306` | Compose | Host binding for MySQL. Raise it (e.g. `3307`) when a native MySQL holds 3306 — inside the network services always use `mysql:3306` |

**`SPRING_PROFILES_ACTIVE` and `COMPOSE_PROFILES` must agree.** `prod` containers
loading the `dev` profile look for MySQL, RabbitMQ and Eureka on `localhost`
inside their own container, find nothing, and fail at boot.

---

## 3. `backend/.env` — Backend Only

Used in Mode 2 and Mode 3, where the SPA runs on the Vite dev server and only the
backend is containerised. It carries the same four keys with the same meanings:
`SPRING_PROFILES_ACTIVE`, `COMPOSE_PROFILES`, `STRIPE_SECRET_KEY`,
`MAIL_PASSWORD`.

> The root project and the `backend/` project are **mutually exclusive** — they
> share fixed container names and use separate MySQL volumes. Bring one down
> before starting the other.

---

## 4. Frontend `.env` — Build-Time Values

Copy `frontend/.env.example` to `frontend/.env` for Modes 2 and 3.

| Variable | Typical value | Effect |
|---|---|---|
| `VITE_BACK_END_URL` | `http://localhost:8080` | Axios `baseURL`. Empty means same-origin |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` | Stripe Elements |
| `VITE_FRONTEND_URL` | `http://localhost:5173` | Where Stripe returns the buyer after payment |

All three are inlined by Vite. In Docker they are **build arguments**: a change
needs `docker compose build frontend`, not a restart. A bundle built without
`VITE_BACK_END_URL` sends requests to `undefined/user-manager/...`, which is the
signature of that mistake.

---

## 5. Config Server Properties, Service by Service

Files live in `backend/config-server/src/main/resources/config/`. Each service
gets a shared file plus a `-dev` and a `-prod` overlay.

### Shared by user, product and order service

| Key | Value | Meaning |
|---|---|---|
| `spring.jpa.hibernate.ddl-auto` | `update` | Hibernate owns the schema; there are no migrations |
| `spring.app.jwtSecret` | *(committed literal)* | HMAC-SHA signing secret, shared by all validators — see [§8](#8-secrets) |
| `spring.app.jwtExpirationMs` | `3000000` | Token lifetime, about 50 minutes |
| `spring.ecom.app.jwtCookieName` | `springBootEcom` | Cookie the token travels in |
| `springdoc.api-docs.enabled` | `true` shared, `false` in `-prod` | Swagger is a development-only surface |

### user-service

| Key | `dev` | `prod` |
|---|---|---|
| `server.port` | `8082` | `8082` |
| `spring.datasource.url` | `jdbc:mysql://localhost:3306/laptop_ecommerce_graduation_project_user_service` | `jdbc:mysql://mysql:3306/ecommerce` |
| `spring.rabbitmq.host` | `localhost` | `rabbitmq` |
| `frontend.url` | `http://localhost:5173` | `${FRONTEND_URL}` |
| `eureka.client.serviceUrl.defaultZone` | `http://localhost:8761/eureka/` | `http://discovery-service:8761/eureka/` |

### product-service

| Key | `dev` | `prod` |
|---|---|---|
| `server.port` | `8081` | `8081` |
| `spring.datasource.url` | `…/laptop_ecommerce_graduation_project_product_service` | `jdbc:mysql://mysql:3306/ecommerce_product` |
| `image.base.url` | `http://localhost:8080/product-manager/images` | `${IMAGE_BASE_URL:…}` |
| `project.image` | `images/` (shared) | same — the directory uploads are written to |
| `spring.servlet.multipart.max-file-size` | `50MB` (shared) | same |
| `spring.servlet.multipart.max-request-size` | `50MB` (shared) | same |

`project.image` is resolved by `ImagePathUtils`: an absolute path is used as
given, a relative one is anchored to the working directory.

### order-service

| Key | `dev` | `prod` |
|---|---|---|
| `server.port` | `8083` | `8083` |
| `spring.datasource.url` | `…/laptop_ecommerce_graduation_project_order_service` | `jdbc:mysql://mysql:3306/ecommerce_order` |
| `spring.rabbitmq.host` | `localhost` | `rabbitmq` |
| `product.service.base-url` | `http://localhost:8081/api` | `http://product-service:8081/api` |
| `stripe.secret.key` | `${STRIPE_SECRET_KEY}` (shared) | same |
| `frontend.url` | `http://localhost:5173` | `${FRONTEND_URL}` |

`product.service.base-url` is the only place one business service names another.
It is a direct hostname, not a `lb://` URI — order-service does not resolve
through Eureka.

### notification-service

| Key | Value | Notes |
|---|---|---|
| `server.port` | `8084` | Not exposed through the gateway |
| `spring.mail.host` / `port` | `smtp.gmail.com` / `587` | STARTTLS |
| `spring.mail.username` | *(committed literal)* | The sending Gmail account |
| `spring.mail.password` | `${MAIL_PASSWORD}` | Gmail **app password**, never the account password |
| `spring.rabbitmq.host` | `localhost` / `rabbitmq` | Per profile |

### Messaging keys

Used by user-service and order-service to publish, and by notification-service
to consume. They must match on both sides or messages vanish silently.

| Key | Value |
|---|---|
| `queue.notification.queue` | `notification-queue` |
| `queue.notification.exchange` | `notification-exchange` |
| `queue.notification.routing-key` | `notification-routing-key` |

---

## 6. API Gateway Configuration

`backend/api-gateway/src/main/resources/application.yaml` — the gateway does not
take its routing from Config Server.

### Routes

| Route id | Predicate | Target | Filter |
|---|---|---|---|
| `user-manager` | `/user-manager/**` | `lb://USER-SERVICE` | `RewritePath` strips the prefix |
| `product-manager` | `/product-manager/**` | `lb://PRODUCT-SERVICE` | same |
| `order-manager` | `/order-manager/**` | `lb://ORDER-SERVICE` | same |
| `eureka-server`, `eureka-server-static` | `/eureka/**` | `${EUREKA_SERVER_URL}` | dashboard passthrough |

### `gateway.security.public-paths`

No token required:

```
/user-manager/api/auth/**          /product-manager/api/public/**
/user-manager/api/public/**        /product-manager/images/**
/order-manager/api/public/**       /order-manager/api/internal/**
/eureka/**                         /swagger-ui/**  and  **/v3/api-docs/**
```

Two entries deserve a second look. `/user-manager/api/auth/**` also contains the
customer and seller administration endpoints, which is `SEC-02`. And
`/order-manager/api/internal/**` is public by rule — while
`/product-manager/api/internal/**` is *not* listed, so the stock API is
token-protected at the gateway and unprotected only on its own published port
(`SEC-10`).

### `gateway.security.role-mappings`

| Pattern | Required role |
|---|---|
| `/product-manager/api/admin/**` | `ROLE_ADMIN` |
| `/product-manager/api/seller/**` | `ROLE_SELLER` |
| `/user-manager/api/admin/**` | `ROLE_ADMIN` |
| `/order-manager/api/admin/**` | `ROLE_ADMIN` |
| `/order-manager/api/seller/**` | `ROLE_ADMIN` or `ROLE_SELLER` |

Anything neither public nor matched here needs a valid token and **no particular
role**. Patterns match on the segment after `/api`, which is why a controller
mapped with its scope in the wrong position escapes every rule — the mechanism
behind `SEC-06`, now closed. See
[../architecture/security-model.md](../architecture/security-model.md).

### CORS

`allowedOrigins` are `http://localhost:3000`, `http://localhost:5173` and
`${FRONTEND_URL}`; all common methods; `allowCredentials: true`, which is
required for the cookie to travel. CORS matters only in Modes 2 and 3 — in the
full-Docker stack the SPA and the API share an origin.

---

## 7. Profiles: `dev` versus `prod`

| Aspect | `dev` | `prod` |
|---|---|---|
| Hostnames | `localhost` everywhere | Docker service names |
| Databases | One schema per service, long names | Three shared databases: `ecommerce`, `ecommerce_product`, `ecommerce_order` |
| Swagger | Enabled | Disabled |
| Eureka | `prefer-ip-address: true` | Default |
| Intended use | Services from the IDE, infrastructure in Docker | Everything in Docker |

Switching profile switches the database, so data entered under `dev` is not
visible under `prod`. That is a frequent source of "my products disappeared".

---

## 8. Secrets

| Secret | Supplied by | Currently |
|---|---|---|
| `STRIPE_SECRET_KEY` | environment | ✅ from `.env`, never committed |
| `MAIL_PASSWORD` | environment | ✅ from `.env`, never committed |
| `VITE_STRIPE_PUBLISHABLE_KEY` | build argument | ✅ from `.env` (publishable keys are not secret) |
| `spring.app.jwtSecret` | Config Server | ❌ **committed as a literal** in four config files — `SEC-04` |
| MySQL `root` / `root` | Config Server | ❌ committed; acceptable only because the database is not published beyond the host |
| `spring.mail.username` | Config Server | ❌ committed |

`SEC-04` is the one that matters: anyone with read access to the repository can
forge a token for any user and any role. Fixing it means moving the secret to an
environment variable in all four files, rotating it, and treating every existing
token as invalid.

**Rules when working here.** Never write a secret's value into a document, a
commit message, or the dev log — name the variable instead. The redaction rules
are in [../dev-log/README.md](../dev-log/README.md).

---

## 9. Ports

| Port | Service | Published to the host | Notes |
|---|---|---|---|
| 5173 | Frontend (nginx or Vite) | yes | `FRONTEND_PORT` |
| 8080 | API Gateway | yes | The only API surface a browser should use |
| 8081 | Product Service | yes | Publishing it is what makes `SEC-10` reachable |
| 8082 | User Service | yes | |
| 8083 | Order Service | yes | |
| 8084 | Notification Service | yes | Not behind the gateway — `SEC-11` |
| 8761 | Discovery Service (Eureka) | yes | Dashboard is public and writable — `SEC-12` |
| 8888 | Config Server | yes | Serves every service's configuration, secrets included |
| 3306 | MySQL | `MYSQL_PORT` | root/root |
| 5672 / 15672 | RabbitMQ / management UI | yes | guest/guest |

For a demonstration on a laptop this is convenient. On any shared network, only
5173 and 8080 should be published; the rest belong inside the Docker network.

---

## 10. When a Change Takes Effect

| Change | What is needed |
|---|---|
| `API_GATEWAY_URL` | `docker compose up -d frontend` — read at container start |
| Any `VITE_*` value | `docker compose build frontend && docker compose up -d frontend` |
| `STRIPE_SECRET_KEY`, `MAIL_PASSWORD` | Restart the consuming service |
| `FRONTEND_URL`, `IMAGE_BASE_URL` | Restart the consuming services; rebuild the frontend if the port changed |
| A file under `config-server/…/config/` | **Rebuild config-server**, then restart the services that read it |
| `MYSQL_PORT` | `docker compose up -d mysql` — host binding only |
| `SPRING_PROFILES_ACTIVE` | Restart everything; note the database changes with it |
| A gateway route or security rule | Rebuild and restart api-gateway |
| `backend/init-db/*.sql` | Only ever runs on a **fresh** volume — `docker compose down -v` first |

---

## 11. Misconfiguration Symptoms

| Symptom | Almost always |
|---|---|
| API calls go to `undefined/user-manager/...` | The bundle was built without `VITE_BACK_END_URL` |
| Every API call is `502` | The gateway is not up, or `API_GATEWAY_URL` is unreachable from the frontend container |
| Gateway answers `503` for one prefix | The target service has not registered with Eureka yet — check http://localhost:8761 |
| Services cannot find MySQL / RabbitMQ / Eureka | `SPRING_PROFILES_ACTIVE=dev` with containers on the Docker network |
| `bind: address already in use` on 3306 | A native MySQL holds the port — set `MYSQL_PORT=3307` |
| CORS errors in the browser | Only possible in Modes 2 and 3: `FRONTEND_URL` does not match the SPA's origin |
| The Stripe redirect lands on the wrong port | `FRONTEND_URL` changed without rebuilding the frontend image |
| Product images 404 | `IMAGE_BASE_URL` points at an origin that is not published |
| No email at all | `MAIL_PASSWORD` is not a valid Gmail **app** password, or RabbitMQ is unreachable |
| A service exits at boot with a config error | Config Server was not healthy yet, or its URL is unreachable from the container |
| Products vanished after a restart | The profile changed, so the service is looking at a different database |

Recovery steps for each of these are in
[troubleshooting-runbook.md](troubleshooting-runbook.md).
