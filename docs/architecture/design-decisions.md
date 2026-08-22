# Design Decisions and Trade-offs

Platform-level technology choices, each with the reasoning behind it and the
cost it carries. Frontend-specific decisions live in
[../frontend/design-decisions.md](../frontend/design-decisions.md).

---

## Why Spring Cloud Gateway (WebFlux)?

The gateway uses `spring-cloud-starter-gateway-server-webflux` — the reactive,
non-blocking variant. For a component that mostly proxies requests, reactive I/O
means one thread can hold thousands of in-flight connections. A servlet-based
gateway allocates a thread per request and would exhaust its pool far earlier
under a 1000-concurrent-user load test.

**Trade-off:** Reactive code is harder to debug. `AuthenticationFilter` returns
`Mono<Void>` chains, so exception handling is less intuitive than a servlet
filter's synchronous `doFilter()`. Project Reactor has a real learning curve.

---

## Why Eureka instead of Kubernetes service discovery?

Eureka is the simplest option for Docker Compose on a single host — no
infrastructure beyond a Spring Boot JAR. Kubernetes DNS-based discovery would
suit production better but adds cluster management, Helm charts, and ingress
controllers that a graduation project does not justify.

**Trade-off:** An extra network hop for resolution, a single point of failure
(no peer replication configured), and no infrastructure-level traffic management
such as canary routing or circuit breaking.

---

## Why a shared JWT secret across all services?

Gateway, user-service, product-service, and order-service all hold the same
HMAC-SHA secret (`spring.app.jwtSecret`). User Service *creates* tokens; the
others *validate* independently. This avoids an OAuth2 authorization server and
asymmetric key distribution.

**Trade-off:** Any service that can validate can also forge. Compromise one
service and the whole auth system falls. RS256 — private key in user-service,
public key everywhere else — would contain the blast radius. Token revocation is
also unsupported.

---

## Why cookie-based JWT instead of an Authorization header?

The token lives in a cookie named `springBootEcom` with `httpOnly=false`, so the
React frontend can read it for display purposes and the browser sends it
automatically on every request — no manual header plumbing in the client.

**Trade-off:** `httpOnly=false` exposes the token to XSS. Production would want
`httpOnly=true` + `Secure` + `SameSite=Strict`, with a `/me` endpoint supplying
the user info the frontend currently reads from the cookie.

---

## Why RabbitMQ for notifications?

Email is slow — SMTP handshake, DNS lookup, retries. Sending synchronously
during checkout would add 1–3 seconds of latency. RabbitMQ decouples delivery
from the order flow: the order response returns immediately and Notification
Service processes messages with `concurrentConsumers=3`.

**Trade-off:** One more infrastructure dependency. Messages can be lost if
RabbitMQ crashes before consumption — durable queues reduce this but do not
eliminate it. Critical mail (password reset) would need retries plus a
dead-letter queue.

---

## Why Config Server with the native profile?

`spring.profiles.active=native` with configuration under `classpath:/config`,
so configs are baked into the config-server JAR at build time.

**Trade-off:** Changing any config requires rebuilding and redeploying the
config-server container. A Git-backed config server allows runtime changes and
is the usual production pattern; native was chosen to avoid managing a config
repository.

---

## Why ProductSnapshot (embedded) instead of a foreign key to Product?

`OrderItem` and `CartItem` embed a `ProductSnapshot` — name, price, image — in
place of a foreign key into another service's database.

**Trade-off:** This is deliberate denormalization forced by the microservice
boundary; a cross-database foreign key is not possible. It is also semantically
right: the snapshot records the product as it was at checkout, so a later price
edit by the seller cannot alter a placed order. The cost is duplicated storage
and no cascading updates.

---

## Why a single MySQL instance with multiple databases?

One MySQL 8.0 container serves three logical databases — `ecommerce`,
`ecommerce_product`, `ecommerce_order` — each created on demand via
`?createDatabaseIfNotExist=true`.

**Trade-off:** Acceptable for development, but it violates the independent-data-
store principle. A migration in one service can lock tables that affect another,
and connection-pool exhaustion in one can starve the rest. Production should
give each service its own instance.

---

## Why RestTemplate instead of WebClient or Feign?

Order Service calls Product Service over synchronous `RestTemplate` — the
simplest option, and consistent with the servlet-based downstream services.

**Trade-off:** `RestTemplate` is in maintenance mode and blocks the calling
thread. The `reduce-stock` call blocks the order-placement thread until Product
Service answers, which at high concurrency can exhaust the Tomcat pool.
Alternatives: Spring Cloud OpenFeign (declarative, less boilerplate) or
WebClient (non-blocking, at the cost of reactive complexity in a servlet app).
