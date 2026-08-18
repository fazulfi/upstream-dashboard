# Post-MVP Phase 1 — Implementation Plan Validation

**Status:** BLOCKED — validation complete, implementation not authorized by current repository gate
**Date:** 2026-08-18
**Repository:** `C:\Users\faizz\upstream-dashboard`
**Production impact:** None
**Inputs:**
- `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability.md`
- `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability-implementation.md`
- `artifacts/phase1/audit/baseline-report.md`
- read-only repository and architecture audits

## Executive result

The implementation plan maps to real repository integration points and is technically feasible, but it is not ready for source implementation without resolving five safety/contract ambiguities. The authoritative design document explicitly requires those decisions and an approval gate before implementation, migration, deployment, or production configuration changes.

No source implementation has been started. No production system has been changed.

## Validated workstream mapping

| Plan workstream | Repository integration point | Validation |
|---|---|---|
| Schema/retention | `backend/db_schema.py`, daemon startup schema path, backend tests, daemon tests | Feasible; canonical DDL ownership must be fixed |
| Daemon cycle/events | `scripts/auto_pricing.py:run_cycle`, `_db_log_op`, `_db_log_api`, `_db_upsert_state`, `_atomic_write` | Feasible; UUID propagation touches all cycle persistence call sites |
| PID lock | `scripts/auto_pricing.py:main`, `deploy/wwma-auto-pricing.service` | Feasible; systemd restart/takeover policy must be explicit |
| REST API | `backend/app.py`, global `_auth_gate`, `db_connect`, backend fixtures/tests | Feasible; bounded ordering/cursor contract required |
| SSE | `backend/app.py`, frontend native `EventSource` hook | Feasible; backend-owned stream and reconnect recovery are absent today |
| ARM/DISARM | existing `/api/auto-pricing/arm`, arm state file, frontend `AutoPricing.jsx` | Feasible; compatibility wrapper and audit atomicity required |
| Reliability landing | `frontend/src/App.jsx`, `Sidebar.jsx`, `Layout.jsx`, `useApi.jsx` | Feasible; API scope gate and light-only theme must be addressed |
| Page audit | `App.jsx` route imports, `Sidebar.jsx`, API consumers/runtime references | Current evidence supports no page deletions |
| CI | `.github/workflows/ci.yml` | CI-only design is compatible; no CD should be added |
| Deployment | systemd units, runbook, manual Vercel frontend deployment | Must remain behind PR/CI/manual approval gates |

## Required contract resolutions

### 1. Canonical schema ownership

**Observed:** Existing auto-pricing tables are defined in both `backend/db_schema.py` and `scripts/auto_pricing.py::_db_ensure_schema`.

**Required resolution:** `backend/db_schema.py` is the canonical DDL owner. The daemon must use the shared idempotent schema definition or an exact synchronized helper; reliability tables must not have a second divergent definition.

**Acceptance evidence:**

- schema idempotence tests;
- column/index contract tests;
- backend and daemon startup paths converge on the same DDL;
- no destructive migration.

### 2. Downtime versus delayed orderbook

**Observed:** Delayed orderbook threshold is 120 seconds and must not stop cycles, while downtime is described as no completed cycle for 120 seconds.

**Required resolution:** Downtime is measured by missing completed heartbeat/cycle. Orderbook age is a separate warning condition. A delayed orderbook with a completed cycle is not downtime.

**Acceptance evidence:**

- delayed-orderbook test confirms pricing cycle continues;
- heartbeat test confirms completed cycle remains healthy;
- observation report distinguishes delayed warnings from heartbeat gaps.

### 3. PID lock and systemd launcher policy

**Observed:** `deploy/wwma-auto-pricing.service` uses `Restart=always`; a dead lock PID can race with automatic restart.

**Required resolution:** systemd is the authoritative production launcher. Manual intervention must stop the service before starting another process. A live PID refuses acquisition; a dead PID permits stale-lock takeover; no process is automatically killed.

**Acceptance evidence:**

- live-PID refusal test;
- dead-PID takeover test;
- lock cleanup/release behavior test;
- runbook documents service stop before manual recovery;
- no `kill`/auto-kill path exists.

### 4. Heartbeat durability

**Observed:** Existing JSON persistence is best-effort and can swallow write failures.

**Required resolution:** heartbeat health requires a successful verified atomic JSON state write followed by completed cycle finalization. PostgreSQL failure is a separate warning and does not invalidate heartbeat when JSON state succeeds.

**Acceptance evidence:**

- successful JSON write produces heartbeat;
- JSON failure does not produce healthy heartbeat;
- DB failure creates `persistence_failure` warning while cycle/heartbeat continues;
- cycle/event UUID correlation remains intact.

### 5. ARM/DISARM compatibility

**Observed:** Existing `/api/auto-pricing/arm` writes a filesystem state flag without audit metadata. Existing frontend and likely operational scripts use it.

**Required resolution:** Preserve `/api/auto-pricing/arm` as a compatibility wrapper or migrate all callers in one reviewed change. New `/api/reliability/arm` and `/api/reliability/disarm` must use the same state transition implementation. Audit must record operator, timestamp, old state, new state, source, and result. Failed audit/state transitions must not report success.

**Acceptance evidence:**

- authenticated arm/disarm tests;
- old endpoint compatibility test;
- audit field and failure-path tests;
- production verification confirms persisted event and state agreement.

## Additional implementation constraints confirmed by audit

- Preserve REV12/REV13 pricing decision behavior and `max_in` semantics.
- Do not add percentage clamps, circuit breakers, queues, event buses, replay workers, or separate incident subsystem.
- Use bounded history queries and stable ordering.
- Ensure SSE does not expose unauthenticated data and has REST snapshot/history recovery.
- Extend the frontend API path allowlist for reliability endpoints.
- Reliability is the post-login landing page; existing MVP routes remain until deletion criteria are proven.
- Phase 1 is light mode only; keyboard focus, semantic labels, contrast, responsive behavior, and reduced motion require tests/evidence.
- CI remains without CD.
- Deployment requires approved PR, green CI, manual deployment approval, backup, rollback readiness, and post-deploy verification.

## Implementation order after gate approval

1. Add failing schema/helper tests.
2. Implement canonical idempotent reliability schema and retention helpers.
3. Add failing daemon reliability tests.
4. Implement UUID correlation, event deduplication, heartbeat, delayed warning, and PID lock.
5. Add failing backend auth/filter/pagination/ARM/SSE tests.
6. Implement REST and backend-owned SSE with bounded in-process subscriber handling and REST recovery.
7. Add failing frontend API/hook/page tests.
8. Implement reliability landing and accessible responsive UI.
9. Re-run route/page audit and document no-deletion result unless all criteria pass.
10. Update operational and product documentation.
11. Run complete CI-equivalent verification.
12. Create feature branch and PR; do not deploy until approval and green CI.

## Gate status

**Plan validation:** PASS with conditions.

**Implementation authorization:** NOT READY under the repository’s current authoritative design gate.

**Production authorization:** NOT READY.

**Required next action:** Record/approve the five resolutions above in the authoritative design/implementation plan. Until then, proceeding to source implementation would violate the documented production-lock policy and would require silently guessing safety-critical behavior.
