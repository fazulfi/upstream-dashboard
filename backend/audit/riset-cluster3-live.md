# Riset Cluster 3 — Live-Read Struktur Data untuk Dashboard (A) Ask Price Management & (B) Fleet Health

- **Tanggal audit live:** 2026-08-11 06:xx UTC
- **API Base:** `https://inferhub.dev/api` · Auth `Authorization: Bearer ***` (dari `~/.hermes-suisui/.env`)
- **Header:** `User-Agent: audit/1.0`, `Accept: application/json`
- **Status payload live:** **286 provider** (codex 43, codebuddy-cn 60, cline-pass 3, codebuddy 159, commandcode 18, opencode-go 3), 10 upstream, balance $25.70, 13 withdrawal confirmed.
- **Semua endpoint = read-only, aman.** Tidak ada mutasi yang dieksekusi (PUT asks / POST transfer / DELETE hanya diambil dari OpenAPI).
- **RIWAYAT:** semua nilai uang/harga dari API berupa **string** desimal → parse ke `NUMERIC` / `Number` sebelum agregasi.

---

## 1. Struktur nyata per endpoint

### 1.1 GET `/publisher/providers` — **BARE ARRAY** (286 item)
Key per provider (28 field, urut dari live):

| Field | Tipe live | Contoh codex `46cf…` | Contoh cline-pass `b083…` | Contoh codebuddy-cn `3dde…` |
|---|---|---|---|---|
| `id` | string uuid | `46cf071f-e07c-4519-b8f0-c629bb5c4406` | `b083e386-c874-451c-87d7-5a4de59ec762` | `3ddec6b1-9375-4c2f-9a9a-6f21a8f4a861` |
| `displayName` | string | `IoneSarandos7749@…` | `adisantososaja676@gmail.com #1` | `CodeBuddy CN #20` |
| `upstreamSlug` | string | `codex` | `cline-pass` | `codebuddy-cn` |
| `upstreamPrefix` | string | `cx` | `cp` | `cbcn` |
| `upstreamLabel` | string | `OpenAI Codex` | `ClinePass` | `CodeBuddy CN` |
| `upstreamSignupUrl` | string\|null | `https://chatgpt.com/codex` | `https://cline.bot` | `https://copilot.tencent.com` |
| `enabled` | bool | `true` | `true` | `true` |
| `apiKeyCheckStatus` | string | `ok` | `ok` | `ok` |
| `apiKeyVerifiedAt` | ts\|null | ts | ts | ts |
| `cooldownUntil` | ts\|null | `null` | `null` | `null` |
| `observedUsedTokens` | number\|null | `null` (codex pakai plan) | `null` | `95` |
| `observedLimitTokens` | number\|null | `null` | `null` | `500` |
| `observedUsedPct` | number\|null | `1` | `null` | `18` |
| `observedWindow` | string\|null | `5h` | `null` | `monthly` |
| `observedResetAt` | ts\|null | ts | `null` | `2026-08-31T23:59:59Z` |
| `observedSource` | string\|null | `poll` | `null` | `poll` |
| `observedSyncedAt` | ts\|null | ts | `null` | ts |
| `observedPlan` | string\|null | `plus` | `null` | `CodeBuddy个人体验版` |
| `drainedUntil` | ts\|null | `null` | `null` | `null` |
| `drainedWindow` | string\|null | `null` | `null` | `null` |
| `scheduleEnabled` | bool | `false` | `false` | `false` |
| `scheduleTimezone` | string\|null | `null` | `null` | `null` |
| `scheduleWindows` | array | `[]` | `[]` | `[]` |
| `scheduleActive` | bool | `true` | `true` | `true` |
| `maxConcurrent` | number | `10` | `10` | `10` |
| `autoResetCredit` | bool | `false` | `false` | `false` |
| `earningsLifetimeUsdc` | string\|null | `"0.007043"` | `"0.161447"` | `"0.014182"` |
| `modelCount` | number | `6` | `10` | `8` |

**Field BERUBAH-UBAH antar provider (kunci fleet health):**
- `apiKeyCheckStatus` ∈ {`ok`, `invalid`, mungkin `pending`/`unknown`}. `cooldownUntil` terisi saat `invalid` (masa pending recheck).
- `observedUsedTokens`/`observedLimitTokens`/`observedUsedPct`/`observedWindow`/`observedResetAt`/`observedPlan` — **SERING `null`** (codex `plan`-based & cline-pass `pay-as-you-go` tidak punya token monthly). Hanya codebuddy-cn yang punya angka token (95/500 = 18%, reset 31-08). **Jangan asumsi semua provider punya usage token.**
- `drainedUntil`/`drainedWindow` — default `null`; terisi saat di-drain oleh sistem.
- `earningsLifetimeUsdc` = **snapshot provider-terdaftar, BUKAN all-time earning** (hard lesson). Pakai hanya untuk delta fleet.

> **PENTING (dikoreksi dari audit lama):** di audit sebelumnya `cline-pass` disebut 2 provider, sekarang **3**. Count fleet berubah tiap waktu — dashboard harus poll ulang, bukan hardcode.

### 1.2 GET `/publisher/providers/{id}/asks` — array model-level (per provider)
Field per model (dari live, 3 provider):

| Field | Tipe | Contoh codex `gpt-5.6-luna` | Contoh codebuddy-cn `deepseek-v4-flash` | Contoh cline-pass `deepseek-v4-flash` |
|---|---|---|---|---|
| `upstreamCatalogModelId` | string **uuid** | `d07c9157-…` | `a0724bba-…` | `4b21b917-…` |
| `upstreamModelId` | string | `gpt-5.6-luna` | `deepseek-v4-flash` | `cline-pass/deepseek-v4-flash` |
| `modelStatus` | string | `available` | `available` | `available` |
| `modality` | string | `text,image` | `text` | `text` |
| `askInputPerMtok` | string | `"0.10000000"` | `"0.00700000"` | `"0.01400000"` |
| `askOutputPerMtok` | string | `"0.60000000"` | `"0.01400000"` | `"0.02800000"` |
| `enabled` | bool | `true` | `true` | `true` |
| `officialInputPerMtok` | string | `"0.20000000"` | `"0.14000000"` | `"0.14000000"` |
| `officialOutputPerMtok` | string | `"1.20000000"` | `"0.28000000"` | `"0.28000000"` |
| `defaultDiscountPct` | number | `50` | `100` | `100` |
| `maxAskPct` | number | `50` | `50` | `50` |
| `maxAskIn` | number (float) | `0.1` | `0.07` | `0.07` |
| `maxAskOut` | number (float) | `0.6` | `0.14` | `0.14` |
| `avgPriceIn` | string\|null | `"0.003204…"` | `"0.007847…"` | `"0.007847…"` |
| `avgPriceOut` | string\|null | `"0.013238…"` | `"0.014762…"` | `"0.014762…"` |
| `avgPriceRequests` | number | `3364` | `7783` | `7783` |
| `cheapestActivePct` | number | `1` | `3` | `5` |

**Kunci temuan pricing (Ask Price Management):**
- **`maxAskIn`/`maxAskOut` = batas harga TERTINGGI** yang boleh diset (official × maxAskPct/100). Contoh `gpt-5.6-luna`: official $0.20 → maxAskIn 0.10 (sudah di cap). JANGAN set ask melebihi max — PUT ditolak.
- **`cheapestActivePct`** = persentase ask aktif termurah di pool (referensi harga kompetitif). codebuddy-cn 3, cline-pass 5, codex 1.
- **`avgPriceRequests`** = volume demand riil (indikator naikkan/turunkan harga). `gpt-5.6-luna` 3364 req, `deepseek-v4-flash` 7783 req.
- **`defaultDiscountPct`** beda per upstream: codex `50`, codebuddy-cn/cline-pass `100` → formula `maxAsk = official × (100−defaultDiscountPct)/100`? Tidak — `maxAskPct=50` konsisten, tapi `defaultDiscountPct` = diskon default yang dipakai saat model baru.
- **`upstreamModelId` BERBEDA format per upstream:** codex pakai `gpt-5.6-luna` (tanpa prefix), cline-pass pakai `cline-pass/deepseek-v4-flash` (dengan prefix slug). **JADI jangan jadikan `upstreamModelId` sebagai key unik global — pakai `upstreamCatalogModelId` (uuid) sebagai PK.**
- Anomali: model `kimi-k2.7` (codebuddy-cn) punya `avgPriceIn/Out = null`, `avgPriceRequests = 0` → `avgPrice*` nullable.

### 1.3 GET `/publisher/upstreams` — **BARE ARRAY** (10 upstream)
Field: `slug`, `prefix`, `label`, `description`, `signupUrl`, `status` (`available`), `pricingModel` (`subscription` | `pay_as_you_go`).

| slug | prefix | label | pricing |
|---|---|---|---|
| `claude-code` | cc | Claude Code | subscription |
| `cline-pass` | cp | ClinePass | pay_as_you_go |
| `codebuddy` | cb | CodeBuddy | subscription |
| `codebuddy-cn` | cbcn | CodeBuddy CN | subscription |
| `commandcode` | cmc | Command Code | subscription |
| `codex` | cx | OpenAI Codex | subscription |
| `opencode-go` | ocg | OpenCode Go | subscription |
| `siliconflow` | sf | SiliconFlow | pay_as_you_go |
| `xiaomi-mimo` | mimo | Xiaomi MiMo | subscription |
| `z-ai` | zai | Z.AI GLM Coding Plan | subscription |

**PENTING — PUT `/publisher/upstreams/{slug}/asks/{modelId}` modelId = UUID (`upstreamCatalogModelId`), BUKAN `upstreamModelId`:**
- OpenAPI: path param `modelId` `type:string, format:uuid`.
- Satu-satunya field uuid di asks = `upstreamCatalogModelId`. Jadi untuk set ask tab-wide, gunakan `upstreamCatalogModelId` (mis. `d07c9157-…`) sebagai `modelId` pada path.
- **⚠️ Ini MENGOREKSI catatan di `audit-publisher.md` (bagian 18) yang menyangka modelId = `upstreamModelId`.** `upstreamModelId` itu string bebas (`gpt-5.4`, `cline-pass/deepseek-v4-flash`) — TIDAK cocok utk path uuid.
- Body PUT: `{"askInputPerMtok":"string","askOutputPerMtok":"string"}` — tab-wide (seluruh akun upstream). **TIDAK dieksekusi (mutating).**

### 1.4 GET `/publisher/earnings` — objek
```json
{"publisherEarningsUsdc":"25.695263","consumerBalanceUsdc":"1.166415"}
```
- Kedua nilai **string** desimal. Ini **balance/saldo**, bukan earning. Real all-time = `publisherEarningsUsdc + Σ confirmed withdrawal`.

### 1.5 GET `/publisher/withdrawals` — **BARE ARRAY** (13 record)
Field: `id` (uuid), `destination` (solana addr), `amountUsdc` (string), `status` (`confirmed`|`requested`), `signature` (tx Solana), `network` (`mainnet`), `requestedAt`, `completedAt`.
- Terverifikasi: 13× `confirmed` $10 → dest `ELY6E…a1F9`. **`requested` jangan dihitung sbg payout realized.**

---

## 2. Rekomendasi Skema PostgreSQL

### 2.1 Tabel `asks` — untuk Dashboard (A) Ask Price Management
Snapshot per provider×model (dari `GET /providers/{id}/asks`). **PK komposit `(provider_id, upstream_catalog_model_id)`** — karena asks per provider per model.

```sql
CREATE TABLE asks (
  provider_id            uuid        NOT NULL,          -- FK -> fleet_health.id
  upstream_catalog_model_id uuid     NOT NULL,          -- upstreamCatalogModelId (uuid) = PK model
  upstream_model_id      text        NOT NULL,          -- upstreamModelId (string, non-unique global)
  upstream_slug          text        NOT NULL,          -- denormalized utk filter cepat
  model_status           text        NOT NULL DEFAULT 'available',
  modality               text,
  ask_input_per_mtok     numeric(20,8) NOT NULL,        -- string -> numeric
  ask_output_per_mtok    numeric(20,8) NOT NULL,
  enabled                boolean     NOT NULL DEFAULT true,
  official_input_per_mtok numeric(20,8) NOT NULL,
  official_output_per_mtok numeric(20,8) NOT NULL,
  default_discount_pct   smallint,
  max_ask_pct            smallint    NOT NULL,          -- cap %
  max_ask_in             numeric(20,8) NOT NULL,        -- batas harga tertinggi (official*maxAskPct)
  max_ask_out            numeric(20,8) NOT NULL,
  avg_price_in           numeric(20,8),                 -- NULLABLE (lihat kimi-k2.7)
  avg_price_out          numeric(20,8),                 -- NULLABLE
  avg_price_requests     integer     NOT NULL DEFAULT 0, -- volume demand
  cheapest_active_pct    numeric(5,2),                  -- referensi kompetitif (dpt null)
  fetched_at             timestamptz NOT NULL DEFAULT now(),  -- waktu snapshot
  PRIMARY KEY (provider_id, upstream_catalog_model_id)
);
CREATE INDEX idx_asks_upstream_slug      ON asks (upstream_slug);
CREATE INDEX idx_asks_upstream_model_id  ON asks (upstream_model_id);
CREATE INDEX idx_asks_avg_price_requests ON asks (avg_price_requests DESC);
```
- **Join key:** `provider_id` → `fleet_health.id`; `upstream_slug` → `upstreams.slug`.
- **Delta pricing:** simpan snapshot bertanda `fetched_at`; untuk "sudah di cap?" hitung `ask_input_per_mtok / official_input_per_mtok` vs `max_ask_in`. Alert saat `ask < max_ask_in` dan `avg_price_requests` tinggi → peluang naikkan harga.

### 2.2 Tabel `fleet_health` — untuk Dashboard (B) Fleet Health
Snapshot per provider (dari `GET /publisher/providers`). **PK = `id` (uuid provider).** Simpan snapshot `fetched_at`.

```sql
CREATE TABLE fleet_health (
  id                    uuid        PRIMARY KEY,        -- provider id
  display_name          text,
  upstream_slug         text        NOT NULL,           -- FK -> upstreams.slug
  upstream_prefix       text,
  upstream_label        text,
  enabled               boolean     NOT NULL,
  api_key_check_status  text        NOT NULL,           -- ok|invalid|...
  api_key_verified_at   timestamptz,
  cooldown_until        timestamptz,                    -- ada saat invalid
  observed_used_tokens  bigint,
  observed_limit_tokens bigint,
  observed_used_pct     numeric(5,2),
  observed_window       text,                           -- 5h|monthly|7d
  observed_reset_at     timestamptz,
  observed_source       text,                           -- poll|reactive_429
  observed_synced_at    timestamptz,
  observed_plan         text,
  drained_until         timestamptz,                    -- null normal
  drained_window        text,
  schedule_enabled      boolean     NOT NULL DEFAULT false,
  schedule_timezone     text,
  schedule_windows      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  schedule_active       boolean     NOT NULL DEFAULT true,
  max_concurrent        smallint    NOT NULL DEFAULT 10,
  auto_reset_credit     boolean     NOT NULL DEFAULT false,
  earnings_lifetime_usdc numeric(20,8),                 -- snapshot, BUKAN all-time
  model_count           smallint    NOT NULL DEFAULT 0,
  fetched_at            timestamptz NOT NULL DEFAULT now(),
  fetch_id              uuid        NOT NULL            -- batch id (1 poll = 1 fetch)
);
CREATE INDEX idx_fleet_upstream_slug      ON fleet_health (upstream_slug);
CREATE INDEX idx_fleet_check_status       ON fleet_health (api_key_check_status);
CREATE INDEX idx_fleet_drained            ON fleet_health (drained_until);
CREATE INDEX idx_fleet_cooldown           ON fleet_health (cooldown_until);
CREATE INDEX idx_fleet_fetch_id           ON fleet_health (fetch_id);
```
- **`fetch_id`** (batch uuid) memungkinkan query "provider terbaru per fetch" utk timeline health.
- **Join:** `fleet_health.id` = `asks.provider_id`; `fleet_health.upstream_slug` = `upstreams.slug`.
- **Nullable penting:** `observed_*` & `apiKeyVerifiedAt` & `cooldownUntil` & `drainedUntil` sering `null` (codex/cline-pass) — jangan `NOT NULL`.

### 2.3 Tabel pembantu (rekomendasi)
```sql
CREATE TABLE upstreams (
  slug text PRIMARY KEY, prefix text, label text, status text,
  pricing_model text, fetched_at timestamptz DEFAULT now()
);

CREATE TABLE earnings_snapshot (
  id bigserial PRIMARY KEY,
  publisher_earnings_usdc numeric(20,8) NOT NULL,
  consumer_balance_usdc  numeric(20,8) NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  INDEX idx_earnings_fetched (fetched_at)
);

CREATE TABLE withdrawals (
  id uuid PRIMARY KEY, destination text, amount_usdc numeric(20,8),
  status text, signature text, network text, requested_at timestamptz,
  completed_at timestamptz, fetched_at timestamptz DEFAULT now()
);
-- All-time earning = (latest publisher_earnings_usdc) + SUM(amount_usdc WHERE status='confirmed')
```

---

## 3. Ringkasan untuk membangun 2 dashboard

**Dashboard (A) Ask Price Management** — sumber: `asks` + `upstreams`.
- Data utama: per provider×model → `ask_input/output`, `official_*`, `max_ask_*` (batas cap), `cheapest_active_pct`, `avg_price_requests` (demand).
- Kolom "room to raise" = `ask_input_per_mtok` jauh di bawah `max_ask_in` tapi demand tinggi.
- **Set harga (mutasi) memakai `upstreamCatalogModelId` (uuid) di path PUT — bukan `upstreamModelId`.**

**Dashboard (B) Fleet Health** — sumber: `fleet_health` + `asks` (model_count) + `earnings_snapshot` + `withdrawals`.
- KPI: total provider, split by `api_key_check_status` (ok/invalid), `drained_until` terisi, `cooldown_until`, `observed_used_pct` mendekati 100, `reactive_429` (source), model_count per provider.
- Payout gate: `publisher_earnings_usdc` ≥ threshold → hitung real all-time + total confirmed payout.
- **Poll smart:** `GET /providers` (1 req, gambar semua fleet) + `GET /providers/usage-windows` (batch, drain) + `GET /providers/{id}/asks`. Jangan poll asks utk semua 286 provider tiap request UI — cache di backend.

## 4. Safety & gotcha global
- Hanya endpoint read-only yang dieksekusi. PUT asks / POST transfer / DELETE = dokumentasi OpenAPI saja.
- Semua uang/harga = string.
- Count fleet & model bervariasi antar poll (286 provider skrg vs 125 di audit sebelumnya) — jangan hardcode.
- `upstreamModelId` tidak unik global (format beda per upstream) → selalu pakai `upstreamCatalogModelId` (uuid).