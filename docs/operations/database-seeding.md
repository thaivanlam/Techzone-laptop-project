# Database Initialisation and Seeding

How the MySQL container gets its databases, and how a fresh stack ends up with a
browsable catalogue instead of an empty shop.

For the startup procedure see [running-locally.md](running-locally.md); for the
container topology see [docker-setup.md](docker-setup.md).

---

## Two phases, because the schema is Hibernate's

Every service uses `spring.jpa.hibernate.ddl-auto: update`
([`user-service.yml`](../../backend/config-server/src/main/resources/config/user-service.yml),
[`product-service.yml`](../../backend/config-server/src/main/resources/config/product-service.yml),
[`order-service.yml`](../../backend/config-server/src/main/resources/config/order-service.yml)),
so **tables are created by Spring at boot, not by SQL**.

That single fact decides where each piece of initialisation can live. MySQL runs
the scripts in `/docker-entrypoint-initdb.d` exactly once — when the data
directory is first created, *before any application container starts*. At that
moment no table exists, so a script there can create databases but cannot insert
a single row.

| Phase | Where | When | What it may contain |
|---|---|---|---|
| **1. Databases** | [`backend/init-db/`](../../backend/init-db) → `/docker-entrypoint-initdb.d` | Once, on a fresh `mysql_data` volume, before any service | `CREATE DATABASE` only |
| **2. Rows** | [`backend/seed-db/`](../../backend/seed-db) → the `db-seed` container | After product-service has created its tables | `INSERT` |

```
docker compose up
      │
      ├─▶ mysql starts ──▶ /docker-entrypoint-initdb.d/01-create-databases.sql
      │                      creates ecommerce, ecommerce_product, ecommerce_order
      │
      ├─▶ product-service boots ──▶ Hibernate CREATEs product, category, …
      │
      └─▶ db-seed  ──── polls information_schema until those tables appear
                   ──── skips if the catalogue is non-empty
                   ──── applies catalogue.sql
```

Both folders live under `backend/`, not the repo root. Compose resolves relative
paths in an `include`d file against *that file's* directory, so `./init-db` and
`./seed-db` work identically whether you start from the root
`docker-compose.yml` or from `backend/docker-compose.yml`.

---

## Phase 1 — the databases

[`backend/init-db/01-create-databases.sql`](../../backend/init-db/01-create-databases.sql)
declares the three logical databases with an explicit charset:

| Database | Owner service |
|---|---|
| `ecommerce` | user-service — users, roles, addresses |
| `ecommerce_product` | product-service — catalogue, specifications |
| `ecommerce_order` | order-service — carts, orders, payments |

All three are `utf8mb4 / utf8mb4_unicode_ci`.

The `mysql` service deliberately sets **no `MYSQL_DATABASE`**. That variable
creates `ecommerce` before the init scripts run, using the server default
collation (`utf8mb4_0900_ai_ci`), which turns the `CREATE DATABASE IF NOT EXISTS`
into a no-op and leaves the three schemas on inconsistent collations. Letting the
script own all three keeps them uniform.

The `createDatabaseIfNotExist=true` on each JDBC URL stays. It is now redundant
under Docker, but it is what lets the `dev` profile work against a plain local
mysqld with no init scripts at all.

---

## Phase 2 — the demo catalogue

Opt-in through its own Compose profile, so it never runs unasked:

```bash
COMPOSE_PROFILES=prod,seed docker compose up -d
docker compose logs db-seed
```

[`backend/seed-db/run-seed.sh`](../../backend/seed-db/run-seed.sh) does four
things:

1. **Waits** for `product`, `category` and `product_specifications` to exist in
   `ecommerce_product`, polling `information_schema` every 5s for up to
   `WAIT_TIMEOUT` (default 300s), then fails with a pointer to
   `docker compose logs product-service`.
2. **Skips** if `product` already has rows — logging
   `catalogue already holds N product(s)`. This is what makes re-running the
   profile harmless, and it means the seed never competes with data entered
   through the UI.
3. **Resolves the seller.** All schemas share one MySQL instance, so it reads
   `seller1`'s generated id out of `ecommerce.user` rather than hard-coding it,
   and stamps it on every product. The demo catalogue is therefore manageable
   from the seller account. If user-service has not seeded yet it warns and
   leaves `seller_id` NULL.
4. **Applies** [`catalogue.sql`](../../backend/seed-db/catalogue.sql), then bumps
   the id generator (below).

`db-seed` depends only on `mysql` being healthy — not on product-service. That
service has no healthcheck, an open port would not prove its tables exist, and a
`depends_on` pointing into the `prod` profile would break when `seed` is enabled
on its own. Polling for the tables is the accurate signal.

### What gets seeded

14 laptops across 4 categories — Gaming, Ultrabooks, Business, Creator — from
ASUS, Acer, Apple, Dell, HP, Lenovo and MSI. Each has a `product_specifications`
row (processor, RAM, storage, display, graphics), because those are the fields
the faceted search filters on. Prices are USD, matching the SPA's
`Intl.NumberFormat("en-US", "USD")` and the `usd` currency Stripe is charged in.

`image` holds a real photograph per product — `seed/<slug>.jpg`, a path relative
to the directory product-service serves at `/images/**`. The files live in
[`backend/product-service/images/seed/`](../../backend/product-service/images/seed)
and are copied into that service's container image by its `Dockerfile`, so they
are present on a cold stack without any upload step and survive a
`docker compose down`. `ProductServiceImpl.constructImageUrl` prefixes
`IMAGE_BASE_URL`, so the SPA receives, for example:

```
http://localhost:5173/product-manager/images/seed/dell-xps-13-plus.jpg
```

They are Creative Commons and public-domain photographs from Wikimedia Commons,
downscaled to 900px wide (1.7MB for all fourteen). Where Commons has no picture
of the exact model, the closest machine of the same make and class stands in.
Author and licence for each file are recorded in
[`images/seed/CREDITS.md`](../../backend/product-service/images/seed/CREDITS.md),
which must travel with the files — the CC BY and CC BY-SA terms require it.

A product **created through the API** still gets `default.png`, which no file
backs; that is [OPS-01](../backend/known-defects.md), and is unchanged here.

`special_price` is a stored column rather than a derived one, so the seed
computes `price * (1 - discount/100)` per row, the same way the service does.

### The `product_seq` gotcha

`Product.productId` uses `GenerationType.AUTO`. MySQL has no sequences, so
Hibernate 6 falls back to a **table generator**: a one-column table `product_seq`
holding `next_val`. The `product_id` column therefore has **no `AUTO_INCREMENT`**
of its own, and seeded rows must carry explicit ids.

Which means the seeder has to move the generator past them:

```sql
UPDATE product_seq SET next_val = 1000 WHERE next_val < 1000;
```

Without it, the next product created through the UI is handed id 1 and fails on a
duplicate primary key. `Category` and `ProductSpecification` use
`GenerationType.IDENTITY` — real `AUTO_INCREMENT` — and need no such handling.

### The charset gotcha

Every `mysql` call in the seeder passes `--default-character-set=utf8mb4`. This
is not decoration. Without it the client negotiates **latin1** for the
connection, so a non-ASCII byte in `catalogue.sql` is read as latin1 and
re-encoded on the way into a utf8mb4 column — classic double-encoding:

```
source file   —      E2 80 94              (U+2014 em dash, UTF-8)
stored        â€”    C3 A2 E2 82 AC …      (each byte re-encoded)
rendered      â€”    mojibake in the SPA
```

The databases being `utf8mb4` does not save you; the corruption happens in the
client connection, before the column is ever involved. This matters well beyond
em dashes — any Vietnamese product name typed into a future seed file would be
mangled the same way.

If you see `â€”` in the shop, the fix is to correct the client charset and
re-seed; the stored bytes are already wrong and no display setting repairs them.

---

## Common operations

| Goal | Command |
|---|---|
| Start the stack with demo data | `COMPOSE_PROFILES=prod,seed docker compose up -d` |
| Seed an already-running stack | `docker compose --profile seed up db-seed` |
| Watch the seeder | `docker compose logs -f db-seed` |
| Re-seed from scratch | Delete the catalogue rows, then run `db-seed` again |
| Reset everything (schemas included) | `docker compose down -v` — drops the volume, so phase 1 re-runs |

Editing `init-db/*.sql` has **no effect on an existing volume**: those scripts
only run when the data directory is created. `docker compose down -v` first.

### Environment variables read by the seeder

| Variable | Default | Purpose |
|---|---|---|
| `MYSQL_HOST` | `mysql` | Server to connect to |
| `MYSQL_USER` / `MYSQL_PASSWORD` | `root` / `root` | Credentials |
| `PRODUCT_DB` | `ecommerce_product` | Schema to seed |
| `USER_DB` | `ecommerce` | Schema the seller is looked up in |
| `SELLER_USERNAME` | `seller1` | Owner of the demo products |
| `WAIT_TIMEOUT` | `300` | Seconds to wait for the Hibernate schema |

---

## Seeding under the `dev` profile (Mode 3)

Everything above targets `PRODUCT_DB=ecommerce_product` / `USER_DB=ecommerce`
— the schemas the `prod` profile uses. Under `dev` (Mode 3 hybrid — business
services run from the IDE, see
[ide-debug-setup.md](../development/ide-debug-setup.md)), each service uses
its own per-service schema instead
(`laptop_ecommerce_graduation_project_product_service`,
`laptop_ecommerce_graduation_project_user_service` — see
[running-locally.md](running-locally.md#mode-3--hybrid-dev)). `db-seed`
never targets these on its own, so a fresh Mode 3 stack starts with an empty
catalogue and stays that way even with the `seed` profile enabled, unless the
two variables above are overridden.

`db-seed` still only needs `mysql` healthy — not the IDE-run services — so it
runs the same way regardless of whether `product-service` happens to be up
yet. From `backend/`:

```bash
docker compose --profile seed run --rm \
  -e PRODUCT_DB=laptop_ecommerce_graduation_project_product_service \
  -e USER_DB=laptop_ecommerce_graduation_project_user_service \
  db-seed
```

This reuses the exact same service, image, network and `catalogue.sql` as
the `prod` path — only the target schema names differ — so everything above
(idempotency, the `product_seq` bump, the seller lookup, the charset
handling) applies unchanged. `MYSQL_HOST` stays at its default (`mysql`, the
container's name on the Compose network) because the seeder always runs
*inside* Docker, even when the business services do not.

If `product-service` has not created its tables yet (first run, or right
after `docker compose down -v`), start it from the IDE first — `db-seed`
polls for the schema and fails after `WAIT_TIMEOUT` (default 300s) rather
than hanging forever.

---

## Verifying a seeded stack

### The test that matters: create a product *after* seeding

Seeded products carry **explicit** ids 1–14, and `product_id` has no
`AUTO_INCREMENT` of its own. So the only thing standing between the seed and a
broken shop is the `product_seq` bump:

```
seeded catalogue:   1, 2, 3, … 14
product_seq:        next_val = 1000
new product:        951, 952, 953, …      ← cannot collide
```

The first new id is **951, not 1000** — see
[the note on block allocation](#confirm-the-id-directly) below. Either way it is
far clear of the seeded range, which is the point.

If that `UPDATE` did not run, the generator still points at 1, and the first
product anyone creates is handed id 1 — which already exists.

This is worth calling out as **the** business-critical check because everything
else keeps working when the generator is wrong. Browsing, filtering, search,
category pages, adding to the cart, even checkout on seeded products all pass.
The failure only surfaces the moment someone writes a new product, which is
exactly the path a demo or a defence never exercises until it matters.

#### Through the UI

1. Bring the stack up with the seed profile and wait for the seeder to finish:

   ```bash
   COMPOSE_PROFILES=prod,seed docker compose up -d
   docker compose logs -f db-seed     # wait for "done — 14 products across 4 categories"
   ```

2. Open http://localhost:5173 and sign in as **`seller1` / `password2`**.
3. Go to **http://localhost:5173/admin/products**. A seller is allowed this route
   and `/admin/orders` — see the `adminOnly` branch in
   [`PrivateRoute.jsx`](../../frontend/src/components/PrivateRoute.jsx).
4. Click **Add Product** and fill the form. Pick a **product name that is not
   already in the catalogue**: `addProduct` rejects a duplicate name within the
   same category with `Product already exist!!`, which is a different failure and
   easy to mistake for this one.
5. Save.

| Result | Meaning |
|---|---|
| Product saves and appears in the list | The bump worked |
| Error toast, and `docker compose logs product-service` shows `Duplicate entry '1' for key 'product.PRIMARY'` | `product_seq` was never raised — re-run the seeder, or fix it by hand (below) |

`AddProductForm` picks the seller or admin endpoint from the logged-in user's
roles, so signing in as `seller1` genuinely exercises
`POST /product-manager/api/seller/categories/{categoryId}/product`.

#### Through the API

Same test without a browser. The JWT arrives as the `springBootEcom` cookie, so
keep a cookie jar:

```bash
# 1. sign in as the seller
curl -s -c jar.txt -X POST http://localhost:5173/user-manager/api/auth/signin \
  -H 'Content-Type: application/json' \
  -d '{"username":"seller1","password":"password2"}'

# 2. find a category id to create under
curl -s http://localhost:5173/product-manager/api/public/categories

# 3. create a product in that category (categoryId 1 here)
curl -s -b jar.txt -X POST \
  http://localhost:5173/product-manager/api/seller/categories/1/product \
  -H 'Content-Type: application/json' \
  -d '{
        "productName": "Seed Collision Check",
        "description": "Temporary product used to verify id generation",
        "quantity": 1,
        "price": 100.0,
        "discount": 0,
        "brand": "TestBrand"
      }'
```

A `201` with a `productId` in the response body is the pass. A `500` with
`Duplicate entry` is the failure. `image`, `sku`, `specialPrice`, `sellerId` and
`sellerEmail` are all filled in server-side — do not send them.

#### Confirm the id directly

```bash
docker exec -e MYSQL_PWD=root mysql mysql -uroot --table -e "
  SELECT product_id, product_name FROM ecommerce_product.product ORDER BY product_id DESC LIMIT 3;
  SELECT next_val FROM ecommerce_product.product_seq;"
```

On a freshly seeded stack the first product created this way gets id **951**,
and `next_val` moves from `1000` to `1050`. Both were observed on a real run.

**Do not assert `>= 1000`.** Hibernate's table generator uses a *pooled*
optimizer with `allocationSize` 50: it treats the stored `next_val` as the
**upper bound** of a reserved block and issues ids from the bottom of that block
upward. Reading `1000` therefore yields `951 … 1000`, and writes `1050` back for
the next block.

```
product_seq.next_val = 1000     block issued = 951 … 1000, next_val -> 1050
product_seq.next_val = 1050     block issued = 1001 … 1050, next_val -> 1100
```

So ids also jump after a restart, because the service abandons whatever remains
of its in-memory block. Gaps are normal.

The assertion that actually means something is: **the new id is nowhere near the
seeded 1–14 range.** That is why the floor is 1000 and not something small —
`SEQ_FLOOR` minus one allocation block (`1000 - 50 = 950`) still has to clear the
highest seeded id. A floor of 50 would make Hibernate issue ids from 1 and
collide immediately.

Clean up afterwards so the test product does not linger in the catalogue:

```bash
docker exec -e MYSQL_PWD=root mysql mysql -uroot -e "
  DELETE FROM ecommerce_product.product WHERE product_name = 'Seed Collision Check';"
```

#### Repairing it without re-seeding

If the bump was missed, the generator can be moved by hand — no data loss:

```bash
docker exec -e MYSQL_PWD=root mysql mysql -uroot -e "
  UPDATE ecommerce_product.product_seq SET next_val = 1000 WHERE next_val < 1000;"
docker compose restart product-service
```

The restart matters: product-service caches its current id block in memory, so it
keeps issuing the old values until it reloads.

### Supporting checks

| Check | Command | Expected |
|---|---|---|
| Databases exist before any app | `docker compose up -d mysql`, then `docker exec -e MYSQL_PWD=root mysql mysql -uroot -e "SHOW DATABASES"` | `ecommerce`, `ecommerce_product`, `ecommerce_order` |
| Collations are uniform | `SELECT schema_name, default_collation_name FROM information_schema.schemata WHERE schema_name LIKE 'ecommerce%'` | all three `utf8mb4_unicode_ci` |
| Catalogue is served publicly | `curl -s "http://localhost:5173/product-manager/api/public/products?pageSize=50"` | 14 products, image URLs resolved through `IMAGE_BASE_URL` |
| Product photos are served | `curl -o /dev/null -s -w '%{http_code} %{content_type}' "http://localhost:5173/product-manager/images/seed/dell-xps-13-plus.jpg"` | `200 image/jpeg` — the file is in the container image and `/images/**` is public |
| Facets work | Filter by brand and processor in the SPA | Seeded specs drive the filter lists |
| Seeder is idempotent | `docker compose --profile seed up db-seed` a second time | Logs `catalogue already holds 14 product(s)`, exits `0`, counts unchanged |
| Default path unchanged | `COMPOSE_PROFILES=prod docker compose up -d` | No `db-seed` container, empty catalogue — as before this feature |
| Full reset | `docker compose down -v` then up with the seed profile | Volume dropped, `init-db/` re-runs, catalogue reloaded |

### Two caveats while testing, both pre-existing

Neither is caused by seeding, but both show up while checking a seeded stack.

**1. Seeded specifications are invisible to logged-out shoppers.** This is
[SEC-06](../backend/known-defects.md#sec-06--the-specification-controller-sits-outside-the-gateways-path-scheme):
the spec endpoint is `/product-manager/api/products/public/{id}/specifications`,
with `public` in the **third** segment, so the gateway's
`/product-manager/api/public/**` allowlist never matches it. Confirmed on a
running stack:

```
anonymous       → 401 {"error":"Missing authentication token"}
authenticated   → 200 {"processor":"Intel Core i7-13650HX", …}
```

So the seed writes correct specs, the facets built from them work, but the
product-detail modal shows "Failed to load specifications" until a visitor logs
in. Fixing SEC-06 is what makes the seeded specs publicly visible.

**2. Writing specs as `seller1` succeeds — for the wrong reason.**
[`ProductSpecificationModal`](../../frontend/src/components/modal/ProductSpecificationModal.jsx)
picks its endpoint with `isAdmin ? "admin" : "seller"`, but
[`AdminProducts.jsx`](../../frontend/src/components/admin/products/AdminProducts.jsx)
passes a hard-coded `isAdmin={true}`, so a seller's save calls the **ADMIN**
endpoint. That returns `200`, not `403`, because SEC-06 means the spec paths
carry no role mapping at all — the gateway checks only that you are logged in.

The two defects currently cancel out. Fix SEC-06 without also fixing the
hard-coded prop and seller spec editing starts failing with `403`.

Product creation is unaffected by both:
[`AddProductForm`](../../frontend/src/components/admin/products/AddProductForm.jsx)
derives `isAdmin` from the user's real roles, and
`/product-manager/api/seller/**` *is* role-mapped.

---

## Why not put the whole schema in SQL?

The textbook end state is `ddl-auto: validate` with hand-written DDL or a
migration tool (Flyway, Liquibase), which would let one entrypoint script own
schema *and* data and remove the two-phase split entirely. It is a much larger
change — every entity across three services, plus a migration baseline — and is
not done here. Hibernate remains the schema owner; the seeding fits around it.

---

## Related Documents

- [docker-setup.md](docker-setup.md) — Compose layout, container topology, images
- [running-locally.md](running-locally.md) — startup modes, environment variables, seeded users
- [../backend/services/product-service.md](../backend/services/product-service.md) — catalogue model and faceted search
- [../backend/services/user-service.md](../backend/services/user-service.md) — user data model and the seeding `CommandLineRunner`
