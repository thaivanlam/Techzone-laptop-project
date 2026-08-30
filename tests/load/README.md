# Load Tests

Two JMeter plans that drive the platform through the API Gateway under
concurrency, and the four stages they are run at. They answer a different
question from the rest of [`tests/`](../README.md): not *does it work*, but
*for how many people at once, and what breaks first*.

While a plan runs, the same window is visible live on the Grafana dashboards —
per service and per endpoint. The JMeter report says what the client saw; the
dashboards say what the server was doing at that moment. Reading them together
is the point. See
[../../docs/operations/observability.md](../../docs/operations/observability.md).

---

## What is here

| File | What it does |
|---|---|
| [`catalogue-browse.jmx`](catalogue-browse.jmx) | Anonymous browsing: paged listing, brand and category facets, keyword search, one product's specifications. Writes nothing. |
| [`order-checkout.jmx`](order-checkout.jmx) | The ordering path: register, sign in, find stock, add to cart, read the cart, place the order, read the history. **Writes rows.** |
| [`profiles.properties`](profiles.properties) | Every knob the plans read, with the defaults and the four stages documented |
| [`data/search-keywords.csv`](data/search-keywords.csv) | Search terms the browsing plan cycles through |
| [`run.sh`](run.sh) / [`run.ps1`](run.ps1) | Run one plan at one stage; writes samples and an HTML report under `results/` |

`results/` is gitignored. A run that is worth keeping goes into
[../../docs/quality/performance-testing.md](../../docs/quality/performance-testing.md)
as numbers, not as a directory of raw samples.

---

## Requirements

- **Apache JMeter 5.6 or newer**, on `PATH`, or `JMETER_HOME` set, or
  `JMETER_CMD` pointing at the launcher. It is not vendored and not
  downloaded by the scripts: a load generator that installs itself mid-run is
  one more variable in a measurement meant to have few.
- **A running stack with a seeded catalogue.** Both plans are useless against
  an empty shop — the browsing plan measures 404s and the ordering plan finds
  nothing in stock:

  ```bash
  # from the repository root
  COMPOSE_PROFILES=prod,seed,observability docker compose up -d
  ```

- **The load generator off the machine under test**, if the numbers are meant
  to be quoted anywhere. JMeter and eleven containers on one laptop compete
  for the same cores, and the p99 pays for it. A run from the same laptop is
  fine for comparing *before and after a change*; it is not a capacity figure.

---

## Running

```bash
cd tests/load

./run.sh catalogue-browse smoke      # 2 threads, 60s - prove the plan works
./run.sh catalogue-browse load       # 20 threads, 5 min - the expected busy hour
./run.sh order-checkout load
./run.sh catalogue-browse stress     # 100 threads, 10 min - find the bend
./run.sh catalogue-browse spike      # 200 threads arriving in 5s
```

If the clone did not preserve the executable bit — common on Windows —
`bash run.sh catalogue-browse smoke` does the same thing.

On Windows PowerShell:

```powershell
cd tests\load
.\run.ps1 catalogue-browse smoke
.\run.ps1 order-checkout load -Extra '-Jthreads=50'
```

Always run `smoke` first after changing anything. It costs a minute and it
catches the failure that otherwise wastes ten: an empty catalogue, a stack
that is up but not seeded, a gateway on a different port.

Anything after the stage is passed to JMeter unchanged:

```bash
./run.sh order-checkout load -Jthreads=50 -Jgateway.host=another-host -Jplace.orders=false
```

### Finding where it bends

The four stages below answer "how does it behave at this load". To find the
saturation point, run the same plan repeatedly changing **one** variable —
first threads at a fixed think time, then threads again with think time off,
which concentrates load without making the generator the bottleneck:

```bash
for n in 20 50 200 800; do ./run.sh catalogue-browse load --no-report -Jthreads=$n -Jrampup=20 -Jduration=150; done
for n in 100 200 500; do ./run.sh catalogue-browse load --no-report -Jthreads=$n -Jrampup=15 -Jduration=120 -Jthink.time=0 -Jthink.range=0; done
```

The knee is the step where throughput stops rising while latency keeps
growing. The one recorded in
[../../docs/quality/performance-testing.md](../../docs/quality/performance-testing.md)
is at roughly 2 100 req/s, where the Hikari pool pins at its default of 10 with
up to 189 requests waiting.

### The four stages

| Stage | Threads | Ramp | Duration | Think time | What it is for |
|---|---|---|---|---|---|
| `smoke` | 2 | 1s | 60s | 0.5–1.5s | The plan and the stack agree |
| `load` | 20 | 30s | 5 min | 0.5–1.5s | The expected busy hour; the number to quote |
| `stress` | 100 | 60s | 10 min | 0.2–0.5s | Past the peak, to find where it bends |
| `spike` | 200 | 5s | 2 min | 0–0.2s | Everyone arrives at once, then leaves |

They live in `run.sh` and `run.ps1` rather than in `profiles.properties`,
because a properties file can only describe one stage at a time.

---

## What the ordering plan writes

`order-checkout.jmx` is not read-only. One run at the `load` stage leaves
behind, in the development database:

- one user account per thread,
- one cart per account,
- one order per iteration, and
- a stock decrement on the product each iteration bought.

Two consequences follow.

**Every thread registers its own account** rather than sharing the seeded
`user1`. That is not politeness — the seeded accounts have one cart each, and
two threads writing the same cart corrupts it permanently (**BUG-21**, found
by the system suite doing exactly that). The generated username is
`lt<threadNumber>s<epochSecond>`, inside the 20-character limit the signup DTO
enforces.

**Stock runs out.** The seeded catalogue holds a fixed quantity per product;
a long stress run will buy it out, after which add-to-cart answers `400` with
"less than or equal to the quantity". The plan treats that as expected traffic
rather than as an error, and skips checkout for that iteration — a rising 400
rate on the endpoint dashboard is the signal that the catalogue needs
reseeding, not that ordering broke.

To get back to a clean state, reset the database and reseed:

```bash
docker compose down -v          # drops the MySQL volume - and everything in it
COMPOSE_PROFILES=prod,seed docker compose up -d
```

To exercise cart traffic without any of this, turn checkout off:

```bash
./run.sh order-checkout load -Jplace.orders=false
```

**Never point this plan at an environment whose data matters.** It creates
accounts with a fixed, published password and places real orders.

---

## Reading a result

`run.sh` writes three things per run under
`results/<plan>-<stage>-<timestamp>/`:

| File | What it holds |
|---|---|
| `samples.jtl` | Every sample, raw. The input for any re-analysis |
| `report/index.html` | JMeter's HTML dashboard: percentiles, throughput over time, errors by type |
| `jmeter.log` | JMeter's own log — where a broken plan explains itself |

Start with **Errors** in the HTML report, not with the latency graph: a run
that failed half its samples has a beautiful p95, because a rejected request
is a fast one. Then compare the client-side percentiles against the
server-side ones in Grafana. A large gap between them is not a service
problem — it is queueing at the gateway, or the load generator itself
saturating.

### The four numbers worth recording

- **Throughput** — samples per second, at the plateau, not during the ramp.
- **p95 and p99 latency** — per endpoint, not aggregated. The aggregate hides
  the one slow endpoint behind four fast ones.
- **Error rate**, split into 4xx and 5xx. Only 5xx counts as the platform
  failing.
- **The first thing to saturate** — from the Grafana overview: Tomcat busy
  threads, Hikari connections waiting, heap, or CPU. That is the finding; the
  latency number is only the symptom.

Runs worth keeping are written up in
[../../docs/quality/performance-testing.md](../../docs/quality/performance-testing.md).

---

## What the plans deliberately avoid

Two details in the plans exist because of defects, and both should be revisited
when those defects are fixed:

- **Search goes through `?keyword=` on the listing endpoint**, not through
  `/products/keyword/{keyword}`. The dedicated endpoint answers a *successful*
  search with `302 FOUND` and no `Location` header (**BUG-12**); JMeter rejects
  that at transport level — "Missing location header in redirect" — so it
  cannot be sampled at all. The filter is what the SPA's search box uses anyway.
- **Checkout sends `payment.method=online`**, not `cod`. A payment method under
  four characters fails the whole order with 500 at persist time (**BUG-22**,
  found by the first load run). `online` is what the SPA sends.

`data/search-keywords.csv` must also match the catalogue actually loaded, and
`page.max` must match its page count: a keyword that matches nothing, or a page
past the last one, is answered `400` (**BUG-04**), and a run full of those
measures the exception path instead of the query.

---

## Known shapes to expect

These are predictions from the code, not measurements — the register of what
was actually observed is in the performance document. The first load run
(2026-08-29, 20 threads) saturated none of them: 4 busy Tomcat threads out of
200, no connection ever waiting. They are expectations for the stress stage.

- **Catalogue search degrades before plain listing.** The keyword and facet
  filters are `LIKE '%…%'` predicates over joined tables (**BUG-14**,
  **BUG-15**), which no index can help.
- **Order placement holds a thread while product-service answers.** The stock
  call is synchronous `RestTemplate` with no timeout
  ([ADR-0009](../../docs/architecture/decisions/0009-resttemplate-for-service-calls.md)),
  so a slow catalogue shows up as saturated Tomcat threads in *order*-service.
- **Seller order listing is the worst endpoint in the platform** under volume:
  it loads every order into memory before paging. It is not in either plan —
  add it deliberately when that is what is being measured.
- **There is no circuit breaker and no rate limiting.** A stress stage is
  expected to produce 5xx eventually; the question the run answers is *at what
  concurrency*, and *which service gives way first*.
