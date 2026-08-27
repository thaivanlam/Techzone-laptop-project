# Performance Testing

How the platform is put under concurrent load, what is measured while it is,
and what a result means.

This is the fifth level of testing, sitting beside the four functional levels
in [test-plan.md](test-plan.md). Those answer *does it do the right thing*.
This one answers *for how many people at once, and what gives way first*.

The plans live in [`tests/load/`](../../tests/load/README.md); the metrics
they are read against are described in
[../operations/observability.md](../operations/observability.md).

**Status:** the harness and the instrumentation are in place and verified
against a stub gateway. **No full-stack run has been recorded yet** — §7 is
deliberately empty rather than filled with numbers nobody measured.

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
correctly, and so is a `404` from a keyword that matches nothing. Only 5xx
counts as failure.

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

*None yet.*

The plans and the dashboards were verified against a stub gateway rather than
the live stack: both plans parse, both drive every sampler, the JSON
extractors and branching controllers behave, and no sampler failed. That
proves the harness, not the platform.

When the first real run happens, each entry belongs here in this shape:

| Field | Example |
|---|---|
| Date, stage, plan | 2026-09-01, load, `catalogue-browse` |
| Environment | Stack and generator on one 8-core laptop; images from backend `abc1234` |
| Throughput at plateau | req/s |
| p95 / p99, per endpoint | s |
| Error rate | 4xx / 5xx split |
| First resource to saturate | e.g. Tomcat threads on product-service at 60 concurrent |
| Verdict against §5 | pass / miss, and which threshold |
| Follow-up | defect raised, or change made |

---

## 8. Predicted bottlenecks

Predictions from reading the code, not measurements. They are written down
before the first run precisely so that the run can contradict them.

| Prediction | Why | Where it should show |
|---|---|---|
| Catalogue search degrades before plain listing | The keyword and facet filters are `LIKE '%…%'` predicates over joined tables (see `BUG-14`, `BUG-15`), which no index can help | Per-URI p95 on the endpoint dashboard, search visibly above listing |
| order-service saturates on product-service's behalf | Placing an order holds a Tomcat thread for the whole synchronous stock call, with no timeout ([ADR-0009](../architecture/decisions/0009-resttemplate-for-service-calls.md)) | `tomcat_threads_busy_threads` flattening on **order**-service while product-service is the slow one |
| No graceful degradation under stress | No circuit breaker, no rate limiting, no bulkhead anywhere | 5xx appearing abruptly rather than latency rising smoothly |
| Hikari pools contend through one MySQL | Three services, three schemas, one container ([ADR-0008](../architecture/decisions/0008-single-mysql-multiple-databases.md)) | `hikaricp_connections_pending` above zero on more than one service at once |
| Seller order listing is the worst endpoint in the platform | `getAllSellerOrders` loads every order into memory before paging | Not covered by either plan — add it deliberately when measuring that |

The last row is a gap, not an oversight: the seller path is low-concurrency in
practice, so it is not in the standard workload. It is also the endpoint most
likely to fall over first if it ever were, which is why it is named here.

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
