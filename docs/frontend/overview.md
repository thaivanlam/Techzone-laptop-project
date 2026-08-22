# Frontend Overview

The frontend ([`frontend/`](../../frontend)) is a single-page application built
with **React 19**, **Redux Toolkit**, and **Tailwind CSS v4**, served by Vite on
port `5173`. It is the only client of the platform and talks exclusively to the
API Gateway on port `8080`.

Related documents: [design-decisions.md](design-decisions.md) ·
[../backend/api-reference.md](../backend/api-reference.md) ·
[../architecture/security-model.md](../architecture/security-model.md)

---

## Technology Stack

### Core

| Technology | Version | Purpose | Why chosen |
|---|---|---|---|
| **React** | 19.1 | UI library | Component architecture, large ecosystem, hooks for clean state logic |
| **Redux Toolkit** | 2.9 | Global state | Central store for auth, cart, products, orders; thunks for async calls; predictable updates across deep component trees |
| **React Router DOM** | 7.9 | Routing | Nested layouts, protected routes, URL-based filtering |
| **Tailwind CSS** | 4.1 (Vite plugin) | Styling | Utility-first, no context switch to CSS files; v4's native Vite integration removes PostCSS config |
| **Vite** | 7.1 | Build tool | Near-instant HMR, fast cold start, native ESM |

### UI and Components

| Library | Purpose | Why chosen |
|---|---|---|
| **MUI (Material UI)** | DataGrid tables, form controls, dialogs | Production-ready tables with server-side pagination and sorting |
| **Headless UI** | Modals, listboxes, dialogs | Unstyled accessible primitives that do not fight Tailwind |
| **React Icons** | Icons | One import covering Font Awesome, Material, Heroicons |
| **React Hook Form** | Form validation | Minimal re-renders, built-in rules, cleaner than controlled inputs |
| **React Hot Toast** | Notifications | Zero-config toasts, lighter than MUI Snackbar |
| **Chart.js + react-chartjs-2** | Dashboard charts | Line, Bar, and Doughnut charts for admin analytics |
| **Swiper** | Carousel | Touch-friendly home page banner slider |

### Payments and Utilities

| Library | Purpose |
|---|---|
| **@stripe/react-stripe-js**, **@stripe/stripe-js** | Stripe Elements for card payments |
| **axios** | HTTP client with `withCredentials` cookie support |
| **classnames** | Conditional class composition (sidebar active state) |
| **react-loader-spinner** | Loading animations (Vortex spinner) |

---

## Project Structure

```
src/
├── api/
│   └── api.js                  # Axios instance with base URL & credentials
├── components/
│   ├── admin/                  # Admin panel pages
│   │   ├── dashboard/          # Analytics dashboard with charts
│   │   ├── products/           # Product CRUD, image upload, specifications
│   │   ├── orders/             # Order management & status updates
│   │   ├── categories/         # Category CRUD
│   │   ├── sellers/            # Seller management
│   │   ├── customers/          # Customer management
│   │   └── AdminLayout.jsx     # Sidebar + top nav layout wrapper
│   ├── auth/                   # Login & Register pages
│   ├── cart/                   # Cart page, item content, quantity controls
│   ├── checkout/               # Multi-step checkout flow
│   ├── home/                   # Home page with banner slider
│   ├── modal/                  # Product specification modal
│   ├── order/                  # Customer order history & management
│   ├── products/               # Product listing with advanced filters
│   ├── profile/                # User profile & address management
│   ├── shared/                 # Navbar, Sidebar, Loader, and other reusables
│   └── helper/
│       └── tableColumn.jsx     # DataGrid column definitions for all tables
├── hooks/                      # URL-based filtering hooks
│   ├── useProductFilter.js     # Product filters → URL params → API call
│   ├── useOrderFilter.js
│   ├── useCustomerOrderFilter.js
│   ├── useCategoryFilter.js
│   ├── useSellerFilter.js
│   └── useCustomerFilter.js
├── store/
│   ├── action/index.js         # All Redux thunk actions (API calls)
│   └── reducers/
│       ├── store.js            # Store configuration with preloaded state
│       ├── ProductReducer.js   # Products, categories, brands, pagination
│       ├── authReducer.js      # User, addresses, sellers, customers, client secret
│       ├── cartReducer.js      # Cart items, total price, cart ID
│       ├── orderReducer.js     # Admin orders, customer orders
│       ├── adminReducer.js     # Analytics data
│       ├── errorReducer.js     # Loading states, error messages
│       └── paymentMethodReducer.js
└── utils/
    ├── index.js                # Navigation configs, banner data
    ├── formatPrice.js          # Currency formatting & revenue abbreviation
    ├── truncateText.js         # Text truncation utility
    └── constant.js             # Asset imports
```

---

## Application Flows

### Customer Journey

```
Home Page → Browse Products (with filters) → View Product Details
  → Add to Cart → Cart Review → Checkout Flow:
      Step 1: Select/Add Delivery Address
      Step 2: Choose Payment Method (Stripe)
      Step 3: Review Order Summary
      Step 4: Complete Stripe Payment → Order Confirmation
```

After ordering, customers track and manage orders from **Profile → My Orders**,
where they can view status and cancel pending orders.

### Authentication

```
Register (select role: Customer / Seller / Admin)
  → Login (JWT cookie auth via withCredentials)
    → Role-based redirect:
        Customer → Home page (shop, cart, orders)
        Seller   → Admin panel (own products & orders only)
        Admin    → Admin panel (dashboard, products, categories,
                   sellers, customers, all orders)
```

Auth state is persisted in `localStorage` and rehydrated into the Redux store on
page load. The axios instance sets `withCredentials: true` so the
`springBootEcom` JWT cookie travels with every request.

### Admin / Seller Panel

```
Admin Layout (sidebar navigation)
  ├── Dashboard  — analytics overview with Chart.js visualizations
  ├── Products   — CRUD with image upload, SKU auto-generation, specifications
  ├── Orders     — view all orders, update status (Pending → Shipped → Delivered)
  ├── Categories — CRUD for product categories
  ├── Sellers    — manage seller accounts (admin only)
  └── Customers  — manage customer accounts (admin only)
```

Sellers see a restricted view: only **Products** and **Orders**, scoped to their
own records.

### Data Flow

```
React Component
  → dispatches Redux action (thunk)
    → axios call to API Gateway (port 8080)
      → Gateway routes to microservice:
           /product-manager/** → Product Service
           /user-manager/**    → User Service
           /order-manager/**   → Order Service
      → Response flows back through Redux → Component re-renders
```

The frontend knows only the gateway URL from `.env`; individual microservice
addresses are never referenced.

---

## Key Features

### Product Browsing and Filtering

- **Category filter** via dropdown (server-side)
- **Price range filter** with slider and manual input
- **Advanced filters** — brand, processor, RAM, storage, as checkbox groups in
  collapsible accordions
- **Keyword search** with a 700 ms debounce
- **Sort by price**, ascending or descending
- **Server-side pagination**, with all filter state synced to URL query params
  so URLs are shareable and bookmarkable

### Shopping Cart

- Cart state in Redux, persisted to `localStorage`
- Quantity controls validated against product inventory
- Real-time price calculation with savings display
- Survives page refreshes; cleared on successful order placement

### Checkout

- Four-step wizard: Address → Payment Method → Order Summary → Payment
- Address CRUD with a selection UI
- Stripe Elements (test mode) for card input
- A confirmation page handles the Stripe redirect and places the order

### Role-Based Access Control

- `PrivateRoute` supports three modes: `publicPage` (redirect logged-in users
  away), `adminOnly` (admin/seller only), and the default (any authenticated
  user)
- Sellers are restricted to `/admin/orders` and `/admin/products`
- Conditional rendering throughout the UI keyed on `user.roles`

### Product Specifications

- Admin and seller can attach specs (CPU, RAM, storage, display, GPU) per product
- Specs are fetched and shown in the product detail modal
- The spec editor uses select dropdowns for standardized values, which is what
  makes the catalog filters work

### Admin Dashboard

- Cards for revenue, orders, products, and customer count
- Revenue trend (Line), order status distribution (Doughnut), top products (Bar)
- Several figures are mock data — see
  [design-decisions.md](design-decisions.md#6-hardcoded-dashboard-analytics)

---

## Environment Variables

Create `.env` in `frontend/`:

```env
# Backend API Gateway URL
VITE_BACK_END_URL=http://localhost:8080

# Stripe publishable key (test mode)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# Frontend URL (used for the Stripe payment redirect)
VITE_FRONTEND_URL=http://localhost:5173
```

## Running

Requires Node.js >= 20.19.0 and the backend gateway reachable on port 8080.

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173

npm run build    # production build
npm run preview  # preview the production build
```

Full stack startup is documented in
[../operations/running-locally.md](../operations/running-locally.md).
