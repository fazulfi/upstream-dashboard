# Persistence Verification: Retry

## Scope

Focused verification of durable reliability persistence in the current working tree. No deployment, queue/event bus, circuit breaker, auto-kill, or production-readiness claim was made.

## Source evidence

- `scripts/auto_pricing.py` generates UUIDv4 cycle and event IDs via `new_cycle_id()` and `new_event_id()`.
- Added persistence helpers insert `reliability_cycles` and `reliability_events`, use `ON CONFLICT DO NOTHING` for idempotent cycle/event retries, and update the terminal cycle record with `completed_at`, status, and summary.
- Cycle start and terminal completion are best-effort. Database failures are converted to a warning and do not block pricing or local JSON state persistence.
- Empty catalog now records an event and terminal cycle status before returning.
- `backend/db_schema.py` is the canonical additive schema owner and provides a monotonic `reliability_events.cursor` sequence.
- `backend/app.py` reliability event pagination/stream queries use the monotonic cursor and `ORDER BY cursor ASC`, avoiding UUIDv4 chronology ordering.

## Verification

Status: PARTIAL / BLOCKED.

- `python -m py_compile scripts/auto_pricing.py backend/app.py backend/db_schema.py`: PASS (no output).
- `pytest -q scripts/tests/test_self_undercut.py backend/tests/test_db_schema.py backend/tests/test_reliability_api.py`: BLOCKED during collection because `flask` is not installed (`ModuleNotFoundError: No module named 'flask'`).
- LSP diagnostics: BLOCKED because `basedpyright-langserver` is not installed.

Required focused commands:

```text
python -m py_compile scripts/auto_pricing.py backend/app.py backend/db_schema.py
pytest -q scripts/tests/test_self_undercut.py backend/tests/test_db_schema.py backend/tests/test_reliability_api.py
```

Any missing dependency or test failure must remain explicitly reported as BLOCKED; this artifact does not imply production readiness.
