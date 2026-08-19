# Architecture

Upstream Dashboard — SaaS operations console for an InferHub publisher. Live production: Vercel frontend + VPS backend + auto-pricing daemon + finance ledger.

## System topology

```
┌───────────────────────────────┐
│  Browser                      │
│  https://upstream-static.     │
│  vercel.app (React/Vite)      │
└──────────────┬────────────────┘
               │ /api/* (rewrite via vercel.json)
               ▼
┌───────────────────────────────┐
│  Vercel Edge (proxy)          │
│  rewrite → ops.budgezen.com   │
└──────────────┬────────────────┘
               │ HTTPS :443
               ▼
┌───────────────────────────────┐
│  VPS nginx (:80/:443)         │
│  ops.budgezen.com             │
└──────────────┬────────────────┘
               │ proxy_pass
               ▼
┌───────────────────────────────┐
│  Flask backend (127.0.0.1:8124)│
│  wwma-upstream-backend.service │
│  auth /api/reliability/* SSE   │
│  InferHub poller               │
└──────────────┬────────────────┘
               │ PostgreSQL :6432
               ▼
┌───────────────────────────────┐
│  PostgreSQL (schema memory)   │
│  reliability + finance tables │
└───────────────────────────────┘

Daemon (separate systemd user unit):
  wwma-auto-pricing.service
  scripts/auto_pricing.py --interval 60
  → 60s pricing cycle, PID-lock guarded
  → persists reliability events + heartbeat
```

## Components

- **Frontend** — React + Vite, deployed to Vercel project `upstream-static`. Dark-themed Geist-style design system. Reliability dashboard is the post-login landing (`/`). All 18 routes.
- **Backend** — Flask (waitress) on 127.0.0.1:8124. Serves authenticated REST (`/api/reliability/*`) + SSE stream. Reads `DASHBOARD_PASSWORD` (env) for login → token. CORS bound to allowed origins.
- **Reverse proxy** — nginx on VPS binds :80 (redirect) + :443 (TLS, Let's Encrypt). `proxy_pass` to Flask. `vercel.json` rewrites `/api/*` to `https://ops.budgezen.com/api/:path*`.
- **Daemon** — `scripts/auto_pricing.py --interval 60`. One systemd user unit `wwma-auto-pricing.service`. Single PID lock; no auto-kill, no circuit breaker. Writes reliability cycles/events/aggregates + heartbeat. DB outage = best-effort persistence with JSON/log fallback.
- **Finance** — PostgreSQL schema `memory`. `backend/ledger_update.py` CLI manages assets/impairments/refunds/payouts. `scripts/gen_finance.py` regenerates `keuangan.xlsx` + P&L + balance sheet (IDR→USD via live forex API). DB is the single source of truth; `ledger.json` is a synced mirror.
- **Auth** — password → signed token (expires 24h). All reliability + finance endpoints require Bearer token.

## Data flow (reliability)

1. Daemon runs a 60s cycle over 38 models.
2. Each cycle/event gets a UUID v4 `cycle_id`/`event_id` (dedup by event_id).
3. After cycle + JSON state write, daemon emits a heartbeat and persists events to DB.
4. Frontend SSE stream (`/api/reliability/stream`) receives cycle-complete events.
5. REST endpoints provide initial load, history, recovery after SSE reconnect.
6. ARM/DISARM toggles daemon control; every transition is audited (operator, old/new state, source, result).

## Deployment topology

- **Vercel** (frontend): `upstream-static.vercel.app` — build via `vercel build --prod`, deploy `vercel deploy --prod --prebuilt`.
- **VPS** `root@82.25.62.204` (backend + daemon + finance): checkout `/home/gamesim/dashboard`, venv `/home/gamesim/.venv-dash`. Systemd user units (user `gamesim`): `wwma-upstream-backend.service`, `wwma-auto-pricing.service`.
- **Secrets** live server-side only (systemd drop-in / proc environ). Never committed.

## Security posture

- Auth: password → Bearer token, 24h expiry.
- No secrets in repo; `DASHBOARD_PASSWORD`, `UPSTREAM_DB`, `FOREX_KEY` referenced by name only in docs.
- CI is build+test only (no CD). Deploys are manual + PR-merged.
- Branch protection on `main` (require PR + CI green).
