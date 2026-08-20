# Phase 3 — Finance & Profitability: Decision Log

> **Status**: ✅ DEPLOYED (2026-08-20) — PR #17 merged → main `619d853`; backend VPS + Vercel frontend deployed; smoke + recon FIN-PARITY PASS; production freeze LIFTED.
> Metode: satu pertanyaan per keputusan; setiap jawaban owner dicatat ke file ini.
> Setelah semua terjawab → normalize → design summary → owner approval → implementation plan (Momus) → FULL AUTONOMUS execution.
> **Production freeze aktif sampai deploy selesai (aturan cross-phase roadmap).**

## Baseline (verified, dari Phase 2 + temuan planning Phase 3)

- main = `50e1917` (PR #14+#15+#16 merged, CI green, tanpa CD).
- **DB production = `wuthering_waves_multi_agent` via docker-proxy `127.0.0.1:6432`** (bukan `upstream` di socket postgres 5432 — itu DB lokal terpisah).
  - DSN: `postgresql://wwma_app:***@127.0.0.1:6432/wuthering_waves_multi_agent` (dari drop-in systemd).
  - assets = **70** (A-001..A-072; gap A-009/A-024/A-029 = retired legit) — termasuk CAPEX 2026-08-20: A-071/A-072 clinepass 5.30 USD (kurs 1 USD = 17,781 IDR).
- **BUG F1 (production, prioritas #1 Phase 3)**: `scripts/gen_finance.py` (di VPS /home/gamesim/scripts/) HARDCODE `psql -d upstream` (line 51) → baca DB salah, menimpa `ledger.json` benar + hasilkan `keuangan.xlsx` stale. Fix: baca `UPSTREAM_DB` env (sama seperti app.py/ledger_update.py). `fin_ops.py` DSN default juga perlu audit.
- `ledger.json` (finance/ledger.json, BASE=/home/gamesim/shared-memory/inferhub-business) = mirror/output; DB = sumber otoritatif (F1). Saat ini ledger.json = 70 assets sinkron DB.
- `kurs_idr_usd` per-asset di tabel `assets`; `ledger_meta` menyimpan kurs; backfill 17824.4344; PR #13 menulis kurs otomatis saat add-asset.
- Kode finance: `backend/ledger_update.py` (add/retire/reactivate/sync; add-payout DEPRECATED), `backend/full_sync.py`, `scripts/fin_ops.py`, `scripts/recon_finance.py` (belum diverifikasi detail — bagian riset Phase 3).
- Dashboard finance: halaman `Earnings`, `Pnl`, `Settlements`, `Topups`, `Budgets`, `Keys` (6 dari 18 routes).
- Verifikasi riset (2026-08-20, read langsung): `ledger.json` = legacy import satu arah (app.py:1126-1139 — hanya migrasi awal jika DB kosong) + mirror output (ledger_update.py sync DB→file); finance penuh dari DB via `_finance_from_db()` (app.py:1392, tables assets/impairments/payouts/refunds); xlsx di-regen dari DB via `scripts/gen_finance.py` (fin_ops.py regen → keuangan.xlsx); routes: /api/payouts, /api/finance, /api/earnings-log, /api/earnings-alltime.

## Keputusan yang sudah dicatat

### P3-Q1 (F1) — Strategi source-of-truth (2026-08-20, owner)
**Keputusan**: DB PostgreSQL = **satu-satunya sumber kebenaran**. `ledger.json` dan `keuangan.xlsx` adalah **output** (generated, regenerable), bukan input. Sinkronisasi satu arah: DB → generate → file. Dikonfirmasi konsisten dengan kode existing (app.py:1126-1139 legacy import skip jika DB berisi; _finance_from_db() sumber penuh; gen_finance.py regen dari DB).
- Jawaban owner: **"DB = satu-satunya sumber (Recommended)"**

### P3-Q2 (F2) — Scope reconciliation inventory/keuangan (2026-08-20, owner)
**Keputusan**: **Audit-only** — tulis reconciliation check (DB vs dashboard vs gen_finance.py) + variance report sebagai script/test, **TANPA mengubah data**. Perbaikan data hanya lewat approved data-change process terpisah jika ada selisih. Catatan: 68 assets live vs dokumentasi 60/67 — variance harus dilaporkan, bukan di-silence.
- Jawaban owner: **"Audit-only: reconcile + variance report (Recommended)"**

### P3-Q3 (F3) — Scope rule engine keuangan (2026-08-20, owner)
**Keputusan**: **Rule engine + fixture tests + konsolidasi** — buat modul rule engine (net_income = payout + refund − amort − impairment − opex; amortisasi = FULL cost untuk aset `status != 'active'` (bukan pro-rata); refund DIKURANG dari beban; opex = 0.10; kurs per-row) dengan fixture tests, lalu `gen_finance.py` + backend `app.py` memakai modul yang sama (satu sumber rule, hilangkan duplikasi docstring).
- Jawaban owner: **"Rule engine + fixture tests + konsolidasi (Recommended)"**

### P3-Q4 (F4) — Gate 'decision-grade' metrik keuangan (2026-08-20, owner)
**Keputusan**: **Gate ketat 3-syarat + badge status** — metrik keuangan dianggap decision-grade HANYA setelah: (1) reconciliation zero-variance, (2) rule engine + fixture tests hijau, (3) restore-tested backup evidence ada (sudah terpenuhi Phase 2). Dashboard menampilkan status 'verified'/'pending' per metric (badge UI).
- Jawaban owner: **"Gate ketat 3-syarat + badge status (Recommended)"**

### P3-Q5 (F4) — Mutasi keuangan auditable (2026-08-20, owner)
**Keputusan**: **Audit trail tabel** — semua mutasi finansial (add/retire/reactivate asset, refund, payout sync, kurs update) menulis audit record (siapa, kapan, apa, sebelum/sesudah) ke tabel audit terpisah di DB. Backend route yang memutasikan data wajib mencatat audit.
- Jawaban owner: **"Audit trail tabel (Recommended)"**

### P3-Q6 (F4) — Dashboard finance scope (2026-08-20, owner)
**Keputusan**: **Rule-engine-backed + badge** — halaman finance (Earnings/Pnl/Settlements/Topups/Budgets/Keys) menampilkan data dari rule engine (satu sumber), status verified/pending per metric (badge UI), variance summary dari reconciliation. Backend route finance disatukan ke modul rule engine yang sama.
- Jawaban owner: **"Rule-engine-backed + badge (Recommended)"**

### P3-Q7 (F3/F4) — Izin perubahan backend/schema Phase 3 (2026-08-20, owner)
**Keputusan**: **Boleh ubah backend + schema, additive-only** — Phase 3 menyentuh backend (modul rule engine, tabel audit, konsolidasi route finance) dengan aturan: perubahan schema additive (tidak ada DDL destruktif), PR + CI tanpa CD, deploy manual VPS, backup sebelum deploy. Konteks: larangan 'no backend change' hanya berlaku untuk Phase 2.
- Jawaban owner: **"Boleh ubah backend+schema additive (Recommended)"**

### P3-Q8 (F3) — Strategi kurs IDR/USD (2026-08-20, owner)
**Keputusan**: **Backfill verifikasi-only** — buat migration/additive schema untuk backfill konsisten (kurs_idr_usd per asset tanpa menimpa nilai existing) + verifikasi via reconciliation; data tetap source of truth, tidak ada penulisan massal yang merusak. Konsisten dengan P3-Q2 (audit-only, variance dilaporkan).
- Jawaban owner: **"Backfill verifikasi-only (Recommended)"**

### P3-Q9 (F4) — Cakupan tabel audit trail (2026-08-20, owner)
**Keputusan**: **Tabel audit terpisah, semua mutasi** — semua mutasi finansial (add/retire/reactivate asset, refund manual, payout sync, kurs update) menulis ke tabel audit khusus di DB, baik via backend route maupun CLI/scripts; field: siapa/sumber, kapan (timestamp), apa (aksi), sebelum/sesudah (JSON). CLI/scripts ikut mencatat (tidak hanya backend route).
- Jawaban owner: **"Tabel audit terpisah, semua mutasi (Recommended)"**

### P3-Q10 (F1/F3) — Jadwal sinkronisasi output (2026-08-20, owner)
**Keputusan**: **Timer + trigger manual** — sync DB→ledger.json & regen keuangan.xlsx tetap via systemd timer malam (existing), ditambah trigger manual setelah mutasi (post-mutation hook) agar output selalu segar setelah perubahan data.
- Jawaban owner: **"Timer + trigger manual (Recommended)"**

### P3-Q11 (F4) — Strategi deploy Phase 3 (2026-08-20, owner)
**Keputusan**: **Backend VPS + frontend Vercel dalam satu release** — deploy BOTH: backend Flask baru (rule engine + route konsolidasi + audit) via VPS manual (systemd restart, backup dulu) DAN frontend Vercel; PR terpisah per area, CI green, smoke lengkap setelah deploy.
- Jawaban owner: **"Backend VPS + frontend Vercel (Recommended)"**

### P3-Q12 (F4) — Granularitas badge status (2026-08-20, owner)
**Keputusan**: **Per metric** — badge status verified/pending ditampilkan per metric/angka (net income, payout, amort, impairment, kurs), bukan per halaman; user melihat metric mana yang verified mana yang pending.
- Jawaban owner: **"Per metric (Recommended)"**

### P3-Q13 (F4) — Hapus page dengan API dimatikan (2026-08-20, owner)
**Keputusan**: **Frontend-only hapus page** — hapus 13 page yang API-nya diblokir allowlist karena efisiensi rate limit (Analytics, Budgets, Catalog, Combos, Dashboard, FleetHealth, Keys, Market, Pnl, Settlements, Topups, Upstreams, Earnings): hapus file page, route App.jsx, entry Layout TITLES, link Sidebar. Route backend TETAP dipertahankan (tidak konsumsi rate limit kalau tak dipanggil; reversible). Halaman live yang tersisa: Reliability, AutoPricing, Asks (+ Settings bila diverifikasi aktif).
- Jawaban owner: **"Frontend-only hapus page (Recommended)"**

## Pertanyaan historis (non-authoritative, untuk konteks)

<!-- Draft pertanyaan sebelum dikonfirmasi -- bukan keputusan final -->
