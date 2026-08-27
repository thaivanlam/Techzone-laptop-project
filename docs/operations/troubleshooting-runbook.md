# Troubleshooting Runbook

What to do when the platform misbehaves: how to tell what is wrong, in what
order to check, and how to recover.

Written for whoever is running the stack. Startup procedures are in
[running-locally.md](running-locally.md); every setting is in
[configuration-reference.md](configuration-reference.md); user-facing questions
are in [../user-guide/faq.md](../user-guide/faq.md).

---

## Table of Contents

1. [First Response](#1-first-response)
2. [Health Checks](#2-health-checks)
3. [Reading the Logs](#3-reading-the-logs)
4. [Symptom Index](#4-symptom-index)
5. [Runbook — Nothing Loads](#5-runbook--nothing-loads)
6. [Runbook — The Shop Loads, the API Fails](#6-runbook--the-shop-loads-the-api-fails)
7. [Runbook — One Service Is Down](#7-runbook--one-service-is-down)
8. [Runbook — Database Problems](#8-runbook--database-problems)
9. [Runbook — No Email](#9-runbook--no-email)
10. [Runbook — Checkout Fails](#10-runbook--checkout-fails)
11. [Recovery Procedures](#11-recovery-procedures)
12. [Escalating: What to Collect](#12-escalating-what-to-collect)

---

## 1. First Response

Before diagnosing anything, establish these four facts. Most incidents are
resolved here.

```bash
docker compose ps                    # is everything running and healthy?
docker compose logs --tail=50 api-gateway
curl -i http://localhost:8080/product-manager/api/public/products?pageSize=1
curl -i http://localhost:5173
```

| Question | How to answer |
|---|---|
| Are all containers up? | `docker compose ps` — look for `Exit`, `Restarting`, or a long `health: starting` |
| Did anything just change? | `.env` edits, a rebuild, a profile switch, a host reboot |
| How long has it been broken? | A service that has been up for minutes, not hours, restarted for a reason |
| Is it everything, or one thing? | If the catalogue works but checkout does not, this is not an infrastructure problem |

**The single most common cause of "it was working yesterday": services are still
starting.** A cold start compiles nothing but does wait on health checks. Give it
sixty seconds before diagnosing.

---

## 2. Health Checks

| Surface | URL | Healthy looks like |
|---|---|---|
| Shop | http://localhost:5173 | The home page renders |
| Gateway | http://localhost:8080/product-manager/api/public/products | JSON, or `400` on an empty catalogue |
| Eureka | http://localhost:8761 | **All five** registrable services listed |
| RabbitMQ | http://localhost:15672 (`guest`/`guest`) | `notification-queue` exists, consumers > 0 |
| Config Server | http://localhost:8888/product-service/prod | YAML-derived JSON |
| MySQL | `docker compose exec mysql mysqladmin -uroot -proot ping` | `mysqld is alive` |

**Eureka is the fastest diagnosis in the stack.** If a service is missing from
that list, the gateway cannot route to it and will answer `503` for its prefix —
that tells you which service to look at before you read a single log line.

Container-level health:

```bash
docker compose ps
docker inspect -f '{{json .State.Health}}' order-service | head -c 400
```

A container stuck in `health: starting` forever usually means the probe binary is
missing from the image, not that the service is unhealthy.

---

## 3. Reading the Logs

```bash
docker compose logs -f order-service          # follow one service
docker compose logs --tail=100 api-gateway    # recent history
docker compose logs --since=10m               # everything, last ten minutes
docker compose logs | grep -iE "error|exception|failed"
```

There is **no distributed tracing and no correlation id**, so a request cannot be
followed across services automatically. To trace one by hand, use the timestamp
and work outward: gateway → the service it routed to → any service that one
called.

What matters in a startup log, in order:

1. `Fetching config from server at ...` — Config Server was reached
2. `HikariPool-1 - Start completed` — the database is connected
3. `Registering application ... with eureka` — discovery succeeded
4. `Started <Service>Application in N seconds` — it is up
5. `Tomcat started on port(s): 808x` — it is listening

A service that dies before line 1 has a Config Server problem; before line 2, a
database problem.

---

## 4. Symptom Index

| Symptom | Go to |
|---|---|
| Browser shows nothing at all on 5173 | [§5](#5-runbook--nothing-loads) |
| Page loads, every API call fails (502) | [§6](#6-runbook--the-shop-loads-the-api-fails) |
| One area broken, the rest fine (503) | [§7](#7-runbook--one-service-is-down) |
| Cannot start: port already in use | [§8](#8-runbook--database-problems) |
| Products or accounts disappeared | [§8](#8-runbook--database-problems) |
| No welcome or confirmation emails | [§9](#9-runbook--no-email) |
| Checkout fails or the card form is missing | [§10](#10-runbook--checkout-fails) |
| Product images are broken | `IMAGE_BASE_URL` — [configuration-reference.md](configuration-reference.md#11-misconfiguration-symptoms) |
| CORS errors in the browser console | Modes 2 and 3 only: `FRONTEND_URL` must match the SPA's origin |
| Everything fails after ~50 minutes | Session expiry (`BUG-03`) — sign in again |
| The shop shows an error instead of an empty catalogue | Empty catalogue (`BUG-04`) — seed it, [database-seeding.md](database-seeding.md) |
| Creating a product fails on a duplicate key | `product_seq` was not raised after seeding — [§8](#8-runbook--database-problems) |
| Container name conflicts on `up` | Root and `backend/` Compose projects both running — bring one down |
| Grafana panels empty, or a Prometheus target `DOWN` | [observability.md](observability.md#11-when-there-is-no-data) |

---

## 5. Runbook — Nothing Loads

**Symptom.** http://localhost:5173 does not respond.

1. **Is the container up?**
   ```bash
   docker compose ps frontend
   ```
   Exited → `docker compose logs frontend`. An nginx configuration error appears
   here immediately.

2. **Is the port what you think?** `FRONTEND_PORT` in `.env` must match the URL
   you are opening.

3. **Is something else holding the port?**
   ```bash
   docker compose logs frontend | grep -i "address already in use"
   ```
   Change `FRONTEND_PORT` and `FRONTEND_URL` together, then rebuild the frontend
   — `FRONTEND_URL` is baked into the bundle.

4. **Rebuild if the image is stale.**
   ```bash
   docker compose build frontend && docker compose up -d frontend
   ```

---

## 6. Runbook — The Shop Loads, the API Fails

**Symptom.** The page renders; every request fails with `502`, or the console
shows calls to `undefined/user-manager/...`.

1. **`undefined/...` in the URL** → the bundle was built without
   `VITE_BACK_END_URL`. This is a **build-time** value:
   ```bash
   docker compose build frontend && docker compose up -d frontend
   ```

2. **`502` on every call** → nginx cannot reach the gateway.
   ```bash
   docker compose ps api-gateway
   docker compose exec frontend wget -qO- http://api-gateway:8080/actuator/health
   ```
   Check `API_GATEWAY_URL`. Unlike the `VITE_*` values, it is read at container
   start: `docker compose up -d frontend` is enough.

3. **`401` on everything, including the catalogue** → the gateway is up but its
   security configuration is wrong. Confirm the public paths in
   [configuration-reference.md](configuration-reference.md#gatewaysecuritypublic-paths).

4. **`503` for one prefix only** → not this runbook. Go to
   [§7](#7-runbook--one-service-is-down).

---

## 7. Runbook — One Service Is Down

**Symptom.** The catalogue works but the basket does not, or sign-in fails while
everything else is fine. The gateway answers `503` for one prefix.

1. **Check Eureka** at http://localhost:8761. A missing service is your answer.

2. **Check the container.**
   ```bash
   docker compose ps <service>
   docker compose logs --tail=100 <service>
   ```

3. **Match the failure to the startup sequence** ([§3](#3-reading-the-logs)):

   | Died before | Cause | Fix |
   |---|---|---|
   | Fetching config | Config Server not healthy, or unreachable | `docker compose restart config-server`, wait, restart the service |
   | Hikari pool start | MySQL not ready, or credentials wrong | [§8](#8-runbook--database-problems) |
   | Eureka registration | Discovery Service down | `docker compose restart discovery-service` |
   | Nothing — it is up but unregistered | Wrong profile: `dev` config pointing at `localhost` inside a container | Align `SPRING_PROFILES_ACTIVE` with `COMPOSE_PROFILES` |

4. **Restart it.**
   ```bash
   docker compose restart <service>
   ```
   Registration takes up to 30 seconds after start — the gateway will answer
   `503` until then. This is normal, not a second fault.

5. **Order-service specifically.** It is the only service that calls another
   synchronously. If product-service is down, checkout fails hard — there is no
   circuit breaker. Fix product-service and checkout recovers on its own.

---

## 8. Runbook — Database Problems

### Cannot start: `bind: address already in use` on 3306

A native MySQL holds the port. Set a free host port in `.env`:

```env
MYSQL_PORT=3307
```

Services address `mysql:3306` inside the network, so only the host binding
moves. Nothing else needs changing.

### Services cannot connect

```bash
docker compose ps mysql
docker compose exec mysql mysqladmin -uroot -proot ping
docker compose logs mysql | tail -30
```

MySQL takes 20–40 seconds on a first start while it initialises. Health checks
gate the services on it, so a slow start looks like a hang and is not one.

### Products or accounts "disappeared"

Almost always a profile switch, not data loss. `dev` and `prod` use **different
databases**:

| Profile | user-service database |
|---|---|
| `prod` | `ecommerce` |
| `dev` | `laptop_ecommerce_graduation_project_user_service` |

Check `SPRING_PROFILES_ACTIVE` in `.env` and confirm:

```bash
docker compose exec mysql mysql -uroot -proot -e "SHOW DATABASES;"
docker compose exec mysql mysql -uroot -proot -e "SELECT COUNT(*) FROM ecommerce_product.product;"
```

### Creating a product fails on a duplicate key

The catalogue seeder wrote explicit product ids and did not raise the
`product_seq` generator, so the next generated id collides. Verify:

```bash
docker compose exec mysql mysql -uroot -proot \
  -e "SELECT next_val FROM ecommerce_product.product_seq; \
      SELECT MAX(product_id) FROM ecommerce_product.product;"
```

`next_val` must exceed the maximum id. The full explanation and the fix are in
[database-seeding.md](database-seeding.md).

### The seeder did nothing

It skips itself whenever the catalogue holds any product — that is deliberate.
`docker compose logs db-seed` will say so. To force a reseed you must clear the
data first ([§11](#11-recovery-procedures)).

### Edits to `init-db/*.sql` have no effect

Those scripts run **once**, when the `mysql_data` volume is first created.
Changing them requires destroying the volume — see
[§11](#11-recovery-procedures).

---

## 9. Runbook — No Email

Emails are asynchronous, so a failure never blocks an order. Work outward from
the broker.

1. **Is the broker up and consumed?** http://localhost:15672 (`guest`/`guest`).
   Look at `notification-queue`:

   | What you see | Meaning |
   |---|---|
   | Queue missing | notification-service has never started successfully |
   | Consumers 0 | notification-service is down or not connected |
   | Messages piling up | Messages arrive but the consumer is failing |
   | Queue empty, consumers > 0 | Messages are being consumed — the failure is at SMTP |

2. **Check the consumer.**
   ```bash
   docker compose logs -f notification-service
   ```

3. **SMTP failures** name a Gmail error. Nearly always `MAIL_PASSWORD` is not a
   valid **app password** — the account's own password will not work, and the
   account needs 2-Step Verification enabled.

4. **A failed send is not retried.** The exception is swallowed and the message
   is lost (`BUG-06`), so fixing the credentials will not deliver the backlog.
   Nothing recovers those messages; the orders themselves are unaffected.

5. **Nothing is published at all** → check the publishing side. The exchange and
   routing key must match on both sides:
   `notification-exchange` / `notification-routing-key`.

---

## 10. Runbook — Checkout Fails

| Symptom | Cause | Fix |
|---|---|---|
| The card form never appears | `VITE_STRIPE_PUBLISHABLE_KEY` was empty when the image was built | Set it, then `docker compose build frontend && docker compose up -d frontend` |
| "Failed to create payment intent" | `STRIPE_SECRET_KEY` missing or invalid in order-service | Set it in `.env`, `docker compose restart order-service` |
| Payment succeeds, order is not created | order-service could not reach product-service for stock | `docker compose ps product-service`; there is no circuit breaker, so fix that service |
| The Stripe redirect lands on the wrong port | `FRONTEND_URL` changed without rebuilding the frontend | Rebuild the frontend image |
| "Cart is empty" on a visible basket | The session expired between loading the page and paying | Sign in again |

**After any failed checkout, check stock.** A multi-line order that failed part
way leaves the earlier lines' stock already reduced (`BUG-01`). Compare the
product quantities against what was actually ordered, and correct them by hand.

---

## 11. Recovery Procedures

Ordered from least to most destructive. **Never skip to the last one.**

### Restart one service

```bash
docker compose restart <service>
```

Safe, keeps all data. Allow 30 seconds for Eureka registration.

### Restart everything

```bash
docker compose down
docker compose up -d
```

Keeps all data — `down` without `-v` does not touch volumes.

### Rebuild after a configuration change

```bash
# a Config Server file changed
docker compose build config-server
docker compose up -d config-server
docker compose restart user-service product-service order-service notification-service

# a VITE_* value changed
docker compose build frontend && docker compose up -d frontend
```

### Rebuild everything

```bash
docker compose build --no-cache
docker compose up -d
```

Slow (the full Maven and npm build), keeps data.

### ⚠️ Erase all data and start fresh

```bash
docker compose down -v
docker compose up -d --build
COMPOSE_PROFILES=prod,seed docker compose up -d     # reload the demo catalogue
```

**This deletes every product, account, order and address, permanently.** It is
the right move for a corrupted development database or an `init-db` change, and
the wrong move for anything you would miss.

### Back up before doing that

There is no backup feature, so take a dump by hand:

```bash
docker compose exec mysql mysqldump -uroot -proot \
  --databases ecommerce ecommerce_product ecommerce_order > backup.sql
```

Restore:

```bash
docker compose exec -T mysql mysql -uroot -proot < backup.sql
```

Uploaded product images live in a separate volume and are not in that dump.

---

## 12. Escalating: What to Collect

When handing a problem to whoever maintains the code, collect all of this — it
is nearly always enough to diagnose without reproducing:

```bash
docker compose ps                    > diag-ps.txt
docker compose logs --tail=300       > diag-logs.txt
docker compose config                > diag-config.txt   # ⚠️ contains secrets
```

Plus:

| Item | Why it matters |
|---|---|
| What you did, and what you expected | Distinguishes a fault from a limitation |
| The exact error, from the browser console or the terminal | The status code decides which runbook applies |
| When it started, and what changed just before | Configuration changes cause most incidents |
| Whether it is one feature or everything | Narrows it to a service immediately |
| The Eureka page, http://localhost:8761 | Says which services are registered |
| `SPRING_PROFILES_ACTIVE` and `COMPOSE_PROFILES` | Mismatched profiles cause a whole class of failures |

> **Before sharing `diag-config.txt` or any `.env`, remove the secret values.**
> They contain the Stripe key, the mail password and database credentials. Name
> the variable, never its value — the same rule the project's development log
> follows ([../dev-log/README.md](../dev-log/README.md)).

If the problem looks like a defect rather than a misconfiguration, check
[../backend/known-defects.md](../backend/known-defects.md) first — it may already
be there, with a workaround.
