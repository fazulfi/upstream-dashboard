# Phase 1 24-Hour Observation Report Template

**Status:** UNSIGNED / BLOCKED. No observation window has started.
**Rule:** A prior 10-cycle soak, an end-of-window screenshot, or 24 elapsed wall-clock hours without complete telemetry cannot pass this gate.

## Gate prerequisites

Observation may start only after the exact source SHA has a green CI run, approved PR, explicit manual deployment approval, completed backup and rollback evidence, successful VPS and Vercel smoke checks, one backend identity, one daemon identity, and a signed UTC start record.

- Reviewed/deployed source SHA: `[SHA]`
- CI URL/run: `[URL/run ID]`
- PR URL and approval: `[URL/reviewer/UTC]`
- Manual deployment approval: `[approver/UTC]`
- Backup and rollback evidence ID: `[ID/path]`
- VPS target: `faiz-prod` / `82.25.62.204`
- Vercel target: `upstream-static` / `https://upstream-static.vercel.app`
- Observation operator: `[name]`
- Independent reviewer: `[name]`
- Start time, UTC: `[YYYY-MM-DD HH:MM:SSZ]`
- Planned end time, UTC: `[YYYY-MM-DD HH:MM:SSZ]`
- Expected cycle interval: `[seconds]`
- Expected cycles: `[floor(window seconds / interval)]`
- Approved maintenance intervals: `[none or exact UTC intervals and approval]`

**Start decision:** **UNSIGNED / BLOCKED** until all prerequisite fields are complete and signed.

## Numerical pass/fail thresholds

The thresholds below are the minimum Phase 1 gate. Any stricter contract must be recorded before the window starts.

| Measure | Required threshold | Result |
|---|---:|---|
| Continuous observation coverage | 24 hours, no unexplained gap | `[PASS/FAIL/UNKNOWN]` |
| Heartbeat gap | No gap `>= 120 seconds` outside an approved maintenance interval | `[max seconds/result]` |
| Expected versus completed cycles | Complete accounting, no unexplained deficit | `[expected/completed/result]` |
| JSON heartbeat/state freshness | Within the contracted cycle interval, success verified after flush, fsync, and replace | `[max age/result]` |
| DB freshness | Newest timestamp for every required table within the contracted cycle interval | `[table ages/result]` |
| Duplicate backend identities | Exactly 1 authoritative backend service | `[count/result]` |
| Duplicate daemon identities | Exactly 1 daemon process | `[count/result]` |
| Unclassified errors | 0 | `[count/result]` |
| Missing or unknown telemetry | 0 | `[count/result]` |
| All-model accounting | Every expected model accounted for each completed cycle | `[result]` |
| SSE/auth recovery | Successful authenticated reconnect and REST cursor recovery evidence | `[attempts/result]` |
| ARM/DISARM audit | Every transition has operator, UTC time, old/new state, source, result, event ID | `[sample/result]` |

Delayed orderbook/reference data is a separate warning from downtime. At age `>= 120 seconds`, record the affected model as delayed and stale. Do not turn delayed data into a heartbeat gap, and do not block a PUT solely because of delay. Any change to this pricing decision requires a new explicit approved decision.

## Scheduled observation samples

Record each sample in UTC. Do not infer zero from a missing row. Add rows at the agreed cadence, and retain raw command output or an immutable evidence reference.

| Sample UTC | Expected cycle range | Completed cycles | Latest heartbeat UTC | Gap seconds | JSON age | DB newest timestamps by table | Delayed count | Error count | Duplicate backend/daemon | SSE reconnect/REST recovery | Operator initials |
|---|---:|---:|---|---:|---:|---|---:|---:|---|---|---|
| `[timestamp]` | `[from-to]` | `[count]` | `[timestamp]` | `[seconds]` | `[seconds]` | `[ops/state/api_log/reliability tables]` | `[count]` | `[count]` | `[0/1 counts]` | `[result]` | `[initials]` |
| `[timestamp]` | `[from-to]` | `[count]` | `[timestamp]` | `[seconds]` | `[seconds]` | `[timestamps]` | `[count]` | `[count]` | `[counts]` | `[result]` | `[initials]` |

## Required recovery and control evidence

- Authenticated REST request: `[UTC, endpoint, status, cursor/result]`
- Authenticated SSE connection: `[UTC, transport, status, event IDs/cycle IDs]`
- Reconnect trigger and bounded backoff: `[UTC, cause, duration]`
- REST cursor recovery after reconnect: `[UTC, result, duplicate/out-of-order handling]`
- ARM/DISARM audit sample: `[event ID, operator, old/new state, source, result, UTC]`
- Planned maintenance: `[approval, start/end UTC, expected exclusion]`
- Incident or threshold breach: `[ID, UTC, classification, action, rollback decision]`

## Abort and restart rules

Fail immediately and restart the full 24-hour window after corrective change when any of these occurs:

- any missing, corrupted, unknown, or unexplained telemetry interval;
- heartbeat gap at or above 120 seconds outside approved maintenance;
- JSON or required DB freshness exceeds its contract;
- expected and completed cycles or all-model accounting cannot be reconciled;
- duplicate backend or daemon identity;
- unclassified error, failed persistence represented as healthy, or unsafe state;
- authenticated SSE, reconnect, expiry handling, or REST cursor recovery fails;
- ARM/DISARM state and audit record disagree;
- rollback or incident evidence is missing;
- source hash, target identity, or operator identity is unknown.

A delayed-data warning alone is recorded and classified separately. It does not automatically restart the window unless it causes a defined threshold breach or an approved safety decision says otherwise.

## Final calculation and signatures

- Window end, UTC: `[timestamp]`
- Actual covered duration: `[duration]`
- Expected cycles: `[count]`
- Completed cycles: `[count]`
- Maximum heartbeat gap: `[seconds]`
- Maximum JSON age: `[seconds]`
- Maximum DB age by table: `[table/seconds]`
- Total delayed warnings: `[count]`
- Total errors: `[count/classified list]`
- Duplicate count: `[backend/daemon]`
- Missing telemetry intervals: `[count/list]`
- SSE/recovery result: `[PASS/FAIL]`
- Overall observation result: **UNSIGNED / BLOCKED**
- Production completion decision: **NOT AUTHORIZED**
- Operator signature and UTC: `[blank]`
- Independent reviewer signature and UTC: `[blank]`

Missing evidence is a failure, not a zero. This report cannot authorize release, deployment, ARM, or production completion.
