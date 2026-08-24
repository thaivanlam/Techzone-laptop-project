# Config Server — Architecture Documentation

**Module:** `backend/config-server`
**Port:** `8888`
**Stack:** Spring Boot 3.5.7 · Spring Cloud Config Server 2025.0.0 · Java 21

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [System Context](#2-system-context)
3. [Native Profile and Search Locations](#3-native-profile-and-search-locations)
4. [The Three-Tier Config Model](#4-the-three-tier-config-model)
5. [Per-Service Configuration Reference](#5-per-service-configuration-reference)
6. [Client Bootstrap Contract](#6-client-bootstrap-contract)
7. [Secrets and Environment Variables](#7-secrets-and-environment-variables)
8. [Configuration and Health](#8-configuration-and-health)
9. [Deployment & Dependencies](#9-deployment--dependencies)
10. [Design Notes & Known Trade-offs](#10-design-notes--known-trade-offs)
11. [Cross-References](#11-cross-references)

---

## 1. Service Overview

Config Server is the platform's centralized configuration source. Four services
— User, Product, Order, and Notification — fetch their settings from it at
startup instead of carrying full local `application.yaml` files.

The whole application is thirteen lines of Java: `@SpringBootApplication` plus
`@EnableConfigServer`. Everything that matters lives in
`src/main/resources/config/`.

### Responsibilities

| Responsibility | Mechanism |
|---|---|
| Serve per-service configuration | `@EnableConfigServer` over `classpath:/config` |
| Separate shared from profile-specific settings | `<service>.yml` + `<service>-{dev,prod}.yml` |
| Inject secrets at runtime | `${MAIL_PASSWORD}`, `${STRIPE_SECRET_KEY}` placeholders resolved on the client |
| Report readiness | Actuator `/actuator/health` with `show-details: always` |

### Who consumes it

| Service | Consumes Config Server? |
|---|---|
| user-service | Yes |
| product-service | Yes |
| order-service | Yes |
| notification-service | Yes |
| api-gateway | **No** — fully local `application.yaml` |
| discovery-service | **No** — fully local `application.yaml` |

Config Server is therefore the first thing that must be up in a cold start, and
it is the only service with no dependency of its own.

---

## 2. System Context

```
                     ┌──────────────────────────┐
                     │ Config Server  :8888     │
                     │  profile: native         │
                     │  classpath:/config       │
                     └───────────┬──────────────┘
   GET /{app}/{profile}          │
   e.g. /order-service/prod      │
        ┌────────────┬───────────┴───────┬──────────────┐
        ▼            ▼                   ▼              ▼
  user-service  product-service     order-service  notification-service
     :8082          :8081               :8083           :8084
```

Each client resolves the URL from `spring.config.import` at startup:

```
optional:configserver:${CONFIG_SERVER_URL:http://localhost:8888}
```

### External Dependencies

None. Config Server does not register with Eureka, does not talk to MySQL or
RabbitMQ, and does not read a remote git repository.

---

## 3. Native Profile and Search Locations

```yaml
spring:
  profiles:
    active: native
  cloud:
    config:
      server:
        native:
          search-locations: classpath:/config
```

The `native` profile makes Config Server read from the filesystem/classpath
rather than a git backend. Because the search location is `classpath:`,
configuration is packaged **inside the jar** at build time — changing a value
means rebuilding and redeploying the Config Server image. The trade-off is
recorded in
[../../architecture/decisions/0006-config-server-native-profile.md](../../architecture/decisions/0006-config-server-native-profile.md).

### Directory layout

```
config-server/src/main/resources/config/
├── user-service.yml            user-service-dev.yml            user-service-prod.yml
├── product-service.yml         product-service-dev.yml         product-service-prod.yml
├── order-service.yml           order-service-dev.yml           order-service-prod.yml
└── notification-service.yml    notification-service-dev.yml    notification-service-prod.yml
```

---

## 4. The Three-Tier Config Model

Every business service resolves its effective configuration from three layers,
highest precedence last:

| Tier | File | Contents |
|---|---|---|
| 1 — bootstrap | `<service>/src/main/resources/application.yaml` (in the service module) | `spring.application.name`, active profile, `spring.config.import`, and anything the service must know before it can call Config Server |
| 2 — shared | `config/<service>.yml` | Port, JWT settings, JPA settings, springdoc toggle — identical across environments |
| 3 — profile | `config/<service>-dev.yml` or `-prod.yml` | Datasource URL, RabbitMQ host, Eureka zone, frontend URL, inter-service base URLs |

The split is the reason a service's own `application.yaml` is only four to six
lines. For example, Order Service's local file is just:

```yaml
spring:
  application:
    name: order-service
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:dev}
  config:
    import: optional:configserver:${CONFIG_SERVER_URL:http://localhost:8888}

queue:
  notification:
    exchange: notification-exchange
    routing-key: notification-routing-key
```

The RabbitMQ exchange and routing key stay local because the publisher must know
them even if Config Server is unreachable (`optional:` means startup continues).

---

## 5. Per-Service Configuration Reference

### `user-service.yml` (shared)

| Key | Value |
|---|---|
| `spring.jpa.hibernate.ddl-auto` | `update` |
| `spring.app.jwtSecret` | shared HMAC secret literal |
| `spring.app.jwtExpirationMs` | `3000000` (50 minutes) |
| `spring.ecom.app.jwtCookieName` | `springBootEcom` |
| `server.port` | `8082` |
| `springdoc.api-docs.enabled` | `true` |

| Key | `-dev` | `-prod` |
|---|---|---|
| `spring.datasource.url` | `jdbc:mysql://localhost:3306/laptop_ecommerce_graduation_project_user_service` | `jdbc:mysql://mysql:3306/ecommerce` |
| `spring.rabbitmq.host` | `localhost` | `rabbitmq` |
| `frontend.url` | `http://localhost:5173` | `${FRONTEND_URL:http://localhost:5173}` |
| Eureka zone | `http://localhost:8761/eureka/` | `http://discovery-service:8761/eureka/` |
| `springdoc.api-docs.enabled` | (inherits `true`) | `false` |

### `product-service.yml` (shared)

| Key | Value |
|---|---|
| `spring.jpa.hibernate.ddl-auto` | `update` |
| `spring.app.jwtSecret` / `jwtExpirationMs` / cookie name | same shared values |
| `spring.servlet.multipart.max-file-size` / `max-request-size` | `50MB` / `50MB` |
| `project.image` | `images/` |
| `server.port` | `8081` |

| Key | `-dev` | `-prod` |
|---|---|---|
| `spring.datasource.url` | `.../laptop_ecommerce_graduation_project_product_service` | `jdbc:mysql://mysql:3306/ecommerce_product` |
| `image.base.url` | `http://localhost:8080/product-manager/images` | `${IMAGE_BASE_URL:...}` |
| `frontend.url` | `http://localhost:5173` | `${FRONTEND_URL:...}` |
| Eureka zone | localhost | `discovery-service` |

Product Service has **no** `spring.rabbitmq.*` — it neither publishes nor
consumes messages.

### `order-service.yml` (shared)

| Key | Value |
|---|---|
| `spring.jpa.hibernate.ddl-auto` | `update` |
| `spring.app.jwtSecret` / `jwtExpirationMs` / cookie name | same shared values |
| `server.port` | `8083` |
| `stripe.secret.key` | `${STRIPE_SECRET_KEY}` — **no default, required** |

| Key | `-dev` | `-prod` |
|---|---|---|
| `spring.datasource.url` | `.../laptop_ecommerce_graduation_project_order_service` | `jdbc:mysql://mysql:3306/ecommerce_order` |
| `spring.rabbitmq.host` | `localhost` | `rabbitmq` |
| `product.service.base-url` | `http://localhost:8081/api` | `http://product-service:8081/api` |
| `frontend.url` | `http://localhost:5173` | `${FRONTEND_URL:...}` |
| Eureka zone | localhost | `discovery-service` |

`product.service.base-url` is a direct host:port URL, not a `lb://` reference —
Order Service reaches Product Service without going through Eureka or the
gateway.

### `notification-service.yml` (shared)

| Key | Value |
|---|---|
| `spring.mail.host` / `port` | `smtp.gmail.com` / `587` |
| `spring.mail.username` | `thaivanlam373@gmail.com` |
| `spring.mail.password` | `${MAIL_PASSWORD}` — **no default, required** |
| `spring.mail.properties.mail.smtp.auth` | `true` |
| `spring.mail.properties.mail.smtp.starttls.enable` | `true` |
| `server.port` | `8084` |

| Key | `-dev` | `-prod` |
|---|---|---|
| `spring.rabbitmq.host` | `localhost` | `rabbitmq` |
| Eureka zone | localhost | `discovery-service` |

Notification Service is the only client with **no datasource** and no JWT
settings — it never authenticates a caller.

---

## 6. Client Bootstrap Contract

Every consuming service declares the same import in its own `application.yaml`:

```yaml
spring:
  config:
    import: optional:configserver:${CONFIG_SERVER_URL:http://localhost:8888}
```

Notification Service goes further and pins explicit retry behaviour:

```yaml
spring.cloud.config:
  uri: ${CONFIG_SERVER_URL:http://localhost:8888}
  request-connect-timeout: 5000
  request-read-timeout: 5000
  fail-fast: true
  retry:
    max-attempts: 10
    initial-interval: 1000
    max-interval: 2000
    multiplier: 1.1
```

Note the tension between `optional:` in the import (continue if the server is
missing) and `fail-fast: true` (abort if the server is missing). In practice the
`optional:` prefix wins for a connection that never succeeds, and the retry
block governs transient failures during a cold start — which is exactly the
Docker Compose case, where all services start at once.

### Resolution URL

Config Server answers the standard endpoints:

```
GET /{application}/{profile}
GET /{application}/{profile}/{label}
GET /{application}-{profile}.yml
```

For example `GET http://localhost:8888/order-service/prod` returns the merged
`order-service.yml` + `order-service-prod.yml` property sources. This is a
useful way to debug a config problem without starting the client.

---

## 7. Secrets and Environment Variables

Placeholders such as `${MAIL_PASSWORD}` are **not** resolved by Config Server —
it serves the literal string, and the *client* resolves it against its own
environment. So the variable must be set on the consuming container, not on
Config Server.

| Placeholder | Must be set on | Default |
|---|---|---|
| `MAIL_PASSWORD` | notification-service | none — startup fails without it |
| `STRIPE_SECRET_KEY` | order-service | none — startup fails without it |
| `FRONTEND_URL` | user, product, order | `http://localhost:5173` |
| `IMAGE_BASE_URL` | product-service | `http://localhost:8080/product-manager/images` |
| `SPRING_PROFILES_ACTIVE` | all four clients | `dev` |
| `CONFIG_SERVER_URL` | all four clients | `http://localhost:8888` |

`backend/docker-compose.yml` passes each of these through from a `.env` file;
see [../../operations/running-locally.md](../../operations/running-locally.md#root-env).

The JWT secret and the MySQL `root/root` credentials are **not** placeholders —
they are literals committed to the repository.

---

## 8. Configuration and Health

`config-server`'s own `application.yaml`:

| Key | Value |
|---|---|
| `spring.application.name` | `config-server` |
| `spring.profiles.active` | `native` |
| `spring.cloud.config.server.native.search-locations` | `classpath:/config` |
| `server.port` | `8888` |
| `management.endpoints.web.exposure.include` | `health` |
| `management.endpoint.health.show-details` | `always` |

Only the health endpoint is exposed. Docker Compose polls
`http://localhost:8888/actuator/health` every 10s (10 retries, 30s start period)
and gates `discovery-service` and every business service on it.

Config Server does not register with Eureka; clients address it by URL.

---

## 9. Deployment & Dependencies

### Docker

Multi-stage build on `mcr.microsoft.com/openjdk/jdk:21-ubuntu`, exposing `8888`.
It is **not** under the `prod` compose profile, so `docker compose up
config-server discovery-service` brings up just the infrastructure pair for
hybrid dev mode.

### Maven dependencies

| Dependency | Why |
|---|---|
| `spring-cloud-config-server` | The server itself |
| `spring-boot-starter-actuator` | `/actuator/health` for the compose healthcheck |
| `spring-boot-starter-test` | Test scope |

### Tests

`ConfigServerApplicationTests` is a context-load smoke test only.

---

## 10. Design Notes & Known Trade-offs

### 1. Configuration is baked into the jar

`classpath:/config` means a config change requires a rebuild of the Config
Server image and a restart of every client. There is no `/actuator/refresh`, no
`@RefreshScope` on any client, and no Spring Cloud Bus, so nothing picks up a
change at runtime even if the server is redeployed.

Choosing `native` over a git backend removed the need for a second repository
and for credentials to reach it — a reasonable call for a thesis project, and
the first thing to change for a real deployment.

### 2. Secrets sit next to non-secrets

`jwtSecret` and the MySQL password are literals in the same files that carry
ports and JPA flags. Only the Stripe key and the Gmail app password are
externalized. Anyone who can read the repository can forge an admin JWT.

### 3. Duplication across the twelve files

Eureka client blocks, `frontend.url`, and the JWT triple are repeated per
service. Spring Cloud Config supports an `application.yml` that applies to all
clients; using it would collapse most of the `-dev`/`-prod` pairs to just the
datasource line.

### 4. `dev` is the default profile

`SPRING_PROFILES_ACTIVE` defaults to `dev` in every client's bootstrap file.
A container started without the variable will try to reach `localhost:3306` and
`localhost:8761` from inside its own network namespace and fail with a
connection error rather than a clear misconfiguration message. Compose sets the
variable explicitly for this reason.

### 5. Gateway and discovery are outside the model

Both read fully local configuration. Changing the JWT secret means editing the
gateway's `application.yaml` *and* three files here, and missing one produces
401s that look like an expired-token bug.

### 6. Single instance, no failover

One Config Server with no replica. If it is down during a cold start, clients
retry ten times over roughly 15 seconds and then come up with only their local
bootstrap properties — which for a business service means no datasource and a
failed context.

---

## 11. Cross-References

| Topic | Document |
|---|---|
| Why native profile instead of a git backend | [../../architecture/decisions/0006-config-server-native-profile.md](../../architecture/decisions/0006-config-server-native-profile.md) |
| Startup order, `.env` contents, seeded users | [../../operations/running-locally.md](../../operations/running-locally.md) |
| Services and ports | [../../architecture/system-overview.md](../../architecture/system-overview.md) |
| JWT secret and cookie name usage | [../../architecture/security-model.md](../../architecture/security-model.md) |
| Backend module layout | [../overview.md](../overview.md) |
| Consumers | [user-service.md](user-service.md) · [product-service.md](product-service.md) · [order-service.md](order-service.md) · [notification-service.md](notification-service.md) |
