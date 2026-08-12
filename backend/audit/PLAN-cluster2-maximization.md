# PLAN — Maksimalisasi Cluster 2 (Usage/Market/Pricing/Catalog/Inference) ke Dashboard Upstream

**Tanggal:** 2026-08-11 · **Scope:** 15 endpoint · **Arsitektur:** DB-first (frontend baca DB, backend pull API)

## Tujuan
Tampilkan SEMUA data bernilai dari 15 endpoint cluster 2 ke dashboard, dikerjakan enterprise-grade (plan → riset → implement → verify).

## "Nilai Maksimal" (dari audit usage-market.md, sudah live-verified via API)

| # | Endpoint | Method/Auth | Konten | Nilai Dashboard |
|---|----------|-------------|--------|-----------------|
| 1 | `/market` | GET public | 90 model: minAskIn/Out, maxAskIn/Out, lastRate | Panel Market (harga kompetitif per model) |
| 2 | `/pricing/config` | GET public | cap 50%, fee 20%, share 80% | Aturan margin (dasar math) |
| 3 | `/catalog` | GET Bearer | 10 upstream: activeProviders, models[] | Panel Capacity/Katalog (fleet per upstream) |
| 4 | `/v1/models` | GET Bearer | 132 model + pricing real-time | Konsolidasi model + harga |
| 5 | `/usage/breakdown` | GET Bearer | byModel/byProvider spend | Panel spend (LABEL consumer) |
| 6 | `/usage/cache-stats` | GET Bearer | hitRate, cachedTokens per model | Panel Cache (hemat biaya) |
| 7 | `/usage/logs` + `/usage/logs/models` | GET Bearer | logs + model filter | Dropdown filter / earning ticker |
| 8 | `/v1/me/usage` | GET Bearer | balance + window/all-time/session + top_model | Panel akun konsumen |
| 9 | `/market/stream` | GET SSE public | live market 15s | (option: EventSource live) |

## Halaman yang akan dibangun

### A. Halaman "Market & Harga" (baru) — endpoint 1,2,4
- Tabel 90+ model: model, upstream, min ask $, max ask $, lastRate, official $, margin potensial kita
- Header pricing rules: maxAske 50%, fee 20%, net share 80%
- Sortable, filter upstream, search
- Data dari DB `market_snapshot` (sudah ada) + pricing_config

### B. Halaman "Catalog / Kapasitas" (baru) — endpoint 3
- Kartu per upstream: activeProviders, total models, enable/disable state
- Panel kapasitas fleet per upstream
- Data dari DB `catalog_models` (perlu fix, sekarang 0) ATAU fetch /catalog

### C. Halaman "Pemakaian (Usage/Cache)" (baru / perluas) — endpoint 5,6,7
- Spend by provider/model (LABEL consumer spend)
- Cache hit rate per model + total saved
- Usage logs filterable

### D. Panel akun konsumen (dashbboard/ops header) — endpoint 8
- balance konsumen + spend 30d/all-time + top model

## Arsitektur
- Backend Flask (`app.py`) pull/kaching data ke PostgreSQL
- Full pull awal (`full_sync.py`) + polling lanjutan (`_incremental_db_sync`)
- Frontend baca `/api/*` (DB) saja — DILARANG hit InferHub langsung
- `/market` public → bisa kaching di DB `market_snapshot` (sudah)
- `/pricing/config` → DB `pricing_config` (sudah)
- `/v1/models`, `/catalog`, `/usage/cache-stats` → tabel DB baru

## Urutan implementasi
1. RISET (subagent): verifikasi struktur field tiap endpoint live + tentukan schema DB
2. BACKEND: tambah tabel + sync + endpoint /api/* baru
3. FRONTEND: halaman Market, Catalog, Usage/Cache + panel akun
4. BUILD + DEPLOY + VERIFY production

## Anti-slop / standar
- Load skill designer (frontend-ui-engineering) — pahami design system Ledger
- Tidak buat halaman asal — tiap halaman harus bernilai & benar secara business
- Verify di tiap layer (API → DB → backend → frontend)
- UI konsisten dengan P&L/KPI yang sudah dikunci
