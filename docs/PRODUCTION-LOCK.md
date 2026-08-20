# Production Lock

- **Status**: ✅ DEPLOYED (Phase 3 — 2026-08-20)
- **main commit**: 619d853 (Merge PR #17 — Phase 3 Finance & Profitability; contains PR #14/#15/#16 Phase 2 + Phase 3 rule engine/audit/page cleanup)
- **locked at**: 2026-08-20 16:28 UTC (updated 2026-08-20 post Phase 3 deploy)
- **CI**: green (backend + frontend + Vercel + Preview — PR #17 all checks PASS)
- **Deploy model**: GitHub Actions = CI only (no CD). Frontend Vercel `upstream-static` deploy
  manual via token (lihat OPS-RUNBOOK). Backend VPS manual via SSH + systemd. Tidak ada
  auto-deploy ke production pada main merge.
- **Live bundle**: index-CbDxkYac.js (Phase 3 — 5 routes: Reliability, Ask Price, Auto-Pricing, Settings; contains FinanceStatus badge + session-expired)
- **Backend**: ops.budgezen.com — MainPID 301370 (619d853), finance unit = repo scripts/gen_finance.py + EnvironmentFile /home/gamesim/.dashboard.env
- **Evidence**: artifacts/phase3/deploy/evidence-20260820T162819Z.md (signed, current)
  - Backup: inferhub-20260820-161606.sql.gz sha256 dd3c044f588fb1c97e309e8b1b9296788ddb6a85f0c993cb0d51e54504de7b42 (14d local; 30d offsite hanya jika status marker `offsite ok`, cek `/home/gamesim/.backup-offsite-status`)
  - Phase 2: artifacts/phase2/deploy/evidence-20260820T090000Z.md + rollback-evidence.md + restore-rehearsal-evidence.md (signed); evidence-20260820T084412Z.md superseded
