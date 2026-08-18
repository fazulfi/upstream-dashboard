# W6 Retention and UTC Rollup Report

## Scope and contracts

This change integrates the W6 maintenance contract into the existing daemon and canonical reliability schema without adding a queue, event bus, migration, or deployment behavior.

- Raw `reliability_events`: retain 30 UTC days.
- `reliability_aggregates`: retain 90 UTC days.
- Reliability buckets: hourly through the inclusive 30-day boundary; daily from after 30 days through the inclusive 90-day boundary.
- Rollups use UTC boundaries and `INSERT ... ON CONFLICT DO UPDATE`, so reruns and late events recompute rather than double-count.
- Incomplete cycles are protected from raw-event deletion.
- Existing operational rows (`auto_pricing_ops`, `auto_pricing_api_log`) retain their explicit 30-day policy.
- Existing backup policy is preserved: local 14 days and optional offsite 30 days. W6 live aggregate retention does not imply 90-day backup retention.

## Implemented artifacts

- `scripts/auto_pricing.py`: UTC bucket helpers and bounded reliability cleanup/recompute invoked by existing startup retention maintenance.
- `scripts/tests/test_self_undercut.py`: UTC boundary, day-30/day-31/day-90, and bucket-start tests; existing active PID and failed-heartbeat tests remain intact.
- `docs/OPS-RUNBOOK.md`: recovery distinction between live retention and backups plus an aggregate freshness command.

The implementation uses the canonical tables from `backend/db_schema.py`; it does not add destructive DDL or a second schema owner. Reliability rows are not mixed with operational pricing rows.

## Observability and recovery

Maintenance returns a structured status with deleted row counts and an error type on failure. A non-`ok` result is not a healthy maintenance result and must be surfaced in daemon logs/audit evidence. Pricing continues to use the existing best-effort database behavior; no auto-kill or circuit breaker was introduced.

After restore, run the existing daemon once or restart its service so schema/maintenance runs, then inspect the aggregate freshness query in `docs/OPS-RUNBOOK.md`. Recompute is bounded to 90 days and safe to repeat.

## Verification record

Commands run from `C:\Users\faizz\upstream-dashboard`:

```text
python -B -m unittest scripts.tests.test_self_undercut -v
```

Status: PASS — 52 tests passed in 30.192s.

```text
python -B -m pytest backend/tests/test_db_schema.py backend/tests/test_reliability_api.py -q -p no:warnings
```

Status: BLOCKED/FAIL — `test_daemon_uses_canonical_schema_path` raises `AttributeError: Mock cursor has no __enter__`; two reliability API tests cannot resolve the existing `auth_headers` fixture. These are pre-existing focused-test harness/configuration blockers surfaced by the required command; no tests were removed or suppressed.

```text
python -B -m py_compile scripts/auto_pricing.py backend/db_schema.py backend/app.py
```

Status: PASS — no output, exit code 0.

LSP diagnostics: BLOCKED — configured `basedpyright-langserver` is not installed (`Command not found`). Exact suggested dependency command from the tool: `pip install basedpyright`; it was not installed because dependency changes were not requested.

## Production lock

No production-lock authorization or deployment evidence is changed by this implementation. The decision-log contracts remain authoritative, and the existing production lock remains blocked until its required CI, backup/restore, and signed observation evidence exists.
