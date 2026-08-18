# Post-MVP Phase 1 Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Add a production-grade reliability surface for auto-pricing while preserving the existing pricing contract and keeping backend architecture minimal.

**Architecture:** Extend the existing daemon, Flask backend, PostgreSQL schema, auth/session layer, and React/Vite dashboard. The daemon emits a compact cycle heartbeat and persists reliability events; the backend exposes REST history plus fetch-based authenticated SSE after completed cycles; the UI becomes the post-login reliability landing page. No event bus, worker queue, new fallback store, or separate incident subsystem is introduced. The authoritative B0-B8 record is `artifacts/phase1/audit/decision-log.md`; historical alternatives are non-authoritative.

**Tech Stack:** Python 3, Flask, PostgreSQL/psycopg3, systemd user services, React 19, Vite, React Router, existing auth/session, SSE, Vitest, pytest/unittest.

## Global Constraints

- Planning decisions are recorded in `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability.md`.
- No production changes occur until implementation tasks are approved and deployed through CI + approved PR + manual deployment approval.
- Preserve the existing per-provider orderbook and Basis B pricing contract; no new percentage price clamp.
- Orderbook delayed threshold is 120 seconds; delayed data warns/persists but does not stop cycles or block PUTs.
- No automatic circuit breaker, auto-kill, new local queue, replay worker, or separate incident subsystem.
- PostgreSQL outage is best-effort persistence failure; pricing/PUT continues when InferHub is healthy and JSON/log remain available.
- Duplicate daemon uses a simple PID/lock file; dead PID permits takeover, live PID requires manual disarm/investigation.
- Raw events retain 30 days; aggregates retain 90 days: hourly for recent 30 days, daily for days 31–90. Bucket boundaries and rollups use UTC and are idempotent.
- Availability target is 99.9% monthly; completion observation is at least 24 hours with signed numerical thresholds and complete telemetry.
- SSE uses fetch-based streaming with an `Authorization` header. Native `EventSource` and query-string tokens are prohibited.
- Delayed orderbook data is independent of downtime and never blocks a PUT solely due to delay. JSON heartbeat success is verified before healthy finalization.
- `backend/db_schema.py` owns canonical DDL. ARM/DISARM uses one atomic audited transition service, including the legacy route.
- All 17 existing routes remain retained unless the documented evidence criteria are met.
- Deployment is manual only. CI has no CD, and this plan does not authorize production readiness.
- UI may use high-polish Vercel Dashboard/Geist-inspired design; system architecture remains minimal.
- No MVP page is deleted unless all removal criteria pass: absent from active navigation/important routes, no active code/runtime usage, and no remaining MVP operational function.

---

## Task 1: Freeze baseline and normalize the decision log

**Files:**
- Modify: `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability.md`
- Read: `README.md`, `docs/OPS-RUNBOOK.md`, `docs/auto-pricing.md`, `.github/workflows/ci.yml`

- [ ] **Step 1: Verify the decision log**

Confirm all approved decisions are represented once, remove obsolete contradictory question text, and preserve the production-freeze statement.

- [ ] **Step 2: Capture baseline evidence**

Run:

```bash
git status --short
git rev-parse HEAD origin/main
python -B -m unittest scripts.tests.test_self_undercut -v
cd backend && python -B -m pytest tests -q -p no:warnings
cd ../frontend && npm test -- --run && npm run build
```

Expected: clean baseline or explicitly documented pre-existing changes; all current tests pass.

- [ ] **Step 3: Commit the planning-only normalization**

Commit only the approved decision-log cleanup. Do not deploy.

---

## Task 2: Add minimal reliability schema and retention

**Files:**
- Modify: `backend/db_schema.py`
- Modify: `scripts/auto_pricing.py`
- Test: `backend/tests/test_app.py`, `scripts/tests/test_self_undercut.py`

**Produces:**
- `reliability_cycles(cycle_id,event_id,started_at,finished_at,duration_ms,model_count,undercut_count,resume_count,hold_count,error_count,status,source_version)`
- `reliability_events(event_id,cycle_id,severity,event_type,slug,model_id,operator,status,detected_at,resolved_at,payload)`
- `reliability_aggregates(bucket_start,bucket_size,model_count,cycle_count,undercut_count,resume_count,hold_count,error_count,delayed_count,put_success_count,put_failure_count,api_error_count,duplicate_count,db_failure_count)`
- Existing `auto_pricing_ops`, `auto_pricing_state`, and `auto_pricing_api_log` remain compatible.

- [ ] **Step 1: Write failing schema/helper tests**

Test idempotent DDL, event ID uniqueness, cycle ID propagation, 30-day raw cleanup, and hourly/daily aggregate bucket selection. Mock PostgreSQL on Windows tests as current DB helper tests do.

- [ ] **Step 2: Run RED tests**

```bash
python -B -m unittest scripts.tests.test_self_undercut -v
python -B -m pytest backend/tests -q -p no:warnings
```

Expected: failures for missing reliability schema/helpers.

- [ ] **Step 3: Implement the smallest schema/helpers**

Use UUID v4 strings for `cycle_id` and `event_id`. Keep payload JSONB or JSON text according to the existing schema convention. Use one retention function at daemon startup; use one aggregate function invoked after a completed cycle. Do not add a worker or queue.

- [ ] **Step 4: Verify GREEN**

Run both suites again. Expected: all tests pass and existing REV13 tests remain green.

---

## Task 3: Add daemon heartbeat, events, delayed-data warning, and PID lock

**Files:**
- Modify: `scripts/auto_pricing.py`
- Modify: `deploy/wwma-auto-pricing.service`
- Test: `scripts/tests/test_self_undercut.py`

**Interfaces:**
- `start_cycle() -> cycle_id`
- `finish_cycle(cycle_id, summary) -> None`
- `record_reliability_event(cycle_id, severity, event_type, payload) -> event_id`
- `acquire_pid_lock(path) -> bool`
- `orderbook_is_delayed(last_fresh_at, now, threshold=120) -> bool`

- [ ] **Step 1: Write failing tests**

Cover: one heartbeat after JSON state write; DB failure leaves heartbeat healthy but records warning; delayed orderbook after 120 seconds records warning without blocking PUT; dead PID lock takeover; live PID lock refusal; UUID cycle/event IDs; no auto-kill.

- [ ] **Step 2: Run RED**

```bash
python -B -m unittest scripts.tests.test_self_undercut -v
```

Expected: missing helper/behavior failures.

- [ ] **Step 3: Implement**

Generate one UUID v4 at cycle start. Thread it through API logs, model decisions, PUT attempts, warnings, persistence events, and cycle summary. Write heartbeat only after JSON state succeeds. Record PostgreSQL failure separately. Add a simple lock file containing PID; check `os.kill(pid, 0)` and take over only when the PID is dead. Do not change pricing target selection.

- [ ] **Step 4: Verify GREEN and compile**

```bash
python -B -m unittest scripts.tests.test_self_undercut -v
python -B -m py_compile scripts/auto_pricing.py
```

---

## Task 4: Add backend reliability REST API and authenticated SSE

**Files:**
- Modify: `backend/app.py`
- Test: `backend/tests/test_app.py`

**Interfaces:**
- `GET /api/reliability/summary`
- `GET /api/reliability/cycles?before=<cursor>&limit=<n>`
- `GET /api/reliability/events?cycle_id=<uuid>&severity=<level>&type=<type>&before=<cursor>&limit=<n>`
- `GET /api/reliability/models?slug=<slug>&model_id=<id>&before=<cursor>&limit=<n>`
- `GET /api/reliability/stream` (authenticated SSE)
- `POST /api/reliability/arm` and `/api/reliability/disarm` (authenticated, audited)

- [ ] **Step 1: Write failing API tests**

Test auth enforcement, bounded pagination, stable ordering, summary shape, event filtering, ARM/DISARM audit fields, SSE event format, and no data exposure after session expiry.

- [ ] **Step 2: Implement REST first**

Use indexed PostgreSQL queries. Choose cursor pagination using `(detected_at,event_id)` after schema review; never use unbounded queries. Return `last_event_id`, `last_cycle_id`, `freshness`, and `stale` metadata.

- [ ] **Step 3: Implement minimal SSE**

Backend owns the stream. Use fetch-based streaming so the client sends `Authorization: Bearer <session-token>` as a request header. Never accept password, bearer, or session tokens in query parameters. Verify JSON heartbeat/data semantics, stable event IDs, bounded reconnect/backoff, expiry/401 termination, proxy-safe comment heartbeats, disconnect cleanup, and REST cursor recovery. Use an in-process subscriber list only for connected clients; PostgreSQL/history remains durable source. Emit after cycle persistence. Do not add Redis, Kafka, WebSocket, or event bus.

- [ ] **Step 4: Verify**

```bash
cd backend && python -B -m pytest tests -q -p no:warnings
```

---

## Task 5: Build the Reliability landing UI

**Files:**
- Create: `frontend/src/pages/Reliability.jsx`
- Create: `frontend/src/lib/reliabilityApi.js`
- Create: `frontend/src/hooks/useReliabilityStream.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/components/Layout.jsx`
- Test: `frontend/src/pages/Reliability.test.jsx`, `frontend/src/hooks/useReliabilityStream.test.jsx`

- [ ] **Step 1: Write failing UI tests**

Cover post-login landing, all-model snapshot, summary cards, warning/error states, stale connection indicator, filter behavior, ARM/DISARM confirmation, responsive layout semantics, keyboard focus, and reduced-motion fallback.

- [ ] **Step 2: Implement the information architecture**

Reliability becomes `/` after login. Retain all currently active pages until the page audit approves removal. Provide cycle summary, provider/model drill-down, and event timeline.

- [ ] **Step 3: Implement live behavior**

Use REST initial load/history and SSE cycle updates. Use bounded reconnect backoff selected from existing client conventions; after reconnect, fetch REST snapshot/history. Never label disconnected data current.

- [ ] **Step 4: Implement UI polish**

Use a light-only Vercel Dashboard/Geist-inspired visual system: comfortable density, responsive mobile layout, semantic status labels, restrained colors, accessible focus states, purposeful motion, and reduced-motion fallback. Do not copy proprietary assets or source.

- [ ] **Step 5: Verify**

```bash
cd frontend && npm test -- --run && npm run build
```

---

## Task 6: Audit and safely deprecate MVP pages

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`, `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx` only for approved removals
- Test: route/navigation tests
- Document: `docs/PRODUCTION-LOCK.md` or the Phase 1 design record

- [ ] **Step 1: Re-run page audit**

For each page, record route, navigation entry, imports, API dependencies, and operational purpose.

- [ ] **Step 2: Apply mandatory removal criteria**

A page is removable only if it is absent from active navigation/important routes, has no active code/runtime usage, and has no remaining MVP operational function. Add redirect coverage before deletion.

- [ ] **Step 3: Current known result**

The audit found all 17 pages active. Therefore no page deletion is approved yet. Re-evaluate `Dashboard.jsx` only after Reliability becomes the landing page. `Topups.test.jsx` may be cleaned as a misleading test only after a separate test-quality decision.

- [ ] **Step 4: Verify routes**

```bash
cd frontend && npm test -- --run && npm run build
```

---

## Task 7: Aggregate, maintenance, and operational controls

**Files:**
- Modify: `scripts/auto_pricing.py`
- Modify: `backend/app.py`
- Modify: `backend/db_schema.py`
- Modify: `docs/OPS-RUNBOOK.md`, `docs/auto-pricing.md`
- Test: backend and daemon tests

- [ ] **Step 1: Add aggregate rollup**

Bucket recent 30 days hourly and days 31–90 daily. Include cycle/model/action/error/delayed/PUT/API/duplicate/DB metrics. Use one direct function after cycle completion; no background worker.

- [ ] **Step 2: Add maintenance audit events**

Record operator, reason, start/end, and correlation ID. Exclude scheduled audited maintenance up to 30 minutes/month from availability calculations.

- [ ] **Step 3: Add operator audit**

ARM/DISARM records operator, timestamp, old state, new state, source, result, and event ID. Keep pricing configuration controls out of Phase 1.

- [ ] **Step 4: Update docs**

Document thresholds, severity mapping, REST/SSE endpoints, retention, backup, rollback, and 24-hour observation.

- [ ] **Step 5: Verify**

Run all backend/daemon tests and inspect generated SQL queries for indexes and bounded limits.

---

## Task 8: Production deployment and 24-hour completion gate

**Files:**
- Modify: `docs/PRODUCTION-LOCK.md`, `docs/OPS-RUNBOOK.md`
- Evidence: release/CI/VPS/DB/browser records

- [ ] **Step 1: Release gate**

Require green CI, approved PR, and explicit manual deployment approval. No separate staging environment is required.

- [ ] **Step 2: Backup and deploy**

Disarm only when the deployment procedure requires it. Back up daemon/backend files and PostgreSQL. Deploy backend first, then daemon, then frontend. Verify one daemon and one backend service.

- [ ] **Step 3: Smoke test**

Verify login, reliability landing, summary, model drill-down, timeline, filters, ARM/DISARM audit, SSE reconnect, REST recovery, responsive layout, keyboard navigation, and error/warning surfaces.

- [ ] **Step 4: Observe for 24 hours**

Use the signed UTC evidence template and thresholds in `artifacts/phase1/audit/decision-log.md`. Record expected and completed cycles, maximum heartbeat gap, service/PID samples, JSON and per-table DB freshness, delayed/error counts, duplicate processes, SSE reconnect/REST recovery, ARM/DISARM audit samples, maintenance intervals, source/hash, and operator signatures. Missing telemetry, unknown intervals, unexplained gaps, or any threshold breach fails and restarts the window. This is the minimum completion observation; 99.9% remains the monthly SLO.

- [ ] **Step 5: Final gate**

Declare Phase 1 complete only when source is committed/pushed, CI is green, production hashes match, one daemon is active, DB history is fresh, frontend is public/correct, rollback artifacts exist, and the 24-hour evidence record is complete.

## Self-review

- No page is deleted without the three mandatory evidence criteria.
- No new queue, worker, event bus, or fallback store is introduced.
- Pricing contract, delayed-data behavior, no-circuit-breaker policy, DB-outage behavior, and manual duplicate handling are explicit.
- Every new endpoint has bounded queries and auth tests.
- UI polish is intentionally broader than backend architecture.
- The plan depends on design approval already recorded; implementation still requires a separate execution approval.
