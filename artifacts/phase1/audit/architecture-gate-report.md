# Phase 1 Reliability Architecture Gate

**Status: BLOCKED — pre-implementation review only**
**Date:** 2026-08-18
**Scope:** Read-only comparison of the authoritative design, implementation plan, production lock, operations runbook, auto-pricing contract, and current integration points. No source, production, database, service, or deployment changes were made.

## Executive decision

**Do not authorize implementation or deployment yet.** The implementation direction is broadly compatible with the repository, but the plans still contain safety-critical contradictions and underspecified acceptance evidence. The existing `artifacts/phase1/audit/plan-validation-report.md` identified five blockers; this review confirms them and adds material risks around retention, SSE lifecycle, auth/session semantics, deployment ordering, and the 24-hour evidence gate.

## Evidence reviewed

| Evidence | Exact sections / lines | Result |
|---|---:|---|
| Authoritative design | `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability.md:1-29,44-126,145-227,229-359,405-419,477-721` | Read; contains confirmed decisions, historical unresolved questions, and duplicate gate sections |
| Implementation plan | `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability-implementation.md:1-24,27-55,57-164,166-255,259-292` | Read; technically plausible but not sufficient as an execution contract |
| Production lock | `docs/PRODUCTION-LOCK.md:1-18,20-58,60-104` | Read; current production gates and 30-day operational retention conflict with Phase 1 aggregate/raw policy unless explicitly migrated |
| Operations runbook | `docs/OPS-RUNBOOK.md:1-43,46-64,68-83,87-133,145-149` | Read; contains deployment/service/auth/backup procedures that the implementation plan does not fully reconcile |
| Auto-pricing contract | `docs/auto-pricing.md:1-109,160-193,210-219,385-515` | Read; REV12/REV13 are authoritative for pricing semantics and current persistence behavior |
| Existing schema | `backend/db_schema.py:1-13,207-260` | Read; shared DDL exists, including REV13 tables |
| Existing daemon | `scripts/auto_pricing.py:119-252,743-979` | Read; daemon redeclares DDL, swallows persistence/write failures, has no UUID/heartbeat/lock, and runs under `Restart=always` |
| Existing auth/control | `backend/app.py:648-720,2306-2369` | Read; 24-hour bearer sessions and unaudited legacy ARM endpoint exist |
| Existing UI routing | `frontend/src/App.jsx:1-50` | Read; `/` is currently `Dashboard`, with 17 active routes |
| Deployment/CI | `deploy/wwma-auto-pricing.service:1-15`, `deploy/wwma-upstream-backend.service:1-18`, `.github/workflows/ci.yml:1-51` | Read; CI has no CD, daemon/backend auto-restart, frontend deploy is manual |
| Prior audits | `artifacts/phase1/audit/plan-validation-report.md:13-136`, `artifacts/phase1/audit/baseline-report.md:36-196` | Read; prior five-blocker gate remains unresolved |

## Prioritized blockers

### B0 — Authoritative design is not internally normalized

**Evidence:** The design says open decisions remain at `:703-711`, while confirmed decisions already select 24-hour observation and deployment policy at `:305-315`; it also retains historical questions and a second approval gate at `:668-677` and `:713-721`. The implementation plan treats the decisions as fixed at `:11-23,259-292`.

**Risk:** An implementer can legitimately choose either the historical question text or the later confirmed decision, especially for retention, deployment, staging, observation, circuit-breaker wording, and degraded mode. This violates the design's own requirement that unresolved questions be resolved before implementation (`:670-677`).

**Required resolution / acceptance:** Produce one normalized authoritative decision table. Mark historical questions non-authoritative or remove them; close every item in `:703-711`; explicitly approve the implementation plan. The gate must record the exact selected policy for aggregate schema, pagination/event names, maintenance UI, deployment, and observation evidence.

### B1 — Safety policy contradiction: delayed orderbook versus “normal pricing”

**Evidence:** The design selects delayed after 120 seconds and says cycles and normal pricing continue, PUTs are not blocked (`:109-118,685-687`). It separately defines downtime as no completed cycle for 120 seconds (`:293-299,695-698`). The implementation plan repeats both at `:15-18,277-283`.

**Risk:** Two independent 120-second clocks can be conflated in implementation or SLO reporting. More importantly, “normal pricing” from stale references is materially different from the earlier proposed guarded behaviors (`:477-493`). The plan does not define whether stale data affects only warning state or also reference freshness, target eligibility, and per-model action.

**Required resolution / acceptance:** State that downtime is heartbeat absence only; delayed orderbook is a separate per-model condition and never counts as downtime. Define the exact stale-data fields and test matrix: fresh, exactly 120s, over 120s, cache refresh failure, and recovery; prove whether PUT eligibility is unchanged. The 24-hour report must separate stale warnings from heartbeat gaps.

### B2 — Persistence/heartbeat semantics are unsafe and incomplete

**Evidence:** The design requires heartbeat health after JSON state write and treats DB failure as a separate warning (`:297-299,683-698`). The daemon currently catches and ignores JSON write errors at `scripts/auto_pricing.py:947-951`, swallows state DB failures at `:196-225`, and writes/upserts after decision processing at `:940-952`. REV13 documents best-effort persistence and JSON fallback at `docs/auto-pricing.md:485-499`.

**Risk:** A failed JSON write can be reported as a healthy completed cycle unless the new finalization path is explicit. Conversely, the plan's `finish_cycle` and “after persistence/state write” language (`implementation:101-105,121,154-156`) does not define which persistence is mandatory, transaction boundaries, or what happens if event inserts partially succeed.

**Required resolution / acceptance:** Define verified atomic JSON state write, completion ordering, and heartbeat status (`healthy`, `persistence_warning`, or equivalent). Define DB transaction/idempotency behavior for partial failures and event replay. Tests must prove JSON failure is not healthy, DB failure records a warning without blocking pricing, event IDs deduplicate retries, and every cycle has a terminal record.

### B3 — Canonical schema ownership and migration are unresolved

**Evidence:** `backend/db_schema.py:1-13` declares itself the sole idempotent DDL source and owns REV13 tables at `:207-260`; the daemon independently redeclares those tables at `scripts/auto_pricing.py:119-173`. The implementation plan proposes new tables at `:57-89` but does not specify a migration/version strategy.

**Risk:** Divergent definitions/indexes or startup ordering can make backend and daemon observe different schemas. Adding columns to existing production tables without a migration/rollback procedure can break the current REV13 contract.

**Required resolution / acceptance:** Make `backend/db_schema.py` canonical, or document an exact shared definition mechanism. Specify additive migration, indexes, constraints, ownership, and rollback. Test backend startup and daemon startup against the same DDL, including existing REV13 databases; prove no destructive migration.

### B4 — ARM/DISARM has an unsafe compatibility and atomicity gap

**Evidence:** The existing endpoint at `backend/app.py:2306-2318` directly writes the ARM file and returns success without auth metadata/audit. The design requires authenticated audited controls (`design:249-261,699-700`); the implementation plan adds new routes at `:132-156` but only says compatibility is implicit in prior audit artifacts.

**Risk:** Existing frontend/CLI callers may continue using the legacy endpoint, bypassing the new audit path. Filesystem state and audit persistence can disagree on failures; one-click semantics can race with concurrent requests. The plan does not define idempotent same-state requests or operator identity source.

**Required resolution / acceptance:** Preserve the legacy endpoint as an authenticated compatibility wrapper or migrate every caller in one reviewed change. Define ordering/atomicity and failure response: no success unless state and audit outcome are known. Test old/new endpoints, expired sessions, same-state transitions, concurrent transitions, filesystem failure, DB failure, operator/timestamp/old/new/source/result fields, and post-deploy agreement.

### B5 — Auth/session/SSE requirements lack a deploy-safe contract

**Evidence:** Existing auth is bearer-session based with 24-hour TTL (`backend/app.py:48,648-720`), while the design only says preserve existing behavior and define expiry (`design:405-407`). SSE is backend-owned (`:267-279`) and must reconnect/recover (`:409-419`), but the implementation plan only says “authenticated SSE” and in-process subscribers (`implementation:132-156`). The README states all API routes require bearer auth and the frontend uses `/api/login` (`README.md:Security section`; exact lines unavailable in the read excerpt).

**Risk:** Native browser `EventSource` cannot set an arbitrary Authorization header in the usual API, so an implementation can accidentally use an unauthenticated stream, leak data via query tokens, or silently fail cross-origin. The plan does not define cookie versus header transport, CORS behavior, session expiry event, stream cleanup, per-client limits, or whether Vercel-to-nginx proxying supports long-lived SSE.

**Required resolution / acceptance:** Choose and document a safe SSE auth mechanism compatible with the existing session model (prefer a protected same-origin/session-cookie or a reviewed fetch-stream alternative; never put passwords/tokens in query strings). Define CORS, proxy buffering/timeouts, heartbeat comments, disconnect cleanup, bounded client/resource limits, 401/expiry behavior, reconnect backoff, cursor replay, ordering, and stale-state UI. Test unauthenticated, expired, cross-origin, reconnect, missed-event replay, duplicate event, and stream termination cases.

### B6 — Retention policy contradicts existing lock/runbook and has no operational rollup contract

**Evidence:** The design confirms raw events 30 days and aggregates 90 days (`design:289-292,683-695`); the implementation plan repeats this at `:20,57-89,228-255`. Existing lock says operation/API logs retain 30 days (`docs/PRODUCTION-LOCK.md:45-58`), and the runbook documents backup script retention of 14 days (`docs/OPS-RUNBOOK.md:46-64`).

**Risk:** “90-day retention” is not equivalent to 90-day recoverability. The plan does not define timezone/bucket boundaries, late-arriving events, idempotent recomputation, aggregate consistency after restore, cleanup failure alerts, or whether existing `auto_pricing_ops`/`auto_pricing_api_log` remain raw 30-day data. It also does not reconcile backup retention with the observation/audit evidence requirement.

**Required resolution / acceptance:** Document exact table ownership and retention separately for raw REV13 tables, reliability events, and aggregates; define UTC bucket semantics and rerun behavior. Add cleanup/rollup failure evidence and backup/restore expectations. Update lock/runbook only as part of approved implementation, not by assumption.

### B7 — Deployment sequence and production evidence are under-specified

**Evidence:** Design requires green CI, approved PR, and explicit manual approval (`design:309-315`); the implementation plan says backend then daemon then frontend and “disarm only when required” (`:265-283`). Production lock requires committed source, matching hashes, one daemon/backend service, fresh DB, public frontend, and rollback artifacts (`docs/PRODUCTION-LOCK.md:36-43,60-98`). Runbook contains a dangerous manual `nohup` backend recovery path (`docs/OPS-RUNBOOK.md:87-103`) and warns frontend deploy must be from `frontend/` (`:112-122`).

**Risk:** “Backend first” can deploy an API that the old frontend cannot consume, while frontend first can expose a UI against missing endpoints. `Restart=always` in both units (`deploy/wwma-auto-pricing.service:5-12`, `deploy/wwma-upstream-backend.service:6-15`) complicates disarm/restart and lock takeover. “Disarm only when required” is not a deterministic safety procedure. No explicit schema migration gate, health/readiness gate, rollback ordering, or evidence template exists.

**Required resolution / acceptance:** Define a release sequence with backup, schema compatibility, service readiness, frontend deployment source directory, ARM state, rollback order, and abort criteria. Prohibit manual duplicate backend startup or explicitly reconcile the runbook's `nohup` path with the production lock. Require exact evidence: reviewed commit/hash, CI URL, PR approval, manual approval, backup identifiers, migration result, service PIDs, ARM state, `/health`, API auth smoke, frontend URL, and rollback artifact paths.

### B8 — 24-hour evidence gate is not measurable enough to pass/fail

**Evidence:** The design requires at least 24 hours and names heartbeat, service, DB freshness, warnings/errors, duplicates, and pricing health (`design:305-307`). The implementation plan says observe stale detection, status, freshness, errors, and pricing health (`implementation:277-283`), while the production lock's prior soak is only 10 cycles (`docs/PRODUCTION-LOCK.md:80-98`).

**Risk:** “24 hours” can pass despite gaps, maintenance, stale DB, silent persistence failures, duplicate processes, or unverified ARM/DISARM. There is no sampling cadence, clock source, minimum cycles, allowed warning/error budget, definition of DB freshness, required all-model coverage, or rule for restart/reconnect during observation.

**Required resolution / acceptance:** Define a signed evidence template before deployment: start/end UTC, expected interval, completed-cycle count, maximum heartbeat gap, service/PID samples, DB newest timestamps per table, JSON state freshness, delayed/error counts, duplicate count, SSE reconnect/recovery results, ARM/DISARM audit samples, maintenance exclusions, and explicit pass/fail thresholds. Any missing telemetry or unbounded interval must fail the gate; prior 10-cycle evidence cannot substitute for 24-hour evidence.

## Additional non-blocking but required implementation clarifications

1. **Event model:** Specify constraints/indexes for `reliability_cycles`, `reliability_events`, and aggregates; define payload schema, nullability, event severity/type enums, and whether routine successful API calls are in the durable table but omitted from the default timeline (`design:337-343`).
2. **Pagination:** The design defers strategy to implementation (`:345-347`), while the implementation plan prescribes `(detected_at,event_id)` (`implementation:150-153`). Confirm cursor fields, timestamp precision, tie-breaking, filter/index combinations, and maximum limit.
3. **SSE cadence:** “After every completed cycle” (`design:277-279`) conflicts slightly with “detail events available” and an in-process subscriber list (`implementation:154-156`). Define whether one cycle event or multiple event frames are emitted and how event IDs/cursors map to REST replay.
4. **All-model semantics:** HOLD persistence is mandatory (`design:283-287`), but schema examples do not state how model errors, missing orderbook rows, dry-run rows, and models disappearing between cycles are represented. Define a complete-cycle snapshot invariant.
5. **Availability denominator:** Define calendar-month UTC boundaries, maintenance event authorization, and how planned maintenance is recorded before exclusion (`design:293-299,695-698`).
6. **Alert semantics:** The design lists many alert classes (`:65-73,192-201`) but later narrows Phase 1 to dashboard-only and only five consecutive errors (`:513-550,683-688`). Confirm which listed conditions are persisted/displayed versus newly alerting.
7. **Frontend scope:** The implementation plan creates new files and changes the landing route (`implementation:166-191`), but must explicitly preserve all 17 routes and avoid finance views despite existing dashboard scope (`design:239-245,361-379`).

## Recommended sequencing after blockers are closed

1. Normalize and approve the authoritative decision log; record the five prior resolutions plus the new SSE/deployment/24-hour evidence contract.
2. Freeze a schema migration and event contract; make DDL ownership canonical and test startup convergence.
3. Add failing daemon tests for verified JSON heartbeat, DB failure, UUID/idempotency, delayed data, error warning, and PID/systemd behavior.
4. Implement daemon persistence/heartbeat/lock without changing REV12/REV13 pricing decisions; run regression tests.
5. Add authenticated REST tests and define ARM compatibility/atomicity before implementing controls.
6. Resolve SSE transport/auth/proxy behavior; implement bounded stream and REST replay tests.
7. Build the light-only reliability UI, stale/reconnect states, accessibility, and all-model/HOLD coverage.
8. Update runbook/lock with deterministic deployment, rollback, retention, backup, and evidence templates.
9. Run CI-equivalent verification and obtain approved PR plus explicit manual deployment approval.
10. Deploy using the approved sequence, capture release evidence, then begin a fresh 24-hour observation. Do not claim completion from the existing 10-cycle soak.

## Gate result

- **Read-only document comparison:** PASS.
- **Architectural consistency:** BLOCKED.
- **Acceptance criteria completeness:** BLOCKED.
- **Implementation authorization:** BLOCKED.
- **Production authorization:** BLOCKED.

No unsafe assumptions are approved. No code changes should begin until B0–B8 are resolved in the authoritative plan and the implementation plan is separately approved.
