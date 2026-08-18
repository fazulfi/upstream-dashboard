# Post-MVP Phase 1 — Reliability Baseline Audit

**Status:** Complete — read-only baseline
**Date:** 2026-08-18
**Production impact:** None. No VPS, Vercel, production database, service, pricing configuration, or production process was changed.
**Repository:** `C:\Users\faizz\upstream-dashboard`
**Proposed next gate:** Resolve the blockers below and obtain design/implementation-plan approval before source implementation.

## 1. Evidence commands and repository state

Read-only inspection covered the requested plans, production lock, auto-pricing documentation, operations runbook, README, CI workflow, backend, frontend, scripts, deploy units, tests, and applicable instruction files.

Applicable instruction-file search:

- `AGENTS.md`: none found.
- `CLAUDE.md`: none found.
- `GEMINI.md`: none found.
- `CONTRIBUTING.md`: none found.

Repository state observed:

- Branch: `main`.
- HEAD: `37e93c5 feat: lock REV13 production persistence and operations`.
- Working tree was not clean before this audit because planning documents were already changed/staged or untracked:
  - modified: `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability.md`
  - untracked: `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability-implementation.md`
- These pre-existing planning changes were not overwritten or committed.

Delegated audit evidence was produced by four read-only agents:

- repository structure audit
- backend/daemon architecture audit
- frontend/UX architecture audit
- Oracle reliability architecture review

## 2. Current architecture

### Daemon

` scripts/auto_pricing.py` is the standalone systemd-managed pricing daemon. It currently provides:

- provider-scoped orderbook handling;
- Basis-B trigger-area pricing contract;
- existing `max_in` boundary behavior;
- REV13 persistence to `auto_pricing_ops`, `auto_pricing_state`, and `auto_pricing_api_log`;
- JSON state/log fallback;
- ARM/DISARM through `~/.hermes-suisui/logs/auto-pricing-arm`;
- existing API backoff behavior.

It does **not** currently provide:

- cycle UUIDs;
- event UUIDs or event deduplication;
- reliability event persistence;
- heartbeat persistence;
- delayed-orderbook detection;
- five-consecutive-technical-error warning;
- PID/lock-file singleton enforcement;
- aggregate rollups or 90-day aggregate retention.

Relevant symbols include `_db_ensure_schema`, `_db_log_op`, `_db_log_api`, `_db_upsert_state`, `_db_retention`, `_atomic_write`, `run_cycle`, and `main`.

### Database

`backend/db_schema.py` contains the shared idempotent DDL path used by backend startup and sync tooling. Existing auto-pricing tables are present. The Phase 1 tables are absent:

- `reliability_cycles`;
- `reliability_events`;
- `reliability_aggregates`.

Important risk: the daemon also redeclares the existing auto-pricing DDL in `scripts/auto_pricing.py::_db_ensure_schema`. New reliability schema ownership must be explicitly normalized to prevent drift.

### Backend

`backend/app.py` is Flask + Waitress with:

- auth gate covering all routes except health/login/options;
- HMAC session tokens with 24-hour TTL;
- existing polling thread/cache;
- best-effort PostgreSQL helpers;
- JSON/NDJSON fallback paths;
- existing auto-pricing status and ARM endpoint.

Missing:

- `/api/reliability/summary`;
- `/api/reliability/cycles`;
- `/api/reliability/events`;
- `/api/reliability/models`;
- `/api/reliability/stream`;
- audited `/api/reliability/arm` and `/api/reliability/disarm`.

The existing ARM endpoint only writes the state file and does not persist operator, timestamp, old state, new state, source, or result.

### Frontend

`frontend/src/App.jsx` uses `HashRouter` with 17 active MVP routes and currently maps `/` to `Dashboard.jsx`. `LoginGate`, `Layout`, and `Sidebar` are the main landing/navigation integration points.

Missing:

- `frontend/src/pages/Reliability.jsx`;
- `frontend/src/lib/reliabilityApi.js`;
- `frontend/src/hooks/useReliabilityStream.js`;
- reliability route, landing, summary, drill-down, timeline, filters, stale/reconnect state, and ARM/DISARM audit surface.

`useApi.jsx` currently restricts API paths to the existing focused API scope, so reliability paths must be intentionally added.

The frontend currently has no EventSource/SSE client. Theme defaults to dark even though Phase 1 requires light mode only. Existing focus and reduced-motion foundations exist but require reliability-specific verification.

### CI and deployment

`.github/workflows/ci.yml` is CI-only and has no CD. It runs backend compilation/tests/coverage and frontend lint/tests/build.

Deployment uses:

- `deploy/wwma-upstream-backend.service`;
- `deploy/wwma-auto-pricing.service`;
- manual Vercel deployment from the frontend project.

The daemon unit uses `Restart=always` and currently has no in-code PID lock.

## 3. Phase 1 gaps

The reliability implementation is greenfield on top of the existing pricing contract. The following required capabilities are absent:

1. reliability schema and retention;
2. cycle/event UUID correlation and deduplication;
3. heartbeat after verified JSON state persistence;
4. delayed orderbook warning at 120 seconds;
5. model-level five-error dashboard/audit warning without a circuit breaker;
6. simple PID lock without automatic process killing;
7. authenticated bounded REST history APIs;
8. authenticated backend-owned SSE with REST recovery;
9. audited ARM/DISARM actions;
10. reliability dashboard as post-login landing;
11. responsive/accessibility/reduced-motion validation;
12. full route/page audit report;
13. documentation and release/observation artifacts.

## 4. Pre-implementation blockers

These issues must be resolved in the design/plan gate rather than guessed during coding.

### Blocker 1 — schema ownership

Existing auto-pricing DDL is duplicated between `backend/db_schema.py` and `scripts/auto_pricing.py`. The plan must select one authoritative owner for reliability DDL and define how daemon startup converges with backend startup. Recommended direction: `backend/db_schema.py` owns canonical DDL and the daemon calls a shared/idempotent schema path.

Required evidence: identical-column/idempotence tests for both startup paths.

### Blocker 2 — delayed data versus downtime semantics

The design says orderbook data becomes delayed at 120 seconds while cycles continue, but also describes no completed cycle for 120 seconds as downtime. These are different clocks. The SLO must define downtime by absence of a completed heartbeat/cycle, not by stale orderbook age. A delayed-but-completing cycle must remain available and must not count as downtime.

Required evidence: test and observation rule distinguishing delayed-data warnings from missing heartbeat.

### Blocker 3 — PID lock and systemd restart race

`wwma-auto-pricing.service` uses `Restart=always`. A dead-PID lock takeover can race with systemd's automatic restart and produce two processes. The plan must document the authoritative launcher policy and safe manual restart procedure. No auto-kill is permitted.

Required evidence: lock tests for live PID refusal, dead PID takeover, and restart/takeover race handling.

### Blocker 4 — heartbeat durability semantics

The design requires heartbeat health after JSON state write, while the existing JSON write path is best-effort. The plan must define whether heartbeat uses a new verified atomic write or the existing write path. A failed JSON write must not be silently represented as a healthy heartbeat.

Required evidence: tests for successful state write, state-write failure, DB failure as separate warning, and heartbeat status.

### Blocker 5 — ARM/DISARM compatibility and atomicity

The existing `/api/auto-pricing/arm` endpoint is used by current frontend/CLI behavior. New reliability ARM/DISARM endpoints must either wrap or replace it while preserving safe compatibility. The state transition and audit event need an explicit ordering/atomicity policy.

Required evidence: authenticated state transition tests, audit-field tests, failure behavior, and no unaudited state change.

## 5. Safety constraints carried forward

- Preserve REV12/REV13 pricing behavior and `max_in` contract.
- Do not add a percentage price clamp.
- Do not add an automatic circuit breaker.
- Delayed data must not auto-stop the daemon or block PUT solely because it is delayed.
- PostgreSQL outage remains best-effort persistence; pricing/PUT and JSON/log fallback continue when InferHub is healthy.
- Do not add queues, event buses, replay workers, or a separate incident subsystem.
- Do not auto-kill duplicate daemons.
- Do not delete MVP pages until all three removal criteria are evidenced.
- Do not expose secrets or commit environment files.
- CI must remain without CD.
- Production requires green CI, approved PR, and explicit manual deployment approval.

## 6. Baseline status

**Audit status:** PASS for read-only discovery.

**Implementation status:** BLOCKED pending resolution of the five pre-implementation blockers and completion of the design/implementation-plan approval gate.

**Production status:** UNCHANGED by this audit.

**Next artifact:** architecture/plan-validation report after the design owner confirms the blocker resolutions and lifts the implementation freeze.
