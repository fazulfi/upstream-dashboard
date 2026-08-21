# Production Lock

- **Status**: ✅ DEPLOYED (Phase 5 — 2026-08-21, auto-pricing scope per upstream: commandcode + opencode-go bergabung scope default = persis 5 upstream, toggle per-provider di Auto Pricing; incl. hotfix #32 seed 11 upstream)
- **main commit**: 1724bc1 (PR #31 per-upstream scope control Phase 5 + PR #32 seed all 11 upstreams fix; baseline 761b744)
- **locked at**: 2026-08-21 11:40 UTC (deployed 11:31 backend + 11:39 hotfix + 11:40 frontend; K-012 verified)
- **CI**: green (backend + frontend + Vercel + Preview — PRs #31 #32 all checks PASS)
- **Deploy model**: GitHub Actions = CI only (no CD). Frontend Vercel `upstream-static` deploy
  manual via token (lihat OPS-RUNBOOK). Backend VPS manual via SSH + systemd. Tidak ada
  auto-deploy ke production pada main merge.
- **Live bundle**: index-DlfRHEhf.js (routes: / Reliability, /auto-pricing AutoPricing arm/disarm + Trigger global · per provider + toggle scope per upstream, /pricing unified PricingPage global+orderbook+set manual ask, /settings; Idempotency-Key auto-attach; /asks removed; served from project `upstream-static`)
- **Backend**: ops.budgezen.com — backend restarted 11:39 UTC (schema migrasi: `auto_pricing_enabled` column + seed 11 upstream; scope persis 5 TRUE: codebuddy, cline-pass, codebuddy-cn, commandcode, opencode-go; 6 non-scope FALSE: claude-code, codex, qwencloud-alibaba, siliconflow, xiaomi-mimo, z-ai); daemon PID 1796603 restart 11:31 (60s interval, ARM=1)
- **Evidence**: K-012 verified 2026-08-21 11:40 UTC — daemon cycle 71 model (35 undercut, 36 hold, 0 error); auto_pricing_ops 5-min: commandcode 15 ops, opencode-go 19 ops, codebuddy 45, cline-pass 13, codebuddy-cn 9; 6 non-scope 0 ops
  - Backup: inferhub-20260821-113012.dump (pre-deploy Phase 5, /home/gamesim/shared-memory/inferhub-business/backups/)
  - Phase 4: artifacts/phase4/deploy/evidence-20260821T012238Z.md + evidence-20260821T030109Z.md (current prior)
  - Phase 3: artifacts/phase3/deploy/evidence-20260820T162819Z.md + backup inferhub-20260820-161606.sql.gz sha256 dd3c044f588fb1c97e309e8b1b9296788ddb6a85f0c993cb0d51e54504de7b42
  - Phase 2: artifacts/phase2/deploy/evidence-20260820T090000Z.md + rollback-evidence.md + restore-rehearsal-evidence.md (signed); evidence-20260820T084412Z.md superseded
