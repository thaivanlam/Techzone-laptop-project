# Bug Taxonomy — TechZone Laptop Platform

A classification of the defect types this system can produce, with the concrete
instance of each one that has actually been found here.

This document answers **"what kind of bug is this?"**. It does not replace the
defect register: [`../backend/known-defects.md`](../backend/known-defects.md)
records *which* defects exist, their severity, reproduction and fix. This file
records the *classes* those defects fall into, so that a new report can be
routed, a review can be aimed, and a gap in test coverage can be named.

Two rules govern the classification:

- **A defect has one primary class** — the property that was actually violated.
- **A defect may have secondary classes** — the way it surfaces to a user, or a
  second property it also breaks. `SEC-03` is a *security* bug primarily, but a
  user experiences it as a *workflow* bug, and it exists because of a *logical*
  assumption. All three are recorded.

Last classification pass: 2026-08-25, against the register audited 2026-08-22.

---

## Table of Contents

1. [The Twelve Classes at a Glance](#1-the-twelve-classes-at-a-glance)
2. [Functional Bugs](#2-functional-bugs)
3. [Logical Bugs](#3-logical-bugs)
4. [Performance Bugs](#4-performance-bugs)
5. [Security Bugs](#5-security-bugs)
6. [Compatibility Bugs](#6-compatibility-bugs)
7. [Usability (UI/UX) Bugs](#7-usability-uiux-bugs)
8. [Syntax Bugs](#8-syntax-bugs)
9. [Integration Bugs](#9-integration-bugs)
10. [Concurrency Bugs](#10-concurrency-bugs)
11. [Out-of-Bounds Bugs](#11-out-of-bounds-bugs)
12. [Regression Bugs](#12-regression-bugs)
13. [Workflow Bugs](#13-workflow-bugs)
14. [Classification of the Current Register](#14-classification-of-the-current-register)
15. [What the Distribution Says](#15-what-the-distribution-says)
16. [Reporting a New Defect](#16-reporting-a-new-defect)
17. [Cross-References](#17-cross-references)

---

## 1. The Twelve Classes at a Glance

| # | Class | One-line definition | Where it lives in this stack | First line of defence |
|---|---|---|---|---|
| 1 | **Functional** | A feature does not do what its specification says | Controllers, service methods, React handlers | Endpoint contract in [api-reference.md](../backend/api-reference.md) |
| 2 | **Logical** | Code runs without error but computes the wrong answer | Totals, aggregates, JPQL filters, DTO mappers | Unit tests over the calculation |
| 3 | **Performance** | Correct result, unacceptable cost in time or memory | Repository queries, in-memory paging, N+1 | Query review, database-side pagination |
| 4 | **Security** | Unauthorised access, disclosure, or exploitation | Gateway role rules, ownership checks, secrets | [security-model.md](../architecture/security-model.md) |
| 5 | **Compatibility** | Works in one environment, breaks in another | Browsers, cookie policy, dependency versions, JDK | Version pinning, cross-browser check |
| 6 | **Usability (UI/UX)** | Behaviour is technically correct but confuses the user | Modals, error toasts, empty states, labels | Manual walkthrough of the screen |
| 7 | **Syntax** | The code does not compile, parse, or lint | Java compilation, JSX, YAML config | Build + ESLint |
| 8 | **Integration** | Two components each work alone but fail together | Gateway↔service paths, REST calls, RabbitMQ | Contract test across the boundary |
| 9 | **Concurrency** | Two operations touch shared state at once | Stock decrement, cart total, SKU uniqueness | Locking or a database constraint |
| 10 | **Out-of-Bounds** | An input or index leaves the allowed range | String indexes, nullable unboxing, uploads | Input validation at the edge |
| 11 | **Regression** | New work breaks something that used to work | Any change to a shared path or contract | A test suite that asserts behaviour |
| 12 | **Workflow** | The step-by-step user journey breaks or dead-ends | Checkout, login/session, admin CRUD flows | End-to-end journey test |

---

## 2. Functional Bugs

**Definition.** The feature exists, runs, and returns — but it does not do what
the requirement says it should. A submit button that saves nothing, a search box
that reports failure instead of "no results", a delete that removes more than it
was asked to.

**In this system.**

- **`BUG-04` — an empty search result is returned as `400 Bad Request`.**
  `ProductServiceImpl` treats "no product matched the filter" as an error
  condition. The requirement is that a search with no matches is a *successful*
  search over an empty page. The endpoint therefore fails its own contract in
  [api-reference.md](../backend/api-reference.md).
- **`BUG-15` — the category filter is an exact match written as a `LIKE`.** The
  JPQL uses `LIKE :category` with no `%` wildcards, so a filter the UI presents
  as a partial-match search behaves as exact string equality.
- **`BUG-18` — order status is an unvalidated free-text string.** Any string is
  accepted as a status, so `shipped`, `Shipped` and `shpped` are three different
  states as far as the database is concerned.
- **`OPS-01` — product images are lost on container recreation.** The upload
  succeeds, the image renders, and the file disappears the next time the
  container is replaced, because the upload directory is not a named volume.

**Where it hides here.** Between the controller signature and what the service
actually does — especially wherever the "not found" or "empty" case was never
given a deliberate answer.

**How to catch it.** Compare the handler against the row for that endpoint in
[api-reference.md](../backend/api-reference.md). Every endpoint needs a defined
answer for the empty case, the not-found case, and the unauthorised case.

---

## 3. Logical Bugs

**Definition.** No exception, no crash, no failed request. The program takes the
wrong branch or applies the wrong formula and confidently returns a wrong value.
The most expensive class to find, because nothing reports it.

**In this system.**

- **`BUG-07` — the cart total drifts away from the sum of its lines.** Two code
  paths compute the same field differently: `addProductToCart` recomputes the
  total from the line items, while `updateProductQuantityInCart` applies an
  incremental delta using the *current* price. When a `specialPrice` changes in
  between, the delta subtracted differs from the amount originally added. The
  next full recompute silently corrects it — so the symptom is intermittent,
  which is the signature of this class.
- **`BUG-05` — `updateCategory` rebuilds the entity from the DTO.** Every column
  the DTO does not carry is written back as `null`. The update "succeeds".
- **`BUG-13` — deleting a category deletes every product in it.** `CascadeType.ALL`
  on a catalogue relationship turns one intended deletion into many.
- **`BUG-14` — specification facets silently exclude products without specs.** An
  inner join on an optional relationship drops rows rather than including them
  with empty values. The facet counts are wrong, and nothing says so.
- **`BUG-16` — revenue includes cancelled orders.** The aggregate ignores order
  status, so the dashboard reports money that was never collected.
- **`OPS-04` — `double` used for money across product and order services.**
  Binary floating point cannot represent `0.1` exactly; totals accumulate
  rounding error.

**Where it hides here.** Anywhere the same quantity is derived in two places
(`BUG-07`), and anywhere a JPQL join or a DTO-to-entity mapping quietly changes
the shape of the result (`BUG-05`, `BUG-14`).

**How to catch it.** Unit tests that assert *values*, not status codes. For money
and totals: recompute from source rather than tracking a delta, and represent
money as `BigDecimal`.

---

## 4. Performance Bugs

**Definition.** The answer is right, but the cost of getting it grows badly with
data volume or concurrency — latency, memory, or database load.

**In this system.**

- **`BUG-17` — seller order listing pages in memory.** Every order in the table
  is loaded into the JVM and then sliced to a page. Correct output; cost linear
  in the size of the whole table, on every call. At demo volume it is invisible;
  at ten thousand orders it is the first thing that falls over.

**Where it hides here.** Repository methods that return `List<T>` and are then
paginated by the service; lazy associations fetched inside a loop (N+1); the
in-memory analytics aggregation in order-service.

**How to catch it.** Read every repository method that feeds a paged endpoint and
confirm the `Pageable` reaches the database. Enable SQL logging and count the
statements produced by one request — an N+1 announces itself immediately.

**Note.** This class is under-represented in the register only because the
project has never been run at volume. Absence of findings here is absence of
measurement, not evidence of health.

---

## 5. Security Bugs

**Definition.** A defect that lets someone read, change, or destroy what they are
not entitled to — or that leaks the means to do so. In this system it is the
majority class by a wide margin.

**In this system.**

| Sub-type | Instances |
|---|---|
| **Broken authentication** | `SEC-01` public signup accepts a self-selected `admin` role; `SEC-13` `httpOnly=false`, `secure=false`, no `SameSite`, no revocation |
| **Missing authorization (role)** | `SEC-02` user administration under a public gateway path; `SEC-05` seller product endpoints; `SEC-06` specification controller outside the gateway's path scheme *(fixed 2026-08-25)* |
| **Missing authorization (ownership)** | `SEC-07` `GET /carts` returns every user's cart; `SEC-08` any logged-in user can change any order's status; `SEC-09` address update/delete by id with no owner check; the still-open half of `SEC-05` |
| **Trusting the client** | `SEC-03` payment success is asserted by the browser, with no Stripe webhook to verify it |
| **Exposed secrets and surfaces** | `SEC-04` the JWT signing secret is a literal in four tracked files; `SEC-10` the internal stock API is unauthenticated on a published port; `SEC-11` the notification endpoint sends arbitrary mail from the project's Gmail account; `SEC-12` the Eureka registry is public and writable |
| **Sensitive data in logs** | `OPS-07` `System.out.println` of customer PII |
| **Unvalidated upload** | `OPS-02` no upload allow-list, replaced files never deleted |

**Where it hides here.** In the gap between the gateway and the service. The
gateway enforces roles by URL pattern; the services enforce nothing. Any path the
gateway's patterns do not match is therefore completely open — which is exactly
what `SEC-06` was.

**How to catch it.** For every endpoint, ask two separate questions: *which role*
may call it, and *whose row* may it touch. A role check is not an ownership
check. `SEC-05`, `SEC-07`, `SEC-08` and `SEC-09` are all the second question
going unasked.

**Prevention.** Move enforcement into the services with method security, so that
a routing change can never silently remove a check. See
[security-model.md](../architecture/security-model.md) and the ADRs in
[../architecture/decisions/](../architecture/decisions/).

---

## 6. Compatibility Bugs

**Definition.** The code works in the environment it was written in and fails in
another — a different browser, a different runtime version, a different build of
the same image, a different library version on the classpath.

**In this system.**

- **`SEC-13` — cookie flags.** The auth cookie is set without `SameSite`.
  Browsers no longer agree on the default: Chrome treats an unspecified
  `SameSite` as `Lax`, and Safari's cross-site tracking prevention is stricter
  again. A login that works in one browser can silently drop the cookie in
  another. Filed as a security defect; it is a compatibility defect as well.
- **`OPS-03` — jjwt version skew.** product-service resolves 0.12.6 while the
  other modules use 0.13.0. Two versions of the same JWT library parsing tokens
  from one issuer is a compatibility failure waiting for an API change.
- **`OPS-08` — notification-service targets Java 17** while the rest of the
  backend is on a later JDK, and it sits under a different base package.
- **`OPS-05` — `GenerationType.AUTO` on `Product` only.** `AUTO` resolves to a
  different strategy depending on the dialect, so this entity's id behaviour is
  tied to the database in a way the other entities' is not. That is why
  `product_seq` needs its own handling in
  [database-seeding.md](../operations/database-seeding.md).
- **The Stripe empty Payment Element (2026-08-24)** — the clearest example this
  project has produced. The checkout page rendered the "Payment Information"
  heading and the Pay button but no card fields, because Vite inlines every
  `VITE_*` variable into the bundle **at build time**. The running container
  served a bundle built while `.env` was still un-filled, so it carried the
  placeholder key forever. Restarting could not fix it; only
  `docker compose build frontend` could. Same source, same `.env`, two
  environments — dev server and built image — behaving differently. Recorded in
  [dev-log/2026-08.md](../dev-log/2026-08.md) and in
  [docker-setup.md](../operations/docker-setup.md).

**Where it hides here.** The build-time/runtime split of `VITE_*` variables, and
anywhere two modules pin different versions of one dependency.

**How to catch it.** Pin shared dependency versions in one place. For the
frontend, verify what the *artifact* contains, not what the source says:

```sh
docker exec frontend sh -c 'grep -ro "pk_test_[A-Za-z0-9_]*" /usr/share/nginx/html/assets'
```

---

## 7. Usability (UI/UX) Bugs

**Definition.** The system does what it was built to do, and the user still
cannot tell what happened. Wrong labels, missing empty states, error messages
that describe an internal condition rather than a user-facing one.

**In this system.**

- **`BUG-04` as the user sees it.** A search with no matches returns `400`, so
  the SPA shows a request-failure state instead of "no laptops match these
  filters". The user is told they did something wrong when they did not.
- **`BUG-10` — cross-service exceptions surface as untyped 500s.** `StripeException`,
  `RestClientException` and `AmqpException` are not mapped by
  `MyGlobalExceptionHandler`, so they reach the browser as a Spring whitelabel
  page instead of the `APIResponse` envelope. The SPA cannot distinguish a
  downstream outage from its own bad request, so it cannot phrase a useful
  message.
- **The specification modal's "Save" vs "Update" label (fixed 2026-08-25).**
  [`ProductSpecificationModal.jsx`](../../frontend/src/components/modal/ProductSpecificationModal.jsx)
  read `product.productId`, but the dashboard rows in
  [`AdminProducts.jsx`](../../frontend/src/components/admin/products/AdminProducts.jsx)
  expose the id as `id`. The prefill fetch compared against `undefined` and never
  ran, so opening the modal on a product that *already had* specifications showed
  an empty form labelled "Save". The user is invited to create what already
  exists.
- **`BUG-12` — two endpoints answer `302 FOUND` for a successful read.** A
  redirect status on a normal JSON body confuses clients and anyone reading the
  network tab.

**Where it hides here.** Empty states, first-load states, and every place a
backend status code is translated into a message for a human.

**How to catch it.** Walk the screen as a user with no knowledge of the code:
open the modal on a record that already has data, search for something that does
not exist, submit the form twice.

---

## 8. Syntax Bugs

**Definition.** The code does not compile, parse, or lint. Typos, missing
brackets, unbalanced YAML.

**In this system.** No entry in the register — which is expected. The backend is
Java: a syntax error stops the Maven build, so it can never reach `main`. YAML in
the config server is the exception worth naming: an indentation mistake in
`application.yaml` parses as *valid but different* configuration, which is why a
config-server change is a routing change rather than a text change.

**The important caveat.** In the React frontend, the class of mistake a compiler
catches in Java is *not* caught. `isAdmin={true}` in `AdminProducts.jsx` was a
single-token mistake with the same shape as a typo — the component already had
the real value from `user.roles` a few lines above — and it built cleanly,
rendered cleanly, and sent a seller's browser to the admin endpoint. Nothing in
the toolchain objects to a valid literal in the wrong place.

**How to catch it.** `npm run build` and `eslint.config.js` catch the parse-level
half. The literal-in-the-wrong-place half is caught only by review, or by types.

---

## 9. Integration Bugs

**Definition.** Each component is correct in isolation, and the system is wrong
because the contract between them is not what one side believed. In a
microservice platform this is the structural risk class.

**In this system.**

- **`SEC-06` — the specification controller sat outside the gateway's path
  scheme.** `ProductSpecificationController` was mapped at `/api/products`, so
  `admin`, `seller` and `public` landed in the **third** path segment. The
  gateway's role patterns (`/product-manager/api/admin/**`) match on the
  **second**. Neither side was wrong on its own; the two disagreed about where
  the role segment sits, and the result was an endpoint with no role check at all
  — and, in the other direction, a public read that demanded a login. Fixed
  2026-08-25 by moving the base path to `/api`.
- **`BUG-01` — a failed multi-line order leaves stock permanently decremented.**
  Order-service decrements stock in product-service over REST, then continues. If
  a later line fails, the local transaction rolls back — the remote decrement
  does not, and there is no compensating action. Two services, two transaction
  scopes, one assumption that they are a single one.
- **`BUG-11` — publishing to RabbitMQ inside the order transaction.** A broker
  outage rolls the order back but not the stock already taken.
- **`BUG-06` — a failed email send is swallowed.** The exception is discarded,
  the message is acked, and there is no dead-letter queue. Order-service believes
  the customer was notified; notification-service knows they were not; nobody
  reconciles the two.
- **`BUG-16` — revenue returned as a string** where the frontend expects a
  number: a type contract broken across the boundary.
- **`SEC-10` — the internal stock API on a published port.** An endpoint designed
  for the private network is reachable from the host because the Compose file
  publishes every service port.

**Where it hides here.** Three boundaries: gateway→service (path and role
contract), service→service over REST (transaction and type contract), and
service→RabbitMQ→service (delivery and failure contract).

**How to catch it.** For every cross-service write, ask what compensates it when
the caller fails afterwards. For every gateway route, verify by request that the
pattern actually matches the service's mapping — an unmatched pattern fails open,
silently.

---

## 10. Concurrency Bugs

**Definition.** Two operations touch the same state at the same time and the
outcome depends on their interleaving. Lost updates, race conditions, deadlocks.
Rare in test, reproducible only under load, and the hardest class to diagnose
after the fact.

**In this system.**

- **`BUG-02` — concurrent checkout oversells the last unit.**
  `reduceProductQuantity` reads the quantity, compares it, and writes back the
  decremented value with no lock and no atomic `UPDATE`. Two checkouts that both
  read `1` both pass the check, and both write `0`. One unit sold twice. This is
  the textbook read-modify-write race, in the one place in the platform where
  money and inventory meet.
- **`OPS-06` — SKU has no unique constraint.** Without the constraint, two
  concurrent product creations can produce the same SKU and the database will
  accept both. A unique index is the cheapest concurrency control available, and
  it is missing.
- **`BUG-07` (secondary)** — the cart-total drift widens when a price change and
  a quantity update interleave.

**Where it hides here.** Any read-check-write over a shared row: stock, cart
totals, order status.

**How to catch it.** Reading alone will find these — look for the pattern
`get → compare → set` on an entity two users can hold at once. To confirm, fire
concurrent requests at the endpoint:

```sh
seq 1 20 | xargs -P 20 -I{} curl -s -X POST "$GATEWAY/product-manager/api/products/{id}/quantity/1" > /dev/null
```

**Prevention.** `@Lock(PESSIMISTIC_WRITE)`, a `@Version` column, or an atomic
`UPDATE ... SET quantity = quantity - :n WHERE quantity >= :n` that lets the
database perform the check.

---

## 11. Out-of-Bounds Bugs

**Definition.** A value leaves the range the code silently assumed for it — a
negative index, a null where an object was expected, an input past a limit that
was never stated.

**In this system.**

- **`BUG-08` — image upload crashes on a filename without an extension.**
  `originalFileName.substring(originalFileName.lastIndexOf("."))` — `lastIndexOf`
  returns `-1` when there is no dot, so `substring(-1)` throws
  `StringIndexOutOfBoundsException`. `getOriginalFilename()` can also return
  null. Neither is mapped by the exception handler, so both surface as a 500.
  The literal form of this class.
- **`BUG-09` — null stock throws a NullPointerException.**
  `product.getQuantity() < quantity` unboxes a nullable `Integer`.
  `Product.quantity` has no `@NotNull` and no default, so a product created
  without one fails the internal stock call — and a checkout dies with an untyped
  500.
- **`OPS-02` — no upload allow-list.** No constraint on file type or size: the
  range of accepted input was never defined at all.

**Where it hides here.** Every `substring`, every `Integer`/`Long` unboxed in a
comparison, and every request field that arrives without `@Valid`.

**How to catch it.** Test the edges deliberately — a file named `README`, a
quantity of `0` and `-1`, a page index past the last page, an empty string where
a name is expected.

---

## 12. Regression Bugs

**Definition.** Something that used to work stops working because of a later,
often unrelated change. Distinct from the other classes in that it is defined by
*when* it appeared, not by what is wrong.

**In this system.**

- **`OPS-10` — tests are context-load smoke tests only.** This is the regression
  entry that matters. The backend's tests assert that the Spring context starts;
  they assert nothing about behaviour. There is therefore no mechanism in this
  project that would detect a regression at all. Every class above is currently
  guarded by review alone.
- **A live example, from the `SEC-06` fix (2026-08-25).** Moving
  `ProductSpecificationController` from `/api/products` to `/api` changed the
  URLs that three frontend components call. Had any caller been missed, the fix
  would have introduced a regression in a screen unrelated to the reported bug.
  All three were updated in the same change set for exactly that reason.
- **A regression risk knowingly accepted in the same fix.** The new gateway rule
  grants `/product-manager/api/seller/**` to `ROLE_SELLER` only, while
  `/order-manager/api/seller/**` grants `[ROLE_ADMIN, ROLE_SELLER]`. The seeded
  `admin` account holds all three roles, so nothing broke — but an admin account
  holding *only* `ROLE_ADMIN` would now get `403` where the equivalent order path
  works. Recorded in the dev log rather than smoothed over, because the two rules
  disagree.

**Where it hides here.** Shared contracts: gateway patterns, the `APIResponse`
envelope, DTO field names the SPA consumes, and any controller base path.

**How to catch it.** Until behavioural tests exist: when changing a shared path
or a DTO, grep the frontend for every caller before committing, and list them in
the dev-log entry.

---

## 13. Workflow Bugs

**Definition.** Each screen works; the *journey* through them does not. The user
is dropped, sent backwards, blocked mid-flow, or allowed to reach a state the
flow was never meant to permit.

**In this system.**

- **`BUG-03` — the auth cookie outlives the token by 23 hours.** The cookie's
  `maxAge` is 24 hours; the JWT inside it expires after 50 minutes. The SPA sees
  a cookie, believes the user is signed in, renders the account UI — and every
  request returns `401`. A user who leaves a tab open and comes back to finish a
  checkout is logged in and locked out at the same time.
- **`SEC-03` — payment success is asserted by the client.** The checkout journey
  has no server-side confirmation step; the browser tells the backend that it
  paid. The flow is missing its verification stage, which is what also makes it a
  security defect.
- **The frontend half of `SEC-05`/`SEC-06` — `isAdmin={true}`.** A seller's
  journey through the admin panel built an admin URL. Under a correct gateway the
  seller would have been stopped mid-flow with a `403` on a screen the UI had
  offered them; under the broken gateway it succeeded. Either way the journey was
  wrong.
- **`BUG-18` — order status is unvalidated free text.** With no state machine, an
  order can move from `delivered` back to `pending`, or into a status that does
  not exist. The fulfilment workflow has no defined shape.
- **`BUG-01` as a journey.** A checkout that fails on its third line leaves the
  user with no order, and the catalogue with three units of stock gone.

**Where it hides here.** The two multi-step journeys — cart → checkout → payment
→ order, and login → session → privileged action.

**How to catch it.** Walk each journey end to end, then walk it again while
breaking one step: refuse the payment, expire the session mid-flow, fail the
third line item.

---

## 14. Classification of the Current Register

Every entry in [`../backend/known-defects.md`](../backend/known-defects.md),
classified. **Primary** is the property actually violated; **also** lists the
other classes the defect belongs to.

| ID | Severity | Primary class | Also |
|---|---|---|---|
| `SEC-01` | Critical | Security | Functional |
| `SEC-02` | Critical | Security | Integration |
| `SEC-03` | Critical | Security | Workflow, Logical |
| `SEC-04` | Critical | Security | — |
| `BUG-01` | Critical | Integration | Logical, Workflow |
| `SEC-05` | High | Security | — |
| `SEC-06` *(fixed)* | ~~High~~ | Integration | Security, Functional |
| `SEC-07` | High | Security | — |
| `SEC-08` | High | Security | Workflow |
| `SEC-09` | High | Security | — |
| `SEC-10` | High | Security | Integration |
| `SEC-11` | High | Security | — |
| `BUG-02` | High | Concurrency | Logical |
| `BUG-03` | High | Workflow | Logical, Usability |
| `BUG-04` | High | Functional | Usability |
| `BUG-05` | High | Logical | Functional |
| `BUG-06` | High | Integration | Functional |
| `BUG-07` | Medium | Logical | Concurrency |
| `BUG-08` | Medium | Out-of-Bounds | Functional |
| `BUG-09` | Medium | Out-of-Bounds | Logical |
| `BUG-10` | Medium | Integration | Usability |
| `BUG-11` | Medium | Integration | Logical |
| `BUG-12` | Medium | Functional | Usability, Compatibility |
| `BUG-13` | Medium | Logical | Functional |
| `BUG-14` | Medium | Logical | Functional |
| `BUG-15` | Medium | Functional | Logical |
| `BUG-16` | Medium | Logical | Integration |
| `BUG-17` | Medium | **Performance** | — |
| `BUG-18` | Medium | Functional | Workflow |
| `SEC-12` | Medium | Security | — |
| `SEC-13` | Medium | Security | Compatibility |
| `OPS-01` | Medium | Functional | — |
| `OPS-02` | Medium | Security | Out-of-Bounds |
| `OPS-03` | Low | Compatibility | — |
| `OPS-04` | Low | Logical | — |
| `OPS-05` | Low | Compatibility | Integration |
| `OPS-06` | Low | Concurrency | Logical |
| `OPS-07` | Low | Security | — |
| `OPS-08` | Low | Compatibility | — |
| `OPS-09` | Low | *(hygiene — not a runtime defect)* | — |
| `OPS-10` | Low | **Regression** *(the absence of any guard)* | — |

Defects found outside the register, recorded in
[dev-log/2026-08.md](../dev-log/2026-08.md):

| Defect | Primary class | Also |
|---|---|---|
| Stripe Payment Element rendered empty (stale `VITE_*` key baked into the image) | Compatibility | Workflow |
| `isAdmin={true}` hard-coded in `AdminProducts.jsx` | Security | Syntax-shaped, Workflow |
| Specification modal prefill never ran (`productId` vs `id`) | Usability | Functional |
| `depends_on: service_healthy` on a gateway with no healthcheck | Integration | — |

---

## 15. What the Distribution Says

Counting primary classes across the register:

| Class | Count | Reading |
|---|---|---|
| Security | 15 | The dominant class. Enforcement lives only in the gateway, by URL pattern, so every mismatch fails open. |
| Logical | 8 | Concentrated in money and aggregates — cart totals, revenue, `double` for currency. |
| Integration | 6 | The cost of six services with no contract tests between them. |
| Functional | 6 | Mostly undefined answers for the empty and not-found cases. |
| Compatibility | 4 | Version skew across modules, plus the build-time/runtime split. |
| Out-of-Bounds | 2 | Missing validation at the upload and stock edges. |
| Concurrency | 2 | Both at the stock/SKU boundary — where money meets inventory. |
| Performance | 1 | Only one, because nothing has been measured. |
| Regression | 1 | `OPS-10`: there is no guard at all. |
| Usability / Workflow / Syntax | 0 primary | They appear only as secondary classes — a consequence of auditing the source rather than the running UI. |

Three conclusions worth acting on:

1. **Security is not a category of work here, it is the default failure mode.**
   Gateway-only enforcement means any new controller whose path does not match a
   pattern is public. Method security inside the services would convert this
   class from "fails open" to "fails closed".
2. **Usability, workflow and performance read as zero because of how the register
   was built** — a source audit, not a session with the running system. Their
   true count is not zero; it is unmeasured.
3. **`OPS-10` multiplies every other row.** With only context-load smoke tests,
   nothing prevents a fixed defect from returning. Behavioural tests over the
   checkout journey and the stock decrement would guard the two areas carrying
   the most severe entries.

---

## 16. Reporting a New Defect

When adding an entry to [`../backend/known-defects.md`](../backend/known-defects.md),
record its class. The ID prefix carries the coarse split (`SEC` / `BUG` / `OPS`);
the class from this document tells a reader how to look for the rest of its
family.

```markdown
### BUG-nn — One-line statement of what is wrong

**Class:** Concurrency (also: Logical)
**Location:** `backend/<module>/.../File.java:line`
**Severity:** High

<what the code does, with the two or three lines that do it>

**Reproduction**
<commands or steps>

**Impact:** <what a user or the data suffers>
**Fix:** <the change, not just the direction>
```

A defect that fits no class in this document is worth pausing on — either the
list needs a thirteenth entry, or the finding is a design trade-off rather than a
defect. Deliberate trade-offs belong in
[../architecture/decisions/](../architecture/decisions/), not in the register.

---

## 17. Cross-References

| For | See |
|---|---|
| The defects themselves, with fixes and remediation order | [../backend/known-defects.md](../backend/known-defects.md) |
| Endpoint contracts each functional defect is measured against | [../backend/api-reference.md](../backend/api-reference.md) |
| Role enforcement, and why the security class dominates | [../architecture/security-model.md](../architecture/security-model.md) |
| Gateway path patterns — the source of the integration class | [../backend/services/api-gateway.md](../backend/services/api-gateway.md) |
| How each defect was found and fixed | [../dev-log/](../dev-log/) |
| Build-time versus runtime configuration | [../operations/docker-setup.md](../operations/docker-setup.md) |
| Accepted simplifications that are *not* defects | [../architecture/design-decisions.md](../architecture/design-decisions.md) |
