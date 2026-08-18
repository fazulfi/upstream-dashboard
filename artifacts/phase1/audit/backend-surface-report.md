# Phase 1 Reliability — Backend Surface Audit

**Status:** PASS for read-only readiness audit; implementation not performed.
**Date:** 2026-08-18
**Repository:** `C:\Users\faizz\upstream-dashboard`
**Production impact:** None. No production, database, service, pricing, or configuration access/change was performed.
**Scope:** `backend/`, `scripts/`, `deploy/`, database/schema surfaces, related tests and Phase 1 plans.

## Evidence and method

Read-only evidence used `read`, `glob`, `grep`, `ast_grep_search`, and attempted `lsp_symbols`. Python LSP symbol extraction was unavailable because `basedpyright-langserver` is not installed; this is recorded as a tooling gap, not inferred source behavior. AST route search found 46 Flask routes in `backend/app.py`.

Authoritative requirements were read from:

- `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability.md`
- `docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability-implementation.md`
- Existing comparison: `artifacts/phase1/audit/baseline-report.md`, `plan-validation-report.md`

## Executive readiness

| Surface | Status | Evidence-based result |
|---|---|---|
| Existing auto-pricing contract | READY TO EXTEND | `scripts/auto_pricing.py:743-952`, existing tests preserve provider-scoped Basis-B behavior and `max_in` semantics. |
| Existing auto-pricing persistence | PARTIAL | REV13 tables exist and are written, but no cycle/event IDs, heartbeat, event model, or aggregate tables. |
| Canonical schema path | GAP / BLOCKER | `backend/db_schema.py:12-260` is shared by backend/full sync, but daemon duplicates REV13 DDL at `scripts/auto_pricing.py:119-173`. |
| JSON state | PARTIAL | `_atomic_write` is fsync + replace, but `run_cycle` swallows state-write failure and has no heartbeat semantics. |
| Backend auth | READY TO REUSE | Global `before_request` auth gate and existing token/X-Auth behavior cover future routes. |
| Reliability REST/SSE | NOT PRESENT | No reliability routes or SSE implementation found. |
| ARM/DISARM audit | GAP | Existing endpoint only writes a flag file; no operator/event audit. |
| Retention | PARTIAL / MISMATCH | Daemon deletes raw REV13 rows after 30 days; no aggregates. Backup retention is separate 14-day local / 30-day remote. |
| PID singleton | GAP | systemd restarts automatically, but daemon has no PID/lock implementation. |
| Deployment unit | READY TO EXTEND | `deploy/wwma-auto-pricing.service` is authoritative-looking systemd user unit with `Restart=always`; race policy must be documented/tested. |
| Tests | PARTIAL | Backend tests cover auth and existing API behavior; daemon tests cover pricing contract and DB helper behavior, not Phase 1 reliability contracts. |

## 1. Current auto-pricing flow

1. `scripts/auto_pricing.py:main()` parses `--once`, `--dry-run`, and `--interval`; runs `_db_ensure_schema()` and `_db_retention()` once, then loops `run_cycle()` with exception logging and sleep (`:955-979`).
2. `run_cycle()` reads `~/.hermes-suisui/logs/auto-pricing-arm`; missing/unreadable state means DISARM/dry-run (`:743-750`).
3. It loads catalog via `get_catalog()` (`:343-370`), config via `load_config()` (`:59-101`), HOLD/backoff JSON via `load_hold_state()` (`:255-268`), market anchor via `get_market_min()` (`:576-591`), and sampled provider asks via `get_asks_enabled()` (`:466-525`).
4. `get_positions()` (`:611-669`) builds provider-scoped orderbook levels. `_decide_trigger_area()` (`:676-741`) performs the Basis-B decision and only clamps target to configured `max_in`; this is the safest extension point for correlation/observability because it should remain behaviorally unchanged.
5. Each model appends HOLD, dry-run, undercut/resume, or error decisions. PUTs use `set_ask()` (`:528-545`), which calls `api()`; `api()` records request status/latency/bytes via `_db_log_api()` (`:285-323`, `:176-180`) and retries 429 up to two times.
6. Existing operation rows are written at decision/PUT points through `_db_log_op()` (`:182-193`). JSON HOLD state is saved at `:941`; cycle state is atomically written at `:947-950`; DB snapshot state is upserted at `:951`.
7. Current flow has no explicit cycle start/finalization boundary, UUID propagation, heartbeat after verified state write, delayed-data check, five-error warning counter, aggregate rollup, or PID lock.

**Safe extension points:** wrap `run_cycle()` with `start_cycle()`/finalization while leaving decision helpers untouched; add optional correlation parameters to `_db_log_api`, `_db_log_op`, and `_db_upsert_state`; add reliability event helpers beside existing DB helpers; place heartbeat only after successful `_atomic_write(STATE_FILE, ...)`; add lock acquisition at `main()` before DB setup/loop. Avoid changing `_decide_trigger_area`, `get_positions`, `get_market_min`, `set_ask`, or `max_in` logic.

## 2. Existing `auto_pricing_*` schema and persistence

### Canonical DDL (`backend/db_schema.py`)

- `auto_pricing_config` (`:146-155`): `id SERIAL`, `upstream`, `model_id`, `trigger_pct`, legacy `rebound_pct`, `updated_at`, unique `(upstream, model_id)`.
- `auto_pricing_ops` (`:207-228`): timestamp, slug/model, action, our/target/ref/boundary/official, trigger/max, HTTP status, dry-run, reason; indexes `idx_ap_ops_ts` and `idx_ap_ops_model`.
- `auto_pricing_state` (`:230-247`): one current row per `(slug, model_id)`, pricing/competitor/action/reason fields, `updated_at`, primary key `(slug, model_id)`.
- `auto_pricing_api_log` (`:249-260`): timestamp, endpoint/method/status/ms/bytes; timestamp index.

`backend/app.py:89-100` calls `db_schema.ensure_schema()` from `db_init()`. `backend/full_sync.py` imports the same helper (grep evidence at its schema init comments/import). This is the canonical backend/full-sync convergence path.

### Duplicate daemon DDL

`scripts/auto_pricing.py:_db_ensure_schema()` (`:119-173`) independently creates the same three REV13 operational tables/indexes. This is an exact readiness blocker for new reliability DDL: choose `backend/db_schema.py` as the sole owner and make daemon startup call a shared/idempotent path, or prove exact synchronized definitions. Current daemon `_db_execute()` opens a new psycopg connection per statement (`:104-117`), commits each statement, and suppresses failure.

### Persistence semantics

- `_db_log_api()` skips if psycopg is unavailable or status is falsy.
- `_db_log_op()` skips without psycopg and does not report failure.
- `_db_upsert_state()` suppresses all exceptions (`:196-225`).
- `_db_retention(days=30)` deletes raw `auto_pricing_ops` and `auto_pricing_api_log` rows only (`:228-234`); no state retention or aggregate table exists.
- PostgreSQL outage therefore remains best-effort and pricing continues, matching the design, but Phase 1 must separately persist/surface `persistence_failure` warnings without making DB success a heartbeat prerequisite.

Required Phase 1 tables absent from grep/schema read: `reliability_cycles`, `reliability_events`, `reliability_aggregates`.

## 3. JSON state and daemon-cycle reliability

Existing JSON files:

- `STATE_FILE` and `HOLD_STATE_FILE`: `scripts/auto_pricing.py:43-47`.
- `_atomic_write()` uses `.tmp`, `json.dump`, flush, `os.fsync`, and `os.replace` (`:244-253`).
- `save_hold_state()` catches and suppresses write errors (`:264-268`).
- `run_cycle()` catches state write errors and continues (`:947-950`).

**Finding:** atomic mechanics are a useful base, but “successful JSON state write” is not currently observable as a distinct result. Heartbeat must be emitted only after a verified state write; a failed write must not be reported healthy. DB failure must be a separate warning. No current cycle UUID exists.

The implementation plan’s exact intended interfaces are not present: `start_cycle()`, `finish_cycle()`, `record_reliability_event()`, `acquire_pid_lock()`, and `orderbook_is_delayed()`.

## 4. Backend routes, auth, and API patterns

`backend/app.py` uses Flask and CORS (`:642-643`). `_read_credentials()` (`:664-673`) accepts Bearer session tokens or `X-Auth`; query-string auth is explicitly rejected. `require_auth()` (`:676-687`) verifies HMAC session or password. `_auth_gate()` (`:690-695`) protects every route except `/health`, `/api/login`, and OPTIONS. `api_login()` (`:713-720`) issues a token with `SESSION_TTL`.

AST route evidence includes existing auto-pricing routes:

- `GET /api/auto-pricing` → `api_auto_pricing()` (`:2263-2303`), reads JSON state, arm flag, and last 80 log lines.
- `POST /api/auto-pricing/arm` → `api_auto_pricing_arm()` (`:2306-2318`), writes `auto-pricing-arm` with `1`/`0`; no audit fields or DB event.
- `GET /api/auto-pricing/config` → `api_auto_pricing_config()` (`:2321-2333`).
- `PUT /api/auto-pricing/config` → `api_auto_pricing_config_put()` (`:2336-2375`), normalizes model ID and upserts `auto_pricing_config`.
- `DELETE /api/auto-pricing/config/<int:cid>` → `api_auto_pricing_config_delete()` (`:2378-2388`).

No routes matching `/api/reliability/summary`, `/cycles`, `/events`, `/models`, `/stream`, `/reliability/arm`, or `/reliability/disarm` were found. No `SSE`, `EventSource`, `text/event-stream`, subscriber list, or stream generator was found in backend. Existing API route style is function-based Flask with `jsonify`, direct `db_connect()` contexts, and no observed cursor-pagination helper. Future reliability endpoints should reuse `_auth_gate`, direct indexed DB queries, explicit bounded limit, stable cursor ordering, and REST recovery metadata.

## 5. ARM/DISARM compatibility surface

The daemon reads the filesystem flag and interprets `1` as real PUT and everything else as dry-run (`run_cycle:743-750`). Backend `api_auto_pricing_arm()` writes the same path, but returns success immediately after filesystem write and does not record operator, timestamp, old/new state, source, result, or event ID.

**Safe extension point:** centralize state transition/file write and let both existing `/api/auto-pricing/arm` and new reliability arm/disarm routes call it. Preserve old endpoint compatibility. Audit ordering must ensure failed state or audit persistence is never returned as success. Current CLI/runbook also directly writes the file (`README.md` auto-pricing arm/disarm instructions), so compatibility cannot be assumed away.

## 6. Retention, migration, and backup

- Raw daemon retention is 30 days in `_db_retention()`; this matches raw-event retention but does not implement aggregate retention.
- Phase 1 requires aggregates for 90 days: hourly latest 30 days and daily days 31–90. No aggregate schema, bucket helper, rollup call, or migration file was found.
- `backend/db_schema.py` is idempotent `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`; no versioned migration framework was found in requested surfaces.
- `backend/app.py:89-100` initializes schema at backend startup; `scripts/auto_pricing.py:962-963` initializes daemon DDL at daemon startup. These are the two migration/schema execution paths.
- `scripts/backup_db.sh` retains local compressed dumps 14 days (`:12-25`) and attempts remote retention 30 days (`:41-50`). Backup retention is not operational-history retention and does not satisfy the 90-day aggregate requirement.

**Status:** additive/idempotent schema is feasible; destructive migration evidence is absent. New indexes need to support bounded timestamp/UUID queries and provider/model filters.

## 7. SSE feasibility and limits

Backend is Flask/Waitress and currently has no streaming implementation. The design’s backend-owned SSE is feasible as a new route with authenticated request handling, an in-process subscriber list for connected clients, PostgreSQL/history as durable source, and REST cursor recovery. No direct daemon/frontend coupling exists today, which is compatible with the plan. The implementation must avoid unauthenticated streams, unbounded replay, and stale-current UI semantics.

## 8. PID locking and deployment units

`deploy/wwma-auto-pricing.service`:

- `Type=simple`, `ExecStart=...scripts/auto_pricing.py --interval 60` (`:5-10`)
- `Restart=always`, `RestartSec=10` (`:10-11`)
- user-scoped unit; no `User=`/`Group=` (`:7-8`).

`auto_pricing.py:main()` has no PID/lock call. There is no `os.kill`, PID file, lock file, or stale-PID takeover path in the inspected daemon. Phase 1 can add a simple PID file before the loop: live PID refuses acquisition, dead PID permits takeover, no process is killed. Because systemd uses `Restart=always`, the authoritative launcher and manual stop-before-recovery procedure must be documented and tested for restart/takeover races.

`deploy/wwma-upstream-backend.service` is a separate Waitress/Flask user service (`:6-16`) with `Restart=always`, port 8124, environment file, and backend `ExecStart`. Finance units exist but are unrelated to daemon singleton control.

## 9. Tests and exact gaps

Existing tests:

- `backend/tests/conftest.py:27-37` patches InferHub and `db_connect` for isolated Flask tests; `auth_client` (`:39-44`) logs in and attaches a token.
- `backend/tests/test_app.py` covers no-auth 401, rejected `?auth=`, X-Auth, login/session behavior, and existing orderbook/API behavior. No reliability endpoint, pagination, ARM audit, or SSE tests were found by grep.
- `scripts/tests/test_self_undercut.py` covers provider-scoped orderbook and self-undercut behavior, trigger-area decision regressions, deterministic `run_cycle` blocker cases (`:469-562`), and DB helper behavior when psycopg is missing/mock-connected (`:658-700`). No cycle/event UUID, heartbeat durability, delayed threshold, error-count warning, PID lock, or retention tests were found.
- `backend/tests/test_finance_share.py` and `test_logic.py` are unrelated reliability surfaces.

Required new test evidence from the plan: schema idempotence/column/index contracts, event uniqueness, cycle propagation, raw cleanup and aggregate bucket selection; JSON success/failure heartbeat semantics; DB-warning separation; delayed data continuing PUT/cycles; live/dead PID behavior/no auto-kill; bounded stable REST ordering/filter/auth/session expiry; ARM compatibility/audit fields/failure paths; SSE format/auth/recovery.

## 10. Phase 1 mapping and implementation readiness

| Requirement | Current evidence | Status / safe next extension |
|---|---|---|
| Cycle UUID/event UUID | No UUID in daemon persistence calls | GAP; generate at cycle start and thread through all cycle events. |
| Every HOLD persisted | `_db_log_op()` is called for HOLD branches; decisions include HOLD | PARTIAL; add correlation/event identity and cycle summary. |
| Every API request persisted | `_db_log_api()` records status/latency/bytes when status exists | PARTIAL; add cycle/event IDs and persistence-failure warning. |
| Heartbeat | No heartbeat | GAP; after verified `_atomic_write(STATE_FILE, ...)` and finalization. |
| Delayed orderbook at 120s | Cache TTL is 120s (`_ANCHOR_TTL`), not a delayed-age event | GAP; distinguish cache age/data freshness from missing completed heartbeat. |
| Five technical errors | Errors/backoff exist but no consecutive counter/alert event | GAP; model-scoped warning only, no breaker. |
| 30-day raw/90-day aggregate retention | Raw 30-day delete exists; aggregate absent | PARTIAL; add aggregate table/rollup and indexes. |
| Authenticated REST | Global auth gate exists | READY base; add bounded reliability queries and tests. |
| Authenticated SSE | Absent | GAP; backend-owned stream plus REST recovery. |
| ARM/DISARM | File flag and legacy route exist | PARTIAL; centralize and audit; preserve legacy route. |
| PID singleton | systemd restart only | GAP; simple lock and race-safe runbook. |
| Deployment | Two relevant systemd units | READY base; no production operation during planning. |
| Migration ownership | Shared backend/full-sync schema plus daemon duplicate | BLOCKER; canonicalize daemon path. |

## 11. Findings requiring plan decisions before implementation

1. Canonical DDL must remain `backend/db_schema.py`; daemon startup must converge rather than duplicate divergent definitions.
2. Delayed orderbook age and downtime must use separate clocks: delayed data can coexist with a completed healthy heartbeat.
3. PID lock behavior must explicitly account for `Restart=always`; no auto-kill.
4. Heartbeat health must require verified JSON write; DB failure is separate warning.
5. Existing `/api/auto-pricing/arm` must remain compatible with audited reliability arm/disarm behavior.

## Conclusion

The repository has a clear, safe extension seam around the existing `run_cycle()` persistence tail, shared auth gate, idempotent schema helper, and systemd units. The pricing algorithm itself is covered by targeted regression tests and should not be rewritten for Phase 1 reliability. Implementation readiness is **conditional**: reliability schema/event/heartbeat/API/SSE/PID/aggregate surfaces are greenfield, and the five contract blockers above must be resolved in the authoritative plan before source changes. No production access or edits were performed.
