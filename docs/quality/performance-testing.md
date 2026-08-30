# Performance Testing

How the platform is put under concurrent load, what is measured while it is,
and what a result means.

This is the fifth level of testing, sitting beside the four functional levels
in [test-plan.md](test-plan.md). Those answer *does it do the right thing*.
This one answers *for how many people at once, and what gives way first*.

The plans live in [`tests/load/`](../../tests/load/README.md); the metrics
they are read against are described in
[../operations/observability.md](../operations/observability.md).

**Status:** the harness and the instrumentation are in place, and the first
full-stack run at the load stage is recorded in §7 — 11 060 samples, zero
errors, three defects confirmed (one of them new). The stress and spike stages
have not been run, and `NFR-PRF-1` is still unverified: it asks for 1 000
products and the seeded catalogue holds 14.

---

## Table of Contents

1. [What is being tested, and what is not](#1-what-is-being-tested-and-what-is-not)
2. [The two workloads](#2-the-two-workloads)
3. [The four stages](#3-the-four-stages)
4. [Environment, and what it invalidates](#4-environment-and-what-it-invalidates)
5. [Acceptance thresholds](#5-acceptance-thresholds)
6. [Procedure](#6-procedure)
7. [Recorded runs](#7-recorded-runs)
8. [Predicted bottlenecks](#8-predicted-bottlenecks)
9. [Test data, and cleaning up after a run](#9-test-data-and-cleaning-up-after-a-run)
10. [What this level does not cover](#10-what-this-level-does-not-cover)

---

## 1. What is being tested, and what is not

**In scope.** The two paths a real shop lives or dies by, driven through the
API Gateway exactly as a browser drives them:

- **Catalogue** — paged listing with sorting, brand and category facets,
  keyword search, a product's specifications. Anonymous, read-only.
- **Ordering** — register, sign in, find something in stock, add it to the
  cart, read the cart, place the order, read the order history. Authenticated,
  and it writes.

Both go through the gateway. Nothing is called service-to-service directly:
the routing hop, the JWT check on every request and the load-balancer lookup
are part of what is being measured, because they are part of what a user
waits for.

**Out of scope, on purpose.** Admin and seller screens (low concurrency by
nature — with one exception noted in §8), image upload, Stripe payment (a
third-party endpoint under load is their test, not ours), and the notification
consumer's own throughput, which is asynchronous and therefore not on the
critical path a shopper feels.

---

## 2. The two workloads

| Plan | Threads model | Writes | What it is for |
|---|---|---|---|
| [`catalogue-browse.jmx`](../../tests/load/catalogue-browse.jmx) | Anonymous browsers, think time 0.5–1.5s | Nothing | Read throughput and search latency |
| [`order-checkout.jmx`](../../tests/load/order-checkout.jmx) | One registered account per thread | Accounts, carts, orders, stock | The cross-service write path under contention |

Two design decisions in the ordering plan are worth stating, because they are
the difference between a measurement and an artefact:

- **Every thread registers its own account.** The seeded demo accounts have
  one cart each, and two threads writing the same cart corrupts it
  permanently — that is `BUG-21`, and the system suite found it by doing
  exactly that. Sharing an account would measure the corruption, not the
  platform.
- **Think time is not zero** at the load stage. A run with no pause measures
  how fast the server can be flooded by twenty threads, which is a number
  about JMeter. The pause makes twenty threads mean roughly twenty people.

Both plans keep a cookie jar per thread, so authentication is exercised the
way a browser exercises it rather than through a bearer-token shortcut.

---

## 3. The four stages

| Stage | Threads | Ramp | Duration | Think | Question it answers |
|---|---|---|---|---|---|
| Smoke | 2 | 1s | 60s | 0.5–1.5s | Do the plan and the stack agree at all? |
| Load | 20 | 30s | 5 min | 0.5–1.5s | How does it behave at the expected busy hour? |
| Stress | 100 | 60s | 10 min | 0.2–0.5s | Where does it bend, and which service first? |
| Spike | 200 | 5s | 2 min | 0–0.2s | What happens when everyone arrives at once — and does it recover? |

Run them in that order, and always run smoke first after changing anything:
it costs a minute and catches the failure that otherwise wastes ten — an
unseeded catalogue, a gateway on another port, a stale image.

Spike is as much about the recovery as the peak. Latency during the spike is
expected to be bad; what matters is whether throughput returns to its previous
plateau afterwards, or whether something stays broken.

### The capacity ramp

The four stages answer "how does it behave at *this* load". Finding the point
where it bends needs a different instrument: the same plan run repeatedly with
**one variable changed and everything else held**, until throughput stops
rising.

```bash
# hold think time, raise threads — this measures "more users"
for n in 20 50 200 800; do
  ./run.sh catalogue-browse load --no-report -Jthreads=$n -Jrampup=20 -Jduration=150
done

# then drop think time to zero and raise threads again — this concentrates the
# same offered load into far fewer threads, so the generator stays out of the way
for n in 100 200 500; do
  ./run.sh catalogue-browse load --no-report \
    -Jthreads=$n -Jrampup=15 -Jduration=120 -Jthink.time=0 -Jthink.range=0
done
```

Two rules make the result readable:

- **Change one thing per step.** The canned `stress` stage changes threads
  *and* think time at once, which is fine for "is it still alive at 100 users"
  and useless for locating a knee.
- **Read the plateau, not the run.** Discard the first quarter of each step:
  it contains the ramp, JIT warm-up and a cold buffer pool. In the ramp
  recorded in §7 the platform was three times *faster* at 800 threads than at
  20, purely because it had warmed up.

The knee is the step where throughput stops rising while latency keeps
growing. What is saturated at that step is the finding; everything after it is
queueing.

---

## 4. Environment, and what it invalidates

The reference environment is the Compose stack with the demo catalogue and the
observability profile:

```bash
COMPOSE_PROFILES=prod,seed,observability docker compose up -d
```

Every recorded run must state:

- host CPU, RAM and whether the stack and the load generator shared it;
- the submodule commits the images were built from;
- whether the catalogue was freshly seeded;
- the JMeter version and the stage.

**A run from the same laptop as the stack is not a capacity figure.** JMeter
and eleven containers compete for the same cores, and the p99 pays for it.
Same-machine runs are still useful for *before and after a change*, as long as
nothing else changed. Anything quoted as a capacity number needs the generator
on a separate machine, pointed at the stack with `-Jgateway.host=`.

Two further distortions worth naming, because they are properties of this
stack rather than of the platform: MySQL, three services and the metrics
stack share one Docker host, and the JVMs are cold at the start of a run —
the first thirty seconds include JIT warm-up and Hibernate's first-query
overhead. Read the plateau, not the ramp.

---

## 5. Acceptance thresholds

These are the numbers a run is judged against. The catalogue row is
`NFR-PRF-1` in [../requirements/srs.md](../requirements/srs.md) — p95 under
500 ms at 1 000 products, measured at the gateway. The rest are round numbers
chosen to be strict enough to be worth missing.

| Measure | Load stage | Stress stage |
|---|---|---|
| Catalogue page p95 (`NFR-PRF-1`) | < 500 ms | < 3s |
| Catalogue page p99 | < 1s | — |
| Add to cart p95 | < 1s | < 3s |
| Place order p95 | < 2s | < 5s |
| 5xx ratio | 0% | < 1% |
| Throughput | Plateaus, does not sag over the run | — |
| Recovery after spike | Throughput returns to the load-stage plateau within 60s | — |

The Prometheus `SlowResponses` alert fires at a p95 of **1s**, which is
looser on purpose: an alert at the NFR budget would fire on a near-miss, and
an alert that fires on near-misses gets ignored. Missing 500 ms is a finding
to write up here; passing 1s is a problem to go and look at now.

4xx is excluded from the error budget on purpose. A `400` from add-to-cart
once a stress run has bought the seeded stock out is the platform working
correctly, and so is the `400` a keyword matching nothing produces — though
that one is `BUG-04` rather than good manners. Only 5xx counts as failure.

A run that misses a threshold is not automatically a defect: it is a finding
that names *which* resource ran out. The saturation panel that flattened first
is the finding; the latency number is the symptom.

---

## 6. Procedure

1. **Start a clean stack** with a freshly seeded catalogue and the
   observability profile. Rebuild if either submodule moved — the containers
   run the image, not the working tree.
2. **Confirm the metrics side is live**: seven targets `UP` at
   <http://localhost:9090/targets>, and the Grafana overview showing traffic
   when the shop is clicked.
3. **Smoke both plans.** Zero errors, or stop and find out why.
4. **Run one stage of one plan at a time.** Two plans at once measures the
   pair, and neither number then belongs to either path.
5. **Watch the endpoint dashboard while it runs**, with the rate window on
   1m. Note what saturates before latency climbs — that ordering is the whole
   point.
6. **After the run**, read the JMeter HTML report: errors first, then
   throughput, then percentiles. Compare its percentiles against Grafana's for
   the same window; a large gap is queueing at the edge or a saturated
   generator, not a slow service.
7. **Record the run in §7** — the four headline numbers, the first thing to
   saturate, and anything that changed as a result.
8. **Reset the data** before the next run that writes (§9).

---

## 7. Recorded runs

### 2026-08-29 — first full-stack run, both plans, load stage

**Environment.** Windows laptop, Docker Desktop; the stack and the load
generator shared the machine, so these are *comparison* numbers, not capacity
numbers (§4). Compose profiles `prod,seed,observability`, images rebuilt from
the working tree that added the metrics; JMeter 5.6.3 on JDK 25. The seeded
catalogue holds **14 products**, and stock was raised to 5 000 per product
first so the run would measure ordering rather than the sold-out path (§9).

| Run | Plan | Threads | Duration | Samples | Errors | Throughput (plateau) |
|---|---|---|---|---|---|---|
| A | `catalogue-browse` | 20 | 5 min | 5 583 | **0** | 19.6 req/s |
| B | `order-checkout` | 20 | 5 min | 5 477 | **0** | 19.2 req/s |

Client-side latency, milliseconds, from the raw samples:

| Step | n | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| **A** Catalogue page (paged, sorted) | 1 125 | 23 | 47 | 61 | 83 | 127 |
| **A** Brand facet | 1 122 | 12 | 21 | 23 | 33 | 38 |
| **A** Categories | 1 115 | 16 | 28 | 32 | 45 | 68 |
| **A** Keyword search | 1 112 | 18 | 37 | 42 | 56 | 76 |
| **A** Product specifications | 1 109 | 15 | 26 | 30 | 39 | 56 |
| **B** Register | 20 | 93 | 132 | 141 | 146 | 146 |
| **B** Sign in | 20 | 84 | 122 | 129 | 135 | 135 |
| **B** Catalogue page | 1 097 | 22 | 60 | 70 | 83 | 95 |
| **B** Add to cart | 1 092 | 38 | 87 | 101 | 119 | 128 |
| **B** Place order | 1 082 | 44 | 91 | 102 | 121 | 152 |
| **B** Order history | 1 080 | 19 | 47 | 55 | 71 | 88 |

Server-side, from Prometheus over the same window — p95 per service, and what
the saturation panels showed:

| Service | p50 | p95 | p99 | Peak Tomcat busy / max | Peak Hikari active / waiting | Peak heap |
|---|---|---|---|---|---|---|
| api-gateway | 15 ms | 67 ms | 98 ms | — (WebFlux) | — | 90 MiB |
| product-service | 8 ms | 36 ms | 58 ms | 3 / 200 | 2 / 0 | 133 MiB |
| order-service | 20 ms | 81 ms | 105 ms | 4 / 200 | 3 / 0 | 129 MiB |
| user-service | 82 ms | 123 ms | 132 ms | 1 / 200 | 0 / 0 | 135 MiB |

Gateway route p95: `product-manager` 40 ms, `order-manager` 84 ms,
`user-manager` 125 ms. Slowest endpoints by p95: order placement 93 ms,
add-to-cart 90 ms, catalogue listing 48 ms, the internal `reduce-stock` call
45 ms.

**Verdict against §5.** Every threshold passed with a wide margin — catalogue
p95 61 ms against a 500 ms budget, place-order p95 102 ms against 2 s, zero
5xx across 11 060 samples. **This does not verify `NFR-PRF-1`**, which asks for
p95 under 500 ms at *1 000 products*; this catalogue holds 14, so the query
never left the buffer pool. What the run does establish is a baseline, and that
nothing in the request path is grossly wrong at 20 concurrent users.

**Nothing saturated.** Tomcat peaked at 4 busy threads of 200, Hikari never had
a connection waiting, heap stayed under 135 MiB per JVM. At this concurrency
the platform is not the constraint, which is exactly why the stress stage — not
run yet — is where the predictions in §8 will be settled.

**What the run found.** Three defects, one of them new:

- **BUG-22 (new)** — every order placed with `cod` answered **500**. The
  `Payment.paymentMethod` field carries `@Size(min = 4)` and the check is only
  reached at persist time, so a three-character method fails the transaction
  after stock has already been decremented. The SPA never hits it (it posts
  `online`); the system suite does, but those cases are destructive-gated and
  had never been executed. The load plan now sends `online` and carries a note
  pointing at the register entry.
- **BUG-12 confirmed, and worse than recorded.** `GET
  /products/keyword/{keyword}` answers a *successful* search with `302 FOUND`
  and no `Location` header. JMeter rejects that at transport level — "Missing
  location header in redirect" — before any sampler setting can intervene, so
  the endpoint cannot be load tested at all with this tool. The plan measures
  search through the `?keyword=` filter the SPA actually uses instead.
- **BUG-04 confirmed.** Asking for a page past the last one, or a keyword that
  matches nothing, answers `400 "No Products Exist!!!"` rather than an empty
  page. The plan caps its page range with `page.max` so a run measures the
  query rather than the exception path.

**Follow-up.** Run the stress and spike stages; seed a catalogue of a thousand
products before claiming anything about `NFR-PRF-1`; re-run with the generator
off the machine under test before quoting a throughput figure.

### 2026-08-29 — capacity ramp: where it bends, and on what

The load stage saturated nothing, so the next run was a **capacity ramp**:
concurrency raised step by step with everything else held constant, until
something gave. Same environment as above, same host (12 cores, 8 GB to
Docker, generator on the same machine).

The first four steps hold the load-stage think time and raise threads; the
last three drop think time to zero, which concentrates the same offered load
into far fewer threads and keeps the generator out of the way. Only the
`catalogue-browse` plan is shown — it is read-only, so a step can be repeated
exactly.

| Threads | Think | Client req/s | p50 | p95 | p99 | product p95 (server) | Tomcat busy | Hikari active / waiting | Errors |
|---|---|---|---|---|---|---|---|---|---|
| 20 | 0.5–1.5s | 19.6 | 23 ms | 61 ms | 83 ms | 36 ms | 3 / 200 | 2 / 0 | 0 |
| 50 | 0.5–1.5s | 49 | 12 ms | 34 ms | 57 ms | 23 ms | 2 / 200 | 1 / 0 | 0 |
| 200 | 0.5–1.5s | 199 | 6 ms | 31 ms | 53 ms | 18 ms | 8 / 200 | 7 / 0 | 0 |
| 800 | 0.5–1.5s | 792 | 6 ms | 19 ms | 35 ms | 13 ms | 6 / 200 | 6 / 0 | 0 |
| 100 | none | **2 203** | 41 ms | 111 ms | 156 ms | 101 ms | 93 / 200 | **10 / 78** | 0 |
| 200 | none | 2 089 | 88 ms | 256 ms | 359 ms | 246 ms | 188 / 200 | **10 / 180** | 0 |
| 500 | none | 2 226 | 179 ms | 447 ms | 587 ms | 309 ms | **200 / 200** | **10 / 189** | 0 |

**The knee is at roughly 2 100 req/s.** Past it, throughput is flat — 2 203,
2 089, 2 226 req/s across a 5× increase in concurrency — while latency grows
in proportion to the number of threads: p95 111 ms → 256 ms → 447 ms. That is
the textbook signature of a saturated resource with a queue in front of it.
Below the knee the platform is *faster* the more warmed up it is: p95 fell from
61 ms at 20 threads to 19 ms at 800, because the JIT and the buffer pool had
caught up.

**What saturates, in order.**

1. **The HikariCP connection pool, at its default of 10.** From the first
   no-think step onward it is pinned at 10 active with 78, then 180, then 189
   threads waiting for a connection. This is where the queue forms.
2. **The Tomcat thread pool**, once enough requests are blocked on that queue:
   93 busy, then 188, then all 200 at the 500-thread step.
3. **Nothing else.** No 5xx at any step. No Hikari connection timeouts — the
   waits are hundreds of milliseconds against a 30-second timeout. Heap under
   220 MiB, GC under 2% of wall-clock, MySQL nowhere near its 151-connection
   limit.

**But the pool is not the ceiling.** Raising `maximum-pool-size` to 50 on
product-service and repeating the 200-thread step (an experiment run from an
override file outside the repository, then reverted):

| 200 threads, no think | Pool 10 | Pool 50 |
|---|---|---|
| Client throughput | 2 089 req/s | 2 010 req/s |
| Client p95 | 256 ms | 199 ms |
| product-service p95 | 246 ms | 134 ms |
| Hikari active / waiting | 10 / 180 | 50 / 72 |
| Tomcat busy | 188 | 137 |
| product-service CPU | 34% | 52% |

Latency improved by a fifth and the queue shrank by more than half, but
**throughput did not move**. The pool decides *where requests wait* and
therefore what latency looks like; it does not decide how many the platform can
finish.

**What actually caps it is CPU, and it is the host's.** Sampled during the
200-thread step at the shipped pool size:

| Container | CPU |
|---|---|
| product-service | ~4.0–4.3 cores |
| mysql | ~2.5–2.9 cores |
| api-gateway | ~2.0–2.4 cores |
| **Total** | **~9.3 of 12 cores**, before counting JMeter itself |

So the honest headline is: **on this host, the read path tops out at about
2 100 req/s because the machine runs out of cores — with the load generator
taking a share of them.** The application never fails; it queues. That is a
better answer than a number, because it says what to change: the ceiling moves
when the generator leaves the machine, and only then is it worth asking whether
the pool, the query plan or the service itself is next.

#### The ordering path bends earlier, and somewhere else

The same treatment on `order-checkout`, 200 threads with no think time:

| | Client | order-service | product-service |
|---|---|---|---|
| Throughput | 570 req/s | 456 req/s | 342 req/s |
| p95 | 751 ms | 775 ms | **22 ms** |
| Tomcat busy | — | **200 / 200** | 14 / 200 |
| Hikari active / waiting | — | **10 / 189** | 10 / 1 |
| Errors | 0 | 0 | 0 |

**The prediction in §8 was half right.** order-service does saturate first, and
its Tomcat pool does sit at its ceiling — but *not* on product-service's
behalf. product-service answered in 22 ms throughout and had 14 threads busy of
200. order-service is queueing on its own database connections, exactly as the
catalogue path does. The blocking cross-service call
([ADR-0009](../architecture/decisions/0009-resttemplate-for-service-calls.md))
would amplify a slow catalogue, but at this concurrency the catalogue is not
slow; the pool in front of the writer is what runs out.

The ordering path also finishes about a quarter as many requests per second as
the read path, which is expected: every iteration writes a cart row, an order,
order items and a payment, and makes two synchronous hops into product-service.

#### A defect the ramp found by accident

Recreating the `product-service` container mid-run to change its pool size
produced **86 421 failures in twenty seconds — 87% then 92% of all requests —
followed by complete recovery**. The gateway kept load-balancing to the dead
instance's address until Eureka evicted it, and with no retry filter and no
health-checked instance selection, each of those hops was returned to the
caller as a 503. Registered as
[`BUG-23`](../backend/known-defects.md#bug-23--replacing-a-service-instance-blackholes-its-route-for-about-twenty-seconds).

It is worth stating plainly what this means operationally: **a routine
redeploy of one service currently costs a twenty-second outage on its route**,
and only a load run makes that visible — a manual click-through would see a
handful of errors and a refresh would fix them.

#### What is still not known

- **The spike stage.** Nothing here tested a sudden arrival and recovery.
- **Where it bends with the generator off the machine.** Every number above
  shares 12 cores with JMeter, so 2 100 req/s is a floor for the platform's
  capacity, not a measurement of it.
- **Volume.** Still 14 products. Every prediction in §8 that depends on
  catalogue size is untested.
- **Where errors begin.** No step produced a single 5xx. The failure mode past
  saturation is unbounded latency, not rejection — which is its own risk, since
  a client with a timeout sees that as failure while the server counts it a
  success.

---

## 8. Predicted bottlenecks

Predictions from reading the code, not measurements. They were written down
before the first run precisely so that a run could contradict them.

**The 2026-08-29 load stage settled none of them**; the capacity ramp that
followed settled two, and contradicted one. Judgements are in the right-hand
column.

| Prediction | Why it was expected | Verdict after the 2026-08-29 ramp |
|---|---|---|
| Catalogue search degrades before plain listing | The keyword and facet filters are `LIKE '%…%'` predicates over joined tables (see `BUG-14`, `BUG-15`), which no index can help | **Untested.** At 14 products search was *faster* than listing (p95 42 ms vs 61 ms). A catalogue this small says nothing either way |
| order-service saturates on product-service's behalf | Placing an order holds a Tomcat thread for the whole synchronous stock call, with no timeout ([ADR-0009](../architecture/decisions/0009-resttemplate-for-service-calls.md)) | **Half right, wrong mechanism.** order-service does saturate first — Tomcat pinned at 200/200 — but product-service answered in 22 ms with 14 threads busy. It queues on its own connection pool, not on a slow catalogue |
| No graceful degradation under stress | No circuit breaker, no rate limiting, no bulkhead anywhere | **Contradicted, in an uncomfortable way.** No 5xx at any concurrency: it degrades *gracefully into unbounded latency*. p95 grew from 111 ms to 447 ms with no error at all, so a client with a timeout would experience failure while the server counted every request a success |
| Hikari pools contend through one MySQL | Three services, three schemas, one container ([ADR-0008](../architecture/decisions/0008-single-mysql-multiple-databases.md)) | **Confirmed as the queueing point, denied as the ceiling.** The pool pins at its default 10 with up to 189 waiting on whichever service is under load; raising it to 50 cut p95 by a fifth and moved throughput not at all. MySQL itself stayed far from its 151-connection limit |
| Seller order listing is the worst endpoint in the platform | `getAllSellerOrders` loads every order into memory before paging | **Still not measured** — not in either plan. Now more interesting than before: the database holds thousands of orders after these runs, so it would finally have something to page through |

The last row is a gap, not an oversight: the seller path is low-concurrency in
practice, so it is not in the standard workload. It is also the endpoint most
likely to fall over first if it ever were, which is why it is named here.

---

### Two things the harness itself cannot measure

- **`GET /products/keyword/{keyword}` cannot be load tested with JMeter at
  all.** It answers a successful search with `302 FOUND` and no `Location`
  header (`BUG-12`), and JMeter's HTTP implementation rejects that response at
  transport level before any sampler setting applies. Search is measured
  through the `?keyword=` filter on the listing endpoint instead — which is the
  path the SPA's search box takes anyway. When `BUG-12` is fixed, the dedicated
  endpoint can be added to the plan.
- **Stripe checkout.** The plan places orders with a payment method the service
  only stores; nothing contacts Stripe (§1).

---

## 9. Test data, and cleaning up after a run

`order-checkout.jmx` writes. One load-stage run leaves one account per thread,
one cart per account, one order per iteration, and a stock decrement for each
purchase.

Two consequences:

- **Stock runs out.** A long stress run buys the seeded catalogue out, after
  which add-to-cart answers `400`. The plan treats that as expected traffic
  and skips checkout for that iteration, so the run continues — but every
  measurement after that point is of a *different* workload than the one
  before it. A rising 400 rate on the endpoint dashboard is the marker for
  where a run stopped being comparable.
- **Runs are not repeatable without a reset.** Between comparable runs:

  ```bash
  docker compose down -v
  COMPOSE_PROFILES=prod,seed,observability docker compose up -d
  ```

  That drops the MySQL volume and the Prometheus history with it. To keep the
  metrics history, remove only the database volume rather than using `-v`.

To exercise cart traffic without ordering — useful when the point is read and
cart latency rather than checkout — run with `-Jplace.orders=false`.

**Never point the ordering plan at an environment whose data matters.** It
creates accounts with a fixed, published password.

---

## 10. What this level does not cover

- **Soak.** Nothing here runs for hours, so a slow leak — heap, connections,
  file handles — would not be caught. The heap panel over a long run is the
  cheapest first step if that becomes a question.
- **Database-scale volume.** The seeded catalogue is small. Several predicted
  bottlenecks (`BUG-17`'s in-memory paging, unindexed search) only bite at
  thousands of rows;
  measuring them properly needs a large synthetic catalogue, which does not
  exist yet.
- **The frontend.** These plans exercise the API. Bundle size, render time and
  Core Web Vitals are a different measurement with different tools.
- **Failure injection.** Nothing kills a container mid-run. Since there is no
  circuit breaker, the outcome is predictable enough to be documented rather
  than tested — but that is an assumption, not a result.
- **Payment under load.** Stripe is a third party; a load test against their
  test endpoint measures them.

---

## Related documents

| Question | Document |
|---|---|
| How to run the plans, and what each file is | [`tests/load/README.md`](../../tests/load/README.md) |
| What is measured while they run, and how to read it | [../operations/observability.md](../operations/observability.md) |
| The four functional levels this sits beside | [test-plan.md](test-plan.md) |
| The defects the predictions above refer to | [../backend/known-defects.md](../backend/known-defects.md) |
| The non-functional requirements being judged against | [../requirements/srs.md](../requirements/srs.md) |
