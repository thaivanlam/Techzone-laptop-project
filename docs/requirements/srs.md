# Software Requirements Specification

What the TechZone laptop e-commerce platform must do, and how well it must do
it. This document is the reference for *intent*; the rest of `docs/` describes
the implementation that resulted.

Related documents: [user-stories.md](user-stories.md) ·
[../architecture/system-overview.md](../architecture/system-overview.md) ·
[../backend/api-reference.md](../backend/api-reference.md) ·
[../quality/test-plan.md](../quality/test-plan.md)

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [Business Goals](#2-business-goals)
3. [Stakeholders and User Classes](#3-stakeholders-and-user-classes)
4. [Requirement Identifiers and Status](#4-requirement-identifiers-and-status)
5. [Functional Requirements](#5-functional-requirements)
6. [External Interface Requirements](#6-external-interface-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Constraints](#8-constraints)
9. [Assumptions and Dependencies](#9-assumptions-and-dependencies)
10. [Out of Scope](#10-out-of-scope)
11. [Requirements at Risk](#11-requirements-at-risk)
12. [Cross-References](#12-cross-references)

---

## 1. Purpose and Scope

**Purpose.** TechZone is an online shop specialised in laptops. It lets a
visitor browse and compare machines by technical specification, place an order
paid by card, and track that order; it lets a seller list and maintain the
machines they offer; and it lets an administrator run the catalogue, the
accounts, and the order pipeline.

**Scope of this document.** All three role-facing applications and the seven
backend services behind them, as delivered in this repository — the React SPA,
the API Gateway, Config Server, Discovery Service, and the User, Product, Order
and Notification services.

**Not in scope.** Anything listed in [§10](#10-out-of-scope), and the internal
mechanics of the third parties the platform integrates with (Stripe, Gmail SMTP).

---

## 2. Business Goals

| # | Goal | How the system serves it | Measurable signal |
|---|---|---|---|
| **BG-1** | Sell laptops online without a physical storefront | Public catalogue, cart, card checkout | Completed orders per period |
| **BG-2** | Let buyers choose on specification, not on brand alone | CPU / RAM / storage / display / GPU stored per product and exposed as search facets | Share of searches that apply at least one facet |
| **BG-3** | Support multiple sellers on one catalogue | Products carry a seller identity; sellers get a scoped admin panel | Active sellers, products per seller |
| **BG-4** | Keep the buyer informed without manual work | Welcome and order-confirmation email published asynchronously | Confirmation emails delivered per order |
| **BG-5** | Give the operator a live view of trade | Admin dashboard with revenue, orders, products, customers | Dashboard figures reconcile with the database |
| **BG-6** | Demonstrate a working microservice architecture | Seven independently deployable services, one gateway, service discovery, async messaging | Each service builds, deploys and registers on its own |

BG-6 is a goal of the project rather than of the business it models: this is a
graduation-thesis system, and the architecture is part of the deliverable. It is
recorded here because it justifies costs — a gateway, a registry, a message
broker — that a shop of this size would not otherwise carry.

---

## 3. Stakeholders and User Classes

| Class | Who they are | What they need | Role held |
|---|---|---|---|
| **Visitor** | Anyone with the URL, not signed in | Browse, search, filter, read specifications | none |
| **Customer** | A registered buyer | Cart, addresses, checkout, order history, cancellation | `ROLE_USER` |
| **Seller** | A merchant listing machines | Create and maintain their own products and specifications, see orders for them | `ROLE_SELLER` |
| **Administrator** | The platform operator | Everything a seller has, plus categories, all products, all orders, customer and seller accounts, analytics | `ROLE_ADMIN` |
| **Operator / maintainer** | Whoever runs the stack | Start, configure, monitor and recover the platform | outside the application |
| **Reviewer** | Thesis committee, code reviewer | Traceable requirements, architecture rationale, evidence of testing | outside the application |

A single account may hold several roles; the seeded `admin` account holds all
three. See
[../architecture/security-model.md](../architecture/security-model.md#role-hierarchy).

---

## 4. Requirement Identifiers and Status

Functional requirements are numbered `FR-<AREA>-<n>`, non-functional ones
`NFR-<AREA>-<n>`. An identifier is stable: a requirement that is dropped is
marked withdrawn rather than renumbered, so that test cases and user stories
keep pointing at something.

Every requirement carries a **status** describing the delivered system as
audited on 2026-08-25:

| Status | Meaning |
|---|---|
| **Done** | Implemented and behaves as specified |
| **Defect** | Implemented, but a registered defect makes it deviate — the defect id is named |
| **Partial** | Implemented for some cases or some roles only |
| **Open** | Specified here, not implemented |

Statuses naming a `BUG-` or `SEC-` id resolve in
[../backend/known-defects.md](../backend/known-defects.md).

---

## 5. Functional Requirements

### 5.1 Authentication and Accounts — `AUTH`

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-AUTH-1** | A visitor can register with a username, an email and a password. Email and username are each unique across the platform. | Must | Done |
| **FR-AUTH-2** | Passwords are stored only as BCrypt hashes; the plaintext is never persisted or logged. | Must | Done |
| **FR-AUTH-3** | A registered user can sign in and receives a signed session token in the `springBootEcom` cookie. | Must | Done |
| **FR-AUTH-4** | The session token carries the user's id, email and roles, and expires after a bounded lifetime. | Must | Defect — `BUG-03`: the cookie outlives the token by ~23 hours |
| **FR-AUTH-5** | A signed-in user can sign out, after which the browser no longer holds a usable session. | Must | Defect — `SEC-13`: the token stays valid server-side until it expires |
| **FR-AUTH-6** | A role granted at registration must be authorised — self-service signup may not confer `ROLE_ADMIN` or `ROLE_SELLER`. | Must | Open — `SEC-01`: the role is taken from the signup payload as submitted |
| **FR-AUTH-7** | The signed-in user's identity (username, id, roles) can be read back by the client for display and routing. | Should | Done |
| **FR-AUTH-8** | Registration triggers a welcome email. | Could | Done |

### 5.2 User Administration — `USR`

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-USR-1** | An administrator can list customers, paginated. | Must | Defect — `SEC-02`: the endpoint is public |
| **FR-USR-2** | An administrator can list sellers, paginated. | Must | Defect — `SEC-02` |
| **FR-USR-3** | An administrator can delete a customer account. | Should | Defect — `SEC-02` |
| **FR-USR-4** | An administrator can delete a seller account. | Should | Defect — `SEC-02` |
| **FR-USR-5** | Only an administrator may perform FR-USR-1..4. | Must | Open — no role check exists on these paths |

### 5.3 Addresses — `ADR`

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-ADR-1** | A customer can create a delivery address (street, building, city, state, country, postcode) against their own account. | Must | Done |
| **FR-ADR-2** | A customer can list the addresses belonging to them. | Must | Done |
| **FR-ADR-3** | A customer can update one of their addresses. | Must | Defect — `SEC-09`: ownership is not verified |
| **FR-ADR-4** | A customer can delete one of their addresses. | Must | Defect — `SEC-09` |
| **FR-ADR-5** | A customer can never read or modify another customer's address. | Must | Open — `SEC-09`, and `GET /api/addresses` lists every address |

### 5.4 Catalogue — `CAT` and `PRD`

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-CAT-1** | An administrator can create, rename and delete product categories. | Must | Defect — `BUG-05` on update, `BUG-13` on delete (cascades to products) |
| **FR-CAT-2** | Any visitor can list categories, paginated. | Must | Done |
| **FR-PRD-1** | A seller or administrator can add a product to a category with name, description, price, discount percentage, stock quantity and brand. | Must | Done |
| **FR-PRD-2** | The system derives the selling price from list price and discount, and stores it. | Must | Done |
| **FR-PRD-3** | Each product receives a generated SKU of the form `CATEGORY-BRAND-MODEL-RANDOM`. | Should | Done |
| **FR-PRD-4** | A product name must be unique within its category. | Should | Done |
| **FR-PRD-5** | A seller or administrator can update a product. | Must | Done |
| **FR-PRD-6** | A seller or administrator can delete a product. | Must | Done |
| **FR-PRD-7** | A seller or administrator can upload or replace a product image; a product with no upload shows a placeholder. | Must | Defect — `BUG-08`: a filename with no extension crashes the upload |
| **FR-PRD-8** | A seller may act only on products they own; an administrator may act on any product. | Must | Open — `SEC-05`: role is checked, ownership is not |
| **FR-PRD-9** | A seller sees only their own products in the management list. | Must | Done |
| **FR-PRD-10** | Product stock decreases when an order consumes it, and can never go below zero. | Must | Defect — `BUG-02` under concurrency, `BUG-01` on a partly failed order |

### 5.5 Specifications — `SPC`

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-SPC-1** | A product may carry one technical specification record: processor, RAM, storage, display, graphics. | Must | Done |
| **FR-SPC-2** | A seller or administrator can create, replace and delete a product's specification. | Must | Done |
| **FR-SPC-3** | Any visitor can read a product's specification. | Must | Done |
| **FR-SPC-4** | Specification values come from a controlled vocabulary, so they work as search facets. | Should | Partial — the editor offers dropdowns, the column accepts any string |
| **FR-SPC-5** | Deleting a product deletes its specification. | Must | Done |

### 5.6 Search and Filtering — `SRCH`

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-SRCH-1** | A visitor can search products by keyword against the product name, case-insensitively. | Must | Defect — `BUG-12`: a successful search answers `302` |
| **FR-SRCH-2** | A visitor can filter by category. | Must | Defect — `BUG-15`: an exact match written as a `LIKE` |
| **FR-SRCH-3** | A visitor can filter by price range against the selling price. | Must | Done |
| **FR-SRCH-4** | A visitor can filter by brand, processor, RAM and storage, combining several values per facet. | Must | Defect — `BUG-14`: products without a specification row are silently excluded |
| **FR-SRCH-5** | A visitor can sort results by price, ascending or descending. | Should | Done |
| **FR-SRCH-6** | Results are paginated server-side, six per page by default. | Must | Done |
| **FR-SRCH-7** | A search matching nothing is a successful, empty result — not an error. | Must | Open — `BUG-04`: it returns `400 Bad Request` |
| **FR-SRCH-8** | The full filter state is reflected in the URL, so a result page can be shared or bookmarked. | Should | Done |
| **FR-SRCH-9** | A visitor can list all brands present in the catalogue. | Should | Done |

### 5.7 Cart — `CART`

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-CART-1** | A signed-in customer has exactly one cart, keyed by their email. | Must | Done |
| **FR-CART-2** | A customer can add a product to the cart with a quantity. | Must | Done |
| **FR-CART-3** | Adding a product already in the cart increases the existing line rather than creating a second one. | Must | Done |
| **FR-CART-4** | The cart refuses a quantity exceeding the stock on hand, counting what the cart already holds. | Must | Done |
| **FR-CART-5** | A customer can increase or decrease a line's quantity; reaching zero removes the line. | Must | Done |
| **FR-CART-6** | A customer can remove a line outright. | Must | Done |
| **FR-CART-7** | A cart line records the product's name, image and price as they were when it was added. | Must | Done |
| **FR-CART-8** | The cart total equals the sum of its lines at all times. | Must | Defect — `BUG-07`: incremental updates drift from the recomputed sum |
| **FR-CART-9** | A customer can read only their own cart. | Must | Open — `SEC-07`: `GET /api/carts` returns every cart |
| **FR-CART-10** | The cart survives a page reload, and is emptied when its order is placed. | Must | Done |

### 5.8 Checkout, Orders and Payment — `ORD`, `PAY`

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-ORD-1** | A customer places an order from their cart, choosing a delivery address and a payment method. | Must | Done |
| **FR-ORD-2** | The order copies every cart line with its price snapshot, and records the order date and total. | Must | Done |
| **FR-ORD-3** | Placing an order reduces the stock of every product in it. | Must | Defect — `BUG-01`: a failure part-way leaves earlier reductions applied |
| **FR-ORD-4** | An order cannot be placed from an empty cart. | Must | Done |
| **FR-ORD-5** | A customer can list their own orders, paginated. | Must | Done |
| **FR-ORD-6** | A customer can cancel an order that has not shipped. | Should | Defect — `SEC-08` / `BUG-18`: any signed-in user can set any order to any status |
| **FR-ORD-7** | An administrator can list all orders and change an order's status. | Must | Done |
| **FR-ORD-8** | A seller can list the orders containing their products and change their status. | Must | Defect — `BUG-17`: the listing pages in memory |
| **FR-ORD-9** | Order status is drawn from a closed set: Pending, Processing, Accepted, Shipped, Delivered, Cancelled. | Must | Open — `BUG-18`: the column accepts any string |
| **FR-PAY-1** | A customer can pay by card through Stripe, using Stripe Elements in the browser. | Must | Done |
| **FR-PAY-2** | The platform creates the Stripe PaymentIntent server-side and returns only its client secret. | Must | Done |
| **FR-PAY-3** | An order is recorded as paid only on evidence from the payment provider. | Must | Open — `SEC-03`: the client asserts the outcome |
| **FR-PAY-4** | Each order records the payment method and the provider's identifiers and status. | Must | Done |

### 5.9 Notifications — `NOT`

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-NOT-1** | A confirmation email naming the order and its amount is sent after an order is placed. | Must | Done |
| **FR-NOT-2** | Email is sent out of band, so a mail failure cannot fail a purchase. | Must | Partial — publishing happens inside the order transaction (`BUG-11`) |
| **FR-NOT-3** | A message that cannot be delivered is retried or recorded, not lost. | Should | Open — `BUG-06`: the failure is swallowed |
| **FR-NOT-4** | The mail endpoint is reachable only from inside the platform. | Must | Open — `SEC-11` |

### 5.10 Analytics — `ANL`

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-ANL-1** | An administrator sees total revenue, order count, product count and customer count. | Should | Defect — `BUG-16`: revenue includes cancelled orders and is returned as a string |
| **FR-ANL-2** | An administrator sees revenue over time, order-status distribution, and best-selling products. | Could | Partial — several dashboard figures are placeholder data |
| **FR-ANL-3** | Analytics are visible to administrators only. | Must | Done |

---

## 6. External Interface Requirements

### 6.1 User interface

| Requirement | Detail |
|---|---|
| Client | A single-page application over HTTP, usable in current Chrome, Firefox, Edge and Safari |
| Layout | Responsive from a 360 px phone to a desktop viewport |
| Feedback | Every mutating action reports success or failure without a page reload |
| Routing | Deep links work on reload; unauthorised routes redirect rather than error |

### 6.2 Software interfaces

| Interface | Direction | Contract |
|---|---|---|
| **Stripe API** | outbound | PaymentIntent creation; test-mode keys throughout |
| **Gmail SMTP** | outbound | Transactional mail with an app password |
| **RabbitMQ** | internal | `notification-exchange` / `notification-routing-key`, one queue, three consumers |
| **MySQL 8** | internal | One instance, one logical database per service |
| **Eureka** | internal | Every service registers; the gateway resolves `lb://` URIs through it |
| **Config Server** | internal | Native profile; every service resolves configuration at startup |

### 6.3 Communication interface

All external traffic enters through the API Gateway on port 8080, or through the
frontend's nginx proxy on port 5173 which forwards to it. Service prefixes
(`/user-manager`, `/product-manager`, `/order-manager`) are stripped by the
gateway. See [../backend/api-reference.md](../backend/api-reference.md).

---

## 7. Non-Functional Requirements

### 7.1 Security — `NFR-SEC`

| ID | Requirement | Target | Status |
|---|---|---|---|
| **NFR-SEC-1** | Credentials are never stored in a recoverable form | BCrypt at the framework's default work factor | Done |
| **NFR-SEC-2** | Every non-public endpoint requires a valid, unexpired token | Enforced before the request reaches a service | Partial — the gateway enforces it, downstream services trust it |
| **NFR-SEC-3** | Authorisation is enforced per role **and** per owner | No user can read or write another user's data | Open — `SEC-05`, `SEC-07`, `SEC-08`, `SEC-09` |
| **NFR-SEC-4** | Secrets come from the environment, never from the repository | No key material in git | Open — `SEC-04`: the JWT secret is committed |
| **NFR-SEC-5** | The session cookie is not readable by page scripts | `httpOnly`, `Secure`, `SameSite` | Open — `SEC-13` |
| **NFR-SEC-6** | Internal service APIs are unreachable from outside the network | Not published, or authenticated | Open — `SEC-10` |
| **NFR-SEC-7** | Authentication endpoints are rate-limited | Brute force throttled at the gateway | Open |

### 7.2 Performance — `NFR-PRF`

| ID | Requirement | Target | Status |
|---|---|---|---|
| **NFR-PRF-1** | A catalogue page returns quickly for a realistic catalogue | p95 < 500 ms at 1 000 products, measured at the gateway | Unverified — the load harness and the metrics to judge it exist ([performance-testing.md](../quality/performance-testing.md)), but no full-stack run is recorded |
| **NFR-PRF-2** | Listing endpoints page in the database, never in memory | no unbounded `findAll` on a request path | Open — `BUG-17` |
| **NFR-PRF-3** | Cart and checkout make a bounded number of cross-service calls | no per-line remote call where a batched call would do | Open — N+1 calls on cart operations |
| **NFR-PRF-4** | Keyword search does not fire a request per keystroke | debounce ≥ 500 ms | Done — 700 ms |

### 7.3 Reliability and Availability — `NFR-REL`

| ID | Requirement | Target | Status |
|---|---|---|---|
| **NFR-REL-1** | A briefly unavailable dependency degrades a feature rather than failing unrelated requests | circuit breaker with fallback | Open — no circuit breaker |
| **NFR-REL-2** | An order is either fully placed or fully rejected — never half-applied | atomic across stock, order and payment | Open — `BUG-01` |
| **NFR-REL-3** | Services start in dependency order and serve traffic only when ready | Compose health checks gate dependants | Done |
| **NFR-REL-4** | A message accepted by the broker is eventually delivered or recorded as failed | ack, retry, dead-letter | Open — `BUG-06` |

### 7.4 Scalability — `NFR-SCL`

| ID | Requirement | Target | Status |
|---|---|---|---|
| **NFR-SCL-1** | Any business service can run as several instances behind the gateway | no in-process session state | Done — identity travels in the token |
| **NFR-SCL-2** | Concurrent checkouts cannot oversell stock | database-level guard | Open — `BUG-02` |
| **NFR-SCL-3** | The registry and the gateway are not single points of failure | peer-replicated Eureka, two or more gateways | Open — one instance of each |

### 7.5 Maintainability — `NFR-MNT`

| ID | Requirement | Target | Status |
|---|---|---|---|
| **NFR-MNT-1** | Each service is independently buildable and deployable | own Maven module and image | Done |
| **NFR-MNT-2** | Layering is uniform across services | `controller → service → repository → model`, DTOs in `payload` | Done |
| **NFR-MNT-3** | Every code change lands with the documentation change it implies | the workflow in `CLAUDE.md` | Done |
| **NFR-MNT-4** | Business logic is covered by automated tests | unit tests on services, contract tests on controllers | Partial — see [../quality/test-report.md](../quality/test-report.md) |
| **NFR-MNT-5** | Platform decisions are recorded with their trade-offs | one ADR per decision | Done |

### 7.6 Usability — `NFR-USE`

| ID | Requirement | Target | Status |
|---|---|---|---|
| **NFR-USE-1** | A first-time buyer reaches a placed order without instruction | six screens or fewer | Done |
| **NFR-USE-2** | Every failure is reported in words the user can act on | no raw stack traces or status codes in the UI | Partial — some backend failures surface as generic messages |
| **NFR-USE-3** | Destructive actions are confirmed before taking effect | modal confirmation | Done |
| **NFR-USE-4** | The interface is in English throughout | — | Partial — some UI strings and code comments are in Vietnamese |

### 7.7 Portability and Operability — `NFR-OPS`

| ID | Requirement | Target | Status |
|---|---|---|---|
| **NFR-OPS-1** | The whole platform starts with one command on a clean machine | `docker compose up` | Done |
| **NFR-OPS-2** | No environment-specific value is compiled into a service | configuration from the environment or Config Server | Partial — frontend values are inlined by Vite at build time |
| **NFR-OPS-3** | Every service exposes a health endpoint the orchestrator uses | Actuator health | Done |
| **NFR-OPS-4** | A request can be followed across services from the logs | correlation id | Open — no distributed tracing |
| **NFR-OPS-5** | Latency, throughput and error rate are measurable per service and per endpoint, without changing application code | Micrometer → Prometheus, dashboards in Grafana | Done — the `observability` Compose profile, see [../operations/observability.md](../operations/observability.md) |

---

## 8. Constraints

| # | Constraint | Consequence |
|---|---|---|
| **C-1** | Java 21, Spring Boot 3.5, Spring Cloud 2025 | Fixed by the platform; notification-service still builds on JDK 17 |
| **C-2** | React 19, Vite 7, Node ≥ 20.19 | Build-time inlining of `VITE_*` values is unavoidable |
| **C-3** | One MySQL instance, one logical database per service | Cross-service joins are impossible by construction — [ADR-0008](../architecture/decisions/0008-single-mysql-multiple-databases.md) |
| **C-4** | Payments in Stripe **test mode** only | No real money moves; no PCI scope |
| **C-5** | Email through a single Gmail account with an app password | Subject to Gmail sending limits |
| **C-6** | Configuration served from the classpath (`native` profile) | A configuration change needs a rebuild — [ADR-0006](../architecture/decisions/0006-config-server-native-profile.md) |
| **C-7** | Deployment target is Docker Compose on one host | No orchestration, no horizontal scaling in practice |
| **C-8** | Delivered as a graduation thesis by a single developer | Depth is traded for breadth; the defect register is the honest record of that trade |

---

## 9. Assumptions and Dependencies

1. Buyers reach the platform in a browser that keeps cookies for the origin.
2. The operator supplies `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY` and
   `MAIL_PASSWORD`; without them checkout and email do not function.
3. Stripe and Gmail are reachable from the host running the stack.
4. Prices and totals are in one currency; no conversion is performed.
5. Stock figures entered by a seller are accurate — the platform has no goods-in
   process to reconcile them against.
6. Delivery is arranged outside the platform: an address is captured, not
   validated and not priced.

---

## 10. Out of Scope

Explicitly not required, and not built: product reviews and ratings; wishlists;
discount codes and campaigns; refunds and returns; invoices and tax documents;
multi-currency and localisation; shipping-carrier integration and tracking
numbers; stock reservation with a hold window; seller payouts and commission;
password reset and email verification; two-factor authentication;
recommendations; a mobile application; data export and erasure workflows.

Several of these — password reset in particular — are ordinary expectations of a
shop. Their absence is a scope decision, not an oversight.

---

## 11. Requirements at Risk

The requirements below are specified as **Must** and are currently **Open**.
They are the gap between what this document demands and what the system does;
each has a register entry with a proposed fix.

| Requirement | Blocking defect | Effect if not closed |
|---|---|---|
| FR-AUTH-6 — elevated roles must be authorised | `SEC-01` | Anyone can become an administrator |
| FR-USR-5 — user administration is admin-only | `SEC-02` | Anyone can enumerate and delete accounts |
| FR-PAY-3 — payment confirmed by the provider | `SEC-03` | Goods can be ordered without paying |
| FR-ADR-5, FR-CART-9 — data belongs to its owner | `SEC-07`, `SEC-09` | Cross-customer data exposure |
| FR-PRD-8 — sellers act on their own products | `SEC-05` | One seller can delete another's catalogue |
| FR-ORD-9 — closed status set | `BUG-18` | Order state becomes meaningless |
| FR-SRCH-7 — an empty result is not an error | `BUG-04` | A normal search reads as a failure |
| NFR-SEC-4 — no committed secrets | `SEC-04` | Tokens can be forged by anyone with the repository |

Remediation order is proposed in
[../backend/known-defects.md](../backend/known-defects.md#8-suggested-remediation-order).

---

## 12. Cross-References

| Question | Document |
|---|---|
| Who wants each requirement, and why | [user-stories.md](user-stories.md) |
| How a requirement is verified | [../quality/test-cases.md](../quality/test-cases.md) |
| Which requirements are verified today | [../quality/test-report.md](../quality/test-report.md) |
| What the defect ids mean | [../backend/known-defects.md](../backend/known-defects.md) |
| How the system realises these requirements | [../architecture/system-overview.md](../architecture/system-overview.md) |
| Why a technical choice was made | [../architecture/decisions/](../architecture/decisions/) |
