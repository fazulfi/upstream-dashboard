# Production Lock

- **Status**: ✅ DEPLOYED (Phase 4 — 2026-08-21)
- **main commit**: 2856baf (Merge PR #19 — Phase 4 Dashboard Control Plane; mutation guard, pricing page, debt cleanup)
- **locked at**: 2026-08-21 01:22 UTC (updated 2026-08-21 post Phase 4 deploy)
- **CI**: green (backend + frontend + Vercel + Preview — PR #19 all checks PASS)
- **Deploy model**: GitHub Actions = CI only (no CD). Frontend Vercel `upstream-static` deploy
  manual via token (lihat OPS-RUNBOOK). Backend VPS manual via SSH + systemd. Tidak ada
  auto-deploy ke production pada main merge.
- **Live bundle**: Phase 4 (Pricing page unified: global per-upstream + overrides + orderbook; LoginGate session-expired; FinanceStatus)
- **Backend**: ops.budgezen.com — MainPID 680666 (2856baf), finance unit = repo scripts/gen_finance.py + EnvironmentFile /home/gamesim/.dashboard.env
- **Evidence**: artifacts/phase4/deploy/evidence-20260821T012238Z.md (current)
  - Backup: inferhub-20260820-210043.sql.gz (14d local; 30d offsite hanya jika status marker `offsite ok`, cek `/home/gamesim/.backup-offsite-status` — saat ini `offsite skipped`)
  - Phase 3: artifacts/phase3/deploy/evidence-20260820T162819Z.md + backup inferhub-20260820-161606.sql.gz sha256 dd3c044f588fb1c97e309e8b1b9296788ddb6a85f0c993cb0d51e54504de7b42
  - Phase 2: artifacts/phase2/deploy/evidence-20260820T090000Z.md + rollback-evidence.md + restore-rehearsal-evidence.md (signed); evidence-20260820T084412Z.md superseded
