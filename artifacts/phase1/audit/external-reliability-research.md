# External Reliability Research — Phase 1 Audit

**Date:** 2026-08-18
**Scope:** PostgreSQL idempotent schema migrations, retention jobs, UUID event deduplication, and Python PID-lock behavior.
**Repository status:** Read-only audit; no source, database, service, deployment, or production changes.

## Executive guidance

Phase 1 should remain a small extension of the existing daemon persistence tail. Use one canonical, additive schema owner; make database uniqueness the event-deduplication boundary; run retention in bounded, observable maintenance work; and treat PID files as an admission guard, not a process-control mechanism. A stale PID may be removed only after a platform-appropriate non-destructive liveness check. **No automatic SIGTERM/SIGKILL is recommended.**

This is applicable to the repository’s current blockers: `backend/db_schema.py` is the shared schema path while `scripts/auto_pricing.py` duplicates REV13 DDL; reliability tables are absent; raw cleanup is 30 days with no aggregates; and the daemon has no PID lock. Existing Phase 1 decisions require UUID v4 cycle/event IDs, 30-day raw events, 90-day aggregates, a simple PID lock, and no automatic process killing.

## 1. Idempotent PostgreSQL schema migrations

### Official evidence

- **Alembic Context7 library:** `/websites/alembic_sqlalchemy`.
  - [Alembic cookbook — PostgreSQL transactional DDL output](https://alembic.sqlalchemy.org/en/latest/cookbook.html): PostgreSQL migration output explicitly shows `BEGIN`, DDL, version-table update, and `COMMIT`; the log says `Will assume transactional DDL`.
  - [Alembic runtime API — `begin_transaction()`](https://alembic.sqlalchemy.org/en/latest/api/runtime.html#alembic.runtime.migration.MigrationContext.begin_transaction): migration operations are enclosed in a transaction context in online mode.
  - [Alembic runtime API — `autocommit_block()`](https://alembic.sqlalchemy.org/en/latest/api/runtime.html#alembic.runtime.migration.MigrationContext.autocommit_block): PostgreSQL operations that cannot run transactionally must explicitly use an autocommit block, which commits the preceding transaction.
  - [Alembic operations — `create_index(if_not_exists=...)`](https://alembic.sqlalchemy.org/en/latest/ops.html#alembic.operations.Operations.create_index): supports `if_not_exists` for repeat-safe additive index creation.

- **PostgreSQL Context7 library:** `/websites/postgresql_current`.
  - [PostgreSQL DDL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html): primary keys are `UNIQUE NOT NULL` identifiers and automatically create a unique B-tree index.

### Mature OSS evidence

- [Onyx Alembic migration, lines 177–190](https://github.com/onyx-dot-app/onyx/blob/main/backend/alembic/versions/505c488f6662_merge_default_assistants_into_unified.py#L177-L190): seed writes use `INSERT ... ON CONFLICT DO NOTHING`, making retries after partial execution database-idempotent.
- [Stefan Jansen registry, lines 21–40](https://github.com/stefan-jansen/machine-learning-for-trading/blob/main/case_studies/utils/registry/store.py#L21-L40): bootstrap uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
- [django-pg-zero-downtime-migrations](https://github.com/tbicr/django-pg-zero-downtime-migrations/): documents lock/statement timeouts, small migration units, and idempotent SQL as a recovery aid; it also warns that non-transactional migration modes require manual repair after interruption.

### Applicability to this repository

**Applicable with qualification.** Make `backend/db_schema.py` the sole owner (or generate one shared definition) and have daemon startup converge on it; do not maintain duplicate REV13 DDL. Add reliability tables/indexes additively and record schema version/order. Prefer one transaction per migration. Do not use `IF NOT EXISTS` as a substitute for migration versioning: it can hide an object with the wrong definition. For non-transactional PostgreSQL operations, isolate and document the boundary, lock timeout, retry/manual-repair procedure, and rollback state. No destructive migration is justified by this audit.

## 2. Retention jobs

### Official evidence

- **PostgreSQL Context7 library:** `/websites/postgresql_current`.
  - [Explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html): transaction-level advisory locks are released automatically at transaction end; session-level locks persist until release/session end. This supports a short transaction-level maintenance guard if needed.
  - [PostgreSQL transaction isolation / locking documentation](https://www.postgresql.org/docs/current/mvcc.html): PostgreSQL’s MVCC means deletes create dead tuples that require vacuum/autovacuum; retention must include bloat/vacuum observation.

### Mature OSS evidence

- [pqrun cleanup example](https://github.com/changhyeon363/pqrun/blob/main/examples/cleanup.sql): deletes only terminal statuses (`DONE`, `FAILED`, `CANCELLED`) where `finished_at < now() - interval '7 days'`.
- [PgRelay retention settings](https://github.com/balyakin/pgrelay/blob/main/README.md): separates `PGRELAY_RETENTION_SUCCEEDED_DAYS` and `PGRELAY_RETENTION_DEAD_LETTER_DAYS`.
- [PgRelay production guidance](https://github.com/balyakin/pgrelay/blob/main/docs/production.md): treats retention, purge behavior, vacuum, polling cost, and production limits as one operational concern.

### Applicability to this repository

**Applicable.** Phase 1’s raw reliability events should be deleted only by an explicit UTC cutoff and bounded batches; never delete active/incomplete cycles or data needed for recovery. Keep raw events for 30 days and aggregates for 90 days, with the required hourly-recent/daily-historical bucket policy. Make rollup and cleanup rerunnable: deterministic bucket keys plus an upsert/replace strategy, and a maintenance lock so two instances do not race. Record start/end, cutoff, rows affected, errors, and last-success time. Separate raw-event retention from backup retention; the current 14-day local/30-day remote backup policy does not provide 90-day aggregate recoverability. If a PostgreSQL advisory lock is used, prefer `pg_try_advisory_xact_lock` in a short transaction; do not introduce a queue, worker subsystem, or circuit breaker.

## 3. UUID event deduplication

### Official evidence

- **PostgreSQL Context7 library:** `/websites/postgresql_current`.
  - [DDL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html): a primary key/unique constraint is the database-enforced uniqueness boundary and is concurrency-safe.
  - [Explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html): transaction-level locks follow transaction semantics and release automatically on commit/rollback.

### Mature OSS evidence

- [Memori PostgreSQL driver, lines 70–82](https://github.com/MemoriLabs/Memori/blob/main/memori/storage/drivers/postgresql/_driver.py#L70-L82): inserts UUID/session records with `ON CONFLICT DO NOTHING`.
- [Hindsight importer, lines 331–375](https://github.com/vectorize-io/hindsight/blob/main/hindsight-api-slim/hindsight_api/engine/transfer/importer.py#L331-L375): explicitly documents that `ON CONFLICT DO NOTHING` makes a partially completed import safe to rerun.
- [PgRelay README](https://github.com/balyakin/pgrelay/blob/main/README.md): states the system is not exactly-once and that external side effects need a stable receiver-side idempotency key.
- [Deterministic job pipeline README](https://github.com/imgeaslikok/deterministic-job-pipeline/blob/main/README.md): uses `UNIQUE(idempotency_key) WHERE NOT NULL` and `UNIQUE(job_id, attempt_no)` as concurrency backstops.

### Applicability to this repository

**Directly applicable.** Generate one opaque UUID v4 `cycle_id` per cycle and a separate UUID v4 `event_id` for every durable reliability event. Put a `PRIMARY KEY` or `UNIQUE(event_id)` on `reliability_events`; insert with `ON CONFLICT (event_id) DO NOTHING` (or equivalent), and treat duplicate insertion as successful replay/no-op. Thread IDs through cycle, model, API, PUT, warning, and terminal records. Do not use timestamps, model strings, or random replacement IDs as event identity. A unique event row prevents duplicate durable records, but cannot make an external PUT exactly once; external effects must retain their own stable idempotency semantics where supported. Finance identifiers remain governed by existing stable upstream IDs and must not be replaced with random UUIDs.

Transaction boundary: group one event insert (or a bounded event batch) with its required state transition where atomicity is required; commit before reporting durable success. If a batch partially fails, retry the same event UUIDs, not newly generated IDs, and expose a persistence warning separately from cycle/pricing health.

## 4. Python PID locks and stale PID behavior

### Official evidence

- **Python Context7 library:** `/python/cpython`.
  - [`os.kill(pid, sig)`](https://github.com/python/cpython/blob/main/Doc/library/os.rst#os.kill): sends a signal to a process; it is not documented by Python as a universally harmless PID probe.
  - [`fcntl.flock`](https://github.com/python/cpython/blob/main/Doc/library/fcntl.rst#fcntl.flock) and [`fcntl.lockf`](https://github.com/python/cpython/blob/main/Doc/library/fcntl.rst#fcntl.lockf): OS file-descriptor locking APIs; nonblocking acquisition raises `OSError` when unavailable.
  - [Python signal documentation](https://docs.python.org/3/library/signal.html): the documented signal-0 no-signal liveness check is for `signal.pthread_kill` and Unix; do not assume `os.kill(pid, 0)` is a cross-platform no-op.

### Mature OSS evidence

- [Celery `platforms.py`](https://github.com/celery/celery/blob/main/celery/platforms.py): `create_pidlock()` refuses a lock when the referenced process is alive, removes malformed/dead PID files, writes/fsyncs the PID, and registers cleanup. Its stale check handles `ESRCH`/`EPERM`; the source also explicitly avoids killing in a Kubernetes PID-1 case.
- [Celery PR #4704](https://github.com/celery/celery/pull/4704): avoids creating temporary lockfiles before daemon detachment because that introduced races with external monitors.
- [Inspect AI process utility](https://github.com/UKGovernmentBEIS/inspect_ai/blob/main/src/inspect_ai/_util/process.py#L9-L28): uses `psutil.pid_exists()` on Windows and `os.kill(pid, 0)` only on POSIX.
- [Hermes Agent PID check](https://github.com/NousResearch/hermes-agent/blob/main/gateway/status.py#L736-L755): documents that Windows `os.kill(pid, 0)` is not a no-op and provides a non-destructive cross-platform liveness check.
- [TrendRadar guarded process stop](https://github.com/sansan0/TrendRadar/blob/master/docker/manage.py#L461-L473): refuses termination when PID identity does not match the expected process, illustrating PID reuse risk.

### Applicability to this repository

**Directly applicable, with platform caution.** The repository runs a systemd user daemon with `Restart=always`; add a simple lock acquired before DB setup/loop. Prefer an OS-level exclusive lock held for the process lifetime, with a PID file only for diagnostics. If a PID file is retained, write PID atomically and fsync it; on startup:

```text
no lock → acquire
live PID / lock held → refuse second daemon
PID absent → report stale, remove/reacquire
PID present but identity uncertain/reused → refuse takeover and require operator review
```

On POSIX, `os.kill(pid, 0)` may be used only as a non-destructive probe with careful `EPERM` interpretation; on Windows use a platform-safe process API such as `psutil.pid_exists()`. A PID number alone is not identity. **Never auto-kill any process.** Do not escalate to SIGTERM/SIGKILL, and do not interpret an ambiguous permission error as proof that the PID is dead. Cleanup must be ownership-safe: only the process that owns the lock may remove it. Document stop-before-manual-recovery because systemd’s automatic restart can race stale-lock recovery.

## Phase 1 decision matrix

| Topic | Safe recommendation | Status for repository |
|---|---|---|
| Schema | Canonical shared owner; additive/versioned migration; transactional by default; explicit exceptions for non-transactional DDL | Required blocker resolution; no implementation yet |
| Retention | UTC cutoffs, bounded/rerunnable rollup and deletion, active-record protection, maintenance evidence, vacuum awareness | Required design detail; raw 30-day exists, aggregates absent |
| UUID dedup | UUID v4 `cycle_id` + UUID v4 `event_id`; database unique constraint; same-ID retries with `ON CONFLICT DO NOTHING`; no exactly-once claim for external effects | Direct Phase 1 requirement; currently absent |
| PID lock | Exclusive lock, platform-correct liveness check, stale record cleanup only when dead, ownership-safe release, no auto-kill | Direct Phase 1 requirement; currently absent |

## Evidence and applicability limits

- Context7 libraries used: `/websites/alembic_sqlalchemy`, `/websites/postgresql_current`, `/python/cpython`.
- Official references provide semantics, not a repository-specific migration or retention implementation. OSS examples are patterns, not substitutes for tests and production approval.
- No secrets or production credentials were accessed or included.
- This research does **not** recommend adding a queue, circuit breaker, event bus, replay worker, or other subsystem outside the Phase 1 minimal design.

## Repository references reviewed

- [`architecture-gate-report.md`](./architecture-gate-report.md), especially B2/B3/B6/B7 and lines 45–83, 119–129.
- [`backend-surface-report.md`](./backend-surface-report.md), especially lines 47–70, 105–127, and 142–168.
- [`2026-08-17-post-mvp-phase-1-reliability.md`](../../docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability.md), confirmed decisions and production-freeze lines 19–29, 75–101, 120–126.

**Applicability status:** Research complete; implementation remains blocked until the architecture gate resolves canonical migration ownership, precise retention/rollup semantics, heartbeat transaction boundaries, and PID/systemd takeover policy.
