# Developer Guide

How to work on this codebase: get it running, find your way around, add a
feature end to end, and land the change with everything it is supposed to carry.

Reference material lives elsewhere — endpoints in
[../backend/api-reference.md](../backend/api-reference.md), per-service internals
under [../backend/services/](../backend/services/), configuration keys in
[../operations/configuration-reference.md](../operations/configuration-reference.md).
This document is the part that is not a table: the conventions and the workflow.

---

## Table of Contents

1. [One-Time Setup](#1-one-time-setup)
2. [Repository Layout and the Submodule Rule](#2-repository-layout-and-the-submodule-rule)
3. [Everyday Commands](#3-everyday-commands)
4. [Backend Conventions](#4-backend-conventions)
5. [Adding a Backend Endpoint](#5-adding-a-backend-endpoint)
6. [The Algorithms Worth Knowing](#6-the-algorithms-worth-knowing)
7. [Frontend Conventions](#7-frontend-conventions)
8. [Adding a Frontend Feature](#8-adding-a-frontend-feature)
9. [Testing Your Change](#9-testing-your-change)
10. [Landing a Change](#10-landing-a-change)
11. [Pitfalls That Have Actually Bitten](#11-pitfalls-that-have-actually-bitten)

---

## 1. One-Time Setup

| Tool | Version | Needed for |
|---|---|---|
| JDK | 21 | Every backend module (notification-service still targets 17) |
| Maven | wrapper included (`./mvnw`) | Backend builds |
| Node.js | ≥ 20.19 | Frontend, and the system test suites |
| Docker + Compose | ≥ 2.20 | The stack; `include` needs 2.20 |
| Git | any recent | Submodules |

```bash
git clone --recurse-submodules <superproject-url>
cd Techzone-laptop-project
cp .env.example .env          # fill in STRIPE_SECRET_KEY, MAIL_PASSWORD, VITE_STRIPE_PUBLISHABLE_KEY
docker compose up --build     # http://localhost:5173
```

Already cloned without submodules? `git submodule update --init --recursive`.

If a native MySQL holds port 3306, set `MYSQL_PORT=3307` in `.env` — services
address `mysql:3306` inside the network, so only the host binding moves.

The three start-up modes, and when to use which, are in
[../operations/running-locally.md](../operations/running-locally.md). For feature
work on the SPA, Mode 2 (backend in Docker, Vite on the host) is the fastest
loop.

---

## 2. Repository Layout and the Submodule Rule

```
Techzone-laptop-project/          ← superproject: Compose, docs, tests
├── backend/                      ← submodule, its own git history
├── frontend/                     ← submodule, its own git history
├── docs/                         ← ALL documentation for both, consolidated
├── tests/                        ← system + acceptance suites (Node)
├── docker-compose.yml            ← full stack; includes backend/docker-compose.yml
└── CHANGELOG.md
```

**The rule that trips everyone once.** `backend/` and `frontend/` are separate
repositories. The superproject records only a *pointer* to a commit in each. A
change inside a submodule therefore takes two commits:

```bash
cd backend
git add -A && git commit -m "..."       # 1. the real change
cd ..
git add backend && git commit -m "..."  # 2. move the pointer
```

Skip step 2 and the change exists on your machine and nowhere else — a fresh
clone of the superproject will check out the *old* submodule commit.

Documentation is the mirror image: it belongs in `docs/` **here**, never inside a
submodule, unless the task specifically says otherwise. The full workflow is in
[`CLAUDE.md`](../../CLAUDE.md) and [../README.md](../README.md).

---

## 3. Everyday Commands

### Backend

```bash
cd backend/product-service

./mvnw test                      # unit + integration, no stack needed
./mvnw -q -o test                # offline, once the repo is warm
./mvnw spring-boot:run           # run this service alone (needs config-server + eureka)
./mvnw -DskipTests package       # build the jar
```

Every module has its own wrapper — there is no aggregator POM, so `./mvnw test`
at `backend/` does nothing. To run everything:

```bash
cd backend
for m in api-gateway config-server discovery-service user-service \
         product-service order-service notification-service; do
  (cd $m && ./mvnw -q test) || echo "FAILED: $m"
done
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, HMR
npm run lint       # ESLint — there is no unit suite
npm run build      # production bundle
npm run preview    # serve the built bundle
```

### Stack and system tests

```bash
docker compose up -d                  # from the repo root
docker compose logs -f order-service
docker compose down                   # add -v to also drop the MySQL volume

cd tests && npm run preflight && npm test
```

---

## 4. Backend Conventions

Every business service is the same shape. Learn it once.

```
src/main/java/com/ecommerce/<service>/
├── controller/     @RestController — HTTP only: bind, delegate, wrap
├── service/        interface + Impl — all business logic lives here
├── repositories/   Spring Data JPA interfaces
├── model/          @Entity classes
├── payload/        DTOs in and out; never expose an entity
├── security/       JwtService + AuthUtil (per service, no shared module)
├── config/         beans: ModelMapper, RabbitMQ, RestTemplate, AppConstants
├── exceptions/     APIException, ResourceNotFoundException, the @RestControllerAdvice
└── util/           pure helpers (SKUGenerator, ImagePathUtils)
```

| Concern | Convention |
|---|---|
| **Layering** | A controller never touches a repository. A service never returns an entity. |
| **DTO mapping** | ModelMapper, configured in `config/`. Hand-map when the shapes genuinely differ. |
| **Pagination** | `pageNumber`, `pageSize`, `sortBy`, `sortOrder` query params, defaults from `AppConstants` (page size 6). Responses carry `content`, `pageNumber`, `pageSize`, `totalElements`, `totalPages`, `lastPage`. |
| **Errors** | Throw `APIException` (a business rule was broken → 400) or `ResourceNotFoundException` (→ 404). The `@RestControllerAdvice` turns them into an `APIResponse(message, status)`. Never build an error `ResponseEntity` by hand in a controller. |
| **Identity** | `AuthUtil.loggedInEmail()` — it parses the `springBootEcom` cookie through the service's own `JwtService`. There is no `SecurityContext` downstream of the gateway. |
| **Authorisation** | Role checks live in the **gateway's** `role-mappings`, matched on the *second* path segment. Ownership checks, where they exist, live in the service method. |
| **Persistence** | `ddl-auto: update`. There are no migrations; a column change is applied by Hibernate at boot. |
| **Config** | Nothing hardcoded: values come from Config Server, overridable per profile and by environment variable. |

### The path-segment rule

This one is load-bearing and has already caused a security defect. The gateway
matches `/{service}-manager/api/{scope}/**` where `scope` is `public`, `admin`,
`seller` or `internal`. **A controller whose `@RequestMapping` puts the scope
anywhere but the second segment after `/api` is matched by no rule at all — which
means no role check and, for a non-public path, no authentication either.**
`SEC-06` was exactly this: `@RequestMapping("/api/products")` with `admin` in the
third segment. Map controllers as `/api` and put the scope in the method-level
path, or map the scope at class level — never in between.

---

## 5. Adding a Backend Endpoint

Worked example: "a customer can see how many units of a product are left".

1. **Check the requirement exists.** Add an `FR-` row to
   [../requirements/srs.md](../requirements/srs.md) if it does not.
2. **DTO first** — `payload/StockDTO.java`. Never return the entity.
3. **Service interface + Impl** — the rule, the lookup, the exception. Throw
   `ResourceNotFoundException` for an unknown id.
4. **Controller** — pick the path scope deliberately:
   `/api/public/**` for anonymous, `/api/admin/**`, `/api/seller/**` for
   role-gated, `/api/internal/**` for service-to-service, anything else for
   "any authenticated user".
5. **Gateway** — if the new scope is not already covered, add it to
   `role-mappings` or `public-paths` in
   `backend/api-gateway/src/main/resources/application.yaml`. **Forgetting this
   is how an endpoint ships unprotected.**
6. **Tests** — a unit test for the rule, an HTTP integration test for the status
   codes and envelope, and a system test in `tests/system/` if the access level
   is new.
7. **Docs** — a row in
   [../backend/api-reference.md](../backend/api-reference.md), the service's own
   document under [../backend/services/](../backend/services/), and
   [../architecture/security-model.md](../architecture/security-model.md) if the
   access rules changed.
8. **Log it** — an entry in [../dev-log/](../dev-log/).

Steps 5 and 7 are the ones that get skipped. Step 5 is a security hole; step 7
is how the documentation stops being true.

---

## 6. The Algorithms Worth Knowing

Five pieces of logic carry most of the platform's behaviour.

### Special price

```java
specialPrice = price - (discount * 0.01) * price;
```

Computed on create and on update, and **stored**. It is the column every price
filter and sort uses, so a discount change that does not go through the service
leaves the catalogue sorting on a stale number. `double` is the wrong type for
money here — see the trade-off note in
[../backend/services/product-service.md](../backend/services/product-service.md).

### SKU generation

`SKUGenerator.generateSKU(category, brand, name)` → `CATEGORY-BRAND-MODEL-RANDOM`:

| Segment | Rule |
|---|---|
| Category | First 3 letters, uppercased, non-letters stripped; padded with `X`; `XXX` if absent |
| Brand | Uppercased, everything outside `A-Z0-9` stripped |
| Model | First alphanumeric word of ≥ 2 characters, truncated to 5; falls back to the first 3 characters |
| Random | Six digits, zero-padded |

Regenerated when the name or the brand changes, kept otherwise. The random tail
means the SKU is not a stable business key — do not join on it.

### Faceted search

`ProductServiceImpl` composes a `Specification<Product>` from whichever query
parameters arrived, then hands it to a `JpaSpecificationExecutor` with a
`Pageable`. Each parameter contributes one predicate, and they are ANDed. The
technical facets (`processors`, `ram`, `storage`) join `product_specifications`,
which is an **inner** join — a product without a specification row is dropped
from any such filter (`BUG-14`). Add a facet by adding a predicate, not by adding
a query method.

### Cart totals

Two paths compute the same number: incremental (`total += unitPrice * delta` on
each mutation) and full recomputation (sum of the lines). They can disagree
(`BUG-07`). When touching cart code, prefer recomputing from the lines — the
incremental path exists only for speed that this system does not need.

### Order placement

`OrderServiceImpl.placeOrder` in order: load cart → persist `Order` and
`Payment` → for each line, call product-service `reduce-stock` and persist an
`OrderItem` with its snapshot → empty the cart → publish to RabbitMQ. There is no
transaction across the two databases, so a failure inside the loop leaves earlier
stock reductions applied (`BUG-01`). Anything added to this method should be
placed with that in mind: the later it runs, the less it can corrupt.

---

## 7. Frontend Conventions

| Concern | Convention |
|---|---|
| **HTTP** | One axios instance, [`src/api/api.js`](../../frontend/src/api/api.js), with `baseURL` from `VITE_BACK_END_URL` and `withCredentials: true`. Never call `axios` directly — the cookie will not travel. |
| **State** | Redux Toolkit store, plain thunks in `store/action/index.js`, hand-written reducers per domain. No `createSlice`, no RTK Query — see [../frontend/design-decisions.md](../frontend/design-decisions.md). |
| **Thunk shape** | `dispatch(IS_FETCHING)` → `await api.get(...)` → `dispatch(RESULT, payload)` → `catch → dispatch(IS_ERROR, message)`. Read the message as `error?.response?.data?.message` with a literal fallback. |
| **Filters** | URL query params are the source of truth. A `use*Filter` hook reads `useSearchParams`, builds the backend query string, and dispatches. Never keep filter state in component state. |
| **Routing** | `PrivateRoute` in three modes: default (any authenticated user), `publicPage` (bounce a signed-in user away from login/register), `adminOnly` (admin or seller). |
| **Tables** | MUI DataGrid, columns centralised in `components/helper/tableColumn.jsx`. |
| **Feedback** | `react-hot-toast`. Every mutation reports success or failure. |
| **Money** | `utils/formatPrice.js` — never format inline. |

---

## 8. Adding a Frontend Feature

1. **Action** in `store/action/index.js`, following the thunk shape above and
   calling through the gateway prefix (`/product-manager/...`).
2. **Reducer** case in the matching file under `store/reducers/`.
3. **Component** under the folder for its area; read state with `useSelector`,
   dispatch with `useDispatch`.
4. **Route** in `App.jsx`, wrapped in the right `PrivateRoute` mode.
5. **Filters**, if the screen has any: a `use*Filter` hook, not local state.
6. **Docs** — [../frontend/overview.md](../frontend/overview.md) if the structure
   or a flow changed.

---

## 9. Testing Your Change

The strategy, the levels and the commands are in
[../quality/test-plan.md](../quality/test-plan.md). The short version:

- Business rule → **unit** test with Mockito.
- Status code, envelope, path binding → **HTTP integration** test with `MockMvc`.
- Query semantics, paging, cascade → **`@DataJpaTest`** against H2.
- Cross-service call → **`MockRestServiceServer`**.
- Access level → **system** test in `tests/system/`, which skips itself when no
  stack is running.

Two conventions that matter more than they look:

- `@DisplayName` on every test, written as a sentence about behaviour. The suite
  output is meant to read as a specification.
- If you must ship a known-wrong behaviour, pin it with a **characterisation**
  test named `BUG-xx characterisation: …`, and register the defect. Fixing it
  later means inverting that test in the same change set.

---

## 10. Landing a Change

```bash
# inside the submodule
./mvnw test                       # or npm run lint
git add -A && git commit -m "Imperative summary of the change"

# in the superproject
git add backend                   # move the pointer
# ... plus the docs/ updates and the dev-log entry
git commit -m "..."
```

A change is complete when all of these are true:

| # | Check |
|---|---|
| 1 | Tests pass for every module touched |
| 2 | New behaviour has a test at the lowest level that can prove it |
| 3 | The affected documents in `docs/` are updated **in the same change set** |
| 4 | A session entry is at the top of the current month's [dev log](../dev-log/) |
| 5 | A platform-level decision has an [ADR](../architecture/decisions/) |
| 6 | User-visible changes are added to `[Unreleased]` in [`CHANGELOG.md`](../../CHANGELOG.md) |
| 7 | The submodule pointer is committed in the superproject |

Documentation is written in **English**, whatever language the commit message or
the conversation used.

Never commit a secret. The dev log has explicit redaction rules — name the
variable, never the value, and never write a live host's address. See
[../dev-log/README.md](../dev-log/README.md).

---

## 11. Pitfalls That Have Actually Bitten

| Symptom | Cause | Avoid it by |
|---|---|---|
| The endpoint works but has no role check | The scope was not in the second path segment, so no gateway rule matched | The path-segment rule in [§4](#the-path-segment-rule) |
| A frontend change has no effect in Docker | `VITE_*` values are inlined at **build** time | `docker compose build frontend && docker compose up -d frontend` |
| Creating a product fails on a duplicate key after seeding | `Product` uses `GenerationType.AUTO` → the `product_seq` table generator, which the seeder must raise | [../operations/database-seeding.md](../operations/database-seeding.md) |
| Services cannot find MySQL, RabbitMQ or Eureka | `SPRING_PROFILES_ACTIVE=dev` (localhost) with `COMPOSE_PROFILES=prod` (container network) | Keep the two profile variables in agreement |
| Container name conflicts on `up` | The root and `backend/` Compose projects are both running | They are mutually exclusive — `cd backend && docker-compose down` first |
| Calls return `401` after about 50 minutes | The token expired; the cookie lives 24 hours, so the UI still looks signed in (`BUG-03`) | Sign in again; do not add a retry loop |
| A test needs Config Server or Eureka | The module's `src/test/resources/application.yaml` was not picked up | It must shadow the main one and disable `spring.cloud.config` and `eureka.client` |
| A submodule change vanishes for everyone else | The pointer commit in the superproject was never made | [§2](#2-repository-layout-and-the-submodule-rule) |
| Deleting a category wipes products | `Category.products` cascades `ALL` (`BUG-13`) | Do not use category delete on real data until it is fixed |
