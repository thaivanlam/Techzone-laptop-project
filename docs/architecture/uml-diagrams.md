# UML Diagrams

The platform drawn from six angles, split across three documents by diagram
family. This page is the index and the caveats; the diagrams themselves are one
click away.

Related documents: [system-overview.md](system-overview.md) ·
[data-model.md](data-model.md) · [security-model.md](security-model.md) ·
[../requirements/srs.md](../requirements/srs.md)

---

## The Set

| Document | Diagrams | Answers |
|---|---|---|
| **[uml-use-cases.md](uml-use-cases.md)** | Use case diagram, actor table, use-case-to-requirement map | Who uses this, and what for? |
| **[uml-structure.md](uml-structure.md)** | Component, deployment, domain class, backend layering class | What is it made of, and how is it arranged? |
| **[uml-behaviour.md](uml-behaviour.md)** | Four sequence diagrams, order state machine, search activity | What happens when someone does something? |

### Find a diagram

| Looking for | Go to |
|---|---|
| Actors and their permitted use cases | [uml-use-cases.md](uml-use-cases.md#the-diagram) |
| Which service calls which, and how | [uml-structure.md](uml-structure.md#1-component-diagram) |
| Containers, ports, volumes, start-up order | [uml-structure.md](uml-structure.md#2-deployment-diagram) |
| Entities and their associations | [uml-structure.md](uml-structure.md#3-domain-class-diagram) |
| The layering inside one service | [uml-structure.md](uml-structure.md#4-backend-layering-class-diagram) |
| Registration and the welcome email | [uml-behaviour.md](uml-behaviour.md#1-sequence--registration) |
| Sign-in, and how a request is authorised | [uml-behaviour.md](uml-behaviour.md#2-sequence--sign-in-and-an-authenticated-call) |
| Adding to the cart, and the stock check | [uml-behaviour.md](uml-behaviour.md#3-sequence--add-to-cart) |
| Checkout, Stripe, stock decrement, email | [uml-behaviour.md](uml-behaviour.md#4-sequence--checkout-and-payment) |
| Order statuses and their transitions | [uml-behaviour.md](uml-behaviour.md#5-state-machine--order) |
| How a filtered search is executed | [uml-behaviour.md](uml-behaviour.md#6-activity--faceted-product-search) |
| Tables, columns, constraints | [data-model.md](data-model.md) — not a UML document |

---

## How to Read Them

**Diagrams are Mermaid**, rendered by GitHub. Each one names the source it was
derived from — a controller, a service method, a Compose file — so a diagram
that stops matching the code can be checked against it rather than guessed at.

**They show the system as delivered, not as intended.** Where the two differ,
the diagram carries a note naming the defect id. The clearest example is the
[use case diagram](uml-use-cases.md#intended-access-versus-actual-access), which
draws access as designed and then lists the four cases reachable by actors that
should not have them.

**Keep them with the code.** A change to a request flow, a service boundary, an
entity or the deployment topology updates the diagram in the same change set —
rule 2 of the [documentation workflow](../README.md#maintenance-rules).

---

## What the Diagrams Do Not Show

Stated here once, rather than repeated on every page:

- **Retries and timeouts.** There are none to draw: `RestTemplate` calls run with
  default timeouts and no circuit breaker.
- **Transaction boundaries across services.** None exist. Where a diagram shows
  two databases changing in one flow, they change independently — which is the
  whole of `BUG-01`.
- **Horizontal scale.** Every service is drawn as one instance because one is
  what runs. Nothing in the design prevents more except the stock race
  (`BUG-02`).
- **Correlation between logs.** There is no distributed tracing, so the sequence
  diagrams cannot be reconstructed from a running system; they were derived from
  source.
- **The admin dashboard's data sources.** Some tiles are fed by
  `/api/admin/app/analytics`, others by placeholder constants in the SPA; the
  split is in
  [../frontend/design-decisions.md](../frontend/design-decisions.md).
