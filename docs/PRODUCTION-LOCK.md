# Production Lock

- **Status**: ✅ DEPLOYED (Phase 4 — 2026-08-21, incl. recon fix #21 + pricing page gaps #23 + idempotency auto-attach #25 + Auto Pricing page restore #27)
- **main commit**: 39d129d (PR #19 Control Plane + #20 evidence + #21 seed classifier + #23 pricing page gaps + #24 gap evidence + #25 idempotency auto-attach + #26 evidence + #27 Auto Pricing restore)
- **locked at**: 2026-08-21 03:45 UTC (updated 2026-08-21 post PR #27 — Auto Pricing page restored)
- **CI**: green (backend + frontend + Vercel + Preview — PRs #19-#27 all checks PASS)
- **Deploy model**: GitHub Actions = CI only (no CD). Frontend Vercel `upstream-static` deploy
  manual via token (lihat OPS-RUNBOOK). Backend VPS manual via SSH + systemd. Tidak ada
  auto-deploy ke production pada main merge.
- **Live bundle**: index-BGJqi0ez.js (routes: / Reliability, /auto-pricing AutoPricing arm/disarm, /pricing unified PricingPage global+orderbook+set manual ask, /settings; Idempotency-Key auto-attach; /asks removed; served from project `upstream-static`)
- **Backend**: ops.budgezen.com — MainPID 1128285 (ac3baf2), finance unit = repo scripts/gen_finance.py + EnvironmentFile /home/gamesim/.dashboard.env; recon PASS (unexplained=0, seed 192 classified); login → role admin (server-side, ignores client role); global_trigger_pct column live
- **Evidence**: artifacts/phase4/deploy/evidence-20260821T012238Z.md + evidence-20260821T030109Z.md (gap-fix #23 + idempotency #25 + Vercel upstream-static resolution) (current)
  - Backup: inferhub-20260820-210043.sql.gz (14d local; 30d offsite hanya jika status marker `offsite ok`, cek `/home/gamesim/.backup-offsite-status` — saat ini `offsite skipped`)
  - Phase 3: artifacts/phase3/deploy/evidence-20260820T162819Z.md + backup inferhub-20260820-161606.sql.gz sha256 dd3c044f588fb1c97e309e8b1b9296788ddb6a85f0c993cb0d51e54504de7b42
  - Phase 2: artifacts/phase2/deploy/evidence-20260820T090000Z.md + rollback-evidence.md + restore-rehearsal-evidence.md (signed); evidence-20260820T084412Z.md superseded
