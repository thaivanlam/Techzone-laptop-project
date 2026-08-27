# Tests

Four suites live here:

- **`frontend/`** — unit tests for the single-page application's reducers and display
  helpers. Pure functions: no stack, no browser, no npm install.
- **`system/`** — the whole platform, driven through the API Gateway.
- **`acceptance/`** — the same platform, exercised as the user stories describe it.
- **`load/`** — the same platform under concurrent load, driven by JMeter rather than
  by Node. It measures rather than asserts; it has its own
  [README](load/README.md).

The system, acceptance and load suites need a **running stack**; nothing in them is mocked and no
service is reached directly.

The backend unit and integration levels live inside the backend modules and run with Maven.
See [../docs/quality/test-plan.md](../docs/quality/test-plan.md) for how the four
levels fit together.

---

## What is here

| Path | Level | What it covers |
|---|---|---|
| [`frontend/reducers.test.js`](frontend/reducers.test.js) | Unit | Cart, auth, product and error reducers: state transitions and purity |
| [`frontend/formatting.test.js`](frontend/formatting.test.js) | Unit | Price, revenue and text-truncation helpers |
| [`system/gateway-routing.test.js`](system/gateway-routing.test.js) | System | Every service reachable under its prefix, path rewriting, CORS pre-flight, unknown routes |
| [`system/access-control.test.js`](system/access-control.test.js) | System | Anonymous / customer / seller / administrator against public, cart, seller and admin routes |
| [`system/catalogue.test.js`](system/catalogue.test.js) | System | Catalogue reads: page envelope, pricing arithmetic, sorting, facets, keyword search |
| [`system/cart-and-checkout.test.js`](system/cart-and-checkout.test.js) | System | The cross-service path: cart → stock check → order → stock decrement → order history |
| [`acceptance/account.test.js`](acceptance/account.test.js) | Acceptance | *Creating an account and signing in* |
| [`acceptance/shopping.test.js`](acceptance/shopping.test.js) | Acceptance | *Browsing the shop*, *Filling a cart and buying* |
| [`acceptance/staff.test.js`](acceptance/staff.test.js) | Acceptance | *Staff and customer boundaries* |
| [`acceptance/features/`](acceptance/features/) | Acceptance | The scenarios in business language (Gherkin), one file per feature |
| [`load/`](load/) | Performance | Two JMeter plans — catalogue browsing, and cart to placed order — at smoke, load, stress and spike stages |
| [`lib/`](lib/) | — | Gateway URL, seeded accounts, a cookie-keeping HTTP session, task helpers, the preflight probe |

The Gherkin files are the readable statement of what the platform promises; the `.test.js`
files execute those same scenarios, test by test, in the same wording. Read the feature
file to know what is promised; read the test to know how it is checked.

A checklist for the parts that only a person can judge — layout, wording, the payment
form — is in [../docs/quality/uat-checklist.md](../docs/quality/uat-checklist.md).

---

## Running them

Requirements: **Node 20 or newer** (Node 24 is what this was written against). There are no
npm dependencies to install — the suites use the built-in test runner and `fetch`.

Start the platform first (the `frontend/` suite does not need it):

```bash
# from the repository root
docker compose --profile prod up -d
# with a demo catalogue, which most scenarios need:
COMPOSE_PROFILES=prod,seed docker compose up -d
```

Then, from this directory:

```bash
npm test                 # every Node suite here (not load - see below)
npm run test:frontend    # front-end unit tests - no stack needed
npm run test:system      # system tests
npm run test:acceptance  # acceptance tests
npm run preflight        # just check the stack is up

# the load suite is not npm: it needs JMeter, and it measures rather than asserts
cd load && ./run.sh catalogue-browse smoke
```

Without npm, the same thing directly — note `--test-concurrency=1` for the live suites, see
below:

```bash
node --test "frontend/*.test.js"
node --test --test-concurrency=1 "system/*.test.js" "acceptance/*.test.js"
```

The front-end suite is the one to reach for while the stack is down — it needs nothing but
Node.

### When the stack is not running

Every suite probes the gateway once before it starts. If nothing answers, the whole suite
is **skipped** with a single line explaining what to start — it does not fail. That keeps
`node --test` usable on a laptop with no Docker running, and keeps a red result meaning
"something is broken" rather than "something is not started".

### Why the live suites run serially

`test:system` and `test:acceptance` pass `--test-concurrency=1`. `node --test` otherwise
runs each file in its own process, and the suites share the seeded demo accounts — two of
them adding the same product to the same cart at the same instant permanently corrupts that
cart (**BUG-21**, found exactly that way). Run them serially, or give each suite its own
account with the environment variables below.

### Rebuild before you trust a failure

The Compose stack runs whatever is in the images, not what is in the working tree. The
first live run of this suite failed on a role check because the gateway image predated the
commit that added the mapping. Before concluding a failure is a code defect:

```bash
docker compose build <service> && docker compose up -d <service>
```

### Tests that write data

Placing an order creates rows and permanently decrements stock, so those scenarios are
skipped unless you opt in:

```bash
RUN_DESTRUCTIVE=1 npm test
```

Everything else is either read-only or cleans up after itself (cart changes are undone in
an `after` hook). Registration scenarios do create accounts — they invent a throw-away
username each run, and never touch the seeded ones.

---

## Configuration

All of it is environment variables, read in [`lib/config.js`](lib/config.js):

| Variable | Default | Purpose |
|---|---|---|
| `GATEWAY_URL` | `http://localhost:8080` | Where the platform is |
| `AUTH_COOKIE` | `springBootEcom` | Name of the cookie carrying the JWT |
| `RUN_DESTRUCTIVE` | unset | `1` enables the scenarios that place orders |
| `REQUEST_TIMEOUT_MS` | `15000` | Per-request timeout |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `adminPass` | Seeded administrator |
| `SELLER_USERNAME` / `SELLER_PASSWORD` | `seller1` / `password2` | Seeded seller |
| `CUSTOMER_USERNAME` / `CUSTOMER_PASSWORD` | `user1` / `password1` | Seeded customer |
| `CUSTOMER2_USERNAME` / `CUSTOMER2_PASSWORD` | `user2` / `password1` | Second seeded customer |

The defaults are the **development** demo accounts documented in
[../docs/operations/running-locally.md](../docs/operations/running-locally.md). Never point
these suites at an environment where those credentials are real without overriding them.

---

## Tests that record a known defect

Several tests assert behaviour that is **wrong but current** — an empty search answered
with `400`, a successful read answered with `302`, a shopper able to self-grant
`ROLE_ADMIN`, a brand-new customer's cart page answering `500` (BUG-20). Each one names the
defect ID from
[../docs/backend/known-defects.md](../docs/backend/known-defects.md) and says, in the
assertion message, what to change when the defect is fixed.

This is deliberate. The alternative — asserting the behaviour we wish we had — leaves the
suite permanently red and therefore ignored. Pinning the real behaviour keeps the suite
meaningful today and turns every fix into a test that must be consciously updated.
