# Known Defects — Backend

A consolidated register of defects found by reading the backend sources. Every
entry below was verified against the code, not inferred from documentation.

This document covers **defects**: things that are wrong, not things that are
merely simple. Deliberate simplifications with an accepted rationale live in
[../architecture/design-decisions.md](../architecture/design-decisions.md) and in
each service's "Design Notes & Known Trade-offs" section.

Audited: 2026-08-22, against `main`.

---

## Table of Contents

1. [How to Read This](#1-how-to-read-this)
2. [Summary](#2-summary)
3. [Critical](#3-critical)
4. [High](#4-high)
5. [Medium](#5-medium)
6. [Low and Hygiene](#6-low-and-hygiene)
7. [Fixed Since the Audit](#7-fixed-since-the-audit)
8. [Suggested Remediation Order](#8-suggested-remediation-order)
9. [Cross-References](#9-cross-references)

---

## 1. How to Read This

| Severity | Meaning |
|---|---|
| **Critical** | Exploitable by an unauthenticated or ordinary user for privilege escalation, financial loss, or data loss |
| **High** | Data corruption, silent loss of work, or authorization bypass requiring a logged-in account |
| **Medium** | Incorrect behaviour a user will hit in normal use, but recoverable |
| **Low** | Correctness or consistency problems with limited blast radius |

ID prefixes: `SEC` security, `BUG` correctness, `OPS` operational.

This is a graduation-thesis project, not a production deployment. Several
findings would be non-issues behind a private network. They are recorded anyway
because the compose file publishes every service port to the host, and because
the distinction between "not exploitable here" and "not a defect" matters when
the project is demonstrated or extended.

---

## 2. Summary

| ID | Severity | Defect | Area |
|---|---|---|---|
| [SEC-01](#sec-01--anyone-can-register-as-an-administrator) | Critical | Public signup accepts a self-selected `admin` role | user-service |
| [SEC-02](#sec-02--user-administration-endpoints-are-fully-public) | Critical | Listing and deleting users sits under a public gateway path | user-service, gateway |
| [SEC-03](#sec-03--payment-success-is-asserted-by-the-client) | Critical | No Stripe webhook; the browser declares whether it paid | order-service |
| [SEC-04](#sec-04--the-jwt-signing-secret-is-committed-to-the-repository) | Critical | Shared HMAC secret is a literal in four tracked files | gateway, config-server |
| [SEC-05](#sec-05--seller-product-endpoints-have-neither-a-role-check-nor-an-ownership-check) | High | Any logged-in user can edit or delete any product | product-service, gateway |
| [SEC-06](#sec-06--the-specification-controller-sits-outside-the-gateways-path-scheme) | High | Spec writes unchecked; spec reads wrongly require a login | product-service, gateway |
| [SEC-07](#sec-07--get-carts-returns-every-users-cart) | High | Cart contents of all users readable by any account | order-service |
| [SEC-08](#sec-08--order-status-can-be-changed-by-anyone-who-is-logged-in) | High | No ownership check on order status mutation | order-service |
| [SEC-09](#sec-09--address-update-and-delete-do-not-verify-ownership) | High | Any user can modify or delete any address by id | user-service |
| [SEC-10](#sec-10--the-internal-stock-api-is-unauthenticated-on-a-published-port) | High | Arbitrary stock decrement from the host | product-service |
| [SEC-11](#sec-11--the-notification-endpoint-can-send-arbitrary-mail) | High | Unauthenticated send from the project's Gmail account | notification-service |
| [SEC-12](#sec-12--the-eureka-registry-is-public-and-writable) | Medium | Registry enumerable and injectable through the gateway | discovery-service, gateway |
| [SEC-13](#sec-13--jwt-cookie-flags-and-the-absence-of-revocation) | Medium | `httpOnly=false`, `secure=false`, no `SameSite`, no revocation | user-service |
| [BUG-01](#bug-01--a-failed-multi-line-order-leaves-stock-permanently-decremented) | Critical | Cross-service writes are not compensated on rollback | order-service |
| [BUG-02](#bug-02--concurrent-checkout-oversells-the-last-unit) | High | Read-modify-write with no locking | product-service |
| [BUG-03](#bug-03--the-auth-cookie-outlives-the-token-by-23-hours) | High | `maxAge` 24 h vs. a 50-minute token | user-service |
| [BUG-04](#bug-04--an-empty-search-result-is-returned-as-400-bad-request) | High | "No matches" is indistinguishable from a bad request | product-service |
| [BUG-05](#bug-05--updatecategory-rebuilds-the-entity-from-the-dto) | High | Any column absent from the DTO is nulled on update | product-service |
| [BUG-06](#bug-06--a-failed-email-send-is-swallowed-and-the-message-is-lost) | High | Exception discarded, message acked, no DLQ | notification-service |
| [BUG-07](#bug-07--cart-total-drifts-away-from-the-sum-of-its-lines) | Medium | Incremental vs. full recomputation disagree | order-service |
| [BUG-08](#bug-08--image-upload-crashes-on-a-filename-without-an-extension) | Medium | `substring(-1)` / NPE surfacing as a 500 | product-service |
| [BUG-09](#bug-09--null-stock-throws-a-nullpointerexception) | Medium | Unboxing a nullable `Integer` | product-service |
| [BUG-10](#bug-10--cross-service-exceptions-surface-as-untyped-500s) | Medium | Stripe, REST, and AMQP failures bypass the error envelope | order-service |
| [BUG-11](#bug-11--publishing-to-rabbitmq-inside-the-order-transaction) | Medium | Broker outage rolls back the order but not the stock | order-service |
| [BUG-12](#bug-12--two-endpoints-answer-302-found-for-a-successful-read) | Medium | Misleading status code on a normal JSON body | product, order |
| [BUG-13](#bug-13--deleting-a-category-deletes-every-product-in-it) | Medium | `CascadeType.ALL` on a catalogue relationship | product-service |
| [BUG-14](#bug-14--specification-facets-silently-exclude-products-without-specs) | Medium | Inner join on an optional relationship | product-service |
| [BUG-15](#bug-15--the-category-filter-is-an-exact-match-written-as-a-like) | Medium | `LIKE` with no wildcards | product-service |
| [BUG-16](#bug-16--revenue-includes-cancelled-orders-and-is-returned-as-a-string) | Medium | Aggregates ignore order status | order-service |
| [BUG-17](#bug-17--seller-order-listing-pages-in-memory) | Medium | Every order loaded on every call | order-service |
| [BUG-18](#bug-18--order-status-is-an-unvalidated-free-text-string) | Medium | No enum, no state machine | order-service |
| [OPS-01](#6-low-and-hygiene) | Medium | Product images are lost on container recreation | product-service |
| [OPS-02](#6-low-and-hygiene) | Medium | No upload allow-list, replaced files never deleted | product-service |
| [OPS-03](#6-low-and-hygiene) | Low | jjwt version skew (0.12.6 vs 0.13.0) | product-service |
| [OPS-04](#6-low-and-hygiene) | Low | `double` used for money across services | product, order |
| [OPS-05](#6-low-and-hygiene) | Low | `GenerationType.AUTO` on `Product` only | product-service |
| [OPS-06](#6-low-and-hygiene) | Low | SKU has no unique constraint | product-service |
| [OPS-07](#6-low-and-hygiene) | Low | `System.out.println` of customer PII | order-service |
| [OPS-08](#6-low-and-hygiene) | Low | Notification service on Java 17 and a different base package | notification-service |
| [OPS-09](#6-low-and-hygiene) | Low | Dead code across four modules | backend |
| [OPS-10](#6-low-and-hygiene) | Low | Tests are context-load smoke tests only | backend |

---

## 3. Critical

### SEC-01 — Anyone can register as an administrator

**Location:** `backend/user-service/.../service/AuthServiceImpl.java:93-123`,
`AuthController.java:35` (`POST /api/auth/signup`)

`SignupRequest` carries a `Set<String> roles`, and `register` maps it straight
onto real roles:

```java
Set<String> strRoles = signupRequest.getRoles();
for (String role : strRoles) {
    switch (role.toLowerCase()) {
        case "admin":  roles.add(roleRepository.findByRoleName(AppRole.ROLE_ADMIN)...); break;
        case "seller": roles.add(roleRepository.findByRoleName(AppRole.ROLE_SELLER)...); break;
        default:       roles.add(userRole); break;
    }
}
```

`/user-manager/api/auth/**` is a gateway **public path**, so this needs no
authentication at all.

**Reproduction**

```bash
curl -X POST http://localhost:8080/user-manager/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"username":"x","email":"x@x.com","password":"pw","roles":["admin"]}'
```

The next sign-in returns a JWT carrying `ROLE_ADMIN`, which the gateway accepts
for every `/api/admin/**` pattern.

**Impact:** Full administrative access to the platform from an anonymous
request. This is the single most severe finding, and it makes every
`ROLE_ADMIN` gateway rule in the system decorative.

**Fix:** Ignore `roles` on the public signup path — always assign `ROLE_USER`.
Elevate through a separate admin-only endpoint, an invitation token, or a
seeded-account-only flow.

---

### SEC-02 — User administration endpoints are fully public

**Location:** `backend/user-service/.../controller/AuthController.java:21,57-85`

The controller is mapped at `/api/auth`, and these four handlers live inside it:

| Handler | Path | Gateway path |
|---|---|---|
| `getSellers` | `GET /sellers` | `/user-manager/api/auth/sellers` |
| `getCustomers` | `GET /customers` | `/user-manager/api/auth/customers` |
| `deleteCustomer` | `DELETE /customers/{userId}` | `/user-manager/api/auth/customers/{id}` |
| `deleteSeller` | `DELETE /sellers/{userId}` | `/user-manager/api/auth/sellers/{id}` |

`/user-manager/api/auth/**` is on the gateway's public-path list, and
user-service's Spring Security permits all requests, so **no** authentication or
role check runs on any of them.

**Reproduction**

```bash
curl http://localhost:8080/user-manager/api/auth/customers          # full user list
curl -X DELETE http://localhost:8080/user-manager/api/auth/customers/2
```

**Impact:** Unauthenticated enumeration of every account, and unauthenticated
deletion of any customer or seller.

**Fix:** Move these handlers to a controller mapped at `/api/admin/users/...`
so they fall under the existing `/user-manager/api/admin/**` role mapping. The
gateway rule already exists; only the path is wrong.

---

### SEC-03 — Payment success is asserted by the client

**Location:** `backend/order-service/.../controller/OrderController.java:32-38`,
`service/OrderServiceImpl.java:57-110`, `service/StripeServiceImpl.java`

The checkout is two independent calls. Order Service creates a Stripe
`PaymentIntent` and hands the browser its `clientSecret`. The browser confirms
the payment with Stripe.js, then calls back:

```
POST /order-manager/api/order/users/payments/{paymentMethod}
{ "addressId": 1, "pgName": "stripe", "pgPaymentId": "pi_...",
  "pgStatus": "succeeded", "pgResponseMessage": "ok" }
```

`placeOrder` writes those four `pg*` fields into the `payment` row and creates
the order. **Nothing verifies them against Stripe.** There is no webhook
endpoint anywhere in the service, and the `PaymentIntent` is never re-fetched.

**Reproduction:** Skip the Stripe.js step entirely and post the body above with
a fabricated `pgPaymentId`. The order is created, stock is decremented, and a
confirmation email is sent.

**Impact:** Goods can be ordered without paying.

**Fix:** Add a `POST /api/internal/stripe/webhook` endpoint that verifies
Stripe's signature header, and treat `payment_intent.succeeded` as the only
source of payment truth. Until the webhook arrives, keep the order in a
`PENDING_PAYMENT` state. As a minimum interim measure, re-fetch the
`PaymentIntent` by id server-side in `placeOrder` and check its `status` and
`amount`.

---

### SEC-04 — The JWT signing secret is committed to the repository

**Location:**
- `backend/api-gateway/src/main/resources/application.yaml` (`spring.app.jwtSecret`)
- `backend/config-server/src/main/resources/config/user-service.yml`
- `.../config/product-service.yml`
- `.../config/order-service.yml`

The same base64 literal appears in all four tracked files. It is the HMAC key
for every token the platform issues and verifies.

**Impact:** Anyone with repository access — including anyone the thesis is
shared with — can mint a token with arbitrary `userId`, `email`, and `roles`
claims that the gateway and all three business services will accept. This also
means the fix for SEC-01 does not, on its own, protect the admin role.

**Fix:** Externalize as `${JWT_SECRET}` in all four files and supply it from the
environment like `STRIPE_SECRET_KEY` and `MAIL_PASSWORD` already are. Rotate the
committed value. Longer term, RS256 with only user-service holding the private
key removes the shared-secret problem entirely — the trade-off is recorded in
[../architecture/decisions/0003-shared-hmac-jwt-secret.md](../architecture/decisions/0003-shared-hmac-jwt-secret.md).

---

### BUG-01 — A failed multi-line order leaves stock permanently decremented

**Location:** `backend/order-service/.../service/OrderServiceImpl.java:57-110`

`placeOrder` is `@Transactional`, and after saving the order it loops:

```java
cart.getCartItems().forEach(item -> {
    productServiceClient.reduceProductQuantity(item.getProductSnapshot().getProductId(),
                                               item.getQuantity());
    cartService.deleteProductFromCart(cart.getCartId(), item.getProductSnapshot().getProductId());
});
```

`reduceProductQuantity` is an HTTP call to another service with its own
database. Product Service validates stock and throws
`APIException("Insufficient product quantity")` when it is short.

If line 3 of a 5-line order fails, the local transaction rolls back the order,
the order items, and the payment — but lines 1 and 2 have **already been
decremented in Product Service**, and nothing reverses them.

**Reproduction:** Place an order where the third line exceeds available stock —
easy to arrange, because stock is validated when the item enters the cart and
never re-validated at checkout, so a cart item can go stale for days.

**Impact:** Catalogue inventory silently drifts below reality with no order to
account for the missing units. Repeated occurrences make products appear
out-of-stock permanently.

**Fix:** Two options, in increasing order of effort:
1. **Single-call reservation.** Add a batch endpoint on Product Service that
   validates and decrements all lines in one local transaction, so the operation
   is atomic on the owning side.
2. **Saga with compensation.** Track which decrements succeeded and issue
   compensating `increase-stock` calls in a `catch` block, or move the whole flow
   to an outbox + event-driven confirmation.

Either way, re-validate stock at checkout rather than trusting cart-time
validation.

---

## 4. High

### SEC-05 — Seller product endpoints have neither a role check nor an ownership check

**Location:** `backend/product-service/.../controller/ProductController.java`
(`/seller/...` handlers), `service/ProductServiceImpl.java`
(`updateProduct`, `deleteProduct`, `updateProductImage`),
`backend/api-gateway/src/main/resources/application.yaml` (`role-mappings`)

Two independent gaps compound:

1. `/product-manager/api/seller/**` matches **no** gateway role mapping. The
   gateway only requires a valid token.
2. `updateProduct`, `deleteProduct`, and `updateProductImage` never compare
   `product.sellerEmail` to `AuthUtil.loggedInEmail()`.

Each `/seller/...` handler calls the identical service method as its
`/admin/...` twin, so the `seller` path segment is naming only.

**Impact:** Any logged-in customer can create, rename, re-price, re-image, or
delete any product in the catalogue.

**Fix:** Both halves are needed.
- Add `- pattern: /product-manager/api/seller/**` with
  `roles: [ROLE_ADMIN, ROLE_SELLER]` to the gateway, mirroring the order-service
  rule that already exists.
- Add an ownership guard in the three service methods, exempting `ROLE_ADMIN`.

---

### SEC-06 — The specification controller sits outside the gateway's path scheme

**Location:** `backend/product-service/.../controller/ProductSpecificationController.java:14`

The controller is mapped at `/api/products`, which puts `admin`, `seller`, and
`public` in the **third** path segment:

| Handler | Gateway path | Matched by |
|---|---|---|
| `createOrUpdateSpecificationAdmin` | `/product-manager/api/products/admin/{id}/specifications` | nothing |
| `createOrUpdateSpecificationSeller` | `/product-manager/api/products/seller/{id}/specifications` | nothing |
| `getSpecification` | `/product-manager/api/products/public/{id}/specifications` | nothing |
| `deleteSpecification*` | `/product-manager/api/products/{admin,seller}/{id}/specifications` | nothing |

`/product-manager/api/admin/**` and `/product-manager/api/public/**` do not
match a third-segment `admin` or `public`. Two consequences, one security and
one functional:

- Spec **writes and deletes** carry no role check.
- The spec **read** is not public, so an anonymous shopper browsing a laptop
  cannot load its processor, RAM, storage, display, or GPU.

**Confirmed at runtime** (2026-08-24, seeded stack, both consequences reproduced
against the gateway on `localhost:5173`):

```
GET  /product-manager/api/products/public/1/specifications   anonymous  → 401
GET  /product-manager/api/products/public/1/specifications   any login  → 200
POST /product-manager/api/products/admin/2/specifications    ROLE_SELLER → 200
```

The last line is the missing role check: a seller successfully wrote through the
**admin** endpoint. Note that the frontend reaches it by accident — the
specification modal is passed a hard-coded `isAdmin={true}` in
`frontend/src/components/admin/products/AdminProducts.jsx`. The two bugs mask
each other, so fixing this one alone will start returning `403` to sellers until
that prop is fixed too.

**Fix:** Re-map the controller to `/api` and its methods to
`/admin/products/{productId}/specifications`,
`/seller/products/{productId}/specifications`, and
`/public/products/{productId}/specifications`. No gateway change is then needed.
Coordinate the path change with the frontend.

---

### SEC-07 — `GET /carts` returns every user's cart

**Location:** `backend/order-service/.../controller/CartController.java:34-38`,
`service/CartServiceImpl.java` (`getAllCarts`)

`cartRepository.findAll()` with no filter, exposed at
`/order-manager/api/carts`, which matches no role mapping.

**Impact:** Any logged-in customer can read what every other user has in their
cart, including product ids, quantities, and prices.

**Fix:** Move the handler under `/api/admin/carts`, or delete it — it appears to
be a debugging aid.

---

### SEC-08 — Order status can be changed by anyone who is logged in

**Location:** `backend/order-service/.../controller/OrderController.java:69-93`,
`service/OrderServiceImpl.java` (`updateOrder`)

All three status endpoints call the same method:

```java
Order order = orderRepository.findById(orderId).orElseThrow(...);
order.setOrderStatus(status);
```

There is no check that the caller owns the order (customer path) or sells
anything in it (seller path). `/order-manager/api/order/**` has no role mapping
at all, so the customer-facing variant is reachable by any authenticated user.

**Impact:** Any account can mark any order in the system as delivered,
cancelled, or anything else. Related: `DELETE /carts/{cartId}/product/{productId}`
takes `cartId` from the path rather than from the token, so one user can remove
items from another user's cart.

**Fix:** Load the order, compare `order.getEmail()` to
`AuthUtil.loggedInEmail()` on the customer path, and check that at least one
`OrderItem.productSnapshot.sellerEmail` matches on the seller path. Derive
`cartId` from the authenticated email instead of accepting it from the path.

---

### SEC-09 — Address update and delete do not verify ownership

**Location:** `backend/user-service/.../service/AddressServiceImpl.java:104-138`

```java
Address address = addressRepository.findById(addressId)
        .orElseThrow(() -> new ResourceNotFoundException("Address", "addressId", addressId));
// fields overwritten / entity deleted — no owner check
```

`/user-manager/api/addresses/**` requires a valid token but no role.

**Impact:** Any logged-in user can rewrite or delete any other user's shipping
address by guessing a sequential id. Because `Order.addressId` is a bare
reference into this table, altering an address also changes the delivery address
recorded against historical orders.

**Fix:** Compare `address.getUser().getEmail()` to `authUtil.loggedInEmail()`
and throw 403 on mismatch.

---

### SEC-10 — The internal stock API is unauthenticated on a published port

**Location:** `backend/product-service/.../controller/ProductController.java`
(`/internal/...`), `backend/docker-compose.yml` (`product-service.ports`)

`GET /api/internal/products/{id}` and
`POST /api/internal/products/{id}/reduce-stock` have no authentication of their
own — they rely on being reachable only from inside the Docker network. But
Compose publishes `8081:8081`, so they are reachable from the host:

```bash
curl -X POST http://localhost:8081/api/internal/products/1/reduce-stock \
  -H 'Content-Type: application/json' -d '{"quantity":9999}'
```

The same applies to the other business services, whose ports are published for
dev convenience.

**Impact:** Arbitrary inventory manipulation without a token.

**Fix:** Stop publishing business-service ports in the `prod` profile — only
the gateway and the frontend need host ports. For defence in depth, require a
shared internal header or mTLS on `/api/internal/**`.

---

### SEC-11 — The notification endpoint can send arbitrary mail

**Location:** `backend/notification-service/.../controller/NotificationController.java:20-27`,
`backend/docker-compose.yml` (`notification-service.ports`)

```java
@RabbitListener(queues = "${queue.notification.queue}")
@PostMapping("/sendMail")
public void sendMail(@RequestBody EmailDetails details) { ... }
```

The HTTP half has no authentication, the service has no `JwtService` or
`AuthUtil`, and there is no gateway route — but Compose publishes `8084:8084`.

**Impact:** Anything that can reach the host can send email to any recipient,
with any subject and body, **from the project's configured Gmail account**. That
is a phishing primitive and a fast route to having the account suspended.

**Fix:** Remove the `@PostMapping` — the asynchronous path is the one the
platform uses — and stop publishing port 8084.

---

### BUG-02 — Concurrent checkout oversells the last unit

**Location:** `backend/product-service/.../service/ProductServiceImpl.java`
(`reduceProductQuantity`)

```java
Product product = productRepository.findById(productId).orElseThrow(...);
if (product.getQuantity() < quantity) throw new APIException("Insufficient product quantity");
product.setQuantity(product.getQuantity() - quantity);
productRepository.save(product);
```

A read-modify-write with no `@Version` optimistic lock, no pessimistic lock, and
no `@Transactional` on the method.

**Reproduction:** Two checkouts for the last unit arriving together. Both read
`quantity = 1`, both pass the guard, both write `quantity = 0`. Two units are
sold; one existed.

**Fix:** Either add a `@Version` column to `Product` and retry on
`OptimisticLockException`, or make the decrement atomic in the database:

```java
@Modifying
@Query("UPDATE Product p SET p.quantity = p.quantity - :q " +
       "WHERE p.productId = :id AND p.quantity >= :q")
int reduceStock(@Param("id") Long id, @Param("q") int q);   // 0 rows == insufficient
```

---

### BUG-03 — The auth cookie outlives the token by 23 hours

**Location:** `backend/user-service/.../security/jwt/JwtUtils.java:51-57`,
`config/user-service.yml` (`spring.app.jwtExpirationMs`)

```java
ResponseCookie.from(jwtCookie, token)
        .path("/")
        .maxAge(24 * 60 * 60)   // 24 hours
        .httpOnly(false)
        .secure(false)
        .build();
```

The token itself expires after `jwtExpirationMs = 3_000_000` ms — **50 minutes**.

**Impact:** For roughly 23 hours after the token dies, the browser keeps sending
a cookie that the gateway rejects with 401. The SPA still believes it is logged
in, because the cookie is present. Users experience it as the app randomly
breaking until they clear cookies or sign out — a support-report shape that is
hard to diagnose from the symptom.

**Fix:** Set `maxAge` from `jwtExpirationMs` so the two agree, and have the SPA
treat a 401 as a forced sign-out. See also SEC-13 for the flags on the same
cookie.

---

### BUG-04 — An empty search result is returned as 400 Bad Request

**Location:** `backend/product-service/.../service/ProductServiceImpl.java`
(`getAllProducts`, `searchByCategory`, `searchProductByKeyword`),
`service/CategoryServiceImpl.java` (`getAllCategories`)

```java
if (products.isEmpty()) throw new APIException("No Products Exist!!!");
```

`MyGlobalExceptionHandler` maps `APIException` to **400**.

The behaviour is also inconsistent within the same class:
`getAllProductsForAdmin` and `getAllProductsForSeller` return an empty page
correctly.

**Impact:** A legitimate search that matches nothing is indistinguishable from a
malformed request. The frontend has to string-match the message to render "no
results", and any real validation error is masked.

**Fix:** Return an empty `ProductResponse` with `totalElements = 0`. Reserve
`APIException` for genuine client errors.

---

### BUG-05 — `updateCategory` rebuilds the entity from the DTO

**Location:** `backend/product-service/.../service/CategoryServiceImpl.java`

```java
Category category = modelMapper.map(categoryDTO, Category.class);   // products == null
Category savedCategory = categoryRepository.findById(categoryId).orElseThrow(...); // discarded
category.setCategoryId(categoryId);
savedCategory = categoryRepository.save(category);                  // merge of a bare object
```

The loaded entity is fetched only to trigger the 404 and then thrown away. What
is saved is a fresh detached instance carrying nothing but `categoryId` and
`categoryName`.

**Impact:** Latent rather than currently visible, because `Category` happens to
have only those two scalar columns today. The moment a column is added —
a description, a slug, a display order, an image — every category update silently
nulls it.

**Fix:** Mutate the loaded entity:

```java
Category existing = categoryRepository.findById(categoryId).orElseThrow(...);
existing.setCategoryName(categoryDTO.getCategoryName());
return modelMapper.map(categoryRepository.save(existing), CategoryDTO.class);
```

---

### BUG-06 — A failed email send is swallowed and the message is lost

**Location:** `backend/notification-service/.../service/EmailServiceImpl.java`

```java
try {
    javaMailSender.send(mailMessage);
    System.out.println("Mail Sent");
} catch (Exception e) {
    System.out.println("Mail Failed");
}
```

Because the exception is caught, the `@RabbitListener` method returns normally,
RabbitMQ acknowledges the message, and it is removed from the queue.

**Impact:** Order confirmations and welcome emails are lost permanently on any
SMTP failure — an expired app password, a Gmail rate limit, a transient network
error. There is no dead-letter queue, no retry policy on the listener container,
and no `x-dead-letter-exchange` argument on the queue.

Diagnosis is also blocked: `System.out.println` bypasses SLF4J, so the output
carries no timestamp, level, thread, or stack trace, and the exception object is
discarded. `"Mail Failed"` is the entire diagnostic record.

**Fix:** Log at ERROR with the exception, recipient, and subject, then rethrow so
the broker can requeue or dead-letter. Declare a DLQ and a bounded retry policy.

---

## 5. Medium

### BUG-07 — Cart total drifts away from the sum of its lines

**Location:** `backend/order-service/.../service/CartServiceImpl.java`

`addProductToCart` and `createOrUpdateCartWithItems` **recompute** the total from
the line items. `updateProductQuantityInCart` and `deleteProductFromCart` apply
an **incremental delta** using the current `productPrice`.

If a product's `specialPrice` changes in Product Service between two operations,
the delta subtracted differs from the amount originally added, and
`cart.total_price` diverges from the true sum. The next full recompute silently
corrects it, so the symptom is intermittent.

**Fix:** Always recompute from the line items. The cost is negligible and it
removes the class of bug.

---

### BUG-08 — Image upload crashes on a filename without an extension

**Location:** `backend/product-service/.../service/FileServiceImpl.java`

```java
String originalFileName = file.getOriginalFilename();
String fileName = randomId.concat(originalFileName.substring(originalFileName.lastIndexOf(".")));
```

`lastIndexOf(".")` returns `-1` for a file with no extension, so `substring(-1)`
throws `StringIndexOutOfBoundsException`. `getOriginalFilename()` can also return
null, giving an NPE. Neither is mapped by `MyGlobalExceptionHandler`, so both
surface as a whitelabel 500.

**Fix:** Guard the extension lookup and fall back to a default derived from the
content type. Combine with the OPS-02 allow-list.

---

### BUG-09 — Null stock throws a NullPointerException

**Location:** `backend/product-service/.../service/ProductServiceImpl.java`
(`reduceProductQuantity`)

`product.getQuantity() < quantity` unboxes a nullable `Integer`. `Product.quantity`
has no `@NotNull` and no default, so a product created without one NPEs the
internal stock call — which means a checkout fails with an untyped 500.

**Fix:** Add `@NotNull` with a default of `0` on the entity, and null-guard the
comparison.

---

### BUG-10 — Cross-service exceptions surface as untyped 500s

**Location:** `backend/order-service/.../exceptions/MyGlobalExceptionHandler.java`

The advice handles `MethodArgumentNotValidException`, `ResourceNotFoundException`,
and `APIException`. It does **not** handle:

| Exception | Raised by |
|---|---|
| `StripeException` | `createStripeClientSecret` |
| `RestClientException` | every Product Service call |
| `AmqpException` | the order-confirmation publish |
| `IOException` | image upload (product-service) |

**Impact:** Every cross-service failure reaches the browser as a Spring Boot
whitelabel 500 with no `APIResponse` envelope, so the SPA cannot distinguish a
downstream outage from a bug in its own request.

**Fix:** Add `@ExceptionHandler` methods returning `APIResponse` with 502/503 for
downstream failures and 402 for payment failures.

---

### BUG-11 — Publishing to RabbitMQ inside the order transaction

**Location:** `backend/order-service/.../service/OrderServiceImpl.java:104-108`

`notificationPublisher.sendEmailNotification(...)` is the last statement of
`placeOrder`, inside the `@Transactional` boundary and after the remote stock
decrements. If the broker is unreachable, `convertAndSend` throws and the order
rolls back — but the stock decrements do not (see BUG-01).

**Impact:** A RabbitMQ outage turns into lost inventory, not just a missing
email.

**Fix:** Publish after commit — a `TransactionSynchronization` `afterCommit`
hook, an `@TransactionalEventListener(phase = AFTER_COMMIT)`, or an outbox table.

---

### BUG-12 — Two endpoints answer 302 FOUND for a successful read

**Location:**
- `backend/order-service/.../controller/CartController.java:34-38` — `GET /api/carts`
- `backend/product-service/.../controller/ProductController.java` — `GET /api/public/products/keyword/{keyword}`

Both return `HttpStatus.FOUND` with a normal JSON body and no `Location` header.

**Impact:** 302 is a redirect. HTTP clients that follow redirects, caches, and
API tooling all mis-handle it. `fetch` and `axios` happen to expose the body, so
the SPA works by accident.

**Fix:** Return 200.

---

### BUG-13 — Deleting a category deletes every product in it

**Location:** `backend/product-service/.../model/Category.java`

```java
@OneToMany(mappedBy = "category", cascade = CascadeType.ALL)
private List<Product> products;
```

`DELETE /api/admin/categories/{id}` therefore removes every product in that
category, and each product cascades to its `ProductSpecification`.

**Impact:** A single admin click can wipe a large part of the catalogue with no
confirmation and no undo. Historical orders survive — they hold a
`ProductSnapshot` rather than a foreign key — but the catalogue loss is
irreversible without a database restore.

**Fix:** Drop `REMOVE` from the cascade and reject deletion of a non-empty
category with a clear message, or require the products to be reassigned first.

---

### BUG-14 — Specification facets silently exclude products without specs

**Location:** `backend/product-service/.../service/ProductServiceImpl.java`
(`getAllProducts`)

```java
criteriaBuilder.like(criteriaBuilder.lower(root.join("specification").get("processor")), "%" + v + "%")
```

`root.join(...)` defaults to an **inner** join, and `Product.specification` is
optional. Any `processors`, `ram`, or `storage` filter therefore drops every
product that has no specification row — including products that would otherwise
match on price, brand, or keyword.

Using all three facets also produces three separate joins to the same table.

**Fix:** Use `root.join("specification", JoinType.LEFT)` and hoist the join out
of the three lambdas so it is created once.

---

### BUG-15 — The category filter is an exact match written as a `LIKE`

**Location:** `backend/product-service/.../service/ProductServiceImpl.java`
(`getAllProducts`)

```java
criteriaBuilder.like(criteriaBuilder.lower(root.get("category").get("categoryName")),
                     category.toLowerCase());     // no % wrappers
```

Every other text filter in the method wraps the value in `%`. This one does not,
so it behaves as a case-insensitive equality test. Whether that is intended is
ambiguous from the code — but writing it as a `LIKE` states the opposite.

**Fix:** Decide which is wanted and make it explicit —
`criteriaBuilder.equal(...)` for exact matching, or add the wildcards.

---

### BUG-16 — Revenue includes cancelled orders and is returned as a string

**Location:** `backend/order-service/.../repositories/OrderRepository.java`,
`service/AnalyticsServiceImpl.java`, `payload/AnalyticsOrderResponse.java`

```java
@Query("SELECT COALESCE(SUM(o.totalAmount), 0) FROM Order o")
Double getTotalRevenue();
```

No status predicate, so cancelled and refunded orders inflate the figure. Both
`totalRevenue` and `totalOrders` are then returned as **strings**
(`String.valueOf(...)`), forcing the frontend to parse them and losing type
information in the OpenAPI document.

The same string-typing applies to `AnalyticsProductResponse.productCount`.

**Fix:** Filter by status in the query, and type the response fields as
`BigDecimal`/`Long`.

---

### BUG-17 — Seller order listing pages in memory

**Location:** `backend/order-service/.../service/OrderServiceImpl.java`
(`getAllSellerOrders`)

```java
Pageable pageDetails = PageRequest.of(pageNumber, pageSize, sortByAndOrder);  // never used
List<Order> sortedOrders = orderRepository.findAll(sortByAndOrder);           // every order
// ... filter in a stream, then subList(fromIndex, toIndex)
```

**Impact:** Every order in the database is loaded into heap on every seller page
view, along with its items. Works at demo scale, degrades linearly, and the
constructed `Pageable` makes the intent look satisfied when it is not.

**Fix:** Push it into the database:

```java
@Query("SELECT DISTINCT o FROM Order o JOIN o.orderItems i " +
       "WHERE lower(i.productSnapshot.sellerEmail) = lower(:email)")
Page<Order> findBySellerEmail(@Param("email") String email, Pageable pageable);
```

---

### BUG-18 — Order status is an unvalidated free-text string

**Location:** `backend/order-service/.../model/Order.java`,
`service/OrderServiceImpl.java` (`updateOrder`)

`orderStatus` is a `String` initialised to `"Accepted"`. `updateOrder` writes
whatever arrives in `OrderStatusUpdateDto.status` with no validation and no
allowed-transition check.

**Impact:** `"Shipped"`, `"shipped"`, and `"Shiped"` can all coexist in the same
table. The frontend matches these strings to render badges, so a typo becomes an
invisible order. Nothing prevents moving an order from `Delivered` back to
`Accepted`.

**Fix:** Introduce an `OrderStatus` enum with `@Enumerated(EnumType.STRING)` and
validate transitions in the service.

---

## 6. Low and Hygiene

| ID | Defect | Location | Fix |
|---|---|---|---|
| **OPS-01** | Product images are written to `/app/images` in the container with **no volume mount**, so every uploaded image is lost on `docker compose down` or a rebuild. `image = "default.png"` on new products must also exist on disk or the storefront shows broken images. | `backend/docker-compose.yml`, `product-service` `WebMvcConfig` | Mount a named volume at the resolved `project.image` path; move to object storage if the project is deployed. |
| **OPS-02** | Upload has no MIME or extension allow-list, and replaced images are never deleted. Files are served as static resources so they are not executed, but any authenticated user can fill the disk with arbitrary content. | `FileServiceImpl` | Allow-list `image/jpeg`, `image/png`, `image/webp`; delete the previous file on replace and on product delete. |
| **OPS-03** | jjwt is pinned to **0.12.6** in product-service but **0.13.0** in the gateway, order-service, and user-service. All four verify the same tokens. | four `pom.xml` files | Align on one version, ideally managed in a shared parent pom. |
| **OPS-04** | Money is `double` throughout — `Product.price`, `specialPrice`, `Cart.totalPrice`, `Order.totalAmount`, and `ProductSnapshot`. Binary floating-point error accumulates across order lines. | product-service, order-service | `BigDecimal` with an explicit scale. Must change in both services and the snapshot together. |
| **OPS-05** | `Product` uses `GenerationType.AUTO` while every other entity in the backend uses `IDENTITY`. On MySQL with Hibernate 6 this allocates ids from a sequence table rather than an auto-increment column. | `Product.java` | Switch to `IDENTITY` for consistency; requires a schema migration. |
| **OPS-06** | SKU is generated with a 6-digit random suffix and has **no unique constraint**, so a collision is possible and would go undetected. The model segment takes the first alphanumeric word, which for `Dell XPS 13` yields `DELL` — duplicating the brand segment. | `SKUGenerator`, `Product.java` | Add a unique constraint and retry on violation; skip the brand word when picking the model segment. |
| **OPS-07** | `System.out.println` of request DTOs in `orderProducts` and `createStripeClientSecret` writes the customer's email and full postal address to stdout, where it lands in container logs. | `OrderController.java:34,42` | Remove, or convert to `log.debug` without the PII fields. |
| **OPS-08** | notification-service targets **Java 17** (pom and Dockerfile) and uses the base package `vn.vti.dtn2504.notificationservice` while every other module is Java 21 under `com.ecommerce.*`. | `notification-service` | Align both. Harmless at runtime, but it breaks shared tooling and parent-pom conventions. |
| **OPS-09** | Dead code: `EmptyArrayException` (both services), `CartRepository.findCartsByProductId`, `CartService.updateProductInCarts`, `PaymentRepository`, order-service's `WebMvcConfig` image handler, `OrderRequestDTO.paymentMethod` (ignored — the controller uses the path variable), `SendNotificationRequest`, `ProductRepository.findByCategoryOrderByPriceAsc`, the non-paginated `findByProductNameLikeIgnoreCase`, `CategoryServiceImpl.nextId`. | backend | Delete. |
| **OPS-10** | Every module's test suite is a single Spring context-load smoke test. Login, signup, JWT validation, cart mutation, order placement, stock reduction, search specifications, and address CRUD are untested. | backend | At minimum, add regression tests for the defects fixed from this register — they are the cases most likely to reappear. |
| **OPS-11** | `SwaggerConfig` in product-service and order-service declares a **bearer** security scheme, but both services authenticate by cookie. Swagger's Authorize button produces requests that do not work. | `SwaggerConfig` | Declare an `apiKey` scheme with `in: cookie` and name `springBootEcom`. |

### SEC-12 — The Eureka registry is public and writable

`/eureka/**` is on the gateway's public-path list and Eureka itself has no
security, so anyone who can reach port 8080 or 8761 can enumerate every service
instance and its IP. The Eureka REST API also accepts writes:
`POST /eureka/apps/{app}` can register a fake instance that the gateway will
then load-balance real user traffic to.

**Fix:** Remove the two `eureka-*` gateway routes, or place them behind a role
mapping. Do not publish 8761 outside the Docker network.

### SEC-13 — JWT cookie flags and the absence of revocation

`JwtUtils.generateJwtCookie` sets `httpOnly(false)` and `secure(false)`, and no
`SameSite` attribute. So the token is readable by any JavaScript on the page
(an XSS becomes account takeover), and it is transmitted over plain HTTP.
`getCleanJwtCookie` clears the cookie on signout, but the token itself remains
valid until it expires — there is no blacklist and no refresh rotation.

**Fix:** `httpOnly(true)`, `secure(true)` behind TLS, `sameSite("Strict")`, and
a `/api/auth/me` endpoint so the SPA can read user info without reading the
token. Add short-lived access tokens with refresh rotation if revocation
matters. The trade-off as originally accepted is recorded in
[../architecture/decisions/0004-cookie-based-jwt.md](../architecture/decisions/0004-cookie-based-jwt.md).

---

## 7. Fixed Since the Audit

| Defect | Status |
|---|---|
| `backend/docker-compose.yml` declared `depends_on: api-gateway: condition: service_healthy` on five services while `api-gateway` had no healthcheck, so the stack could not start as written. | **Fixed.** The gateway now carries a TCP healthcheck (`timeout 3 bash -c '</dev/tcp/127.0.0.1/8080'`) with a 30 s start period, chosen because the gateway has no actuator dependency. |

---

## 8. Suggested Remediation Order

Ordered by risk removed per unit of effort, not by severity alone.

**1 — Close the authentication holes (small changes, largest risk reduction)**
- SEC-01: ignore `roles` on public signup — a few lines.
- SEC-02: move the four user-admin handlers under `/api/admin/**` — the gateway
  rule already exists.
- SEC-04: replace the four hardcoded secrets with `${JWT_SECRET}` and rotate.
- SEC-05 (gateway half): add the `/product-manager/api/seller/**` role mapping.

**2 — Stop publishing internal ports**
- SEC-10, SEC-11, SEC-12: remove host port bindings for product, order, user,
  notification, and Eureka in the `prod` profile. One file, several findings.

**3 — Add the ownership checks**
- SEC-05 (service half), SEC-07, SEC-08, SEC-09. A consistent guard helper per
  service; mechanical once the first is written.

**4 — Make money and stock correct**
- BUG-02 (atomic decrement), then BUG-01 (batch reservation or compensation).
  BUG-02 first, because the atomic-decrement endpoint is a building block for
  the batch call.
- SEC-03: the Stripe webhook. Larger, and it changes the checkout state machine,
  so schedule it deliberately.

**5 — Fix the visible correctness bugs**
- BUG-03, BUG-04, BUG-06, BUG-12, BUG-13. Each is small and each is
  user-visible.

**6 — Structural clean-up**
- BUG-05, BUG-14, BUG-17, BUG-18, and the OPS items, as the surrounding code is
  touched.

Add a regression test alongside each fix — per OPS-10, there is currently
nothing that would catch a reintroduction.

---

## 9. Cross-References

| Topic | Document |
|---|---|
| Per-service detail and trade-offs | [services/api-gateway.md](services/api-gateway.md) · [services/config-server.md](services/config-server.md) · [services/discovery-service.md](services/discovery-service.md) · [services/user-service.md](services/user-service.md) · [services/product-service.md](services/product-service.md) · [services/order-service.md](services/order-service.md) · [services/notification-service.md](services/notification-service.md) |
| JWT model, role hierarchy, enforcement gaps | [../architecture/security-model.md](../architecture/security-model.md) |
| Accepted trade-offs and their rationale | [../architecture/design-decisions.md](../architecture/design-decisions.md) |
| Platform limitations and roadmap | [../architecture/system-overview.md](../architecture/system-overview.md#known-limitations) |
| Endpoint listing with access levels | [api-reference.md](api-reference.md) |
| Compose topology and port bindings | [../operations/docker-setup.md](../operations/docker-setup.md) |
