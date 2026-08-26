<div align="center">

<img src="docs/assets/banner.svg" alt="TechZone — Laptop E-commerce Platform built on a microservices architecture" width="100%">

<h1>💻 TechZone Laptop Project</h1>

<p><b>A production-shaped laptop e-commerce platform</b><br>
Spring Boot microservices behind a Spring Cloud Gateway, with a React 19 storefront —<br>
built for the graduation thesis <i>“Laptop E-commerce Platform Using Microservices Architecture”</i>.</p>

<p>
  <a href="#-quick-start"><b>Quick Start</b></a> ·
  <a href="#-screenshots"><b>Screenshots</b></a> ·
  <a href="#-architecture"><b>Architecture</b></a> ·
  <a href="#-tech-stack"><b>Tech Stack</b></a> ·
  <a href="docs/README.md"><b>Documentation</b></a> ·
  <a href="CHANGELOG.md"><b>Changelog</b></a>
</p>

<p>
  <img alt="Java 21" src="https://img.shields.io/badge/Java-21-E76F00?style=for-the-badge&logo=openjdk&logoColor=white">
  <img alt="Spring Boot 3.5.7" src="https://img.shields.io/badge/Spring%20Boot-3.5.7-6DB33F?style=for-the-badge&logo=springboot&logoColor=white">
  <img alt="React 19.1" src="https://img.shields.io/badge/React-19.1-61DAFB?style=for-the-badge&logo=react&logoColor=black">
  <img alt="Docker Compose v2.20+" src="https://img.shields.io/badge/Docker%20Compose-v2.20+-2496ED?style=for-the-badge&logo=docker&logoColor=white">
  <img alt="License AGPL v3" src="https://img.shields.io/badge/License-AGPL%20v3-3DA639?style=for-the-badge&logo=gnu&logoColor=white">
</p>

</div>

---

## ✨ Highlights

| | Capability | Where it lives |
|:--:|---|---|
| 🧩 | **Seven Spring services** — gateway, config, discovery, user, product, order, notification | [`backend/`](backend) |
| 🔐 | **Cookie-based JWT auth** with three roles (Customer · Seller · Admin), enforced at the gateway | [security-model.md](docs/architecture/security-model.md) |
| 🛒 | **Catalog → cart → Stripe checkout**, with stock validated across a service boundary | [system-overview.md](docs/architecture/system-overview.md) |
| 📬 | **Asynchronous email** over RabbitMQ — registration and order confirmation | [notification-service.md](docs/backend/services/notification-service.md) |
| 📊 | **Admin dashboard** with Chart.js analytics, MUI DataGrid CRUD, and image upload | [frontend/overview.md](docs/frontend/overview.md) |
| 🐳 | **One command to run everything** — SPA and API served from a single origin | [docker-setup.md](docs/operations/docker-setup.md) |
| 📚 | **Documentation kept with the code** — ADRs, defect register, development log | [`docs/`](docs) |

---

## 🖼 Screenshots

<div align="center">
  <img src="docs/assets/screenshots/home.png" alt="TechZone home page with the banner carousel and feature strip" width="100%">
  <br><sub><b>Home</b> — Swiper banner carousel, feature strip, and featured products</sub>
</div>

<br>

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/assets/screenshots/storefront.png" alt="Product catalog with search, category and price-range filters" width="100%"><br>
      <b>🛍 Catalog</b><br><sub>Search, category and price-range filters, paged results</sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/assets/screenshots/product-detail.png" alt="Product modal showing SKU, stock and technical specifications" width="100%"><br>
      <b>💻 Product detail</b><br><sub>SKU, stock state and technical specifications</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/assets/screenshots/cart.png" alt="Shopping cart with quantity controls and order summary" width="100%"><br>
      <b>🛒 Cart</b><br><sub>Quantity controls, discounts and running order summary</sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/assets/screenshots/checkout.png" alt="Checkout payment step with Stripe Elements card form" width="100%"><br>
      <b>💳 Checkout</b><br><sub>Four-step flow ending in Stripe Elements</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/assets/screenshots/admin-dashboard.png" alt="Admin dashboard with KPI cards" width="100%"><br>
      <b>📊 Admin dashboard</b><br><sub>Revenue, orders, catalogue and customer KPIs</sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/assets/screenshots/admin-charts.png" alt="Admin analytics charts built with Chart.js" width="100%"><br>
      <b>📈 Analytics</b><br><sub>Chart.js line, doughnut and bar breakdowns</sub>
    </td>
  </tr>
</table>

---

## 🏗 Architecture

```mermaid
flowchart TB
    B["🌐 Browser<br/>React SPA · :5173"]
    GW["🛡 API Gateway · :8080<br/>JWT · CORS · role filter"]
    CFG["⚙️ Config Server<br/>:8888"]
    EUR["🧭 Eureka Discovery<br/>:8761"]
    US["👤 User Service<br/>:8082"]
    PS["💻 Product Service<br/>:8081"]
    OS["🧾 Order Service<br/>:8083"]
    NS["📧 Notification Service<br/>:8084"]
    MQ["🐇 RabbitMQ"]
    DB[("🗄 MySQL 8<br/>three databases")]
    ST["💳 Stripe API"]
    SMTP["✉️ Gmail SMTP"]

    B -->|"/user-manager/**<br/>/product-manager/**<br/>/order-manager/**"| GW
    GW --> US
    GW --> PS
    GW --> OS
    OS -->|"REST · stock check & reduce"| PS
    OS --> ST
    US -.->|publish| MQ
    OS -.->|publish| MQ
    MQ -.->|consume| NS
    NS --> SMTP
    US --> DB
    PS --> DB
    OS --> DB
    CFG -.->|config| GW & US & PS & OS & NS
    EUR -.->|registry| GW & US & PS & OS & NS

    classDef edge fill:#0EA5E9,stroke:#0284C7,color:#fff
    classDef svc fill:#6366F1,stroke:#4F46E5,color:#fff
    classDef infra fill:#334155,stroke:#1E293B,color:#fff
    classDef ext fill:#059669,stroke:#047857,color:#fff
    class B,GW edge
    class US,PS,OS,NS svc
    class CFG,EUR,MQ,DB infra
    class ST,SMTP ext
```

<details>
<summary><b>📋 Services and ports</b></summary>

<br>

| Service | Port | Responsibility | Database |
|---|:--:|---|---|
| 🌐 **Frontend** | `5173` | React SPA; in Docker, nginx also reverse-proxies API calls | — |
| 🛡 **API Gateway** | `8080` | Routing, JWT validation, CORS, role-based filtering | — |
| ⚙️ **Config Server** | `8888` | Centralized configuration (native profile, classpath) | — |
| 🧭 **Discovery Service** | `8761` | Eureka service registry | — |
| 👤 **User Service** | `8082` | Registration, BCrypt login, JWT issuance, addresses | `ecommerce` |
| 💻 **Product Service** | `8081` | Categories, products, specifications, images, filters | `ecommerce_product` |
| 🧾 **Order Service** | `8083` | Cart, order placement, Stripe payments, analytics | `ecommerce_order` |
| 📧 **Notification Service** | `8084` | RabbitMQ consumer → transactional email over SMTP | — |

Supporting infrastructure: **MySQL 8.0** (one container, one logical database per
service) and **RabbitMQ 3** (management UI on `15672`).

The frontend never addresses a service directly — the gateway strips the
`/{service}-manager` prefix and forwards to a Eureka-resolved instance, so no
host address is hardcoded anywhere.

</details>

<details>
<summary><b>🧠 Why it is built this way</b></summary>

<br>

Nine Architecture Decision Records cover the platform-level choices — each with
its context, the alternatives weighed, and the consequences accepted.

| # | Decision |
|:--:|---|
| 0001 | [Spring Cloud Gateway on WebFlux](docs/architecture/decisions/0001-spring-cloud-gateway-webflux.md) |
| 0002 | [Eureka for service discovery](docs/architecture/decisions/0002-eureka-service-discovery.md) |
| 0003 | [Shared HMAC JWT secret](docs/architecture/decisions/0003-shared-hmac-jwt-secret.md) |
| 0004 | [Cookie-based JWT](docs/architecture/decisions/0004-cookie-based-jwt.md) |
| 0005 | [RabbitMQ for notifications](docs/architecture/decisions/0005-rabbitmq-for-notifications.md) |
| 0006 | [Config Server native profile](docs/architecture/decisions/0006-config-server-native-profile.md) |
| 0007 | [Embedded product snapshot](docs/architecture/decisions/0007-embedded-product-snapshot.md) |
| 0008 | [Single MySQL, multiple databases](docs/architecture/decisions/0008-single-mysql-multiple-databases.md) |
| 0009 | [RestTemplate for service calls](docs/architecture/decisions/0009-resttemplate-for-service-calls.md) |

</details>

---

## 🧰 Tech Stack

<table>
<tr>
<td align="center" width="33%">

**⚙️ Backend**

<img src="https://img.shields.io/badge/Java%2021-E76F00?logo=openjdk&logoColor=white" alt="Java 21"><br>
<img src="https://img.shields.io/badge/Spring%20Boot-6DB33F?logo=springboot&logoColor=white" alt="Spring Boot"><br>
<img src="https://img.shields.io/badge/Spring%20Cloud-6DB33F?logo=spring&logoColor=white" alt="Spring Cloud"><br>
<img src="https://img.shields.io/badge/Spring%20Security-6DB33F?logo=springsecurity&logoColor=white" alt="Spring Security"><br>
<img src="https://img.shields.io/badge/Maven-C71A36?logo=apachemaven&logoColor=white" alt="Maven">

</td>
<td align="center" width="33%">

**🎨 Frontend**

<img src="https://img.shields.io/badge/React%2019-61DAFB?logo=react&logoColor=black" alt="React 19"><br>
<img src="https://img.shields.io/badge/Redux%20Toolkit-764ABC?logo=redux&logoColor=white" alt="Redux Toolkit"><br>
<img src="https://img.shields.io/badge/Tailwind%20v4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS v4"><br>
<img src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" alt="Vite"><br>
<img src="https://img.shields.io/badge/MUI-007FFF?logo=mui&logoColor=white" alt="MUI">

</td>
<td align="center" width="33%">

**🔌 Infrastructure**

<img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" alt="Docker"><br>
<img src="https://img.shields.io/badge/MySQL%208-4479A1?logo=mysql&logoColor=white" alt="MySQL 8"><br>
<img src="https://img.shields.io/badge/RabbitMQ-FF6600?logo=rabbitmq&logoColor=white" alt="RabbitMQ"><br>
<img src="https://img.shields.io/badge/nginx-009639?logo=nginx&logoColor=white" alt="nginx"><br>
<img src="https://img.shields.io/badge/Stripe-635BFF?logo=stripe&logoColor=white" alt="Stripe">

</td>
</tr>
</table>

---

## 🚀 Quick Start

> **Prerequisites** — Docker with Compose **v2.20+** (the root file uses
> `include`), a Stripe **test** key pair, and a Gmail app password.

```bash
# 1 · clone with both submodules
git clone --recurse-submodules https://github.com/thaivanlam/Techzone-laptop-project.git
cd Techzone-laptop-project
#    already cloned?  →  git submodule update --init --recursive

# 2 · configure
cp .env.example .env      # fill in STRIPE_SECRET_KEY, MAIL_PASSWORD,
                          # and VITE_STRIPE_PUBLISHABLE_KEY

# 3 · launch the whole platform
docker compose up --build
```

Then open **<http://localhost:5173>**. The first build compiles seven Maven
projects and installs the npm dependencies, so expect several minutes — later
runs are cached.

A fresh stack starts with an empty shop. To load a demo catalogue of 14 laptops
across 4 categories, add the `seed` profile:

```bash
COMPOSE_PROFILES=prod,seed docker compose up -d
```

<details>
<summary><b>🔀 Three ways to run it</b></summary>

<br>

| Mode | What runs in Docker | Compose file | Use it when |
|---|---|---|---|
| **1 — Full stack** | Backend **and** frontend | [`docker-compose.yml`](docker-compose.yml) | Demoing, or a clean end-to-end check |
| **2 — Backend in Docker** | Backend only; the SPA on the Vite dev server | [`backend/docker-compose.yml`](backend/docker-compose.yml) | Working on the UI, with hot reload |
| **3 — Hybrid dev** | Infrastructure only; services run from the IDE | [`backend/docker-compose.yml`](backend/docker-compose.yml) | Debugging a service with breakpoints |

Do not run the root and the `backend/` Compose projects at the same time — they
share fixed container names and use separate MySQL volumes.

Full walkthrough: [docs/operations/running-locally.md](docs/operations/running-locally.md).

</details>

<details>
<summary><b>⚙️ Key environment variables</b></summary>

<br>

The root `.env` is the single configuration point — `docker-compose.yml` reads it
for the frontend and, through `include`, for every backend service.

| Variable | Default | Meaning |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `prod` | Config Server profile. `dev` targets `localhost`, `prod` targets Docker hostnames |
| `COMPOSE_PROFILES` | `prod` | Which containers start. Empty ⇒ infrastructure only; add `seed` for the demo catalogue |
| `STRIPE_SECRET_KEY` | — | 🔑 Order Service payments |
| `MAIL_PASSWORD` | — | 🔑 Gmail app password for Notification Service |
| `VITE_STRIPE_PUBLISHABLE_KEY` | — | 🔑 Baked into the frontend bundle **at build time** |
| `FRONTEND_PORT` / `FRONTEND_URL` | `5173` / `http://localhost:5173` | Published port, CORS origin, Stripe return URL — keep the two in sync |
| `VITE_BACK_END_URL` | *(empty)* | Empty ⇒ same origin ⇒ nginx proxies to the gateway. **Build time** |
| `API_GATEWAY_URL` | `http://api-gateway:8080` | Where the frontend container forwards proxied calls. **Run time** |
| `MYSQL_PORT` | `3306` | Raise it (for example `3307`) when a native MySQL already holds 3306 |

The two profile variables must agree: `COMPOSE_PROFILES=prod` with
`SPRING_PROFILES_ACTIVE=dev` starts containers that look for `localhost` inside
their own network and fail.

Values marked **build time** are inlined into the bundle by Vite — after changing
one, run `docker compose build frontend && docker compose up -d frontend`.

`.env.example` carries placeholders only; real secrets never belong in the
repository.

</details>

<details>
<summary><b>🔗 Endpoints and demo accounts</b></summary>

<br>

| Surface | URL |
|---|---|
| 🛍 Storefront | <http://localhost:5173> |
| 🛡 API Gateway | <http://localhost:8080> |
| 🧭 Eureka dashboard | <http://localhost:8761> |
| 🐇 RabbitMQ management | <http://localhost:15672> |
| ⚙️ Config Server | <http://localhost:8888> |
| 📘 Swagger UI *(dev profile only)* | <http://localhost:8080/user-manager/swagger-ui.html> |

Demo accounts, created on first startup by each service's `CommandLineRunner`:

| Username | Email | Roles |
|---|---|---|
| `admin` | admin@example.com | 👑 ADMIN + SELLER + USER |
| `seller1` | seller1@example.com | 🏪 SELLER |
| `user1` · `user2` | user1@example.com · user2@example.com | 🛒 USER |

Their passwords are listed in
[docs/operations/running-locally.md](docs/operations/running-locally.md#seeded-users).
They are development defaults and must be changed before any public deployment.

</details>

---

## 🗂 Repository Layout

```
Techzone-laptop-project/
├── 📦 backend/               # submodule — Spring Boot 3.5 / Spring Cloud 2025
│   ├── api-gateway/          #   :8080  routing, JWT, CORS
│   ├── config-server/        #   :8888  centralized configuration
│   ├── discovery-service/    #   :8761  Eureka registry
│   ├── user-service/         #   :8082  identity, auth, addresses
│   ├── product-service/      #   :8081  catalog, specifications, images
│   ├── order-service/        #   :8083  cart, orders, Stripe
│   └── notification-service/ #   :8084  RabbitMQ → SMTP
├── 🎨 frontend/              # submodule — React 19 + Redux Toolkit + Tailwind v4
├── 📚 docs/                  # consolidated documentation for both submodules
├── 🐳 docker-compose.yml     # the full stack on one network
└── 📄 CHANGELOG.md           # user-visible changes, Keep a Changelog format
```

> ℹ️ `backend/` and `frontend/` are independent git repositories. This
> superproject records only their commit pointers — documentation edits belong
> in [`docs/`](docs) here.

---

## 📚 Documentation

Everything starts at **[`docs/README.md`](docs/README.md)**, which indexes the
full set and records the rules that keep it in step with the code.

| 🧭 | Area | Document |
|:--:|---|---|
| 🏗 | Services, ports, end-to-end request flow | [architecture/system-overview.md](docs/architecture/system-overview.md) |
| 🔐 | JWT issuance, cookie auth, role enforcement | [architecture/security-model.md](docs/architecture/security-model.md) |
| 🧠 | Platform decisions and trade-offs | [architecture/decisions/](docs/architecture/decisions/) |
| ⚙️ | Backend modules and conventions | [backend/overview.md](docs/backend/overview.md) |
| 🔌 | Every gateway-exposed endpoint | [backend/api-reference.md](docs/backend/api-reference.md) |
| 🐞 | Verified defect register | [backend/known-defects.md](docs/backend/known-defects.md) |
| 🧪 | The twelve defect classes found here | [quality/bug-taxonomy.md](docs/quality/bug-taxonomy.md) |
| 🎨 | Frontend stack, structure, and trade-offs | [frontend/overview.md](docs/frontend/overview.md) |
| 🚀 | Startup modes, environment variables, seeded users | [operations/running-locally.md](docs/operations/running-locally.md) |
| 🐳 | Compose topology, images, nginx proxy | [operations/docker-setup.md](docs/operations/docker-setup.md) |
| 🌱 | Database creation and catalogue seeding | [operations/database-seeding.md](docs/operations/database-seeding.md) |
| 📓 | How each change came about, session by session | [dev-log/](docs/dev-log/) |

---

## 🤝 Contributing

This is a thesis project, so the workflow is deliberately documentation-first.

1. **Read first.** Start from [`docs/README.md`](docs/README.md) and read what
   covers the area you are about to touch.
2. **Work in the right repository.** Code changes belong in the `backend/` or
   `frontend/` submodule; the superproject records the new pointer.
3. **Update the docs in the same change set.** Endpoints, config keys,
   environment variables, data model, flows, and trade-offs all count.
4. **Log the session.** Add an entry at the top of the current month's file in
   [`docs/dev-log/`](docs/dev-log) — naming secret variables, never their values,
   and never a live host's address.
5. **Record platform decisions as ADRs.** Copy
   [`template.md`](docs/architecture/decisions/template.md); accepted ADRs are
   immutable and are superseded, never rewritten.
6. **English only**, in every document, regardless of the language used in
   conversation or commits.

---

## 📄 License

Distributed under the **GNU Affero General Public License v3.0** — see
[LICENSE](LICENSE).

<div align="center">
<br>

**Copyright © 2025 Thái Văn Lâm**

<sub>Built as the graduation thesis <i>“Laptop E-commerce Platform Using Microservices Architecture”</i></sub>

</div>
