# Administrator Guide

Running the TechZone shop from the management panel: the catalogue, the order
pipeline, the accounts, and the dashboard.

Other guides: [customer-guide.md](customer-guide.md) ·
[seller-guide.md](seller-guide.md) · [faq.md](faq.md) ·
[installation.md](installation.md)

For starting, configuring and recovering the *system* rather than the shop, see
[../operations/troubleshooting-runbook.md](../operations/troubleshooting-runbook.md).

---

## Table of Contents

1. [Signing In](#1-signing-in)
2. [The Dashboard](#2-the-dashboard)
3. [Categories](#3-categories)
4. [Products](#4-products)
5. [Orders](#5-orders)
6. [Sellers and Customers](#6-sellers-and-customers)
7. [Daily and Weekly Routine](#7-daily-and-weekly-routine)
8. [What You Cannot Do](#8-what-you-cannot-do)
9. [Security You Need to Know About](#9-security-you-need-to-know-about)

---

## 1. Signing In

Sign in with an administrator account and you land at `/admin` instead of the
shop. A freshly installed system has a demonstration `admin` account — see
[../operations/running-locally.md](../operations/running-locally.md#seeded-users).

The sidebar holds six entries. Sellers see only two of them.

| Entry | What it is for |
|---|---|
| **Dashboard** | Headline figures and charts |
| **Products** | Every product, from every seller |
| **Categories** | The catalogue's structure |
| **Orders** | Every order, and their statuses |
| **Sellers** | Seller accounts |
| **Customers** | Customer accounts |

Your session lasts about 50 minutes, after which actions start failing silently.
Sign in again when the panel stops responding.

---

## 2. The Dashboard

Four cards across the top — revenue, orders, products, customers — and three
charts: revenue over time, orders by status, and best sellers.

Read the numbers with two caveats:

- **Revenue includes cancelled orders**, and is formatted as text rather than
  calculated as a number (`BUG-16`). Treat it as an indicator, not an account.
- **Some tiles and charts are placeholder data**, not live figures. Where a
  number never changes no matter what you do, that is why.

The reliable figures are the counts of orders, products and customers. For
anything financial, read the **Orders** list.

---

## 3. Categories

Categories are the top level of the catalogue, and sellers cannot create them —
only you can.

| Action | How | Notes |
|---|---|---|
| Create | **Categories → Add Category** | Name must be at least 5 characters |
| Rename | The edit action on the row | See the warning below |
| Delete | The delete action on the row | See the warning below |

> ### Two warnings, both real
>
> **Deleting a category deletes every product inside it.** There is no prompt
> explaining this and no way to undo it (`BUG-13`). Before deleting, filter
> **Products** by that category and move or delete the products deliberately.
>
> **Renaming can drop fields.** The rename rebuilds the category record from the
> form, so anything the form does not carry is lost (`BUG-05`). Rename only when
> you have to.

Category names are matched **exactly** by the shop's filter (`BUG-15`), so a
rename silently breaks any bookmark or link that filtered on the old name.

---

## 4. Products

**Products** shows every product from every seller, with search, sorting and
paging. You have the same actions a seller has, on any product: edit, upload an
image, edit specifications, delete.

Use it to:

- Fix a listing a seller has got wrong — a price, a typo, a missing brand.
- Add specifications a seller left blank. **A product with no specifications
  never appears in the shop's processor, RAM or storage filters** (`BUG-14`), so
  filling these in is the highest-value catalogue work available to you.
- Normalise brand spellings. "HP" and "Hewlett-Packard" become two separate
  entries in the buyer's brand filter; make them agree.
- Correct stock after a cancellation — cancelling an order does **not** return
  its units to stock.

The full field rules are in [seller-guide.md](seller-guide.md#3-adding-a-product)
and apply identically here.

---

## 5. Orders

**Orders** lists every order with the customer's email, the date, the total and
the status. Sellers see only orders containing their own products; you see all
of them.

Statuses:

```
Accepted  →  Pending  →  Processing  →  Shipped  →  Delivered
                                   ↘  Cancelled
```

Every new order starts as **Accepted** — that is the only status the system sets
by itself. Everything after that is a human decision, made here.

Three things the system will not stop you doing, so decide them yourself:

1. **Any status can follow any other.** Nothing prevents *Delivered* → *Pending*.
   There is no transition rule (`BUG-18`).
2. **Cancelling does not return stock**, and does not refund anything — there is
   no refund process in this version at all. Handle the money outside the system
   and correct the product quantity by hand.
3. **Order dates have no time of day**, only a date, so orders placed on the same
   day cannot be sequenced by their timestamp.

---

## 6. Sellers and Customers

Two lists, both paginated, both offering deletion.

| Task | Where |
|---|---|
| See who sells here | **Sellers** |
| See who buys here | **Customers** |
| Remove an account | The delete action on either list |

Deleting a customer removes their addresses with them. Deleting a **seller does
not remove their products** — those stay in the catalogue pointing at an account
that no longer exists. Reassign or delete the products first.

There is no way to reset a password, suspend an account without deleting it, or
change someone's role. An account that cannot sign in has to be deleted and
created again.

---

## 7. Daily and Weekly Routine

**Each day**

1. **Orders** — move new orders along: *Processing* when work starts, *Shipped*
   when it leaves, *Delivered* when it lands.
2. Check for orders sitting in *Accepted* longer than a day.

**Each week**

3. **Products** — find products with no specifications and fill them in; they are
   invisible to the shop's filters until you do.
4. Check brand spellings for accidental duplicates.
5. Reconcile stock against anything cancelled during the week.
6. **Dashboard** — read order and customer counts for the trend; ignore the
   revenue figure for anything that matters.

**Before any demonstration**

7. Confirm the catalogue has products — a fresh system starts empty and an empty
   catalogue currently shows as an *error* rather than an empty shop (`BUG-04`).
8. Place one test order end to end with the Stripe test card
   `4242 4242 4242 4242`.

---

## 8. What You Cannot Do

Not missing by accident — outside what this version does:

- Reset or change anyone's password
- Suspend an account, or change its role
- Refund a payment, or process a return
- Issue an invoice or any tax document
- Apply a discount code or run a campaign
- Set shipping costs, or record a tracking number
- Export data, or bulk-import a catalogue
- See an audit trail of who changed what

---

## 9. Security You Need to Know About

Four things about this version that change how you should deploy and use it.
They are recorded in full in
[../backend/known-defects.md](../backend/known-defects.md).

| Issue | What it means in practice |
|---|---|
| **Anyone can register as an administrator** (`SEC-01`) | The registration form offers the Admin role and the system grants it. On any network other than your own machine, anybody who finds the shop can take full control |
| **The account lists are public** (`SEC-02`) | Listing and deleting customers and sellers needs no sign-in at all — not just no *admin* sign-in. Anyone who knows the address can enumerate and delete accounts |
| **Payment success is claimed by the browser** (`SEC-03`) | A crafted request can create a paid order without paying. Never treat an order in this system as proof of payment |
| **The signing secret is in the source code** (`SEC-04`) | Anyone with the repository can forge a session as any user, including you |

**The practical consequence:** run this on `localhost` or a closed network. Do
not publish it to the internet, and do not put real customer data or real
payment details into it. It is a demonstration platform, and it is safe only
while it is not reachable by strangers.

If you must expose it, the four issues above are the minimum to fix first, in
that order.
