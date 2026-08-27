# Notification Service — Architecture Documentation

**Module:** `backend/notification-service`
**Port:** `8084` (not exposed through the gateway)
**Stack:** Spring Boot 3.5.7 · Spring AMQP · Spring Mail · **Java 17** · Base package `vn.vti.dtn2504.notificationservice`

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [System Context](#2-system-context)
3. [Internal Structure](#3-internal-structure)
4. [Messaging Topology](#4-messaging-topology)
5. [The Dual-Entry Endpoint](#5-the-dual-entry-endpoint)
6. [Message Contract](#6-message-contract)
7. [Email Delivery](#7-email-delivery)
8. [Configuration](#8-configuration)
9. [Deployment & Dependencies](#9-deployment--dependencies)
10. [Design Notes & Known Trade-offs](#10-design-notes--known-trade-offs)
11. [Cross-References](#11-cross-references)

---

## 1. Service Overview

Notification Service is the platform's transactional email sender. It consumes
messages from a RabbitMQ queue and relays them through Gmail SMTP.

It is the odd one out in the backend in several respects, all of which are real
and worth knowing before touching it:

| Aspect | Notification Service | Every other service |
|---|---|---|
| Base package | `vn.vti.dtn2504.notificationservice` | `com.ecommerce.<service>` |
| Java version | **17** (pom and Dockerfile) | 21 |
| Config file name | `application.yml` | `application.yaml` |
| Database | none | MySQL |
| Gateway route | none | `/{service}-manager/**` |
| Authentication | none — no `JwtService`, no `AuthUtil` | JWT cookie parsed per request |
| Layering | `controller/`, `service/`, `payload/`, `config/` — no `model/` or `repositories/` | full stack |

### Responsibilities

| Responsibility | Mechanism |
|---|---|
| Declare the messaging topology | `RabbitMQConfig` creates queue, exchange, binding |
| Consume notification messages | `@RabbitListener` on `NotificationController.sendMail` |
| Send email | `EmailServiceImpl` via `JavaMailSender` and `SimpleMailMessage` |
| Accept direct HTTP calls | `POST /api/v1/notifications/sendMail` on the same method |

### Who produces its messages

| Producer | Event | Class |
|---|---|---|
| user-service | Welcome email on signup | its RabbitMQ producer (`NotificationProducer`) |
| user-service | Password-changed notice on a successful self-service password change | same `NotificationProducer` |
| order-service | Order confirmation on placement | `NotificationPublisher` |

---

## 2. System Context

```
  user-service :8082                    order-service :8083
  (signup → welcome email,              (placeOrder → confirmation)
   change password → notice)
          │                                     │
          │ convertAndSend(                     │ convertAndSend(
          │   "notification-exchange",          │   "notification-exchange",
          │   "notification-routing-key", …)    │   "notification-routing-key", …)
          └──────────────┬──────────────────────┘
                         ▼
              ┌──────────────────────────┐
              │ RabbitMQ                 │
              │  DirectExchange          │
              │  notification-exchange   │
              │        │ routing key     │
              │        ▼                 │
              │  notification-queue      │  durable
              └──────────┬───────────────┘
                         │ 3 concurrent consumers
                         ▼
            ┌──────────────────────────────┐
            │ notification-service :8084   │
            │  NotificationController      │
            │  EmailServiceImpl            │
            └──────────┬───────────────────┘
                       │ SMTP STARTTLS :587
                       ▼
                 smtp.gmail.com
```

### External Dependencies

| Dependency | Purpose | Failure behaviour |
|---|---|---|
| RabbitMQ | Message source | Listener container retries the connection; messages queue up at the broker |
| Gmail SMTP | Delivery | Exception is **caught and swallowed** — see [§7](#7-email-delivery) |
| Config Server (`:8888`) | All configuration | `fail-fast: true` with 10 retries; `optional:` import lets startup continue without mail settings |
| Discovery Service (`:8761`) | Registers, but nothing routes to it | Startup continues |

---

## 3. Internal Structure

```
vn.vti.dtn2504.notificationservice
├── NotificationServiceApplication.java
├── config/
│   └── RabbitMQConfig.java          # queue, exchange, binding, converter, listener factory
├── controller/
│   └── NotificationController.java  # @RabbitListener + @PostMapping on one method
├── payload/
│   ├── EmailDetails.java            # recipient, msgBody, subject
│   └── SendNotificationRequest.java # identical fields — unused
└── service/
    ├── EmailService.java
    └── EmailServiceImpl.java        # JavaMailSender + SimpleMailMessage
```

`SendNotificationRequest` has exactly the same three fields as `EmailDetails` and
is referenced nowhere. It is dead code.

---

## 4. Messaging Topology

`RabbitMQConfig` declares everything on startup, so the service can be started
against an empty broker.

| Bean | Definition |
|---|---|
| `notificationQueue()` | `new Queue("notification-queue", true)` — durable |
| `notificationExchange()` | `new DirectExchange("notification-exchange", true, false)` — durable, not auto-delete |
| `notificationBinding()` | queue bound to exchange with `notification-routing-key` |
| `jsonMessageConverter()` | `Jackson2JsonMessageConverter` |
| `rabbitListenerContainerFactory(...)` | `SimpleRabbitListenerContainerFactory`, JSON converter, `concurrentConsumers = 3`, `maxConcurrentConsumers = 3` |

Names come from configuration, not constants:

```yaml
queue:
  notification:
    queue: notification-queue
    exchange: notification-exchange
    routing-key: notification-routing-key
```

Producers carry only the exchange and routing key in **their own** local
`application.yaml` (Order Service's is shown in
[order-service.md](order-service.md#11-configuration)). The queue name lives only
here, on the consumer side — which is correct for a direct exchange, but it does
mean the three strings are duplicated across three repositories' worth of config
with nothing enforcing that they match.

### Concurrency

Fixing both `concurrentConsumers` and `maxConcurrentConsumers` at 3 pins the
container to exactly three consumer threads with no elastic scaling. Three
emails can be in flight at once; a burst queues at the broker.

---

## 5. The Dual-Entry Endpoint

One method carries both annotations:

```java
@RabbitListener(queues = "${queue.notification.queue}")
@PostMapping("/sendMail")
public void sendMail(@RequestBody EmailDetails details) {
    emailService.sendSimpleMail(details);
}
```

So the same handler serves two entirely different transports:

| Entry point | Trigger | Body binding |
|---|---|---|
| AMQP | Message on `notification-queue` | `Jackson2JsonMessageConverter` → `EmailDetails` |
| HTTP `POST /api/v1/notifications/sendMail` | Direct call | `@RequestBody` → `EmailDetails` |

The asynchronous path is the one the platform actually uses. The HTTP path is a
manual test hook.

**It is not routed through the gateway** — there is no `notification-manager`
route — so it is reachable only from inside the Docker network, or on
`localhost:8084` in dev, where port 8084 is published by Compose.

Combining the annotations works, but it couples the two transports: a change to
the request body shape (`@Valid`, a wrapper envelope, a different DTO) changes
the AMQP contract at the same time. `EmailDetails` therefore has no validation
annotations at all.

---

## 6. Message Contract

`EmailDetails` — three strings, Lombok `@Data`, no validation:

```json
{
  "recipient": "customer@example.com",
  "msgBody": "Thank you for your purchase! Your order 42 has been placed successfully with total amount 1299.0.",
  "subject": "Order Confirmation - Order 42"
}
```

Producers construct the identical shape. Order Service has its own
`com.ecommerce.order_service.payload.EmailDetails` with the same three fields;
User Service publishes a `NotificationEmail` payload. The classes are unrelated
by type and share only field names, which the JSON converter matches at runtime.

| Producer | Subject | Body |
|---|---|---|
| user-service | Welcome message | Registration greeting |
| user-service | `Your password has been changed` | A notice that the account password was just changed, with a prompt to contact support if the user did not make the change |
| order-service | `Order Confirmation - Order {orderId}` | `Thank you for your purchase! Your order {orderId} has been placed successfully with total amount {totalAmount}.` |

Everything is plain text — no HTML, no templates, no localization. Amounts are
interpolated straight from `Double.toString`, so an order total renders as
`1299.0`.

---

## 7. Email Delivery

`EmailServiceImpl.sendSimpleMail` builds a `SimpleMailMessage`:

| Field | Source |
|---|---|
| `from` | `${spring.mail.username}` |
| `to` | `details.getRecipient()` |
| `text` | `details.getMsgBody()` |
| `subject` | `details.getSubject()` |

### Error handling

```java
try {
    javaMailSender.send(mailMessage);
    System.out.println("Mail Sent");
} catch (Exception e) {
    System.out.println("Mail Failed");
}
```

This is the single most consequential detail in the service:

- **All exceptions are swallowed.** Because the listener method returns normally,
  RabbitMQ acknowledges the message and it is removed from the queue. A failed
  send is a permanently lost notification — no retry, no dead-letter queue.
- **Nothing is logged usefully.** `System.out.println` bypasses SLF4J, so the
  output carries no timestamp, level, thread, or stack trace, and cannot be
  filtered or shipped to a log aggregator. The exception itself is discarded, so
  "Mail Failed" is all the diagnostic information that exists.

A correct implementation would log the exception at ERROR with the recipient and
subject, and either rethrow (so the message is requeued or dead-lettered) or
record the failure for a retry job.

---

## 8. Configuration

### Local — `notification-service/src/main/resources/application.yml`

| Key | Value |
|---|---|
| `spring.application.name` | `notification-service` |
| `spring.profiles.active` | `${SPRING_PROFILES_ACTIVE:dev}` |
| `spring.config.import` | `optional:configserver:${CONFIG_SERVER_URL:http://localhost:8888}` |
| `spring.cloud.config.uri` | `${CONFIG_SERVER_URL:http://localhost:8888}` |
| `spring.cloud.config.request-connect-timeout` / `request-read-timeout` | `5000` / `5000` ms |
| `spring.cloud.config.fail-fast` | `true` |
| `spring.cloud.config.retry` | 10 attempts, 1000 ms initial, 2000 ms max, ×1.1 |
| `server.port` | `8084` |
| `queue.notification.queue` / `exchange` / `routing-key` | `notification-queue` / `notification-exchange` / `notification-routing-key` |

Notification Service is the only module that spells out the config-client retry
policy; the other three rely on defaults.

### From Config Server — `config/notification-service.yml`

| Key | Value |
|---|---|
| `spring.mail.host` / `port` | `smtp.gmail.com` / `587` |
| `spring.mail.username` | `thaivanlam373@gmail.com` |
| `spring.mail.password` | `${MAIL_PASSWORD}` — **required, no default** |
| `spring.mail.properties.mail.smtp.auth` | `true` |
| `spring.mail.properties.mail.smtp.starttls.enable` | `true` |
| `server.port` | `8084` (repeated) |

### Profile overrides

| Key | `-dev` | `-prod` |
|---|---|---|
| `spring.rabbitmq.host` | `localhost` | `rabbitmq` |
| `eureka.client.serviceUrl.defaultZone` | `http://localhost:8761/eureka/` | `http://discovery-service:8761/eureka/` |

RabbitMQ credentials are never set, so Spring AMQP uses `guest`/`guest` on port
5672 — matching the `rabbitmq:3-management` container's defaults.

### Environment variables

| Variable | Default | Effect if unset |
|---|---|---|
| `MAIL_PASSWORD` | none | Context fails — the placeholder cannot be resolved |
| `SPRING_PROFILES_ACTIVE` | `dev` | Tries `localhost` for RabbitMQ and Eureka |
| `CONFIG_SERVER_URL` | `http://localhost:8888` | Falls back to local properties only |

`MAIL_PASSWORD` must be a Gmail **app password**, not the account password;
Google rejects plain-password SMTP auth.

---

## 9. Deployment & Dependencies

### Docker

Multi-stage build on `mcr.microsoft.com/openjdk/jdk:17-ubuntu` — the only
service still on JDK 17 — exposing `8084`.

Under the `prod` compose profile it depends on `rabbitmq`, `discovery-service`,
`config-server`, and `api-gateway` being healthy, and receives
`SPRING_PROFILES_ACTIVE`, `SPRING_CONFIG_IMPORT`, `CONFIG_SERVER_URL`, and
`MAIL_PASSWORD`. Port 8084 is published to the host.

Note that `api-gateway` declares no healthcheck of its own while five services
wait on `condition: service_healthy` for it — a compose definition that will not
start as written until the gateway gets a healthcheck or the condition is
relaxed.

### Maven dependencies

| Dependency | Why |
|---|---|
| `spring-boot-starter-amqp` | RabbitMQ listener and converters |
| `spring-boot-starter-mail` | `JavaMailSender` |
| `spring-boot-starter-web` | The HTTP entry point and the servlet container |
| `spring-cloud-config-client` | Fetches configuration |
| `spring-cloud-starter-netflix-eureka-client` | Registers with Eureka |
| `lombok` | `@Data` on the payloads |

`java.version` is `17` in the pom. Nothing in the code requires 17 over 21; the
divergence is historical.

### Tests

`NotificationServiceApplicationTests` is a context-load smoke test only. Message
consumption, JSON binding, and mail sending are untested.

---

## 10. Design Notes & Known Trade-offs

### 1. Failures are silent and messages are lost

Covered in [§7](#7-email-delivery). This is the first thing to fix: catch,
log at ERROR with context, and let the message be requeued or dead-lettered.
There is currently no DLQ, no `x-dead-letter-exchange` argument on the queue, and
no retry policy on the listener container.

### 2. One method, two transports

Sharing a handler between `@RabbitListener` and `@PostMapping` is compact but
means the HTTP contract and the message contract cannot evolve separately, and
neither can be validated without affecting the other.

### 3. The HTTP endpoint is unauthenticated and unrouted

`POST /api/v1/notifications/sendMail` has no authentication of any kind. It is
not exposed through the gateway, so it is not reachable from the internet in the
intended deployment — but Docker Compose publishes port 8084 to the host, so
anything that can reach the host can send arbitrary email from the configured
Gmail account. Removing the `@PostMapping`, or leaving the port unpublished,
would close this.

### 4. Plain-text bodies assembled by the producer

Producers build the message text, so email formatting is spread across
user-service and order-service. Moving to templates (Thymeleaf or FreeMarker)
here would let producers send structured events (`orderId`, `totalAmount`)
instead of prose, and would make HTML email and localization possible.

### 5. Gmail SMTP as the delivery channel

Free and zero-setup for a thesis project, but rate-limited (~500 messages/day),
tied to one personal account, and dependent on an app password that must be
rotated by hand. A transactional provider (SES, SendGrid, Postmark) would give
delivery receipts, bounce handling, and a sending domain.

### 6. Fixed concurrency of 3

`concurrentConsumers == maxConcurrentConsumers == 3` removes elastic scaling.
Under a burst the queue absorbs the load, which is the right behaviour, but
throughput is capped at three in-flight SMTP round-trips regardless of demand.

### 7. Package and JDK divergence

`vn.vti.dtn2504.notificationservice` on Java 17 versus `com.ecommerce.*` on Java
21 everywhere else. Harmless at runtime, but it breaks package-wide tooling
(component scanning conventions, shared parent poms, blanket static analysis
rules) and signals that this module was authored separately.

---

## 11. Cross-References

| Topic | Document |
|---|---|
| Order confirmation producer | [order-service.md](order-service.md#9-async-integration--rabbitmq) |
| Signup welcome-email producer | [user-service.md](user-service.md#7-async-integration--rabbitmq) |
| Why RabbitMQ for notifications | [../../architecture/decisions/0005-rabbitmq-for-notifications.md](../../architecture/decisions/0005-rabbitmq-for-notifications.md) |
| Mail settings and profile overrides | [config-server.md](config-server.md#notification-serviceyml-shared) |
| Services, ports, request flow | [../../architecture/system-overview.md](../../architecture/system-overview.md) |
| Endpoint listing | [../api-reference.md](../api-reference.md#notification-service--8084-not-exposed-through-the-gateway) |
| `MAIL_PASSWORD` setup | [../../operations/running-locally.md](../../operations/running-locally.md#root-env) |
