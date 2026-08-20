<!-- markdownlint-disable MD013 -->

# Restore Rehearsal Evidence — 2026-08-20

- **Timestamp (UTC)**: 2026-08-20 07:13 UTC
- **Operator**: Sisyphus (orchestrator, owner-authorized FULL execution m1550)
- **Production host**: faiz-prod-01, DB name: upstream

## Backup (fresh)

- File: /home/gamesim/shared-memory/inferhub-business/backups/inferhub-20260820-071333.sql.gz
- Size: 3249047 bytes
- sha256: 6be7003531cd08bdb179c186fbedcca71c73494fd58fd8a61f522bcc5d09e070

## Scratch restore

- DB: upstream_restore_rehearsal (created via su - postgres -c createdb; dropped after)
- Restore: zcat inferhub-20260820-071333.sql.gz | psql -q upstream_restore_rehearsal — exit 0, no errors

## Verification (scratch)

- `reliability_*` tables were not found in any of the three databases (`postgres`, `csa_paper`, or `upstream`) via `psql`.
- Backend `/api/reliability/*` behavior will be proven by live smoke at deploy (T8c); this rehearsal does not claim reliability-table verification.
- The backup contains the operational tables that do exist: `assets` = 68 (A-001..A-070), `auto_pricing_ops` = 61532, `auto_pricing_api_log` = 29681, and `budgets` = 92.

## Parity vs production (read-only)

- Production upstream.assets = 68 → matches scratch restore count

## Cleanup

- upstream_restore_rehearsal dropped (DROP_OK); production DB untouched; services active: wwma-upstream-backend, wwma-auto-pricing

## Owner approval

Owner-approved on 2026-08-20 via question tool: option B, “Rehearsal ke baseline live (68 assets)”. This approves the T6 live-baseline deviation of 68 assets (A-001..A-070) from the plan's 67-asset target (A-001..A-069) and supersedes the C10 verification target.

## Operator signature

Operator: ____ (owner to sign) Date: ____
