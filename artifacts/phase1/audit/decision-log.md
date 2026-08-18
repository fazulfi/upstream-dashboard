# Phase 1 Reliability Decision Log

**Status:** Decision record complete for planning. **Implementation authorization:** blocked pending separate approval. **Production authorization:** blocked.

This file is the authoritative Phase 1 decision record for B0 through B8. Historical alternatives and exploratory questions remain in the source plan only as non-authoritative context. This record does not claim implementation, deployment, or production readiness. Approval and status here are implementation-gate evidence, not production authorization.

## Evidence basis

- `artifacts/phase1/audit/architecture-gate-report.md:27-132` defines B0 through B8 and records the blocked architecture gate.
- `artifacts/phase1/audit/blocker-resolution-review.md:27-90` records the safe minimum contracts and unresolved gate conditions.
- `artifacts/phase1/audit/plan-validation-report.md:34-112` records canonical schema, heartbeat, lock, ARM/DISARM, auth, retention, route, and CI constraints.
- `artifacts/phase1/audit/external-sse-research.md:7-19,23-44,67-102` supports fetch-based SSE when Authorization headers are required, cursor replay, bounded reconnect, cleanup, and proxy heartbeats.
- `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability.md:103-126,229-307,309-319,683-701` records pricing, dashboard, retention, availability, heartbeat, deployment, and rollback semantics.
- `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability-implementation.md:11-23,132-164,201-283` records the executable workstreams and route list.

## Authoritative decisions

| Blocker | Decision |
|---|---|
| **B0, authority** | This table and the decisions below are authoritative. Historical question lists, earlier alternatives, and contradictory “open” wording are non-authoritative. Phase 1 remains planning-only until this record and the implementation plan receive separate approval. Approval/status is a gate record, not production authorization. |
| **B1, delayed data and downtime** | Orderbook/reference age and daemon downtime are independent. At age **120 seconds**, mark the affected data/model delayed, persist and expose a warning, and label it stale. A delayed condition is independent of downtime, does not stop cycles, and never blocks a PUT solely because of delay. Downtime is measured by missing completed heartbeat, with no completed cycle for 120 seconds as the detection threshold. Pricing semantics, provider scope, Basis B, `max_in`, and existing safety rules are preserved. |
| **B2, heartbeat and persistence** | Create one UUID v4 cycle ID at cycle start and unique event IDs for durable events. Verify the atomic JSON write, including flush, fsync, replace, and success result, before finalizing a healthy heartbeat. JSON failure cannot produce a healthy heartbeat. PostgreSQL failure records a persistence warning and does not block pricing or PUT when InferHub and JSON are usable. Every cycle has one terminal summary and event retries are idempotent by event ID. |
| **B3, schema ownership** | `backend/db_schema.py` is the sole canonical DDL owner. The daemon uses the same shared idempotent schema path or an exactly synchronized helper. Reliability schema changes are additive, versioned, indexed, constraint-tested, and non-destructive. Existing REV13 columns and constraints remain compatible. |
| **B4, ARM/DISARM atomicity and compatibility** | A single authenticated transition service owns old `/api/auto-pricing/arm` compatibility and new `/api/reliability/arm` and `/api/reliability/disarm` routes. A request is successful only when the state write and required audit persistence have known successful outcomes. Same-state requests are idempotent and audited. Audit records operator, UTC timestamp, old state, new state, source, result, and event ID. Concurrent, filesystem, database, expired-session, and legacy callers are tested. |
| **B5, authenticated SSE** | Use backend-owned **fetch-based authenticated SSE** so the client sends `Authorization: Bearer <session-token>` in the request header. Do not use native `EventSource` for bearer authentication, and never put passwords, bearer tokens, or session secrets in query parameters. The stream is `GET /api/reliability/stream`, emits `text/event-stream` frames with verified JSON heartbeat/data semantics, stable event IDs, bounded reconnect/backoff, disconnect cleanup, proxy-safe comment heartbeats, expiry/401 handling, and REST cursor/snapshot recovery. PostgreSQL REST history is authoritative; in-process subscribers only notify. Explicit origin allowlisting and no wildcard credentialed CORS are required. |
| **B6, retention and rollups** | Raw REV13 operational rows and reliability raw events are distinct from aggregates. Reliability raw events retain 30 days. Aggregates retain 90 days, hourly for the latest 30 days and daily for days 31 through 90. Bucket boundaries and all timestamps use UTC. Late events are recomputed or upserted idempotently, repeated rollups do not double count, and cleanup/rollup failures are recorded. This policy does not imply 90-day backup or recoverability; lock, runbook, backup retention, and restore evidence must be reconciled during approved implementation. |
| **B7, deployment** | Deployment is manual only. CI remains CI-only with no CD. A release requires green CI, approved PR, explicit manual deployment approval, backup, additive schema compatibility, deterministic systemd service sequencing, readiness/auth/SSE smoke checks, one backend and one daemon identity, and rollback evidence. Systemd is authoritative; manual recovery stops the service first and must not create duplicate `nohup` services. No deployment or production authorization follows from this planning record. |
| **B8, signed observation gate** | Before any observation begins, define and sign a UTC evidence template and numerical thresholds. The minimum window is 24 continuous hours. Evidence includes expected cycle interval, observed/completed cycles, maximum heartbeat gap, service/PID samples, JSON freshness, newest DB timestamps by table, delayed/error counts, duplicate count, SSE reconnect and REST recovery, ARM/DISARM audit samples, maintenance intervals, source/hash, and operator signatures. Pass requires complete telemetry, no unexplained gap or duplicate process, no heartbeat gap beyond the approved 120-second detection threshold, contracted JSON/DB freshness, all-model accounting, and successful auth/SSE recovery. Missing telemetry, unknown intervals, unclassified errors, or any threshold breach is FAIL and restarts the window. A prior 10-cycle soak is insufficient. |

## Scope locks

- All **17 existing frontend routes** remain retained. No route is deleted unless the three mandatory evidence conditions are met: absent from active navigation or important routes, no active code/runtime usage, and no remaining MVP operational function. Current audit evidence does not approve deletion: `artifacts/phase1/audit/frontend-surface-report.md:14-45,198-219`.
- Phase 1 remains reliability-only. Finance, revenue, margin, ROI, pricing configuration editing, individual PUT approval, and broad control-plane features remain out of scope.
- Preserve pricing semantics and constraints. No percentage clamp, automatic circuit breaker, queue, replay worker, event bus, new fallback store, or separate incident subsystem is added.

## Gate status

**Architecture gate:** BLOCKED, per `artifacts/phase1/audit/architecture-gate-report.md:124-132`.

**Implementation gate:** The B0-B8 contracts are now recorded for review, but implementation remains unauthorized until the decision record and implementation plan are separately approved.

**Production gate:** BLOCKED by the existing dirty-tree, credential-bearing fallback DSN, incomplete backup/restore evidence, and absent live release proof, per `artifacts/phase1/audit/blocker-resolution-review.md:74-80`.
