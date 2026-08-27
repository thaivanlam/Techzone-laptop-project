# Test Report

What the suites contain, what has been executed, and what the results say about
the platform's readiness.

Strategy and how to run them: [test-plan.md](test-plan.md). Cases:
[test-cases.md](test-cases.md). Manual pass:
[uat-checklist.md](uat-checklist.md). Defects:
[../backend/known-defects.md](../backend/known-defects.md).

**Report date:** 2026-08-25 · **Commit state:** working tree, backend submodule
modified · **Environment:** local development machine

---

## Table of Contents

1. [Summary](#1-summary)
2. [Runs Recorded](#2-runs-recorded)
3. [Suite Inventory](#3-suite-inventory)
4. [What the Suites Prove](#4-what-the-suites-prove)
5. [Coverage Gaps](#5-coverage-gaps)
6. [Known-Wrong Behaviour Under Test](#6-known-wrong-behaviour-under-test)
7. [What the Suites Found on Their Own](#7-what-the-suites-found-on-their-own)
8. [Release Readiness](#8-release-readiness)
9. [What to Test Next](#9-what-to-test-next)

---

## 1. Summary

| Metric | Value |
|---|---|
| Automated tests written | **362** |
| Executed at least once, green | **354** |
| Never executed | **8** — the `RUN_DESTRUCTIVE=1` cases that place real orders |
| Failures outstanding | **0** |
| Requirements with at least one automated case | 47 of 62 |
| Cases pinning known-wrong behaviour | 21 |
| Defects found *by* the suites | 3 (`BUG-19`, `BUG-20`, `BUG-21`) plus one stale deployment |
| Open Critical defects | 5 |

Every level is green. That is not the same as the platform being sound: five
Critical defects remain open, and the suites pin twenty-one behaviours that
contradict the specification on purpose — see
[§6](#6-known-wrong-behaviour-under-test) and [§8](#8-release-readiness).

---

## 2. Runs Recorded

Two runs are recorded here. They differ in what was available, and the
distinction matters when reading a result.

### Run A — offline levels, re-run for this report

| Suite | Tests | Failures | Result |
|---|---|---|---|
| api-gateway | 29 | 0 | ✅ |
| config-server | 1 | 0 | ✅ |
| discovery-service | 1 | 0 | ✅ |
| user-service | 63 | 0 | ✅ |
| product-service | 71 | 0 | ✅ |
| order-service | 56 | 0 | ✅ |
| notification-service | 4 | 0 | ✅ |
| **Backend total** | **225** | **0** | ✅ BUILD SUCCESS ×7 |
| Front-end unit (`tests/frontend/`) | 44 | 0 | ✅ |
| **Total** | **269** | **0** | ✅ |

Run offline against a warm Maven repository, on JDK 25 with the modules
targeting 21. No test contacted the network: each module's test-classpath
configuration disables Config Server and Eureka and points the datasource at
in-memory H2.

The system and acceptance suites were **not** executed in this run — no stack was
answering. Their skip behaviour was verified instead:

```
npm run preflight
→ No stack answering at http://localhost:8080 (ECONNREFUSED).
  Start it with "docker compose --profile prod up -d"

npm run test:system
→ 4 suites skipped, 0 tests, 0 failures
```

A missing stack produces a skip with an explanation, not a wall of connection
errors. That is the designed behaviour, confirmed rather than assumed.

### Run B — full stack, recorded by the suite author

Recorded on the same day against a live Compose stack with the demo catalogue
loaded: **342 of 350 green** — 213 with Maven, 44 front-end, 54 system, 31
acceptance. The remaining 8 are the `RUN_DESTRUCTIVE=1` cases that place real
orders; they have not been executed.

Figures below this point (and the Summary in [§1](#1-summary)) include the
12 unit and integration tests added for the change-password feature on
2026-08-26, written after this run and covered only by Run A above; neither
run has been repeated since, so **342 of 350** remains this run's own, honest
figure for the stack as it existed on the day it ran.

That run is the origin of the three defects in
[§7](#7-what-the-suites-found-on-their-own). It is reported here as recorded, not
as re-observed: the live levels have not been re-run since.

**To reproduce it**, rebuild first — the stack runs whatever is in the images:

```bash
docker compose build && COMPOSE_PROFILES=prod,seed docker compose up -d
cd tests && npm run preflight && npm test
```

---

## 3. Suite Inventory

### Level 1 — Unit · 197 tests

**Backend — 153**

| Module | Class | Tests | What it pins down |
|---|---|---|---|
| product-service | `ProductServiceImplTest` | 19 | Special-price arithmetic, duplicate detection, seller stamping, SKU regeneration on rename, stock decrement and its refusals |
| product-service | `JwtServiceTest` | 15 | Cookie resolution, token validity, every claim shape the service must tolerate |
| product-service | `SKUGeneratorTest` | 13 | SKU shape segment by segment: category prefix, padding, brand normalisation, model-word extraction, the random tail |
| product-service | `ImagePathUtilsTest` | 4 | Absolute vs relative image directories, normalisation |
| order-service | `CartServiceImplTest` | 27 | Cart creation, line accumulation, stock validation including what is already in the cart, quantity arithmetic, removal, bulk sync, repricing |
| order-service | `OrderServiceImplTest` | 12 | Checkout: order written, lines copied, payment recorded, stock taken, cart emptied, confirmation published; empty-cart and no-cart refusals |
| user-service | `AuthServiceImplTest` | 26 | Sign-in success and failure, password hashing, role defaulting, duplicate refusals, account-deletion guards, self-service password verify/change |
| user-service | `JwtUtilsTest` | 13 | Token minting and the claim contract other services depend on, cookie lifetime and flags |
| api-gateway | `AuthenticationFilterTest` | 21 | The full authentication and authorisation truth table: public paths, pre-flight, missing/blank/expired/garbage/forged tokens, every role against every guarded route |
| notification-service | `EmailServiceImplTest` | 3 | Message assembly from the configured sender, and the swallowed-failure behaviour |

**Front end — 44**

| File | Tests | What it pins down |
|---|---|---|
| `tests/frontend/reducers.test.js` | 26 | Cart, auth, product and error reducers: every action, the initial state, and that no reducer mutates the state it was handed |
| `tests/frontend/formatting.test.js` | 18 | Currency formatting and rounding, line totals from string-typed form inputs, revenue abbreviation at each threshold, description truncation |

### Level 2 — Integration · 65 tests

| Module | Class | Tests | The seam it covers |
|---|---|---|---|
| product-service | `ProductControllerIntegrationTest` | 10 | URL mapping, query-parameter defaulting, JSON serialisation, and the advice that turns domain exceptions into 400/404 |
| product-service | `ProductRepositoryIntegrationTest` | 9 | Spring Data → Hibernate → SQL: derived queries, the hand-written brand JPQL, paging, the Category→Product cascade, a `Specification` price filter as real SQL |
| order-service | `CartControllerIntegrationTest` | 10 | Cart routing, path-variable binding (`increase` vs `delete`), JSON shape, exception advice |
| order-service | `ProductServiceClientIntegrationTest` | 6 | **The cross-service contract**: URL assembly, base-URL normalisation, deserialisation, the reduce-stock body shape, how remote failures surface |
| user-service | `UserRepositoryIntegrationTest` | 9 | Identity persistence: eager role loading, database-level unique constraints, the role-filtered page query |
| user-service | `AuthControllerIntegrationTest` | 8 | The real `SecurityConfig` chain, bean validation on sign-up, and the `Set-Cookie` header carrying the session |
| user-service | `AccountControllerIntegrationTest` | 6 | Request binding and bean validation on the verify/change-password payloads, and the advice that turns `APIException` into 400 |
| api-gateway | `GatewaySecurityPolicyTest` | 7 | The **deployed** policy, bound and asserted: no admin route on the public list, every mapping names a role |

### Level 3 — System · 60 tests

| File | Tests | What it proves about the running system |
|---|---|---|
| `access-control.test.js` | 21 | The access matrix as deployed: anonymous, customer, seller, administrator against public, cart, seller and admin routes; a rubbish cookie refused; sign-out closing access |
| `catalogue.test.js` | 16 | Page envelope, per-product fields, discount arithmetic across the whole catalogue, sorting, price and brand filters, the brand facet, keyword search |
| `cart-and-checkout.test.js` | 16 | Cart → cross-service stock check → order → stock decrement → order history, plus stock refusals and cart isolation between customers |
| `gateway-routing.test.js` | 7 | All three services reachable under their prefixes; path rewriting; JSON content type; CORS pre-flight; unknown prefix 404s |

### Level 4 — Acceptance · 33 tests

| File | Tests | Feature files executed |
|---|---|---|
| `shopping.test.js` | 15 | `browsing-the-shop.feature`, `cart-and-order.feature` |
| `staff.test.js` | 10 | `staff-boundaries.feature` |
| `account.test.js` | 8 | `account-and-sign-in.feature` |

### Smoke · 7 tests

One context-load test per backend module, proving each Spring context still
starts.

---

## 4. What the Suites Prove

Worth stating positively, because a list of defects makes a working system look
broken.

| Area | Evidence |
|---|---|
| **Cart stock rules** | 27 unit tests: accumulation, the exact-stock boundary, refusal above stock, and counting what is already in the cart |
| **Order placement** | 12 unit tests: the accepted order, line copying with snapshots, payment recording, per-line stock reduction, cart emptying, the confirmation message, and refusal of an empty cart |
| **Pricing and SKU** | 32 unit tests across special-price derivation, SKU segment rules, padding and fallbacks |
| **Token handling** | 49 tests over three independent implementations — the issuer in user-service, the validator in product-service, and the gateway filter |
| **Gateway policy** | 28 tests asserting public paths, role mappings and rejection behaviour, both as written and as deployed |
| **Persistence** | 18 tests running real SQL: paging, case-insensitive search, seller isolation, distinct brands, specification joins, cascades |
| **Cross-service contract** | 6 tests pinning request shape, JSON body, base-URL normalisation and failure propagation |
| **The assembled platform** | 60 system tests entering only through the gateway, and 33 acceptance tests worded as user stories |
| **Frontend state** | 44 tests over reducer transitions, purity, and money formatting |

The gateway policy tests are the most valuable thing in the suite: authorisation
here is configuration, and configuration is exactly what a compiler cannot check.

---

## 5. Coverage Gaps

Named so that absence is never mistaken for coverage.

| Gap | Risk | What would close it |
|---|---|---|
| **The 8 destructive cases have never run** | Order placement end to end — the platform's core promise — is proven only by the non-destructive path | One `RUN_DESTRUCTIVE=1 npm test` against a disposable stack |
| **React components, routing, forms** | The largest untested surface: every screen a user actually touches | Vitest + Testing Library inside `frontend/` |
| **Browser end-to-end, including Stripe** | The purchase path is proven at the API level; the card form is unexercised | Playwright against the Compose stack with Stripe test cards |
| **Concurrency** (`BUG-02`, `BUG-21`) | Two known defects, neither reproduced; the suites now avoid the conditions rather than test them | A controlled multi-threaded harness, plus SQL cleanup for `BUG-21` |
| **Volume behaviour** (`BUG-17`, `NFR-PRF-1`) | In-memory paging and unindexed queries untested at realistic size | A seeded catalogue of thousands, plus k6 or JMeter |
| **RabbitMQ and SMTP end to end** | Publishing is verified with a double; delivery is not automated at all | Testcontainers `RabbitMQContainer`, and a mail-catcher in a test profile |
| **Image upload edge cases** (`BUG-08`, `BUG-09`) | Two known crashes with no test | Unit tests over the filename and null-quantity paths |
| **Schema migration** | `ddl-auto: update` is unverifiable — there is nothing to test | Flyway or Liquibase first |

---

## 6. Known-Wrong Behaviour Under Test

Twenty-one cases assert behaviour that contradicts
[../requirements/srs.md](../requirements/srs.md). They pass — that is the point:
each pins a registered defect so it cannot worsen unnoticed, and each **will fail
the moment the defect is fixed**, which is how the register learns the fix
happened.

| Defect | Pinned by | What is pinned |
|---|---|---|
| `BUG-01` | `OrderServiceImplTest` | A checkout failing on its second line leaves the first line's stock taken |
| `BUG-03` | `JwtUtilsTest` | The cookie's 24-hour lifetime against the token's ~50 minutes |
| `BUG-04` | `ProductServiceImplTest` · `catalogue.test.js` | A search matching nothing raises an error instead of returning an empty page |
| `BUG-06` | `EmailServiceImplTest` | A failed send returns normally and the message is lost |
| `BUG-07` | `CartServiceImplTest` | The stored cart total drifts from the sum of its lines after a price change |
| `BUG-10` | `ProductServiceClientIntegrationTest` | A remote 404 reaches the caller untranslated |
| `BUG-12` | `ProductControllerIntegrationTest` · `CartControllerIntegrationTest` | A successful read answered with a redirect status |
| `BUG-13` | `ProductRepositoryIntegrationTest` | Deleting a category deletes its products |
| **`BUG-19`** | `JwtServiceTest` · `JwtUtilsTest` · `AuthenticationFilterTest` | A forged signature escapes as an exception instead of returning `false` — at the gateway, a 500 where a 401 belongs |
| **`BUG-20`** | `CartServiceImplTest` · `cart-and-checkout.test.js` | A customer who has never had a cart gets a 500 on their first cart view |
| `SEC-01` | `AuthServiceImplTest` · `staff.test.js` | Anyone can register as an administrator |
| `SEC-07` | `staff.test.js` · `access-control.test.js` | Any signed-in shopper can list every cart |
| `SEC-10` | `AuthenticationFilterTest` · `GatewaySecurityPolicyTest` | The internal service-to-service route is on the public list |
| `SEC-13` | `JwtUtilsTest` | The auth cookie is neither `HttpOnly` nor `Secure` |

Each such test names the defect id and says, in a comment or an assertion
message, what the expectation must become once the defect is fixed.

**This is the count to watch.** It should fall to zero. A rise means a new defect
was accepted rather than fixed.

---

## 7. What the Suites Found on Their Own

None of these came from reading the source. Each was produced by the act of
testing, which is the strongest available argument for the levels above the unit
tier.

**`BUG-19` — a forged JWT signature escapes the validity check.** Found while
writing `JwtUtilsTest`: the test expected `validateJwtToken(tamperedToken)` to
return `false`, and it threw instead. All four validators catch
`MalformedJwtException`, `ExpiredJwtException`, `UnsupportedJwtException` and
`IllegalArgumentException` — but not `SignatureException`. A structurally valid
token with a wrong signature, which is the shape a forgery actually takes,
propagates out of `isTokenValid`, and the caller sees a 500 where a 401 belongs.

**`BUG-20` — the cart page is a 500 for every brand-new customer.** Found by the
system suite on its first run against a live stack. `CartServiceImpl.getCart`
calls `findCartByEmail(...).getCartId()` with no null check, and a cart row only
exists once something has been added to it. No unit test would have found this:
it needs a real account that has genuinely never had a cart.

**`BUG-21` — two concurrent adds permanently break a cart.** Found by accident,
and the accident is the point. `node --test` runs each file in its own process,
so two suites signed in as the same seeded customer added the same product at the
same instant. Both saw no existing line, both inserted one, and because there is
no unique constraint on `cart_item (cart_id, product_id)` both rows survived.
From that moment every cart request for that account answered
`500 IncorrectResultSizeDataAccessException: 2 results were returned` —
permanently, until the duplicate was deleted in SQL by hand. That is a
High-severity defect reachable by double-clicking "Add to cart".

**A fourth finding: a stale deployment.** On the first live run,
`access-control.test.js` failed because a plain customer reached
`/product-manager/api/seller/products`. The gateway policy in the repository maps
that path to `ROLE_SELLER` — but the running container had been built three days
before the commit that added the mapping. The test was right and the deployment
was old.

That last one is exactly the failure a system test exists to catch, and no lower
level could: the unit test asserts the filter enforces the policy, the
integration test asserts the shipped file declares it, and only the system test
asks whether *the thing actually running* does it.

---

## 8. Release Readiness

Against the exit criteria in
[test-plan.md](test-plan.md#12-entry-and-exit-criteria):

| # | Criterion | Status |
|---|---|---|
| 1 | All automated suites pass against a freshly built stack | ⚠️ **Nearly** — 342 of 350 green; the 8 destructive cases have never run |
| 2 | The UAT checklist walked and signed off | ❌ Not recorded |
| 3 | No open Critical defect | ❌ **Five open** — `SEC-01`, `SEC-02`, `SEC-03`, `SEC-04`, `BUG-01` |
| 4 | This report regenerated | ✅ |
| 5 | `CHANGELOG.md` updated for the release | — no version tagged yet |

**Verdict: not releasable, and the blocker is not test coverage.** Criterion 3
fails on its own: anyone can register as an administrator, user administration is
public, payment success is asserted by the browser, and the signing secret is in
the repository. The platform is a sound demonstration of the architecture and is
not fit to face the internet.

Remediation order is proposed in
[../backend/known-defects.md](../backend/known-defects.md#8-suggested-remediation-order).

---

## 9. What to Test Next

In order, by what it buys per hour spent:

1. **Run the 8 destructive cases once**, against a stack you are willing to
   throw away. They are the only automated proof that an order can actually be
   placed end to end, and they have never executed.
2. **Add the two missing unit tests** for `BUG-08` (filename without an
   extension) and `BUG-09` (null stock). Both are single-method crashes, both
   trivially reproducible.
3. **Build a concurrency harness** for `BUG-02` and `BUG-21`. Both are documented
   and neither is reproduced; `BUG-21` is reachable by a double-click and
   corrupts data permanently.
4. **Stand up a frontend component suite**, starting with checkout — the screen
   with the most branching and the least cover.
5. **Seed a volume fixture** and measure the catalogue and seller-order paths, so
   `NFR-PRF-1` stops being unverified and `BUG-17` becomes a failing test rather
   than a note.

Steps 1 and 2 together would take an afternoon and would move criterion 1 to
green.
