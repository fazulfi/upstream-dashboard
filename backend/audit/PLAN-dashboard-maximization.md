# PLAN — Maksimalisasi Semua 55 Endpoint InferHub ke Dashboard Upstream

**Tujuan:** Memanfaatkan & memaksimalkan SELURUH 55 endpoint InferHub API ke ekosistem dashboard Upstream, sehingga Faiz punya kontrol penuh, visibilitas total, dan otomasi untuk bisnis reseller kapasitas AI-nya.

**Prinsip arsitektur (berlaku penuh):**
- Frontend TIDAK pernah hit InferHub langsung — semua via backend → PostgreSQL → frontend baca DB.
- Full pull (full_sync.py) seeds DB + polling lanjutan (incremental_db_sync) jaga realtime.
- Endpoint mutating (payout, delete, transfer, ask, budget) = **aksi terkontrol** dari UI, dengan konfirmasi + log audit, TIDAK otomatis (kecuali yang aman read-only).
- Halaman baru dibangun konsisten dengan design system "Ledger" yang sudah dikunci.

---

## BAGIAN 1 — Halaman Baru / Upgrade di Dashboard

### 1.1 Halaman KEYS (Manajemen API Key) — dari 4 endpoint
Endpoint: `GET /keys`, `POST /keys`, `POST /keys/{id}/rotate`, `DELETE /keys/{id}`
- Tabel key: id, name, prefix, scopes, createdAt, lastUsedAt, expiresAt, replacedById
- Aksi: create key (modal name), rotate (tampil peringatan grace 24h), revoke (konfirmasi)
- Badge status: active / rotating / expired (dari expiresAt)
- ⚠️ Secret hanya tampil sekali saat create/rotate — UI wajib copy-once

### 1.2 Halaman TOPUPS (Pembayaran & Rekonsiliasi) — 4 endpoint
Endpoint: `GET /topups`, `POST /topups`, `GET /topups/{key}/payment`, `POST /topups/{key}/refresh`
- Tabel riwayat top-up: amount, metode (QRIS/PayPal), status, created
- Flow buat top-up baru: modal QR code (render qrSvg)
- Auto-refresh status (poll refresh) + notifikasi saat paid
- Rekonsiliasi: deteksi paid → saldo naik

### 1.3 Halaman BUDGETS & MARGIN (Pricing Engine) — 5 endpoint 🔥
Endpoint: `GET /budgets`, `GET /budgets/aliases`, `PUT /budgets/aliases`, `PUT /budgets/{modelId}`, `DELETE /budgets/{modelId}`
- Tabel margin per model: official price, marketMinAsk, current budget, minDiscountPct
- Edit budget inline (set/clear cap)
- Set margin seragam per alias (1 klik → semua upstream)
- ⚠️ Kunci = `upstreamCatalogModelId` (bukan modelId)
- **Ini alat PALING berharga untuk jaga margin jualan Faiz**

### 1.4 Halaman COMBOS (Bundle Produk) — 4 endpoint
Endpoint: `GET /combos`, `POST /combos`, `GET /combos/available-models`, `DELETE /combos/{id}`
- Tabel combo: name, slug, members (multi-provider), max budget
- Create combo: pilih dari available-models (multi-select), set budget
- ⚠️ POST body kosong → follow-up GET utk id

### 1.5 Halaman INFERENCE (Console LLM / Uji Model) — 5 endpoint
Endpoint: `GET /v1/models`, `GET /v1/me/usage`, `POST /v1/chat/completions`
- Panel uji coba model (chat completions) langsung dari dashboard — smoke-test fleet
- Daftar 132 model + harga real-time (pricing)
- Usage konsumen: balance, spend window, top model

### 1.6 Halaman PROFILE & SETTINGS — 2 endpoint
Endpoint: `GET /publisher/profile`, `GET /pricing/config`
- Tampilkan status publisher, rule monetisasi (cap 50%, fee 20%, share 80%)
- (PUT profile dokumentasi saja)

### 1.7 Upgrade halaman yang ada dengan endpoint baru:
- **Dashboard**: sudah pakai me/earnings/withdrawals — bisa tambah `fiat_pendings` clearer
- **Upstreams**: tambah filter per `apiKeyCheckStatus` (invalid/ok), aksi recheck per provider
- **Analytics**: sudah publisher — tambah cache-stats panel (efisiensi)
- **P&L**: sudah lengkap
- **Earnings**: sudah punya usage logs ticker

---

## BAGIAN 2 — OTOMASI (background, aman, opt-in)

### 2.1 Auto-recheck Fleet (revenue protection) — dari `POST /publisher/providers/{id}/recheck`
- Poll `/publisher/providers`, cari `apiKeyCheckStatus:invalid`
- Recheck tiap 15-30 menit → yang balik `ok` otomatis aktif lagi
- Log: berapa key di-recheck, berapa pulih

### 2.2 Monitoring Drain & Alert — dari `GET /publisher/providers/usage-windows` (1 request batch)
- Poll 5-15 menit, deteksi window `credit` usedPct ≥90%, `reactive_429`, resetAt mendekat
- Alert ke dashboard (badge merah) + catatan provider mana harus di-reset/disable
- Read-only, aman

### 2.3 Pricing Engine Otomatis — dari `PUT /budgets/aliases` + asks
- Baca asks per model (`avgPriceRequests` = volume demand, `cheapestActivePct`, `maxAskPct`)
- Rekomendasi: naikkan ask model underutilized (~1%) mendekati cap 50% utk model demand tinggi
- **Manual-approve dulu** (jangan auto-set harga — risiko ban)
- Fitur: "show saya model mana yang under-priced vs demand" (decision support)

### 2.4 Payout Ready Detector — dari `GET /publisher/earnings` + `withdrawals/destinations`
- Monitor saldo ≥ threshold ($10) + dest verified
- Notifikasi "siap payout" + satu-klik buka flow OTP
- **Manual approve di langkah terakhir** (OTP dari email/telegram)

### 2.5 Payment Reconciliation — dari `POST /topups/{key}/refresh`
- Auto-detect topup paid → notifikasi saldo konsumen naik

### 2.6 Data Export / Backup Harian — dari `GET /me/data-export`
- Cron harian snapshot akun → simpan ke shared-memory utk backup

---

## BAGIAN 3 — PRIORITAS IMPLEMENTASI (bertahap)

### Fase 1 — Paling berdampak & read-only (aman, cepat):
1. **Halaman BUDGETS & MARGIN** (pricing engine) — kontrol margin, nilai maksimal
2. **Halaman KEYS** (manajemen) — keamanan & provisioning
3. **Monitoring Drain** (otomasi read-only) — lindungi revenue
4. **Auto-recheck Fleet** (otomasi) — kapasitas selalu sehat
5. **Payout Ready Detector** (notifikasi)

### Fase 2 — operational:
6. Halaman **TOPUPS** (rekonsiliasi pembayaran)
7. Halaman **COMBOS** (bundle produk)
8. **Pricing Decision Support** (rekomendasi ask)

### Fase 3 — advanced:
9. Halaman **INFERENCE** (console uji model)
10. **Payment Reconciliation** otomatis
11. **Data Export backup** harian
12. Halaman **PROFILE/Settings**

---

## BAGIAN 4 — STRUKTUR TEKNIS

- **DB tabel baru**: api_keys, topups, budgets, budgets_aliases, combos, combos_models, pricing_config, provider_asks (ada), usage_fleet
- **full_sync.py**: tambah sync keys/topups/budgets/combos/pricing/catalog
- **incremental_db_sync**: refresh keys/topups/budgets/combos + usage-windows drain
- **Backend endpoint baru** (semua baca DB):
  - `/api/keys` (GET create rotate revoke)
  - `/api/topups` (GET create refresh payment)
  - `/api/budgets` (GET set aliases clear)
  - `/api/combos` (GET create delete models)
  - `/api/inference` (GET models usage, POST chat)
  - `/api/drain` (GET alert status)
  - `/api/recheck` (POST per provider)
  - `/api/payout` (GET availability, POST request)
- **Otomasi**: cron/background di poller — auto-recheck (15-30m), drain monitor (5-15m), payout detector, payment reconcile
- **Frontend**: route baru + panel + modal, konsisten design "Ledger"

---

## RESIKO & KONTROL
- Semua aksi mutating (payout, delete, transfer, set ask, set budget real) = **konfirmasi + log** + optional passcode
- TIDAK ada otomasi yang menghabiskan uang tanpa persetujuan (auto-reset-credit = dilarang aktif)
- Endpoint destruktif (DELETE /me, DELETE providers/invalid) tidak pernah dipicu dari UI
- Sensitif endpoint butuh aksi manual Faiz (OTP payout)

---

**Status: DRAFT untuk persetujuan Faiz. Belum ada implementasi.**
