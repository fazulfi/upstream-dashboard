# AUDIT REV3 — Visual + Realtime Fix (Earnings)

**Tanggal:** 2026-08-14 06:45-06:52 UTC
**Cakupan:** Halaman Earnings (`https://upstream-static.vercel.app/#/earnings`)
**Status:** ✅ SEMUA 6 MASALAH VISUAL + REALTIME FIXED

---

## Masalah rev2 (dari screenshot user) & Fix

| # | Masalah | Bukti sebelum | Fix | Bukti sesudah |
|---|---------|---------------|-----|---------------|
| **V1** | **Sparkline featured KPI overflow keluar border** | Garis biru tampak keluar card | Hapus prop `spark` dari featured KPI di 4-col grid (match pola Dashboard) | `sparklinePresent: false` · card bersih |
| **V2** | **Label X chart "5/7" "6/7" — cabang dd/MM padahal range 24h (1 hari per candle)** | `EarningsChart.jsx:26` `spanS <= 3600 ? HH:mm : dd/MM+1` → 24h=86400 → dd/MM salah | Tambah `useDate = totalSpanS > 24*3600` (>1 hari total → sertakan tanggal) + `MONTHS` const + `pad` | Label: **"05 Jul 07:00"**, **"06 Jul 07:00"** |
| **V3** | **Timestamp UTC mentah** — user lihat "05:12:41" padahal WIB | `fmt.js:20` `getUTCHours()` + regex UTC | Ganti ke `getHours()`/`getMinutes()` (zona LOKAL user) — `new Date(ts)` browser sudah konversi otomatis | "12:50:00", "12:41:12", "11:22:22" — match WIB (UTC+7 dari data UTC 05:50) |
| **V4** | **Ticker row terpotong** — baris terakhir tidak kelihatan | `.ticker-scroll max-height:440px` | Naikkan ke **480px** + `tbody tr:last-child td { border-bottom:none }` agar row terakhir clean | Row terakhir visible: `11:21:24 · cx/gpt-5.6-luna · 732 · 17 · $0.000014` |
| **V5** | **Pills crowded wrap 2 baris** di desktop | `flex-wrap: wrap` di `.range-pills` | Ganti ke `flex-wrap: nowrap` + `overflow-x: auto` (scrollable horizontal mobile + desktop 1 baris) | `flexWrap: nowrap` · 1 baris, 11 tombol, scroll halus di mobile |
| **V6** | **"Realtime per request" tidak terasa hidup** | poll 15s + no indicator | (a) poll ticker **15s → 5s** (aman dgn TTL cache 3s backend), (b) tambah state `newCount`+`firstTs` deteksi row baru via ts, (c) badge **"+N new"** (animasi badgePop), (d) live-pill `● live · 5s` | `pollGap: [10972, 15985]` = Δ 5013ms ≈ 5s · live-pill "LIVE · 5S" |

## Verifikasi Live (2026-08-14 06:51 UTC)

### Browser devtools — bukti realtime
- **Performance resource entries** `/api/earnings-log`:
  - t=10972ms (first poll)
  - t=15985ms (second poll)
  - **Δ = 5013 ms ≈ 5s** — sesuai pollMs=5000 ✅
- **`/api/history`** masih poll 10s (chart).
- Console 0 error, 0 pageerror.

### Live data di UI
- LIVE REQUESTS · 7D: **13,051** (vs 13,113 sebelumnya — turun sedikit = sync baru)
- AVG/REQUEST: **$0.001050** (6 desimal presisi mikro)
- LAST REQUEST: **12:50:00** (lokal user = UTC 05:50 + 7 jam)
- 9 row ticker tampil penuh (tidak terpotong)
- Tooltip chart hover: **"06 Jul 07:00"**, `usdc: $13.44`

### Mobile (390px)
- `.earn-grid` 1 kolom, `.kpis.kpis-4` 1 kolom
- Pills: scrollable horizontal (touch)
- Chart full-width + ticker full-width, amount tetap presisi

## Git
- Commit `b189746` "feat(frontend): realtime per request — poll ticker 5s + badge +N new + live-pill 5s"
- Commit `403ed3d` "fix(frontend): label X chart dd MMM utk rentang >1 hari"
- Commit `5243ce7` "fix(frontend): visual rev2 — hapus sparkline overflow, label X HH:mm utk rentang pendek, timezone LOKAL user, ticker max-height 480, range pills no-wrap"
- **Vercel prod** aliased `upstream-static.vercel.app` (build dari `frontend/`)

## Catatan
- **Poll 5s** aman karena backend TTL cache 3s + cache hit T2=0.0015s (bukan double-fetch InferHub). Rate limit InferHub tidak dilanggar.
- **Badge +N** auto-increment saat ada request baru (ts baris pertama berubah); reset saat halaman reload (firstTs=null).
- **Timezone** sekarang konsisten per-user (browser TZ) — bukan UTC. Untuk backend/DB/storage tetap UTC ISO (kontrak tidak berubah).
- **Sparkline dihapus dari featured KPI 4-col** (pakai pola Dashboard: featured = label+value+sub only). Kalau mau sparkline di tempat lain, harus redesign featured = full-width headliner.
- **Label X "dd MMM HH:mm"** untuk rentang > 1 hari, **"HH:mm"** untuk ≤ 1 hari — informatif & konsisten.
