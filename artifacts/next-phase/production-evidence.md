# Production Evidence — Upstream Dashboard Phase 1 Reliability

Living status document. **Captured 2026-08-19T07:06Z (UTC)** by Sisyphus.

## Frontend
- URL: `https://upstream-static.vercel.app` → HTTP 200
- Vercel project: `upstream-static` (dark-themed React/Vite dashboard)
- Last deployed bundle: dark theme active (bg #0A0A0A), full design system CSS

## Backend
- URL: `https://ops.budgezen.com` (health → HTTP 200)
- Topology: nginx :443 → Flask waitress :8124 (127.0.0.1)
- VPS: `root@82.25.62.204`, checkout `/home/gamesim/dashboard`, venv `/home/gamesim/.venv-dash`
- Unit: `wwma-upstream-backend.service` (user gamesim, enabled, drop-in `phase1-env.conf`)

## Reliability summary (live, 2026-08-19T07:06Z)
```json
{"armed":true,"cycle_count":608,"model_count":38,
 "service_status":"running","stale":false,
 "db_freshness":"2026-08-19T07:06:24.971353+00:00",
 "last_heartbeat":"2026-08-19T07:06:24.952150+00:00",
 "error_count":0,"hold_count":0,"delayed_count":0}
```
- armed: **true** (ARMED)
- service: **running / healthy**
- cycles processed: **608**
- models/cycle: **38**
- errors / holds / delayed: **0 / 0 / 0**
- DB freshness: **fresh** (2026-08-19T07:06:24Z)
- stale: **false**

## Daemon
- Single process: `PID 1215385`, uptime `11:45:54` (~11.8h), no restart
- Command: `/home/gamesim/.venv-dash/bin/python3 /home/gamesim/dashboard/scripts/auto_pricing.py --interval 60`
- Interval: **60s**
- Unit: `wwma-auto-pricing.service` (user gamesim, enabled, drop-in `phase1-env.conf`)
- Cycle cadence: continuous every ~60s, each `38 model / 3-4 undercut / 34-35 hold / 0 error`

## Finance (PostgreSQL, schema `memory`)
- Host: `127.0.0.1:6432`, DB `wuthering_waves_multi_agent`, role `wwma_app`
- **60 assets** (55 active + 5 retired, incl CodeBuddy CN A-061 32x13125 IDR + CodeBuddy global A-062 160x2500 IDR)
- 25 impairments, 18 payouts, 1 refund
- Source of truth: **DB** (ledger.json synced from DB; file is a mirror, not authoritative)
- Tools: `backend/ledger_update.py` (CLI), `scripts/gen_finance.py` (nightly xlsx + P&L + neraca, IDR→USD via live forexrateapi using FOREX_KEY)

## How to re-verify (operator template)
1. Frontend: `curl -s -o /dev/null -w "%{http_code}" https://upstream-static.vercel.app/` → 200
2. Backend health: `curl -s -o /dev/null -w "%{http_code}" https://ops.budgezen.com/health` → 200
3. Reliability summary (needs login): read `DASHBOARD_PASSWORD` from `/proc/<backend-MainPID>/environ` via `sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) systemctl --user show wwma-upstream-backend.service -p MainPID --value` → login `POST https://ops.budgezen.com/api/login` → GET `/api/reliability/summary` with Bearer
4. Daemon: `ssh root@82.25.62.204 "ps -eo pid,etime,args | grep scripts/auto_pricing.py | grep -v grep"` → expect exactly 1 PID, 60s interval
5. Finance: `psql "postgresql://wwma_app:***@127.0.0.1:6432/wuthering_waves_multi_agent" -c "SET search_path TO memory; SELECT count(*) FROM assets;"` → 60

## Secrets (never write values to repo)
- `DASHBOARD_PASSWORD` — server-side secret, referenced by name only; rotated (old compromised value invalid/401)
- `UPSTREAM_DB` — DB URL incl password, server-side secret
- `FOREX_KEY` — forexrateapi key, server-side secret
