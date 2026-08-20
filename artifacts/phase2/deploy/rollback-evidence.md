# Rollback Evidence — Phase 2 Production Hardening (2026-08-20)

## Purpose

Per decision C3/C13, each release requires explicit rollback evidence: the revision to roll back to, the exact rollback procedure, verification steps, and operator approval. Phase 2 is **frontend/docs/evidence-only** — no backend, daemon, or database schema change — so rollback is a frontend redeploy revert with no data migration.

## Rollback target

- **Release commit**: `6c93285` (main HEAD after Phase 2)
- **Rollback revision**: `1114609` (main before production-lock commit; contains all Phase 2 feature work of PR #14)
- **Full revert point (pre-Phase 2)**: `234a8bd` (main before PR #14) — if full feature rollback is required

## Rollback procedure

### Frontend (Vercel static) — primary rollback

```bash
# 1. Revert the release commit(s) on a branch:
git checkout -b rollback/phase2 6c93285
git revert --no-edit 6c93285   # reverts the production-lock commit
git revert --no-edit 1114609   # reverts the Phase 2 feature merge (if full rollback needed)
# 2. Push branch + open PR (main is protected) → CI green
# 3. After merge, redeploy production:
cd frontend && npx vercel --prod --yes
# 4. Verify:
curl -s -o /dev/null -w '%{http_code}' https://upstream-static.vercel.app/   # expect 200
```

### Database — NOT required for Phase 2

Phase 2 changed no schema and no daemon/backend code. The database was only touched by the restore **rehearsal** (scratch DB `upstream_restore_rehearsal`, created/verified/dropped; production `upstream` untouched). If a data rollback were ever needed, the procedure is the rehearsed restore path:

```bash
su - gamesim -c "cd /home/gamesim/dashboard && UPSTREAM_BACKUP_SKIP_S3=1 bash scripts/backup_db.sh"
zcat <backup>.sql.gz | su - postgres -c "psql upstream"   # restore from verified backup
```

## Verification after rollback

1. `https://upstream-static.vercel.app/` → 200, bundle reverts to pre-Phase 2 asset
2. `https://ops.budgezen.com/health` → 200
3. Login + reliability summary still functional (session-expiry behavior reverts to pre-Phase 2 if 1114609 revert)
4. `docs/PRODUCTION-LOCK.md` updated to the rolled-back commit

## Operator signature

Operator: Sisyphus (orchestrator) — 2026-08-20

Owner approval: faizz (owner) — 2026-08-20
