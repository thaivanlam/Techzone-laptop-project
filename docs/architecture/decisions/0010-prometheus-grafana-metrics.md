# ADR-0010: Measure the platform with Micrometer, Prometheus and Grafana

- **Status:** Accepted
- **Date:** 2026-08-27
- **Affects:** every backend service, the Compose stack, the load tests in `tests/load/`

## Context

Nothing about the platform's behaviour under load could be stated with a
number. `NFR-PRF-1` asks for a catalogue page at p95 under 500 ms and had the
status "never load-tested"; several defects in the register — in-memory paging
of seller orders (`BUG-17`), unindexed `LIKE` search filters, a synchronous
stock call with no timeout ([ADR-0009](0009-resttemplate-for-service-calls.md))
— are predictions about *scale* that no observation confirmed or refuted.

Generating load was only half the problem. A load generator reports what the
client saw: latency, throughput, error rate. It cannot say which of seven
JVMs was the constraint, or whether the constraint was the thread pool, the
connection pool, the heap or the CPU. Without that, a slow result names no
cause and suggests no fix.

The constraints on any answer: seven Spring Boot services already running as
containers on one Compose network, a laptop-scale deployment with no
Kubernetes and no hosted monitoring account, and a thesis-scale operating
budget — meaning no per-seat SaaS, and nothing that needs an agent installed
into every image.

## Decision

Every service carries `spring-boot-starter-actuator` and
`micrometer-registry-prometheus`, and exposes `health`, `info`, `metrics` and
`prometheus` and nothing else. `management.metrics.distribution.percentiles-histogram`
is on for `http.server.requests` — and for `spring.cloud.gateway.requests` at
the gateway — with explicit SLO buckets at 100 ms, 200 ms, 500 ms, 1 s and 2 s.
Servlet services set `server.tomcat.mbeanregistry.enabled` so the Tomcat pool
counters exist at all.

A Prometheus container scrapes all seven every 10 seconds and keeps 15 days,
and a Grafana container serves two dashboards provisioned from the repository:
a service overview and a per-endpoint view of the ordering and catalogue APIs.
Both containers sit behind the `observability` Compose profile, so the
everyday stack is unchanged. Recording rules define request rate, error ratio
and p95 once, and both the dashboards and the three alert rules read them, so
a panel and an alert cannot disagree.

The load side is Apache JMeter: two plans in `tests/load/`, run at smoke,
load, stress and spike stages. JMeter is not vendored and not installed by the
scripts.

## Consequences

**Positive.** Latency, throughput and error rate are now facts, per service and
per endpoint, and they survive the run that produced them: a result from last
week is still queryable. The pull model means a service that dies is visible
as `up == 0` rather than as silence, and adding a service is one entry in
`prometheus.yml`. Micrometer is already inside Spring Boot, so instrumenting
seven services cost two dependencies and one configuration block each, with no
application code changed anywhere. Provisioning the dashboards from the
repository makes them reviewable in a diff and reproducible on a fresh
machine. Choosing JMeter over k6 keeps the toolchain on the JVM the rest of
the project already needs, and its HTML report is a deliverable a thesis
committee can read.

**Negative.** Two more containers and a second volume; Prometheus and Grafana
compete for the same laptop cores as the stack they are measuring, which is
exactly the wrong property during a load run. Histogram buckets are not free:
`percentiles-histogram` multiplies the series count for every URI, and this
platform has no metric-cardinality guard beyond Spring's URI templating —
an endpoint that ever reported a raw path instead of a template would inflate
storage quickly. The actuator endpoints are unauthenticated, and the service
ports are published to the host in this stack, so anyone on the machine can
read them; the exposure allowlist is what keeps that boring. There is no
Alertmanager, so alerts fire into a web page nobody is watching. Nothing here
is tracing: a slow request still cannot be followed across a service boundary,
which is the one question these dashboards raise most often and cannot answer.
And the histogram decision is not retroactive — a run measured without it can
never be re-analysed for percentiles.

**If this is revisited.** For tracing, Micrometer Tracing with an OTLP
exporter into Tempo or Jaeger is the natural next step, and it reuses the
observation instrumentation already switched on here. For logs, Loki alongside
the same Grafana avoids a second UI. If cardinality becomes the problem before
either of those, the fix is `management.metrics.enable.*` filters and dropping
histograms on the endpoints nobody reads. A managed backend (Grafana Cloud,
or Prometheus remote-write) is the answer only if this ever runs somewhere a
laptop-scale TSDB cannot follow.

## References

- Detail: [../../operations/observability.md](../../operations/observability.md)
- Load side: [../../quality/performance-testing.md](../../quality/performance-testing.md), [`tests/load/README.md`](../../../tests/load/README.md)
- Configuration: [`backend/observability/`](../../../backend/observability/), [../../operations/configuration-reference.md](../../operations/configuration-reference.md)
- Related: [ADR-0006](0006-config-server-native-profile.md) — why a metrics setting change needs a Config Server rebuild
- Related: [ADR-0009](0009-resttemplate-for-service-calls.md) — the blocking call these dashboards were built to catch
