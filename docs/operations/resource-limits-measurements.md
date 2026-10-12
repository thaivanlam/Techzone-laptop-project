# Resource Limits — Recorded Measurements

What was measured with the two resource overlays, and under what conditions.
The overlays themselves, the reasoning behind their numbers and the procedure
these runs followed are in [resource-limits.md](resource-limits.md).

Newest first. A measurement goes here as numbers with its environment stated;
raw samples are not kept in the repository.

---

## 2026-10-12 — first validation of both overlays

**Environment.** The reference laptop (12 logical cores, 15.7 GB, Docker Desktop
on WSL2, 7.6 GiB VM). Images built the same day from backend `7909842`. Compose
profile `prod`; the `observability` profile was **off** for every figure below,
so Prometheus and Grafana are not in the totals and GC figures were read from
`/actuator/prometheus` directly. Catalogue of 14 products; the order database
still held 15 511 orders left by the August load runs. JMeter 5.6.3 on JDK 25,
on the same machine as the stack.

**Every figure is one run.** Nothing was repeated, so small differences are
not findings.

### Memory at rest

`docker stats`, MiB. The columns were not taken at the same uptime, which
matters: a JVM keeps growing slowly for a while after it starts.

| Container | No overlay | Benchmark | Dev | Dev, after the functional suites |
|---|---|---|---|---|
| | *25 min up, idle* | *2 min after start* | *3 min after start, smoke run* | *~10 min up* |
| config-server | 227 | 185 | 134 | 134 |
| discovery-service | 269 | 254 | 180 | 182 |
| api-gateway | 334 | 318 | 188 | 190 |
| user-service | 361 | 317 | 261 | 264 |
| product-service | 464 | 420 | 274 | 279 |
| order-service | 431 | 399 | 266 | 397 |
| notification-service | 279 | 240 | 159 | 160 |
| **Seven JVMs** | **2 365** | **2 133** | **1 462** | **1 606** |
| keycloak, mysql, rabbitmq, frontend | 1 270 | 1 283 | 1 314 | 1 316 |
| **Whole stack** | **3 635** | **3 416** | **2 776** | **2 922** |

What this supports:

- **The development overlay cut the seven JVMs by 760–900 MiB**, roughly a
  third, and the whole stack from about 3.6 GiB to 2.8–2.9 GiB. The range is
  the difference between a freshly started stack and one that has done some
  work; the lower end flatters the overlay, because the unlimited column had
  been up eight times as long.
- **The benchmark overlay saves little at rest, as intended.** Its job is the
  ceiling, not the footprint. Most of the 230 MiB difference is probably uptime.
- **order-service is the one to watch.** Two requests to the seller order list
  — which loads every order into memory (`BUG-17`) — took it from 266 to
  397 MiB, 69% of its 576 MiB ceiling, with the heap at 192 MiB committed of a
  possible 259. It was not killed, but that is the least headroom anywhere.

Inside the JVMs under the development overlay, after the functional suites:
max heap resolved to 144 / 174 / 202 / 260 MiB as [the limits table](resource-limits.md#4-limits-and-what-they-assume) predicts; SerialGC on all
seven; metaspace 39–100 MiB; code cache 9–19 MiB of the 64 allowed; 29–61
threads. No `OutOfMemoryError`, `StackOverflowError` or `CodeCache is full` in
any log.

### What `TieredStopAtLevel=1` is worth

The same development overlay with that one flag removed, same procedure:

| | With the flag (shipped) | Without it |
|---|---|---|
| Seven JVMs at rest | 1 462 MiB | 1 810 MiB |
| Seller order list, steady state | 17.5 s | 7.3 s |

About 350 MiB for a 2.4× slowdown on the one CPU-bound endpoint that was timed.
For an overlay whose purpose is footprint, the flag stays; the price is stated
in [the flag table](resource-limits.md#3-jvm-flags-and-the-reason-for-each) and in the functional results below.

### Startup

Spring's own "Started … in N seconds", one cold start each, all seven
containers starting together:

| Service | Benchmark | Dev |
|---|---|---|
| config-server | 13.6 s | 5.8 s |
| discovery-service | 17.3 s | 8.4 s |
| api-gateway | 8.1 s | 9.5 s |
| user-service | 29.2 s | 17.1 s |
| product-service | 27.1 s | 17.1 s |
| order-service | 27.6 s | 17.5 s |
| notification-service | 31.5 s | 9.1 s |
| `up -d` until the catalogue answered through the gateway | 123 s | 104 s |

The development overlay starts faster despite one core per service: C1-only
compilation does far less work at boot, and seven JVMs no longer compete for
every core at once. The healthchecks on config-server, discovery-service and
api-gateway passed in both modes, with no failed probe in the retained history.
Startup with no overlay was not timed.

### Load stage, with and without the benchmark overlay

`catalogue-browse`, `load` stage (20 threads, 5 minutes, 0.5–1.5 s think time),
after one `smoke` run as warm-up; figures from the last three quarters of each
run, per [the comparison procedure](resource-limits.md#8-comparing-two-configurations).

| Measure | No overlay | Benchmark overlay |
|---|---|---|
| Samples / errors / 5xx | 5 595 / 0 / 0 | 5 530 / 0 / 0 |
| Throughput at the plateau | 19.6 req/s | 19.4 req/s |
| All samplers p50 / p95 / p99 | 11 / 41 / 83 ms | 14 / 47 / 78 ms |
| Catalogue page p95 | 53 ms | 64 ms |
| Keyword search p95 | 42 ms | 50 ms |
| Whole stack memory, mean / peak | 3 694 / 3 786 MiB | 3 510 / 3 561 MiB |
| product-service memory, mean | 488 MiB | 457 MiB |
| product-service CPU, mean | 19% of a core | 24% of a core |
| api-gateway CPU, mean | 16% | 17% |
| product-service GC pauses during the run | 15, 468 ms in total | 16, 175 ms in total |
| OOM kills, restarts | 0 | 0 |

**Verdict.** No regression that this run can distinguish from noise: throughput
is the same, there are no errors, and p95 moved by 6 ms on a figure that varies
by more than that between identical runs. The JVMs under the overlay had been up
for a few minutes against twenty-five, which is the likelier explanation for
the slightly higher median. This shows the overlay does not *obviously* hurt at 20
users. It does not show that it is harmless at the knee — nothing here loaded a
CPU ceiling, and the stress stage was not run.

The collector was G1 on both sides, confirmed with `jcmd 1 VM.flags`.

### Functional checks under the development overlay

The suites in [`tests/`](../../tests/README.md) that neither place an order nor
create an account: `system/gateway-routing`, `system/access-control`,
`system/catalogue`, `acceptance/shopping`, plus the `frontend/` unit tests.
Between them they sign in as customer, seller and administrator (a password
grant against Keycloak), browse and search the catalogue, and add to, change and
empty a cart.

| Run | Result |
|---|---|
| `frontend/` unit tests | 44 of 44 pass |
| The four live suites, default 15 s request timeout | 58 of 60 pass |
| The same, `REQUEST_TIMEOUT_MS=30000` | 59 of 60 pass |

The two failures:

- **`reaches the seller order list` — times out, and the overlay is the
  cause.** The endpoint is slow in every configuration on this database,
  because it loads all 15 511 orders (`BUG-17`); the overlay moves it from just
  under the test's 15-second limit to just over.

  | order-service configuration | Three consecutive requests |
  |---|---|
  | No overlay | 15.0 s, 13.3 s, 9.1 s |
  | Benchmark overlay | 13.3 s, 10.0 s, *(third answered `503` at the gateway)* |
  | Development overlay | 17.3 s, 17.4 s, 17.7 s |
  | Development, without `TieredStopAtLevel=1` | 14.3 s, 9.1 s, 7.3 s |
  | Development, with two cores | 17.2 s, 14.8 s, 13.9 s |

  It passes with a longer timeout, and should on a database that has not been
  through a load run — that was not tried. Under the development overlay, run the live suites
  with `REQUEST_TIMEOUT_MS=30000` — or reset the data.

- **`answers an unknown prefix with 404` — gets 401, unrelated to the
  overlay.** The gateway's security chain ends in `anyExchange().authenticated()`,
  so an anonymous request to an unrouted path is refused before routing is
  considered. The test and the rule disagree; which of them is right was not
  looked into, and both were left as found.

**Not run:** placing an order, payment, the `order-checkout` load plan, and the
three suites that create accounts in the realm (`system/cart-and-checkout`,
`acceptance/account`, `acceptance/staff`). Sign-in through the browser's
redirect flow, as opposed to a password grant, was not exercised either.
