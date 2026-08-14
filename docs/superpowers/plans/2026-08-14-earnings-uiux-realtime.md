# Tuning UI/UX Halaman Earnings + Fix Realtime "Live earnings per request"

> **REQUIRED SUB-SKILL:** superpowers:subagent-driven-development (recommended) atau superpowers:executing-plans. Steps pakai checkbox (`- [ ]`).

**Goal:** Halaman Earnings (/earnings) sesuai target user: (1) Amount per-request tampil benar (bukan $0.0000), (2) "Live earnings per request" aktif & realtime per request, (3) tata letak & UI/UX di-tuning konsisten design system "Ledger" (Pnl/Usage/Dashboard), (4) dokumentasi + evidence lengkap.

**Architecture:** Backend Flask monolith (`backend/app.py`) + frontend React Vite (`frontend/src/`). Alur earning 2 jalur:
- **Per-request:** frontend poll `/api/earnings-log` → backend LIVE fetch InferHub `/usage/logs` → rows `{ts, model, upstream, in_tok, out_tok, amount}` → tabel.
- **Kumulatif:** poller thread (10s) append `earning_history` (DB) → `/api/history?range=` re-bucket → AreaChart.

**Root causes (dari audit 4 subagent, semua diverifikasi):**
- **RC1 (Amount 0.0000):** `Earnings.jsx:74` `Number(r.amount||0).toFixed(4)` — amount nyata $0.000014 (API benar 6 desimal) ter-format jadi `0.0000`. Fix: formatter presisi adaptif (≥$1 → 2 des, ≥$0.01 → 4 des, else → 6 des atau `<$0.000001`).
- **RC2 (Chart tidak realtime):** `Earnings.jsx:16` `useApi('/api/history?...')` tanpa pollMs → chart load SEKALI, tak pernah update walau poller backend append tiap 10s. Fix: pollMs 10s.
- **RC3 (Range kontradiktif):** pills default `1h` tapi backend earnings-log hardcode `range=30d` (`app.py:1393`) → sub judul "30d" + data 30d di layar yang pills-nya 1h. Fix: backend terima `range` param; frontend satu set pills untuk kedua komponen.
- **RC4 (UI/UX):** 18 temuan subagent UIUX (3 P0 + 8 P1 + 7 P2): tanpa KPI row, panel stacked bukan grid, chart tanpa sumbu waktu, meta duplikat, sticky header, pulse duplikat, 11 pills overload, Amount hijau noise, format waktu HH:MM:SS utk 30d, dst.

**Tech Stack:** Python 3.12 (Flask/Waitress, psycopg), React 18 (Vite, recharts), Vercel (frontend), nginx+VPS 82.25.62.204 (backend), InferHub API.

## Global Constraints

- Frontend live = `upstream-static.vercel.app` (project `upstream-static`, VERCEL_TOKEN di `~/.hermes-suisui/.env` VPS). ALLOWED_ORIGINS backend harus include origin Vercel — jangan tambah origin baru tanpa update env.
- **JANGAN set `VITE_DASHBOARD_PASSWORD`** (C1: password bocor bundle). Login via `/api/login` session token.
- Backend auth: Bearer session token (frontend) / X-Auth (curl). TTL 24h.
- `/api/earnings-log` FETCH LANGSUNG ke InferHub per-request — jangan ubah jadi baca DB (latency naik). Rate limit InferHub: audit catat poll ≥15s aman; poll chart 10s + earnings-log tetap 15s → OK, jangan turunkan earnings-log <15s.
- Waitress 4 thread: hindari blocking fetch lambat di request path (fetch earnings-log timeout 30s — sudah ada).
- Semantics (riset-cluster2): `publisher_earnings` = saldo (bukan earning); `usage/*` = consumer cost, JANGAN dilabel earning; earning publisher = cost_consumer × share.
- Format amount: helper `fmtUsdMicro` — ≥1 → 2 des; ≥0.01 → 4 des; else → 6 des (pakai `toLocaleString`), hindari `toFixed(4)` hardcoded.
- Komponen & CSS: reuse `KpiCard`, `.kpis`, `.pnl-grid`-style grid, `.range-pills`, `.tbl-compact`, `.live-pill`, `.badge`. Jangan buat design system baru.
- Konvensi commit: `feat/fix(area): deskripsi` — konsisten git log repo.
- Test: `npm test` (Vitest) frontend + `python -m pytest backend/tests` — jalankan sebelum claim done.

---

### Task 1: Backend — `/api/earnings-log` terima `range` param + timeout aman

**Files:**
- Modify: `backend/app.py` (api_earnings_log L1383-1411)

**Interfaces:**
- Consumes: `inferhub_get("/usage/logs", {"range": range_id, "page": 1, "pageSize": ...})` — range enum InferHub: 24h/7d/30d/90d/all.
- Produces: `GET /api/earnings-log?size=25&range=1h|24h|7d|30d|90d|all` → `{rows, total, range, source}`.

- [ ] **Step 1:** Parse `request.args.get("range", "30d")`; validasi ∈ {24h,7d,30d,90d,all} (fallback 30d).
- [ ] **Step 2:** Teruskan range ke `inferhub_get`.
- [ ] **Step 3:** `ts` utuh (bukan slice `[11:19]`) — frontend format relatif (hari ini → HH:mm:ss, lebih tua → dd MMM).
- [ ] **Step 4:** `py_compile` + test manual curl.
- [ ] **Step 5:** Commit `feat(backend): earnings-log terima range param + ts utuh`.

### Task 2: Backend — cache 3s untuk earnings-log (anti rate-limit saat poll chart+tabel)

**Files:**
- Modify: `backend/app.py`

**Interfaces:**
- Consumes: `_cache` dict + lock (pola existing `_cache["earnings_log"]` throttle 20s di _poll_once L835-841).
- Produces: TTL cache per-range utk `/api/earnings-log` (mis. `_cache["earn_log_cache"] = {key, ts, data}`) — TTL 3s: 2+ client poll dalam 3s → 1 fetch InferHub.

- [ ] **Step 1:** Helper `_earn_log_cached(size, range_id)` — cek cache (key=f"{range_id}:{size}", TTL 3s), miss → fetch + set.
- [ ] **Step 2:** api_earnings_log pakai helper.
- [ ] **Step 3:** py_compile + test.
- [ ] **Step 4:** Commit `feat(backend): TTL cache 3s earnings-log per range`.

### Task 3: Frontend — Earnings.jsx restruktur (KPI row + grid 2 kolom + pills global + poll chart)

**Files:**
- Modify: `frontend/src/pages/Earnings.jsx`
- Modify: `frontend/src/components/EarningsChart.jsx` (XAxis waktu + tooltip label)
- Modify: `frontend/src/App.css` (class baru: .earn-grid, .ticker-scroll, .row-new, @keyframes rowIn; hapus duplikat pulse)
- Create: `frontend/src/lib/fmt.js` (fmtUsdMicro, fmtTs) — atau taruh di useApi.jsx kalau kecil

**Interfaces:**
- Consumes: `useApi`, `usd`, `KpiCard`, `EarningsChart(data, startEpoch, spanS)`.
- Produces: struktur baru:
  1. `.kpis` (4 KpiCard): featured `Real income · {range}` = usd(totalInterval) + spark=candles; `Live requests` = log.total; `Avg / request` = totalInterval/log.total; `Last request` = ts terbaru relatif.
  2. Range pills GLOBAL di luar panel (pola Usage) — role="group", aria-pressed, 11 tombol, default `24h`.
  3. `.earn-grid` 2 kolom (1.4fr 1fr): kiri chart panel, kanan ticker panel.
  4. Ticker: `.ticker-scroll` sticky thead, `aria-live="polite"`, key=r.ts+r.model, row baru highlight `.row-new`, Amount pakai fmtUsdMicro (tanpa `+$` hijau → `strong` netral), Time format relatif.

- [ ] **Step 1:** Buat `frontend/src/lib/fmt.js`: `fmtUsdMicro(v)` (≥1 → 2 des; ≥0.01 → 4 des; else → 6 des, toLocaleString), `fmtTs(ts)` (utuh ISO → hari ini HH:mm:ss / dd MMM HH:mm).
- [ ] **Step 2:** Update `EarningsChart.jsx`: terima `startEpoch` & `spanS`; XAxis pakai label waktu (format per range: HH:mm utk ≤24h, dd MMM utk lebih); tooltip labelFormatter tampilkan waktu candle.
- [ ] **Step 3:** Rewrite `Earnings.jsx` sesuai struktur ideal (KPI row + pills global + earn-grid). Chart `useApi(..., 10000)` (poll 10s realtime); earnings-log `useApi(..., 15000)` + range param sama dgn pills.
- [ ] **Step 4:** `App.css`: tambah `.earn-grid`, `.ticker-scroll` (+sticky), `.row-new`, `@keyframes rowIn`; HAPUS blok duplikat pulse (App.css:353-355); media query collapse di 1100px.
- [ ] **Step 5:** `npm test` (Vitest) + `npm run build` (Vite) → 0 error.
- [ ] **Step 6:** Commit `feat(frontend): restruktur Earnings — KPI row, grid 2 kolom, poll chart 10s, amount mikro presisi`.

### Task 4: Deploy backend (VPS) + verifikasi API

**Files:**
- Server-side (VPS 82.25.62.204, root via `ssh faiz-prod`)

- [ ] **Step 1:** Pull di VPS (`/home/gamesim/dashboard`), restart backend (pkill + nohup, env sama: DASHBOARD_PASSWORD, ALLOWED_ORIGINS).
- [ ] **Step 2:** Verifikasi: `/health` 200; `/api/earnings-log?range=24h` → range=24h + ts utuh; `?range=1h` valid; invalid range → 30d.
- [ ] **Step 3:** Cek ALLOWED_ORIGINS masih include origin Vercel live.

### Task 5: Deploy frontend (Vercel) + verifikasi live browser

**Files:**
- Server-side (VPS) + browser lokal

- [ ] **Step 1:** `git push`; di VPS `git pull`; build `npm run build` (frontend/dist).
- [ ] **Step 2:** Deploy Vercel: `npx vercel --prod --token $VERCEL_TOKEN --cwd /home/gamesim/dashboard` (rootDirectory frontend).
- [ ] **Step 3:** Browser ke `https://upstream-static.vercel.app/#/earnings`; login (password dari VPS env); screenshot full page (dark & light).
- [ ] **Step 4:** Verifikasi: (a) Amount tampil presisi mikro (bukan 0.0000), (b) chart auto-refresh (poll 10s — ambil 2 screenshot 12s apart, chart berubah / timestamp berubah), (c) tabel live update (ada request baru dalam 15s), (d) KPI row + grid 2 kolom tampil.

### Task 6: Audit ulang + dokumentasi

**Files:**
- Modify: `docs/AUDIT-2026-08-14-earnings.md` (baru) — atau update docs existing
- Modify: `docs/OPS-RUNBOOK.md` (kalau ada perubahan endpoint/range)

- [ ] **Step 1:** Browser devtools: console 0 error, network waterfall (poll interval, no 4xx/5xx), performance (LCP < 3s).
- [ ] **Step 2:** Cek responsif mobile (viewport 390px) — grid collapse, tabel horizontal scroll.
- [ ] **Step 3:** Tulis laporan audit ulang: bukti screenshot sebelum/sesudah, verifikasi amount mikro, realtime (timeline 2 titik), hasil test.
- [ ] **Step 4:** Update docs (endpoint range param, poll chart 10s) + commit.

**Acceptance:**
- [ ] Amount per-request tampil presisi (nilai < $0.00005 TIDAK lagi 0.0000).
- [ ] Chart "Real income trend" auto-refresh tiap ~10s (realtime per request secara visual).
- [ ] Tabel live refresh tiap 15s dengan range konsisten pills.
- [ ] UI: KPI row, grid 2 kolom, sticky header, waktu relatif, amount netral — konsisten design Ledger.
- [ ] `npm test` + `npm run build` + `pytest` lulus.
- [ ] Browser live: screenshot dark+light, console bersih, realtime terbukti 2 titik waktu.
- [ ] Docs update + evidence lengkap.
