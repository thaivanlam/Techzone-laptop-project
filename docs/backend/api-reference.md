# API Reference

Every endpoint below is reached through the **API Gateway** (`:8080`). The
gateway strips the service prefix before forwarding:

| External prefix | Service | Forwarded as |
|---|---|---|
| `/user-manager/**` | User Service (`:8082`) | `/**` |
| `/product-manager/**` | Product Service (`:8081`) | `/**` |
| `/order-manager/**` | Order Service (`:8083`) | `/**` |

To call a service directly, drop the prefix — `/user-manager/api/auth/signin`
becomes `http://localhost:8082/api/auth/signin`.

**Access legend:** `Public` (no auth) · `USER` · `SELLER` · `ADMIN` ·
`Internal` (service-to-service).

> **Role enforcement is narrower than the path names suggest.** The gateway
> checks roles only on `/product-manager/api/admin/**`,
> `/user-manager/api/admin/**`, `/order-manager/api/admin/**` (all `ROLE_ADMIN`),
> `/product-manager/api/seller/**` (`ROLE_SELLER`) and
> `/order-manager/api/seller/**` (`ROLE_ADMIN` or `ROLE_SELLER`). Access levels
> marked below for paths outside those patterns are **convention only**; any
> authenticated user can reach them through the gateway. See
> [../architecture/security-model.md](../architecture/security-model.md#enforcement-gaps-worth-knowing).

---

## User Service — `/user-manager`

### Authentication — `AuthController`

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/user-manager/api/auth/signin` | Public | Log in; returns user info and sets the `springBootEcom` JWT cookie |
| POST | `/user-manager/api/auth/signup` | Public | Register a new user; publishes a welcome email to RabbitMQ |
| GET | `/user-manager/api/auth/username` | Public\* | Current logged-in username, read from the JWT cookie |
| GET | `/user-manager/api/auth/user` | Public\* | Current user details (id, username, roles) |
| POST | `/user-manager/api/auth/signout` | Public\* | Log out; clears the JWT cookie |
| GET | `/user-manager/api/auth/sellers` | Public\* | Paginated list of sellers (`pageNumber`) |
| GET | `/user-manager/api/auth/customers` | Public\* | Paginated list of customers (`pageNumber`) |
| DELETE | `/user-manager/api/auth/customers/{userId}` | Public\* | Delete a customer |
| DELETE | `/user-manager/api/auth/sellers/{userId}` | Public\* | Delete a seller |

\* The gateway marks all of `/user-manager/api/auth/**` as public, so these are
not role-checked despite the last four being admin-style operations. The
endpoints that need an identity validate the JWT cookie internally.

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

### Account self-service — `AccountController`

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/user-manager/api/users/password/verify` | USER | Check a candidate current password against the logged-in user's stored hash, with no side effect |
| PUT | `/user-manager/api/users/password` | USER | Change the logged-in user's password; requires the current password again and a matching confirmation, then queues a "password changed" email |

Unlike `/api/auth/**`, `/api/users/**` is **not** on the gateway's public-path
list, so a missing or expired JWT cookie is refused with a gateway-level `401`
before the request reaches the controller — the same protection
`GET /api/users/addresses` relies on. Available to every role (customer,
seller, admin); there is no admin-only variant.

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
| POST | `/product-manager/api/internal/products/{productId}/reduce-stock` | Internal | Decrement product stock (body: `quantity`) |

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
