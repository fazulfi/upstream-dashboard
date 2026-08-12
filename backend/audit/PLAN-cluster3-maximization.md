# PLAN — Maksimalisasi Cluster 3 (Publisher, 26 endpoint) ke Dashboard Upstream

**Tanggal:** 2026-08-11 · **Scope:** 26 endpoint /publisher/* · **Arsitektur:** DB-first, frontend baca /api/*

## Tujuan
Maksimalkan endpoint PUBLISHER yang benar-benar bisa MONETISASI & MONITOR fleet Faiz. Dua prioritas:
- **Ask Price Management** (naikkan harga jual → margin naik)
- **Fleet Health & Auto-recheck** (monitor drain/invalid + recheck otomatis)
- **Payout gate** (tarik earning)

## Sumber (live-verified audit-publisher.md)
| Prioritas | Endpoint | Nilai |
|---|---|---|
| ⭐ Ask mgmt | GET /publisher/providers/{id}/asks + PUT /publisher/upstreams/{slug}/asks/{modelId} | Naikkan ask menuju cap 50%, guided avgPriceRequests (demand) + cheapestActivePct |
| ⭐ Fleet health | GET /publisher/providers (286), {id}/recheck, {id}/usage/refresh, /usage-windows (batch) | Monitor 286 akun: apiKeyCheckStatus invalid, drainedUntil (future), reactive_429, cooldown |
| Payout gate | GET /publisher/earnings + withdrawals/destinations + /otp + POST withdrawals | Tarik balance → USDC (manual approve) |
| Earnings transfer | POST /publisher/earnings/transfer | Pindah earning → spend |
| Schedule/max-concurrent | PUT /publisher/upstreams/{slug}/schedule, /max-concurrent | Set jam buka + limit in-flight |
| Provider mgmt | DELETE /providers/invalid, auto-reset-credit | Bersihkan invalid |
| Profile | GET/PUT /publisher/profile, /publisher/upstreams | Seting akun |

## Halaman yang dibangun

### A. "Ask Price Management" (baru, route /asks)
- Per upstream, daftar model dari asks: askInput/OutputPerMtok, official, maxAskIn/Out, cheapestActivePct, avgPriceRequests (demand), enabled
- **Slider/input untuk sett ask** per model (bounded 0 → maxAsk) → PUT /publisher/upstreams/{slug}/asks/{modelId}
- Highlight model berdemand tinggi + ruang naik (avgPriceRequests besar tapi ask rendah = peluang)
- Header: pricing rules (cap 50%, fee 20%, share 80%)
- **GLAMOR: ruang naik $ → potensi earning bila ask dinaikkan** (est)

### B. "Fleet Health" (baru, route /fleet-health)
- Tabel 286 provider: upstream, apiKeyCheckStatus (ok/invalid), drained (future-check), usedPct, resetAt, cooldownUntil, reactive_429
- Filter: upstream, status (ok/invalid/drained), search
- KPI: total, active, invalid, drained, reactive_429
- Tombol recheck per row (POST recheck) + auto-recheck bulk
- **Read-only monitoring**, recheck = non-destructive (safe)

### C. "Payout" (perluas Settlements, route /settlements)
- Balance + 13 withdrawals history (sudah ada sebagian)
- Tambah: tombol payout gate (lihat dest verified, trigger OTP, manual approve POST)

## Arsitektur
- Backend pull fleets health (providers sudah ada) → DB `providers`
- Ask mgmt: fetch asks → DB, PUT via backend (inferhub_put)
- Mutasi asks = DESTRUCTIVE → SAFETY: konfirmasi modal, batas cap enforced backend, verify sebelum PUT, restore fallback

## Urutan
1. RISET subagent: verifikasi struktur asks full + fleet health fields live + safety pattern mutasi
2. BACKEND: inferhub_put helper + endpoint /api/asks (GET/PUT), /api/fleet-health (sudah ada /api/upstreams scraping), /api/provider-recheck
3. FRONTEND: halaman Ask Price Mgmt + Fleet Health + payout gate
4. BUILD + DEPLOY + VERIFY

## Anti-slop
- Mutasi asks pakai konfirmasi + bound cap backend (jangan biar frontend asal PUT)
- Data fleet benar (not invented)
- UI konsisten design system Ledger
