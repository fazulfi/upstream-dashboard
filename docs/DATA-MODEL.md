# Data Model

PostgreSQL database `wuthering_waves_multi_agent`, schema `memory` (search_path=`memory`). Backend + daemon + finance all use this schema.

## Reliability tables

### `reliability_cycles`
One row per daemon cycle. Correlates all events in a cycle.
| column | type | notes |
|--------|------|-------|
| cycle_id | uuid (PK) | UUID v4, unique per cycle |
| started_at | timestamptz | cycle start |
| finished_at | timestamptz | cycle end |
| duration_ms | int | elapsed |
| model_count | int | models processed |
| undercut_count | int | price undercuts |
| resume_count | int | resume pricing |
| hold_count | int | HOLD decisions |
| error_count | int | technical errors |
| status | text | e.g. completed |

### `reliability_events`
One row per event. Dedup by `event_id`.
| column | type | notes |
|--------|------|-------|
| event_id | uuid (PK) | UUID v4, dedup key |
| cycle_id | uuid (FK) | → reliability_cycles |
| severity | text | info/warning/error/critical |
| event_type | text | cycle_started/completed, model_decision, api_request, put_attempt, put_result, delayed_orderbook, technical_error, persistence_failure, duplicate_daemon, service_restart, arm, disarm, maintenance_*, incident_*, recovery |
| timestamp | timestamptz | |
| provider | text | provider slug |
| model_id | text | model slug |
| operator | text | actor |
| source | text | release hash |
| status | text | |
| reason / payload | jsonb | details |
| resolved_at | timestamptz | |

**Retention**: raw events kept 30 days.

### `reliability_aggregates`
Rollups for trends.
| column | type | notes |
|--------|------|-------|
| bucket | timestamptz | hour or day |
| granularity | text | hourly / daily |
| cycle_count, model_count, undercut_count, hold_count, error_count | int | sums |
| db_freshness | timestamptz | |

**Retention**: 90 days total — hourly for latest 30 days, daily for days 31–90.

## Finance tables

### `assets`
| column | type | notes |
|--------|------|-------|
| id | text (PK) | e.g. A-061 |
| upstream | text | provider |
| qty | int | keys/licenses |
| cost_per | numeric | unit cost |
| curr | text | IDR/USD |
| buy | date | purchase date |
| lifespan_d | int | days |
| status | text | active/retired |
| label | text | |
| kurs_idr_usd | numeric | fx at record |
| created_by/at, retired_by/at | | audit |

Current state: **60 assets** (55 active, 5 retired). e.g. A-061 CodeBuddy CN (32 × 13,125 IDR, active), A-062 CodeBuddy global (160 × 2,500 IDR, active).

### `impairments`
id, upstream, qty, loss, label, date, synced_at. **25 rows.**

### `refunds`
id, upstream, qty, amount_idr, amount_usdc, label, date. **1 row.**

### `payouts`
id, date, amount_usdc, status, destination, network, signature. **18 rows.**

### `ledger_meta`
key/value store (sync versioning, etc.).

## Auto-pricing tables

Existing `auto_pricing_*` tables from the pricing contract are reused (not duplicated). Daemon persists decisions into reliability tables + the pricing state.

## Notes

- Finance single source of truth = **DB** (`memory.assets` etc). `ledger.json` is a synced mirror (DB → file). Never let a DB→file sync run on an empty DB (would clobber file) — migrate/backfill first.
- All timestamps UTC (`timestamptz`).
