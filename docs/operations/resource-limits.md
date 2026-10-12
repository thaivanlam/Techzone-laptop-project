# Resource Limits

How much memory and CPU the containers are allowed, which JVM flags the seven
Spring Boot services run with, and how to tell whether a change to either made
things better or worse.

The base Compose files set no limit and pass no JVM flag. Two optional overlay
files add both — one tuned to be small, one tuned to be measured. This document
describes them, the reasoning behind each number, and what was actually
measured.

> **Status.** Both overlays start cleanly and pass the checks recorded in §9.
> The numbers in them are still first hypotheses: they were validated at idle, through the
> read-only functional suites, and at the `load` stage of the read-only
> catalogue plan — once each. Nothing here has been run at the stress stage,
> through a checkout, or for longer than a few minutes.

---

## Table of Contents

1. [The problem](#1-the-problem)
2. [Three configurations](#2-three-configurations)
3. [JVM flags, and the reason for each](#3-jvm-flags-and-the-reason-for-each)
4. [Limits, and what they assume](#4-limits-and-what-they-assume)
5. [Validating the merged files](#5-validating-the-merged-files)
6. [Measuring](#6-measuring)
7. [When a container is OOM-killed](#7-when-a-container-is-oom-killed)
8. [Comparing two configurations](#8-comparing-two-configurations)
9. [Recorded measurements](#9-recorded-measurements)
10. [Not changed: Keycloak, MySQL, RabbitMQ](#10-not-changed-keycloak-mysql-rabbitmq)
11. [Optional: capping the WSL2 VM](#11-optional-capping-the-wsl2-vm)
12. [Open questions](#12-open-questions)

---

## 1. The problem

Measured on 2026-10-12, on the reference laptop (12 logical cores, 15.7 GB of
RAM, Docker Desktop on WSL2 with a 7.6 GiB VM), with the full stack idle:

| Group | Memory |
|---|---|
| Seven Spring Boot services | ~2.3 GiB |
| Keycloak | ~0.6 GiB |
| MySQL | ~0.5 GiB |
| RabbitMQ | ~0.2 GiB |
| Frontend (nginx) | 13 MiB |
| **Total** | **~3.6 GiB** |

Idle CPU is a few percent of one core. **Memory is the problem, not CPU.**

The cause is that nothing tells the JVMs how big they are allowed to be. Each
Dockerfile ends in `java -jar app.jar`, and no container has a limit, so every
JVM sizes itself from the whole VM:

| JVM default, as observed | Value | Consequence |
|---|---|---|
| Max heap | 1 950 MiB (a quarter of the VM) | Seven JVMs may between them ask for 13.6 GiB of heap on a 7.6 GiB VM. Idle use is far lower; the risk is under load |
| Collector | G1 | Concurrent GC threads and remembered-set bookkeeping, sized for a large heap |
| GC threads | 10 parallel, 3 concurrent | One pool per JVM, sized from 12 cores |
| JIT compiler threads | 4 | Same |
| Code cache reserved | 240 MiB | |

The heap is the smaller half of the picture. At idle a typical business service
holds about 80 MiB of live heap but 380–500 MiB of resident memory: metaspace
(100–110 MiB once Hibernate and Spring Cloud are loaded), JIT-compiled code,
thread stacks, direct buffers, GC structures and the allocator's own arenas
make up the rest. **A limit sized from the heap alone will kill the container.**

---

## 2. Three configurations

| | No overlay | `docker-compose.dev.yml` | `docker-compose.benchmark.yml` |
|---|---|---|---|
| For | Unchanged behaviour | Everyday development, functional testing | Load runs |
| Memory ceilings | None | Small | Larger |
| CPU ceilings | None | 1 core per service | 1 core off the request path, 2–6 on it |
| Collector | G1 (JVM's own choice) | SerialGC | G1, pinned |
| JIT | Full tiered | C1 only | Full tiered |
| Good for measuring latency | Yes | **No** | Yes |

Both overlays live in [`backend/`](../../backend), next to the file they
modify, so they work from either Compose entry point. They touch only the seven
JVM containers; MySQL, RabbitMQ, Keycloak, the frontend and the observability
containers are identical in all three columns.

### Starting each

From the repository root — the full stack (Mode 1):

```bash
# development footprint
docker compose -f docker-compose.yml -f backend/docker-compose.dev.yml up -d

# benchmark, with the demo catalogue and the metrics stack
COMPOSE_PROFILES=prod,seed,observability \
  docker compose -f docker-compose.yml -f backend/docker-compose.benchmark.yml up -d

# no overlay — exactly as before
docker compose up -d
```

From `backend/` — Modes 2 and 3:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

In Mode 3 only `config-server` and `discovery-service` run in Docker, so only
those two are affected; services started from the IDE take their flags from the
launch configuration, not from Compose.

On PowerShell, set the profile variable first:
`$env:COMPOSE_PROFILES = 'prod,seed,observability'`.

**Every later Compose command needs the same `-f` pair.** `docker compose up -d`
on its own sees a definition without limits and recreates the seven containers
from the base file. `logs`, `ps`, `stop` and `restart` are unaffected. To avoid
typing the pair, set `COMPOSE_FILE` in the shell — the separator is `;` on
Windows and `:` elsewhere:

```powershell
$env:COMPOSE_FILE = 'docker-compose.yml;backend/docker-compose.dev.yml'
```

Switching overlay is the same `up -d` with the other pair. Compose recreates the
containers whose definition changed and leaves the database alone. Expect the
routes to answer `503` for about a minute while the services register again
(`BUG-23`).

---

## 3. JVM flags, and the reason for each

The overlays pass flags through `JAVA_TOOL_OPTIONS`, which the JVM reads itself.
That keeps the Dockerfiles and their `ENTRYPOINT` untouched. Each JVM logs
`Picked up JAVA_TOOL_OPTIONS: …` as its first line, which is the quickest proof
an overlay is in effect. Nothing else in the repository sets this variable or
any other JVM argument, so there is nothing to conflict with.

Six services build on JDK 21 and `notification-service` on JDK 17. Every flag
below was checked against both images with `-XX:+PrintFlagsFinal`.

### Development

```
-XX:+UseSerialGC -XX:MaxRAMPercentage=45 -Xss512k -XX:ReservedCodeCacheSize=64m -XX:TieredStopAtLevel=1
```

| Flag | Why | What it costs |
|---|---|---|
| `-XX:+UseSerialGC` | No concurrent GC threads and none of G1's per-region bookkeeping. With one core and a heap under 300 MB it is what the JVM would pick anyway; stating it makes the choice survive a change to the limits | Stop-the-world collections. Invisible at these heap sizes, not at multi-gigabyte ones |
| `-XX:MaxRAMPercentage=45` | Max heap as a share of `mem_limit`. The default is 25%, which gives a 576 MiB container a 144 MiB heap — below what order-service already uses at idle. 45% leaves 55% for everything in §1 that is not heap | A heap this share of the container is only safe because the non-heap side is also capped below |
| `-Xss512k` | Halves the stack reserved per thread; a service here runs 30–60 threads at rest and Tomcat may grow to 200 | A deep enough recursion throws `StackOverflowError` at half the usual depth. Not seen in the checks in §9. The saving is mostly address space — stack pages are only resident once touched |
| `-XX:ReservedCodeCacheSize=64m` | Down from 240 MiB. With C1 only, the services held 9–19 MiB of compiled code after startup and the checks in §9 | If it fills, the JIT stops compiling and the service runs interpreted — slow, with a `CodeCache is full` warning in the log |
| `-XX:TieredStopAtLevel=1` | C1 only: no C2 compiler threads, no profiling data, a cheaper start. Measured: about 350 MiB across the seven services (§9) | **Peak throughput.** Hot paths never get the optimising compiler; the one CPU-heavy endpoint timed in §9 ran 2.4× slower. This flag alone is why nothing may be measured in this mode |

### Benchmark

```
-XX:MaxRAMPercentage=50 -XX:+UseG1GC
```

| Flag | Why |
|---|---|
| `-XX:MaxRAMPercentage=50` | Half the limit as heap: 512 MiB for product- and order-service, against a recorded peak of 220 MiB during the capacity ramp |
| `-XX:+UseG1GC` | **Not a tuning choice — it preserves the collector the recorded runs used.** See below |

Deliberately absent: `TieredStopAtLevel`, a code-cache cap, and `-Xss`. The
first two trade throughput for footprint. `-Xss512k` was left out because the
recorded runs did not have it and it saves little resident memory; one fewer
difference between a new run and an old one is worth more.

#### Why G1 has to be named

A JVM chooses its collector by asking whether it is on a "server-class
machine": at least two processors **and** at least 1 792 MB of memory. Inside a
container it asks about the container. Every limit in the benchmark overlay is
below that threshold, so the same image that ran G1 with no limit silently
switches to SerialGC with one — checked directly:

| Container | `-XX:+UseG1GC` given | Collector chosen |
|---|---|---|
| No limit (7.6 GiB, 12 cores) | no | G1 |
| 1 024 MiB, 6 cores | no | **SerialGC** |
| 1 024 MiB, 6 cores | yes | G1 |

Without the flag, adding a memory limit would also change the garbage collector
under the measurement, and a before-and-after comparison would be comparing two
things at once.

---

## 4. Limits, and what they assume

`memswap_limit` is set equal to `mem_limit` everywhere. The container then has
no swap: a service that outgrows its ceiling is killed and visible (§7) instead
of paging quietly inside the VM and making everything slower for no stated
reason.

`cpus` is a ceiling on CPU time, and also what the JVM reports as its processor
count — it sizes the GC and compiler thread pools, Netty's event loops and the
common fork-join pool from it.

### Development

| Service | `mem_limit` | Max heap (45%) | `cpus` |
|---|---|---|---|
| config-server | 320 MiB | 144 MiB | 1 |
| discovery-service | 384 MiB | 172 MiB | 1 |
| api-gateway | 448 MiB | 201 MiB | 1 |
| user-service | 576 MiB | 259 MiB | 1 |
| product-service | 576 MiB | 259 MiB | 1 |
| order-service | 576 MiB | 259 MiB | 1 |
| notification-service | 384 MiB | 172 MiB | 1 |
| **Sum of ceilings** | **3 264 MiB** | | |

The sum of the ceilings is larger than what the unlimited stack uses at idle.
That is expected: a ceiling is not a reservation. The saving comes from the
flags, which make each JVM actually smaller; the ceilings are what stop it
growing back under load. Measured use is in §9.

Assumptions: one developer clicking through the shop, or the functional suites
in `tests/` — single-digit concurrency. One core per service was expected to
make a cold start slower and put the healthcheck window (30 s grace, then ten
probes 10 s apart) at risk. It did not: with C1-only compilation the services
started in 6–18 s, faster than under the benchmark overlay, and no healthcheck
probe failed (§9).

### Benchmark

| Service | `mem_limit` | Max heap (50%) | `cpus` | Basis |
|---|---|---|---|---|
| config-server | 384 MiB | 192 MiB | 1 | Off the request path |
| discovery-service | 448 MiB | 224 MiB | 1 | Off the request path |
| notification-service | 448 MiB | 224 MiB | 1 | Asynchronous consumer |
| user-service | 768 MiB | 384 MiB | 2 | Light in both plans |
| api-gateway | 768 MiB | 384 MiB | 4 | Peaked at ~2.4 cores at the recorded knee |
| product-service | 1 024 MiB | 512 MiB | 6 | Peaked at ~4.3 cores, 220 MiB heap |
| order-service | 1 024 MiB | 512 MiB | 4 | No recorded CPU peak — an estimate |
| **Sum of ceilings** | **4 864 MiB** | | | |

Against the VM: 4 864 MiB of JVM ceilings, plus roughly 1.8 GiB for MySQL,
Keycloak, RabbitMQ, Prometheus, Grafana and the frontend, is about 6.6 GiB of a
7.6 GiB VM. That leaves about 1 GiB for the kernel, the page cache and the
Docker daemon — enough, but it is why the benchmark limits are not more
generous, and why this overlay does not fit a VM capped as §11 suggests.

The CPU ceilings on the request path are set above the peaks recorded at the
2 100 req/s knee in
[../quality/performance-testing.md](../quality/performance-testing.md#7-recorded-runs),
so they stop a runaway without becoming the bottleneck being measured. They sum
to more than the host has, which is fine for the same reason as memory. They do
change one thing: product-service now reports 6 processors rather than 12, so
its GC pool is smaller. A stress-stage run under this overlay is therefore not
the same experiment as the recorded ramp, and should not be compared with it
without saying so.

---

## 5. Validating the merged files

`docker compose config` prints the definition Compose would actually run, after
every `-f` file and `include` has been merged. Run it for each mode before
starting anything:

```bash
docker compose -f docker-compose.yml -f backend/docker-compose.dev.yml config --quiet
docker compose -f docker-compose.yml -f backend/docker-compose.benchmark.yml config --quiet
```

`--quiet` prints nothing and exits 0 when the result is valid. To see what a
service ended up with:

```bash
docker compose -f docker-compose.yml -f backend/docker-compose.dev.yml config user-service
```

Three things to look for: `JAVA_TOOL_OPTIONS` is present **alongside** the
variables the base file sets, not instead of them; `mem_limit`, `memswap_limit`
and `cpus` are present; and nothing outside the seven JVM services differs from
the output without the overlay.

On a running container, the effective values:

```bash
docker exec product-service printenv JAVA_TOOL_OPTIONS
docker exec product-service jcmd 1 VM.flags          # collector, MaxHeapSize
docker inspect -f '{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}}' product-service
```

`jcmd` is available because the runtime image is a full JDK. `MaxHeapSize`
there is the number that matters: it is what `MaxRAMPercentage` resolved to
inside this container, rather than what the arithmetic says it should be.

---

## 6. Measuring

```bash
# every container, one sample
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"

# inside one JVM: heap, metaspace, code cache
docker exec product-service jcmd 1 GC.heap_info
docker exec product-service jcmd 1 Compiler.codecache

# resident memory and thread count of the JVM process
docker exec product-service grep -E "VmRSS|Threads" /proc/1/status
```

`MEM %` in `docker stats` is relative to the container's own limit once it has
one, which makes it the fastest way to see which service is closest to its
ceiling. Without a limit it is relative to the whole VM.

`docker stats` counts the container's page cache as well as the process, so it
reads a little differently from `VmRSS`. Compare like with like.

With the `observability` profile on, the same is on the Grafana overview —
heap, GC pause time and CPU per service — and is the better instrument during a
load run. See [observability.md](observability.md).

---

## 7. When a container is OOM-killed

A container that exceeds `mem_limit` is killed by the kernel. The JVM gets no
chance to log anything: the log simply stops, and the container exits with code
**137**.

```bash
docker inspect -f '{{.State.OOMKilled}} exit={{.State.ExitCode}} restarts={{.RestartCount}}' product-service
```

`true` and `137` settle it. The business services have no restart policy, so a
killed one stays down and its route answers `503`.

This is different from the JVM running out of *heap*, which it survives long
enough to report: `java.lang.OutOfMemoryError: Java heap space` in the log,
container still running. The two point in opposite directions:

| What happened | Meaning | Fix |
|---|---|---|
| Exit 137, `OOMKilled=true` | Heap **plus** everything else exceeded the limit. The non-heap side was underestimated | Raise `mem_limit` for that service, or lower `MaxRAMPercentage` |
| `OutOfMemoryError: Java heap space` | The heap ceiling is too low for the workload | Raise `mem_limit` (the heap follows it), or raise `MaxRAMPercentage` |
| `OutOfMemoryError: Metaspace` | Not possible with these overlays — metaspace is deliberately uncapped | — |
| `CodeCache is full` warning | The 64 MiB development cap was reached | Raise `ReservedCodeCacheSize` |

After editing a limit, re-run the same `up -d` with the `-f` pair; a `restart`
does not re-read the Compose files.

---

## 8. Comparing two configurations

To judge a change to a flag or a limit, measure the same workload on both sides
of it. The plans, the stages and the runner are the existing ones in
[`tests/load/`](../../tests/load/README.md); nothing about them changes.

**Hold constant:** the plan, the stage (threads, ramp, duration, think time),
the catalogue, the images, the machine, and what else is running on it. Change
one thing between the two runs.

1. **Start the "before" configuration** and wait until the catalogue answers
   through the gateway.
2. **Warm up.** Run the `smoke` stage once. It proves the plan and the stack
   agree, and it takes the first-request cost — class loading, Hibernate's first
   query, a cold buffer pool — out of the run that counts.
3. **Run the stage** — `load` unless the question is about saturation. Sample
   `docker stats` every ten seconds for the whole of it.
4. **Recreate with the "after" configuration**, and repeat steps 2 and 3
   exactly.
5. **Discard the first quarter of each run** before computing anything. It
   contains the ramp and the JIT warm-up, and it is where a freshly recreated
   JVM differs most from one that has been up for an hour.

Use `catalogue-browse` for this. It writes nothing, so the two runs see the same
data. `order-checkout` creates accounts and orders and consumes stock; a
comparison with it needs the reset in
[performance-testing.md §9](../quality/performance-testing.md#9-test-data-and-cleaning-up-after-a-run)
between the runs.

**Record, for each side:**

| Measure | From |
|---|---|
| Total memory across all containers, mean and peak | The `docker stats` samples |
| Memory per container, mean and peak | Same |
| CPU per container | Same |
| Throughput at the plateau, requests per second | `samples.jtl` |
| p95 latency, per sampler and overall | `samples.jtl` |
| HTTP error rate, and 5xx separately | `samples.jtl` |
| GC pause count and total pause time, per service | `jvm_gc_pause_seconds_count` / `_sum` at `/actuator/prometheus`, read before and after the run, or the Grafana GC panel |
| OOM kills, restarts | `docker inspect` (§7) |

**A lower memory figure is not a result on its own.** A change is an
improvement only if throughput held, p95 did not regress beyond run-to-run
noise, the error rate stayed at zero and nothing was killed. Run-to-run noise on
this laptop, with the generator on the same machine, is easily ±20% on a p95 of
a few tens of milliseconds — repeat a run before believing a small difference.

The gateway's actuator endpoint answers `401` without a token, so its GC
counters are not readable with a plain `curl`; use Grafana for the gateway, or
`docker exec api-gateway jstat -gc 1`.

---

## 9. Recorded measurements

Full tables, with the environment each was taken in, are in
[resource-limits-measurements.md](resource-limits-measurements.md). The first
validation, on 2026-10-12, one run of each:

| | No overlay | Development | Benchmark |
|---|---|---|---|
| Seven JVMs at rest | 2 365 MiB | 1 462–1 606 MiB | 2 133 MiB |
| Whole stack at rest | 3 635 MiB | 2 776–2 922 MiB | 3 416 MiB |
| Catalogue load stage, throughput | 19.6 req/s | not measured — by design | 19.4 req/s |
| Catalogue load stage, p95 | 41 ms | — | 47 ms |
| Errors, OOM kills | 0 | 0 | 0 |

- The development overlay saves roughly a third of the JVM memory. Of that,
  about 350 MiB is `TieredStopAtLevel=1`, at the price of a 2.4× slowdown on the
  one CPU-bound endpoint timed.
- The benchmark overlay made no difference to the load stage that one run can
  tell from noise.
- Under the development overlay one system test — the seller order list, on a
  database holding 15 511 orders — exceeds its 15-second timeout. Run the live
  suites with `REQUEST_TIMEOUT_MS=30000` in that mode.
- order-service has the least headroom: 397 of 576 MiB after that endpoint.

---

## 10. Not changed: Keycloak, MySQL, RabbitMQ

The overlays leave these three alone. Each was measured; none was changed,
because each needs a validation that was not possible without resetting data.

### Keycloak — ~600 MiB

Keycloak 26.0.7 sizes itself from the container: its launcher passes
`-XX:MaxRAMPercentage=70 -XX:MinRAMPercentage=70 -XX:InitialRAMPercentage=50`,
`-XX:MaxMetaspaceSize=256m` and `-XX:+ExitOnOutOfMemoryError`. With no limit
that is 70% of the VM as a heap ceiling.

A `mem_limit` of about 768 MiB is the candidate: it would cap the heap at
538 MiB, and because of `ExitOnOutOfMemoryError` a limit that is too small
shows up as a container that exits rather than one that limps. **It was not
applied.** Accepting it needs four things to pass under the limit — startup,
sign-in, token issuance, and the realm import — and the import only runs
against an empty `keycloak` database, which means dropping data.

### MySQL — ~480 MiB

| Setting | Current | Note |
|---|---|---|
| `innodb_buffer_pool_size` | 128 MiB (default) | Four schemas, a 14-product catalogue; the data fits many times over |
| `performance_schema` | ON | Its instruments account for a large share of the footprint — the statement-digest tables alone hold ~40 MiB |
| `table_open_cache` | 4 000 | |
| `max_connections` | 151 | 31 in use at idle: three Hikari pools of ten, plus Keycloak |

Turning Performance Schema off is the largest single saving and is
**deliberately not done**: it is the only window into what the database is
doing — which statement is slow, which lock is held — and the capacity ramp's
conclusion that MySQL was nowhere near its connection limit came from exactly
that kind of counter. A smaller buffer pool is the safer candidate, but only
after a run at the stress stage shows the pool is not the thing keeping the
catalogue query in memory.

### RabbitMQ — ~180 MiB

More than half of that is memory the Erlang allocator has reserved and not
used. The VM starts 12 schedulers, one per core. Both an Alpine image and a
lower scheduler count would reduce the footprint, and neither was done: the
image switch changes the base system under a stateful service, and the
scheduler count bounds the broker's throughput, which the notification path has
never been measured against.

One thing worth looking at before either: during the runs in §9 the `rabbitmq`
container repeatedly showed CPU spikes of 160–320% of a core while idle. The
likely cause is the healthcheck — `rabbitmq-diagnostics ping` every ten seconds
boots a full Erlang node each time — but that is an inference from the pattern,
not something that was isolated.

---

## 11. Optional: capping the WSL2 VM

Everything above bounds the containers. It does not shrink what Windows sees:
with Docker Desktop on WSL2 the whole VM appears as one `Vmmem` process, which
by default may grow to half of physical RAM and is slow to give memory back
after a spike — a build, a load run.

This is a setting on the Windows host, outside the repository, and **nothing
here applies it**. On the reference laptop (15.7 GB) the file would be
`%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
# Ceiling for the whole Docker VM. 6 GB fits the development overlay with room
# to spare and leaves ~9.5 GB for Windows, an IDE and a browser.
memory=6GB

[experimental]
# Give cached memory back to Windows when the VM is idle.
autoMemoryReclaim=dropcache
```

Apply it with `wsl --shutdown`, then start Docker Desktop again. That stops
every container.

Three cautions:

- **6 GB is too small for the benchmark overlay**, whose ceilings assume the
  7.6 GiB the VM has today (§4). Raise it to 8 GB — or remove the line — before
  a load run.
- **Do not cap `processors`.** The recorded capacity ceiling was the host
  running out of cores; taking cores away from the VM moves that ceiling for a
  reason that has nothing to do with the platform.
- `autoMemoryReclaim` is an experimental WSL setting whose behaviour has
  changed between releases. `dropcache` is the conservative mode. It was not
  tested as part of this work.

Size `memory` from what else the machine has to run. An IDE with the backend
open and a browser take 4–6 GB between them; on a 16 GB machine, 6 GB for the
VM is about the most that leaves Windows comfortable.

---

## 12. Open questions

- **The stress stage under the benchmark overlay.** Only `load` was run. Whether
  the CPU ceilings stay out of the way at the 2 100 req/s knee is unverified.
- **The write path.** No checkout was placed under either overlay, so
  order-service's limit has only been seen at idle and under cart traffic.
- **Soak.** A few minutes says nothing about slow growth. Metaspace is uncapped
  on purpose; a leak there would end as an OOM kill hours in.
- **`-Xss512k` under a deep call chain.** No stack overflow was seen, but no
  test here is designed to find one.
- **One core per service at startup** depends on the machine. A slower laptop
  may need a longer healthcheck window or `cpus: 2.0` on the gateway.
- **Keycloak, MySQL and RabbitMQ** — the candidates in §10.

---

## Related documents

| Question | Document |
|---|---|
| The Compose files these overlays sit on | [docker-setup.md](docker-setup.md) |
| Starting the stack, the three modes | [running-locally.md](running-locally.md) |
| The load plans, stages, thresholds and recorded runs | [../quality/performance-testing.md](../quality/performance-testing.md), [`tests/load/README.md`](../../tests/load/README.md) |
| Heap, GC and CPU per service while a run is going | [observability.md](observability.md) |
| A container that will not stay up | [troubleshooting-runbook.md](troubleshooting-runbook.md) |
