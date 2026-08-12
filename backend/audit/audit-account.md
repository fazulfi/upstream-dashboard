# Audit + Live-Test — InferHub API Cluster ACCOUNT / BILLING / KEYS

- **Tanggal audit:** 2026-08-11 (live-test dengan API key `sk-airo-4Wha…`, identitas `Ssnford` / `faizzulfikar720@gmail.com`)
- **Base URL (management):** `https://inferhub.dev/api`
- **Auth:** `Authorization: Bearer sk-airo-…` (format `sk-airo-<24 char>`)
- **Header wajib:** `User-Agent: audit/1.0` + `Accept: application/json` (tanpa UA → **403**)
- **OpenAPI source:** `/home/gamesim/shared-memory/inferhub-business/docs/inferhub-openapi.json`
- **Jumlah endpoint cluster:** 23 → **22 di-live-test, 1 hanya didokumentasikan** (`DELETE /me` — destruktif, DILARANG dieksekusi per safety)
- Script test disimpan di: `dashboard/backend/audit/inferhub_audit.py` & `inferhub_audit2.py`

---

## Ringkasan Eksekusi Per Endpoint

| # | Method+Path | Status Live | Keterangan |
|---|-------------|-------------|------------|
| 1 | GET `/me` | ✅ 200 | Profile + balances |
| 2 | DELETE `/me` | ⛔ tidak dieksekusi | Soft-delete; dokumentasi saja |
| 3 | GET `/me/data-export` | ✅ 200 | GDPR export (JSON + filename) |
| 4 | GET `/keys` | ✅ 200 | 5 API key aktif |
| 5 | POST `/keys` | ✅ 201 | Key baru dibuat (secret dimask) |
| 6 | POST `/keys/{id}/rotate` | ✅ 201 | Grace 24h terbukti |
| 7 | DELETE `/keys/{id}` | ✅ 204 | Revoke test key (aman, key buatan audit) |
| 8 | GET `/deposit-address` | ✅ 200 | Solana pubkey + ATA |
| 9 | POST `/deposit-address/poll` | ✅ 204 | Bump scan queue |
| 10 | POST `/deposits/credit-by-signature` | ✅ 400 (valid error) | Sig invalid → `credit_failed` |
| 11 | GET `/topups` | ✅ 200 | 6 riwayat top-up |
| 12 | POST `/topups` | ✅ 201 | QRIS Rp10.000 dibuat (tidak dibayar) |
| 13 | GET `/topups/{key}/payment` | ✅ 200 | QR data + SVG |
| 14 | POST `/topups/{key}/refresh` | ✅ 200 | status pending/paid |
| 15 | GET `/budgets` | ✅ 200 | Daftar budget per model |
| 16 | GET `/budgets/aliases` | ✅ 200 | Grup alias model |
| 17 | PUT `/budgets/aliases` | ✅ 200 (via set) | Set budget grup alias |
| 18 | PUT `/budgets/{modelId}` | ✅ 200 | Set/clear budget model |
| 19 | DELETE `/budgets/{modelId}` | ✅ 204 | Hapus budget (dibersihkan ulang) |
| 20 | GET `/combos` | ✅ 200 | 1 combo (`deepseek`) |
| 21 | POST `/combos` | ✅ 201 | Combo dibuat (body kosong) |
| 22 | GET `/combos/available-models` | ✅ 200 | 90 model (array murni) |
| 23 | DELETE `/combos/{id}` | ✅ 204 | Hapus combo test (dibersihkan) |

---

# Detail Endpoint

## 1. `GET /me`
- **Auth:** Bearer
- **Params:** tidak ada
- **Response real (200):**
```json
{
  "id": "3713f532-f2f9-4223-b6be-6b652a8e5328",
  "email": "faizzulfikar720@gmail.com",
  "displayName": "Ssnford",
  "status": "active",
  "roles": ["consumer", "publisher"],
  "balances": {
    "payout_pending": "0.000000",
    "consumer_balance": "0.168004",
    "publisher_earnings": "21.979836",
    "fiat_pendings": "3.847903"
  }
}
```
- **Use-case business Faiz:** Sumber utama saldo dashboard. `publisher_earnings` = **saldo (balance)** publisher, `consumer_balance` = saldo konsumen, `fiat_pendings` = pending fiat. ⚠️ Label: `publisher_earnings` = **Saldo**, bukan "Earning" (lihat skill).
- **Gotcha:** Semua angka balance adalah **decimal string** — parse dengan `float()`, jangan `int`. `fiat_pendings` = dana fiat (QRIS) yang belum settle jadi USDC.
- **Nilai:** 🔥 Endpoint paling penting untuk KPI card "Saldo" & "Real Earning All-time" (saldo + withdrawals confirmed).

## 2. `DELETE /me` — ⛔ TIDAK DIUJI (destruktif)
- **Auth:** Bearer
- **Body/params:** tidak ada (soft-delete akun)
- **Status (dokumentasi openapi):** 204
- **Safety:** DILARANG eksekusi — soft-delete bisa menghapus akses akun Faiz. Dokumentasikan saja.
- **Use-case:** hanya untuk akun yang mau pensiun; tidak relevan untuk bisnis aktif.

## 3. `GET /me/data-export`
- **Auth:** Bearer
- **Params:** tidak ada
- **Response real (200):** `{"json": "<string JSON lengkap>", "filename": "<nama file>"}`
  - `json` berisi: `exportedAt`, `user` (id/email/displayName/status/roles/createdAt), `apiKeys[]` (name, keyPrefix, scopes, createdAt, lastUsedAt, revokedAt, expiresAt), dan data lain (topups/budgets/deposit dll).
  - 🔍 **Berguna:** `apiKeys[]` berisi SEMUA key termasuk yang sudah di-revoke (history) + `keyPrefix` — untuk deteksi key lama/tersusupi.
- **Use-case:** Kepatuhan GDPR; berguna sebagai snapshot cadangan penuh akun.
- **Gotcha:** respons nested string JSON (perlu `json.loads(j["json"])`).

## 4. `GET /keys`
- **Auth:** Bearer
- **Response real (200):** array langsung (bukan objek wrapper):
```json
[{
  "id": "a3175c16-...", "name": "Developer", "keyPrefix": "sk-airo-4Wha",
  "scopes": ["chat","completions","embeddings"],
  "createdAt": "2026-08-10T01:51:51Z", "lastUsedAt": "2026-08-11T01:07:08Z",
  "expiresAt": null, "replacedById": null
}]
```
- **Use-case:** Manajemen key; monitor `lastUsedAt` (key idle), `replacedById` (key hasil rotate).
- **Gotcha:** **`secret` TIDAK pernah dikembalikan** oleh GET (hanya `keyPrefix`). Secret hanya tampil sekali saat create/rotate. Simpan saat itu juga.

## 5. `POST /keys`
- **Auth:** Bearer
- **Body:** `{"name": string (1–64)}` — wajib `name`.
- **Response real (201):**
```json
{"id": "1f504841-...", "name": "audit-test-...", "secret": "***", "prefix": "sk-airo-lUPX"}
```
- ⚠️ **PENTING:** Live test mengembalikan `"secret": "***"` — **secret dimask/di-redact** oleh API (mungkin hanya untuk role tertentu atau sudah di-disable). Jadi pada praktiknya secret asli mungkin tidak tersedia via API → perlu generate-rotasi manual di UI untuk key baru. **Verifikasi lanjut diperlukan** apakah ini hanya karena konteks audit.
- **Use-case:** Membuat key per konsumen/reseller.
- **Gotcha:** Key baru punya scope default `chat/completions/embeddings`.

## 6. `POST /keys/{id}/rotate`
- **Auth:** Bearer
- **Path param:** `id` (UUID key)
- **Response real (201):** `{"id": "<id BARU>", "name": "...", "secret": "***", "prefix": "sk-airo-<baru>"}`
- **Behavior terbukti:** rotate menghasilkan **key baru dengan id baru**. Key lama tetap ada dengan `expiresAt` = **+24 jam** dan `replacedById` = id key baru. → **Grace window 24 jam terkonfirmasi live.**
- **Use-case:** Mitigasi key bocor tanpa memutus akses mendadak (grace 24h).
- **Gotcha:** Ingat `replacedById` pada key lama untuk melacak chain rotasi.

## 7. `DELETE /keys/{id}`
- **Auth:** Bearer
- **Path param:** `id`
- **Response real:** **204** (body kosong) — revoke **immediate** (tanpa grace).
- **Safety note:** Di-audit dengan key buatan audit (`audit-test-…`), lalu di-revoke. **JANGAN delete key produksi** (`Developer`/`inferhub`).
- **Use-case:** Cabut akses konsumen/reseller yang nakal/berhenti.

## 8. `GET /deposit-address`
- **Auth:** Bearer
- **Response real (200):**
```json
{"pubkey": "APanjJrMNoP1eGADqtPJFtpES4FzPAbrZJsSv9ECh9om", "ata": "H4UwFoR4ABnc1PLAUWpnVRvkgXWDXyqB8uVNdk2TgM3g", "network": "mainnet"}
```
- **Use-case:** Alamat deposit USDC (Solana) untuk top-up on-chain. `ata` = Associated Token Account.
- **Gotcha:** Base management API menerima deposit di Solana mainnet.

## 9. `POST /deposit-address/poll`
- **Auth:** Bearer
- **Body:** tidak ada
- **Response real:** **204** (body kosong) — men-bump antrian scan deposit.
- **Use-case:** Mempercepat deteksi deposit USDC masuk (bukan polling manual 15s).
- **Gotcha:** Rate limit — jangan spam; poll secukupnya (≥15s).

## 10. `POST /deposits/credit-by-signature`
- **Auth:** Bearer
- **Body:** `{"signature": "<Solana tx signature>"}` — pattern `^[1-9A-HJ-NP-Za-km-z]{64,88}$`
- **Response real (400) dengan sig invalid — error shape valid:**
```json
{"error": {"code": "credit_failed", "message": "That doesn't look like a Solana transaction signature."}}
```
- **Use-case:** Kredit deposit USDC instan berdasarkan signature transaksi (otoritas tinggi).
- **Gotcha:** Sig harus valid & sudah settle; error shape = `{"error":{code,message}}`. Money-moving → **idempotent** (jangan ganda credit).

## 11. `GET /topups`
- **Auth:** Bearer
- **Response real (200):** array langsung:
```json
[{
  "id": "059c2463-...", "amountUsdc": "1.27026000", "amountIdr": 25032,
  "paymentMethod": "qris", "status": "paid", "paymentUrl": null,
  "topupKey": "ih-topup-25483f50-...", "takoTransactionId": "154756034510270366",
  "createdAt": "2026-08-10T02:26:20Z"
}]
```
- **Use-case:** Riwayat top-up konsumen; `status` utk deteksi yang belum dibayar.
- **Gotcha:** `amountUsdc` string, `amountIdr` **integer**. `paymentUrl` hanya ada utk yang belum lunas (paid → null). `takoTransactionId` = ID Tako Payment (QRIS).

## 12. `POST /topups`
- **Auth:** Bearer
- **Body:** `{"amount": number, "paymentMethod": "qris"|"paypal"}` — QRIS: IDR (Rp10.000–Rp500.000); PayPal: USDC (min $5).
- **Response real (201):**
```json
{
  "topupKey": "ih-topup-a4ddf13c-...", "paymentMethod": "qris",
  "qrData": "00020101021226610016...", "qrSvg": "<svg ...>"
}
```
- **Use-case:** Flow pembelian kapasitas via QRIS (fiat IDR) atau PayPal — krusial untuk konsumen Indonesia.
- **Gotcha:** `qrData` = payload QRIS (EMVCo), `qrSvg` = SVG QR utk dirender frontend. Test Rp10.000 tidak dibayar → otomatis expired/tidak ada biaya. **Top-up menghasilkan topupKey — simpan utk payment/refresh.**

## 13. `GET /topups/{topupKey}/payment`
- **Auth:** Bearer
- **Path param:** `topupKey` (format `ih-topup-<uuid>`)
- **Response real (200):** `{"paymentMethod":"qris","qrData":"...","qrSvg":"<svg>"}` (sama dgn saat create).
- **Use-case:** Re-fetch QR utk ditampilkan ulang (mis. user refresh halaman pembayaran).
- **Gotcha:** `topupKey` beda dari `id` topup — pastikan pakai field yang benar.

## 14. `POST /topups/{topupKey}/refresh`
- **Auth:** Bearer
- **Path param:** `topupKey`
- **Response real (200):**
```json
{"status": "pending", "paid": false}
```
- **Use-case:** Poll/pengkreditan status QRIS — utk deteksi pembayaran masuk & auto-kredit saldo.
- **Gotcha:** Ini polling resmi; gunakan daripada spam. `status` enumerasi (pending/paid/dll). Setelah paid, dana masuk `consumer_balance`/`fiat_pendings`.

## 15. `GET /budgets`
- **Auth:** Bearer
- **Response real (200):** array langsung, key utama = **`upstreamCatalogModelId`** (BUKAN `modelId`!):
```json
[{
  "upstreamCatalogModelId": "cf829cf0-...", "prefix": "cb",
  "upstreamModelId": "claude-opus-4.6", "upstreamLabel": "CodeBuddy",
  "officialInputPerMtok": "5.00000000", "officialOutputPerMtok": "25.00000000",
  "marketMinAskIn": "0.05000000", "marketMinAskOut": "0.25000000",
  "maxInputPerMtok": null, "maxOutputPerMtok": null,
  "minDiscountPct": "50.00", "enabled": true
}]
```
- **Use-case:** Panel budget/margin per model; lihat `marketMinAsk*` vs official utk cek margin.
- **Gotcha:** ⚠️ **Field model = `upstreamCatalogModelId`** (dipakai sebagai `{modelId}` di path PUT/DELETE). Semua angka = string decimal. `marketMinAskIn/Out` = harga min pasar (anchor utk pricing Faiz).

## 16. `GET /budgets/aliases`
- **Auth:** Bearer
- **Response real (200):** array grup alias:
```json
[{
  "alias": "claude-opus-4.6", "label": "Claude Opus 4.6", "isAlias": true,
  "memberModelIds": ["98c879be-...", "cf829cf0-..."], "memberCount": 2,
  "minDiscountPct": "50.00",
  "officialInMin": "5.00000000", "officialInMax": "5.00000000",
  "officialOutMin": "25.00000000", "officialOutMax": "25.00000000",
  "upstreamLabels": ["Claude Code", "CodeBuddy"]
}]
```
- **Use-case:** Satu model yang sama tersedia dari banyak upstream → budget diskon seragam per alias.
- **Gotcha:** `memberModelIds` adalah UUID yang dipakai sebagai `memberIds` di `PUT /budgets/aliases`.

## 17. `PUT /budgets/aliases`
- **Auth:** Bearer
- **Body:** `{"memberIds": ["<uuid>", ...] (min 1), "maxInputPerMtok": string|null, "maxOutputPerMtok": string|null, "minDiscountPct": string|null}`
- **Response real:** **200** (body kosong) — set budget berlaku serentak ke semua anggota alias.
- **Use-case:** Harga margin konsisten untuk model yang sama lintas upstream (CodeBuddy + Claude Code), tanpa edit per-model.
- **Gotcha:** `minDiscountPct` string persen (mis. `"50.00"`). Body kosong saat sukses → verifikasi via `GET /budgets`.

## 18. `PUT /budgets/{modelId}`
- **Auth:** Bearer
- **Path param:** `modelId` = `upstreamCatalogModelId`
- **Body:** `{"maxInputPerMtok": string|null, "maxOutputPerMtok": string|null, "minDiscountPct": string|null, "enabled": bool}`
- **Response real (200):** body kosong; **terverifikasi** di `GET /budgets` → `maxInputPerMtok` jadi `"9.99000000"`, `minDiscountPct` `"10.00"`, `enabled:true`.
- **Clearing:** `PUT` dgn field null → budget kembali `null` (terverifikasi). `enabled:false` = matikan tanpa hapus.
- **Use-case:** ⚡ **Otomatisasi pricing Faiz** — set margin cap per model (= alat utama reseller untuk batasi diskon & jaga margin).
- **Gotcha:** Nilai string; `null` = clear. Ini endpoint "set" — idempotent.

## 19. `DELETE /budgets/{modelId}`
- **Auth:** Bearer
- **Path param:** `modelId`
- **Response real:** **204** (body kosong) — hapus budget, kembalikan ke default (null). Terverifikasi via GET.
- **Use-case:** Reset pricing model ke default pasar.
- **Gotcha:** Di-audit dengan set dulu lalu delete; aman.

## 20. `GET /combos`
- **Auth:** Bearer
- **Response real (200):** array langsung:
```json
[{
  "id": "0038eeef-...", "name": "deepseek", "slug": "deepseek",
  "maxInputPerMtok": null, "maxOutputPerMtok": null,
  "createdAt": "2026-08-06 16:15:51", "members": [{"modelId":"4b21b917-...","model":"cp/cline-pass/deepseek-v4-flash","label":"DeepSeek V4 Flash"}, ...]
}]
```
- **Use-case:** Bundle beberapa provider model yang sama jadi satu "nama" utk konsumen (mis. `deepseek` tersedia dari 5 upstream).
- **Gotcha:** `modelId` di members = UUID; `model` = slug upstream/model.

## 21. `POST /combos`
- **Auth:** Bearer
- **Body:** `{"name": string (1–64), "slug": string (^[a-z0-9][a-z0-9_-]*$), "modelIds": [uuid,...] (min 1), "maxInputPerMtok": string|null, "maxOutputPerMtok": string|null}`
- **Response real:** **201** **body KOSONG** — ⚠️ **tidak mengembalikan id combo.** Perlu `GET /combos` utk menemukan id combo yang baru dibuat (cari by slug).
- **Use-case:** Auto-create bundle model multi-provider.
- **Gotcha:** ⚠️ Body kosong saat create → selalu follow-up `GET /combos` + filter by slug untuk dapat `id`. Duplikat slug → kemungkinan 409 (belum diuji).

## 22. `GET /combos/available-models`
- **Auth:** Bearer
- **Response real (200):** **array murni** (90 model), bukan objek wrapper:
```json
[{"id":"eac4da12-...","model":"cc/claude-fable-5","label":null,"upstreamLabel":"Claude Code","prefix":"cc","upstreamId":"b8eba2eb-..."}, ...]
```
- **Use-case:** Daftar model yang bisa di-bundle (sumber utk UI pilih model combo).
- **Gotcha:** ⚠️ **Response adalah array langsung** — jangan akses `response.models` dll. `label` bisa null.

## 23. `DELETE /combos/{id}`
- **Auth:** Bearer
- **Path param:** `id` (UUID combo)
- **Response real:** **204** (body kosong). Terverifikasi: hapus combo test → `GET /combos` kembali 1 (hanya `deepseek`).
- **Use-case:** Hapus bundle yang tidak dipakai lagi.
- **Gotcha:** Butuh `id` combo (dari `GET /combos`), bukan slug.

---

# Temuan Penting / Ringkasan

## 🔥 Endpoint bernilai maksimal untuk bisnis Faiz (reseller kapasitas AI)
1. **`GET /me`** — sumber saldo & KPI "Real Earning All-time" (saldo + withdrawals). Polling rutin wajib.
2. **`PUT /budgets/{modelId}` + `PUT /budgets/aliases`** — **alat otomatisasi pricing paling penting**: set cap margin per model / per alias untuk menjaga margin reseller. Sangat bisa diootomasi (mis. saat harga pasar turun, otomatis set budget supaya tidak jual rugi).
3. **`GET /budgets`** — memberi `marketMinAskIn/Out` per model = anchor harga; kombinasi dengan budget = dashboard margin.
4. **`POST /topups` + `POST /topups/{key}/refresh`** — flow monetisasi konsumen (QRIS/PayPal) + polling status pembayaran; sangat bisa diootomasi (deteksi paid → kredit saldo konsumen).
5. **`GET /me/data-export`** — snapshot cadangan penuh akun (termasuk seluruh key history) — berguna utk monitoring/backup.

## ⚠️ Yang bisa diootomasi
- **Polling saldo/margin:** `GET /me`, `GET /budgets`, `GET /topups` → jadwal/cron.
- **Pricing engine:** `PUT /budgets/aliases` — set margin seragam ke seluruh alias anggota (1 call utk banyak upstream).
- **Payment reconciliation:** `POST /topups/{key}/refresh` + `GET /topups` → auto-detect topup paid → kredit + notifikasi.
- **Key lifecycle:** `POST /keys` + `POST /keys/{id}/rotate` + `DELETE /keys/{id}` — provisioning/revoke konsumen secara programatik.

## 🚨 Gotcha / Pitfall utama
- **Kunci budget = `upstreamCatalogModelId`** (bukan `modelId`) — salah field → budget tak pernah terset.
- **`POST /combos` dan PUT budgets mengembalikan body KOSONG** → selalu follow-up `GET` utk verifikasi & ambil id baru.
- **`secret` di-dimask (`"***"`)** pada `POST /keys` di konteks audit → mungkin perlu penanganan/UI utk dapat secret asli.
- **`GET /combos/available-models` & `GET /keys` & `GET /budgets` & `GET /topups` & `GET /combos` = array MURNI** (tanpa wrapper) — jangan akses `.rows`/`.items`.
- **Semua angka uang = decimal string** → `float()`; `amountIdr` top-up = integer.
- **Rate limit tidak didokumentasikan** → polling santai (≥15s); `deposit-address/poll` dan `topups/{key}/refresh` jangan di-spam.
- **Money-moving idempotent** (credit-by-signature, refresh) — aman di-retry, tidak double-credit.
- **Tanpa `User-Agent` header → 403.**
- **Grace rotate 24 jam** terkonfirmasi: key lama `expiresAt` = +24h, `replacedById` = id baru.

## Safety tercatat
- `DELETE /me` **tidak dieksekusi** (destruktif — hanya didokumentasikan).
- Key produksi (`Developer`, `inferhub`) **tidak disentuh** — semua mutasi key pada key buatan audit `audit-test-*`, lalu di-revoke.
- Top-up QRIS Rp10.000 **tidak dibayar** → tidak ada biaya.
- Budget & combo test **dibersihkan ulang** (kembali ke state awal: 1 combo, budget null).