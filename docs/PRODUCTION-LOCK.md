# Production Lock — upstream-dashboard

**Status:** phase 6 evidence record
**Repository:** `fazulfi/upstream-dashboard` / `main`
**Production frontend:** <https://upstream-static.vercel.app>
**Production host:** `faiz-prod` / `82.25.62.204`
**Last reviewed:** 2026-08-17

This document is the release gate for production. A phase is complete only when its evidence is recorded; a green local test without deployment evidence is not a production lock.

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

## Known non-locking external drift

- Vercel `upstream-static` is manually deployed and must be explicitly redeployed after frontend changes.
- A separate Vercel `dashboard` project has a failing GitHub integration and is not the production frontend. It must not be used as production evidence.
- GitHub repository metadata must point to `https://upstream-static.vercel.app`; stale project links are not valid lock evidence.
