# Discovery Service — Architecture Documentation

**Module:** `backend/discovery-service`
**Port:** `8761`
**Stack:** Spring Boot 3.5.7 · Spring Cloud Netflix Eureka Server 2025.0.0 · Java 21

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [System Context](#2-system-context)
3. [Registry Behaviour](#3-registry-behaviour)
4. [Who Registers and Who Reads](#4-who-registers-and-who-reads)
5. [Dashboard Access](#5-dashboard-access)
6. [Configuration](#6-configuration)
7. [Deployment & Dependencies](#7-deployment--dependencies)
8. [Operational Notes](#8-operational-notes)
9. [Design Notes & Known Trade-offs](#9-design-notes--known-trade-offs)
10. [Cross-References](#10-cross-references)

---

## 1. Service Overview

Discovery Service is a single-node **Eureka server**. Its only job is to hold the
registry that lets the API Gateway turn `lb://USER-SERVICE` into a concrete
`host:port`.

Like Config Server, the application class is the entire implementation:
`@SpringBootApplication` plus `@EnableEurekaServer`. There is no custom code.

### Responsibilities

| Responsibility | Mechanism |
|---|---|
| Accept registrations | Eureka REST API at `/eureka/apps/**` |
| Track liveness | 30-second client heartbeats, 90-second expiry (Eureka defaults) |
| Serve the registry | Clients fetch and cache it every 30 seconds |
| Expose a dashboard | HTML UI at `/`, proxied by the gateway at `/eureka/main` |
| Report readiness | Actuator `/actuator/health` for the compose healthcheck |

### What it deliberately does not do

- It does not register with itself (`register-with-eureka: false`).
- It does not fetch a registry (`fetch-registry: false`).
- It has no peer, so there is no replication.
- It does not use Config Server — its configuration is fully local.

---

## 2. System Context

```
                    ┌──────────────────────────────┐
                    │ Discovery Service  :8761     │
                    │  @EnableEurekaServer         │
                    │  register-with-eureka: false │
                    │  fetch-registry:      false  │
                    └───▲────▲────▲────▲────▲──────┘
    register + heartbeat│    │    │    │    │
        ┌───────────────┘    │    │    │    └────────────────┐
        │            ┌───────┘    │    └───────┐             │
  api-gateway   user-service product-service order-service notification-service
     :8080          :8082        :8081          :8083           :8084
        │
        └── fetch registry → resolves lb://USER-SERVICE, lb://PRODUCT-SERVICE,
                                      lb://ORDER-SERVICE
```

Only the gateway *consumes* the registry. The business services register but
never look each other up through Eureka — Order Service reaches Product Service
through a configured URL (`product.service.base-url`), not `lb://`.

### External Dependencies

None.

---

## 3. Registry Behaviour

All timings are Spring Cloud Netflix defaults; nothing is overridden in this
project.

| Parameter | Default | Effect |
|---|---|---|
| `eureka.instance.lease-renewal-interval-in-seconds` | 30 | Heartbeat frequency |
| `eureka.instance.lease-expiration-duration-in-seconds` | 90 | Instance evicted after 3 missed heartbeats |
| `eureka.client.registry-fetch-interval-seconds` | 30 | How often the gateway refreshes its cache |
| `eureka.server.eviction-interval-timer-in-ms` | 60000 | Eviction sweep frequency |
| Self-preservation | enabled | Below an expected renewal threshold, Eureka stops evicting |

Two consequences follow directly:

1. **Cold-start latency.** A freshly started service is not routable for up to
   ~30 seconds — the time for it to register and for the gateway to refresh its
   cache. Requests in that window return 503.
2. **Stale entries.** A crashed container can stay in the registry for up to 90
   seconds, and self-preservation can hold it longer. The gateway will keep
   load-balancing to it, producing connection errors rather than 503s.

Self-preservation is especially visible in a small deployment: with only four
registered instances, restarting two at once can trip the renewal threshold and
freeze eviction entirely, leaving dead entries in the dashboard.

---

## 4. Who Registers and Who Reads

| Service | `register-with-eureka` | `fetch-registry` | Configured in |
|---|---|---|---|
| api-gateway | `true` | `true` | its own `application.yaml` |
| user-service | `true` | `true` | `config/user-service-{dev,prod}.yml` |
| product-service | `true` | `true` | `config/product-service-{dev,prod}.yml` |
| order-service | `true` | `true` | `config/order-service-{dev,prod}.yml` |
| notification-service | `true` | `true` | `config/notification-service-{dev,prod}.yml` |
| discovery-service | `false` | `false` | its own `application.yaml` |
| config-server | — | — | not a Eureka client |

### Registered application names

The name comes from `spring.application.name`, upper-cased by Eureka:

| `spring.application.name` | Registry id | Referenced as |
|---|---|---|
| `user-service` | `USER-SERVICE` | `lb://USER-SERVICE` |
| `product-service` | `PRODUCT-SERVICE` | `lb://PRODUCT-SERVICE` |
| `order-service` | `ORDER-SERVICE` | `lb://ORDER-SERVICE` |
| `notification-service` | `NOTIFICATION-SERVICE` | never referenced |
| `api-gateway` | `API-GATEWAY` | never referenced |

Notification Service registers even though nothing routes to it — it is reached
only through RabbitMQ. Renaming any of the three routed services in
`spring.application.name` silently breaks the corresponding gateway route.

### Zone URLs by profile

| Profile | `eureka.client.serviceUrl.defaultZone` |
|---|---|
| `dev` | `http://localhost:8761/eureka/` |
| `prod` | `http://discovery-service:8761/eureka/` |

The gateway takes its zone from the `EUREKA_CLIENT_SERVICEURL_DEFAULTZONE`
environment variable instead, defaulting to the localhost form.

### `prefer-ip-address`

`eureka.instance.prefer-ip-address: true` is set for the gateway and for the
business services under the `dev` profile. Instances register their IP rather
than their hostname, which is what makes hybrid dev mode work — services running
on the host register `127.0.0.1`-style addresses the gateway can actually reach.
The `prod` files omit it and rely on Docker's DNS names.

---

## 5. Dashboard Access

Two ways in:

| URL | Path |
|---|---|
| `http://localhost:8761` | Direct |
| `http://localhost:8080/eureka/main` | Through the gateway (`SetPath=/`) |

The gateway declares a second route, `Path=/eureka/**`, so the dashboard's CSS
and JS load through the proxy as well. Both `/eureka/**` patterns are on the
gateway's public-path list, so **the dashboard is unauthenticated** — see
[§9](#9-design-notes--known-trade-offs).

---

## 6. Configuration

All local, in `backend/discovery-service/src/main/resources/application.yaml`:

| Key | Value | Purpose |
|---|---|---|
| `spring.application.name` | `discovery-service` | Instance identity |
| `server.port` | `8761` | Standard Eureka port |
| `eureka.client.register-with-eureka` | `false` | Do not self-register |
| `eureka.client.fetch-registry` | `false` | Do not maintain a local cache |
| `management.endpoints.web.exposure.include` | `health` | Only health is exposed |
| `management.endpoint.health.show-details` | `always` | Full health payload |

No environment variables are read. There is no `eureka.server.*` tuning, no
peer-awareness block, and no security configuration.

---

## 7. Deployment & Dependencies

### Docker

Multi-stage build on `mcr.microsoft.com/openjdk/jdk:21-ubuntu`, exposing `8761`.

In `backend/docker-compose.yml`, `discovery-service` is not under the `prod`
profile — it starts with `config-server` for hybrid dev mode. It declares
`depends_on: config-server: condition: service_healthy` even though it does not
consume Config Server; this only sequences startup.

Its own healthcheck polls `http://localhost:8761/actuator/health` every 10s
(10 retries, 30s start period), and every business service plus the gateway
waits on it.

### Maven dependencies

| Dependency | Why |
|---|---|
| `spring-cloud-starter-netflix-eureka-server` | The registry |
| `spring-boot-starter-web` | Serves the dashboard and REST API |
| `spring-boot-starter-actuator` | `/actuator/health` |
| `spring-boot-starter-test` | Test scope |

### Tests

`DiscoveryServiceApplicationTests` is a context-load smoke test only.

---

## 8. Operational Notes

### Verifying registration

```bash
# JSON registry dump
curl http://localhost:8761/eureka/apps

# Just the names
curl -s http://localhost:8761/eureka/apps | grep -o '<name>[^<]*</name>'
```

Expect `USER-SERVICE`, `PRODUCT-SERVICE`, `ORDER-SERVICE`,
`NOTIFICATION-SERVICE`, and `API-GATEWAY` once the stack is warm.

### Common symptoms

| Symptom | Likely cause |
|---|---|
| Gateway returns 503 for `/user-manager/**` | `USER-SERVICE` not yet registered, or registered under a different name |
| A stopped service still appears in the dashboard | 90-second lease not yet expired, or self-preservation is holding it |
| Red banner: "EMERGENCY! EUREKA MAY BE INCORRECTLY CLAIMING INSTANCES ARE UP" | Self-preservation triggered — expected while restarting several services at once |
| Service registers but the gateway cannot reach it | Wrong `prefer-ip-address` for the environment; a container registering `localhost` is unreachable from the gateway container |

### Restart order

Config Server → Discovery Service → business services → gateway. Compose
enforces this with healthchecks; in hybrid dev mode it must be done by hand.

---

## 9. Design Notes & Known Trade-offs

### 1. Single node, no peer replication

`register-with-eureka: false` and `fetch-registry: false` are the correct
settings for a standalone server, but they also mean there is no second node.
If Discovery Service dies, the gateway serves from its cached registry until the
cache is invalidated, and then all `lb://` routes fail. Nothing recovers
automatically.

### 2. The dashboard is unauthenticated

`/eureka/**` is a public path on the gateway, and Eureka itself has no security
configured, so anyone who can reach port 8080 or 8761 can enumerate every
service instance and its IP. In a real deployment the dashboard would sit behind
authentication or not be proxied at all.

Worse, the Eureka REST API is writable: `POST /eureka/apps/{app}` can inject a
fake instance, which the gateway would then load-balance real user traffic to.

### 3. Eureka is only used for gateway routing

Four services register, but only three names are ever resolved, and only by the
gateway. Order → Product calls use a hardcoded base URL. So the registry
provides service *addressing* for north-south traffic but nothing for
east-west traffic — no client-side load balancing, no failover between Product
Service replicas.

### 4. Default timings are not tuned

With 30/90-second defaults, a rolling restart leaves a window where the gateway
routes to dead instances. Shortening the lease intervals would tighten that
window at the cost of more heartbeat traffic; a circuit breaker on the gateway
side would address the symptom more directly. See
[../../architecture/system-overview.md](../../architecture/system-overview.md#known-limitations).

### 5. Why Eureka at all

The project runs on Docker Compose, where DNS names alone would suffice — and
indeed Order → Product already works that way. Eureka is here because the
gateway's `lb://` routing and Spring Cloud LoadBalancer expect a registry, and
because it keeps the door open for multiple instances per service. The
alternative (Kubernetes service discovery) is discussed in
[../../architecture/decisions/0002-eureka-service-discovery.md](../../architecture/decisions/0002-eureka-service-discovery.md).

---

## 10. Cross-References

| Topic | Document |
|---|---|
| `lb://` routes and gateway filters | [api-gateway.md](api-gateway.md) |
| Services, ports, request flow | [../../architecture/system-overview.md](../../architecture/system-overview.md) |
| Why Eureka over Kubernetes discovery | [../../architecture/decisions/0002-eureka-service-discovery.md](../../architecture/decisions/0002-eureka-service-discovery.md) |
| Eureka zone values per profile | [config-server.md](config-server.md) |
| Startup order and troubleshooting | [../../operations/running-locally.md](../../operations/running-locally.md) |
| Backend module layout | [../overview.md](../overview.md) |
