# User Stories

The requirements of [srs.md](srs.md) restated from the point of view of the
person who wants them, with the acceptance criteria that decide whether a story
is finished.

A story is written as **US-\<ROLE\>-\<n\>**, where the role is `VIS` (visitor),
`CUS` (customer), `SEL` (seller), `ADM` (administrator) or `OPS` (operator).
Each story names the functional requirements it realises, so a change to a story
can be traced to the specification and on to its tests.

Related documents: [srs.md](srs.md) ·
[../quality/test-cases.md](../quality/test-cases.md) ·
[../user-guide/customer-guide.md](../user-guide/customer-guide.md)

---

## Table of Contents

1. [How to Read a Story](#1-how-to-read-a-story)
2. [Visitor](#2-visitor)
3. [Customer](#3-customer)
4. [Seller](#4-seller)
5. [Administrator](#5-administrator)
6. [Operator](#6-operator)
7. [Epics and Their Stories](#7-epics-and-their-stories)
8. [Traceability Matrix](#8-traceability-matrix)

---

## 1. How to Read a Story

```markdown
### US-CUS-4 — Short title

**As a** customer **I want** … **so that** …

**Realises:** FR-CART-2, FR-CART-4
**Acceptance criteria**
1. Given … when … then …
2. …
**Notes.** Anything about the delivered behaviour that departs from the story.
```

The **Notes** line is where the delivered system is held to account. A story
with a note naming a defect id is *not* considered done, whatever the code does.

---

## 2. Visitor

### US-VIS-1 — Browse the catalogue without an account

**As a** visitor **I want** to see what laptops are for sale without signing up
**so that** I can decide whether the shop is worth registering with.

**Realises:** FR-SRCH-6, FR-CAT-2

**Acceptance criteria**
1. Given I have never signed in, when I open the home page, then I see products
   and can page through them.
2. Given I am on the product list, when I open a product, then I see its price,
   image, description and stock availability.
3. Given I am not signed in, when I try to open the cart page or the checkout,
   then I am sent to the login screen.

### US-VIS-2 — Find a laptop by what is inside it

**As a** visitor **I want** to narrow the list by processor, RAM, storage and
brand **so that** I can compare only machines that meet my needs.

**Realises:** FR-SRCH-2, FR-SRCH-3, FR-SRCH-4, FR-SRCH-5, FR-SRCH-9

**Acceptance criteria**
1. Given the catalogue has products of several brands, when I tick two brands,
   then the result contains products of those brands only.
2. Given I set a minimum and maximum price, then every result's selling price
   falls inside the range.
3. Given I combine a brand facet with a RAM facet, then both apply together.
4. Given I sort by price ascending, then results are ordered by selling price.

**Notes.** A product that has no specification row is silently dropped from any
processor / RAM / storage facet (`BUG-14`), so the counts can look wrong to a
visitor who knows the catalogue.

### US-VIS-3 — Search by name

**As a** visitor **I want** to type a model name **so that** I can go straight to
the machine I already have in mind.

**Realises:** FR-SRCH-1, FR-SRCH-7

**Acceptance criteria**
1. Given I type a partial name, when I stop typing, then matching products
   appear without my pressing a button.
2. Given my search matches nothing, then I see an empty-result message, not an
   error.

**Notes.** Criterion 2 fails today — an empty result is returned as
`400 Bad Request` (`BUG-04`), and the UI reports it as a failure.

### US-VIS-4 — Share a filtered result

**As a** visitor **I want** the address bar to reflect my filters **so that** I
can send someone the exact list I am looking at.

**Realises:** FR-SRCH-8

**Acceptance criteria**
1. Given I apply filters, then the URL carries them as query parameters.
2. Given I open that URL in a new tab, then I see the same filtered page.

### US-VIS-5 — Register

**As a** visitor **I want** to create an account **so that** I can buy.

**Realises:** FR-AUTH-1, FR-AUTH-2, FR-AUTH-8

**Acceptance criteria**
1. Given a username and email nobody else uses, when I submit a password, then
   my account is created and I can sign in.
2. Given an email that already exists, then registration is refused with a
   message saying so.
3. Given registration succeeded, then a welcome email is sent to that address.

**Notes.** The registration form also offers *Seller* and *Admin*, and the
backend grants whichever is submitted (`SEC-01`). A visitor should not be able to
grant themselves either — see FR-AUTH-6.

---

## 3. Customer

### US-CUS-1 — Sign in and stay signed in

**As a** customer **I want** to sign in once **so that** I am not asked again on
every page.

**Realises:** FR-AUTH-3, FR-AUTH-4, FR-AUTH-7

**Acceptance criteria**
1. Given valid credentials, when I sign in, then I land on the page appropriate
   to my role and my name is shown in the navigation bar.
2. Given wrong credentials, then I am told the sign-in failed and no session is
   created.
3. Given I reload the page, then I am still signed in.

**Notes.** The session lasts about 50 minutes, after which requests fail with
`401` while the browser still looks signed in (`BUG-03`). There is no refresh.

### US-CUS-2 — Sign out

**As a** customer **I want** to sign out **so that** the next person at this
computer is not me.

**Realises:** FR-AUTH-5

**Acceptance criteria**
1. Given I am signed in, when I sign out, then the session cookie is cleared and
   protected pages redirect to login.

**Notes.** The token itself remains valid until it expires (`SEC-13`); a copy
taken before sign-out still works.

### US-CUS-3 — Keep a delivery address on file

**As a** customer **I want** to save my address **so that** I do not retype it
at every checkout.

**Realises:** FR-ADR-1, FR-ADR-2, FR-ADR-3, FR-ADR-4

**Acceptance criteria**
1. Given I fill in street, building, city, state, country and postcode, then the
   address is saved against my account.
2. Given I have saved addresses, when I open checkout, then I can pick one.
3. Given I edit or delete one of my addresses, then the change is reflected in
   my list.
4. Given another customer's address, then I can neither see nor change it.

**Notes.** Criterion 4 fails: update and delete accept any address id
(`SEC-09`), and the list endpoint returns every address in the database.

### US-CUS-4 — Put a laptop in the cart

**As a** customer **I want** to add a machine to my cart **so that** I can keep
shopping before I decide.

**Realises:** FR-CART-1, FR-CART-2, FR-CART-3, FR-CART-4, FR-CART-7

**Acceptance criteria**
1. Given a product with stock, when I add it, then it appears in my cart with
   the quantity I chose, at the discounted price.
2. Given the product is already in my cart, when I add it again, then the
   existing line's quantity increases.
3. Given I ask for more than the stock on hand — counting what my cart already
   holds — then the request is refused and I am told why.
4. Given the seller changes the price after I added the item, then my cart line
   keeps the price it was added at.

### US-CUS-5 — Change my mind about the cart

**As a** customer **I want** to adjust quantities and remove items **so that**
the order matches what I actually want.

**Realises:** FR-CART-5, FR-CART-6, FR-CART-8, FR-CART-10

**Acceptance criteria**
1. Given a cart line, when I increase or decrease it, then the line and the cart
   total both change.
2. Given a line at quantity one, when I decrease it, then the line is removed.
3. Given I reload the page, then my cart is unchanged.
4. The displayed total always equals the sum of the lines.

**Notes.** Criterion 4 can drift: incremental updates and full recomputation use
different arithmetic (`BUG-07`).

### US-CUS-6 — Buy what is in my cart

**As a** customer **I want** to check out and pay by card **so that** the order
is placed.

**Realises:** FR-ORD-1, FR-ORD-2, FR-ORD-4, FR-PAY-1, FR-PAY-2, FR-PAY-4

**Acceptance criteria**
1. Given a non-empty cart, when I choose an address and a payment method and
   complete the card form, then an order is created carrying every cart line.
2. Given the order is created, then my cart is empty.
3. Given an empty cart, then checkout refuses to proceed.
4. Given the card is declined, then no order is created and I can retry.

**Notes.** Criterion 4 depends on the browser reporting the outcome honestly:
the backend records the payment result the client sends (`SEC-03`).

### US-CUS-7 — Be told the order was received

**As a** customer **I want** an email confirming the order **so that** I have a
record outside the site.

**Realises:** FR-NOT-1, FR-NOT-2

**Acceptance criteria**
1. Given an order was placed, then an email naming the order id and the amount
   arrives at my registered address.
2. Given mail delivery is broken, then my order is still placed.

**Notes.** Criterion 2 holds for SMTP failures — they are swallowed in the
consumer (`BUG-06`) — but not for a broker outage: publishing happens inside the
order transaction (`BUG-11`).

### US-CUS-8 — Track and cancel an order

**As a** customer **I want** to see my orders and cancel one that has not
shipped **so that** I stay in control after checkout.

**Realises:** FR-ORD-5, FR-ORD-6

**Acceptance criteria**
1. Given I have ordered before, when I open *My Orders*, then I see my orders
   with their status, date and total.
2. Given an order that has not shipped, when I cancel it, then its status
   becomes *Cancelled*.
3. Given another customer's order, then I can neither see nor change it.

**Notes.** Criterion 3 fails: the status endpoint acts on any order id supplied
by any signed-in user (`SEC-08`), and accepts any string as a status (`BUG-18`).

---

## 4. Seller

### US-SEL-1 — List a laptop for sale

**As a** seller **I want** to add a machine to the catalogue **so that**
customers can buy it from me.

**Realises:** FR-PRD-1, FR-PRD-2, FR-PRD-3, FR-PRD-4

**Acceptance criteria**
1. Given a category, when I submit name, description, price, discount, quantity
   and brand, then the product is created and carries my seller identity.
2. Given a discount, then the selling price shown to customers is the list price
   less that percentage.
3. Given the product was created, then it has a SKU of the form
   `CATEGORY-BRAND-MODEL-RANDOM`.
4. Given a name already used in that category, then creation is refused.

### US-SEL-2 — Describe what is inside the machine

**As a** seller **I want** to record processor, RAM, storage, display and
graphics **so that** my product appears in the specification filters.

**Realises:** FR-SPC-1, FR-SPC-2, FR-SPC-4

**Acceptance criteria**
1. Given one of my products, when I fill in the specification form, then the
   values are saved and shown on the product.
2. Given I edit the specification again, then the form is pre-filled with what is
   stored.
3. Given a product has specifications, then it appears under the matching facet
   in the public filters.

### US-SEL-3 — Show a picture

**As a** seller **I want** to upload a photo **so that** the listing looks like a
real product.

**Realises:** FR-PRD-7

**Acceptance criteria**
1. Given an image file, when I upload it against my product, then the listing
   shows it.
2. Given I upload again, then the new image replaces the old one.
3. Given no upload has happened, then a placeholder image is shown.

**Notes.** A file whose name has no extension crashes the upload (`BUG-08`).

### US-SEL-4 — Maintain my own listings only

**As a** seller **I want** a product list scoped to me **so that** I am not
working in another seller's catalogue.

**Realises:** FR-PRD-5, FR-PRD-6, FR-PRD-8, FR-PRD-9

**Acceptance criteria**
1. Given products from several sellers exist, when I open *Products*, then I see
   only mine.
2. Given one of my products, then I can edit or delete it.
3. Given another seller's product id, then edit and delete are refused.

**Notes.** Criterion 3 fails: the handlers never compare the product's seller to
the caller (`SEC-05`). The listing in criterion 1 *is* scoped correctly.

### US-SEL-5 — See the orders I have to fulfil

**As a** seller **I want** the orders containing my products **so that** I know
what to ship.

**Realises:** FR-ORD-8

**Acceptance criteria**
1. Given orders exist across several sellers, when I open *Orders*, then I see
   the orders that include my products.
2. Given such an order, then I can move it to *Processing*, *Shipped* or
   *Delivered*.

**Notes.** The listing loads every order into memory before filtering
(`BUG-17`) — correct, but it will not survive a real order volume.

---

## 5. Administrator

### US-ADM-1 — Organise the catalogue

**As an** administrator **I want** to manage categories **so that** the
catalogue stays navigable.

**Realises:** FR-CAT-1

**Acceptance criteria**
1. Given a name of at least five characters, then a category is created.
2. Given an existing category, then I can rename it.
3. Given a category I no longer want, then I can delete it.

**Notes.** Deleting a category deletes every product in it (`BUG-13`), and
renaming rebuilds the entity from the payload, dropping fields the form does not
carry (`BUG-05`). Both are destructive surprises rather than intended behaviour.

### US-ADM-2 — Work across the whole catalogue

**As an** administrator **I want** to act on any product **so that** I can fix
listings without involving the seller.

**Realises:** FR-PRD-5, FR-PRD-6, FR-PRD-7, FR-SPC-2

**Acceptance criteria**
1. Given any product, then I can edit, delete, re-image and re-specify it.
2. Given the product list, then I see products from every seller.

### US-ADM-3 — Run the order pipeline

**As an** administrator **I want** to see every order and move it along **so
that** fulfilment keeps moving.

**Realises:** FR-ORD-7, FR-ORD-9

**Acceptance criteria**
1. Given orders exist, when I open *Orders*, then I see all of them, paginated,
   with customer, date, total and status.
2. Given an order, then I can set its status to one of the defined values.
3. Given a status outside that set, then the change is refused.

**Notes.** Criterion 3 fails — the column takes any string (`BUG-18`).

### US-ADM-4 — Manage accounts

**As an** administrator **I want** to list and remove customers and sellers
**so that** I can deal with abuse and duplicates.

**Realises:** FR-USR-1, FR-USR-2, FR-USR-3, FR-USR-4, FR-USR-5

**Acceptance criteria**
1. Given accounts exist, then I can list customers and sellers separately, paged.
2. Given an account, then I can delete it.
3. Given I am not an administrator, then none of this is available to me.

**Notes.** Criterion 3 fails outright: these endpoints sit under a public path
prefix and are role-checked nowhere (`SEC-02`).

### US-ADM-5 — See how the shop is doing

**As an** administrator **I want** headline figures and charts **so that** I can
judge the state of trade at a glance.

**Realises:** FR-ANL-1, FR-ANL-2, FR-ANL-3

**Acceptance criteria**
1. Given orders and products exist, then the dashboard shows revenue, order
   count, product count and customer count.
2. Given cancelled orders exist, then revenue excludes them.
3. Given I am not an administrator, then the dashboard is not reachable.

**Notes.** Criterion 2 fails (`BUG-16`), and several secondary charts are drawn
from placeholder data rather than the API.

---

## 6. Operator

### US-OPS-1 — Start the platform in one step

**As an** operator **I want** a single command to bring everything up **so
that** a demonstration does not depend on my remembering seven start-up orders.

**Realises:** NFR-OPS-1, NFR-REL-3

**Acceptance criteria**
1. Given a clean machine with Docker, when I fill in `.env` and run
   `docker compose up`, then the shop is reachable on port 5173.
2. Given a service is not ready, then dependants wait for it rather than
   crash-looping.

### US-OPS-2 — Load a demonstration catalogue

**As an** operator **I want** sample products **so that** the shop is not empty
during a demonstration.

**Acceptance criteria**
1. Given the `seed` profile is enabled, when the stack starts, then a demo
   catalogue is loaded and assigned to a seller account.
2. Given the catalogue already has products, then the seeder does nothing.

See [../operations/database-seeding.md](../operations/database-seeding.md).

### US-OPS-3 — Diagnose a failure without reading the source

**As an** operator **I want** a symptom-to-cause runbook **so that** I can
recover the stack without a developer.

**Realises:** NFR-OPS-3

**Acceptance criteria**
1. Given a common failure, then
   [../operations/troubleshooting-runbook.md](../operations/troubleshooting-runbook.md)
   names its likely cause and a recovery step.
2. Given a service is unhealthy, then its health endpoint says so.

---

## 7. Epics and Their Stories

| Epic | Stories | Primary business goal |
|---|---|---|
| **Discovery** — find the right machine | US-VIS-1, US-VIS-2, US-VIS-3, US-VIS-4 | BG-1, BG-2 |
| **Account** — identity and profile | US-VIS-5, US-CUS-1, US-CUS-2, US-CUS-3 | BG-1 |
| **Purchase** — cart to paid order | US-CUS-4, US-CUS-5, US-CUS-6, US-CUS-8 | BG-1 |
| **Merchandising** — get stock listed | US-SEL-1, US-SEL-2, US-SEL-3, US-SEL-4, US-ADM-1, US-ADM-2 | BG-2, BG-3 |
| **Fulfilment** — move orders along | US-SEL-5, US-ADM-3 | BG-1, BG-3 |
| **Administration** — accounts and insight | US-ADM-4, US-ADM-5 | BG-5 |
| **Communication** — keep the buyer informed | US-CUS-7 | BG-4 |
| **Operability** — run the thing | US-OPS-1, US-OPS-2, US-OPS-3 | BG-6 |

---

## 8. Traceability Matrix

Requirement → story → test case. The test-case column points at
[../quality/test-cases.md](../quality/test-cases.md); a dash means the
requirement has no test case yet.

| Requirement group | Stories | Test cases |
|---|---|---|
| FR-AUTH-1..8 | US-VIS-5, US-CUS-1, US-CUS-2 | TC-AUTH-01..08 |
| FR-USR-1..5 | US-ADM-4 | TC-USR-01..03 |
| FR-ADR-1..5 | US-CUS-3 | TC-ADR-01..04 |
| FR-CAT-1..2 | US-ADM-1, US-VIS-1 | TC-CAT-01..04 |
| FR-PRD-1..10 | US-SEL-1, US-SEL-3, US-SEL-4, US-ADM-2 | TC-PRD-01..10 |
| FR-SPC-1..5 | US-SEL-2 | TC-SPC-01..04 |
| FR-SRCH-1..9 | US-VIS-2, US-VIS-3, US-VIS-4 | TC-SRCH-01..09 |
| FR-CART-1..10 | US-CUS-4, US-CUS-5 | TC-CART-01..11 |
| FR-ORD-1..9 | US-CUS-6, US-CUS-8, US-SEL-5, US-ADM-3 | TC-ORD-01..10 |
| FR-PAY-1..4 | US-CUS-6 | TC-PAY-01..04 |
| FR-NOT-1..4 | US-CUS-7 | TC-NOT-01..03 |
| FR-ANL-1..3 | US-ADM-5 | TC-ANL-01..02 |
| NFR-OPS-1..4, NFR-REL-3 | US-OPS-1, US-OPS-2, US-OPS-3 | TC-OPS-01..04 |
