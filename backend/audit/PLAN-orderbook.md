# PLAN — Ask Price → Orderbook-style (manual set)

**Date:** 2026-08-11 · **Goal:** ubah halaman Ask Price jadi orderbook: lihat semua level harga per model (termurah→termahal) dengan depth per upstream; klik model → modal set harga manual.

## Data source (verified live)
- `GET /catalog` → per upstream: `models[].{label, upstreamModelId, asksIn[], asksOut[], officialIn/Out}`. `asksIn[]` = harga ask setiap provider di upstream itu → **depth** per level harga.
- `GET /api/asks` (dari `/publisher/providers/{id}/asks`) → ask kita per model (untuk highlight "punya kita").
- `GET /market` → `minAskIn` (harga termurah global) untuk label.

## Backend — `/api/orderbook`
Agregat dari catalog:
```
FOR tiap upstream card:
  FOR tiap model m:
    bucket harga In dari m.asksIn[]  -> {price: n_provider}   # depth per level
simpan per-model: {model_id, upstreams:[{slug,label,depth_by_price:[{price,qty}], ask_kita}], official}
```
Response per model: daftar level harga (unique, sorted), tiap level: total depth + breakdown per upstream.
Plus `min_ask` (termurah), `max_ask`, `spread`, `official`.

## PUT manual — reuse `/api/ask` (sudah ada, bounded cap maxAskIn, PUT via upstreamCatalogModelId).

## Frontend — halaman Ask Price
- List model (kartu/kontainer) urut by demand/min price.
- **Klik model** → modal: orderbook ladder per upstream (harga + depth bar), highlight ask kita, field "Set harga manual" (input, bounded) + tombol PUT.
- Anti-pattern: jangan campur earning; ini CONTROL harga jual.
