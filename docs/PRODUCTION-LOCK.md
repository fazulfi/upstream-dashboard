# Production Lock — upstream-dashboard

**Status:** phase 6 evidence record — Phase 1 Reliability **IMPLEMENTED, deployed, and verified**
**Repository:** `fazulfi/upstream-dashboard` / `main`
**Production frontend:** <https://upstream-static.vercel.app> (Vercel project `upstream-static`)
**Production host:** `faiz-prod` / `82.25.62.204`
**Backend:** `https://ops.budgezen.com` (nginx :443 → Flask `127.0.0.1:8124`)
**Current `main` commit:** `613d204`
**Last reviewed:** 2026-08-17

This document is the release gate for production. A phase is complete only when its evidence is recorded; a green local test without deployment evidence is not a production lock.

## Production inventory (as shipped)

- **VPS host:** `root@82.25.62.204`, services run under the `gamesim` user.
- **Checkout:** `/home/gamesim/dashboard` (repository `main`).
- **Backend venv:** `/home/gamesim/.venv-dash`; backend entry `backend/app.py` served on `127.0.0.1:8124` behind nginx TLS :443.
- **systemd user units (as `gamesim`):**
  - `wwma-upstream-backend.service` — Flask/waitress backend :8124 (`EnvironmentFile=/home/gamesim/.hermes-suisui/backend.env`).
  - `wwma-auto-pricing.service` — auto-pricing daemon (`--interval 60`).
  - `wwma-finance.service` + `wwma-finance.timer` — daily workbook regen.
- **Frontend:** Vercel project `upstream-static`, deployed from `frontend/`; `vercel.json` rewrites `/api/:path*` → `https://ops.budgezen.com/api/:path*`.
- **Auth secret:** `DASHBOARD_PASSWORD` is a server-side secret loaded from the protected runtime env file. **Never place the actual value in any document or repository** — it exists only on the VPS and must be referenced by name.

## Phase 1 — Contract and scope

- Auto-pricing reads `catalog[slug][model].asksIn` per provider slug. Same-name models from another slug are never pooled.
- The active ask is obtained from the publisher-provider asks endpoint and is treated as one current position per provider/model.
- Trigger area uses the official-price boundary. In-area prices are ignored; valid lower prices undercut by `official × 0.001`; valid higher prices are used for resume; no valid reference resumes toward `50% official − offset` when that target is above the current ask.
- Database persistence is part of the operational contract: API calls, operations, and latest state are retained in PostgreSQL.

**Gate:** contract is documented in `docs/auto-pricing.md` (REV12/REV13) and covered by scripts tests.

## Phase 2 — Source and tests

Required local gates from repository root:

```bash
python -B -m unittest scripts.tests.test_self_undercut -v
python -B -m py_compile scripts/auto_pricing.py backend/app.py backend/db_schema.py
python -B -m compileall -q scripts/ backend/
cd backend && python -B -m pytest tests -q -p no:warnings
cd ../frontend && npm test -- --run && npm run build
```

The daemon tests must cover provider-scoped books, trigger decisions, DB helper behavior, and the 10-cycle oscillation regression contract. Backend tests must cover cached catalog/orderbook responses and schema-facing behavior.

**Gate:** all commands exit 0; build warnings are documented and non-blocking.

## Phase 3 — Repository and CI

- `main` is the production branch.
- `.github/workflows/ci.yml` is the single CI workflow. It runs Python compilation, daemon unittest, backend pytest/coverage, frontend lint, frontend tests, and build.
- Generated files, credentials, `.env*`, Vercel metadata, coverage, and probe artifacts must not be committed.
- Production changes must exist in Git before they are called locked. A file copied directly to the VPS is deployment evidence, not source-of-truth evidence.

**Gate:** `git diff --check`, secret scan, CI success for the pushed commit, and clean working tree.

## Phase 4 — Backend and database

The backend runs as `wwma-upstream-backend.service` under the `gamesim` user and serves `127.0.0.1:8124` behind nginx. The service must load `DASHBOARD_PASSWORD` and API credentials from a protected runtime environment file; secrets must never be committed in a unit file.

PostgreSQL database `upstream` must contain:

- `auto_pricing_ops`: append-only operation history;
- `auto_pricing_state`: latest state by `(slug, model_id)`;
- `auto_pricing_api_log`: API endpoint/status/latency history;
- `auto_pricing_config`: active trigger configuration.

Retention for operation/API logs is 30 days. A rollback requires a database backup before schema or backend changes.

**Gate:** `/health` is HTTP 200, the three auto-pricing tables exist, rows are fresh, and the latest backup is present.

## Phase 5 — Daemon and frontend deployment

Daemon deployment is performed as the `gamesim` user through the systemd user unit:

```bash
systemctl --user -M gamesim@.host restart wwma-auto-pricing.service
systemctl --user -M gamesim@.host is-active wwma-auto-pricing.service
pgrep -af '/home/gamesim/scripts/auto_pricing.py'
```

There must be exactly one daemon process. The ARM file is an intentional operational switch:

```bash
cat /home/gamesim/.hermes-suisui/logs/auto-pricing-arm
```

Frontend production is the existing Vercel project `upstream-static`, deployed from `frontend/`. The old `frontend` and broken `dashboard` projects are not production targets.

**Gate:** deployed source hash matches the reviewed commit, one daemon is active, ARM state is recorded, and the public frontend returns HTTP 200.

## Phase 6 — Runtime lock and soak

Before declaring production locked, capture all of the following:

1. Fresh daemon cycle timestamp and summary: 36 models, zero errors.
2. Exactly one active daemon and one backend service.
3. PostgreSQL counts and newest timestamps for `auto_pricing_ops`, `auto_pricing_state`, and `auto_pricing_api_log`.
4. At least 10 consecutive cycles with no `undercut → resume → undercut` alternation for any model.
5. Representative provider-scoped state rows for `codebuddy`, `codebuddy-cn`, and `cline-pass`.
6. Public frontend HTTP 200 and current deployment asset.
7. Rollback paths tested or explicitly recorded:
   - daemon backup restore + service restart;
   - backend backup restore + service restart;
   - database backup restore procedure;
   - Vercel previous deployment promotion.

The 2026-08-17 soak evidence recorded zero oscillating models across cycles 2146–2156, with zero daemon errors. This is a bounded soak result, not a guarantee about future market changes; continue monitoring the persisted operation history.

**Final lock gate:** source is committed and pushed, CI is green, production hashes match the reviewed source, services are unique and active, database persistence is fresh, frontend is public and correct, and rollback artifacts are available.

## Phase 1 Reliability — shipped system reference

Phase 1 Reliability is implemented, deployed, and verified. This section records the canonical
facts operators and future work must reference. Details live in `docs/auto-pricing.md` and
`docs/OPS-RUNBOOK.md`.

### Reliability REST endpoints (backend, `https://ops.budgezen.com`)

All routes require authentication (global auth gate — Bearer session token or `X-Auth`); only
`/health` and `/api/login` are unauthenticated.

| Endpoint | Purpose |
|---|---|
| `GET /api/reliability/summary` | Live summary: armed state, service status, last heartbeat, duration, cycle/model/hold/error/delayed counts, DB freshness, stale flag, and `reliability_aggregates` (limit 200). |
| `GET /api/reliability/cycles` | Cycle history from `reliability_cycles` (`limit` default 50, max 200, newest first). |
| `GET /api/reliability/events` | Event timeline from `reliability_events`, cursor-paginated (`?after=<cursor>`, `limit` default 100, max 500). |
| `GET /api/reliability/models` | Latest `auto_pricing_state` per `(slug, model_id)` (up to 500 rows, newest first). |
| `POST /api/reliability/arm` | Arm the daemon (authenticated, audited; optional `reason` in JSON body). |
| `POST /api/reliability/disarm` | Disarm the daemon (authenticated, audited; optional `reason` in JSON body). |
| `GET /api/reliability/stream` | Backend-owned **SSE** stream (`text/event-stream`), replayed from the durable event cursor. |

### SSE stream

- Transport is fetch-based Server-Sent Events, never query-token auth; auth comes from the
  standard `Authorization` header (session token) via the global gate.
- Reconnect is cursor-based: the client passes `Last-Event-ID` (or `?after=`) and the server
  replays any events with `cursor > last_id` (batch of up to 50, ascending) before continuing
  to poll. This makes missed events recoverable from PostgreSQL — a disconnected client never
  loses durable events and must not silently show stale state as current.
- Server holds the stream up to 30s per request, emits `: keepalive` when idle, and re-polls
  every `interval` (default 2s, bounded 0.5–10s). Headers set `Cache-Control: no-cache` and
  `X-Accel-Buffering: no` so nginx does not buffer the stream.

### Auth

Same session/password model as the rest of the dashboard (24h HMAC session token via
`/api/login`, or `X-Auth` password header). No reliability-specific auth system was added.
Every ARM/DISARM transition is additionally audited (see below).

### Event schema

Daemon emits durable reliability events into PostgreSQL:

- `reliability_cycles(cycle_id PK, started_at, completed_at, status, summary)` — one row per daemon cycle.
- `reliability_events(event_id PK uuid, cycle_id FK, cursor bigserial UNIQUE, event_type, severity, occurred_at, payload jsonb)` — one row per event; `event_id` is the idempotency key (`ON CONFLICT (event_id) DO NOTHING`).
- `reliability_aggregates(bucket_start, bucket_granularity, metric, value, updated_at)` — upserted rollups.

Event types observed in the daemon: `cycle_started`, `catalog_empty`, `cycle_completed`,
plus `model_hold`/model decision rows and `delayed_data` warnings in the event history.
Severity levels used: `info`, `warning`, `error`, `critical`.

### Retention

- Raw operational rows: `auto_pricing_ops` and `auto_pricing_api_log` — **30 days** (existing policy, cleaned at daemon start).
- Raw reliability events: **30 days**, deleted only when their parent cycle is complete.
- Aggregates: **90 days** — **hourly** buckets for the latest 30 UTC days, **daily** buckets for days 31–90. Rollups are recomputed (upserted) at daemon start by the bounded W6 maintenance routine. Cleanup/rollup runs at daemon startup; a failure is recorded as an error status and is not treated as healthy cleanup.

### Heartbeat & severity

- One compact heartbeat is emitted after every completed cycle (cycle ID, start/end timestamps,
  duration, model count, undercut/resume/hold/error counts). Heartbeat health requires cycle
  completion and a JSON state write; DB failure is tracked as a separate `persistence_warning`,
  not as a failed heartbeat.
- Severity levels `info`/`warning`/`error`/`critical` are used across the event stream.

### ARM/DISARM audit

ARM and DISARM are atomic transitions (single authenticated click, no confirmation dialog) and
are persisted into `auto_pricing_control` + `auto_pricing_control_audit`: `event_id`, `operator`,
`occurred_at`, `old_armed`, `new_armed`, `source`, `result`, `reason`, `correlation_id`. The ARM
flag file (`~/.hermes-suisui/logs/auto-pricing-arm`) is written atomically (`tmp` + `fsync` +
`os.replace`); a file-write failure rolls the DB state back and records `result=file_write_failed`.
A disarmed daemon continues running cycles in dry-run mode (no PUT); re-arming restores normal PUTs.

### 24-hour observation gate

The minimum 24-hour post-deployment observation period has elapsed with heartbeat continuity,
service status, DB freshness, and pricing-operation health recorded. Phase 1 is declared
complete per owner directive (commit `509868d`). This satisfies the completion threshold; the
monthly 99.9% availability target remains a separate ongoing metric.

### Policy highlights (as shipped)

- **No circuit breaker.** Five consecutive technical errors on a model raise a dashboard/audit
  warning only; pricing is never automatically stopped and no other model/provider scope changes.
  Delayed orderbook data (≥120s) is a warning, not a technical error.
- **DB outage policy.** If PostgreSQL is unavailable while InferHub/pricing logic are healthy,
  the daemon continues its existing pricing and PUT behavior. DB persistence is best-effort; the
  JSON/log path remains available and the failure is visible as a `persistence_warning`. No
  pricing is blocked solely because the database is unavailable.
- **Duplicate daemon policy.** A PID/lock file (`~/.hermes-suisui/logs/auto-pricing.pid`) is the
  primary daemon identity. A dead recorded PID permits takeover; a live recorded PID requires
  **manual disarm/investigation** — there is **no automatic process kill**. Exactly one daemon
  is the desired steady state.
- **Page removal criteria.** A dashboard page is removable only when all three hold: absent from
  active navigation/important routes, no active usage in code/runtime audit, and no remaining MVP
  operational function. As of the 2026-08-17 audit, no MVP page satisfies all criteria; none is deleted.
- **Browser/accessibility.** Modern Chrome/Edge/Firefox/Safari (incl. iOS Safari) are supported;
  manual smoke tests cover login, reliability landing, cycle/model/event views, filters, SSE
  reconnect, ARM/DISARM audit, responsive layout, keyboard navigation, and error/warning states.
  Accessibility baseline: keyboard nav, visible focus, contrast, semantic labels. Light mode only.

## Known non-locking external drift

- Vercel `upstream-static` is manually deployed and must be explicitly redeployed after frontend changes.
- A separate Vercel `dashboard` project has a failing GitHub integration and is not the production frontend. It must not be used as production evidence.
- GitHub repository metadata must point to `https://upstream-static.vercel.app`; stale project links are not valid lock evidence.
