# Phase 1 Integration Review Report

**Date:** 2026-08-18
**Scope:** Current W1-W5 source changes and Phase 1 audit/report artifacts
**Review mode:** Read-only integration review; no deployment, production access, code fix, or commit performed.
**Conclusion:** **BLOCKED — do not claim CI or production readiness.**

## Executive finding

The implementation has useful additive schema and pricing-regression coverage, but the integrated reliability surface is not contract-safe. Confirmed blockers include malformed SSE framing, frontend/backend response-shape mismatches, absent daemon writes to reliability tables, incomplete ARM/DISARM audit semantics, fresh-schema ordering failure, password-bearing fallback DSNs, and failing targeted tests. Existing reports must not be treated as implementation or production approval; `artifacts/phase1/audit/decision-log.md:3-5,38-42` explicitly keeps those gates blocked.

## Findings

### CRITICAL — Fresh-schema initialization can fail

- **Evidence:** `backend/db_schema.py:37,43-44` alters `refunds` before its `CREATE TABLE IF NOT EXISTS refunds` at `:157-167`.
- **Impact:** On an empty PostgreSQL database, schema initialization can fail before required tables exist. `backend/app.py:89-100` catches initialization failure and continues after logging the error, so the service may run with an incomplete schema.
- **Mismatch:** Contradicts the repeatable/fresh-install implication in `artifacts/phase1/audit/schema-contract-report.md:7-12,37`.
- **Fix:** Create `refunds` before all `ALTER TABLE refunds` statements and run `ensure_schema` against a genuinely empty PostgreSQL database.

### HIGH — SSE wire frames are malformed

- **Evidence:** `backend/app.py:2403-2405` uses source strings containing `\\n`, e.g. `"id: %s\\nevent..."`, rather than actual newline characters.
- **Impact:** Python emits literal backslash-n characters; the browser parser at `frontend/src/hooks/useReliabilityStream.js:9,51-52` splits only on actual CR/LF blank lines. Events and keepalives will not parse as SSE frames.
- **Mismatch:** Fails B5 in `artifacts/phase1/audit/decision-log.md:25` and the claim in `artifacts/phase1/audit/api-sse-contract-report.md:6`.
- **Fix:** Emit actual `\n` delimiters and add a raw-response test that parses multiple events, keepalives, chunk boundaries, and disconnect cleanup.

### HIGH — Frontend/backend reliability payload contracts do not match

- **Cycle time:** Backend returns `completed_at` (`backend/app.py:2354`); UI renders `finished_at` (`frontend/src/pages/Reliability.jsx:41`).
- **Event time:** Backend returns `occurred_at` (`backend/app.py:2361,2399`); UI renders `detected_at` (`frontend/src/pages/Reliability.jsx:42`).
- **Summary:** Backend returns `{aggregates: rows}` (`backend/app.py:2345-2348`), while UI expects current-state fields such as `service_status`, `last_heartbeat`, `model_count`, `hold_count`, `error_count`, `armed`, and embedded `models` (`frontend/src/pages/Reliability.jsx:29-39`).
- **Models:** Backend `/models` returns only `slug, model_id, action, updated_at, reason` (`backend/app.py:2365-2368`); UI expects price/reference/freshness fields and never calls `reliabilityApi.models()` (`frontend/src/pages/Reliability.jsx:30,40`).
- **Impact:** KPIs, cycle timestamps, event timestamps, and model columns show empty/default values even when the API responds.
- **Fix:** Define one versioned wire schema and either adapt backend responses or map the exact backend fields in the frontend; test real response fixtures end-to-end.

### HIGH — SSE events are not applied and reconnect replay is not implemented

- **Event application:** Backend stream rows contain `event_id,event_type,severity,occurred_at,payload` (`backend/app.py:2399-2403`), but the UI only inserts events when top-level `cycle_id` or `finished_at` exists (`frontend/src/pages/Reliability.jsx:26-28`) and does not unwrap nested `payload`.
- **Cursor:** The hook parses IDs but never stores/sends the last ID as `Last-Event-ID` (`frontend/src/hooks/useReliabilityStream.js:10-16,37-40`). Backend accepts it (`backend/app.py:2390-2393`). Reconnects therefore restart from an empty cursor and can duplicate or replay events.
- **Backend cursor correctness:** REST and stream queries compare UUID values (`backend/app.py:2361,2399`) while ordering by `occurred_at`; UUID ordering is not chronological and has no stable monotonic replay sequence.
- **Fix:** Specify a monotonic cursor (or `(occurred_at,event_id)` tuple), persist the received cursor, send it on reconnect, unwrap and apply event payloads, and test replay/duplicate prevention.

### HIGH — Reliability tables are read but never populated by the daemon

- **Evidence:** Tables are declared in `backend/db_schema.py:263-294` and queried by `backend/app.py:2345-2368,2399`; `scripts/auto_pricing.py` has no inserts into `reliability_cycles` or `reliability_events`.
- **Impact:** Summary, cycles, events, and SSE normally remain empty while the daemon continues writing legacy `auto_pricing_*` tables.
- **Mismatch:** Conflicts with `artifacts/phase1/audit/api-sse-contract-report.md:3-8` and leaves the UI without authoritative operational data.
- **Fix:** Add cycle start/finalization and event persistence with UUID propagation, terminal summary, idempotency, and persistence-warning semantics; then test it.

### HIGH — Targeted reliability tests are not green

Command: `python -m pytest -q backend/tests/test_reliability_api.py backend/tests/test_db_schema.py`

Result: **2 errors, 1 failure**.

- `backend/tests/test_reliability_api.py:9,16` requests missing fixture `auth_headers`; available fixtures include `auth_client`, not `auth_headers` (`backend/tests/conftest.py:27-44`).
- `backend/tests/test_db_schema.py:62-69` constructs a mock cursor context incorrectly; `_db_ensure_schema` uses nested connection/cursor context managers, producing `AttributeError: Mock object has no attribute '__enter__'`.
- **Fix:** Repair fixtures/mocks, then rerun targeted tests. Do not count these tests as evidence until they execute the assertions.

### HIGH — Tracked password-bearing fallback DSN

- **Evidence:** `backend/app.py:68` and `scripts/auto_pricing.py:137` contain `postgresql://gamesim:upstream_local@127.0.0.1:5432/upstream`.
- **Impact:** Missing environment configuration silently activates a credential-bearing fallback; tracked source also exposes a password. This matches the unresolved risk in `artifacts/phase1/audit/ci-deployment-security-report.md`.
- **Fix:** Remove password-bearing defaults; fail closed with explicit configuration validation and rotate any credential that may have been used.

### HIGH — ARM/DISARM audit and state contract is incomplete

- **Evidence:** `backend/app.py:2308-2316` creates inline control tables and records only `armed, occurred_at`; routes at `:2371-2387` return only armed/file/outcome.
- **Decision-log mismatch:** B4 requires operator, UTC timestamp, old/new state, source, result, event ID, same-state idempotence, legacy compatibility, and tested failure outcomes (`artifacts/phase1/audit/decision-log.md:24`).
- **Consistency risk:** DB commit occurs before arm-file write. A file failure can leave DB state changed while daemon still reads the old file (`scripts/auto_pricing.py` arm-file logic around `:743-750`). No reconciliation path exists.
- **Security:** Responses expose the internal filesystem path (`backend/app.py:2375-2376,2383-2385`) and raw exception text (`:2377-2378,2386-2387`).
- **Fix:** Move control/audit DDL into `backend/db_schema.py`, centralize an authenticated transition service, define reconciliation/unknown-outcome handling, persist complete audit fields, and return safe public errors without filesystem paths.

### MEDIUM — Deployment/runtime evidence remains unresolved

- `deploy/wwma-upstream-backend.service:13-14` assumes `/home/gamesim/dashboard/backend/app.py`; daemon unit `deploy/wwma-auto-pricing.service:8-9` assumes `/home/gamesim/scripts/auto_pricing.py`. Repository layout has both under the project root; no target-host proof confirms these paths.
- Service invokes `--interval 60` (`deploy/wwma-auto-pricing.service:9`) while module default is 30 (`scripts/auto_pricing.py:44`). This may be intentional but is not tested as deployment behavior.
- No live systemd, VPS, PostgreSQL, backup/restore, reverse-proxy, or production SSE verification was performed.

### MEDIUM — Missing frontend integration coverage

The new tests are narrow: `frontend/src/pages/Reliability.test.jsx:4-8` tests only `unwrap`; `frontend/src/hooks/useReliabilityStream.test.jsx:4-10` tests only API allowlisting. Missing tests cover response mapping, rendered timestamps/KPIs, model loading, SSE parser/frame bytes/event names/multiline data/chunking, cursor persistence, reconnect expiry, cleanup, 401/session clearing, manual retry race, ARM/DISARM unknown outcomes, and partial REST recovery.

### LOW/MEDIUM — Pricing safety is not proven end-to-end

Existing `scripts/tests/test_self_undercut.py` covers core provider-scoped/Basis-B behavior and passed, and no pricing formula or prohibited queue/event-bus/circuit-breaker/auto-kill mechanism was observed. However, there is no end-to-end test proving backend ARM state and daemon file state remain consistent through persistence failures, or proving heartbeat/DB failures cannot accompany unsafe PUT behavior. No accidental pricing change is established by this review, but readiness cannot be inferred from unit coverage alone.

## Commands run

- `git status --short && git diff --stat && git diff --name-only` — dirty W1-W5 tree and untracked artifacts/tests confirmed.
- `git diff --check` — PASS.
- `python -m py_compile backend/app.py backend/db_schema.py backend/tests/test_reliability_api.py backend/tests/test_db_schema.py scripts/auto_pricing.py scripts/tests/test_self_undercut.py` — PASS (syntax only).
- `python -m pytest -q backend/tests/test_reliability_api.py backend/tests/test_db_schema.py` — **BLOCKED/FAIL: 2 errors, 1 failure** as detailed above.
- `python -m pytest -q scripts/tests/test_self_undercut.py` — PASS: 51 passed, 1 warning.
- `npm test -- --run` from `frontend/` — PASS: 21 passed in 5 files; coverage is only 3.15% statements overall and does not validate the integration paths above.
- LSP diagnostics — **BLOCKED**: configured `basedpyright` language server is unavailable, consistent with `artifacts/phase1/audit/schema-contract-report.md:43-46`.

## Explicit gate conclusion

**CI readiness: BLOCKED.** Targeted reliability/schema tests fail or do not execute, the source SSE wire format is malformed, and frontend/backend contracts are inconsistent.
**Production readiness: BLOCKED.** The authoritative decision log keeps production blocked; credential-bearing defaults, unresolved deployment paths, absent live release/backup/restore proof, and incomplete control/reliability persistence remain blockers.

Recommended order: fix schema ordering and fail-closed DSN handling; repair tests; define and implement the canonical reliability/control persistence contracts; fix SSE framing/cursor/replay; reconcile frontend mappings; add integration tests; then run full CI and fresh-schema/deployment/backup/SSE smoke verification for the exact revision. No readiness claim should be made before those results are green.
