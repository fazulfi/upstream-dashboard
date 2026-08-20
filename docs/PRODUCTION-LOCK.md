# Production Lock

- **Status**: APPROVED & DEPLOYED (owner-approved 2026-08-20)
- **main commit**: 6c93285 (Merge PR #15 — production lock + signed
  evidence; contains PR #14 Phase 2 hardening)
- **locked at**: 2026-08-20 08:44 UTC (updated 2026-08-20 post-audit)
- **CI**: green (backend + frontend + Vercel + Preview)
- **Deploy model**: GitHub Actions = CI only (no CD). Frontend Vercel `upstream-static` deploy
  manual via token (lihat OPS-RUNBOOK). Backend VPS manual via SSH + systemd. Tidak ada
  auto-deploy ke production pada main merge.
- **Live bundle**: index-B2Q6irLZ.js (contains session-expired)
- **Evidence**: artifacts/phase2/deploy/evidence-20260820T090000Z.md (signed, current)
  - rollback-evidence.md + restore-rehearsal-evidence.md (signed, 68-asset
    owner-approved baseline); evidence-20260820T084412Z.md superseded
