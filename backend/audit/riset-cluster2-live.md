# Audit Live Cluster 2 — InferHub Publisher-Relevant Endpoints

**Tanggal audit:** 2026-08-11
**Operator:** Faiz / dashboard "Upstream" (finance)
**Metode:** Live GET 1–2× per endpoint, `Authorization: Bearer <INFERHUB_API_KEY>`, `User-Agent` header wajib (403 tanpa UA).
**Base URL:** Management `https://inferhub.dev/api/<path>` · Inference `https://api.inferhub.dev/v1/...`
**Catatan penting:** Semua uang bertipe **string decimal** (USDC) kecuali beberapa field numerik. JANGAN lakukan endpoint mutasi (PUT) — hanya read.

---

## Ringkasan bentuk handler (non-uniform!)

| Endpoint | Shape killing | Backend harus |
|---|---|---|
| `GET /market` | **object langsung** `{ts, models[]}` | baca `d.models` |
| `GET /pricing/config` | **object langsung** `{...}` | baca `d` langsung |
| `GET /catalog` | **bare array langsung** (10 card) | baca `Array.isArray(d)?d:[]` — JANGAN `.cards` |
| `GET /v1/models` | **`{object, data[]}`** | baca `d.data` |
| `GET /usage/cache-stats` | **object** `{range, rows[], totals}` | baca `d.rows` / `d.totals` |
| `GET /v1/me/usage` | **object langsung** ter-nested | baca `d` langsung |

---

# 1. GET `/market` — pasaran (public, tanpa auth)

**Shape:** object langsung. `{"ts": <epoch_ms int>, "models": [ ... ]}`
**Jumlah record:** **86 model** (bukan 90 literal — turun dari 90 di audit sebelumnya; fluktuatif).
**Field per model (lengkap):**

| Field | Tipe | Contoh |
|---|---|---|
| `slug` | string | `"cb/claude-opus-4.6"` |
| `family` | string | `"CodeBuddy"` |
| `minAskIn` | angka (float, $/Mtok) | `0.14999` |
| `minAskOut` | angka | `0.74999` |
| `maxAskIn` | angka | `2.5` |
| `maxAskOut` | angka | `12.5` |
| `lastRate` | angka (float, rate terakhir) | `0.6693451185214946` |

**Distinct families (10):** Claude Code, ClinePass, CodeBuddy, CodeBuddy CN, Command Code, OpenAI Codex, OpenCode Go, SiliconFlow, Xiaomi MiMo, Z.AI GLM Coding Plan.

**Contoh data:**
```json
{"slug":"cb/claude-opus-4.6","family":"CodeBuddy","minAskIn":0.14999,
 "minAskOut":0.74999,"maxAskIn":2.5,"maxAskOut":12.5,"lastRate":0.6693451185214946}
```

**Rekomendasi skema PostgreSQL — tabel `market_snapshot`** (snapshot timestamp + per-model):
```sql
CREATE TABLE market_snapshot (
  id          BIGSERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),   -- dari ts
  slug        TEXT        NOT NULL,                  -- composite key
  family      TEXT,
  min_ask_in  DOUBLE PRECISION NOT NULL,
  min_ask_out DOUBLE PRECISION NOT NULL,
  max_ask_in  DOUBLE PRECISION NOT NULL,
  max_ask_out DOUBLE PRECISION NOT NULL,
  last_rate   DOUBLE PRECISION,
  UNIQUE (captured_at, slug)
);
```
Catatan: `lastRate` bisa float presisi tinggi → `DOUBLE PRECISION`; uang di sini numerik (bukan string).

---

# 2. GET `/pricing/config` — aturan pricing (public, tanpa auth)

**Shape:** object langsung (3 field, skalar). **Jumlah: 1 record.**
```json
{"maxAskPctOfOfficial": 0.5, "platformFeePct": 0.2, "publisherSharePct": 80}
```
- `maxAskPctOfOfficial`: **0.5** → hard cap ask = maks 50% dari official price.
- `platformFeePct`: **0.2** → platform ambil 20%.
- `publisherSharePct`: **80** → take-home publisher per Mtoken = `ask × 0.8` (80%).

**Rekomendasi skema PostgreSQL — tabel `pricing_config`** (single row, upsert):
```sql
CREATE TABLE pricing_config (
  id                  SMALLINT PRIMARY KEY DEFAULT 1,  -- single row
  max_ask_pct_of_official DOUBLE PRECISION NOT NULL,
  platform_fee_pct        DOUBLE PRECISION NOT NULL,
  publisher_share_pct     INTEGER        NOT NULL,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

# 3. GET `/catalog` — kartu upstream (AUTH)

**Shape: bare array langsung** — 10 elemen (kartu upstream). JANGAN baca `.cards`/`.data`.
**Field per kartu (lengkap):** `id` (uuid), `slug`, `prefix`, `label`, `status` (`available`), `upstreamDisabled` (bool), `enabled` (bool), `activeProviders` (int), `models[]`.

**Field per model (union keys):** `id` (uuid), `upstreamModelId` (string slug), `label` (nullable), `officialIn` (string decimal), `officialOut` (string decimal), `asksIn[]` (array angka), `asksOut[]` (array angka), `enabled` (bool), `modelDisabled` (bool), `supportsCache` (bool).

**Jumlah:** 10 kartu · **90 model** total. `activeProviders` per kartu: claude-code 3 · cline-pass 5 · codebuddy 676 · codebuddy-cn 295 · commandcode 22 · codex 74 · opencode-go **0** · siliconflow 1 · xiaomi-mimo 188 · z-ai 2.

**Peringatan penting (edge case):** `asksIn`/`asksOut` adalah ARRAY — panjangnya = jumlah provider aktif yang punya ask untuk model itu. **Bisa `[]` kosong** (mis. semua model di kartu `opencode-go` yang `activeProviders=0`). Handler harus toleran array penuh/parsial/kosong. `officialIn`/`officialOut` string decimal.

**Contoh data (kartu claude-code, 1 model):**
```json
{"id":"b8eba2eb-1375-48ae-8fb9-31920f40b12b","slug":"claude-code","prefix":"cc",
 "label":"Claude Code","status":"available","upstreamDisabled":false,"enabled":true,
 "activeProviders":3,
 "models":[{"id":"eac4da12-04f0-4314-bb80-4e43bcacb322",
   "upstreamModelId":"claude-fable-5","label":null,
   "officialIn":"10.00000000","officialOut":"50.00000000",
   "asksIn":[5,5,5],"asksOut":[25,25,25],
   "enabled":true,"modelDisabled":false,"supportsCache":true}]}
```

**Rekomendasi skema PostgreSQL — 2 tabel (master upstream + per-model):**
```sql
CREATE TABLE catalog_upstreams (
  id            UUID PRIMARY KEY,               -- kartu /catalog id
  slug          TEXT UNIQUE NOT NULL,
  prefix        TEXT,
  label         TEXT,
  status        TEXT,
  enabled       BOOLEAN NOT NULL,
  upstream_disabled BOOLEAN NOT NULL DEFAULT false,
  active_providers INTEGER NOT NULL DEFAULT 0,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalog_models (
  id            UUID PRIMARY KEY,               -- model uuid (dipakai PUT enabled)
  upstream_id   UUID NOT NULL REFERENCES catalog_upstreams(id) ON DELETE CASCADE,
  upstream_model_id TEXT NOT NULL,              -- slug model (mis. claude-fable-5)
  label         TEXT,
  official_in   NUMERIC(20,8) NOT NULL,         -- string decimal → numeric
  official_out  NUMERIC(20,8) NOT NULL,
  enabled       BOOLEAN NOT NULL,
  model_disabled BOOLEAN NOT NULL DEFAULT false,
  supports_cache BOOLEAN NOT NULL DEFAULT false,
  n_active_asks INTEGER NOT NULL DEFAULT 0,     -- len(asksIn)
  UNIQUE (upstream_id, upstream_model_id)
);
-- (asksIn/asksOut array → simpan sebagai JSONB atau tabel child; lihat catatan)
ALTER TABLE catalog_models ADD COLUMN asks_in  JSONB;
ALTER TABLE catalog_models ADD COLUMN asks_out JSONB;
```
Catatan: `asksIn` array → JSONB cukup (jumlah provider kecil, query jarang). Jika perlu agregasi per-model, normalisasi ke tabel child `catalog_model_asks (model_id, ask_in, ask_out, idx)`.

---

# 4. GET `/v1/models` — model + pricing (AUTH, base `api.inferhub.dev`)

**Shape: `{"object":"list","data":[ ... ]}`** — baca `d.data`.
**Jumlah record:** **132 model**.
**Field per model (union):** `id` (slug, mis. `"cb/claude-opus-4.6"`), `object` (`"model"`), `created` (epoch int), `owned_by` (prefix, mis. `"cb"`), `pricing` (object), `supports_cache` (bool), `modality` (string, mis. `"text,image"`), `upstream_label` (string).

**`pricing` object (lengkap):** `official_in` (angka), `official_out` (angka), `asks_in[]` (array angka), `asks_out[]` (array angka), `min_ask_in`, `min_ask_out`.

**Contoh data:**
```json
{"id":"cb/claude-opus-4.6","object":"model","created":1786426201,"owned_by":"cb",
 "pricing":{"official_in":5,"official_out":25,
   "asks_in":[0.14999,0.15,0.25,0.45,0.47,0.5,0.8,1,2.5],
   "asks_out":[0.74999,0.75,1.25,2.25,2.35,2.5,4,5,12.5],
   "min_ask_in":0.14999,"min_ask_out":0.74999},
 "supports_cache":false,"modality":"text,image","upstream_label":"Claude Opus 4.6"}
```
Catatan: `official_in/out` di sini **numerik** (bukan string seperti di `/catalog`). `min_ask_in` = elemen pertama `asks_in` (terkecil).

**Rekomendasi skema PostgreSQL — 2 tabel:**
```sql
CREATE TABLE models (
  id            TEXT PRIMARY KEY,               -- slug model (cb/claude-opus-4.6)
  object        TEXT NOT NULL DEFAULT 'model',
  created_at    TIMESTAMPTZ,                    -- created (epoch)
  owned_by      TEXT,
  supports_cache BOOLEAN NOT NULL DEFAULT false,
  modality      TEXT,
  upstream_label TEXT,
  official_in   DOUBLE PRECISION NOT NULL,
  official_out  DOUBLE PRECISION NOT NULL,
  min_ask_in    DOUBLE PRECISION,
  min_ask_out   DOUBLE PRECISION,
  asks_in       JSONB,                          -- array angka
  asks_out      JSONB,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

# 5. GET `/usage/cache-stats` — statistik cache (AUTH)

**Shape: object** `{"range":..., "rows":[ ... ], "totals":{...}}`. Header `hitRate` **tidak eksis di level atas** (None) — hit rate ada di dalam `totals.hitRate`.
**Jumlah record:** **13 rows** (per label model/upstream).
**Field per row:** `label` (mis. `"cp/cline-pass/deepseek-v4-flash"`), `reqs` (int), `promptTokens` (int), `cachedTokens` (int), `cacheWriteTokens` (int).

**`totals` (lengkap):** `reqs`, `promptTokens`, `cachedTokens`, `cacheWriteTokens`, **`hitRate`** (float ratio, mis. `0.7702885378634534`).

**Contoh data:**
```json
{"range":"24h","rows":[{"label":"cp/cline-pass/deepseek-v4-flash","reqs":7221,
  "promptTokens":1795645782,"cachedTokens":1637529923,"cacheWriteTokens":0}],
 "totals":{"reqs":13128,"promptTokens":2391669231,"cachedTokens":1842275395,
  "cacheWriteTokens":0,"hitRate":0.7702885378634534}}
```

**Rekomendasi skema PostgreSQL — tabel `cache_stats`** (snapshot per range):
```sql
CREATE TABLE cache_stats (
  id            BIGSERIAL PRIMARY KEY,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  range         TEXT NOT NULL,                 -- 24h / dst
  label         TEXT NOT NULL,                 -- mis. cp/cline-pass/deepseek-v4-flash
  reqs          BIGINT NOT NULL,
  prompt_tokens BIGINT NOT NULL,
  cached_tokens BIGINT NOT NULL,
  cache_write_tokens BIGINT NOT NULL,
  UNIQUE (captured_at, range, label)
);
-- totals → simpan di tabel meta atau kolom terpisah:
CREATE TABLE cache_stats_totals (
  id            BIGSERIAL PRIMARY KEY,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  range         TEXT NOT NULL UNIQUE,
  reqs          BIGINT NOT NULL,
  prompt_tokens BIGINT NOT NULL,
  cached_tokens BIGINT NOT NULL,
  cache_write_tokens BIGINT NOT NULL,
  hit_rate      DOUBLE PRECISION NOT NULL
);
```

---

# 6. GET `/v1/me/usage` — balance + window + top_model (AUTH, base `api.inferhub.dev`)

**Shape: object langsung** ter-nested. **Jumlah: 1 record akun.**
**Top-level keys:** `object` (`"account.usage"`), `currency` (`"USDC"`), `balance`, `window`, `all_time`, `session`, `top_model`, `cache`.

- **`balance`:** `{amount_usdc: "1.205976" (string decimal), updated_at}` → **ini CONSUMER balance (saldo akun), BUKAN publisher earning.**
- **`window`:** `{kind:"day", tz:"UTC", since, until, requests, prompt_tokens, completion_tokens, total_tokens, spend_usdc (string)}`
- **`all_time`:** `{requests, prompt_tokens, completion_tokens, total_tokens, spend_usdc}`
- **`session`:** `{id, requests, prompt_tokens, completion_tokens, total_tokens, spend_usdc, since, until}`
- **`top_model`:** `{model:"cx/gpt-5.6-terra", requests, tokens, spend_usdc}`
- **`cache`:** `{cached:false, ttl_seconds:30}`

**Contoh data:**
```json
{"object":"account.usage","currency":"USDC",
 "balance":{"amount_usdc":"1.205976","updated_at":"2026-08-11T05:30:00Z"},
 "window":{"kind":"day","tz":"UTC","since":"2026-08-11T00:00:00Z","until":"2026-08-11T05:30:03Z",
   "requests":345,"prompt_tokens":59364683,"completion_tokens":312105,
   "total_tokens":59676788,"spend_usdc":"0.535253"},
 "all_time":{"requests":12811,"prompt_tokens":2338707464,"completion_tokens":6089554,
   "total_tokens":2344797018,"spend_usdc":"11.250356"},
 "session":{"id":"c3955cbb4a6ded1f044052144bdb3019","requests":3,
   "prompt_tokens":87727,"completion_tokens":1582,"total_tokens":89309,
   "spend_usdc":"0.000650","since":"2026-08-11T05:29:41Z","until":"2026-08-11T05:30:00Z"},
 "top_model":{"model":"cx/gpt-5.6-terra","requests":2287,"tokens":211188631,"spend_usdc":"5.419859"},
 "cache":{"cached":false,"ttl_seconds":30}}
```
**⚠️ Semantik (kritis):** `/v1/me/usage` adalah **CONSUMER-side** (spend akun sebagai pembeli lewat key-nya), BUKAN publisher earning. `balance` = saldo consumer, `spend_usdc` = pengeluaran consumer. JANGAN tampilkan sebagai earning publisher. Publisher earning = `/publisher/earnings` + `/publisher/withdrawals`.

**Rekomendasi skema PostgreSQL — tabel `account_usage`** (snapshot berkala):
```sql
CREATE TABLE account_usage (
  id               BIGSERIAL PRIMARY KEY,
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  currency         TEXT NOT NULL DEFAULT 'USDC',
  balance_usdc     NUMERIC(20,8) NOT NULL,       -- string decimal → numeric
  balance_updated_at TIMESTAMPTZ,
  -- window (day)
  win_kind         TEXT, win_since TIMESTAMPTZ, win_until TIMESTAMPTZ,
  win_requests     BIGINT, win_prompt_tokens BIGINT,
  win_completion_tokens BIGINT, win_total_tokens BIGINT,
  win_spend_usdc   NUMERIC(20,8),
  -- all_time
  at_requests      BIGINT, at_prompt_tokens BIGINT,
  at_completion_tokens BIGINT, at_total_tokens BIGINT,
  at_spend_usdc    NUMERIC(20,8),
  -- session
  sess_id          TEXT, sess_since TIMESTAMPTZ, sess_until TIMESTAMPTZ,
  sess_requests    BIGINT, sess_prompt_tokens BIGINT,
  sess_completion_tokens BIGINT, sess_total_tokens BIGINT,
  sess_spend_usdc  NUMERIC(20,8),
  -- top_model
  top_model        TEXT, top_requests BIGINT, top_tokens BIGINT, top_spend_usdc NUMERIC(20,8)
);
```

---

## Konsolidasi lintas-endpoint (untuk reference/join)

| Konsep | `/market` | `/catalog` | `/v1/models` | `/usage/cache-stats` |
|---|---|---|---|---|
| Slug model | `slug` | `upstreamModelId` | `id` | `label` (prefix/upstream/model) |
| Official price | — | `officialIn/Out` (string) | `pricing.official_in/out` (angka) | — |
| Asks | min/max | `asksIn/asksOut[]` (arr) | `pricing.asks_in/out[]` (arr) + min | — |
| Penanda join | `slug` | `upstreamModelId` | `id` | parse `label` (split `/`) |

- **Join key lintas 4 data source:** slug model (`slug` == `upstreamModelId` == `id`). `label` di cache-stats format `{prefix}/{upstream}/{model}` → split `/` untuk ambil model slug.
- **Official price tidak konsisten tipe:** `/catalog` string `"10.00000000"` vs `/v1/models` angka `5` → normalisasi ke `NUMERIC(20,8)`/`DOUBLE PRECISION` saat persist.
- **Semua uang:** string decimal kecuali field numerik bawaan (market, v1/models, cache counts). Parse dengan `float()`/`NUMERIC`.

## Gotcha / tindakan yang harus dihindari
- **JANGAN** tampilkan `/v1/me/usage` (`balance`, `spend_usdc`) sebagai earning publisher — itu consumer spend.
- Header `hitRate` tidak ada di level atas cache-stats; baca `totals.hitRate`.
- `/catalog` = bare array; `/v1/models` = `{data:[]}`; `/market` + `/pricing/config` + `/v1/me/usage` = object langsung. Backend harus align per endpoint.
- `asksIn/asksOut` bisa `[]` (kartu dengan `activeProviders=0`).
- Endpoint ini read-only; tidak ada mutasi yang diuji.