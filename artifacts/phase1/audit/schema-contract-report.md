# W1 Schema Contract Report

## Scope

Implemented the bounded W1 canonical reliability schema migration:

- `backend/db_schema.py` remains the sole DDL owner.
- Added additive, repeatable DDL for `reliability_cycles`, `reliability_events`, and `reliability_aggregates`.
- Added UUID primary keys with PostgreSQL `gen_random_uuid()` defaults, uniqueness, foreign-key correlation, and indexes.
- Preserved the existing REV13 `auto_pricing_*` tables, columns, constraints, and indexes.
- Updated `scripts/auto_pricing.py` startup schema initialization to call the canonical backend path instead of maintaining duplicate DDL.
- Added focused contract tests in `backend/tests/test_db_schema.py` for additive SQL, convergence, REV13 compatibility, and daemon delegation.

No destructive SQL, queues, event bus, circuit breaker, auto-kill, deployment, secrets, routes, or pricing behavior were changed.

## Contract

`reliability_cycles`:

- `cycle_id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- UTC timestamp fields and terminal status
- indexed newest-cycle lookup

`reliability_events`:

- `event_id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- foreign key to `reliability_cycles`
- `UNIQUE(cycle_id, event_type)` for idempotent event-type convergence
- cycle/time index

`reliability_aggregates`:

- deterministic `(bucket_start, bucket_granularity, metric)` primary key
- value and update timestamp
- bucket index for retention/rollup access

All statements use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`; no `DROP`, `TRUNCATE`, `DELETE`, or destructive `ALTER TABLE` statements were introduced.

## Verification commands

| Command | Exit code | Result |
|---|---:|---|
| `pytest -q tests/test_db_schema.py` from `backend/` | 1 | **BLOCKED**: environment lacks `flask`, imported by `backend/tests/conftest.py` |
| `lsp_diagnostics` on changed Python files | unavailable | **BLOCKED**: configured `basedpyright` language server is not installed |

The targeted test command must be rerun after installing the repository test dependencies (`backend/requirements.txt`, plus pytest tooling). Diagnostics must be rerun after installing/configuring `basedpyright`.

## Blockers

Verification is incomplete because the current environment cannot import Flask and has no configured Python LSP server. No completion claim is made for the test suite or diagnostics until those dependencies are available.
