# Observability

How the platform is measured: what every service exposes, what Prometheus
stores, what the Grafana dashboards show, and how to read them during a load
run.

Until this was added, the only way to answer "is it slow?" was to click the
shop and guess, and the only way to answer "why?" was to read seven container
logs side by side. Metrics replace both.

> **Scope.** This covers *metrics*. There is no distributed tracing and no log
> aggregation — a cross-service request still has to be correlated by hand
> across container logs. Both remain on the roadmap in
> [../architecture/system-overview.md](../architecture/system-overview.md).

---

## Table of Contents

1. [The shape of it](#1-the-shape-of-it)
2. [Starting it](#2-starting-it)
3. [What each service exposes](#3-what-each-service-exposes)
4. [Configuration, and why each key is there](#4-configuration-and-why-each-key-is-there)
5. [Prometheus](#5-prometheus)
6. [The dashboards](#6-the-dashboards)
7. [Reading a load run](#7-reading-a-load-run)
8. [Alerts](#8-alerts)
9. [Security caveats](#9-security-caveats)
10. [Changing something](#10-changing-something)
11. [When there is no data](#11-when-there-is-no-data)

---

## 1. The shape of it

```
                         scrape /actuator/prometheus every 10s
 ┌─────────────┐        ┌──────────────────────────────────────┐
 │ api-gateway │◄───────┤                                      │
 │ user        │◄───────┤            Prometheus                │
 │ product     │◄───────┤   (TSDB, 15d retention, alert rules) │
 │ order       │◄───────┤              :9090                   │
 │ notification│◄───────┤                                      │
 │ config      │◄───────┤                                      │
 │ discovery   │◄───────┤                                      │
 └─────────────┘        └──────────────────┬───────────────────┘
   Micrometer                              │ PromQL
   registry                                ▼
                        ┌──────────────────────────────────────┐
                        │  Grafana :3000 (published on 3001)   │
                        │  provisioned datasource + dashboards │
                        └──────────────────────────────────────┘
```

Nothing is pushed. Each JVM keeps its own counters in memory and hands them
over when asked; Prometheus does the asking, on a 10-second interval, and
Grafana only ever reads from Prometheus. A service that is down is not an
error condition anywhere — it is simply a target that stops answering, which
is itself the `up == 0` signal.

Both containers sit on `ecommerce-network` alongside the services, which is
why the scrape targets in `prometheus.yml` are Compose service names.

| Piece | Where it lives |
|---|---|
| Metric registry, per service | Micrometer, via `spring-boot-starter-actuator` + `micrometer-registry-prometheus` in each `pom.xml` |
| Exposure and histogram settings | `backend/config-server/src/main/resources/config/<service>.yml`, and each platform service's own `application.yaml` |
| Scrape configuration | [`backend/observability/prometheus/prometheus.yml`](../../backend/observability/prometheus/prometheus.yml) |
| Recording and alert rules | [`backend/observability/prometheus/rules/techzone.yml`](../../backend/observability/prometheus/rules/techzone.yml) |
| Datasource and dashboard providers | `backend/observability/grafana/provisioning/` |
| Dashboards | `backend/observability/grafana/dashboards/*.json` |
| Containers | The `observability` profile in [`backend/docker-compose.yml`](../../backend/docker-compose.yml) |

---

## 2. Starting it

Both containers are behind the `observability` Compose profile, so the
everyday stack is exactly as small as it was:

```bash
# from the repository root — the whole stack plus metrics
COMPOSE_PROFILES=prod,observability docker compose up -d

# with the demo catalogue as well, which is what a load run needs
COMPOSE_PROFILES=prod,seed,observability docker compose up -d

# metrics only, alongside a stack that is already up
docker compose --profile observability up -d
```

**Mode 3 (hybrid dev) needs one change.** The scrape targets are Compose
service names, and in hybrid dev the business services run from the IDE on the
host, where those names resolve to nothing. `prometheus.yml` carries a
commented-out `techzone-hybrid-dev` job with `host.docker.internal` targets for
exactly this: uncomment it, comment out `techzone-services`, and reload. On
plain Linux, Prometheus also needs
`extra_hosts: ["host.docker.internal:host-gateway"]` in the Compose file.

| Address | What it is |
|---|---|
| <http://localhost:3001> | Grafana. Anonymous viewing; sign in as `admin` to change anything |
| <http://localhost:9090> | Prometheus: query browser, target health, firing alerts |
| <http://localhost:9090/targets> | The seven scrape targets and when each was last read |
| `http://localhost:8080/actuator/prometheus` | The gateway's raw metrics, for a sanity check |

`GRAFANA_PORT` defaults to **3001**, not 3000: port 3000 is one of the origins
the gateway allows for CORS, so it is left free for a frontend dev server.

There is **no `depends_on`** from Prometheus or Grafana onto the business
services. They live in a different Compose profile, and a cross-profile
dependency breaks when `observability` is started on its own. Prometheus
retries a target it cannot reach, so a service that starts two minutes later
simply appears in the graphs two minutes later.

---

## 3. What each service exposes

Every service exposes exactly four actuator endpoints and nothing else:

| Endpoint | Why it is on |
|---|---|
| `/actuator/health` | What a human and a Compose healthcheck read |
| `/actuator/info` | Build identity |
| `/actuator/metrics` | Ad-hoc inspection of a single meter without PromQL |
| `/actuator/prometheus` | The scrape endpoint |

The families that matter:

| Metric | Where from | What it answers |
|---|---|---|
| `http_server_requests_seconds_{count,sum,bucket}` | Every service | Throughput, latency percentiles and error rate, tagged by `uri`, `method`, `status`, `outcome` |
| `spring_cloud_gateway_requests_seconds_*` | api-gateway | The same, per route id, as measured at the edge |
| `jvm_memory_used_bytes`, `jvm_gc_pause_seconds_*` | Every service | Heap pressure and GC cost |
| `process_cpu_usage`, `system_cpu_usage` | Every service | Whether the JVM or the host is the constraint |
| `tomcat_threads_busy_threads`, `tomcat_threads_config_max_threads` | Servlet services | Saturation: the number that flattens at its ceiling before latency climbs |
| `hikaricp_connections_{active,idle,pending}` | user, product, order | Database pool pressure — three services, one MySQL ([ADR-0008](../architecture/decisions/0008-single-mysql-multiple-databases.md)) |
| `rabbitmq_published_total`, `spring_rabbitmq_listener_seconds_*` | user, order, notification | Whether the notification pipeline is keeping up ([ADR-0005](../architecture/decisions/0005-rabbitmq-for-notifications.md)) |
| `up` | Prometheus itself | Whether the target answered at all |

Every meter carries `application="<service name>"`, a Micrometer common tag,
so a query can be sliced by service without knowing anything about ports.

---

## 4. Configuration, and why each key is there

The business services get their management block from the Config Server, in
the profile-independent `config/<service>.yml`; the gateway, Config Server and
Discovery Service carry theirs in their own `application.yaml` because they
are not Config Server clients for this purpose.

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: always
  metrics:
    tags:
      application: ${spring.application.name}
    distribution:
      percentiles-histogram:
        http.server.requests: true
      slo:
        http.server.requests: 100ms,200ms,500ms,1s,2s
```

| Key | Why |
|---|---|
| `endpoints.web.exposure.include` | An allowlist. `env`, `beans`, `configprops` and `heapdump` stay off — several of them print configuration values |
| `metrics.tags.application` | The common tag every dashboard groups by |
| `distribution.percentiles-histogram` | **The one that matters.** Without it Prometheus only ever receives a count and a sum, and no percentile can be computed after the fact. It is not retroactive: a run measured without it cannot be re-analysed with it |
| `distribution.slo` | Extra histogram buckets at the boundaries actually cared about, so `histogram_quantile` interpolates between useful edges rather than the default ones |
| `server.tomcat.mbeanregistry.enabled` (servlet services) | Tomcat publishes its pool counters through JMX only. Without this flag `tomcat_threads_*` is simply absent, which is what an empty "busy threads" panel means |

Gateway route metrics (`spring.cloud.gateway.requests`) need no property: they
appear as soon as actuator is on the classpath. The gateway's block adds a
histogram for them too.

Every key above is listed in
[configuration-reference.md](configuration-reference.md) with when a change
takes effect. In short: these live in Config Server, so a change needs a
`config-server` rebuild and a restart of the client service — the native
profile bakes configuration into the image ([ADR-0006](../architecture/decisions/0006-config-server-native-profile.md)).

---

## 5. Prometheus

`prometheus.yml` holds two jobs — `techzone-services` for the five
business-facing JVMs, `techzone-platform` for Config Server and Discovery —
plus Prometheus scraping itself. Both application jobs set `honor_labels:
true`, because the exposed metrics already carry `application`; without it
Prometheus would keep the target's label and rename the exposed one to
`exported_application`.

The interval is **10 seconds**, which is short for production and deliberate
here: a load run lasts minutes, and a 30-second interval would leave a
five-point graph.

Retention is 15 days on the `prometheus_data` volume, so last week's run is
still comparable. `--web.enable-lifecycle` is on, so an edit to the scrape
config can be applied without a restart:

```bash
curl -X POST http://localhost:9090/-/reload
```

### Queries worth knowing

```promql
# Throughput per service
sum by (application) (rate(http_server_requests_seconds_count[1m]))

# p95 latency per service
histogram_quantile(0.95, sum by (application, le) (rate(http_server_requests_seconds_bucket[5m])))

# p95 per endpoint, for one service
histogram_quantile(0.95, sum by (uri, le) (rate(http_server_requests_seconds_bucket{application="product-service"}[5m])))

# Server-error ratio
sum by (application) (rate(http_server_requests_seconds_count{outcome="SERVER_ERROR"}[5m]))
  / sum by (application) (rate(http_server_requests_seconds_count[5m]))

# What is saturated
tomcat_threads_busy_threads / tomcat_threads_config_max_threads
hikaricp_connections_pending > 0
```

Three recording rules — `techzone:request_rate:5m`, `techzone:error_ratio:5m`,
`techzone:latency_p95:5m` — exist so the dashboards and the alerts compute the
same numbers the same way. A dashboard that disagrees with the alert that
fired is worse than having neither.

---

## 6. The dashboards

Both are provisioned from the repository and are **read-only in the UI**. To
change one, edit the JSON and let the provisioner reload it — that is the
point of provisioning them.

### TechZone — Service Overview (`techzone-overview`)

The "is anything wrong, and where" view. Four headline numbers — targets up,
total throughput, 5xx ratio, gateway p95 — then per-service throughput, error
ratio and p50/p95/p99, then the four saturation signals: heap, Tomcat threads,
Hikari connections, CPU and GC. The last panel is the RabbitMQ publish and
consume rate.

### TechZone — Ordering & Catalogue APIs (`techzone-endpoints`)

The "which endpoint" view, and the one to have open during a load run.
Per-URI p95 for the catalogue and for ordering side by side, throughput and
status mix for a service picked from the `Service` dropdown, a table of the
ten slowest endpoints right now, gateway route latency, and the outcome mix
for cart and checkout specifically.

Both have a **Rate window** dropdown (1m / 5m / 15m). Use 1m while watching a
run live, 5m when comparing runs — a 1-minute window on a 5-minute run is
mostly noise.

---

## 7. Reading a load run

The JMeter plans in [`tests/load/`](../../tests/load/README.md) and these
dashboards are two halves of one measurement: the report says what the client
saw, the dashboards say what the server was doing at that moment.

An order to read them in:

1. **Errors first, on the endpoint dashboard.** A run that failed half its
   samples has a beautiful p95, because a rejected request is a fast one.
   Split 4xx from 5xx: a 400 from add-to-cart once the seeded stock is bought
   out is expected traffic, a 500 is not.
2. **Throughput next.** It should plateau after the ramp. If it plateaus
   *below* what the thread count implies, the platform is the constraint, and
   the next panel says where.
3. **Then the percentiles.** p50 flat while p99 climbs is queueing, not slow
   code. Both climbing together is genuinely slower work.
4. **Then saturation.** Whichever of Tomcat threads, Hikari connections, heap
   or CPU reaches its ceiling first *is the finding*. The latency number is
   only the symptom.
5. **Finally, compare client and server percentiles.** A large gap is queueing
   at the edge — or the load generator itself saturating, which is why the
   generator should not share a laptop with the stack.

Two shapes are predicted by the code and worth looking for specifically:

- **Catalogue search degrading before listing.** The keyword and facet filters
  are `LIKE '%…%'` predicates over joined tables, which no index can help, so
  search should sit visibly above plain listing on the per-URI panel.
- **order-service saturating on product-service's behalf.** Placing an order
  holds a Tomcat thread for the whole synchronous stock call, with no timeout
  ([ADR-0009](../architecture/decisions/0009-resttemplate-for-service-calls.md)),
  so a slow catalogue appears as busy threads in the *ordering* service.

---

## 8. Alerts

Three rules, evaluated every 10 seconds:

| Alert | Fires when | For |
|---|---|---|
| `ServiceDown` | `up == 0` on any target | 1 min |
| `HighServerErrorRate` | 5xx ratio above 5% | 2 min |
| `SlowResponses` | p95 above 1s | 2 min |

There is **no Alertmanager**. Alerts appear as "firing" on
<http://localhost:9090/alerts> and are delivered nowhere. That is deliberate
at this scale: a receiver is a configuration change, not a code change, and
paging nobody is more honest than pretending there is an on-call rotation.

The 1-second latency threshold is deliberately looser than the 500 ms budget
`NFR-PRF-1` sets for a catalogue page in
[../requirements/srs.md](../requirements/srs.md): an alert that fires on a
near-miss gets ignored. The other two are round numbers chosen to stay quiet
during normal browsing and to speak up during a stress stage.

---

## 9. Security caveats

- **The actuator endpoints are unauthenticated.** Inside the Docker network
  that is fine, but the service ports are published to the host in this stack,
  so `http://localhost:8081/actuator/prometheus` answers anyone on the
  machine. The exposure allowlist is what keeps that boring: no `env`, no
  `configprops`, no `heapdump`, so no configuration value is readable through
  it. Metric *names and shapes* — endpoints, error counts — are still visible.
- **The gateway does not route `/actuator/**`.** Its own actuator is served
  locally, before the routing chain, so `AuthenticationFilter` never sees it;
  and no route matches `/actuator`, so the pattern is not reachable through
  the gateway for any downstream service either.
- **Grafana allows anonymous viewers** and ships with `admin`/`admin` unless
  `GRAFANA_ADMIN_PASSWORD` is set. Fine on a laptop, not fine anywhere with a
  public address.
- **A real deployment should bind the metrics endpoints to an internal
  interface**, or put them on a separate management port with
  `management.server.port`, rather than leaving them on the service port.

---

## 10. Changing something

| Change | What to do | When it takes effect |
|---|---|---|
| A dashboard panel | Edit the JSON in `backend/observability/grafana/dashboards/` | Within 30s — the provisioner polls |
| A new scrape target | Add it to `prometheus.yml` | `curl -X POST localhost:9090/-/reload` |
| An alert threshold | Edit `prometheus/rules/techzone.yml` | Same reload |
| Exposed endpoints, histograms, tags for a business service | Edit `config/<service>.yml` in Config Server | Rebuild `config-server`, restart the client service |
| The same for gateway, config or discovery | Edit that service's `application.yaml` | Rebuild and restart that service |
| Instrumenting a new service | Add both dependencies to its `pom.xml`, the management block to its configuration, and a target to `prometheus.yml` | Rebuild |

A dashboard edited in the Grafana UI is discarded on the next provisioner
reload. That is intentional, and it is why `allowUiUpdates` is `false`: the
repository is the source of truth, and a dashboard that only exists in a
container's volume is lost with the volume.

---

## 11. When there is no data

| Symptom | Cause | Fix |
|---|---|---|
| A target is `DOWN` on `/targets` | The service is not running, or not on `ecommerce-network` | `docker compose ps`; check the container joined the network |
| A target is `UP` but every panel is empty | The service is up but has served no requests yet | Click through the shop, or run the smoke stage |
| `404` on `/actuator/prometheus` | `micrometer-registry-prometheus` missing, or `prometheus` not in the exposure list | Check the service's `pom.xml` and its Config Server file; rebuild |
| Latency panels empty, throughput fine | `percentiles-histogram` is off for that service — only `_count` and `_sum` exist | Add the distribution block; note that past data cannot be recovered |
| "Busy threads" empty for one service | `server.tomcat.mbeanregistry.enabled` missing | Add it; WebFlux services (the gateway) have no Tomcat metrics by design |
| Grafana shows "datasource not found" | The dashboard references `uid: prometheus` and the datasource provisioning did not load | Check the `grafana` container log; the provisioning directory is mounted read-only |
| Everything empty after `docker compose down -v` | The `prometheus_data` volume was dropped with everything else | Expected. History starts again |

---

## Related documents

| Question | Document |
|---|---|
| How the load is generated, and what a run means | [../quality/performance-testing.md](../quality/performance-testing.md), [`tests/load/README.md`](../../tests/load/README.md) |
| Why Prometheus and Grafana, and what was given up | [ADR-0010](../architecture/decisions/0010-prometheus-grafana-metrics.md) |
| Every configuration key, and when a change takes effect | [configuration-reference.md](configuration-reference.md) |
| Container topology and Compose layout | [docker-setup.md](docker-setup.md) |
| Diagnosing a broken stack | [troubleshooting-runbook.md](troubleshooting-runbook.md) |
| The defects these dashboards are expected to expose | [../backend/known-defects.md](../backend/known-defects.md) |
