# User Acceptance Test Checklist

The manual half of acceptance testing: the things a person has to judge, which the
automated acceptance suite in [`tests/acceptance/`](../../tests/acceptance) cannot.

The automated suite proves the platform's **API** keeps its promises. This checklist covers
the **interface** and the **outside world** — layout, wording, the Stripe form, the email
that actually lands in an inbox.

For how this fits with the other three levels, see [test-plan.md](test-plan.md).

---

## Before you start

```bash
# from the repository root — with the demo catalogue, which most of this needs
COMPOSE_PROFILES=prod,seed docker compose up -d
```

| Item | Value |
|---|---|
| Shop | http://localhost:5173 (dev) or http://localhost (Compose) |
| Gateway | http://localhost:8080 |
| Accounts | [operations/running-locally.md](../operations/running-locally.md#seeded-users) |

Run the automated suites first — `cd tests && npm test`. If they are red, fix that before
spending a person's time here.

Record the result of each row as **Pass**, **Fail** or **N/A**, with a note and the browser
used. Anything that fails becomes an entry in
[known-defects.md](../backend/known-defects.md) using the template at the end of
[bug-taxonomy.md](bug-taxonomy.md).

---

## 1. First impression — anonymous visitor

| # | Check | Expected | Result |
|---|---|---|---|
| 1.1 | Open the shop with no account | The home page renders; no error toast; no blank area where a component failed | |
| 1.2 | Banner carousel | Slides advance; images load; text is readable over every slide | |
| 1.3 | Product grid | Cards show a picture, a name, a price and a discounted price where one applies | |
| 1.4 | Prices | Formatted as currency with two decimals and thousands separators — no raw `1080.0000000001` | |
| 1.5 | Long descriptions | Truncated with an ellipsis; the card does not stretch | |
| 1.6 | Missing image | A product with no uploaded image shows the placeholder, not a broken-image icon | |
| 1.7 | Slow network (throttle to Slow 3G) | A loading indicator appears; the page does not look empty-and-finished while still loading | |

## 2. Finding a laptop

| # | Check | Expected | Result |
|---|---|---|---|
| 2.1 | Search for a laptop by name | Matching laptops appear | |
| 2.2 | Search for nonsense | A clear "no results" message — **not** a raw error, and not a silent empty page (BUG-04 means the API answers 400 here; the interface must still read as "nothing matched") | |
| 2.3 | Filter by brand | Only that brand remains; the active filter is visible | |
| 2.4 | Filter by price range | Nothing outside the range remains | |
| 2.5 | Filter by RAM / processor / storage | Facet narrows the list (note: products with no specification row are excluded — BUG-14) | |
| 2.6 | Combine two filters | Both apply together | |
| 2.7 | Clear filters | The full catalogue returns | |
| 2.8 | Sort by price ascending, then descending | Order actually reverses | |
| 2.9 | Pagination | Page 2 shows different laptops; the current page is indicated; the control disables at the last page | |
| 2.10 | Open a product | Detail page shows the description, the specification table and the price | |

## 3. Creating an account

| # | Check | Expected | Result |
|---|---|---|---|
| 3.1 | Register with valid details | Success message; you can then sign in | |
| 3.2 | Register with a taken username | A readable message naming the problem — not a raw 400 body | |
| 3.3 | Register with a taken email | Likewise | |
| 3.4 | Register with a short password | The form refuses before submitting, or the field error is shown against the field | |
| 3.5 | Register with a malformed email | Likewise | |
| 3.6 | Welcome email | A message arrives at the address used (needs SMTP configured — see [running-locally.md](../operations/running-locally.md)) | |
| 3.7 | Sign in with the wrong password | A clear failure; the form stays usable; no stack trace | |
| 3.8 | Sign in correctly | Redirected into the shop; the header shows you are signed in | |
| 3.9 | Reload the page | Still signed in | |
| 3.10 | Sign out | Header returns to the signed-out state; protected pages are no longer reachable | |

## 4. The cart

| # | Check | Expected | Result |
|---|---|---|---|
| 4.1 | Add a laptop while signed out | The interface behaves predictably — either it prompts to sign in, or it holds the item and syncs it after sign-in | |
| 4.2 | Add a laptop while signed in | The cart badge increments; a confirmation is shown | |
| 4.3 | Open the cart | The laptop, its picture, unit price, quantity and line total are all shown | |
| 4.4 | Cart total | Equals the sum of the lines on screen (BUG-07 can make the stored total drift — flag any mismatch) | |
| 4.5 | Increase quantity | Line total and cart total both update | |
| 4.6 | Decrease to zero | The line disappears | |
| 4.7 | Remove a line | It disappears and the total drops | |
| 4.8 | Add more units than are in stock | A readable refusal naming the available quantity | |
| 4.9 | Reload with items in the cart | The cart survives | |
| 4.10 | Sign out and back in | The cart is still there | |
| 4.11 | Sign in as a different customer | You see *their* cart, not the previous one | |

## 5. Checkout and payment

| # | Check | Expected | Result |
|---|---|---|---|
| 5.1 | Start checkout with an empty cart | Blocked, with a reason | |
| 5.2 | Add a delivery address | Saved and selectable | |
| 5.3 | Address form validation | Empty required fields are refused before submitting | |
| 5.4 | Order summary | Items, quantities and total match the cart | |
| 5.5 | Stripe card form | Renders; the test card `4242 4242 4242 4242` is accepted | |
| 5.6 | Declined card `4000 0000 0000 0002` | A readable decline message; **no order is created** (SEC-03 — payment success is asserted by the client, so check the order list afterwards and record what you find) | |
| 5.7 | Close the browser mid-payment, then return | No half-created order that looks paid | |
| 5.8 | Complete an order | Confirmation screen naming the order | |
| 5.9 | Cart after ordering | Empty | |
| 5.10 | Stock after ordering | The product's available quantity has dropped by what was bought | |
| 5.11 | Confirmation email | Arrives, names the order and the amount | |
| 5.12 | Order history | The order is listed with the right status and total | |
| 5.13 | Cancel an order | Status changes and the change survives a reload | |

## 6. Seller

| # | Check | Expected | Result |
|---|---|---|---|
| 6.1 | Sign in as `seller1` | The seller area is reachable | |
| 6.2 | Product list | Shows this seller's products | |
| 6.3 | Add a product | Appears in the list and in the public catalogue | |
| 6.4 | SKU | Generated automatically and shown | |
| 6.5 | Upload an image | Appears on the card and on the detail page | |
| 6.6 | Upload a file with no extension | Handled with a message, not a crash (BUG-08) | |
| 6.7 | Edit a product | Price and discount changes are reflected in the shop | |
| 6.8 | Add specifications | Appear on the detail page and drive the facets | |
| 6.9 | Delete a product | Gone from the catalogue | |
| 6.10 | Seller order list | Shows orders containing this seller's products | |
| 6.11 | Try to open an admin URL directly | Refused | |

## 7. Administrator

| # | Check | Expected | Result |
|---|---|---|---|
| 7.1 | Sign in as `admin` | The admin dashboard is reachable | |
| 7.2 | Dashboard figures | Totals look plausible against the data (BUG-16: revenue includes cancelled orders) | |
| 7.3 | Charts | Render with axes and labels; no empty canvas | |
| 7.4 | Product list | Paginated, sortable | |
| 7.5 | Category management | Create, rename and delete work | |
| 7.6 | Delete a category that has products | **Every product in it is deleted too** (BUG-13). Confirm the interface warns about this | |
| 7.7 | Order list | All orders, paginated | |
| 7.8 | Change an order's status | Reflected in the customer's order history | |
| 7.9 | Customer and seller lists | Render and paginate | |
| 7.10 | Delete a customer | Removed; the guards refuse an account that also holds another role | |

## 8. Presentation and accessibility

| # | Check | Expected | Result |
|---|---|---|---|
| 8.1 | Mobile width (375 px) | Nothing overflows horizontally; the navigation is usable | |
| 8.2 | Tablet width (768 px) | Grid reflows sensibly | |
| 8.3 | Desktop (1440 px) | No stranded whitespace or stretched images | |
| 8.4 | Keyboard only | Every control on the buying path is reachable with Tab, and focus is visible | |
| 8.5 | Text contrast | Readable, including text over the banner images | |
| 8.6 | Images | Every meaningful image has alt text | |
| 8.7 | Browser back button | Works from a product page and from checkout without breaking state | |
| 8.8 | Browser console | No uncaught errors during a full buying journey | |
| 8.9 | Second browser | Repeat sections 1, 4 and 5 in a different browser | |
| 8.10 | Language | Interface wording is consistent — no mixed-language labels | |

---

## Sign-off

| Field | |
|---|---|
| Build / commit | |
| Environment | |
| Browsers | |
| Date | |
| Tester | |
| Result | Pass / Pass with defects / Fail |
| Defects raised | |

A pass with known defects is a legitimate outcome — say which, and link the register entry.
