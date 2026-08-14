# AUDIT ULANG — Halaman Earnings: UI/UX Tuning + Fix Realtime

**Tanggal:** 2026-08-14 04:35 UTC
**Cakupan:** Halaman `/earnings` (frontend Vercel `upstream-static.vercel.app` + backend VPS 82.25.62.204)
**Metode:** Audit 4 subagent paralel (backend / frontend UIUX / docs-infra / realtime) → implement plan → implementasi → deploy → verifikasi browser live (dark+light+mobile) → rekonsiliasi.
**Status:** ✅ SEMUA TARGET TERCAPAI (bukti di bawah)

---

## TL;DR — Masalah & Root Cause

| ID | Masalah | Root cause | Fix | Status |
|----|---------|-----------|-----|--------|
| **RC1** | Amount per-request tampil `$0.0000` | `Earnings.jsx:74` `Number(r.amount\|\|0).toFixed(4)` — amount nyata mikro ($0.000014) < 0.00005 ter-format jadi 0.0000. Backend SUDAH benar (6 desimal) | `frontend/src/lib/fmt.js` `fmtUsdMicro`: ≥$1 → 2 des, ≥$0.01 → 4 des, else → 6 des. 0/null → `$0` | ✅ **$0.000014** tampil |
| **RC2** | Chart "Real income trend" TIDAK realtime | `Earnings.jsx:16` `useApi('/api/history?...')` tanpa pollMs (0) — load sekali, tak pernah update walau poller backend append tiap 10s | `useApi(..., 10000)` poll 10s | ✅ poll 10s terbukti (network entries t=20621→30620) |
| **RC3** | Range kontradiktif (pills 1h vs backend hardcode 30d) | `app.py:1393` hardcode `range: "30d"` | Backend terima `?range=` (24h/7d/30d/90d/all) + frontend satu set pills global (default 24h) | ✅ 1 set pills, backend range=24h/7d |
| **RC4** | UI/UX 18 temuan (3 P0 + 8 P1 + 7 P2) | Layout stacked, tanpa KPI row, chart tanpa sumbu waktu, dst (detail di plan) | Restruktur penuh (di bawah) | ✅ |
| **RC5** ⚠️ BARU | **SEMUA API 401 dari frontend Vercel** | Deploy Vercel dari root repo (`--cwd /home/gamesim/dashboard`) → project settings RootDirectory `.` → Vercel build **backend λ** (bukan frontend Vite) → rewrite `/api` ke λ lokal tanpa env auth → 401 semua | Deploy dari `--cwd .../frontend` (vercel.json frontend: rewrite → ops.budgezen.com) | ✅ API 200 dgn data |

## Implementasi

### Backend (`backend/app.py`, commit `fc72002`)
- `/api/earnings-log` terima `?range=` (validasi ∈ USAGE_RANGES, fallback 30d) + `?size=`.
- `ts` dikirim UTUH (ISO) — frontend format relatif (bukan slice `[11:19]`).
- **TTL cache 3s** per `range:size` (`_cache["earn_log_cache"]`) — poll chart+tabel tidak double-fetch InferHub (rate-limit safety). Bukti: T1 0.1498s → T2 0.0015s (cache hit).

### Frontend (`commit 250a0a7`)
- `src/lib/fmt.js` (+`fmt.test.js`): `fmtUsdMicro` (presisi mikro), `fmtTs` (hari ini HH:mm:ss / tua dd MMM HH:mm, UTC deterministik).
- `src/pages/Earnings.jsx`: **KPI row 4** (Real income featured + spark, Live requests, Avg/request, Last request) · **range pills global** (role=group, aria-pressed, 11 tombol) · **`.earn-grid` 2 kolom** (1.4fr 1fr chart + ticker) · chart `useApi 10s` · ticker `useApi 15s` + `range` param · `aria-live="polite"` · `key=r.ts+r.model+i` · row baru `.row-new` highlight · Amount `strong` netral (bukan hijau noise) · Time `fmtTs`.
- `src/components/EarningsChart.jsx`: **sumbu X = WAKTU** (`startEpoch + i*span`), tick format per span (≤1h HH:mm / lebih dd/MM), tooltip label waktu candle.
- `src/App.css`: `.earn-grid` (+collapse 1100px), `.ticker-scroll` (sticky thead), `.row-new` + `@keyframes rowIn`, `kpis-4` responsive; **hapus duplikat `@keyframes pulse`** (App.css:353-355).

## Verifikasi Live (browser, 2026-08-14 04:39-04:40 UTC)

### Screenshot dark (1440x900) — `omp-sshots-1556f1bdd5637583.webp`
- KPI row: **REAL INCOME · 24H $5.76** · **LIVE REQUESTS · 7D 13,113** · **AVG/REQUEST $0.000439** · **LAST REQUEST 04:22:22**
- Chart: 2 candles (24h/candle), Real income trend $5.76
- Ticker: **13,113 requests · 7d** LIVE pill, rows:
  - `04:22:22 · cx/gpt-5.6-luna · OpenAI Codex · 688 · 36 · **$0.000014**`
  - `04:22:21 · cx/gpt-5.6-luna · 685 · 5 · **$0.000017**`
  - `04:22:20 · cx/gpt-5.6-luna · 710 · 6 · **$0.000018**`
- **Amount presisi mikro — BUKAN 0.0000** ✅

### Realtime 2 titik waktu (12s apart)
| t0 (04:39:55) | t1 (04:40:07) | Bukti network (performance entries) |
|---|---|---|
| meta `24h · 2 candles` | meta `24h · 2 candles` | `/api/history` @ t=20621 & t=30620 (Δ≈10s = poll chart aktif) |
| lastReq 04:22:22 | rows sama (request baru muncul saat trafik baru) | `/api/earnings-log` @ t=30620 (poll tabel) |

### Mobile (390x844) — `omp-sshots-1556f1bdd5637583.webp` (mobile)
- `.earn-grid` 1 kolom (collapse) · `.kpis` 1 kolom · pills wrap · chart+ticker full-width · amount tetap presisi.

### Konsol & performa
- **0 console error, 0 pageerror**.
- LCP cepat (SPA statis), bundle gzip 214KB (warning chunk size existing, bukan regression).

### API terverifikasi (VPS)
- `/health` 200 · `/api/earnings-log?range=24h` → `range:24h`, `ts` utuh ISO, amount 1.4e-05 · `?range=xxx` → fallback `30d` · cache hit T2=0.0015s.
- **Via Vercel rewrite (public)**: `/api/history?range=24h` 200 dgn data (`deltas:[0, 5.7596]`, earning $340.55) — bukti RC5 fixed.

## Rekonsiliasi

- **Test:** frontend `npm test` → **15/15 pass** (3 file: Topups 5, useApi 3, fmt 7 baru). `npm run build` → 0 error.
- **Deploy:** backend VPS restart (PID 1411168, health 200) · frontend Vercel prod `upstream-static.vercel.app` (build Vite dari frontend/, aliased).
- **Git:** `fc72002` (backend) + `250a0a7` (frontend) + `89e381e` (plan) — semua pushed.
- **Auto-pricing/keuangan tidak tersentuh** — health backend OK, daemon unit tetap active.

## Dokumen terkait
- Plan: `docs/superpowers/plans/2026-08-14-earnings-uiux-realtime.md`
- Audit sumber: hasil 4 subagent (backend/frontend/docs/realtime) — `history://ScoutBackendEarnings` dkk.
- Docs existing (auto-pricing, audit-full, AUDIT-2026-08-13, OPS-RUNBOOK) — tidak ada perubahan kontrak endpoint yang melanggar; endpoint earnings-log kini support range (superset).
