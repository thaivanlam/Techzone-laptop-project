# Customer Guide

How to use the TechZone shop: find a laptop, buy it, and follow the order
afterwards. No technical knowledge is assumed.

Other guides: [seller-guide.md](seller-guide.md) ·
[admin-guide.md](admin-guide.md) · [faq.md](faq.md) ·
[installation.md](installation.md)

> **This is a demonstration shop.** Payments run in Stripe **test mode**. Use the
> test card numbers in [§6](#6-paying); a real card is neither needed nor
> accepted, and no money ever moves.

---

## Table of Contents

1. [Opening the Shop](#1-opening-the-shop)
2. [Creating an Account](#2-creating-an-account)
3. [Signing In and Out](#3-signing-in-and-out)
4. [Finding a Laptop](#4-finding-a-laptop)
5. [The Basket](#5-the-basket)
6. [Paying](#6-paying)
7. [After the Order](#7-after-the-order)
8. [Your Addresses](#8-your-addresses)
9. [Things That May Surprise You](#9-things-that-may-surprise-you)

---

## 1. Opening the Shop

Open **http://localhost:5173** in a browser. (If someone else set the system up,
they will give you a different address.)

The home page shows a banner and featured products. The bar across the top is
the same on every page:

| Item | What it does |
|---|---|
| **TechZone** logo | Back to the home page |
| **Products** | The full catalogue, with all the filters |
| **About**, **Contact** | Information pages |
| **Basket icon** | Your basket, with a count of the items in it |
| **Login** / your name | Sign in, or reach your profile and orders |

You can browse and search the whole catalogue **without an account**. You need
one only to put things in a basket and buy.

---

## 2. Creating an Account

1. Click **Login**, then **Register** (or go straight to `/register`).
2. Fill in:
   - **Username** — up to 20 characters, must not already be taken
   - **Email** — must be a real format, and not already registered
   - **Password**
3. Choose a role. **Pick *Customer*.** The other two are for people running the
   shop:

   | Role | What it is for |
   |---|---|
   | **Customer** | Buying. This is you. |
   | **Seller** | Listing products for sale — see [seller-guide.md](seller-guide.md) |
   | **Admin** | Running the platform — see [admin-guide.md](admin-guide.md) |

4. Submit. You should receive a welcome email at the address you gave.

If registration is refused, the message names the reason — nearly always that
the username or the email is already in use.

> There is **no "forgot password"** in this version. If you lose a password, an
> administrator has to delete the account and you register again.

---

## 3. Signing In and Out

Sign in with your username and password. Where you land depends on your role:

- **Customer** → the shop
- **Seller** or **Admin** → the management panel

Your session lasts about **50 minutes**. After that, actions start failing even
though the page still looks signed in. If something stops working for no
apparent reason, sign out and sign in again — that fixes it.

To sign out, use the menu under your name in the top bar.

---

## 4. Finding a Laptop

Click **Products** for the full catalogue. Results are paged, six at a time.

### Search

Type a model name into the search box. Results update on their own about
three-quarters of a second after you stop typing — there is no button to press.

### Filters

Down the left-hand side:

| Filter | How it works |
|---|---|
| **Category** | Choose one, for example *Gaming Laptops* or *Ultrabooks* |
| **Price** | Drag the slider, or type a minimum and maximum |
| **Brand** | Tick as many as you like; ticking two shows both |
| **Processor** | Tick one or more CPU families |
| **RAM** | Tick one or more memory sizes |
| **Storage** | Tick one or more drive sizes |
| **Sort by price** | Cheapest first, or most expensive first |

Filters combine: brand *and* RAM *and* price all apply together. Clear them from
the same panel to widen the search again.

**Your filters live in the address bar.** Copy the URL and send it to someone,
or bookmark it — they will see exactly the list you were looking at.

### Specifications

Open a product to see its price, availability and description. The
**Specifications** button shows the technical detail:

- **Processor** — the CPU, e.g. *Intel Core i7-13700H*
- **RAM** — memory, e.g. *16GB DDR5*
- **Storage** — the drive, e.g. *512GB SSD NVMe*
- **Display** — size, resolution and refresh rate
- **Graphics** — the GPU

Not every product has all five filled in.

---

## 5. The Basket

Click **Add to Basket** on a product and choose a quantity.

| You want to | Do this |
|---|---|
| See the basket | Click the basket icon in the top bar |
| Change a quantity | Use **+** and **−** on the line |
| Remove an item | Use the delete icon, then confirm |
| Keep shopping | Just navigate away — the basket is kept |

The basket shows each line, what you save against the list price, and the total.

**You cannot order more than there is in stock.** If you try, the shop refuses
and tells you how many are available. What is already in your basket counts
towards that limit.

Your basket survives a page refresh and closing the browser. It is emptied when
you place an order.

> The price in your basket is the price at the moment you added the item. If the
> seller changes it later, your basket keeps the price you saw.

---

## 6. Paying

With something in the basket, click **Checkout**. There are four steps.

### Step 1 — Delivery address

Pick a saved address, or click **Add Address** and fill in street, building,
city, state, country and postcode. Each field has a minimum length; the form
tells you if one is too short.

### Step 2 — Payment method

Choose **Stripe** (card).

### Step 3 — Review

Check the items, the address and the total, then continue.

### Step 4 — Card

Enter card details in the Stripe form. **Use a test card:**

| Card number | Expiry | CVC | What happens |
|---|---|---|---|
| `4242 4242 4242 4242` | any future date | any 3 digits | Payment succeeds |
| `4000 0000 0000 0002` | any future date | any 3 digits | Payment is declined |
| `4000 0025 0000 3155` | any future date | any 3 digits | Asks for 3-D Secure confirmation |

Never enter a real card. Nothing here is a real payment.

When the payment succeeds you land on a confirmation page, your basket is
emptied, and a confirmation email is sent with the order number and the amount.

If the card is declined, nothing is ordered and your basket is untouched — fix
the details and try again.

---

## 7. After the Order

Go to **your name → My Orders** (or `/profile/orders`).

Each order shows its number, the date, the items, the total and a status:

| Status | Meaning |
|---|---|
| **Accepted** | We have the order — this is what every new order starts as |
| **Pending** | Waiting to be worked on |
| **Processing** | Being prepared |
| **Shipped** | On its way |
| **Delivered** | Arrived |
| **Cancelled** | Cancelled, by you or by the shop |

You can search your orders and filter by status.

### Cancelling

Use **Cancel** on an order that has not shipped. The status becomes
*Cancelled*.

> Cancelling does **not** return the items to stock in this version, and it does
> not issue a refund — there is no refund process at all. Tell the shop's
> operator if a cancellation needs money returned.

---

## 8. Your Addresses

**Your name → Profile** lists your saved addresses. You can add, edit and delete
them. Addresses used on past orders are stored by reference, so **editing an
address also changes what an old order shows as its delivery address**. If you
move, it is safer to add a new address than to edit the old one.

---

## 9. Things That May Surprise You

Known behaviour in this version, so you do not think you have broken something.

| What you see | What is happening |
|---|---|
| A search that matches nothing shows an error rather than "no results" | A known defect (`BUG-04`). Your search was fine — nothing matched |
| A brand-new shop shows an error instead of an empty catalogue | The same defect, with nothing in the catalogue at all |
| A laptop you expect is missing from a Processor / RAM / Storage filter | Products with no specifications recorded are left out of those filters (`BUG-14`) |
| A category filter finds nothing although the category exists | The category name must match exactly, letter for letter (`BUG-15`) |
| Everything stops working after a while | Your session expired (about 50 minutes). Sign in again |
| No confirmation email | Email needs configuring by whoever runs the shop; the order itself is still placed |
| Basket total looks a penny off | A rounding difference between two ways of adding up (`BUG-07`) |
| Sign-out does not feel complete | The browser forgets you, but the session is only fully dead once it expires |

There is no password reset, no wishlist, no product reviews and no returns
process. Those are outside what this version does — see
[faq.md](faq.md).
