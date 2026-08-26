# Frequently Asked Questions

Short answers for people using TechZone. Grouped by who is asking.

Guides: [customer-guide.md](customer-guide.md) ·
[seller-guide.md](seller-guide.md) · [admin-guide.md](admin-guide.md) ·
[installation.md](installation.md)

---

## About the Platform

**What is TechZone?**
An online shop for laptops, with a catalogue you can filter by technical
specification, a basket, card checkout, and an order pipeline. It was built as a
graduation-thesis project.

**Is this a real shop?**
No. Payments run in Stripe **test mode** — no money moves and no goods ship. Use
the test card numbers in [customer-guide.md](customer-guide.md#6-paying).

**Can I use it for a real business?**
Not as it stands. It has known security defects, listed in
[admin-guide.md](admin-guide.md#9-security-you-need-to-know-about) and in full in
[../backend/known-defects.md](../backend/known-defects.md). Run it on your own
machine or a private network, with no real customer or payment data.

**What can it do?**
Browse and filter a catalogue by CPU, RAM, storage, brand and price; basket and
card checkout; order tracking and cancellation; seller product management with
photos and specifications; administration of categories, orders and accounts; and
a dashboard. The full specification is
[../requirements/srs.md](../requirements/srs.md).

**What can it not do?**
No password reset, no product reviews, no wishlists, no discount codes, no
refunds or returns, no invoices, no multi-currency, no shipping integration or
tracking numbers, no two-factor authentication, and no mobile app. The complete
list is [../requirements/srs.md](../requirements/srs.md#10-out-of-scope).

**What languages and currencies?**
English, one currency (US dollars). There is no localisation.

---

## Accounts and Signing In

**I forgot my password.**
There is no reset. An administrator must delete the account so you can register
again with the same email.

**Why do I get signed out after about an hour?**
Sessions last roughly 50 minutes and there is no automatic renewal. What makes it
confusing is that the page still *looks* signed in while requests are already
failing — if things stop working for no reason, sign in again.

**I signed out. Am I safe on a shared computer?**
Mostly. The browser forgets you immediately, but the session itself stays valid
on the server until it expires (`SEC-13`). Close the browser as well.

**Which role should I choose when registering?**
*Customer*, unless you are running the shop. *Seller* is for listing products,
*Admin* for managing the platform.

**Anyone can register as an Admin. Is that meant to happen?**
No — it is a known defect (`SEC-01`) and one of the reasons this must not be
exposed publicly.

**Can I change my role later?**
No. Register a second account, or ask an administrator to delete and recreate
yours.

---

## Shopping

**Do I need an account to look around?**
No. Browsing, searching and filtering are open to everyone. You need an account
to use a basket and to buy.

**My search found nothing and showed an error.**
Your search was fine. An empty result is reported as an error in this version
(`BUG-04`).

**A laptop I know exists is missing from the RAM/Processor filter.**
That product has no specifications recorded, and products without them are left
out of those filters entirely (`BUG-14`). A seller or administrator can fix it by
filling the specifications in.

**A category filter finds nothing although the category exists.**
Category names must match exactly, letter for letter (`BUG-15`). Choose it from
the dropdown rather than typing it.

**Can I share a filtered list?**
Yes — the filters are in the address bar. Copy the URL.

**Why can I not order more than a certain number?**
That is the stock on hand. Anything already in your basket counts towards it.

**Will my basket survive if I close the browser?**
Yes. It is cleared only when you place an order.

**The price changed after I added it to my basket.**
Your basket keeps the price you saw when you added the item. That is deliberate.

**Which card do I use?**
`4242 4242 4242 4242`, any future expiry, any 3-digit CVC. To see a failure, use
`4000 0000 0000 0002`. Never enter a real card.

**My card was declined.**
Nothing was ordered and your basket is untouched. Try again — with a test card if
you were not using one.

**No confirmation email arrived.**
Email needs configuring by whoever installed the system. Your order is placed
regardless; check *My Orders*.

**Can I cancel?**
Yes, until it ships — use **Cancel** in *My Orders*. There is no refund process,
so if money were involved it would be settled outside the system.

**Can I return something?**
No. Returns are not part of this platform.

**Can I change my delivery address after ordering?**
Not for a placed order. Worse: **editing a saved address also changes what past
orders show**, because the order stores a reference rather than a copy. Add a new
address instead of editing an old one.

---

## Selling

**How do I become a seller?**
Choose *Seller* when registering. There is no approval step in this version.

**My product does not show up in the filters.**
Almost always missing specifications. Fill in processor, RAM, storage, display
and graphics, using the values the dropdowns offer — the filter matches text
exactly, so `16GB DDR5` and `16 GB DDR5` are different things.

**My brand appears twice in the shop's filter.**
Two spellings were used across your products. Edit them so they agree.

**My image upload fails.**
Check the file name has an extension — `laptop.jpg`, not `laptop` (`BUG-08`).

**Can I create a category?**
No, only an administrator can. Ask for the one you need.

**Does stock come back when a customer cancels?**
No. Raise the quantity yourself.

**Why did my SKU change?**
SKUs are rebuilt when the product name or the brand changes. Do not use them as
permanent reference numbers.

**All my products in one category disappeared.**
An administrator deleted the category, which deletes the products inside it
(`BUG-13`).

**Can another seller edit my products?**
Through the interface, no — each seller sees only their own. But the server does
not check ownership, so someone who knows a product's id can (`SEC-05`). It is a
known defect.

**When do I get paid?**
There are no payouts or commission in this version at all.

---

## Running the Platform

**How do I install it?**
[installation.md](installation.md). You need Docker; everything else runs inside
it.

**The shop is empty and shows an error.**
Load the demonstration catalogue — [installation.md](installation.md#6-step-5--load-demonstration-products).

**Port 3306 is already in use.**
Another MySQL is running. Set `MYSQL_PORT=3307` in `.env`.

**I changed a setting and nothing happened.**
Some settings are baked into the web application when its image is built. After
changing any `VITE_*` value: `docker compose build frontend && docker compose up
-d frontend`. The full table of what needs what is in
[../operations/configuration-reference.md](../operations/configuration-reference.md#10-when-a-change-takes-effect).

**My products vanished after a restart.**
Usually the profile changed between `dev` and `prod`, which switches the
database. Check `SPRING_PROFILES_ACTIVE` in `.env`.

**How do I back up?**
There is no backup feature. The data lives in a Docker volume named
`mysql_data`; back that up with your usual Docker tooling. Note that
`docker compose down -v` **deletes** it.

**How do I start completely fresh?**
`docker compose down -v`, then start again. Everything — products, accounts,
orders — is erased.

**Where do I look when something breaks?**
[../operations/troubleshooting-runbook.md](../operations/troubleshooting-runbook.md)
for symptoms and recovery, and `docker compose logs -f <service>` for detail.

**Is it safe to put on the internet?**
No. See [admin-guide.md](admin-guide.md#9-security-you-need-to-know-about).

---

## For Reviewers and Developers

**Where is the architecture described?**
[../architecture/system-overview.md](../architecture/system-overview.md), with
diagrams in [../architecture/uml-diagrams.md](../architecture/uml-diagrams.md)
and the schema in
[../architecture/data-model.md](../architecture/data-model.md).

**Why is it built as microservices for a shop this size?**
Deliberately, as part of the thesis. The reasoning behind each technical choice
is recorded as an ADR in
[../architecture/decisions/](../architecture/decisions/).

**Is there a list of known bugs?**
Yes — [../backend/known-defects.md](../backend/known-defects.md), with severity,
reproduction and a proposed fix for each, and a classification by defect type in
[../quality/bug-taxonomy.md](../quality/bug-taxonomy.md).

**Why does the documentation admit so many defects?**
Because a register that hides them is worth nothing. The defects were found by a
source audit and are tracked, prioritised, and in many cases pinned by tests so
they cannot worsen unnoticed.

**How is it tested?**
[../quality/test-plan.md](../quality/test-plan.md) for the strategy,
[../quality/test-cases.md](../quality/test-cases.md) for the cases, and
[../quality/test-report.md](../quality/test-report.md) for the last run.

**How do I start working on the code?**
[../development/developer-guide.md](../development/developer-guide.md).
