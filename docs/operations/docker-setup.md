# Docker Setup

Reference for how the platform is packaged into containers: which Compose file
to use, how the frontend image is built, and how the SPA reaches the API Gateway
inside the Docker network.

For the step-by-step startup procedure see
[running-locally.md](running-locally.md).

---

## Compose Files

| File | Starts | Use it when |
|---|---|---|
| [`docker-compose.yml`](../../docker-compose.yml) (repo root) | Backend **and** frontend | You want the whole platform in Docker |
| [`backend/docker-compose.yml`](../../backend/docker-compose.yml) | Backend only | You run the SPA with `npm run dev`, or only need infrastructure |

The root file does not duplicate the backend services. It pulls them in with
Compose's `include`, so `backend/docker-compose.yml` remains the single
definition of every backend container:

```yaml
name: techzone

include:
  - path: backend/docker-compose.yml
    env_file: .env
```

`include` requires **Docker Compose v2.20+**. Two consequences worth knowing:

- Build contexts inside the included file stay relative to `backend/`, so the
  backend keeps working standalone.
- `env_file: .env` points at the `.env` **next to the root file**, so the whole
  stack — backend secrets included — is configured from that one file.

### The two projects are mutually exclusive

The root file sets the Compose project name to `techzone`; running from
`backend/` uses the project name `backend`. Containers keep fixed
`container_name` values (`mysql`, `api-gateway`, …), so the two projects cannot
run at the same time — the second one fails on a name conflict. They also get
separate MySQL volumes (`techzone_mysql_data` vs `backend_mysql_data`), which
means separate data. Pick one entry point and stay with it.

---

## Container Topology

```
                    host
  browser ──▶ :5173 ─┐                        ┌─ :8080 api-gateway (published)
                     │                        │
        ┌────────────▼────────────┐           │
        │ frontend (nginx)        │           │
        │  /            → dist/   │           │
        │  /user-manager/    ─────┼──────────▶│
        │  /product-manager/ ─────┼──────────▶│  ecommerce-network
        │  /order-manager/   ─────┼──────────▶│  (bridge)
        └─────────────────────────┘           │
                                              ▼
                            api-gateway ──▶ user / product / order /
                                            notification services
                                    │
                            mysql · rabbitmq · config-server · discovery-service
```

All containers, frontend included, share the `ecommerce-network` bridge, so they
address each other by service name (`api-gateway`, `mysql`, `rabbitmq`,
`discovery-service`, `config-server`).

| Container | Host port | Container port |
|---|---|---|
| `frontend` | `${FRONTEND_PORT:-5173}` | 80 |
| `api-gateway` | 8080 | 8080 |
| `discovery-service` | 8761 | 8761 |
| `config-server` | 8888 | 8888 |
| `product-service` | 8081 | 8081 |
| `user-service` | 8082 | 8082 |
| `order-service` | 8083 | 8083 |
| `notification-service` | 8084 | 8084 |
| `mysql` | 3306 | 3306 |
| `rabbitmq` | 5672, 15672 | 5672, 15672 |
| `db-seed` | — | — (one-shot, profile `seed`) |

---

## Database Initialisation

Two folders under `backend/` feed the database, at two different moments:

- [`backend/init-db/`](../../backend/init-db) is mounted into the MySQL
  container's `/docker-entrypoint-initdb.d` and creates the three logical
  databases (`ecommerce`, `ecommerce_product`, `ecommerce_order`) on a fresh
  volume, before any service starts.
- [`backend/seed-db/`](../../backend/seed-db) is applied afterwards by the
  one-shot `db-seed` container, which loads a demo catalogue once
  product-service has created its tables.

The split exists because the schema belongs to Hibernate (`ddl-auto: update`):
entrypoint scripts run before any table exists, so they cannot insert rows. The
`mysql` service also sets no `MYSQL_DATABASE`, so the init script alone decides
which databases exist and with which collation.

`db-seed` is gated behind the `seed` Compose profile and skips itself when the
catalogue already has rows:

```bash
COMPOSE_PROFILES=prod,seed docker compose up -d
```

Full detail — including the `product_seq` id-generator gotcha — in
[database-seeding.md](database-seeding.md).

---

## Frontend Image

[`frontend/Dockerfile`](../../frontend/Dockerfile) is a two-stage build:

1. **`node:22-alpine`** — `npm ci`, then `npm run build` produces the static
   bundle in `dist/`.
2. **`nginx:1.27-alpine`** — serves `dist/` and reverse-proxies API calls.

Vite inlines `VITE_*` variables **at build time**, so they are passed as build
args, written into `.env.production` inside the builder stage, and baked into
the bundle. Changing any of them requires
`docker compose build frontend`, not just a restart.

| Build arg | Default | Effect |
|---|---|---|
| `VITE_BACK_END_URL` | `""` | Axios base URL. Empty ⇒ the SPA calls its own origin |
| `VITE_FRONTEND_URL` | `http://localhost:5173` | Stripe `return_url` after payment |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `""` | Stripe Elements publishable key |

| Runtime variable | Default | Effect |
|---|---|---|
| `API_GATEWAY_URL` | `http://api-gateway:8080` | Where nginx forwards proxied API calls |
| `NGINX_RESOLVER` | `127.0.0.11` | DNS used to re-resolve the gateway |

Runtime variables are substituted into the nginx config on container start
(the base image runs `envsubst` over `/etc/nginx/templates/*.template`), so they
can be changed with a restart and no rebuild.

### Why nginx proxies the API

[`frontend/nginx/default.conf.template`](../../frontend/nginx/default.conf.template)
forwards the three gateway prefixes to `api-gateway:8080`:

```nginx
location ~ ^/(user-manager|product-manager|order-manager)/ {
    set $upstream "${API_GATEWAY_URL}";
    proxy_pass $upstream$request_uri;
}
```

`VITE_BACK_END_URL` is left empty so the browser sends every API call to the
origin it loaded the page from. That matters for three reasons:

- **No CORS.** Same-origin requests skip preflight entirely; the gateway's
  `allowedOrigins` list stops being a failure point.
- **First-party cookie.** The `springBootEcom` JWT cookie is set and sent on the
  same origin, which no browser privacy setting blocks.
- **The container really talks to the container.** nginx reaches the gateway
  over `ecommerce-network` by service name, so the pair works unchanged if the
  published ports move.

`proxy_pass` with a variable is deliberate: it forces nginx to re-resolve the
hostname through Docker's embedded DNS (`resolver 127.0.0.11`) instead of
caching the gateway's IP from startup, so a restarted gateway is picked up
again. Because a variable `proxy_pass` drops the request URI, `$request_uri` is
re-appended explicitly.

Two more details in that config: `client_max_body_size 25m` (product image
uploads pass through this proxy) and `try_files $uri $uri/ /index.html` (React
Router routes must not 404 on refresh).

### Running the frontend container on its own

```bash
cd frontend
docker build -t techzone-frontend .

# gateway running on the host (npm-style backend, or backend/docker-compose.yml)
docker run --rm -p 5173:80 \
  -e API_GATEWAY_URL=http://host.docker.internal:8080 \
  techzone-frontend
```

No rebuild is needed to retarget the gateway — only `API_GATEWAY_URL` changes.
A rebuild **is** needed to change the Stripe publishable key or the Stripe
return URL.

---

## Health Checks and Startup Order

Compose brings the stack up in dependency order using health checks:

```
mysql, rabbitmq ─┐
config-server ───┴─▶ discovery-service ─▶ api-gateway ─┬─▶ user/product/order/notification
                                                       └─▶ frontend
```

| Container | Probe |
|---|---|
| `mysql` | `mysqladmin ping` |
| `rabbitmq` | `rabbitmq-diagnostics ping` |
| `config-server`, `discovery-service`, `api-gateway` | `timeout 3 bash -c '</dev/tcp/127.0.0.1/<port>'` |
| `frontend` | `GET /healthz` (served by nginx) |

The three Spring containers use a TCP probe rather than `GET /actuator/health`
because `mcr.microsoft.com/openjdk/jdk:21-ubuntu` ships **neither `curl` nor
`wget`** — an HTTP probe fails with `executable file not found`, the container
never turns healthy, and every service waiting on it stalls. `bash` and
`timeout` are present, so `/dev/tcp` is the probe that works without adding
packages to the image.

Spring binds its port only after startup completes, so "port open" is a fair
readiness signal for the process. It is not a statement about downstream
readiness: the gateway accepts connections before its routes' targets have
registered with Eureka, and those routes answer `503` until they do.

`frontend` waits for `api-gateway` to be healthy. That is a convenience, not a
requirement: thanks to the `resolver` directive nginx starts even if the gateway
is absent and returns `502` for API paths until it appears.

---

## Rebuilding

| Change | Command |
|---|---|
| Frontend source or any `VITE_*` value | `docker compose build frontend && docker compose up -d frontend` |
| `API_GATEWAY_URL` only | `docker compose up -d frontend` |
| One backend service | `docker compose build <service> && docker compose up -d <service>` |
| Everything | `docker compose up --build` |
| Load the demo catalogue | `docker compose --profile seed up db-seed` |
| Reset the database | `docker compose down -v` (drops `techzone_mysql_data`, so `init-db/` re-runs) |

---

## Related Documents

- [running-locally.md](running-locally.md) — startup procedure and environment variables
- [database-seeding.md](database-seeding.md) — database creation and the catalogue seeder
- [../frontend/overview.md](../frontend/overview.md) — SPA stack and structure
- [../backend/services/api-gateway.md](../backend/services/api-gateway.md) — routes, CORS, JWT enforcement
- [../architecture/system-overview.md](../architecture/system-overview.md) — services and request flow
