# W2 Daemon Reliability Report

## Scope
Implemented lifecycle helpers in `scripts/auto_pricing.py` without changing pricing decision helpers or PUT selection. The canonical schema task is still a dependency: `backend/db_schema.py` remains the authoritative DDL owner, while daemon reliability tables/event persistence are not added here.

## Evidence
- Cycle and event IDs use UUID v4 helpers and heartbeat state carries both identifiers.
- Heartbeat JSON is written only through `_atomic_write`; write exceptions are no longer swallowed, so failed JSON persistence cannot report healthy status.
- PostgreSQL snapshot failure is logged as `persistence_warning` and does not prevent pricing after usable InferHub/JSON paths.
- `orderbook_is_delayed` uses an independent 120-second age threshold; it does not control cycle execution or PUT eligibility.
- PID lock uses exclusive creation, refuses live owners, takes over dead owners, and never sends a termination signal. Cleanup is owner-checked.
- Focused tests cover UUID version, exact delayed threshold, live/dead PID behavior, and failed heartbeat persistence.

## Dependency / limitation
The parallel canonical schema work must provide the shared reliability DDL and idempotent event persistence contract before durable cycle/event records can be wired. This report intentionally does not duplicate schema ownership or add a queue, replay service, circuit breaker, percentage clamp, or auto-kill behavior.

## Verification
Targeted command: `pytest -q scripts/tests/test_self_undercut.py`
Diagnostics: `lsp_diagnostics` requested for `scripts/auto_pricing.py` and `scripts/tests/test_self_undercut.py`.
