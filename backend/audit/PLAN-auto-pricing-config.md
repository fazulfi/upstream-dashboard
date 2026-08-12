# PLAN — Auto-Pricing Configurable per Provider×Model

**Date:** 2026-08-11 · **Goal:** ubah auto-pricing dari hardcode band → **configurable per upstream×model** + UI set manual, list model per provider di popup/subpage.

## Masalah (root cause)
1. `SLUGS = ["codebuddy","cline-pass"]` hardcoded, diproses 1 loop identik → tidak terpisah per provider
2. Band `deepseek-v4-flash → 10/15`, `lainnya → 20/25` hardcoded di script — user tidak bisa set
3. Tidak ada config store

## Desain
- **Tabel `auto_pricing_config`** (DB upstream): `id, upstream, model_id, trigger_pct, rebound_pct, updated_at`
  - key unik `(upstream, model_id)`; NULL/absent = pakai default
  - default: deepseek-v4-flash → trigger 10, rebound 15; lainnya → trigger 20, rebound 25
- **Backend endpoints**:
  - `GET /api/auto-pricing/config` → semua config (upsert dari asks bila kosong)
  - `PUT /api/auto-pricing/config` body `{upstream, model_id, trigger_pct, rebound_pct}` → upsert
  - `DELETE /api/auto-pricing/config/{id}` → hapus (kembali default)
- **Daemon `auto_pricing.py`**:
  - baca `auto_pricing_config` dari DB tiap cycle (via `psycopg` atau file JSON fallback)
  - untuk tiap model: `trigger_pct, rebound_pct` dari config (atau default)
  - hapus hardcode `SLUGS` → SLUGS dari config/asks (semua upstream yang ada asks enabled)
- **Frontend AutoPricing.jsx**:
  - Tab/selector per provider (codebuddy, cline-pass, + dynamic dari data)
  - List model per provider (hanya model upstream itu)
  - Tiap baris: input `trigger%` + `rebound%` editable → PUT config
  - KPI count per provider

## Files
- backend/app.py (tabel + endpoints)
- scripts/auto_pricing.py (baca config)
- frontend/src/pages/AutoPricing.jsx (UI per provider)
- frontend/src/App.css (style popup/tab)

## Verification
- DB: config tersimpan & terbaca
- Daemon: dry-run pakai config kustom (trigger 30/rebound 35 untuk model X → target mengikuti)
- Frontend: pilih provider → list model provider itu → set → tersimpan → daemon baca
