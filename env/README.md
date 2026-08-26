# Environment Templates

Secret-free `.env` templates for the three startup modes documented in
[`docs/operations/running-locally.md`](../docs/operations/running-locally.md).
Safe to commit — every secret field is left blank. Copy the file(s) for the
mode you want, fill in secrets locally, and never commit the copy (the root
`.gitignore` already excludes `.env` everywhere in the tree).

| Mode | Files | Copy to |
|---|---|---|
| 1 — Full stack in Docker | [`mode1-full-stack.env`](mode1-full-stack.env) | repo root `.env` |
| 2 — Backend in Docker, frontend on Vite | [`mode2-backend-docker.backend.env`](mode2-backend-docker.backend.env) + [`mode2-backend-docker.frontend.env`](mode2-backend-docker.frontend.env) | `backend/.env` + `frontend/.env` |
| 3 — Hybrid dev (infra only; services from the IDE) | [`mode3-hybrid-dev.backend.env`](mode3-hybrid-dev.backend.env) + [`mode3-hybrid-dev.frontend.env`](mode3-hybrid-dev.frontend.env) | `backend/.env` + `frontend/.env` |

```bash
# Example: switch to Mode 3
cp env/mode3-hybrid-dev.backend.env backend/.env
cp env/mode3-hybrid-dev.frontend.env frontend/.env
```

These mirror `.env.example` at the root and inside `backend/`/`frontend/`, but
one file per mode instead of one shared template you hand-edit when switching
modes. Keep all four in sync if a variable is added, renamed, or removed in
the underlying `docker-compose.yml` or `*-dev.yml` config files.
