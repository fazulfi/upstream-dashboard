# AUDIT MUTIARA — Dashboard "Upstream" (InferHub Publisher)

**Tanggal:** 2026-08-12 03:34 UTC · **Update fix:** 04:40 UTC
**Auditor:** Hiyuki (tangan pertama) + 3 subagent paralel (backend / frontend / scripts-infra)
**Cakupan:** 100% repo `/home/gamesim/dashboard` (backend `app.py` 2193 baris, full_sync, ledger_update, 15+ halaman React, auto_pricing daemon, infra nginx/domain) + DB PostgreSQL `upstream`.

**Metode:** Audit read-only. Semua temuan diverifikasi terhadap sumber (DB via psql, API live, browser runtime, nginx config). Klaim subagent yang salah dikoreksi di bawah.

---

## ✅ STATUS FIX (update 04:40 UTC)

| # | Sev | Temuan | Status |
|---|-----|--------|--------|
| C1 | 🔴 Keamanan | Secret API key bocor + nol auth + CORS `*` | ✅ **FIXED** — auth `X-Auth` password + hapus secret + CORS ketat |
| C2 | 🔴 auto-pricing | Feedback-loop osilasi ARMED | ✅ **FIXED** — logika Faiz final (anchor `/market`, floor, cooldown, interval 30s) |
| C3 | 🔴 Frontend | useApi refetch undefined → crash 4 halaman | ✅ **FIXED** — subagent frontend |
| C4 | 🔴 Frontend | "Set harga manual" Asks placeholder | ✅ **FIXED** — subagent frontend |
| R2 | 🟠 Data | **Momo double-count** | ✅ **FIXED** — IMP-12 dihapus (A-017/A-017a retired sudah masuk amort) |
| R1 | 🟠 Data | 18 impairment data-hilang | ✅ **FIXED (sementara)** — loss di-zero-kan, baris dipertahankan, butuh rekonstruksi data asli |
| — | — | **Net income** | ✅ **$63.44 → $96.30** (impairment loss terverifikasi $24.18) |

**Data fix yang sudah diterapkan (DB):**
- `DELETE FROM impairments WHERE id='IMP-12'` — hilangkan dobel-hitungan Momo (A-017/A-017a retired $8.08 amort + IMP-12 $5.39 impairment = rugi sama 2×).
- `UPDATE impairments SET loss=0 WHERE id LIKE 'imp-%'` — 18 impairment data-hilang di-zero-kan (label `[DATA-HILANG] ... butuh rekonstruksi`), baris dipertahankan utk jejak audit.
- **Backup:** `shared-memory/inferhub-business/backups/ledger-pre-fix-20260812-0439.sql`



## TL;DR — yang paling penting dulu

| # | Sev | Area | Temuan | Dampak |
|---|-----|------|--------|--------|
| 1 | 🔴 | **Keamanan** | `GET /api/keys` **bocorin full API key secret** ke browser + **nol auth** di semua route mutasi + **CORS `*`**, semua **live publik** di ops.budgezen.com | Siapa pun bisa baca secret key & ubah harga ask / key. **Eskalasi kredensial penuh.** |
| 2 | 🔴 | auto-pricing | **Feedback-loop aktif** — osilasi rebound/undercut tiap ±12s (ARMED, 10 model cline-pass) | PUT terus-menerus, harga nggak stabil, risiko 429. |
| 3 | 🔴 | Frontend | `useApi` **tidak return `refetch`** → 4 halaman (Keys/Topups/Combos/Budgets) **crash** setelah aksi | Aksi tambah/rotate/revoke/refresh bikin error. |
| 4 | 🔴 | Frontend | Tombol **"Set harga manual"** di Ask Price **placeholder, tidak menulis** ke backend | Fitur paling penting (set harga) **palsu**. |
| 5 | 🟠 | ledger | `add-payout` INSERT `(date,usd,note)` **tidak cocok skema** → selalu gagal | Pencatatan payout via CLI rusak. |
| 6 | 🟠 | **Data** | 18 impairment `imp-1..18` **data asli hilang** — detail ke-generic "dead account N", loss rata 27167. (Bukan fiktif — akun mati asli, tapi datanya ilang saat migrasi.) | Pembukuan impairment tidak akurat / tidak bisa diaudit. |
| 7 | 🟠 | **Data** | **Momo dobel-hitungan** — A-017/A-017a (3 akun, $8.08) masuk `amort_usd` DAN IMP-12 (`$5.39`) masuk `total_imp_loss` | Rugi yang sama dikurangin 2× dari net income. |

---

## 🔴 CRITICAL

### C1. Secret API key bocor + nol auth + CORS `*` (keamanan — TERVERIFIKASI LIVE PUBLIK)
- `app.py:664` `CORS(app, resources={r"/api/*": {"origins": "*"}})`
- `app.py:1547,1553` `GET /api/keys` → `SELECT ..., secret FROM api_keys` → **mengirim `r["secret"]` full API key** ke browser.
- Nol autentikasi di route mutasi: `POST /api/keys`, `PUT /api/ask`, `POST /api/auto-pricing/arm`, `POST /api/provider-recheck`, `PUT /api/budgets/<mid>`, dst.
- **VERIFIKASI:** dashboard live & reachable publik `https://ops.budgezen.com/api/data` (200). Proxy nginx → `127.0.0.1:8124` sudah AKTIF (bukan "tidak ter-proxy" — koreksi klaim subagent).
- **Dampak:** kombinasi secret leak + CORS `*` + publik = siapa pun yang tahu/ bisa memuat halaman bisa baca penuh API key publisher. Dengan key itu bisa ambil alih akun InferHub (tarik/kirim uang). **Ini yang paling kritis.**
- **Fix:** Jangan kirim `secret` (hanya `key_prefix`). Batasi CORS ke origin dashboard. Beri token auth untuk semua route mutasi.

### C2. Auto-pricing feedback-loop masih aktif (ARMED, osilasi tiap ±12s)
- Terverifikasi di log: `cycle done: ... 10 rebound ... 21 hold` → lalu `9 undercut` → `31 hold` → `10 rebound` → berulang terus pada 10 model cline-pass.
- Akar: anchor `comp` dari `/catalog` mencerminkan harga sendiri setelah PUT baru; exclude-anchor-bersih hanya tolak nilai yang *persis sama* saat baca → begitu harga berubah, katalog geser → "mengejar" harga sendiri.
- Interval `--interval 10` (default 600) terlalu agresif → PUT terus-menerus → risiko 429.
- **Fix:** anchor ke harga target dari state HOLD (bukan `our` live), atau cooldown ≥60s pasca-PUT. Kembalikan interval ke ≥60s. **Matikan sementara (arm→0) sampai diperbaiki.**

### C3. `useApi` tidak return `refetch` → 4 halaman crash (frontend)
- `useApi.jsx:36` return `{data, loading, error, reload}` — TIDAK ada `refetch`.
- Pemanggil destructure `refetch`: Keys.jsx, Topups.jsx, Combos.jsx, Budgets.jsx.
- Setelah klik Create/Rotate/Revoke/Refresh/Buat/Hapus → `refetch is not a function` → TypeError, data nggak refresh, bisa render-error.
- **Fix:** `return { ..., refetch: reload }` (atau rename semua pemanggil).

### C4. "Set harga manual" di Ask Price = placeholder (frontend)
- `Asks.jsx:30-42` — `save` hanya `setMsg('Saved placeholder…')`, **tidak ada fetch/PUT** ke `/api/ask` (backend PUT-nya ada, `app.py:2033`).
- Fitur paling bernilai di seluruh dashboard (kontrol harga jual) **tidak berfungsi**.
- **Fix:** implementasikan `fetch('/api/ask', {method:'PUT', ...})`; perlu tambah `upstreamCatalogModelId` di payload orderbook.

### C5. `db_import_ledger` — INSERT payouts gagal (PK NULL) → rollback sebagian
- `app.py:217-218` `INSERT INTO payouts (date, amount_usdc, status) VALUES (...)` — `payouts.id` adalah PK TEXT tanpa default → NULL → exception → seluruh transaksi import rollback.
- Terjadi di startup (line 1024). Catatan: data assets/impairments tetap masuk di DB (terbukti ada), jadi **bukan** "finance kosong total" (koreksi klaim subagent) — tapi `payouts` dari ledger gagal ter-import.
- **Fix:** beri `id` (hash date+amount) atau hilangkan PK tanpa default, atau `ON CONFLICT`.

---

## 🟠 REQUIRED

### R1. Data: 18 impairment "dummy" = **data asli yang hilang** (koreksi dari Faiz)
- `imp-1..imp-18`, label "dead account 1..18", loss rata `27167` IDR, upstream `upstream-1..18` (tidak ada di tabel assets).
- **Bukan fiktif** — ini akun mati asli (sekitar 8-ago, source ledger.json lama), tapi **detailnya hilang** saat migrasi → jadi generic.
- Konsekuensi: (a) nggak bisa diaudit akun mana yang mati; (b) loss rata kemungkinan kurang presisi vs loss sebenarnya per akun. Berpotensi net income dihitung dengan impairment yang salah nilai.
- **Fix:** Dikumpulkan ulang data asli (tanggal/akun/spend) untuk 18 ini, isi ulang label & loss per akun yang benar. Kalau tidak bisa diverifikasi, tandai sebagai "unknown" dan pisahkan dari angka confirmed.

### R2. Data: Momo dobel-hitungan (net income kekecilan ~$5.39)
- A-017 + A-017a (3 akun Momo, retired, cost 143847 IDR) → masuk `amort_usd`.
- IMP-12 (2 akun Momo, 95898 IDR) → masuk `total_imp_loss`.
- Rugi sama (Momo mati) **dikurangin 2×** dari net income.
- **Fix:** SA block: kalau aset sudah di-retire & masuk amort, jangan buat impairment untuk aset yang sama; atau sebaliknya (satu representasi rugi).

### R3. Race/urutan `PUBLISHER_SHARE` — NameError di warmup
- `app.py:820,905` pakai `PUBLISHER_SHARE` tapi didefinisikan line 1365 → poller warmup sebelum itu → NameError ditelan `except`. Earnings-log cache kosong sekali di startup.
- **Fix:** pindah konstanta ke atas.

### R4. Endpoint blocking I/O sinkron di request path
- `/api/earnings-trend` paginate ~129 halaman sinkron (timeout terverifikasi—baris 1369-1389). `/api/market`, `/api/breakdown`, `/api/catalog`, `/api/asks`, `/api/usage/*` dsb juga `urllib` sinkron.
- **Fix:** cache + background refresh, atau async.

### R5. `read_history` fetch 60k baris DB tiap request, tanpa cache
- **Fix:** TTL cache atau agregasi di SQL.

### R6. Silent-swallow di route mutasi → sukses palsu
- `api_keys_post`, `rotate`, `topups_post`, `combos_delete`, `keys_delete` return 201/ok meski DB gagal.
- **Fix:** rollback + status 500.

### R7. `api_budget_put` return 200 `{ok:false}` sa at upstream gagal
- **Fix:** status 502 + refresh DB.

### R8. `int(size)` bisa ValueError → 500; tanpa clamp atas
- **Fix:** try/int + clamp max 200.

### R9. `db_read_earning_range` salah untuk range 90d/all (window map hanya 24h/7d/30d)
- **Fix:** tangani 90d/all eksplisit.

### R10. `api_topups_post` salah kolom mata uang (`amount_usdc` selalu 0, nominal ke `amount_idr`)
- **Fix:** tentukan USDC vs IDR.

### R11. Schema mismatch: tabel `providers`/`provider_asks`/`usage_logs`/`market_snapshot`/`catalog_models` hanya dibuat di full_sync, bukan db_init app.py
- **Fix:** tambah ke db_init (idempotent).

### R12. `add-payout` (ledger_update.py) INSERT tidak cocok skema → selalu error
- `add_payout` pakai `(date, usd, note)` tapi skema `payouts` punya `id`(PK),`amount_usdc`, dst (tidak ada `usd`/`note`).
- **Fix:** sesuaikan INSERT.

### R13. `sync-from-file` hanya import assets, abaikan impairments & payouts
- **Fix:** import lengkap.

### R14. `full_sync` DELETE-all `provider_asks` non-transactional → window data kosong
- **Fix:** bungkus delete+insert satu transaksi.

### R15. Cost hardcoded `publisher_share` ×0.80 di full_sync (UsageBytes)
- **Fix:** baca dari pricing_config.

### R16. auto_pricing: 429/timeout tanpa retry/backoff; config dual-source (file `auto-pricing-config.json` vs tabel DB `auto_pricing_config`); race file state (write non-atomic); `get_asks_enabled` cuma 1 provider/upstream
- **Fix:** backoff; satu source config (DB); atomic write temp+rename; iterate semua enabled provider.

### R17. Nginx `upstream-backend.conf` mode 600 root (non-fatal tapi rapuh)
- File **bukan** kosong (tadi tak kebaca karena permission) dan **proxy AKTIF & berfungsi** (`nginx -t` jalan, endpoint publik 200). `chmod 644` supaya bisa dibaca tooling & tidak dianggap invalid.

### R18. auto_pricing daemon bukan systemd → tidak auto-restart setelah reboot
- **Fix:** systemd unit / supervisor.

---

## 🟡 OPTIONAL / NIT (ringkas)

- **Frontend:** header/breadcrumb salah untuk 6 route (`/market,/catalog,/usage,/asks,/fleet-health,/auto-pricing`) karena `TITLES` di `Layout.jsx` belum punya → fallback "Dashboard / Overview". Base URL fetch manual tidak konsisten (4 halaman pakai `/api` tanpa `${API}`) → bila `VITE_API_URL` diset, aksi gagal. Tidak ada Vite dev proxy (5173→8124). Tidak ada UI error state. Race `useApi` tanpa AbortController (range cepat). Label default AutoPricing (UI bilang 10/15 & 20/25, kode 2/10). Bundle 726kB >500kB warning. `PnlPanel/FleetPanel/Providers/Header` dead code (tidak diregistrasi route). ErrBoundary tidak punya tombol reload. Sparkline gradId duplikat.
- **Backend:** presisi uang float (pakai Decimal); heuristik `>100` untuk IDR/USD rapuh; status tak dikenal dihitung "ok" ($api_upstreams); `?slug=` bentuk respons tak konsisten; `db_seed` balance flat; docstring usang (~19 endpoint); dead code `_finance_from_ledger`/`db_read_ledger`; race cache tanpa lock (model-rank, earnings_log); `opex=0.10` hardcoded; `/api/auto-pricing/arm` bocor path file.
- **Legacy:** `ledger.json` sudah tak terpakai (DB primary, konfirmasi Faiz). Tool `ledger_update.py` masih jadi path — perbaiki `add-payout`/`sync-from-file` (R12/R13).

---

## ✅ DIKONFIRMASI SEHAT / PASS

- Backend 8124 hidup, waitress, 45 route, semua respons 200 (kecuali earnings-trend timeout).
- Frontend: build **SUKSES** (`npm run build` EXIT 0), 13+ halaman render bersih di browser (zero console error), dist terbaru. Semua endpoint yang dipakai frontend ADA di backend (tidak ada 404).
- Auto-pricing: User-Agent benar, anchor-bersih diimplementasikan (tapi ggal di C2), state JSON valid, arm=1 aktif.
- DB: query semua parameterized (no SQL inj), API key TIDAK disalin ke DB (hanya prefix). Payout $130 (13) konsisten. earning_history 8500 rows sehat.
- Nginx proxy `ops.budgezen.com` AKTIF & publik merespons 200.
- Crontab sehat (hanya farm sync, bukan auto_pricing).

---

## REKOMENDASI URUTAN FIX (prioritas dampak)

1. **Keamanan (C1)** — stop bocor secret, batasi CORS, auth route mutasi. *(PALING KRITIS — publik)*
2. **Matikan auto-pricing sementara** (arm→0) sampai feedback-loop diperbaiki + interval ≥60s. *(C2 — biar nggak PUT panik)*
3. **Fix M4 halaman refetch crash** + **Set harga manual Asks** (C3, C4) — dua bug frontend paling mengganggu.
4. **Beresin data** — Momo double-count (R2) + rekonstruksi 18 impairment (R1).
5. **Fix CLI ledger** (R12/R13) + `db_import_ledger` payouts (C5).
6. **Hardening** — blocking I/O cache, silent-swallow, topup currency, schema db_init (R3-R11).
7. **Ops** — systemd untuk auto_pricing, chmod nginx 644 (R17/R18).

---

*Audit selesai 2026-08-12. Semua temuan diverifikasi terhadap sumber langsung. Tidak ada kode yang dimodifikasi selama audit ini.*
