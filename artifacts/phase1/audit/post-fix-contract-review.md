# Post-Fix Contract Review

**Date:** 2026-08-18
**Scope:** Read-only verification of the current backend/frontend reliability contracts after the latest fixes.
**Decision:** **BLOCKED** — focused and full local test commands passed, but source review identifies unresolved integration and persistence contract failures. Passing tests below are executed evidence only; they do not establish release readiness.

## Evidence classification

- **Executed evidence:** commands run during this review, with results recorded in §7.
- **Source review:** static inspection of current implementation and tests, with exact references below.
- **Not established:** production/live daemon behavior, fresh PostgreSQL schema initialization, live SSE reconnect/replay, deployment behavior, and end-to-end browser/API integration.

## Contract results

| Contract | Result | Basis |
|---|---|---|
| Prior fix reports and outstanding blockers | **BLOCKED** | `artifacts/phase1/audit/backend-integration-fix-report.md:27-35` records unresolved daemon lifecycle/event persistence, cursor ordering, ARM/DISARM audit/reconciliation, fresh-schema, and live-evidence blockers. `frontend-integration-fix-report.md:27-31` makes backend completion a dependency. Current source does not close all of them. |
| Daemon persistence | **BLOCKED** | `scripts/auto_pricing.py:119-127` persists heartbeat JSON; `:187-270` persists operation/state rows; `:298-349` performs retention/aggregate maintenance. No daemon cycle creation/completion or event insertion into `reliability_cycles` / `reliability_events` is present. Reliability API tables can therefore remain empty while daemon cycles execute. |
| REST response/envelope compatibility | **BLOCKED** | Backend summary returns `{aggregates: rows}` (`backend/app.py:2347-2350`); list routes return `{cycles, limit}` and `{events, limit}` (`:2353-2364`); model route returns `{models}` (`:2367-2370`). `frontend/src/pages/Reliability.jsx:37-48` unwraps the summary and reads `armed`, `stale`, and `status` as direct fields, so the actual `{aggregates: [...]}` summary does not provide the fields the page consumes. `responseMeta()` exists in `frontend/src/lib/reliabilityApi.js` but is not used by the page. There is no consistent `{data, meta}` contract or cursor metadata. |
| REST/SSE cursor compatibility | **BLOCKED** | REST and SSE filter with `event_id > UUID` (`backend/app.py:2363`, `:2401`) while ordering by `occurred_at`. UUID comparison is not a chronological monotonic cursor and does not guarantee complete, deduplicable replay. `frontend/src/hooks/useReliabilityStream.js:57-59,74-75` correctly persists an opaque cursor and sends `Last-Event-ID`, but cannot repair a non-chronological server cursor. |
| SSE framing | **PASS (narrow)** | `backend/app.py:2405-2407` emits LF-delimited SSE frames and blank-line termination. `backend/tests/test_reliability_api.py:16-21` checks keepalive framing and rejects literal backslash-newline output. This does not prove live disconnect cleanup or replay correctness. |
| ARM/DISARM audit fields | **BLOCKED** | `_set_auto_pricing_state()` writes only `armed` and `occurred_at` audit values (`backend/app.py:2311-2314`); operator identity, reason, source, correlation/request ID, and outcome are absent. Success responses expose the arm-file path (`:2327-2328`, `:2377-2378`, `:2385-2387`). DB commit precedes file publication (`:2310-2318`), so file-write failure can leave committed DB state with an inconsistent daemon control file. |
| ARM/DISARM daemon-state reconciliation | **BLOCKED** | Daemon reads `~/.hermes-suisui/logs/auto-pricing-arm` (`scripts/auto_pricing.py:861-867`), while API updates DB and then writes the file (`backend/app.py:2310-2318`). No atomic/reconciled state protocol or concurrency serialization is demonstrated. |
| Replay chronology and deduplication | **BLOCKED** | Server predicate uses UUID ordering but sort uses timestamp (`backend/app.py:2363`, `:2401`); schema uniqueness is only `(cycle_id, event_type)` (`backend/db_schema.py:264-296`) and no monotonic replay sequence is shown. UI deduplication by `event_id` exists (`frontend/src/pages/Reliability.jsx:32-35`), but client deduplication cannot recover omitted or out-of-order events. |
| UI consumption of backend envelopes | **BLOCKED** | `frontend/src/pages/Reliability.jsx:37-48` consumes summary fields incompatible with backend `{aggregates: [...]}`. Event deduplication and cycle handling are present at `:32-41,49-54`, and limit adaptation is present in `frontend/src/lib/reliabilityApi.js:12-25`, but rendered consumption against actual backend payloads is not covered. |
| Actual test coverage | **PASS for executed suites; BLOCKED for required contract coverage** | Current suites pass, but no tests prove daemon cycle/event writes, monotonic replay boundaries, fresh empty-PostgreSQL initialization, DB/file reconciliation, complete ARM/DISARM audit fields, or rendered UI consumption of actual backend envelopes. Frontend run reports only 4.23% overall statement coverage. |
| Fresh schema initialization | **BLOCKED** | `backend/db_schema.py:42-43` alters `refunds` before `CREATE TABLE IF NOT EXISTS refunds` at `:159-169`. `backend/tests/test_db_schema.py:16-64` checks SQL text/idempotence through test doubles, not execution against an empty PostgreSQL database. |

## Source/test coverage assessment

The focused tests are useful but narrow:

- `backend/tests/test_reliability_api.py:4-21` covers authentication, limit handling, and basic SSE framing only.
- `backend/tests/test_db_schema.py:16-64` covers schema text/idempotence contracts through mocked or textual checks, not fresh-database execution.
- `frontend/src/hooks/useReliabilityStream.test.jsx:5-22` covers only selected SSE parser behavior.
- `frontend/src/pages/Reliability.test.jsx:4-10` covers the `unwrap()`/metadata helper behavior, not rendered page consumption of the backend's real summary envelope.

Therefore, executed green tests must not be interpreted as evidence that the end-to-end reliability contracts pass.

## Executed verification

Commands run in this review:

1. `python -m pytest backend/tests scripts/tests -q` (repository root)
   **Exit 0** — `100%` of collected tests passed (`61%` then `100%` progress; one deprecation warning from `pytest_asyncio` regarding `asyncio.get_event_loop_policy`).
2. `python -m py_compile backend/app.py backend/db_schema.py scripts/auto_pricing.py`
   **Exit 0** — no output/errors.
3. `npm test -- --run` (from `frontend/`)
   **Exit 0** — 5 test files passed, 23 tests passed; coverage reported overall statement coverage `4.23%`.
4. `npm run build` (from `frontend/`)
   **Exit 0** — Vite build completed; warning that the generated JS chunk exceeds 500 kB.
5. `git status --short && git diff --stat` (read-only inspection)
   **Result:** repository already contains uncommitted source/docs changes and untracked artifacts/tests, including `backend/app.py`, `backend/db_schema.py`, frontend reliability files, and `artifacts/`. No source edits were made by this review.

## Remaining blockers

1. Add daemon writes for terminal `reliability_cycles` and idempotent `reliability_events`, with integration tests proving persistence.
2. Replace UUID comparison with a monotonic server cursor/sequence and specify chronological ordering, replay boundary, and duplicate semantics.
3. Align REST envelopes and summary shape with the fields consumed by `Reliability.jsx`, including cursor/stale metadata where required; add a rendered integration test using actual backend payloads.
4. Expand ARM/DISARM audit records with operator, reason, source, correlation/request ID, and outcome; define atomic DB/file reconciliation and concurrent-transition behavior.
5. Move `refunds` ALTER statements after table creation and execute `ensure_schema()` against a genuinely empty PostgreSQL instance.
6. Obtain live daemon and SSE reconnect/replay evidence; do not treat local unit tests, build success, or `py_compile` as release evidence.

**Release-readiness statement:** No release readiness is claimed. The review result remains **BLOCKED** pending the items above.
