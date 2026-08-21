# Phase 4 — Dashboard Control Plane: Decision Log

> **Status**: ✅ DEPLOYED (2026-08-21) — PR #19 merged (main 2856baf), VPS+Vercel deployed, evidence artifacts/phase4/deploy/evidence-20260821T012238Z.md.
> Metode: satu pertanyaan per keputusan; setiap jawaban owner dicatat ke file ini.
> Setelah semua terjawab → normalize → design summary → owner approval → implementation plan (Momus) → FULL AUTONOMUS execution.
> **Production freeze aktif selama planning** (aturan cross-phase roadmap).

## Baseline (verified, dari Phase 2 + Phase 3)

- main = `0071ec2` (PR #17 feat + PR #18 chore evidence merged, CI green, tanpa CD).
- Backend: `ops.budgezen.com` (MainPID 301370, code 619d853); frontend: `upstream-static.vercel.app` (bundle index-CbDxkYac.js, 5 routes: Reliability, Ask Price, Auto-Pricing, Settings).
- Finance unit: repo `scripts/gen_finance.py` + `EnvironmentFile=/home/gamesim/.dashboard.env`; DB production `wuthering_waves_multi_agent` 127.0.0.1:6432 (70 assets A-001..A-072).
- Rule engine: `backend/finance_rules.py` (compute_finance, amortization, _slug_of, _f; REV9 provider ratio; providers=None default) — dipakai app.py db_read_finance + gen_finance.py.
- Audit trail: tabel `financial_audit` (entity/entity_id/action/actor/source/before/after JSONB) + `backend/financial_audit.py` audit_write; wiring fin_ops buy/retire/refund, ledger_update upsert/status, full_sync payouts, kurs update.
- Recon: `scripts/recon_finance.py` — invariant payout/withdrawn/kurs/delta + FIN-PARITY (parity_rule_engine).
- **Pre-existing debt (masuk Phase 4 via P4-Q1)**: recon FAIL "Earning equation sejak baseline (10-Agu): pelanggar live 192" (scripts/recon_finance.py line ~203-218); app.py coverage 24% (logic 99%, combined 27%); rclone offsite `/run/wwma/env` not found.

## Keputusan

### P4-Q1 (scope) — 2026-08-20, owner
**Keputusan**: **"1+2 jadi phase 4"** — Phase 4 = Control Plane C1-C5 (roadmap) PLUS technical-debt cleanup (recon earning-equation FAIL, app.py coverage, rclone offsite) digabung dalam satu phase.
- Jawaban owner: **"1+2 jadi phase 4"**

### P4-Q2 (cakupan kontrol) — 2026-08-20, owner
**Keputusan**: Expose/gate dulu di Phase 4: **(a) Pricing control** (auto-pricing config PUT/DELETE + arm/disarm), **(b) Finance control** (buy/retire/refund/kurs update via dashboard), **PLUS scope baru dari owner**: (c) **config GLOBAL untuk semua model di setiap upstream/provider**, dan (d) **merge asks price dengan auto-pricing** sehingga terlihat **visual orderbook per model** (gabung manual ask + auto-pricing config dalam satu tampilan).
- Jawaban owner: **"Pricing control (Recommended), Finance control, juga tambah config global untuk semua model di setiap upstream/provider, lalu merge asks price dengan auto pricing, jadi kita bisa lihat langsung visual orderbook di model itu"**

### P4-Q3 (wrapper mutasi) — 2026-08-20, owner
**Keputusan**: **Mutation wrapper bersama** — satu abstraksi untuk semua endpoint mutasi: authorization check + idempotency key + audit + feedback + rollback/disarm hook. Konsisten, dibangun sekali.
- Jawaban owner: **"Mutation wrapper bersama (Recommended)"**

### P4-Q4 (operator identity) — 2026-08-20, owner
**Keputusan**: **Identity + role di session** — sesi menyimpan identity operator (nama/role); semua audit memakai identity itu (bukan 'dashboard-api' hardcoded). Tanpa multi-password — cukup field nama saat login.
- Jawaban owner: **"Identity + role di session (Recommended)"**

### P4-Q5 (idempotency) — 2026-08-20, owner
**Keputusan**: **Idempotency-Key + replay table** — mutation wrapper mewajibkan header Idempotency-Key per request mutasi; replay table (key, route, request-hash, response) → retry aman, double-execution dicegah. Berlaku untuk semua kontrol.
- Jawaban owner: **"Idempotency-Key + replay table (Recommended)"**

### P4-Q6 (fail-closed) — 2026-08-20, owner
**Keputusan**: **Fail-closed** — jika publish file config (~/.hermes-suisui/logs/auto-pricing-config.json) gagal → mutasi DIBATALKAN + rollback + 500 (bukan 200 sukses). Sistem tidak pernah dalam state config DB ≠ file.
- Jawaban owner: **"Fail-closed (Recommended)"**

### P4-Q7 (auto-disarm) — 2026-08-20, owner
**Keputusan**: **Manual saja** — TIDAK auto-disarm setelah mutasi pricing gagal/outcome tidak diketahui; operator manual yang memutuskan (log audit tetap ada). (Berbeda dari rekomendasi auto-disarm — keputusan owner.)
- Jawaban owner: **"Manual saja"**

### P4-Q8 (pricing-config) — 2026-08-20, owner
**Keputusan**: **Tetap read-only** — /api/pricing-config (max_ask_pct, platform_fee_pct, publisher_share_pct) hanya dari sync InferHub; dashboard hanya menampilkan. Tidak ada gated write.
- Jawaban owner: **"Tetap read-only (Recommended)"**

### P4-Q9 (payout UUID) — 2026-08-20, owner
**Keputusan**: **Hapus fallback UUID** — payout sync tanpa id dari API (app.py:929) → SKIP + warning + audit (tidak menciptakan double-count).
- Jawaban owner: **"Hapus fallback UUID (Recommended)"**

### P4-Q10 (finance control) — 2026-08-20, owner
**Keputusan**: **Expose via dashboard** — finance actions buy/retire/refund/kurs update diekspos sebagai mutasi gated (wrapper + audit + idempotency), terhubung ke financial_audit yang sudah ada.
- Jawaban owner: **"Expose via dashboard (Recommended)"**

### P4-Q11 (config global + orderbook) — 2026-08-20, owner
**Keputusan**: **Satu halaman Pricing terpadu** — halaman 'Pricing' baru: config global per upstream/provider (semua model) + per-model override (CRUD gated wrapper) + tampilan orderbook merged (asks manual + auto-pricing config) per model.
- Jawaban owner: **"Satu halaman Pricing terpadu (Recommended)"**

### P4-Q12 (debt timing) — 2026-08-20, owner
**Keputusan**: **Bersama Phase 4** — debt cleanup (recon earning-equation FAIL 192, app.py coverage ≥80, rclone offsite) dikerjakan bersama di Phase 4, masuk rencana implementasi.
- Jawaban owner: **"Bersama Phase 4 (Recommended)"**

### P4-Q13 (test scope C4) — 2026-08-20, owner
**Keputusan**: **Semua critical workflows** — page-level tests: login/session expiry, pricing config CRUD, arm/disarm, finance actions, orderbook view, error/rollback states, responsive nav (vitest + jsdom).
- Jawaban owner: **"Semua critical workflows (Recommended)"**

<!-- Keputusan diisi di bawah, satu per satu, setelah owner menjawab -->
