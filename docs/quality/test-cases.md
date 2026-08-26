# Test Cases

The catalogue of what is checked, case by case. Each case names the requirement
it verifies, the level it runs at, and whether it is automated today.

Strategy and how to run the suites: [test-plan.md](test-plan.md). Results:
[test-report.md](test-report.md). Requirements:
[../requirements/srs.md](../requirements/srs.md).

---

## Table of Contents

1. [How to Read a Case](#1-how-to-read-a-case)
2. [Authentication, Accounts and Addresses](#2-authentication-accounts-and-addresses)
3. [Catalogue and Specifications](#3-catalogue-and-specifications)
4. [Search and Filtering](#4-search-and-filtering)
5. [Cart](#5-cart)
6. [Checkout, Orders and Payment](#6-checkout-orders-and-payment)
7. [Notifications, Analytics and Operations](#7-notifications-analytics-and-operations)
8. [Manual-Only Cases](#8-manual-only-cases)
9. [Coverage Summary](#9-coverage-summary)

---

## 1. How to Read a Case

| Column | Meaning |
|---|---|
| **ID** | `TC-<AREA>-<n>`. Stable — referenced from [../requirements/user-stories.md](../requirements/user-stories.md#8-traceability-matrix) |
| **Verifies** | The requirement from [srs.md](../requirements/srs.md) |
| **Precondition → Steps** | What must be true, then what to do |
| **Expected** | The pass condition. Where this differs from what the system does today, the defect is named |
| **Level** | `U` unit · `IH` integration-HTTP · `IP` integration-persistence · `IX` integration-cross-service · `S` system · `A` acceptance · `M` manual |
| **Auto** | ✅ automated · ⚠️ automated as a **characterisation** test of known-wrong behaviour · ❌ not automated |

A ⚠️ row is covered, but the assertion pins behaviour that is *wrong*. Fixing
the defect must flip that row to ✅ in the same change set — the rule is in
[test-plan.md](test-plan.md#14-characterisation-tests).

---

## 2. Authentication, Accounts and Addresses

### Authentication — `TC-AUTH`

| ID | Verifies | Precondition → Steps | Expected | Level | Auto |
|---|---|---|---|---|---|
| **TC-AUTH-01** | FR-AUTH-1 | No account with this email → `POST /api/auth/signup` with a fresh username, email, password | `200`, account created, one `user_role` row for the requested role | IH, A | ✅ |
| **TC-AUTH-02** | FR-AUTH-1 | An account already holds the username → sign up again with it | `400`, message names the username, no second row | IH | ✅ |
| **TC-AUTH-03** | FR-AUTH-1 | An account already holds the email → sign up again with it | `400`, message names the email | IH | ✅ |
| **TC-AUTH-04** | FR-AUTH-2 | Register, then read the row → `SELECT password FROM user` | A BCrypt hash (`$2a$…`), never the plaintext, and the plaintext appears in no log | IP | ✅ |
| **TC-AUTH-05** | FR-AUTH-3 | A seeded account → `POST /api/auth/signin` with correct credentials | `200`, body carries id, username and roles; `Set-Cookie: springBootEcom` present | IH, S | ✅ |
| **TC-AUTH-06** | FR-AUTH-3 | → sign in with a wrong password | `401`, no cookie set | IH, S | ✅ |
| **TC-AUTH-07** | FR-AUTH-4 | Sign in → decode the token | Claims `sub`, `userId`, `email`, `roles`; `exp` ≈ 50 minutes ahead | U | ✅ |
| **TC-AUTH-08** | FR-AUTH-5 | Signed in → `POST /api/auth/signout` → call a protected path with the old cookie | *Specified:* the old token is rejected. *Actual:* the cookie is cleared but the token still validates until expiry — `SEC-13` | S | ⚠️ |
| **TC-AUTH-09** | FR-AUTH-4 | Take a token, alter one byte of its signature → call any protected path | `401`, and the validator returns false rather than throwing — `BUG-19` in product-service | U | ⚠️ |
| **TC-AUTH-10** | FR-AUTH-4 | An expired token → any protected path | `401` | U, S | ✅ |
| **TC-AUTH-11** | FR-AUTH-6 | → sign up with `roles: ["admin"]` | *Specified:* refused or downgraded to `ROLE_USER`. *Actual:* `ROLE_ADMIN` granted — `SEC-01` | IH, S | ⚠️ |
| **TC-AUTH-12** | FR-AUTH-7 | Signed in → `GET /api/auth/user` | `200` with the caller's id, username and roles | IH, S | ✅ |

### User administration — `TC-USR`

| ID | Verifies | Precondition → Steps | Expected | Level | Auto |
|---|---|---|---|---|---|
| **TC-USR-01** | FR-USR-1, FR-USR-2 | Signed in as admin → `GET /api/auth/customers?pageNumber=0`, then `/sellers` | `200`, paginated, customers and sellers separated by role | S | ✅ |
| **TC-USR-02** | FR-USR-3, FR-USR-4 | Admin, a disposable account exists → `DELETE /api/auth/customers/{id}` | `200`, the account no longer signs in | S | ❌ — destructive, gated behind `RUN_DESTRUCTIVE` |
| **TC-USR-03** | FR-USR-5 | **Anonymous**, no cookie at all → `GET /api/auth/customers` | *Specified:* `401`. *Actual:* `200` with the full list — `SEC-02` | S | ⚠️ |

### Addresses — `TC-ADR`

| ID | Verifies | Precondition → Steps | Expected | Level | Auto |
|---|---|---|---|---|---|
| **TC-ADR-01** | FR-ADR-1 | Signed-in customer → `POST /api/addresses` with all six fields | `201`, the address is linked to the caller's `user_id` | IH, A | ✅ |
| **TC-ADR-02** | FR-ADR-1 | → `POST` with a 2-character city | `400`, the validation message names the field | IH | ✅ |
| **TC-ADR-03** | FR-ADR-2 | Customer has two addresses → `GET /api/users/addresses` | `200`, exactly their own two | IH, A | ✅ |
| **TC-ADR-04** | FR-ADR-5 | Customer A signed in, address belongs to B → `PUT /api/addresses/{B's id}` | *Specified:* `403`. *Actual:* `200`, B's address is rewritten — `SEC-09` | S | ⚠️ |

---

## 3. Catalogue and Specifications

### Categories — `TC-CAT`

| ID | Verifies | Precondition → Steps | Expected | Level | Auto |
|---|---|---|---|---|---|
| **TC-CAT-01** | FR-CAT-1 | Admin → `POST /api/admin/categories` with a 6-character name | `201`, the category is listed publicly | IH | ✅ |
| **TC-CAT-02** | FR-CAT-1 | Admin → `POST` with a 3-character name | `400` | IH | ✅ |
| **TC-CAT-03** | FR-CAT-2 | Categories exist → `GET /api/public/categories` anonymously | `200`, paginated | S | ✅ |
| **TC-CAT-04** | FR-CAT-1 | A category holding products → `DELETE /api/admin/categories/{id}` | *Specified:* the category goes, the products are re-homed or the delete is refused. *Actual:* every product in it is deleted — `BUG-13` | IP | ⚠️ |

### Products — `TC-PRD`

| ID | Verifies | Precondition → Steps | Expected | Level | Auto |
|---|---|---|---|---|---|
| **TC-PRD-01** | FR-PRD-1 | Seller signed in, category exists → `POST /api/seller/categories/{id}/product` | `201`; `seller_email` is the caller's | U, IH | ✅ |
| **TC-PRD-02** | FR-PRD-2 | → create with price 1000, discount 10 | `special_price` is 900, stored not derived | U | ✅ |
| **TC-PRD-03** | FR-PRD-2 | → create with discount 0 | `special_price` equals `price` | U | ✅ |
| **TC-PRD-04** | FR-PRD-3 | → create "Dell XPS 13" as brand Dell in Ultrabooks | SKU matches `ULT-DELL-XPS-######` | U | ✅ |
| **TC-PRD-05** | FR-PRD-3 | → create with an empty category name and a 1-character model word | SKU segments fall back to `XXX`; the four-segment shape holds | U | ✅ |
| **TC-PRD-06** | FR-PRD-4 | A product named "Aurora 15" exists in the category → create "aurora 15" | `400`, refused case-insensitively | U | ✅ |
| **TC-PRD-07** | FR-PRD-5 | → `PUT /api/seller/products/{id}` changing price and discount | `special_price` recalculated; SKU regenerated only if name or brand changed | U | ✅ |
| **TC-PRD-08** | FR-PRD-7 | → `PUT .../image` with a PNG | `200`, the response carries an absolute image URL built from `IMAGE_BASE_URL` | U, IH | ✅ |
| **TC-PRD-09** | FR-PRD-7 | → upload a file named `laptop` with no extension | *Specified:* `400` naming the problem. *Actual:* an unhandled exception — `BUG-08` | U | ❌ |
| **TC-PRD-10** | FR-PRD-9 | Two sellers each own products → seller A calls `GET /api/seller/products` | `200`, only A's products | IP, S | ✅ |
| **TC-PRD-11** | FR-PRD-8 | Seller A signed in, product belongs to B → `DELETE /api/seller/products/{B's id}` | *Specified:* `403`. *Actual:* deleted — `SEC-05` | S | ⚠️ |
| **TC-PRD-12** | FR-PRD-8 | **Customer** signed in → `POST /api/seller/categories/{id}/product` | `403` at the gateway — closed on 2026-08-25 | S | ✅ |
| **TC-PRD-13** | FR-PRD-10 | Product with `quantity` null → add to cart | *Specified:* treated as out of stock. *Actual:* `NullPointerException` — `BUG-09` | U | ❌ |

### Specifications — `TC-SPC`

| ID | Verifies | Precondition → Steps | Expected | Level | Auto |
|---|---|---|---|---|---|
| **TC-SPC-01** | FR-SPC-2 | Seller, own product → `POST /api/seller/products/{id}/specifications` with all five fields | `201`, one row, `product_id` unique | IH | ✅ |
| **TC-SPC-02** | FR-SPC-2 | A specification exists → post again with new values | The existing row is updated, not duplicated | IH | ✅ |
| **TC-SPC-03** | FR-SPC-3 | → `GET /api/public/products/{id}/specifications` anonymously | `200` with the five fields | S | ✅ |
| **TC-SPC-04** | FR-SPC-5 | Product with a specification → delete the product | The specification row goes too (`orphanRemoval`) | IP | ✅ |
| **TC-SPC-05** | FR-SPC-2 | **Customer** signed in → `POST /api/seller/products/{id}/specifications` | `403` — the path moved under the gateway's scheme on 2026-08-25, closing `SEC-06` | S | ✅ |

---

## 4. Search and Filtering — `TC-SRCH`

| ID | Verifies | Precondition → Steps | Expected | Level | Auto |
|---|---|---|---|---|---|
| **TC-SRCH-01** | FR-SRCH-1 | Catalogue holds "Legion 5" → `GET /api/public/products/keyword/legion` | Matches case-insensitively. *Actual status:* `302 FOUND` on success — `BUG-12` | IH, IP | ⚠️ |
| **TC-SRCH-02** | FR-SRCH-2 | Products in two categories → filter `category=Ultrabooks` | Only that category's products | IP | ✅ |
| **TC-SRCH-03** | FR-SRCH-2 | → filter `category=Ultra` (a prefix) | *Specified:* either a prefix match or no match, consistently. *Actual:* no match — the `LIKE` carries no wildcards — `BUG-15` | IP | ⚠️ |
| **TC-SRCH-04** | FR-SRCH-3 | Products priced 500–2500 → filter `minPrice=800&maxPrice=1500` | Every result's `special_price` is inside the range | IP | ✅ |
| **TC-SRCH-05** | FR-SRCH-4 | → filter `brands=Dell,HP` | Only those brands; the predicate is an `IN`, not repeated `OR` scans | IP, S | ✅ |
| **TC-SRCH-06** | FR-SRCH-4 | A product has **no** specification row → filter `ram=16GB DDR5` | *Specified:* it is absent because its RAM differs. *Actual:* it is absent because the join drops it — indistinguishable to the caller — `BUG-14` | IP | ⚠️ |
| **TC-SRCH-07** | FR-SRCH-5 | → `sortBy=price&sortOrder=desc` | Results ordered by selling price, descending | IH, S | ✅ |
| **TC-SRCH-08** | FR-SRCH-6 | 8 products, no paging params → `GET /api/public/products` | Page 0, 6 items, `totalPages` 2, `lastPage` false; page 1 reports `lastPage` true | IH, IP | ✅ |
| **TC-SRCH-09** | FR-SRCH-7 | → search a keyword that matches nothing | *Specified:* `200` with an empty page. *Actual:* `400` — `BUG-04` | IH | ⚠️ |
| **TC-SRCH-10** | FR-SRCH-9 | Products of three brands, one with `brand` null → `GET /api/public/products/brands` | Sorted, distinct, the null skipped | IP | ✅ |
| **TC-SRCH-11** | FR-SRCH-8 | Apply three filters in the SPA → copy the URL into a new tab | The same filtered result renders | M | ❌ |

---

## 5. Cart — `TC-CART`

| ID | Verifies | Precondition → Steps | Expected | Level | Auto |
|---|---|---|---|---|---|
| **TC-CART-01** | FR-CART-1, FR-CART-2 | Customer with no cart → `POST /api/carts/products/{id}/quantity/2` | `201`; a cart is created for the caller's email and holds one line of 2 at the discounted price | U, IH | ✅ |
| **TC-CART-02** | FR-CART-3 | The product is already in the cart at 2 → add 3 more | One line of 5, not two lines | U | ✅ |
| **TC-CART-03** | FR-CART-4 | Product stock is 0 → add 1 | `400`, the message says the product is out of stock | U, IH | ✅ |
| **TC-CART-04** | FR-CART-4 | Product stock is 5 → add 6 | `400`, the message names the available quantity | U, IH | ✅ |
| **TC-CART-05** | FR-CART-4 | Stock 5, cart already holds 3 → add 3 | `400` — what is already in the cart counts against stock | U | ✅ |
| **TC-CART-06** | FR-CART-4 | Stock 5, cart empty → add exactly 5 | `201`, accepted | U | ✅ |
| **TC-CART-07** | FR-CART-5 | A line of 2 → `PUT .../quantity/increase` | Line becomes 3, cart total rises by one unit price | U, IH | ✅ |
| **TC-CART-08** | FR-CART-5 | A line of 2 → `PUT .../quantity/delete` | Line becomes 1, total falls | U, IH | ✅ |
| **TC-CART-09** | FR-CART-5 | A line of 1 → decrement | The line is removed entirely | U | ✅ |
| **TC-CART-10** | FR-CART-6 | A cart with two lines → `DELETE /api/carts/{cartId}/product/{productId}` | `200`, one line left, total recomputed | IH | ✅ |
| **TC-CART-11** | FR-CART-7 | Add a product, then change its catalogue price → read the cart | The line keeps the price it was added at | U | ✅ |
| **TC-CART-12** | FR-CART-8 | Add three lines, adjust two, then reload the cart | The stored total equals the sum of the lines. *Actual:* the two paths can disagree — `BUG-07` | U | ⚠️ |
| **TC-CART-13** | FR-CART-9 | Customer A signed in → `GET /api/carts` | *Specified:* `403`, or only A's cart. *Actual:* `200` with every user's cart, and status `302` — `SEC-07`, `BUG-12` | IH, S | ⚠️ |
| **TC-CART-14** | FR-CART-2 | Product id that does not exist → add to cart | `404` from order-service, not a raw `RestTemplate` error — *actual:* propagates untyped, `BUG-10` | U, IX | ⚠️ |
| **TC-CART-15** | FR-CART-10 | Anonymous → `GET /api/carts/users/cart` | `401` at the gateway | S | ✅ |

---

## 6. Checkout, Orders and Payment

### Orders — `TC-ORD`

| ID | Verifies | Precondition → Steps | Expected | Level | Auto |
|---|---|---|---|---|---|
| **TC-ORD-01** | FR-ORD-1, FR-ORD-2 | A cart with two lines → `POST /api/order/users/payments/stripe` | `200`; one order dated today, total equal to the cart total, status `Accepted` | U, A | ✅ |
| **TC-ORD-02** | FR-ORD-2 | → after placing | Every cart line is copied to an `order_item` with its snapshot and unit price | U | ✅ |
| **TC-ORD-03** | FR-ORD-3 | Cart holds 2 of a product with stock 10 → place the order | Product stock is 8; one reduce-stock call per line | U, IX | ✅ |
| **TC-ORD-04** | FR-ORD-1 | → after placing | The cart is emptied line by line | U | ✅ |
| **TC-ORD-05** | FR-ORD-4 | An empty cart → place an order | `400`, the message says the cart is empty | U | ✅ |
| **TC-ORD-06** | FR-ORD-4 | A buyer with no cart at all → place an order | `404`/`400`, no order written | U | ✅ |
| **TC-ORD-07** | FR-ORD-3 | A two-line cart where the second reduce-stock call fails → place the order | *Specified:* neither line's stock moves. *Actual:* the first line's stock stays taken — `BUG-01` | U | ⚠️ |
| **TC-ORD-08** | FR-ORD-5 | A customer with three orders → `GET /api/order/users/orders` | `200`, their own orders only, paginated | S, A | ✅ |
| **TC-ORD-09** | FR-ORD-7 | Admin → `GET /api/admin/orders`, then `PUT .../orders/{id}/status` with `Shipped` | `200`; the stored status is `Shipped` | U, S | ✅ |
| **TC-ORD-10** | FR-ORD-9 | Admin → set status to `banana` | *Specified:* `400`. *Actual:* stored verbatim — `BUG-18` | U | ⚠️ |
| **TC-ORD-11** | FR-ORD-6 | Customer A signed in, order belongs to B → `PUT /api/order/users/orders/{B's id}/status` | *Specified:* `403`. *Actual:* B's order is changed — `SEC-08` | S | ⚠️ |
| **TC-ORD-12** | FR-ORD-8 | Orders exist across two sellers → seller A calls `GET /api/seller/orders` | `200`, orders containing A's products only | S | ✅ |
| **TC-ORD-13** | FR-ORD-8 | → the same call with 200 orders in the database | *Specified:* one page fetched from the database. *Actual:* all orders loaded then filtered — `BUG-17` | — | ❌ — needs a volume fixture |
| **TC-ORD-14** | FR-ORD-3, NFR-SCL-2 | Two buyers check out the last unit simultaneously | *Specified:* one succeeds, one is refused. *Actual:* both succeed, stock goes negative — `BUG-02` | — | ❌ — no concurrency test yet |

### Payment — `TC-PAY`

| ID | Verifies | Precondition → Steps | Expected | Level | Auto |
|---|---|---|---|---|---|
| **TC-PAY-01** | FR-PAY-2 | A cart with a total → `POST /api/order/stripe-client-secret` | `200` with a `clientSecret`; the secret key never leaves the server | IH | ✅ |
| **TC-PAY-02** | FR-PAY-4 | Place an order with Stripe details in the payload | A `payment` row carries method, `pg_payment_id`, `pg_status`, `pg_name` | U | ✅ |
| **TC-PAY-03** | FR-PAY-1 | In the browser, pay with Stripe test card `4242 4242 4242 4242` | Payment succeeds; the confirmation page places the order | M | ❌ |
| **TC-PAY-04** | FR-PAY-3 | Craft a place-order call claiming `pgStatus: "succeeded"` without paying | *Specified:* rejected — the server verifies with Stripe. *Actual:* the order is created — `SEC-03` | S | ⚠️ — gated behind `RUN_DESTRUCTIVE` |
| **TC-PAY-05** | FR-PAY-1 | In the browser, pay with the declining test card `4000 0000 0000 0002` | The error is shown, no order is created, the cart survives | M | ❌ |

---

## 7. Notifications, Analytics and Operations

### Notifications — `TC-NOT`

| ID | Verifies | Precondition → Steps | Expected | Level | Auto |
|---|---|---|---|---|---|
| **TC-NOT-01** | FR-NOT-1 | Place an order → inspect the broker | One message on `notification-exchange` with the routing key, naming the order id and amount | U | ✅ |
| **TC-NOT-02** | FR-NOT-1 | The consumer receives that message | An email is composed to the buyer's address with the order id in the subject or body | U | ✅ |
| **TC-NOT-03** | FR-NOT-3 | SMTP refuses the send | *Specified:* retried or recorded. *Actual:* the exception is swallowed and the message is lost — `BUG-06` | U | ⚠️ |
| **TC-NOT-04** | FR-NOT-4 | From outside the Docker network → `POST :8084/api/v1/notifications/sendMail` | *Specified:* unreachable or `401`. *Actual:* arbitrary mail is sent — `SEC-11` | M | ❌ |

### Analytics — `TC-ANL`

| ID | Verifies | Precondition → Steps | Expected | Level | Auto |
|---|---|---|---|---|---|
| **TC-ANL-01** | FR-ANL-3 | Customer signed in → `GET /api/admin/app/analytics` | `403` at the gateway | S | ✅ |
| **TC-ANL-02** | FR-ANL-1 | Orders exist, one cancelled → read the analytics | *Specified:* revenue excludes the cancelled order and is a number. *Actual:* included, and returned as a string — `BUG-16` | S | ⚠️ |

### Gateway and operations — `TC-OPS`

| ID | Verifies | Precondition → Steps | Expected | Level | Auto |
|---|---|---|---|---|---|
| **TC-OPS-01** | §6.3 | → `GET /product-manager/api/public/products` | Routed to product-service with the prefix stripped; the same path without the prefix on `:8081` answers identically | S | ✅ |
| **TC-OPS-02** | NFR-SEC-2 | → any non-public path with no cookie | `401` as a JSON envelope, not an HTML error page | S | ✅ |
| **TC-OPS-03** | NFR-OPS-1, NFR-REL-3 | A clean machine → fill `.env`, `docker compose up` | The shop answers on 5173; no service starts before its dependencies are healthy | M | ❌ |
| **TC-OPS-04** | NFR-OPS-3 | Stack running → each service's Actuator health endpoint | `UP`; every service appears in the Eureka dashboard | M | ❌ |
| **TC-OPS-05** | §6.3 | An unknown prefix → `GET /nonsense-manager/api/x` | `404`, and no service is contacted | S | ✅ |

---

## 8. Manual-Only Cases

These need a browser, a card form, or a mailbox. Walk them once before a
release — that is exit criterion 2 in
[test-plan.md](test-plan.md#12-entry-and-exit-criteria).

For a full guided walkthrough with a sign-off block, use
[uat-checklist.md](uat-checklist.md); the cases below are the same ground stated
as numbered cases so they can be referenced from the traceability matrix.

| # | Case | Steps | Pass condition |
|---|---|---|---|
| **M-01** | First-time purchase, end to end | Register → browse → filter → add to cart → check out with test card `4242…` → confirmation | Order appears under *My Orders*; a confirmation email arrives |
| **M-02** | Declined card | Check out with `4000 0000 0000 0002` | The failure is explained, the cart is intact, no order exists |
| **M-03** | Filter state in the URL | Apply brand + RAM + price, copy the URL, open in a new tab | The same result set renders (TC-SRCH-11) |
| **M-04** | Role-based landing | Sign in as `user1`, `seller1`, `admin` in turn | Customer lands on the shop; seller and admin land in the panel, seller seeing only Products and Orders |
| **M-05** | Seller product lifecycle | As `seller1`: create a product, upload an image, add specifications, edit, delete | Each step succeeds; the product appears in the public catalogue with its image and specs |
| **M-06** | Seeded-catalogue id check | After running the `seed` profile, create a product through the UI as `seller1` | The save succeeds — proves `product_seq` was raised. See [../operations/database-seeding.md](../operations/database-seeding.md) |
| **M-07** | Session expiry | Sign in, wait past the token lifetime, click anything | The failure is comprehensible and recoverable by signing in again (today it is a bare `401` — `BUG-03`) |
| **M-08** | Order fulfilment | As admin, move an order Pending → Processing → Shipped → Delivered | Each change persists and is visible to the customer |
| **M-09** | Responsive layout | Open the shop at 360 px, 768 px and 1440 px | No horizontal scrolling; navigation and cart usable at every width |
| **M-10** | Empty states | Fresh stack, no catalogue → open the shop; empty cart → open the cart | Both explain what to do next rather than showing an error (today the empty catalogue trips `BUG-04`) |

---

## 9. Coverage Summary

| Area | Cases | Automated ✅ | Characterisation ⚠️ | Not automated ❌ |
|---|---|---|---|---|
| Authentication | 12 | 8 | 3 | 1 |
| User administration | 3 | 1 | 1 | 1 |
| Addresses | 4 | 3 | 1 | 0 |
| Categories | 4 | 3 | 1 | 0 |
| Products | 13 | 9 | 1 | 3 |
| Specifications | 5 | 5 | 0 | 0 |
| Search | 11 | 6 | 4 | 1 |
| Cart | 15 | 11 | 3 | 1 |
| Orders | 14 | 8 | 4 | 2 |
| Payment | 5 | 2 | 1 | 2 |
| Notifications | 4 | 2 | 1 | 1 |
| Analytics | 2 | 1 | 1 | 0 |
| Gateway / operations | 5 | 3 | 0 | 2 |
| **Total** | **97** | **62** | **21** | **14** |

Twenty-one cases assert behaviour that is *wrong on purpose*. That number is the
honest measure of how far the delivered system sits from
[srs.md](../requirements/srs.md), and it should fall to zero as the register
closes. The fourteen unautomated cases are the browser journeys, the two volume
and concurrency cases, and the three defects whose reproduction would need a
fixture that does not exist yet.

What the run of these cases actually produced is in
[test-report.md](test-report.md).
