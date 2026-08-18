# Critical Remediation Report

Date: 2026-08-18

## Implemented

- Removed password-bearing PostgreSQL fallback DSNs from the remaining runtime scripts; database configuration remains environment-only and fail-closed where required.
- `DASHBOARD_PASSWORD` now fails closed when absent or shorter than 12 characters.
- Legacy ARM endpoint now requires a strict JSON boolean; truthy integers/strings are rejected.
- ARM/DISARM responses no longer disclose the filesystem control path.
- Control DDL is owned by `backend/db_schema.py`; the API invokes the canonical schema initializer instead of defining control tables inline.
- Audit operator input is ignored in favor of the fixed authenticated server principal `dashboard-api`.
- Reliability event writes use event IDs for idempotency rather than suppressing distinct events by `(cycle_id, event_type)`.
- Empty catalog cycles now receive a terminal reliability event, terminal cycle status, and heartbeat record. Normal cycles retain existing pricing and PUT behavior.
- Added focused API coverage for strict boolean validation and response path redaction.

## Verification

Focused pytest: 63 passed, 1 deprecation warning. `py_compile` and `git diff --check`: passed with exit code 0. LSP diagnostics could not run because the configured `basedpyright-langserver` is not installed.

## BLOCKED

- Fresh PostgreSQL execution, live daemon behavior, live SSE reconnect/replay, deployment, and 24-hour observation remain blocked because they require infrastructure/runtime evidence not present in the current workspace.
- Full removal of all password-bearing DSN text from historical audit artifacts and documentation was not performed because the request targets runtime fallback configuration and changing audit history would reduce evidentiary integrity.
- The existing cycle implementation still has legacy duplicate helper paths; broad refactoring was avoided to preserve pricing/PUT behavior.
