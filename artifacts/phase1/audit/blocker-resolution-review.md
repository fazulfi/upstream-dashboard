# Phase 1 Blocker-Resolution Review

**Date:** 2026-08-18
**Mode:** Read-only architecture/security review. No source, database, service, deployment, or production access was used.
**Decision:** **BLOCKED.** The minimal Flask/Waitress/PostgreSQL/React direction is viable, but B0–B8 are not yet safe to implement or deploy. This review recommends contracts and tests; it does not claim implementation or production readiness.

## Bottom line

Keep the existing architecture: the daemon remains a systemd process, Flask/Waitress owns authenticated REST/SSE, PostgreSQL is durable history, and React consumes REST plus live updates. Do not add a queue, broker, worker, circuit breaker, replay service, or second persistence store. The critical safety rule is to separate *cycle/heartbeat health* from *orderbook freshness*, and to make every auth, state transition, persistence, deployment, and observation result explicit and testable.

The existing 10-cycle soak cannot satisfy the 24-hour gate. Any missing telemetry, unknown interval, unverified service identity, or unbounded observation gap must fail—not be interpreted optimistically.

## Evidence baseline

| Evidence | Exact references | Finding used here |
|---|---|---|
| Architecture gate | `artifacts/phase1/audit/architecture-gate-report.md:29-99,101-132` | Defines B0–B8, current risks, and blocked gate. |
| Backend surface | `artifacts/phase1/audit/backend-surface-report.md:23-33,47-70,72-117,131-168` | Confirms duplicate DDL, swallowed persistence errors, absent reliability routes/SSE/lock, and existing auth/ARM seams. |
| Frontend surface | `artifacts/phase1/audit/frontend-surface-report.md:8-12,14-45,67-97,103-125,152-196` | Confirms 17 retained routes, absent reliability UI/SSE, token/session gaps, and test conventions. |
| Plan validation | `artifacts/phase1/audit/plan-validation-report.md:34-112,113-136` | Prior five required contracts and constraints. |
| CI/deployment/security | `artifacts/phase1/audit/ci-deployment-security-report.md:8-14,18-30,50-86,88-125` | CI-only deployment, dirty tree, credential-bearing fallback DSNs, incomplete backup/rollback evidence. |
| Authoritative design | `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability.md:103-126,229-257` | 120-second delayed-data decision, dashboard/control boundary, raw/aggregate retention. |
| Implementation plan | `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability-implementation.md:11-23,57-89,93-160,259-292` | Proposed minimal interfaces, schema, API/SSE, deployment and observation steps; several are underspecified. |
| Existing auth and control | `backend/app.py:648-720,2306-2318` (as cited by audit) | 24-hour bearer sessions; legacy ARM writes only a file. |
| Existing daemon persistence | `scripts/auto_pricing.py:119-173,743-979` (as cited by audit) | Duplicate DDL, best-effort/suppressed writes, no cycle UUID/heartbeat/lock. |

## Recommendation matrix

| Blocker | Safe minimum contract | Required tests/evidence | Status / must remain blocked if |
|---|---|---|---|
| **B0 — normalized authority** | One decision table in the authoritative design. Historical questions are explicitly non-authoritative. The implementation plan is separately approved. It must state exact choices for schema, retention, cursors/event names, UI scope/theme, deployment order, stale semantics, and observation gate. | Plan review showing no contradictory active decisions; line-by-line decision-to-implementation mapping; approval record. | Any item remains both “open” and “confirmed,” or implementation begins before explicit approval. |
| **B1 — stale data vs downtime** | Two clocks: `cycle_finished_at`/heartbeat determines downtime; per-model/reference age determines delayed warning. At `>=120s`, mark delayed and persist warning, but continue the cycle and do not block PUT solely for delay, per the selected design. A delayed model must be visibly labeled, never silently “fresh.” | Fresh, 119s, exactly 120s, >120s, refresh failure, recovery; prove cycle completion and PUT eligibility independently. Observation report has separate stale-warning and heartbeat-gap columns. | Requirements still say both “guarded mode” and “normal pricing” without exact action, or stale age is used as downtime. If safety owners later require blocking PUTs, that is a new explicit pricing decision, not an implementation guess. |
| **B2 — persistence/heartbeat** | Generate one cycle UUID at start and event UUIDs per durable event. Verify atomic JSON state write (flush/fsync/replace and success result). Only then finalize heartbeat. PostgreSQL failure is `persistence_warning`/event, not healthy DB success; pricing continues if InferHub and JSON are usable. Every cycle has one terminal summary; retries are idempotent by IDs. | JSON success → healthy heartbeat; JSON failure → no healthy heartbeat; DB outage → warning plus cycle continuation; partial insert/retry deduplication; terminal status on exceptions; UUID propagation through ops/API/events. | A failed state write can still produce healthy status, a partial cycle has no terminal record, or DB success is implied by best-effort code. |
| **B3 — schema/migration ownership** | `backend/db_schema.py` is sole canonical DDL owner (or an exactly shared helper). Use additive, versioned migration for reliability tables/indexes; preserve REV13 columns/constraints; no destructive startup DDL. Backend and daemon invoke the same idempotent path. | Fresh and existing REV13 database schema contract; idempotence twice; columns/types/nullability/unique/index checks; backend and daemon convergence; rollback rehearsal showing no destructive change. | Daemon keeps independently redefining tables, migration version/rollback is absent, or startup behavior differs by process. |
| **B4 — ARM/DISARM atomicity/compatibility** | Central transition service handles old `/api/auto-pricing/arm` and new reliability routes. Require existing auth. Record operator, timestamp, old/new state, source, result, event ID. Define ordering: do not return success unless state write and required audit persistence have known outcomes; same-state requests are idempotent and audited. | Old/new endpoint parity; unauthorized/expired sessions; same-state and concurrent transitions; file failure; DB failure; audit field completeness; state/audit agreement after restart. | Legacy endpoint bypasses audit, a success response can precede an unknown state/audit result, or CLI direct file writes are assumed migrated without evidence. |
| **B5 — auth/session/SSE** | **Recommended minimum:** use a same-origin, `HttpOnly; Secure; SameSite` session cookie dedicated to SSE, while retaining bearer headers for ordinary REST; or use a reviewed `fetch()` streaming client that can set `Authorization`. Native `EventSource` must not receive a token in the URL. Never put password, bearer token, or session secret in query parameters. Enforce the existing origin allowlist, no wildcard CORS; define proxy buffering/read timeout; send comment heartbeats; bound subscribers and per-client resources; remove subscribers on disconnect; return/emit 401/expiry semantics; reconnect with bounded backoff, then REST cursor recovery. Durable PostgreSQL events are authoritative; in-process SSE is only a notification path. | No auth → 401; expired session cannot receive further data; query token rejected and absent from logs; allowed origin succeeds, disallowed origin fails; cookie/header transport test; reconnect after disconnect; missed-event REST replay; duplicate/out-of-order cursor handling; stream cleanup/limit; proxy-compatible heartbeat/termination. | Only native `EventSource` plus bearer header is proposed (it cannot set that header in the normal API), query secrets are proposed, cross-origin cookie/CORS behavior is undefined, or replay/expiry semantics are absent. This blocker must remain closed until a deploy-compatible transport is documented and tested. |
| **B6 — retention/rollups** | Distinguish raw REV13 operational rows, reliability raw events, and aggregates. Define UTC bucket boundaries, late events, rerun/upsert idempotency, cleanup/rollup failure event, and restore behavior. 30-day raw and 90-day aggregates are not automatically equivalent to 90-day backup/recoverability; reconcile `PRODUCTION-LOCK`, runbook, and 14-day local/30-day remote backup policy. | Boundary tests at UTC hour/day and day 30/31/90; late event recomputation; repeated rollup no double count; cleanup failure alert; restore/recompute transcript; retention table ownership matrix. | Retention is changed only in code while lock/runbook/backup evidence remains contradictory. |
| **B7 — deployment/evidence** | CI, approved PR, manual approval, backup, schema compatibility, deterministic service sequence, readiness checks, ARM state, rollback order. Systemd is authoritative; stop service before manual recovery; no duplicate `nohup` backend. Capture exact commit/hash, CI URL, approval, backup IDs, migration result, one backend/daemon identity, health/auth smoke, frontend URL, and rollback paths. | Dry-run release checklist; migration rollback; service uniqueness/PID evidence; `/health`, login, reliability REST/SSE, frontend route, ARM audit smoke; rollback artifact existence. CI remains CI-only; frontend deploy source is `frontend/`. | Dirty tree, credential-bearing fallback DSNs, unverified backup/restore, unclear `Restart=always` takeover, or manual recovery can create a second backend/daemon. No production authorization follows from source review. |
| **B8 — 24-hour observation** | Predefine signed UTC evidence template: start/end, expected cycle interval, completed cycles, max heartbeat gap, service/PID samples, JSON freshness, newest DB timestamps by table, delayed/error counts, duplicate count, SSE reconnect/recovery, ARM/DISARM audit samples, maintenance intervals, and source/hash. Define thresholds before deployment. At minimum: continuous coverage for 24h, no unexplained/missing telemetry, no duplicate daemon, no heartbeat gap beyond the approved detection budget, DB/JSON freshness within contract, all-model accounting, and successful auth/SSE recovery tests. Planned maintenance is excluded only if authorized and recorded before it begins. | Independent timestamps/monotonic or clearly defined UTC clock; scheduled sampling; count reconciliation (cycles/events/models); injected/replayed stale-data and reconnect evidence; signed operator review; explicit PASS/FAIL calculation. Any missing sample, unknown interval, telemetry gap, duplicate process, unclassified error, or threshold breach = FAIL and restart the observation window. | A 10-cycle soak, dashboard screenshot, “no alerts seen,” or 24 elapsed wall-clock hours without complete telemetry is treated as sufficient. |

## Explicit contracts to freeze before coding

### REST

- All reliability routes use the existing auth gate and primary-admin boundary.
- Every list endpoint has a bounded maximum `limit`, rejects invalid cursors, and uses a stable total order such as `(detected_at, event_id)` with documented precision/tie-breaking.
- Responses include freshness/stale metadata and cursor recovery identifiers. A stale snapshot is never labeled current.
- Event payloads have a version, severity/type enum, UTC timestamp, cycle/event ID, and documented nullable scope fields. Do not expose secrets or raw credential material.

### SSE

- Stream messages are notifications with event IDs/cycle IDs; PostgreSQL REST history is the source of truth.
- Connect only after authentication; never accept `?auth=`, `?token=`, or password parameters.
- On expiry, terminate or emit a defined auth-expired event and require login; do not continue sending data.
- Reconnect must recover from the last acknowledged cursor, tolerate duplicates, and mark UI `reconnecting`/`stale` until recovery succeeds.

### 24-hour pass/fail

A pass requires complete, reviewable evidence for the entire declared interval. It is not enough that the service appears running at the end. Define expected cycle cadence and thresholds in advance, then calculate: observed cycles vs expected, maximum heartbeat gap, per-table freshness, model/action/error totals, duplicate count, and recovery tests. Missing data is an evidence failure, not zero incidents. A failed or incomplete run restarts the 24-hour window after the corrective change.

## Unsafe assumptions rejected

1. **“Normal pricing” resolves stale-data safety.** It does not define whether reference, eligibility, or per-model actions change; freeze the exact matrix.
2. **Bearer auth automatically works with browser SSE.** Native `EventSource` cannot set arbitrary Authorization headers; choose cookie or fetch-stream deliberately.
3. **In-process subscribers are durable replay.** They are not; use PostgreSQL cursor recovery.
4. **Atomic file mechanics imply healthy heartbeat.** They do not if exceptions are swallowed or success is not verified.
5. **Idempotent `CREATE TABLE IF NOT EXISTS` is a migration strategy.** It does not provide versioning, rollback, or schema convergence.
6. **`Restart=always` guarantees singleton behavior.** It can race manual lock takeover; systemd authority and stop-before-recovery must be explicit.
7. **90-day aggregates imply 90-day recoverability.** Backup retention and restore proof are separate requirements.
8. **A 24-hour elapsed timer proves 24-hour observation.** It does not without complete telemetry and pass/fail thresholds.
9. **Existing auth readiness means session expiry is safe for live UI.** Frontend currently lacks global 401/expiry handling and stale-state semantics (`frontend-surface-report.md:67-80,124-125`).
10. **Compatibility can be assumed away.** Existing frontend and CLI use the legacy ARM file/endpoint (`backend-surface-report.md:99-103`; implementation plan `:132-160`).

## Requirements that remain blocked

- Implementation authorization remains blocked until B0–B8 are recorded in the authoritative plan and separately approved (`architecture-gate-report.md:124-132`).
- Production authorization remains blocked by the dirty working tree, tracked password-bearing fallback DSNs, incomplete backup/restore evidence, and absent live release proof (`ci-deployment-security-report.md:112-125`).
- SSE remains blocked until transport, proxy, expiry, replay, and no-query-secret behavior are concretely selected and tested.
- The 24-hour gate remains blocked until its signed evidence schema and numerical thresholds exist; prior 10-cycle evidence is insufficient (`architecture-gate-report.md:93-99`).
- No page deletion is approved: all 17 routes are active and the removal criteria are not met (`frontend-surface-report.md:14-45,198-219`).

## Safe next sequence

1. Normalize and approve B0, including the SSE transport and numerical B8 thresholds.
2. Freeze canonical schema/migration and event contracts; write failing contract tests.
3. Implement daemon persistence/heartbeat/lock without changing REV12/REV13 pricing decisions; verify daemon tests.
4. Implement authenticated bounded REST, then SSE notification/recovery; verify auth and replay tests.
5. Implement the light-only reliability UI while retaining all existing routes; verify stale/expiry/accessibility behavior.
6. Reconcile retention, backup, rollback, runbook, and production lock.
7. Run CI-equivalent checks and obtain PR/manual approval; only then perform a separately evidenced deployment and fresh 24-hour observation.

**Review conclusion:** technically feasible with minimal architecture, but **not implementation-ready and not production-ready** until every blocker’s contract and evidence condition is satisfied.
