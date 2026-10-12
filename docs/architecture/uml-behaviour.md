# UML — Behaviour Diagrams

How the platform behaves over time: four request journeys, the order lifecycle,
and the search flow.

Part of the diagram set indexed by [uml-diagrams.md](uml-diagrams.md) ·
Siblings: [uml-use-cases.md](uml-use-cases.md) ·
[uml-structure.md](uml-structure.md)

---

## Table of Contents

1. [Sequence — Registration](#1-sequence--registration)
2. [Sequence — Sign In and an Authenticated Call](#2-sequence--sign-in-and-an-authenticated-call)
3. [Sequence — Add to Cart](#3-sequence--add-to-cart)
4. [Sequence — Checkout and Payment](#4-sequence--checkout-and-payment)
5. [State Machine — Order](#5-state-machine--order)
6. [Activity — Faceted Product Search](#6-activity--faceted-product-search)

---

## 1. Sequence — Registration

Source: Keycloak's registration page; `AuthUtil.loggedInUser()` for the profile row.
Since ADR-0012 (2026-09-12) the platform takes no part in registration itself.

```mermaid
sequenceDiagram
    autonumber
    actor V as Visitor
    participant SPA as React SPA
    participant KC as Keycloak (realm techzone)
    participant GW as API Gateway
    participant US as User Service
    participant DB as MySQL (ecommerce)

    V->>SPA: "Sign up"
    SPA->>KC: redirect — keycloak.register(), PKCE S256
    V->>KC: email + password on Keycloak's page
    KC->>KC: password policy, duplicate-email check
    KC->>KC: create account, assign default role → ROLE_USER
    KC-->>SPA: redirect back with an authorization code
    SPA->>KC: code + code_verifier
    KC-->>SPA: access token (RS256) + refresh token
    SPA->>GW: GET /user-manager/api/auth/user, Bearer token
    GW->>US: forward
    US->>DB: findByEmail — not found
    US->>DB: INSERT profile row (just-in-time)
    US-->>SPA: 200 id, username, email, roles
```

There is no field anywhere in this flow that could ask for a role. The account
gets the realm's default role, `ROLE_USER` — which is how `SEC-01` was closed.
An administrator creates sellers separately, through `POST /api/admin/users`,
which writes the Keycloak account and the profile row in one operation and
publishes the welcome email.

---

## 2. Sequence — Sign In and an Authenticated Call

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant SPA as React SPA
    participant KC as Keycloak
    participant GW as API Gateway
    participant SVC as Any business service

    C->>SPA: "Sign in"
    SPA->>KC: redirect, code_challenge (S256)
    C->>KC: credentials — entered on Keycloak, never in the SPA
    KC-->>SPA: authorization code
    SPA->>KC: code + code_verifier
    KC-->>SPA: access token (RS256, 5 min) + rotating refresh token
    Note over SPA: keycloak-js keeps tokens in memory<br/>auth slice seeded from claims

    C->>SPA: any protected action
    SPA->>SPA: updateToken(30) if close to expiry
    SPA->>GW: request + Authorization: Bearer token
    GW->>GW: public path? no
    GW->>GW: verify signature against cached JWKS, iss, exp<br/>read realm_access.roles
    alt role rule matches and role missing
        GW-->>SPA: 403 {"error":"Insufficient permissions"}
    else allowed
        GW->>SVC: forward, prefix stripped, header kept
        SVC->>SVC: resource server verifies the token again<br/>AuthUtil: email claim = identity
        SVC-->>SPA: 200 payload
    end
```

The token is verified **twice** — at the gateway for access, in the service as a
resource server of its own — and neither contacts Keycloak on the way: both use
the cached public keys. A forged or expired token is a clean `401` at whichever
hop sees it first (`BUG-19`, where a forged signature produced a `500`, went with
the hand-written validators).

---

## 3. Sequence — Add to Cart

Source: `CartServiceImpl.addProductToCart`, `ProductServiceClient`.

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant SPA as React SPA
    participant GW as API Gateway
    participant OS as Order Service
    participant PS as Product Service
    participant DB as MySQL (ecommerce_order)

    C->>SPA: "Add to cart", quantity n
    SPA->>GW: POST /order-manager/api/carts/products/{id}/quantity/{n}
    GW->>OS: forward with cookie
    OS->>OS: AuthUtil → buyer email
    OS->>DB: find cart by email
    alt no cart yet
        OS->>DB: INSERT cart
    end
    OS->>PS: GET /api/internal/products/{id}
    PS-->>OS: ProductDTO (quantity, specialPrice, …)
    OS->>OS: existing line quantity + n ≤ stock?
    alt over stock or out of stock
        OS-->>SPA: 400 with the reason
    else within stock
        OS->>DB: INSERT or UPDATE cart_item<br/>copy ProductSnapshot
        OS->>DB: UPDATE cart.total_price
        OS-->>SPA: 201 CartDTO
    end
```

Every cart mutation costs one remote call per product touched — the N+1 pattern
recorded in
[../backend/services/order-service.md](../backend/services/order-service.md#7-n1-remote-calls-on-cart-operations).

Two defects live in the branch at step 10. Two simultaneous adds of the same
product both find no existing line and both insert one; with no unique
constraint on `cart_item (cart_id, product_id)` the cart is then permanently
unreadable (`BUG-21`). And a customer who has never had a cart at all gets a
`500` from the read path rather than an empty cart (`BUG-20`).

---

## 4. Sequence — Checkout and Payment

Source: `OrderController`, `OrderServiceImpl.placeOrder`, `StripeService`, and
`frontend/src/components/checkout/`.

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant SPA as React SPA
    participant GW as API Gateway
    participant OS as Order Service
    participant ST as Stripe
    participant PS as Product Service
    participant DB as MySQL (ecommerce_order)
    participant MQ as RabbitMQ
    participant NS as Notification Service

    C->>SPA: choose address, choose "Stripe"
    SPA->>GW: POST /order-manager/api/order/stripe-client-secret
    GW->>OS: forward
    OS->>ST: create PaymentIntent(amount, currency)
    ST-->>OS: clientSecret
    OS-->>SPA: clientSecret
    SPA->>ST: confirm card payment (Stripe Elements, in-browser)
    ST-->>SPA: succeeded + paymentIntent id
    SPA->>GW: POST /order-manager/api/order/users/payments/stripe<br/>{addressId, pgPaymentId, pgStatus, …}
    GW->>OS: forward
    OS->>DB: load cart by email
    alt cart empty
        OS-->>SPA: 400 "Cart is empty"
    else
        OS->>PS: POST /api/internal/products/reduce-stock<br/>{items: every cart line}
        alt a line is short of stock
            PS-->>OS: 400, no line taken
            OS-->>SPA: error, nothing written
        else
            PS-->>OS: 202 accepted, every line taken
            OS->>DB: INSERT customer_order + payment
            OS->>DB: INSERT order_item with snapshot, per line
            OS->>DB: DELETE cart lines
            OS->>MQ: publish order confirmation
            opt any step after the reservation fails
                OS->>PS: POST /api/internal/products/restore-stock<br/>{items: the same lines}
                OS-->>SPA: error, transaction rolled back
            end
            OS-->>SPA: 201 OrderDTO
            MQ->>NS: deliver → confirmation email
        end
    end
```

One weakness is visible in the arrows rather than in the code. The payment
outcome enters the system at step 9 **from the browser**, so the server records
what the client claims (`SEC-03`).

The stock arrows used to be a second one: a per-line loop with no compensating
action, so a line that failed left the preceding lines' stock taken (`BUG-01`).
Since 2026-10-12 the reservation is one all-or-nothing call and the `opt` block
gives it back. No transaction spans the two databases, so this is compensation —
if Order Service dies between the reservation and its commit, nothing runs the
`opt` block.

The single reservation call also removed the oversell race from checkout: the
stock check and the decrement are one SQL statement, so two checkouts cannot
both read the same figure (`BUG-02`, which survives only in the unused
single-line endpoint).

---

## 5. State Machine — Order

The statuses the UI offers. The backend stores whatever string it is given
(`BUG-18`), so this is the *intended* machine, not an enforced one.

```mermaid
stateDiagram-v2
    [*] --> Accepted : placeOrder()
    Accepted --> Pending : seller/admin
    Accepted --> Processing : seller/admin
    Pending --> Processing : seller/admin
    Processing --> Shipped : seller/admin
    Shipped --> Delivered : seller/admin
    Accepted --> Cancelled : customer
    Pending --> Cancelled : customer
    Processing --> Cancelled : admin
    Delivered --> [*]
    Cancelled --> [*]

    note right of Accepted
        The only status the system
        sets by itself, at placement
    end note
    note right of Cancelled
        Stock is NOT returned
        on cancellation
    end note
```

Two gaps worth stating plainly: no transition returns stock to the catalogue, so
a cancelled order's units stay consumed; and nothing prevents `Delivered →
Pending`, or any other reversal, because there is no transition table anywhere —
the sets in `UpdateOrderForm.jsx` and `CustomerOrders.jsx` are dropdown
contents, not rules.

Making this machine real means a `CHECK` constraint or an enum on
`customer_order.order_status` plus a transition guard in
`OrderServiceImpl.updateOrder` — see
[data-model.md](data-model.md#7-constraints-indexes-and-types).

---

## 6. Activity — Faceted Product Search

Source: `useProductFilter.js`, `ProductServiceImpl.searchProducts`, and the
`Specification<Product>` builder.

```mermaid
flowchart TD
    A["Visitor changes a filter"] --> B{"keyword?"}
    B -->|yes| C["debounce 700 ms"]
    B -->|no| D
    C --> D["write filters into URL query params"]
    D --> E["dispatch fetchProducts thunk"]
    E --> F["GET /product-manager/api/public/products"]
    F --> G["build Specification&lt;Product&gt;"]
    G --> H{"which params present?"}
    H --> I["keyword → productName LIKE %kw%"]
    H --> J["category → categoryName LIKE :cat"]
    H --> K["minPrice/maxPrice → specialPrice range"]
    H --> L["brands → brand IN (…)"]
    H --> M["processors / ram / storage → join specification"]
    I & J & K & L & M --> N["apply Pageable: page, size 6, sort"]
    N --> O{"any rows?"}
    O -->|yes| P["200 ProductResponse + page metadata"]
    O -->|no| Q["400 APIException — BUG-04"]
    P --> R["Redux store → grid re-renders"]
    Q --> S["error toast — reads as a failure"]
```

The specification joins at step M are inner joins, which is why a product with
no specification row disappears from any technical facet (`BUG-14`). The
category predicate at step J is a `LIKE` with no wildcards, which makes it an
exact match with the cost of a pattern scan (`BUG-15`). And the branch at step O
turns the ordinary case of "nothing matched" into an error (`BUG-04`) — the one
defect on this path that every visitor eventually sees.
