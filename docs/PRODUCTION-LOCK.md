# Production Lock

- **Status**: ✅ DEPLOYED (Phase 4 — 2026-08-21, incl. recon fix #21 + pricing page gaps #23 + idempotency auto-attach #25)
- **main commit**: ac3baf2 (PR #19 Control Plane + #20 evidence + #21 seed classifier + #23 pricing page gaps + #24 gap evidence + #25 idempotency auto-attach)
- **locked at**: 2026-08-21 03:30 UTC (updated 2026-08-21 post PR #25 + Vercel upstream-static resolution)
- **CI**: green (backend + frontend + Vercel + Preview — PRs #19-#25 all checks PASS)
- **Deploy model**: GitHub Actions = CI only (no CD). Frontend Vercel `upstream-static` deploy
  manual via token (lihat OPS-RUNBOOK). Backend VPS manual via SSH + systemd. Tidak ada
  auto-deploy ke production pada main merge.
- **Live bundle**: index-ClbEur01.js (Phase 4 unified Pricing page + Idempotency-Key auto-attach; /asks page REMOVED; served from project `upstream-static` — verified correct project)
- **Backend**: ops.budgezen.com — MainPID 1128285 (ac3baf2), finance unit = repo scripts/gen_finance.py + EnvironmentFile /home/gamesim/.dashboard.env; recon PASS (unexplained=0, seed 192 classified); login → role admin (server-side, ignores client role); global_trigger_pct column live
- **Evidence**: artifacts/phase4/deploy/evidence-20260821T012238Z.md + evidence-20260821T030109Z.md (gap-fix #23 + idempotency #25 + Vercel upstream-static resolution) (current)
  - Backup: inferhub-20260820-210043.sql.gz (14d local; 30d offsite hanya jika status marker `offsite ok`, cek `/home/gamesim/.backup-offsite-status` — saat ini `offsite skipped`)
  - Phase 3: artifacts/phase3/deploy/evidence-20260820T162819Z.md + backup inferhub-20260820-161606.sql.gz sha256 dd3c044f588fb1c97e309e8b1b9296788ddb6a85f0c993cb0d51e54504de7b42
  - Phase 2: artifacts/phase2/deploy/evidence-20260820T090000Z.md + rollback-evidence.md + restore-rehearsal-evidence.md (signed); evidence-20260820T084412Z.md superseded
