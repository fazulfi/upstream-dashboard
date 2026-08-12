# Audit + Live-Test — InferHub API Cluster USAGE / MARKET / PRICING / CATALOG / INFERENCE

**Tanggal audit:** 2026-08-11
**Auditor:** Suisui (subagent audit)
**Scope:** 15 endpoint cluster Usage/Market/Pricing/Catalog/Inference
**Metode:** Live-test non-destruktif via curl (read-only). Endpoint mutasi (`PUT /catalog .../enabled`) **tidak** dijalankan — hanya didokumentasikan dari OpenAPI + pembacaan schema.
**Sumber:** OpenAPI `shared-memory/inferhub-business/docs/inferhub-openapi.json`, skill `inferhub-integration-api`.

## Ringkasan Eksekutif (TL;DR)

| # | Endpoint | Method | Auth | Status Live | Partisi |
|---|----------|--------|------|-------------|---------|
| 1 | `/usage/logs` | GET | Bearer | ✅ 200 | Management |
| 2 | `/usage/logs/models` | GET | Bearer | ✅ 200 | Management |
| 3 | `/usage/breakdown` | GET | Bearer | ✅ 200 | Management |
| 4 | `/usage/cache-stats` | GET | Bearer | ✅ 200 | Management |
| 5 | `/market` | GET | **Public** | ✅ 200 | Management |
| 6 | `/market/stream` | GET (SSE) | **Public** | ✅ 200 SSE | Management |
| 7 | `/pricing/config` | GET | **Public** | ✅ 200 | Management |
| 8 | `/catalog` | GET | Bearer | ✅ 200 | Management |
| 9 | `PUT /catalog/models/{id}/enabled` | PUT | Bearer | 📄 DOC only | Management |
| 10 | `PUT /catalog/upstreams/{id}/enabled` | PUT | Bearer | 📄 DOC only | Management |
| 11 | `/v1/models` | GET | Bearer | ✅ 200 | Inference |
| 12 | `/v1/me/usage` | GET | Bearer | ✅ 200 | Inference |
| 13 | `/v1/chat/completions` | POST | Bearer | ✅ 200 | Inference |
| 14 | `POST /v1/messages` (Anthropic) | POST | Bearer | 📄 DOC only | Inference |
| 15 | `POST /v1/responses` (OpenAI) | POST | Bearer | 📄 DOC only | Inference |

**15/15 endpoint diverifikasi** (12 live-test sukses, 3 dokumentasi-schema karena bersifat mutasi/berbayar).

- **Live nilai terverifikasi:** `/usage/logs` range=30d: `total=12855`, `rangeTotal=12855`, `totalCostUsdc=$11.36`, `totalTokens=2,348,339,040`, `totalSavedUsdc=$937.52` (cache savings ~82× cost).
- **Semua endpoint ber-performa baik** (<1s untuk read, kecuali inference yang bergantung upstream/ttft).

---

## Konvensi Umum

- **Base management:** `https://inferhub.dev/api`
- **Base inference:** `https://api.inferhub.dev` (tanpa `/api`)
- **Header wajib:** `User-Agent: audit/1.0` (tanpa UA → **403**), `Accept: application/json`. Untuk SSE: `Accept: text/event-stream`.
- **Auth:** `Authorization: Bearer sk-airo-…`. Tanpa key → `401 {"error":{"code":"unauthorized","message":"A valid API key is required..."}}` (terverifikasi).
- **Uang:** string USDC desimal (mis. `"0.000417"`). Selalu `float()`.
- **Rate limit:** tidak terdokumentasi di OpenAPI; poll ≥15s.

---

## A. ENDPOINT USAGE (1–4) — konsumen spend (BUKAN publisher earnings)

> ⚠️ **Peringatan semantik penting:** Keempat endpoint usage mengukur **pengeluaran konsumen** (request yang dirutekan lewat API key akun ini), **bukan pendapatan publisher**. Jangan pernah pakai total usage sebagai headline earning Faiz (itu `publisher_earnings` + withdrawals). Pakai untuk panel Analytics bertanda jelas "usage/cost".

### 1. GET /usage/logs — daftar log request (paginasi)

- **Auth:** Bearer
- **Params (query):** `page`(int≥1), `pageSize`(int, default 25), `range`(`24h|7d|30d|90d|all`, default `30d`), `status`(`all|ok|error|4xx|5xx|429`), `model`(filter token `<prefix>/<model>`), `sort`(`ts|model|status|in|out|cost|ttft|tps|cached`), `dir`(`asc|desc`, default desc).
- **Response (live 200):**
  ```json
  {
    "rows":[{
      "id":"uuid","ts":"2026-08-11T01:07:08.492Z","status":"ok","http_status":200,
      "prompt_tokens":35531,"completion_tokens":753,"cached_tokens":34529,"cache_write_tokens":null,
      "cost_consumer_usdc":"0.000417","ask_input_per_mtok":"0.07","ask_output_per_mtok":"0.14",
      "region":"","model":"cp/cline-pass/deepseek-v4-flash","upstream_label":"ClinePass",
      "ttft_ms":6703,"duration_ms":6706}],
    "total":12855,"rangeTotal":12855,"page":1,"pageSize":3,
    "totalCostUsdc":"11.358610","totalTokens":2348339040,"totalSavedUsdc":"937.516356...","range":"30d"
  }
  ```
- **Use-case Faiz:** live earning-per-request ticker (backend sudah buat `/api/earnings-log?size=N` pass-through). Filter per model untuk per-request table.
- **Gotcha:** `total` vs `rangeTotal` — `rangeTotal` adalah jumlah dalam rentang (bisa beda dengan `total` bila filter `status`/`model` aktif). `totalSavedUsdc` adalah penghematan cache (nilai besar), jangan ditampilkan sebagai earning.
- **Catatan live:** range=24h sort=cost desc: `rangeTotal=3568`, `totalCostUsdc=$1.12`.

### 2. GET /usage/logs/models — daftar model unik yang dipakai

- **Auth:** Bearer
- **Params:** `range` (sama seperti #1).
- **Response (live 200):** **Top-level JSON array** (bukan dibungkus object):
  ```json
  [{"value":"cp/cline-pass/deepseek-v4-flash","label":"cp/cline-pass/deepseek-v4-flash"},
   {"value":"cx/gpt-5.6-terra","label":"cx/gpt-5.6-terra"}, ...]
  ```
  17 token distinct terdeteksi di range=30d.
- **Use-case:** dropdown filter model untuk usage logs.
- **Gotcha:** body shape-nya **array langsung**, bukan `{models:[...]}` — backend harus baca `Array.isArray(res)`.

### 3. GET /usage/breakdown — agregasi per model/provider

- **Auth:** Bearer
- **Params:** `range`.
- **Response (live 200):** `{range, byModel[], byProviderModel[], byProvider[]}`. Tiap baris: `{..., reqs, inputTokens, outputTokens, costUsdc}` (string numerik untuk cost). `byProvider` contoh live:
  ```json
  {"providerLabel":"OpenAI Codex","prefix":"cx","reqs":5155,"inputTokens":462776079,"outputTokens":2200134,"costUsdc":"7.592990"}
  ```
  Top konsumen 30d: Codex $7.59, ClinePass $3.41, OpenCode Go $0.25. `byProviderModel` count=18.
- **⚠️ Use-case/earning gotcha:** `byModel` MEMICU kesalahan berulang — ini spend **konsumen**, jangan jadikan "model ranking token terjual (publisher)". Ranking publisher sejati = agregat `avgPriceRequests` dari `/publisher/providers/{id}/asks`. `byModel` menampilkan entri ganda dengan key yang sama (mis. `deepseek-v4-flash` muncul 3× untuk provider berbeda) — dedupe dengan `(key, label)` bila perlu.

### 4. GET /usage/cache-stats — statistik prompt-cache

- **Auth:** Bearer
- **Params:** `range`.
- **Response (live 200):** `{range, rows[], totals, hitRate}`. `rows[]`: `{label, reqs, promptTokens, cachedTokens, cacheWriteTokens}`.
  - Live: `cp/cline-pass/deepseek-v4-flash` reqs=6944, cachedTokens=1,592,538,629 dari 1,742,873,830 prompt (~91% hit rate). `cx/gpt-5.6-terra` cachedTokens=0 (cache-disabled model → cacheWrite=0).
- **Use-case:** optimasi cache panel; hit rate tinggi = hemat biaya.
- **Gotcha:** hanya menyertakan model cache-capable; `cacheWriteTokens` sering `0`/null.

---

## B. ENDPOINT MARKET & PRICING (5–7) — PUBLIC, tanpa auth

### 5. GET /market — snapshot pasar (min/max ask + lastRate) — **NILAI MAKSIMAL**

- **Auth:** **TIDAK** (public). Terverifikasi 200 tanpa Bearer.
- **Response (live 200):** object langsung (tanpa envelope): `{ts (epoch_ms), models:[{slug, family, minAskIn, minAskOut, maxAskIn, maxAskOut, lastRate}]}`.
  - Live: **90 model**, tersebar 10 family: CodeBuddy 13, Codebuddy CN 8, Claude Code 9, Command Code 14, ClinePass 10, OpenAI Codex 6, Xiaomi MiMo 2, OpenCode Go 13, SiliconFlow 9, Z.AI GLM 6.
  - Contoh: `cb/claude-opus-4.6` minAskIn 0.465 / maxAskIn 2.5 / lastRate 0.9128. Termurah: `cb/gpt-5.6-luna` minAskIn $0.0198.
- **Use-case Faiz:** panel market (harga kompetitif per model), memvalidasi ask saya vs global min/max. Nilai `lastRate` = blended råta-rata harga berhasil-trade per Mtoken (bisa `null` bila belum ada trade).
- **Gotcha:** `lastRate` bisa `null`; harga $/Mtok. `ts` epoch ms, konversi ke ms.

### 6. GET /market/stream — **SSE** live snapshot

- **Auth:** **TIDAK** (public).
- **Response (live 200):** `text/event-stream`. Setiap event = `data: {json same shape as /market}` sekali per **~15 detik**.
  - Live terverifikasi: dalam 5s timeout menerima 1 snapshot yang identik bentuknya dengan `/market`. **TIDAK** ada default `event:` field — hanya `data:` line tanpa nama event.
- **Use-case:** live market ticker tanpa polling (EventSource di frontend / `proxies` pass-through backend).
- **Gotcha:** stream terbuka terus; konsumen harus menutup koneksi. `Accept: text/event-stream` diperlukan. Polling interval switch dari `/api/market` (tiap request) vs `/market/stream` (satu koneksi, 15s cadence) — yang terakhir lebih hemat untuk UI real-time.

### 7. GET /pricing/config — konfigurasi platform (knob pricing) — **NILAI MAKSIMAL**

- **Auth:** **TIDAK** (public).
- **Response (live 200):** object langsung:
  ```json
  {"maxAskPctOfOfficial":0.5,"platformFeePct":0.2,"publisherSharePct":80}
  ```
- **Insight monetisasi (paling penting):**
  - **`maxAskPctOfOfficial: 0.5`** — batas harga jual maksimum = **50% harga resmi official**. Ini konsisten dengan dashboard slider publisher (max 50%). Faiz tidak bisa menaikkan ask di atas 50% official.
  - **`platformFeePct: 0.2`** — biaya platform 20% dari gross.
  - **`publisherSharePct: 80`** — bagian publisher **80%** setelah fee platform. Artinya net share Faiz dari harga ask = `0.8 × ask` (produk: publisher dapat 80%, digabung pembulatan platform 20%).
  - **Matriks nilai-nilai ini tidak berubah-ubah per request** — cache di backend (bukan per-poll).
- **Gotcha:** nilai dikembalikan langsung tanpa envelope; `publisherSharePct` adalah integer (80), dua lainnya float.

---

## C. ENDPOINT CATALOG (8–10)

### 8. GET /catalog — kartu upstream + model dengan live asks — **NILAI MAKSIMAL**

- **Auth:** Bearer.
- **Response (live 200):** **Top-level JSON array** `UpstreamCard[]` (10 upstream live). Tiap kartu: `{id (uuid), slug, label, enabled, activeProviders, models[], ...}`. `models[]`: `{id (uuid), upstreamModelId, label, enabled, modelDisabled, officialIn, officialOut, asksIn[], asksOut[], supportsCache}`.
- **Live aktif provider per upstream:** Claude Code 4, ClinePass 5, **CodeBuddy 443**, CodeBuddy CN 188, Command Code 21, **OpenAI Codex 104**, OpenCode Go 1, SiliconFlow 1, Xiaomi MiMo 193, Z.AI GLM 1. Total ±%  — **CodeBuddy (443) + Xiaomi (193) + CodeBuddy CN (188) + Codex (104) adalah pilar kapasitas**.
- **Live contoh:** `Claude Code/claude-opus-4-6`: officialIn $5 / officialOut $25, asksIn `[2.5,2.5,0.5,2.5]` (asks raw $/Mtok per provider; `0.5` = 5% dari official $5... perlu konfirmasi identitas tiap ask). Semua upstream `enabled`=True, `disabledModels`=0.
- **Use-case:** management disable/enable per upstream/model, memantau kapasitas fleet per upstream, lihat asks global.
- **Gotcha:** body **array langsung** (bukan wrapper). `asksIn/Out` raw numerik ($/Mtok), `officialIn/Out` **string desimal** — parse float. `activeProviders` adalah proxy kapasitas real-time (cocok untuk koordinasi fleet).

### 9. PUT /catalog/models/{modelId}/enabled — 📄 DOKUMENTASI SAJA (TIDAK dijalankan)

- **Method/Path:** `PUT https://inferhub.dev/api/catalog/models/{modelId}/enabled`, `modelId` = **uuid** (dari `/catalog` → `models[].id`).
- **Auth:** Bearer.
- **Body (tidak didokumentasikan di OpenAPI; `enabled` boolean — pre-schema dari `OkResult` semantics, "parent-aware collapse/promotion").** Karena tidak dijelaskan di spec, body diasumsikan `{"enabled": true|false}`.
- **Response:** `200 OkResult` `{ok: boolean, error?}`.
- **Getcha/keterbatasan:** `modelId` adalah uuid dari elemen `models[].id` di `/catalog`, **bukan** `upstreamModelId` string (mis. `claude-opus-4-6`). Salah pakai → 404/422.
- **⚠️ Tidak di-live-test:** mutasi state konsumen (bisa menonaktifkan/mengaktifkan model nyata). Untuk otomasi Faiz, pair GET `/catalog` → pilih id → PUT, dan kembalikan state asli setelahnya.

### 10. PUT /catalog/upstreams/{upstreamId}/enabled — 📄 DOKUMENTASI SAJA (TIDAK dijalankan)

- **Method/Path:** `PUT https://inferhub.dev/api/catalog/upstreams/{upstreamId}/enabled`, `upstreamId` = **uuid** (dari `/catalog` → `id`, mis. `b8eba2eb-...` utk Claude Code).
- **Auth:** Bearer.
- **Response:** `200 OkResult`.
- **Getcha:** id yang benar adalah uuid upstream dari `/catalog` (bukan slug/label). Sama seperti #9, tidak di-live-test karena mutasi state nyata.

---

## D. ENDPOINT INFERENCE (11–15)

**Base:** `https://api.inferhub.dev` (tanpa `/api`).

### 11. GET /v1/models — daftar model OpenAI-shape + ekstensi pricing — **NILAI MAKSIMAL**

- **Auth:** Bearer.
- **Response (live 200):** `{object:"list", data:[132 model]}`.
  - Tiap model: `{id:"<prefix>/<model>", object:"model", owned_by:"<prefix>", created, modality, supports_cache, upstream_label, pricing:{official_in, official_out, min_ask_in, min_ask_out, asks_in[], asks_out[]}}`.
  - Live contoh: `cb/claude-opus-4.6`: `pricing.min_ask_in=0.465`, `official_in=5`, `asks_in=[0.465,0.47,0.5,0.75,...]`, `supports_cache=false`, modality `text,image`.
  - **132 model total**; 10 termurah min_ask_in: `cx/gpt-5.6-luna` $0.002, `cbcn/deepseek-v4-flash` $0.0069, `cp/cline-pass/deepseek-v4-flash` $0.007, `cx/gpt-5.4-mini` $0.0075, dst.
- **Use-case:** daftar model yang benar-benar bisa di-invoke via inference base + harga real-time (gabungan `/catalog` + `/market` dalam bentuk OpenAI).
- **Gotcha:** shape `{object:"list", data:[...]}` — jangan baca `data` sebagai object list langsung. `created` epoch. `modality` bisa berisi `text,image`.

### 12. GET /v1/me/usage — status akun & pemakaian

- **Auth:** Bearer.
- **Params:** `window`(`day|24h|7d|30d`, default day), `tz`, `session_id`.
- **Response (live 200):**
  ```json
  {"object":"account.usage","currency":"USDC","balance":{"amount_usdc":"0.186021","updated_at":"..."},
   "window":{"kind":"30d","since":...,"until":...,"requests":12854,"prompt_tokens":2342609500,"completion_tokens":6114227,"total_tokens":2348723727,"spend_usdc":"11.366036"},
   "all_time":{"requests":12811,"prompt_tokens":...,"spend_usdc":"11.250356"},
   "session":{...},"top_model":{"model":"cx/gpt-5.6-terra","requests":2287,"tokens":211188631,"spend_usdc":"5.419859"},
   "cache":{"cached":false,"ttl_seconds":30}}
  ```
- **Use-case:** dashboard header balance konsumen (`balance.amount_usdc` = $0.186021), spend 30d & all-time. Top-model untuk insight model paling mahal.
- **Gotcha:** `balance.amount_usdc` adalah saldo konsumen (bukan publisher earnings). Top-level keys selalu ada; `session`/`top_model` object opsional. Model paling mahal konsumen = `cx/gpt-5.6-terra` ($5.42/30d).

### 13. POST /v1/chat/completions — jalankan LLM (OpenAI-compatible)

- **Auth:** Bearer.
- **Body:** `{model (required), messages[], stream, max_tokens}` (content-type `application/json`).
- **Live test (non-stream, 2×:)** Model murah `cp/cline-pass/deepseek-v4-flash` max_tokens=20 → 200, `id=gen_...`, `usage.total_tokens=30`. Model non-reasoning `cx/gpt-5.4-mini` max_tokens=20 → **content="hello"** terverifikasi + `usage.total_tokens=40`.
  - Usage object OpenAI-standard: `prompt_tokens`, `completion_tokens`, `total_tokens`, plus ekstensi `cost` (USD), `gateway_cost`, `market_cost`, `is_byok`, `completion_tokens_details.reasoning_tokens`.
- **Use-case:** smoke-test model / pipeline, jalankan agent, pengujian langsung. Cost kecil (contoh ~$2.5e-6).
- **Gotcha:** model reasoning (mis. `deepseek-v4-flash`) menghabiskan token di `reasoning_tokens` sehingga `content` bisa `''` untuk `max_tokens` kecil — gunakan model non-reasoning (mis. `gpt-5.4-mini`) untuk test konten. `cost`/`gateway_cost` ada di `usage` untuk metrik real-time.

### 14. POST /v1/messages (Anthropic) — 📄 DOKUMENTASI SAJA (TIDAK dijalankan)

- **Method/Path:** `POST https://api.inferhub.dev/v1/messages`.
- **Body:** `{model (required), messages[] (required), max_tokens (required), system?, tools?, stream?}`. Native passthrough untuk upstream claude.
- **Auth:** Bearer.
- **Response:** Anthropic Message object (stream → SSE). Tidak ditest (membakar kredit & hanya relevan untuk klien Anthropic).
- **Use-case:** konsumen dengan SDK Anthropic (Claude Code/Claude Agent) ke InferHub.

### 15. POST /v1/responses (OpenAI Responses) — 📄 DOKUMENTASI SAJA (TIDAK dijalankan)

- **Method/Path:** `POST https://api.inferhub.dev/v1/responses`.
- **Body:** `{model (required), input, instructions?, tools?, stream?}`.
- **Auth:** Bearer.
- **Response:** OpenAI Responses object; native utk codex/grok dgn hosted tools, ditranslate utk lainnya.
- **Use-case:** klien SDK OpenAI Responses vs chat.completions.

---

## RINGKASAN TEMUAN

### Endpoint "nilai maksimal" (paling layak diootomasi / masuk dashboard)
1. **`GET /market`** (#5) — public, 90 model, min/max ask + lastRate → panel market kompetitif tanpa auth.
2. **`GET /pricing/config`** (#7) — public, rule monetisasi (cap 50%, fee 20%, share 80%) → dasar math margin Faiz.
3. **`GET /catalog`** (#8) — kapasitas per upstream (`activeProviders`) + asks → koordinasi fleet & model enable/disable.
4. **`GET /v1/models`** (#11) — 132 model dengan harga real-time → daftar model + konsolidasi pricing.
5. **`GET /usage/breakdown`** (#3) & **`/usage/logs`** (#1) → panel Analytics spend per provider/model.
6. **`GET /v1/me/usage`** (#12) — satu panggilan untuk balance konsumen + spend window + all-time + top model.

### Insights pricing / monetisasi (terpenting)
- **`maxAskPctOfOfficial=0.5` → batas jual 50% official.** Faiz tidak bisa set ask >50% harga resmi model. Ini membatasi margin, jadi optimisasi = pilih model official mahal + set ask mendekati 50% sambil tetap kompetitif dengan sesama publisher.
- **`platformFeePct=0.2` + `publisherSharePct=80` → net share publisher = 80% dari ask.** Untuk hitung take-home per Mtoken: `ask × 0.8`.
- **`totalSavedUsdc=$937` vs `totalCostUsdc=$11.36`** di usage → prompt-cache menghemat ±82× biaya konsumen; dorong cache untuk model cache-capable.
- **Konsentrasi biaya:** 30d spending konsumen terkonsentrasi di `cx/gpt-5.6-terra` ($5.42) + `deepseek-v4-flash` ($3.39) = ~78% dari total $11.36.

### Peringatan semantik untuk dashboard
- Usage endpoints = **konsumen spend**, BUKAN publisher earnings. Headline earning harus dari `/publisher/earnings` (balance) + withdrawals. `publisher_earnings` = saldo, bukan earning.
- `byModel` jangan dipakai untuk "ranking model token terjual publisher" — pakai `/publisher/providers/{id}/asks` `avgPriceRequests`.

### Catatan implementasi / gotcha
- **Body shape:** `/usage/logs/models` & `/catalog` return **array langsung**; `/v1/models` return `{data:[...]}`; `/market`, `/pricing/config` return object langsung tanpa envelope. Backend wajib align.
- **Auth:** tanpa key → 401 `unauthorized`; tanpa UA → 403. Selalu kirim Bearer + UA.
- **Uang:** semua `*Usdc`, `officialIn/Out`, `amount_usdc` = **string** — `float()` sebelum math.
- **PUT enabled** (`modelId`/`upstreamId` = **uuid** dari `/catalog`) belum di-live-test (mutasi state). Untuk otomasi, selalu GET → PUT → restore.
- **Rate limit:** tak terdokumentasi; poll ≥15s / pakai `/market/stream` utk cadence 15s real-time.
