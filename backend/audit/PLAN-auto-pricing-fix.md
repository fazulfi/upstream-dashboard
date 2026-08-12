# PLAN — Auto-Pricing Fix: Anchor Bersih + CodeBuddy-CN + State HOLD

**Date:** 2026-08-11 · **Goal:** fix 3 bug auto-pricing & tambah codebuddy-cn.

## Masalah (root cause, verified)
1. **Anchor kompetitor salah** → `market.minAskIn` itu GLOBAL termurah yg **termasuk harga SENDIRI kita sendiri**. Jadi kalau kita jual termurah, `minAskIn` = harga kita → kita "undercut" diri sendiri → turun terus (feedback loop) → lalu rebound. Ini juga bikin "harga kompetitor ganti jauh" padahal itu harga kita sendiri.
2. **Rebound logic salah** → tiap kali undercut menyentuh flood langsung di-rebound, padahal user mau: **stlh kita udah di rebound (overcut), DIAM di harga itu kecuali kompetitor KESALIP kita lagi**.
3. **codebuddy-cn belum di-auto-pricing** → mau band **maks 2%, rebound 10%** (lebih lebar).

## Fix
### 1. Anchor kompetitor BERSIH (ganti /market → /catalog)
- Ambil `/catalog` (list per upstream).
- Untuk upstream+model: `asksIn` = semua harga ask provider di upstream itu.
- **Exclude nilai ask KITA tab-wide** (kita tahu ask kita = 1 nilai utk upstream). Kompetitor min = min dari nilai asksIn yg TIDAK sama dgn ask kita (eps). Kalau tidak ada nilai beda → kita paling murah → LEADER/HOLD.
- Ini bedain harga sendiri vs kompetitor → no feedback loop.

### 2. State HOLD setelah rebound
- Simpan state per (upstream, model): `mode` (undercut|rebound|leader) & `last_set`.
- Logika per cycle:
  - Hitung competitor_min (bersih).
  - kalau `our <= competitor_min` → kita termurah → **HOLD** (jangan turun).
  - kalau mode==rebound & `our` masih >= reboot → **HOLD** (jangan balik undercut), kecuali `competitor_min < our` → kita **KESALIP** → baru undercut lagi.
  - else: target = competitor_min − 0.0001; kalau target <= flood(=official×trigger%) → **REBOUND ke reboot** & set mode=rebound; else **undercut** set mode=undercut.

### 3. CodeBuddy-CN
- Scope tambah `codebuddy-cn`.
- PREFIX `cbcn`.
- Default band: **trigger 2% → rebound 10%** (maks 2% = flood, rebound 10% = reboot).

## Files
- `scripts/auto_pricing.py` — refactor logic + state
- `frontend/src/pages/AutoPricing.jsx` — tab codebuddy-cn + default 2/10

## Verification
- Dry-run: competitor anchor bersih (bukan harga sendiri), codebuddy-cn tampil band 2/10, hold behaviour.
- Backend `/api/auto-pricing` reflected.
- Deploy + arm.
