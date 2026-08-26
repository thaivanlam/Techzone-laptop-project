# Seller Guide

How to list laptops on TechZone and keep them up to date, using the management
panel. Written for someone who sells, not someone who builds.

Other guides: [customer-guide.md](customer-guide.md) ·
[admin-guide.md](admin-guide.md) · [faq.md](faq.md)

---

## Table of Contents

1. [Getting a Seller Account](#1-getting-a-seller-account)
2. [The Panel](#2-the-panel)
3. [Adding a Product](#3-adding-a-product)
4. [Product Photos](#4-product-photos)
5. [Specifications — and Why They Matter](#5-specifications--and-why-they-matter)
6. [Editing and Removing Products](#6-editing-and-removing-products)
7. [Stock](#7-stock)
8. [Orders](#8-orders)
9. [A Product's Journey, End to End](#9-a-products-journey-end-to-end)
10. [Things That May Surprise You](#10-things-that-may-surprise-you)

---

## 1. Getting a Seller Account

On the registration page, choose the **Seller** role instead of Customer. Sign
in afterwards and you land in the management panel rather than the shop.

There is a demonstration seller account on a freshly installed system:
`seller1`, documented with the other demo accounts in
[../operations/running-locally.md](../operations/running-locally.md#seeded-users).

> Anyone can currently register as a Seller without approval. That is a known
> weakness of this version, not a feature — see [faq.md](faq.md).

---

## 2. The Panel

Sign in and you are at `/admin`. Sellers see two entries in the sidebar:

| Entry | What it holds |
|---|---|
| **Products** | Your products — nobody else's |
| **Orders** | Orders containing your products |

Administrators see more (categories, customers, sellers, a dashboard). That is
expected; those are not part of a seller's job.

The product table gives you search, sorting and paging. Each row has actions for
editing, images and specifications.

---

## 3. Adding a Product

**Products → Add Product.**

| Field | Rules and advice |
|---|---|
| **Category** | Pick one. Only an administrator can create new categories — ask if the right one is missing |
| **Product name** | At least 3 characters, and unique **within the category**. "Legion 5" can exist in Gaming and again in Business, but not twice in Gaming |
| **Description** | At least 6 characters. Keep it under a couple of hundred — long text is cut off when stored |
| **Brand** | Free text, but **spelling matters**: "HP" and "Hewlett-Packard" become two separate entries in the shop's brand filter. Match what other listings use |
| **Price** | The list price, before discount |
| **Discount** | A percentage, 0–100. The shop shows the reduced price and the saving |
| **Quantity** | Units in stock. Customers cannot order more than this |

Save, and the shop shows the discounted price automatically — you never type the
sale price yourself. Price 1200 with discount 10 is sold at 1080.

The system also gives the product a **SKU** like `GAM-LENOVO-LEGIO-482913`, built
from the category, brand and name. It changes if you rename the product or change
the brand, so do not use it as a permanent reference number.

---

## 4. Product Photos

A new product shows a placeholder image until you upload one.

**Products → the image action on the row → choose a file → upload.** Uploading
again replaces the previous picture.

> **Make sure the file name has an extension** — `laptop.jpg`, not `laptop`. A
> file with no extension makes the upload fail with an unclear error
> (`BUG-08`).

Use a reasonably sized image. The limit is 50 MB, which is far larger than any
product photo needs to be.

---

## 5. Specifications — and Why They Matter

This is the single most valuable thing you can do for a listing.

**Products → the specifications action on the row.** Five fields:

| Field | Example |
|---|---|
| **Processor** | `Intel Core i7-13700H` |
| **RAM** | `16GB DDR5` |
| **Storage** | `512GB SSD NVMe` |
| **Display** | `15.6" FHD IPS 144Hz` |
| **Graphics** | `NVIDIA RTX 4060 8GB` |

Buyers filter the catalogue by processor, RAM and storage. **A product with no
specifications never appears in any of those filters** — it is not ranked lower,
it is absent entirely. If your listing seems invisible, this is nearly always
why.

Two rules follow:

1. Fill in the specifications for every product, at the same time as you create
   it.
2. **Use the values the dropdowns offer.** The filter matches text exactly:
   `16GB DDR5` and `16 GB DDR5` are two different things to it, and a buyer
   ticking one will not see the other.

Editing a specification later replaces the stored values; it never creates a
second record. Deleting the product removes its specifications too.

---

## 6. Editing and Removing Products

Edit from the row action. Anything can be changed — price, discount, quantity,
description, brand, category.

Changing price or discount recalculates the sale price immediately. It does
**not** change baskets or orders that already exist: those keep the price the
buyer saw. That is deliberate.

Deleting removes the product from the catalogue permanently, along with its
specifications. It does not affect orders already placed — those keep their own
record of what was bought.

---

## 7. Stock

Stock is the **Quantity** field. It goes down when a customer places an order.

Three things to know:

- A customer cannot order more than the quantity you set.
- **A cancelled order does not put stock back.** If a customer cancels, raise the
  quantity yourself.
- Stock is not reserved while a customer is checking out, and under very heavy
  simultaneous demand it is possible for the last unit to be sold twice
  (`BUG-02`). At demonstration volumes this will not happen; check the figure
  after any unusual burst of orders.

Update quantity through the edit form whenever new stock arrives.

---

## 8. Orders

**Orders** lists orders containing your products, with the buyer, the date, the
total and the status.

Move an order along with the status control:

```
Accepted  →  Pending  →  Processing  →  Shipped  →  Delivered
                                   ↘  Cancelled
```

Set **Processing** when you start preparing it, **Shipped** when it leaves, and
**Delivered** when it arrives. The customer sees each change in their own order
list, so keeping it current is what tells them what is happening.

Delivery itself is arranged outside this system. TechZone records the address and
the status; it does not book couriers or hold tracking numbers.

---

## 9. A Product's Journey, End to End

A checklist for listing something new:

1. **Products → Add Product** — category, name, description, brand, price,
   discount, quantity.
2. **Upload a photo** — with a file extension.
3. **Add specifications** — all five fields, from the dropdown values.
4. **Check it in the shop** — open the public catalogue, filter by your brand
   and by the RAM you entered, and confirm the product appears in both.
5. **Watch Orders** — move each order along as you fulfil it.
6. **Top the quantity up** when stock arrives, and after any cancellation.

Step 4 is the one worth not skipping: it is the only way to catch a
specification typo that quietly hides your listing.

---

## 10. Things That May Surprise You

| What you see | What is happening |
|---|---|
| Your product does not appear under a RAM or Processor filter | Its specifications are missing, or a value does not exactly match the one the buyer ticked |
| Your brand appears twice in the brand filter | Two spellings were used. Edit the products so they agree |
| A file upload fails with an unhelpful error | The file name has no extension (`BUG-08`) |
| The SKU changed by itself | You renamed the product or changed its brand — SKUs are regenerated then |
| A cancelled order left stock unchanged | Stock is not returned automatically; raise it by hand |
| Another seller's products appear in a list | The **Products** list is correctly scoped to you. If you see otherwise, report it |
| Your whole category emptied | An administrator deleted the category, which deletes the products inside it (`BUG-13`) |
| The panel stops responding after a while | Your session expired (about 50 minutes). Sign in again |

Two limitations worth stating plainly, both known and both recorded in the
project's defect register: a seller can currently act on **another seller's**
product if they know its id (`SEC-05`), and there are no seller payouts or
commission in this version at all.
