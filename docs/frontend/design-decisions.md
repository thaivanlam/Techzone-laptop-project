# Frontend Design Decisions and Trade-offs

Choices made in the React application, with reasoning and cost. Platform-level
decisions live in
[../architecture/design-decisions.md](../architecture/design-decisions.md).

---

## 1. Redux with Plain Reducers vs. RTK Slices

**Decision:** Redux Toolkit's `configureStore`, but reducers written as manual
`switch`/`case` blocks with string action types instead of `createSlice`.

**Why:** The project grew incrementally, starting from basic Redux patterns.
`createSlice` would cut boilerplate through generated action types and Immer
immutability, but the current structure was sufficient at thesis scale.

**Trade-off:** More verbose code (~600 lines in `store/action/index.js`) and a
real risk of typos in action-type strings. A larger team or a longer-lived
project would benefit from migrating to `createSlice` + `createAsyncThunk`.

---

## 2. MUI + Tailwind CSS (Two Styling Systems)

**Decision:** MUI for complex interactive components (DataGrid, Select, Radio,
Stepper); Tailwind for everything else — layout, cards, buttons, responsive
design.

**Why:** MUI's DataGrid gives server-side pagination, column resizing, and
sorting for free; rebuilding that in Tailwind would be substantial work.
Tailwind meanwhile allows fast custom styling without vendor component APIs.

**Trade-off:** Two paradigms in one bundle increases size and cognitive
overhead. MUI defaults occasionally clash with Tailwind on button colors and
font sizes; `!important` overrides in the Tailwind config paper over most of it.

---

## 3. Client-Side Cart with Server Sync

**Decision:** The cart lives in Redux + `localStorage` for guests. When a
logged-in user proceeds to checkout, it is synced to the backend via
`POST /cart/create`.

**Why:** Browsing and adding to cart without an account is standard e-commerce
practice and reduces friction. A server-side cart is only needed at checkout.

**Trade-off:** Cart state can go stale if prices or stock change between adding
and checkout. Validating cart items against current inventory at checkout time
would be more robust.

---

## 4. URL-Based Filter State

**Decision:** All product filters — category, sort order, price range, brand,
processor, RAM, storage, keyword, page number — are stored as URL query
parameters rather than component state.

**Why:** URLs become shareable and bookmarkable, e.g.
`/products?category=Gaming&brands=ASUS,MSI&minPrice=1000`. Custom hooks
(`useProductFilter` and friends) read the params and dispatch the matching API
call automatically.

**Trade-off:** More complex state management — every filter change is a
navigation that triggers a re-render cycle. The 700 ms search debounce limits
excessive calls, but a global filter cache would help further.

---

## 5. Single Action File vs. Feature-Based Splitting

**Decision:** All Redux thunks (~90) live in one `store/action/index.js`.

**Why:** It started small and grew organically; for a single developer, one file
makes global search trivial.

**Trade-off:** 500+ lines mixing auth, products, cart, orders, and admin
concerns. A production app would split into `authActions.js`,
`productActions.js`, `cartActions.js`, and so on.

---

## 6. Hardcoded Dashboard Analytics

**Decision:** Dashboard cards and charts mix real API data (product count, total
revenue, total orders) with mock values (today's orders, conversion rate,
shipped today).

**Why:** The backend analytics endpoints return aggregate counts only. Real
time-series analytics would need meaningful backend work — event sourcing,
time-bucketed queries — beyond the thesis scope.

**Trade-off:** The dashboard looks complete but is not fully functional. Treated
as a documented limitation rather than a hidden bug.

---

## 7. Role Selection at Registration

**Decision:** Users self-select their role (Customer, Seller, or Admin) at
signup.

**Why:** Simplifies development and demos — no separate admin provisioning flow.

**Trade-off:** Anyone can register as an admin. Acceptable for a thesis demo;
production would require an approval or invitation workflow. See
[../architecture/security-model.md](../architecture/security-model.md#known-weaknesses).

---

## 8. Single Axios Instance with Cookie Auth

**Decision:** One axios instance in `api/api.js`, configured with
`withCredentials: true` and the gateway base URL. Every call uses it.

**Why:** Centralizes auth configuration. The backend authenticates via the
`springBootEcom` cookie, so `withCredentials` must be set on every request; a
single instance avoids repeating that.

**Trade-off:** No request/response interceptors, so there is no automatic 401
handling or token refresh. When the session expires (~50 minutes), users see raw
error messages instead of being redirected to login. An interceptor chain would
be a significant UX improvement.
