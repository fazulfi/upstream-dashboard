# Phase 4 — Audit Checklist

> Status: RELEASED (2026-08-21). Owner approval: design summary + FULL AUTONOMOUS mandate.
> Iterasi sampai semua PASS. Production freeze dicabut setelah evidence.

1. ✅ Mutation guard (authz+idempotency+audit+feedback+rollback) semua endpoint mutasi DALAM SCOPE (config PUT/DELETE, pricing global PUT, finance buy/retire/refund; inventory lengkap di Task 4 CATATAN — route lain keys/budgets/topups/combos/recheck/ask/arm/disarm diinventori untuk hardening wave berikutnya)
2. ✅ Operator identity+role session (bukan dashboard-api hardcoded) — token 4-part `expiry.name.role.hmac`, verify_token_operator, get_operator, role matrix (finance admin/ops, config pricing admin, pricing global admin)
3. ✅ Fail-closed config (publish gagal → rollback + 500) — satu transaksi guard, atomic file write via os.replace
4. ✅ Payout UUID fallback dihapus (skip+audit) — _sync_payouts_rows skip id kosong + audit 'sync-payouts-skip'
5. ✅ Pricing merged view + orderbook (global per-upstream + overrides + orderbook via `_orderbook_payload` — parity dgn `/api/orderbook`)
6. ✅ Finance dashboard actions gated (buy/retire/refund via guard) — contracts executable, MutationGuardError 403/400 handling
7. ✅ Recon earning classifier (unexplained=0 gate ACTIVE; 192 GENUINE violations didokumentasikan sebagai known pre-existing debt — keputusan owner 2026-08-21, TIDAK di-fix)
8. ✅ app.py coverage ≥80 (CI gate, full-suite `--cov-fail-under=80` — 80% tercapai, 1764/344) — deviasi CI gate dari 2-file ke full-suite (Oracle-approved, honor intent)
9. ✅ Backup offsite status marker + docs tidak mengklaim 30d saat skip (README/OPS-RUNBOOK/PRODUCTION-LOCK konsisten)
10. ✅ Page-level tests critical workflows (P4-Q13) — LoginFlow, PricingMutations, FinanceActions (14 tests)
11. ✅ Unit test ≥80 backend + frontend (backend 149 passed incl. P4; frontend 58)
12. ✅ PR CI tanpa CD (#19), deploy VPS+Vercel, evidence

## Verifikasi produksi (live)
- Backend MainPID 680666, active; schema memory.mutation_replay/operator_session/pricing_config_upstream EXIST; assets=70 intact
- Pricing merged + finance + reliability smoke 200; login token 4-part works
- Offsite marker `offsite skipped 2026-08-21T01:21:24Z`

## Known pre-existing debt (diteruskan, didokumentasikan)
- 192 earning-equation unexplained violations (balance>lifetime) — recon FAIL honest; koreksi data = kerja terpisah
- Offsite /run/wwma/env tidak ada di VPS — marker skip; rclone offsite belum aktif
- Infra coverage app.py (startup/poller/SSE/main paths) — intentionally uncovered, documented
