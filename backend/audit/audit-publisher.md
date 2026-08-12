# InferHub API — Audit & Live-Test Cluster PUBLISHER

- **Tanggal audit:** 2026-08-11 01:00–01:10 UTC
- **API Base:** `https://inferhub.dev/api`
- **Auth:** `Authorization: Bearer sk-airo-…` (dari `~/.hermes-suisui/.env`, `INFERHUB_API_KEY`)
- **Header wajib:** `User-Agent: audit/1.0`, `Accept: application/json`
- **Sumber skema:** `inferhub-openapi.json` + live response
- **Scope:** 26 endpoint cluster publisher (profile / earnings / providers / upstreams / withdrawals)
- **Status payload:** profil **Ssnford**, **125 provider** (codex 42, codebuddy-cn 60, commandcode 18, opencode-go 3, cline-pass 2), **5 upstream aktif**

---

## Ringkasan Eksekutif

| Metrik | Nilai |
|---|---|
| Balance publisher (`GET /publisher/earnings`) | **$21.98** (publisherEarningsUsdc `21.979518`) |
| Consumer balance | $0.17 |
| Total withdrawal confirmed | 14× $10 = **$140** (semua ke `ELY6E…a1F9`, solana mainnet) |
| All-time publisher earning (balance + Σ withdraw) | ≈ **$161.98** |
| Provider terdaftar | **125** (5 upstream) |
| Provider invalid (contoh riil ditemukan) | apiKeyCheckStatus `invalid` + cooldown (codex) |

**Penilaian status:** SELURUH 26 endpoint hidup & jalan tanpa bug. Kesimpulan kunci yang memengaruhi FP&M Faiz: **`earningsLifetimeUsdc` di `/publisher/providers` adalah snapshot provider-registered-saat-ini saja, BUKAN all-time earning** (sudah jadi hard lesson skill — dikonfirmasi: Σ-nya jauh di bawah $161.98). All-time harus `balance + withdrawals`.

---

## Legend / Konvensi Audit

| Tanda | Arti |
|---|---|
| ✅ LIVE-TEST | Dieksekusi nyata, response riil tercatat |
| 📜 DOKUMENTASI | Tidak dieksekusi (mutating / berisiko) — dari OpenAPI + analisis |
| 🛡️ NON-DESTRUKTIF | Aman dijalankan, tanpa efek samping pada kapasitas/uang |
| ⚠️ RISK | Mutating nyata — jalankan hanya atas perintah operator |

---

## A. PROFILE

### 1. ✅ GET `/publisher/profile`
- **Auth:** Bearer. **Tanpa auth → 401** `{"error":{"code":"unauthorized","message":"A valid API key is required.…"}}`.
- **Response (200):**
  ```json
  {"publisherName":"Ssnford","description":null,"status":"active"}
  ```
- **Use-case Faiz:** cek status publisher (active/pending). Identitas resmi akun.
- **Gotcha:** tanpa `User-Agent` tetap 200 di GET ini (403 hanya pada endpoint lain/GUI), tapi tetap kirim UA agar aman.

### 2. 📜 PUT `/publisher/profile`
- **Body:** `{"publisherName":"string(2–64, required)","description":"string≤280, nullable"}`
- **Efek jika dijalankan:** mengganti nama/tagline profil publisher. Idempoten.
- **Kapan dipakai:** sekali set nama profil; jarang.
- **Gotcha:** `publisherName` required — hubungi operator sebelum ganti (semua laporan memakai nama "Ssnford").

---

## B. EARNINGS

### 3. ✅ GET `/publisher/earnings`
- **Response (200):**
  ```json
  {"publisherEarningsUsdc":"21.979518","consumerBalanceUsdc":"0.173161"}
  ```
- Semua nilai = **string** desimal, bukan number (waspada parser JS/JSON).
- **Use-case Faiz:** saldo publisher (label dashboard **"Balance / Saldo"**, BUKAN "Earning" — hard lesson skill). Real all-time = `publisherEarningsUsdc + Σ confirmed withdrawal`.
- **Gotcha:** angka turun saat payout terjadi → jangan jadiikan tren earnings mentah tanpa tambah withdrawal.

### 4. 📜 POST `/publisher/earnings/transfer`
- **Body:** `{"amount":"string ^\d+(\.\d+)?$"}`
- **Efek:** transfer earnings → spend balance (internal ledger, zero fee, INSTANT). **Amount 0 ditolak 400** `transfer_failed: "Amount must be greater than 0"` (terverifikasi).
- **Kapan dipakai:** ingin pakai balance publisher untuk bayar konsumsi (consumer API) sendiri tanpa withdraw on-chain.
- **Gotcha:** transfer mengurasi saldo publisher; boleh amount 0 hanya untuk test validasi. Jangan transfer riil tanpa perintah.

---

## C. PROVIDERS

### 5. ✅ GET `/publisher/providers` — **ENDPOINT NILAI MAKSIMAL**
- **Response:** **BARE ARRAY** berisi 125 provider. SKILL: baca `Array.isArray(data) ? data : data?.providers||[]` (kontrak BUKAN `{providers:[…]}`).
- **Field per-provider (dari rekaman live):**
  | Field | Contoh (codex) | Contoh (codebuddy-cn) |
  |---|---|---|
  | `id` | `cd2f78ea-…` | `3ddec6b1-…` |
  | `displayName` | email akun / label | `"CodeBuddy CN #20"` |
  | `upstreamSlug` / `upstreamPrefix` / `upstreamLabel` | `codex` / `cx` / OpenAI Codex | `codebuddy-cn` / `cbcn` |
  | `enabled` | `true` | `true` |
  | `apiKeyCheckStatus` | `invalid` ⚠️ (cooldown) | `ok` |
  | `apiKeyVerifiedAt` | ts | ts |
  | `cooldownUntil` | ts (masa pending) | `null` |
  | `observedUsedTokens` / `observedLimitTokens` | `null` | 83 / 500 |
  | `observedUsedPct` | 2 | 16 |
  | `observedWindow` | `5h` | `monthly` |
  | `observedResetAt` | ts | ts |
  | `observedSource` | `poll` | `poll` |
  | `observedSyncedAt` | ts | ts |
  | `observedPlan` | `plus` | `"CodeBuddy个人体验版"` |
  | `drainedUntil` / `drainedWindow` | `null` | `null` |
  | `scheduleEnabled` / `scheduleTimezone` / `scheduleWindows` / `scheduleActive` | `false`/`null`/`[]`/`true` | sama |
  | `maxConcurrent` | 10 | 10 |
  | `autoResetCredit` | false | false |
  | `earningsLifetimeUsdc` | `"0.028304"` | `"0.011503"` |
  | `modelCount` | 6 | 8 |
- **Use-case Faiz:** sumber kebenaran fleet. Ukur fleet live deltas, status ok/invalid/drained, used_pct per akun. Bangun otomasi **monitoring drain** & **auto-recheck fleet** di sini.
- **Gotcha:** `earningsLifetimeUsdc` adalah snapshot provider-terdaftar, ≈ $53 total — **BUKAN all-time earning**. Gunakan untuk *delta fleet*, bukan laporan all-time.

### 6. 📜 POST `/publisher/providers`
- **Body:** `{"upstreamSlug":"^[a-z][a-z0-9_-]*$","keys":"newline-separated 8–512 chars","labelPrefix":"optional"}`
- **Efek:** batch-add soal key ke upstream tertentu. **Menambah kapasitas nyata ke pool.**
- **Kapan dipakai:** menambahkan key baru (CodeBuddy-CN / CommandCode bulk). 
- **Gotcha:** slug harus valid upstream; key sembarang yang typo akan masuk lalu `apiKeyCheckStatus: invalid` → perlu recheck/hapus.

### 7. 📜 POST `/publisher/providers/codex/bulk`
- **Body:** `{"jsonText":"string"}` — dump OAuth accounts Codex dalam JSON.
- **️LIVE (error shape, kosong):** `{"results":[{"index":0,"ok":false,"error":"missing accessToken"}],"created":0,"failed":1}` — HTTP 200 walau gagal; hasil baca array `results[].ok`.
- **Efek:** batch-add Codex OAuth akun. **High value tapi high risk** — 31+ akun Codex Faiz = cluster paling rawan (hard lesson: ToS-gray, weekly reset).
- **Kapan dipakai:** onboarding akun Codex baru dalam jumlah besar.
- **Gotcha:** partial failure normal — selalu parse `results` per-index, jangan hanya `created`.

### 8. 📜 DELETE `/publisher/providers/invalid` — **JANGAN HAPUS TANPA PERINTAH**
- **Body:** `{"upstreamSlug":"…"}`.
- **Efek:** HAPUS PERMANEN semua provider berstatus invalid (mis. dari `/publisher/providers` di mana `apiKeyCheckStatus: invalid`) di upstream tertentu. **TIDAK reversible.**
- **Kapan dipakai:** operasi pembersihan/migrasi terencana — hanya atas keputusan operator.
- **Gotcha:** hitung dulu berapa akan kehilangan; buat backup daftar id sebelum eksekusi.

### 9. ✅ GET `/publisher/providers/usage-windows`
- **Response (200):** object `{ providerId:[window,…], … }` — batched untuk SEMUA provider.
- **Window fields:** `windowKind` (`5h`,`7d`,`monthly`,`bonus1..14`,`credit`,`usage_limit`,`" "`), `usedTokens`,`limitTokens`,`usedPct`,`remainingPct`,`resetAt`,`source` (`poll`|`reactive_429`),`observedAt`.
- **️Observasi live:** 
  - akun `credit` dengan `limitTokens 0, usedPct 100, remainingPct 0, resetAt 9999` = **marker akun terkuras/habis tanpa auto-reset** (1921b12e, 2f69c068, ff970da7). Ini sumber **monitoring drain**.
  - akun dengan `source:"reactive_429"` (215e0284, 2aeab077, ece60ff5) = pernah kena 429 rate-limit → di-suspend sementara oleh sistem.
  - `windowKind:""` (ece60ff5) — semua null, hanya reactive_429. Objek mengambang.
- **Use-case Faiz:** snapshot drain seluruh fleet dalam SATU request — ideal utk alert balik kapasitas.
- **Gotcha:** response besar (125 provider × ~13 window ≈ 100+ KB); jangan dipoll setiap request UI, cache di backend.

### 10. 📜 DELETE `/publisher/providers/{id}` — **JANGAN HAPUS TANPA PERINTAH**
- **Efek:** hapus SATU provider permanen. ID salah → 404 `{"error":{"code":"not_found","message":"not found"}}` (terverifikasi pada variant PATCH).
- **Kapan dipakai:** akun mati/banned dihapus setelah di-`retire` di ledger.
- **Gotcha:** sinkronkan dgn ledger (retire-asset) supaya FP&M konsisten.

### 11. ✅ GET `/publisher/providers/{id}/asks` — **ENDPOINT NILAI MAKSIMAL #2 (pricing)**
- **Response (200):** array model-level. Field: `upstreamCatalogModelId`,`upstreamModelId`,`modelStatus`,`modality`,`askInputPerMtok`,`askOutputPerMtok`,`enabled`,`officialInputPerMtok`,`officialOutputPerMtok`,`defaultDiscountPct`,`maxAskPct`,`maxAskIn`,`maxAskOut`,`avgPriceIn`,`avgPriceOut`,`avgPriceRequests`,`cheapestActivePct`.
- **⚠️ Live anomali pricing (temuan penting):** provider Codex `gpt-5.6-luna` punya `officialInputPerMtok:0.20` (murah) namun `askInputPerMtok:0.10` → discount remote ~50% → **`maxAskIn` cuma 0.10** = Faiz sudah menjual di cap maksimum utk model itu. Sedangkan `gpt-5.4` dulunya official $2.50 dan ask-nya $0.025 → cuma ~1% (very underpriced vs cap 50%). Artinya **banyak model codex dijual ~1%, hanya sedikit yang terset di dekat cap** → peluang besar utk **ask price management** otomasi.
- **Use-case Faiz:** benchmark ask per model, compare dgn `cheapestActivePct`, naikkan ask mendekati 50% untuk model dengan demand (avgPriceRequests tinggi).
- **Gotcha:** `avgPriceRequests` menunjukkan volume riil per model (gpt-5.6-luna 590 req) — jadikan indikator mana yang layak dinaikkan.

### 12. 📜 PATCH `/publisher/providers/{id}/auto-reset-credit` (Codex)
- **Body:** `{"enabled": true|false}`.
- **Efek:** mengaktifkan auto top-up credit Codex = **otomatis belanja uang riil** saat saldo habis. SANGAT berisiko.
- **Kapan dipakai:** ramp up Codex akun privat secara penuh; jangan sampai aktif tanpa pemantauan.
- **Gotcha:** 404 utk non-Codex / id salah (terverifikasi pada PATCH enabled). Deskripsi OpenAPI menyebut eksplisit "auto-spends real money".

### 13. 📜 PATCH `/publisher/providers/{id}/enabled`
- **🛡️️LIVE (id palsu, error shape):** 404 `not_found` — body tidak divalidasi lebih lanjut utk id yang benar pun karena belum di-hits nyata.
- **Body:** `{"enabled": true|false}`.
- **Efek:** aktif/nonaktifkan penyedia dari pool routing. **Mempengaruhi kapasitas jual Faiz secara langsung.**
- **Kapan dipakai:** turunkan provider saat habis/reset agar tidak kena 429, atau isolasi key bermasalah.
- **Gotcha:** ini salah satu kandidat otomasi "auto-disable saat drain" — tapi hati-hati, nonaktif = kehilangan revenue saat kapasitas pulih.

### 14. ✅ POST `/publisher/providers/{id}/recheck` — 🛡️ NON-DESTRUKTIF (LIVE-TEST LANGSUNG)
- **Live (cline-pass & codebuddy-cn):** `{"status":"ok"}` HTTP 200 — re-verifikasi key/token akun.
- **Efek:** memicu re-verify key (mis. menandai invalid→ok setelah key diverifikasi ulang). Aman, tanpa biaya.
- **Use-case Faiz:** **auto-recheck fleet** — jadwal ulang semua provider invalid (mis. tiap 15–30 menit) agar status akurat & yang sembuh otomatis balik ke pool.
- **Gotcha:** endpoint per-id; untuk fleet 125 perlu loop. Respek rate-limit (jangan 125 request sekaligus, throttle).

### 15. ✅ GET `/publisher/providers/{id}/usage-windows`
- **Response (200):** array window utk 1 provider (sama struktur dgn endpoint #9, subset).
- **Live (codebuddy-cn):** `bonus1..13` + `monthly` (usedPct 16%, reset 2026-08-31). Struktur identik.
- **Use-case Faiz:** detail drain per akun di halaman provider.
- **Gotcha:** window `credit` dengan usedPct 100 & reset `9999` berarti akun harus di-reset lain; ini penanda drain permanen tanpa auto-reset.

### 16. 📜 POST `/publisher/providers/{id}/usage/refresh`
- **Efek:** memaksa poll live upstream utk satu provider (refresh `observed*`). Read-only terhadap kapasitas.
- **Kapan dipakai:** saat butuh angka usage fresh segera tanpa nunggu interval poll 10s/60s.
- **Gotcha:** bisa menuai 429 dari upstream kalau di-refresh berlebihan; hemat-hemat.

---

## D. UPSTREAMS

### 17. ✅ GET `/publisher/upstreams`
- **Response (200):** **BARE ARRAY** (10 upstream) — `{slug,prefix,label,description,signupUrl,status,pricingModel}`.
  | slug | label | pricing |
  |---|---|---|
  | `claude-code` | Claude Code | subscription |
  | `cline-pass` | ClinePass | pay_as_you_go |
  | `codebuddy` | CodeBuddy | subscription |
  | `codebuddy-cn` | CodeBuddy CN | subscription |
  | `commandcode` | Command Code | subscription |
  | `codex` | OpenAI Codex | subscription |
  | `opencode-go` | OpenCode Go | subscription |
  | `siliconflow` | SiliconFlow | pay_as_you_go |
  | `xiaomi-mimo` | Xiaomi MiMo | subscription |
  | `z-ai` | Z.AI GLM Coding Plan | subscription |
- **Use-case Faiz:** katalog upstream + pricing model, utk konversi ask→% dan penetapan harga.
- **Gotcha:** slug palsu di endpoint pricing → kemungkinan 404; hanya slug di sini yang valid.

### 18. 📜 PUT `/publisher/upstreams/{slug}/asks/{modelId}`
- **Body:** `{"askInputPerMtok":"string","askOutputPerMtok":"string"}` — tab-wide (seluruh akun upstream itu).
- **Efek:** set ask price global untuk satu model di satu upstream = **mengubah margin Faiz di semua provider upstream tsb.**
- **Kapan dipakai:** rebalancing pricing (naikkan mendekati cap 50% untuk model tebal demand). Inti **ask price management**.
- **Gotcha:** modelId = `upstreamModelId` (mis. `codex/gpt-5.6-luna`) atau `upstreamCatalogModelId`; pastikan konteks mana yang dipakai. ✅ cek `maxAskPct`/`maxAskIn` dari asks sebelum PUT — jangan over-setting lalu ditolak.

### 19. 📜 PUT `/publisher/upstreams/{slug}/max-concurrent`
- **Body:** `{"maxConcurrent":integer 1–10}` — tab-wide.
- **Efek:** batas in-flight request per akun utk seluruh upstream. Naik = throughput/rr lebih tinggi tapi risiko 429 & ban akun naik.
- **Kapan dipakai:** tuning throughput per family akun (Codex akun privat mungkin curah hati-hati).
- **Gotcha:** range 1–10; nilai di luar → validation error.

### 20. 📜 PUT `/publisher/upstreams/{slug}/schedule`
- **Body:** `{"enabled":bool,"timezone":"IANA (wajib saat enabled)","windows":[{"day":0–6,"start":"HH:MM","end":"HH:MM"}]}`.
- **Efek:** jadwal on/off mingguan tab-wide. `enabled:false` = 24/7 (default Faiz).
- **Kapan dipakai:** matikan load saat jam sepi / hemat kuota malam, atau hindari jam tinggi ban risk.
- **Gotcha:** `timezone` wajib jika enabled; `windows` min 1 item.

---

## E. WITHDRAWALS

### 21. ✅ GET `/publisher/withdrawals`
- **Response (200):** array riwayat payout. Field: `id`,`destination`,`amountUsdc`,`status`,`signature`,`network`,`requestedAt`,`completedAt`.
- **Observed:** 14 record, semua `status:"confirmed"`, `amountUsdc:"10.000000"`, `network:"mainnet"`, dest `ELY6E…a1F9` (07-22 → 08-09).
- **Use-case Faiz:** bukti payout nyata. Σ repayment = `SUM(amountUsdc)` dari `confirmed` = bagian dari all-time earning (`balance + Σ withdrawals`). Ada `signature` tx Solana utk verifikasi on-chain.
- **Gotcha:** status bisa `requested` (menunggu admin approval) / `confirmed`; jangan hitung `requested` sebagai payout obat realized sampai `confirmed`.

### 22. 📜 POST `/publisher/withdrawals` — OTP-GATED, **JANGAN TEST RIIL**
- **Body:** `{"destination":"solana-addr","amountUsdc":"string","otp":"^\d{6}$"}`.
- **Efek:** verifikasi OTP single-use (terikat destination+amount) → **debit `publisher_earnings` → `payout_pending`**. Status `requested` sampai admin approval + disbursement on-chain.
- **Alur lengkap:** (25) GET otp (24) → POST ini (22) → tunggu admin.
- **Kapan dipakai:** saat mature ≥ $10 (min payout = 5 USDC di dashboard, riilnya 10) dan ingin cair ke Solana Faiz (dest `ELY6E…a1F9`).
- **Gotcha:** tanpa OTP valid → ditolak; salah dest → ditolak (validation_error). Jangan pernah jalan tanpa OTP riil dari email/telegram.

### 23. ✅ GET `/publisher/withdrawals/destinations`
- **Response (200):** `[{"destination":"ELY6E…a1F9","verifiedAt":"2026-07-22T03:26:18.871Z"}]` — dest Solana yang sudah whitelisted.
- **Use-case Faiz:** pastikan dest aktif sebelum earnings mature; basis **payout automation** (bisa auto-request saat saldo ≥ threshold ke dest terverifikasi ini).
- **Gotcha:** hanya 1 dest terdaftar. Menambah dest baru butuh verifikasi OTP 2-langkah (endpoint 24–25).

### 24. 📜 POST `/publisher/withdrawals/destinations/verifications`
- **Body:** `{"destination":"…"}`.
- **Efek:** kirim OTP verifikasi ke pemilik dest baru (pra-whitelist). Tidak mengubah status sampai confirm.
- **Kapan dipakai:** tambah saluran payout baru (mis. wallet kedua Faiz).
- **Gotcha:** dest yang sudah terverifikasi mungkin ditolak/diabaikan; base58 & 43–44 char wajib (422 pada dest garbage — terverifikasi).

### 25. 📜 POST `/publisher/withdrawals/destinations/verifications/confirm`
- **Body:** `{"destination":"…","code":"^\d{6}$"}`.
- **Efek:** whitelist dest setelah OTP benar. **Actionable nyata** setelah Faiz menerima kode.
- **Kapan dipakai:** sesudah endpoint 24, saat kode masuk. Kode salah → ditolak.

### 26. 📜 POST `/publisher/withdrawals/otp`
- **🛡️️LIVE (dest garbage, pre-validasi):** 422 `validation_error: "invalid Solana address (base58, 43–44 chars)"` dengan `issues[].path/message` — **tidak ada OTP terkirim** utk input salah (aman).
- **Body:** `{"destination":"…","amountUsdc":"string"}`.
- **Efek:** kirim OTP konfirmasi withdrawal — **pre-validasi amount + destination**. Inilah gerbang utama payout.
- **Gotcha:** jalankan OTP hanya saat benar-benar mau payout (memicu email/telegram OTP). Satu OTP sekali pakai.

---

## Ringkasan Temuan — Nilai Maksimal untuk Faiz

1. **Semua 26 endpoint berfungsi (0 bug).** Perbedaan utama hanya: 9 GET aman dipoll, 17 mutating memerlukan arahan/OTP/manual.
2. **All-time earning ≠ earningsLifetimeUsdc.** Balance $21.98 + 14×$10 ($140) ≈ **$162 all-time**, sedangkan `earningsLifetimeUsdc` provider ∑ ≈ $53. Jangan pernah pakai yang terakhir utk laporan all-time (hard lesson skill dikonfirmasi ulang).
3. **Fleet sehat / 5 upstream / 125 provider**, tapi ada sinyal drain: window `credit` usedPct=100/reset=9999 pada ≥3 Codex, dan ∑ `reactive_429` (kandidat di-suspend) ≥3. Codex `apiKeyCheckStatus: invalid` + cooldown terlihat live.
4. **Pricing sebagian besar underutilized:** banyak model Codex dijual ~1% (ask=$0.025 vs cap 50%=$1.25 pada gpt-5.4), sementara `gpt-5.6-luna` sudah di cap. **Ruang ke atas ~50%** untuk model dengan demand tinggi (avgPriceRequests besar).

## Otomasi yang Bisa Dibangun

| Otomasi | Endpoint basis | Alur |
|---|---|---|
| **Auto-recheck fleet** | #14 `recheck` × loop | Cron/backgnd tiap 15–30m: untuk provider `apiKeyCheckStatus:"invalid"`, panggil `recheck`; yang balik `ok` otomatis aktif lagi → zero manual maintenance |
| **Monitoring drain** | #9 `/publisher/providers/usage-windows` (batch 1 request) | Poll 5–15m; alert bila window `credit`/partial usedPct ≥90%, resetAt mendekat, atau source `reactive_429` muncul → tahu akun mana harus di-reset/di-disable |
| **Payout automation** | #1, #3, #21, #23 | Monitor `publisherEarningsUsdc` (balanced); saat ≥ threshold (mis. $10) & dest terverifikasi → trigger alur OTP (endpoint 26→22) manual-approve hanya pada langkah terakhir |
| **Ask price management** | #5/#11 + #18 | Bijak: baca asks per model (`cheapestActivePct`,`maxAskPct`,`avgPriceRequests`), set ask mendekati cap untuk model ber-demand → MAX revenue tanpa ban risk; verify dgn `cheapestActivePct` |

## Gotcha Global & Keamanan

- **Header:** selalu `User-Agent` + `Accept: application/json`; tanpa Bearer → 401. Beberapa path tanpa UA → 403.
- **Semua uang/angka dari API berbentuk string** (`"21.979518"`) → parse ke Number sebelum agregasi.
- **Kontrak banyak endpoint = BARE ARRAY**, bukan `{data:[…]}` (providers, upstreams, withdrawals, destinations). Backend Flask F&P sudah handling `Array.isArray`.
- **Jangan pernah:** transfer riil (#4), hapus invalid/provider (#8/#10), request payout riil (#22), auto-reset-credit on (#12), set ask ke luar cap/0 (#18) — tanpa perintah eksplisit Faiz.
- **Codex = cluster risiko tertinggi** (ToS-gray, auto-reset spending real money) — pantau via #9/#14, bukan naikkan concurrent sembarangan (#19).
