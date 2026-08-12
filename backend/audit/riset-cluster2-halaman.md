# Riset Cluster 2 — Arsitektur & Edge Case untuk 3 Halaman Dashboard Baru

**Tanggal:** 2026-08-11 · **Proyek:** Upstream dashboard (Faiz, publisher AI reseller)
**Sumber data:** `audit-usage-market.md` (live-verified), `audit-publisher.md`, `PLAN-cluster2-maximization.md`, design system `theme.jsx` + `App.css`
**Sifat data:** A=`/market`+`/pricing/config`=PUBLIC · `/v1/models`=Bearer · B=`/catalog`=Bearer · C=`/usage/*`=Bearer (**konsumen spend, BUKAN publisher earning**)

---

## 0. Prinsip lintas halaman (wajib di semua)

1. **Frontend hanya baca `/api/*` di backend Flask — DILARANG hit InferHub langsung dari browser** (auth/key tidak boleh bocor ke client). Backend sudah punya pass-through `/api/market`, `/api/catalog`, `/api/breakdown`, `/api/pricing-config`.
2. **Jujur soal semantik uang.** Data `/usage/*` = *consumer spend / cost*, **bukan** *publisher earnings*. Label headline selalu `Usage / Cost` atau `Consumen spend`. Jangan pernah memakai total usage sebagai headline earning Faiz (earning sejati = `/publisher/*` + withdrawals, sudah ada di halaman Earnings/P&L).
3. **Uang selalu string USDC desimal** dari API (`"0.000417"`) → `Number()`/`float()` sebelum math & display. `/market` di `$ / Mtoken`; `/pricing/config` `publisherSharePct` integer (80), dua lainnya float.
4. **Body shape API bervariasi — backend wajib normalisasi:** `/usage/logs/models` & `/catalog` → **array langsung**; `/v1/models` → `{data:[...]}`; `/market`, `/pricing/config` → **object langsung tanpa envelope**; `/usage/breakdown` → `{range, byModel[], byProviderModel[], byProvider[]}`.
5. **Design system Ledger (konsisten, premium):** dark `--bg:#0A0A0A`, layer `#000`, card `#1A1A1A`, border `#292929`, text `#EDEDED`; accent `#0080FF` (`--accent`), pos `#30A46C`, neg `#E5484D`, warn `#F5A623`. Hairline 1px border, radius 4px, **no drop-shadow/depth via layering**, angka `--font-mono` (JetBrains Mono) + `tabular-nums`, ikon **Lucide** (`lucide-react` sudah terpasang). Komponen siap pakai: `.panel`, `.panel-head`, `.tbl`, `.badge-*`, `.range-pills`, `.kpi`, `.dt-toolbar`/`.dt-search`, `.upstream-cards`/`.ucard`, `.skeleton`, `useApi` hook (polling), `usd()`/`fmtTok()`.
6. **Kosong/error state:** setiap tabel punya fallback `<tr><td colSpan={N} className="dt-empty">Belum ada data.</td></tr>`; setiap panel dibungkus `<SkeletonBlock loading>`; `lastRate`/`cacheWriteTokens`/`costUsdc` bisa `null` → tampilkan em-dash `—`, JANGAN `0` (menyesatkan).

---

## A. Halaman Market & Harga

- **Nama halaman:** `Market & Pricing` (sidebar: `Market & Pricing`)
- **Route:** `/market`
- **Sidebar section:** `Operations` (antara `Upstreams` dan `Analytics`)
- **Ikon Lucide:** `LineChart` atau `Percent` (market) — jangan `TrendingUp` (sudah dipakai Earnings). Rekomendasi: `CandlestickChart` atau `LineChart`.
- **Data:** `/market` (public, 90 model) + `/pricing/config` (public) + `/v1/models` (Bearer, 132 model, harga real-time). Cache di DB (`market_snapshot` sudah ada; tambah `active_models` dari `/v1/models`).

### Struktur UI (top → bottom)

1. **KPI bar (`.kpis`, 5 kolom):** ① Total models pasar ② Termurah minAskIn (model + $) ③ Termahal officialIn ④ Rentang spread (max−min ask) rata-rata ⑤ `lastRate` snapshot age / live-pill.
2. **Pricing-rules panel (`.panel` — kecil, read-only):** 3 kartu statis → *Max ask cap* `50%` of official · *Platform fee* `20%` · *Publisher share* `80%`. **Ini dasar math margin; tampilkan sebagai "aturan platform", bukan "earning".** (+ helper: `net share ≈ ask × 0.8`).
3. **Market table (`.panel` + `.tbl` datatable):** 90+ model, kolom di bawah. Toolbar: search (`model`/`slug`/`family`), filter upstream/family, sort.

### Kolom tabel (★ wajib)

| Kolom | Catatan |
|---|---|
| ★ Model (slug) | `prov-name` + `prov-sub` (family) |
| ★ Upstream / prefix | dedupe via label |
| ★ Min ask $ (in/out) | mono, `$`/Mtok |
| ★ Max ask $ (in/out) | mono |
| ★ Last rate $ | **bisa `null` → em-dash** |
| Official $ (in/out) | dari `/v1/models` `pricing.official_*` |
| Margin potensial | `official − min ask` (est. ruang, sebut "est.") |
| Cache-capable | badge `ok`/`neutral` dari `supports_cache` |

### Metrik utama
Min/max/spread ask per model; ruang margin vs official; model termurah/termahal; distribusi family.

### Filter berguna
Search (model/slug) · dropdown upstream/family · toggle "cache-capable only" · sort kolom numerik.

### Anti-pattern (JANGAN)
- ❌ **Jangan label `lastRate` atau harga market sebagai "earning"** — itu harga transaksi pasar, bukan pendapatan Faiz.
- ❌ Jangan tampilkan "margin" sebagai angka pasti — itu **estimasi** (`official − ask`), beri label `est. spread`.
- ❌ Jangan render `lastRate` `null` sebagai `$0.000` — use `—`.
- ❌ Jangan hit `/market` langsung dari browser (walau public) — lewat `/api/market` demi konsistensi & cache.
- ❌ Jangan pakai `/market/stream` SSE sekaligus polling — pilih satu (rekomendasi: polling `/api/market` 15–30s; SSE hanya jika butuh live-ticker nyata, tutup koneksi saat blur tab).

---

## B. Catalog / Kapasitas

- **Nama halaman:** `Catalog & Capacity` (sidebar: `Catalog & Capacity`)
- **Route:** `/catalog`
- **Sidebar section:** `Operations` (setelah `Market & Pricing`)
- **Ikon Lucide:** `Layers` sudah dipakai Upstreams → pakai `Boxes` atau `Grid3x3` / `Server`.
- **Data:** `/catalog` (Bearer, 10 upstream, `activeProviders` + `models[].asksIn/Out`). Cache DB `catalog_models` (perlu fix — sekarang 0) atau fetch hidup per request.

### Struktur UI

1. **Fleet summary (`.fleet-summary` grid auto-fit):** kartu per upstream → nama, `activeProviders` (angka besar), total models, enabled/disabled, badge status. **`activeProviders` = proxy kapasitas real-time — pilar koordinasi fleet.**
2. **Capacity table (`.panel` + `.tbl`):** per upstream × model, kolom di bawah.
3. **Detail panel opsional:** expand kartu upstream → daftar `asksIn[]`/`asksOut[]` raw + `officialIn/Out` + `supportsCache`.

### Kolom tabel (★ wajib)

| Kolom | Catatan |
|---|---|
| ★ Upstream (label + slug) | `prov-name` + `prov-sub` |
| ★ Active providers | `activeProviders` — angka besar mono |
| ★ Total models | count `models[]` |
| ★ Enabled / Disabled | badge `ok`/`warn` (`enabled`, `modelDisabled`) |
| ★ Asks range ($in) | min–max dari `asksIn[]` (raw `$`/Mtok) |
| Official $ in/out | parse string → float |
| Cache-capable | badge |

### Metrik utama
Active providers per upstream; total fleet capacity; rasio enabled/disabled; distribusi asks (min/max/median); upstream dengan kapasitas terbesar (CodeBuddy 443, Xiaomi 193, CodeBuddy CN 188, Codex 104 — dari audit).

### Filter berguna
Search (upstream/model) · filter upstream · status filter (enabled/disabled) · sort by activeProviders.

### Anti-pattern (JANGAN)
- ❌ **Jangan tampilkan PUT `enabled` toggle sebagai kontrol aktif.** Endpoint `PUT /catalog/{models|upstreams}/{uuid}/enabled` **belum di-live-test** (mutasi state konsumen nyata). Jika disertakan, tandai "experimental/manual" + konfirmasi modal + tombol restore, dan gunakan **uuid** dari `/catalog` (bukan `upstreamModelId`/slug, itu → 404/422). Rekomendasi safety: **tampilkan read-only dulu**, tanpa toggle.
- ❌ Jangan tampilkan `activeProviders` sebagai "jumlah model" — itu proxy kapasitas/provider, bukan model.
- ❌ Jangan asumsikan semua `asksIn[]` sama identitas — `0.5` bisa 5% dari official $5; tampilkan rentang, bukan interpretasi tunggal.
- ❌ Jangan render `officialIn/Out` (string) tanpa `Number()`.
- ❌ Jangan label kartu upstream sebagai "earning" — ini kapasitas/opsi, bukan pendapatan.

---

## C. Pemakaian / Cache

- **Nama halaman:** `Usage & Cache` (sidebar: `Usage & Cache`)
- **Route:** `/usage`
- **Sidebar section:** `Operations` (setelah `Catalog & Capacity`)
- **Ikon Lucide:** `Activity` atau `Gauge` / `Zap`. Rekomendasi: `Activity` (sudah dipakai di konsep lain? cek) → `Gauge` aman.
- **Data:** `/usage/breakdown` (Bearer, `byProvider[]`/`byProviderModel[]`/`byModel[]`) + `/usage/cache-stats` (Bearer) + `/usage/logs` + `/usage/logs/models` (Bearer). Semua parameter `range` `24h|7d|30d|90d|all`.

### ⚠️ SEMANTIK WAJIB: ini **consumer spend/cost**, BUKAN publisher earning.
Headline & semua label pakai `Usage`/`Cost`/`Spend`/`Consumer usage`. Jangan sebut "earning". Jangan jadikan `byModel` sebagai "ranking token terjual publisher" — ranking publisher sejati = `/publisher/providers/{id}/asks` `avgPriceRequests` (halaman Analytics).

### Struktur UI

1. **KPI bar (`.kpis`):** ① Total consumer cost (range) ② Total tokens ③ Total requests ④ Cache hit rate overall ⑤ **Cache saved $** (`totalSavedUsdc` — label "Saved (cache)" / "Hemat biaya via cache", BUKAN earning).
2. **Range pills** (`.range-pills`: 24h/7d/30d/90d/all) — header shared, refetch semua panel.
3. **Spend by provider table (`.panel` + `.tbl`):** `byProvider[]` → Provider label, prefix, reqs, input tokens, output tokens, cost. Kolom ★: Provider, Reqs, Input Tokens, Output Tokens, **Cost $** (mono, label `Cost`).
4. **Spend by model table:** `byProviderModel[]` (dedupe!). Kolom ★: Model, Provider, Reqs, Tokens, Cost $. (opsional gabung `byModel[]`).
5. **Cache stats panel (`.panel`):** `cache-stats.rows[]` → Model label, reqs, prompt tokens, cached tokens, **hit rate %** (cached/prompt), cache-write tokens. Highlight model dgn hit rate tinggi (hemat biaya) vs 0 (cache-disabled).
6. **Usage logs table (`.panel` + `.tbl` datatable):** `logs.rows[]` paginated → ts, status, http_status, model, upstream_label, prompt/completion/cached tokens, cost, ttft, duration. **Toolbar:** search model + status filter + sort. Dropdown model dari `/usage/logs/models`.

### Kolom wajib
- Provider table: Provider, Reqs, InputTok, OutputTok, **Cost $**.
- Cache table: Model, Reqs, PromptTok, CachedTok, **HitRate %**, Saved-est.
- Logs table: Time(ts), Status(badge), Model, Upstream, Tokens(in/out/cached), **Cost $**, TTFT, Duration.

### Metrik utama
Total consumer cost & tokens per range; per-provider & per-model breakdown; cache hit-rate overall + saved $; status distribution (ok/4xx/5xx/429) dari logs; latensi (ttft/duration).

### Filter berguna
Range pills · status filter (ok/error/4xx/5xx/429) · model dropdown (dari `/usage/logs/models`) · sort by cost/tokens/ts · pagination (page/pageSize).

### Anti-pattern (JANGAN) — paling penting
- ❌ **JANGAN sebut "earning" di halaman ini.** Semua angka = consumer cost. Label jujur: `Usage`, `Cost`, `Spend`, `Consumer spend`. `totalSavedUsdc` = *saved via cache*, bukan pendapatan.
- ❌ **Jangan gunakan `byModel` sebagai ranking "model laku/terjual publisher".** `byModel` ≈ spend konsumen; entri bisa **duplikat** (key sama muncul 3× utk provider beda) → **dedupe dengan `(key, label)`**.
- ❌ Jangan tampilkan "margin/earning" di samping cost — silang konsep (cost ≠ revenue).
- ❌ Jangan render `total` vs `rangeTotal` campur aduk — pakai `rangeTotal` untuk konsistensi dengan filter.
- ❌ Jangan tampilkan `cacheWriteTokens` sebagai nilai utama — sering `0`/null; tampilkan opsional.
- ❌ Jangan ignore `totalSavedUsdc` yang besar ($937 vs cost $11) tanpa konteks — jika ditampilkan, selalu berlabel "cache savings" agar tidak salah baca sebagai earning.

---

## Rangkuman penamaan & route

| Halaman | Route | Sidebar section | Ikon Lucide |
|---|---|---|---|
| Market & Pricing | `/market` | Operations | `LineChart` / `CandlestickChart` |
| Catalog & Capacity | `/catalog` | Operations | `Boxes` / `Server` |
| Usage & Cache | `/usage` | Operations | `Gauge` / `Activity` |

Semua masuk `SECTIONS[Operations]` di `Sidebar.jsx`, urut: Market → Catalog → Usage → (Analytics/PnL). Route baru ditambah di `App.jsx` dalam `<Layout>`.

---

## Checklist implementasi backend (endpoint `/api/*` yang perlu ada/dipastikan)

- [ ] `/api/market` ✅ ada (pass-through) — tampilkan `models[]` normalisasi.
- [ ] `/api/pricing-config` ✅ ada — sudah DB `pricing_config`.
- [ ] `/api/v1-models` (baru) — cache `/v1/models` ke DB `active_models`, enabler frontend tanpa Bearer.
- [ ] `/api/catalog` ✅ ada — normalisasi array → `{upstreams:[...]}`.
- [ ] `/api/usage/breakdown` (baru) — pass-through `/usage/breakdown` + dedupe `byModel`.
- [ ] `/api/usage/cache-stats` (baru) — pass-through `/usage/cache-stats`.
- [ ] `/api/usage/logs` + `/api/usage/logs-models` (baru) — pass-through `/usage/logs` + array `/usage/logs/models`.
- [ ] Rate-limit: poll `/api/*` ≥15s (audit). Public `/market` bisa di-cache di DB `market_snapshot`.

## Anti-slop / quality bar
- Setiap halaman dibangun berdasar data nyata (terverifikasi live), bukan asumsi.
- Verify tiap layer: API → DB → backend → frontend → build → deploy.
- UI konsisten dengan KPI/P&L yang sudah dikunci (Analytics, PnL).
- Tidak ada halaman "asal jadi" — tiap halaman harus bernilai & benar secara business.