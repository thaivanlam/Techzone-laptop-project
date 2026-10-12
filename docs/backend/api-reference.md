# API Reference

Every endpoint below is reached through the **API Gateway** (`:8080`). The
gateway strips the service prefix before forwarding:

| External prefix | Service | Forwarded as |
|---|---|---|
| `/user-manager/**` | User Service (`:8082`) | `/**` |
| `/product-manager/**` | Product Service (`:8081`) | `/**` |
| `/order-manager/**` | Order Service (`:8083`) | `/**` |

To call a service directly, drop the prefix — `/user-manager/api/auth/user`
becomes `http://localhost:8082/api/auth/user`. Each service verifies the token
itself, so a direct call needs the same bearer token as one through the gateway.

**Authentication.** Every non-public endpoint expects
`Authorization: Bearer <access token>`, where the token is issued by Keycloak
(realm `techzone`) — see
[../architecture/security-model.md](../architecture/security-model.md). There is
no sign-in, sign-up or sign-out endpoint in the platform; those are Keycloak's
(ADR-0012). For a quick token from the command line, use the `techzone-tests`
client in the development realm:

```bash
curl -s -X POST http://localhost:8090/realms/techzone/protocol/openid-connect/token \
  -d client_id=techzone-tests -d client_secret="$KEYCLOAK_TESTS_CLIENT_SECRET" \
  -d grant_type=password -d username=admin@example.com -d password=adminPass
```

**Access legend:** `Public` (no auth) · `USER` · `SELLER` · `ADMIN` ·
`Internal` (service-to-service).

> **Role enforcement is narrower than the path names suggest.** The gateway
> checks roles only on `/product-manager/api/admin/**`,
> `/user-manager/api/admin/**`, `/order-manager/api/admin/**` (all `ROLE_ADMIN`),
> `/product-manager/api/seller/**` (`ROLE_SELLER`) and
> `/order-manager/api/seller/**` (`ROLE_ADMIN` or `ROLE_SELLER`). Access levels
> marked below for paths outside those patterns are **convention only**; any
> authenticated user can reach them through the gateway. See
> [../architecture/security-model.md](../architecture/security-model.md#what-this-model-does-not-do).

---

## User Service — `/user-manager`

### Profile — `AuthController`

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/user-manager/api/auth/username` | Token\* | The caller's `preferred_username` (an email address — the realm is email-as-username) |
| GET | `/user-manager/api/auth/user` | Token\* | The caller's profile: `id`, `username`, `email`, `roles`. Creates the local profile row on first call for an account user-service has not seen (just-in-time provisioning). No `jwtToken` field. |

\* `/user-manager/api/auth/**` is still on the gateway's public list, so these are
forwarded without a token check at the edge; the handler reads the caller's token
and answers 401 without one.

**Removed on 2026-09-12 (ADR-0012):** `POST /api/auth/signin`,
`POST /api/auth/signup` and `POST /api/auth/signout` — they now answer 404.
Signing in, registering and signing out happen on Keycloak. The four
administrative handlers that used to live here moved to `AdminUserController`
below, which is the fix for SEC-02.

### User administration — `AdminUserController`

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/user-manager/api/admin/users` | ADMIN | Create an account in Keycloak **and** its local profile row. Body: `email`, `firstName`, `lastName`, `role`. `role` must be `ROLE_SELLER` or `ROLE_USER` — `ROLE_ADMIN` is refused with 400 whoever asks. The response message carries a one-time temporary password that Keycloak forces the holder to change at first login. |
| GET | `/user-manager/api/admin/users/sellers` | ADMIN | Paginated list of sellers (`pageNumber`) |
| GET | `/user-manager/api/admin/users/customers` | ADMIN | Paginated list of customers (`pageNumber`) |
| DELETE | `/user-manager/api/admin/users/customers/{userId}` | ADMIN | Delete a customer — the Keycloak account and the profile row |
| DELETE | `/user-manager/api/admin/users/sellers/{userId}` | ADMIN | Delete a seller — refused if the account also holds `ROLE_ADMIN` |

These paths are enforced twice: by the gateway's `/user-manager/api/admin/**`
rule, and by user-service's own `SecurityConfig`. Promoting an administrator is
not an API operation at all — it is done in the Keycloak admin console.

### Addresses — `AddressController`

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/user-manager/api/addresses` | USER | Create an address for the logged-in user |
| GET | `/user-manager/api/addresses` | USER | List all addresses in the database |
| GET | `/user-manager/api/addresses/{addressId}` | USER | Get an address by ID |
| GET | `/user-manager/api/users/addresses` | USER | Addresses of the logged-in user only |
| PUT | `/user-manager/api/addresses/{addressId}` | USER | Update an address |
| DELETE | `/user-manager/api/addresses/{addressId}` | USER | Delete an address; returns the deleted DTO |

Update and delete do not verify ownership — any authenticated user can modify
any address by ID.

### Account self-service

**Removed on 2026-09-12 (ADR-0012).** `POST /api/users/password/verify` and
`PUT /api/users/password` are gone with the `password` column they compared
against. Passwords are changed in Keycloak's account console,
`http://localhost:8090/realms/techzone/account`, which the SPA's
"Change Password" dialog links to.

---

## Product Service — `/product-manager`

### Products — `ProductController`

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/product-manager/api/public/products` | Public | List/search products with filters (`keyword`, `category`, `minPrice`, `maxPrice`, `brands`, `processors`, `ram`, `storage`, plus pagination and sorting) |
| GET | `/product-manager/api/public/products/brands` | Public | List all distinct brands |
| GET | `/product-manager/api/public/categories/{categoryId}/products` | Public | Products in a category (paginated) |
| GET | `/product-manager/api/public/products/keyword/{keyword}` | Public | Search products by keyword |
| POST | `/product-manager/api/admin/categories/{categoryId}/product` | ADMIN | Add a product to a category |
| POST | `/product-manager/api/seller/categories/{categoryId}/product` | SELLER | Add a product to a category (seller) |
| PUT | `/product-manager/api/admin/products/{productId}` | ADMIN | Update a product |
| PUT | `/product-manager/api/seller/products/{productId}` | SELLER | Update a product (seller) |
| DELETE | `/product-manager/api/admin/products/{productId}` | ADMIN | Delete a product |
| DELETE | `/product-manager/api/seller/products/{productId}` | SELLER | Delete a product (seller) |
| PUT | `/product-manager/api/admin/products/{productId}/image` | ADMIN | Upload/replace the product image (`image` multipart) |
| PUT | `/product-manager/api/seller/products/{productId}/image` | SELLER | Upload/replace the product image (seller) |
| GET | `/product-manager/api/admin/products` | ADMIN | List all products, admin view (paginated) |
| GET | `/product-manager/api/seller/products` | SELLER | List products, seller view (paginated) |
| GET | `/product-manager/api/admin/app/analytics` | ADMIN | Product analytics data |
| GET | `/product-manager/api/internal/products/{productId}` | Internal | Get a product — used by Order Service for stock validation |
| POST | `/product-manager/api/internal/products/{productId}/reduce-stock` | Internal | Decrement one product's stock (body: `quantity`). No longer called by checkout |
| POST | `/product-manager/api/internal/products/reduce-stock` | Internal | Reserve stock for a whole order atomically — all lines or none (body: `items: [{productId, quantity}]`). `400` if any line is short |
| POST | `/product-manager/api/internal/products/restore-stock` | Internal | Give reserved stock back after a failed checkout (same body) |

### Categories — `CategoryController`

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/product-manager/api/public/categories` | Public | List categories (paginated) |
| POST | `/product-manager/api/admin/categories` | ADMIN | Create a category |
| PUT | `/product-manager/api/admin/categories/{categoryId}` | ADMIN | Update a category |
| DELETE | `/product-manager/api/admin/categories/{categoryId}` | ADMIN | Delete a category |

### Specifications — `ProductSpecificationController`

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/product-manager/api/public/products/{productId}/specifications` | Public | Get a product's technical specifications |
| POST | `/product-manager/api/admin/products/{productId}/specifications` | ADMIN | Create/update specifications |
| POST | `/product-manager/api/seller/products/{productId}/specifications` | SELLER | Create/update specifications (seller) |
| DELETE | `/product-manager/api/admin/products/{productId}/specifications` | ADMIN | Delete specifications |
| DELETE | `/product-manager/api/seller/products/{productId}/specifications` | SELLER | Delete specifications (seller) |

---

## Order Service — `/order-manager`

### Cart — `CartController`

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/order-manager/api/cart/create` | USER | Create/replace the cart from a list of items |
| POST | `/order-manager/api/carts/products/{productId}/quantity/{quantity}` | USER | Add a product to the cart |
| GET | `/order-manager/api/carts` | USER | List all carts |
| GET | `/order-manager/api/carts/users/cart` | USER | Get the logged-in user's cart |
| PUT | `/order-manager/api/cart/products/{productId}/quantity/{operation}` | USER | Increment/decrement a cart item (`operation` = `delete` to decrement, anything else to increment) |
| DELETE | `/order-manager/api/carts/{cartId}/product/{productId}` | USER | Remove a product from the cart |

### Orders and Payments — `OrderController`

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/order-manager/api/order/users/payments/{paymentMethod}` | USER | Place an order with the given payment method |
| POST | `/order-manager/api/order/stripe-client-secret` | USER | Create a Stripe PaymentIntent and return its `clientSecret` |
| GET | `/order-manager/api/order/users/orders` | USER | The logged-in user's orders (paginated) |
| PUT | `/order-manager/api/order/users/orders/{orderId}/status` | USER | Update order status as the customer, e.g. cancel |
| GET | `/order-manager/api/admin/orders` | ADMIN | All orders (paginated) |
| GET | `/order-manager/api/admin/app/analytics` | ADMIN | Order analytics data |
| PUT | `/order-manager/api/admin/orders/{orderId}/status` | ADMIN | Update order status |
| GET | `/order-manager/api/seller/orders` | SELLER | The seller's orders (paginated) |
| PUT | `/order-manager/api/seller/orders/{orderId}/status` | SELLER | Update order status as the seller |

`getAllSellerOrders` filters in memory after loading all orders — see
[../architecture/system-overview.md](../architecture/system-overview.md#known-limitations).

---

## Notification Service — `:8084`, not exposed through the gateway

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/api/v1/notifications/sendMail` | Internal | Send a transactional email (`NotificationController`). The same handler is also a RabbitMQ `@RabbitListener`; in normal operation it is triggered asynchronously by registration and order-confirmation messages, not called directly. |
