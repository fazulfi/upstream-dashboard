# Riset Lengkap Sistem Pricing/Ask InferHub — Dasar Algoritma Auto-Pricing (CodeBuddy + CodeBuddy CN)

**Tanggal:** 2026-08-11
**Auditor:** Suisui (subagent riset pricing)
**Metode:** Baca penuh OpenAPI + master-audit + 4 audit cluster + live-read GET (tanpa mutasi). Semua PUT (asks/budgets) HANYA didokumentasikan, TIDAK dieksekusi.
**Status live saat riset:** 286 provider, balance publisher ~$25+14×$10 withdrawal, 10 upstream, `pricing/config` = `{maxAskPctOfOfficial:0.5, platformFeePct:0.2, publisherSharePct:80}`.
**Tujuan:** sumber kebenaran field pricing + rekomendasi formula auto-pricing yang benar & aman (termurah, jaga margin, tidak feedback-loop) utk upstream **`codebuddy`** (cb) dan **`codebuddy-cn`** (cbcn).

---

## 0. TL;DR (jawaban 6 pertanyaan kunci)

1. **Field di `GET /publisher/providers/{id}/asks`** — dijelaskan lengkap di §1. Inti: `maxAskIn/Out` = batas harga tertinggi (cap), `askInputPerMtok` = harga jual kita saat ini, `cheapestActivePct` = % dari official yang menjadi harga termurah AKTIF di marketplace, `avgPriceRequests` = volume demand GLOBAL (bukan volume kita), `defaultDiscountPct` = diskon default saat model baru dibuat.
2. **`PUT /publisher/upstreams/{slug}/asks/{modelId}`** — body `{askInputPerMtok, askOutputPerMtok}` (string desimal), **tab-wide** (berlaku ke semua provider upstream itu), `modelId` di path = **`upstreamCatalogModelId` (uuid)**, cap-enforced → **ditolak 422 di atas `maxAskIn`**. Detail §2.
3. **`/budgets` vs `/publisher/upstreams/{slug}/asks`** — `/budgets` = alat **konsumen** (berapa MAU dibayar saat beli), BUKAN harga jual publisher. Auto-pricing "jadi termurah" yang benar = **`PUT .../asks`** (harga jual). Budget TIDAK mengubah ask. Detail §3.
4. **Sumber "harga kompetitor termurah" yang benar** = **`GET /market` → `models[].minAskIn`** (harga termurah AKTIF di seluruh pool, termasuk ask kita). `budgets.marketMinAskIn` = **SINYAL PLASTIK (official × 0.01)** — salah & menyesatkan. `cheapestActivePct` = **% saja, bukan harga rupiah**. Anti-feedback-loop: jangan undercut jika kita sudah termurah. Detail §4.
5. **Cara tahu harga ask kita per model** = `GET /publisher/providers/{id}/asks` → `askInputPerMtok`/`askOutputPerMtok`. Tab-wide → cukup baca SATU provider per upstream (asks identik dalam upstream — terverifikasi: 3 provider cbcn deepseek-v4-flash semuanya `0.007`). `/budgets` TIDAK menunjukkan ask kita. Detail §5.
6. **Formula auto-pricing aman** — §6. Rekomendasi utama: floor yang benar = **`0.05 × official`** (= 95% lebih murah dari official), BUKAN `0.95 × official` (yang mustahil/absurd karena di atas cap). Undercut `market.minAskIn − 0.0001`, clamp ke floor & `maxAskIn`, anti-feedback-loop guard.

---

## 1. Arti setiap field di `GET /publisher/providers/{id}/asks`

Skema (dari OpenAPI, resolved `$ref`): elemen array per-model dengan field → tipe → definisi → contoh live (codebuddy / codebuddy-cn).

| Field | Tipe | Definisi (OpenAPI + live) | Contoh live |
|---|---|---|---|
| `upstreamCatalogModelId` | string uuid | **Identitas model di path PUT asks** (`{modelId}`). Satu-satunya field uuid. | `cf829cf0-…` (cb/claude-opus-4.6) |
| `upstreamModelId` | string | Nama model string **tidak unik global** (format beda per upstream). Bukan key utk PUT. | `gpt-5.4` (cb) vs `deepseek-v4-flash` (cbcn) |
| `modelStatus` | string | `available` \| `limited`. | `available` |
| `modality` | string | Tipe konten. | `text,image` / `text` |
| **`askInputPerMtok`** | string (nullable) | **Harga jual (ask) kita saat ini utk input**, $/Mtok. Ini yang mau kita kendalikan. | `"0.15000000"` (cb) / `"0.00700000"` (cbcn) |
| `askOutputPerMtok` | string (nullable) | Harga jual kita utk output. | `"0.75000000"` / `"0.01400000"` |
| `enabled` | boolean | Model aktif di pool? | `true` |
| `officialInputPerMtok` | string | **Harga resmi official** input $/Mtok. Anchor semua persen. | `"5.00000000"` (cb opus) / `"0.14000000"` (cbcn deepseek) |
| `officialOutputPerMtok` | string | Harga resmi official output. | `"25.00000000"` / `"0.28000000"` |
| **`defaultDiscountPct`** | number | **Diskon default** yang dipakai saat model baru dibuat/di-reset. Bukan ask aktual. Berbeda per upstream (codex 50, cb/cbcn 100 → ask default = 0% dari official? no: ini default diskon, nilai aktual lihat askInput). | `100` (cb, cbcn), `50` (codex) |
| **`maxAskPct`** | number | **Persen maksimum ask terhadap official** yang boleh diset (== `maxAskPctOfOfficial` dari `/pricing/config`, = 50). | `50` |
| **`maxAskIn`** | number float | **BATAS HARGA TERTINGGI input** yang boleh diset = `official × maxAskPct/100`. **PUT di atas ini → 422.** | `2.5` (cb opus, = 5×0.5); `0.07` (cbcn, = 0.14×0.5) |
| `maxAskOut` | number float | Sama utk output. | `12.5` / `0.14` |
| `avgPriceIn` | string (nullable) | Rata-rata harga input yang benar-benar ter-trade di marketplace utk model ini (blended). Null bila belum ada trade (kimi-k2.7). | `"0.15042…"` (cb opus) |
| `avgPriceOut` | string (nullable) | Sama utk output. | `"0.01324…"` |
| **`avgPriceRequests`** | integer | **Volume demand GLOBAL marketplace** utk model ini (jumlah request), BUKAN volume fleet kita. Indikator popularitas. **Jangan dijadikan "share fleet".** | `860` (cb opus), `9486` (cbcn deepseek), `0` (kimi-k2.7) |
| **`cheapestActivePct`** | number (nullable) | **% dari official** yang menjadi harga termurah AKTIF di pool. **Hanya persen, bukan harga $.** | `3` (cb opus: 5×0.03=$0.15), `3` (cbcn deepseek: 0.14×0.03=$0.0042) |

**Contoh konversi angka (cb/claude-opus-4.6):**
- official input = $5.00 → ask kita = $0.15 → kita jual di **3%** dari official.
- cap: `maxAskIn` = $2.50 (= 50% dari $5). Jadi kita punya ruang naik sampai $2.50.
- `cheapestActivePct` = 3 → harga termurah di pool = $0.15 (== ask kita, karena kita yang termurah).
- `avgPriceRequests` = 860 → ~860 request marketplace utk model ini.

> ⚠️ **`avgPriceRequests` = global, bukan milik kita.** Sudah jadi hard lesson (skill): jangan pernah tampilkan `requests_model/total_requests` sebagai "share fleet kita" (kimi-k3 tampak 36% padahal itu global). Hanya untuk mengukur popularitas model.

---

## 2. `PUT /publisher/upstreams/{slug}/asks/{modelId}` — cara kerja, efek, batasan

**Skema (OpenAPI):**
- Path params: `slug` (string, = prefix upstream: `codebuddy` / `codebuddy-cn`), `modelId` (**string uuid**).
- Body: `{"askInputPerMtok": "string", "askOutputPerMtok": "string"}` — keduanya **desimal string** (mis. `"0.0950"`).
- Response: 200 sukses; **422** di atas cap.

**Bagaimana bekerja / efek:**
- **`modelId` di path = `upstreamCatalogModelId` (uuid)**, BUKAN `upstreamModelId` (string bebas). Ini koreksi kritis dari `audit-publisher.md` (yang semula menyangka `upstreamModelId`). Memakai `upstreamModelId` di path → 404/422.
- **Tab-wide:** harga berlaku untuk **SEMUA provider** di upstream tersebut sekaligus (bukan per-provider). Terverifikasi: asks identik antar 3 provider cbcn (`0.007` utk deepseek-v4-flash di semua). Jadi utk auto-pricing cukup PUT 1× per model per upstream, cukup baca asks dari 1 provider.
- Efek ekonomi: mengubah **margin jual** kita utk model itu di seluruh fleet upstream. Ini KENDALI revenue yang sebenarnya (bukan `/budgets`).

**Batasan / apa yang ditolak:**
- **Ditolak 422 jika `askInputPerMtok > maxAskIn`** (atau `askOutputPerMtok > maxAskOut`). `maxAskIn = official × maxAskPct/100`, dengan `maxAskPct = 50` (dari `/pricing/config` `maxAskPctOfOfficial:0.5`). Jadi **batas mutlak jual = 50% harga resmi official**; tidak bisa jual di atas itu.
- Backend dashboard (`/api/ask` di `app.py`) sudah meng-rebound terhadap `max_ask_in` sebelum PUT agar frontend tak bisa push harga invalid; API sendiri tetap 422 di atas cap → logika algo harus clamp sebelum PUT.
- Nilai ≤ 0 / non-numeric → validation error.
- Karena ini mutasi harga jual nyata (mempengaruhi earning riil), **TIDAK boleh dieksekusi tanpa otorisasi.** Algo harus dry-run dulu.

---

## 3. `/budgets` vs `/publisher/upstreams/{slug}/asks` — mana untuk auto-pricing?

**Perbedaan fundamental (sisi yang diatur):**

| Aspek | `/budgets` (GET/PUT/DELETE) | `PUT /publisher/upstreams/{slug}/asks/{modelId}` |
|---|---|---|
| Sisi | **CONSUMER** (berapa mau BAYAR saat beli penggunaan) | **PUBLISHER** (harga JUAL kapasitas) |
| Field inti | `maxInputPerMtok`, `maxOutputPerMtok`, `minDiscountPct` | `askInputPerMtok`, `askOutputPerMtok` |
| Efek | Membatasi harga maksimum yang akun ini sanggup bayar utk model itu (pengeluaran) | Menentukan harga jual di marketplace utk semua konsumen (pendapatan) |
| Untuk "jadi termurah" | ❌ TIDAK — budget tidak mengubah ask | ✅ YA — inilah satu-satunya lever harga jual |
| `marketMinAskIn` | Anchor info (lihat §4 — **menyesatkan**) | — |

**Keputusan:** Untuk auto-pricing agar **jadi termurah**, yang benar = **`PUT /publisher/upstreams/{slug}/asks/{modelId}`**. `/budgets` sama sekali bukan alat harga jual — sudah jadi hard lesson (Faiz: "ini kan budget untuk consumer, kenapa kamu tampilkan ini?" → halaman Budgets dihapus dari dashboard). Budget hanya berguna jika Faiz mau membatasi *pengeluaran konsumen* dirinya sendiri, bukan untuk jualan.

> Catatan otomasi budget (dari audit): `PUT /budgets/{modelId}` + `PUT /budgets/aliases` mengembalikan body kosong → selalu follow-up GET utk verifikasi. Key budget = `upstreamCatalogModelId` juga. Tapi ini DI LUAR scope auto-pricing harga jual.

---

## 4. Sumber "harga kompetitor termurah" yang benar & akurat + anti-feedback-loop

**Empat kandidat sumber, dan verdict live:**

| Sumber | Field | Apa itu | Akurat untuk undercut? |
|---|---|---|---|
| `GET /market` | `models[].minAskIn` | **Harga termurah AKTIF di seluruh pool** ($/Mtok), termasuk ask kita. | ✅ **BENAR — gunakan ini.** |
| `GET /budgets` | `marketMinAskIn` | **SINYAL PLASTIK** = `official × 0.01` (1%). Terverifikasi live: semua 18 row cb/cbcn `marketMinAskIn == officialInputPerMtok × 0.01`. | ❌ **SALAH — jangan pakai.** |
| `GET /publisher/providers/{id}/asks` | `cheapestActivePct` | % dari official yang termurah aktif. | ⚠️ Hanya **persen**, bukan harga $; perlu × official. |
| `GET /budgets` / `GET /market` | `minAskOut` | Sisi output. | ✅ gunakan paralel utk output. |

**Verifikasi live (reconciliation):**
- `budgets.marketMinAskIn` utk semua 18 model cb/cbcn == `official × 0.01` **persis** (mis. claude-opus-4.6: official $5.00 → "0.05000000"; deepseek-v4-flash cbcn: $0.14 → "0.00140000"). Ini bukan harga pasar riil — ini placeholder 1%. **Menyesatkan jika dipakai sebagai "kompetitor termurah".**
- `market.minAskIn` == `official × cheapestActivePct/100` (mis. claude-opus-4.6: $5.00×3% = $0.15 == minAskIn 0.14997; deepseek-v4-flash cbcn: $0.14×3% = $0.0042 == minAskIn 0.0042). Konfirmasi bahwa **`market.minAskIn` ADALAH harga termurah aktif** (== `cheapestActivePct` dalam bentuk $), dan BAHWA **kita kemungkinan besar yang termurah di banyak model** (minAskIn != budgets placeholder).

**Cara membaca `minAskIn` sekaligus deteksi kompetitor:**
- Jika `market.minAskIn` == `official × cheapestActivePct/100` dan `cheapestActivePct` itu **berasal dari ask KITA** (kita yang termurah), maka `minAskIn ≈ ask kita`. Sibandingkan `minAskIn` vs `askInputPerMtok`:
  - `minAskIn ≈ ask_kita` → **kita yang termurah** → HOLD (jangan undercut diri sendiri).
  - `minAskIn < ask_kita` (mis. cbcn/deepseek-v4-flash: minAskIn 0.0042 < ask kita 0.007) → **ada kompetitor lebih murah** → baru undercut.

**⚠️ ANTI-FEEDBACK-LOOP (aturan emas):**
`market.minAskIn` **termasuk ask kita sendiri**. Jika kita termurah, `minAskIn == ask_kita`. Tanpa guard, algo akan terus undercut nilai itu tiap loop → harga ngedrop ke nol → **membakar margin nyata**. Guard wajib:
```
if market_min <= our_ask + 0.0001:  # kita sudah termurah (atau tie)
    HOLD  # jangan undercut diri sendiri
else:
    target = market_min − 0.0001     # baru undercut kompetitor riil
```
Tambahan: jangan pernah turun ke bawah floor (lihat §6). Dan jangan pernah naik ke atas `maxAskIn`.

**Sumber alternatif utk cross-check:** `GET /v1/models` → `pricing.min_ask_in` (inference base) dan `GET /catalog` → `models[].asksIn[]` (daftar ask mentah per provider). `min_ask_in` di `/v1/models` konsisten dgn `market.minAskIn` (mis. cb/claude-opus-4.6 `min_ask_in=0.465` pada audit lama — data tsb sudah berubah; selalu ambil fresh).

---

## 5. Cara tahu harga ask kita saat ini per model

- **Sumber benar:** `GET /publisher/providers/{id}/asks` → `askInputPerMtok` / `askOutputPerMtok` per model. Karena **tab-wide**, cukup baca **1 provider per upstream** (asks identik di seluruh provider upstream — terverifikasi 3× cbcn deepseek-v4-flash = `0.007`). Jangan fetch 286 provider (40–60s) setiap request — pakai pola 1-per-upstream + cache/poller/DB.
- `/budgets` TIDAK menunjukkan ask kita — ia hanya `marketMinAskIn` (placeholder 1%), `maxInputPerMtok` (cap beli konsumen), `minDiscountPct`. Tidak ada `askInputPerMtok` di budgets.
- Untuk membandingkan ask kita vs kompetitor: bandingkan `askInputPerMtok` (dari asks) terhadap `market.minAskIn` (dari `/market`). Keduanya $/Mtok — direct comparison.

---

## 6. Rekomendasi formula auto-pricing per model (cb + cbcn) — benar & aman

### ⚠️ KOREKSI KRITIS pada floor (dari `auto-pricing-algorithm.md` yang lama)

Skill lama menulis floor = **`0.95 × official`** (= "95% cheaper"). Itu **ABSURD/MUSTAHIL**: `0.95 × official` jauh di atas `maxAskIn` (yang cuma `0.5 × official`). Contoh claude-opus-4.6: floor `0.95×$5 = $4.75` vs cap `maxAskIn = $2.50`. Floor di atas cap = tidak pernah tercapai, dan sebenarnya "97% mahal", bukan murah.

Yang benar (aritmetika yang Faiz konfirmasi): **"95% lebih murah dari official" = `(1 − 0.95) × official = 0.05 × official`** (= "5% dari official"). Verifikasi live: semua kompetitor termurah aktif saat ini sudah di **3%** dari official (claude-opus $0.15 = 3%, gpt-5.6-luna $0.006 = 3%). Jadi floor **`0.05 × official`** adalah rebase bawah yang realistis dan terjangkau (di bawah cap, di atas kompetitor 3%).

> Jika Faiz memang makana **`0.95 × official`** literal (berarti mau jual 95% dari harga resmi = 5% discount), itu juga valid secara aritmetika — tetapi akan membuat kita JAUH LEBIH MAHAL dari semua kompetitor (yang rata-rata 3%), tidak akan pernah "jadi termurah", dan konflik dgn niat "undercut jadi termurah". Rekomendasi kami: **tanya/hapus ambiguitas ini sekali, lalu kunci `0.05 × official`** sesuai niat "jadi termurah". (Task ini menginstruksikan floor 95% dengan semantik "95% lebih murah" → diinterpretasikan sebagai `0.05 × official`.)

### Terminologi konsisten
- `OF` = `officialInputPerMtok`
- `CAP` = `maxAskIn` = `OF × 0.5`
- `FLOOR` = `OF × 0.05` (95% lebih murah dr official)
- `MARKET_MIN` = `market.models[minAskIn]` (dari `/market`)
- `OUR_ASK` = `askInputPerMtok` (dari `/publisher/providers/{id}/asks`, 1 provider per upstream)

### Pseudo-code aman (per model, per upstream cb & cbcn; input & output paralel)

```
FOR upstream IN {codebuddy, codebuddy-cn}:
    FOR each enabled model m IN one provider's asks:
        OF    = float(m.officialInputPerMtok)
        CAP   = m.maxAskIn                 # OF × 0.5
        FLOOR = OF * 0.05                  # 95% lebih murah dr official
        OUR   = float(m.askInputPerMtok)
        MARKET_MIN = market_min_for(m.upstreamCatalogModelId)   # dari /market by slug

        # --- 1) ANTI-FEEDBACK-LOOP: jika kita sudah termurah/tie, HOLD ---
        if MARKET_MIN is None or MARKET_MIN >= OUR - 1e-9:
            continue                        # kita sudah memimpin; jangan undercut diri sendiri

        # --- 2) target = undercut kompetitor riil ---
        target = MARKET_MIN - 0.0001

        # --- 3) floor: jangan pernah race ke bawah 5% official ---
        target = max(target, FLOOR)

        # --- 4) cap: jangan pernah melebihi maxAskIn (422 kalau lewat) ---
        target = min(target, CAP)

        # --- 5) clamp mutlak & epsilon (jangan PUT harga yang sama) ---
        target = round(target, 6)
        if abs(target - OUR) < 1e-6:
            continue
        # dry-run log: {model, OUR -> target, reasoning}; lalu:
        # PUT /publisher/upstreams/{upstream}/asks/{upstreamCatalogModelId}
        #     {"askInputPerMtok": str(target), "askOutputPerMtok": <sama utk output>}
```

### Aturan keamanan wajib
1. **Anti-feedback-loop** (guard #1) — THE most important. `MARKET_MIN` termasuk ask kita; tanpa guard harga turun ke nol.
2. **Floor `OF × 0.05`** — stop loss race-to-bottom terhadap kompetitor yang terus undercut.
3. **Cap `maxAskIn`** — clamp sebelum PUT; API 422 di atasnya.
4. **`modelId` path = `upstreamCatalogModelId` (uuid)**; body **string desimal**.
5. **Tab-wide** — 1 PUT per model per upstream; verifikasi hanya 1 GET asks per upstream.
6. **Cadence** — poll `/market` + 1×asks per upstream, PUT; jangan fetch semua asks sinkron (40–60s). Pakai DB/poller.
7. **Dry-run dulu** — tampilkan "harga yang AKAN diset" kepada Faiz, dapatkan sign-off, baru arm loop eksekusi. Ini PUT harga jual nyata.
8. **Output sama** — jalankan logika identik dgn `officialOutputPerMtok`, `maxAskOut`, `market.minAskOut`, `askOutputPerMtok`.

### Contoh numerik live (untuk validasi logika)
- **cb/claude-opus-4.6:** OF=$5.00, OUR=$0.15, MARKET_MIN≈$0.15 (minAskIn 0.14997), CAP=$2.50, FLOOR=$0.25. Karena `MARKET_MIN ≈ OUR` → **HOLD** (kita sudah termurah). ❌ (Tidak undercut ke $0.1499 — itu feedback-loop.)
- **cbcn/deepseek-v4-flash:** OF=$0.14, OUR=$0.007, MARKET_MIN=$0.0042, CAP=$0.07, FLOOR=$0.007. `MARKET_MIN(0.0042) < OUR(0.007)` → ada kompetitor murah → target = 0.0042−0.0001 = 0.0041, tapi FLOOR=0.007 → **target terkunci di FLOOR 0.007** (rebound). PUT $0.007 (tidak berubah karena == OUR). Ini menunjukkan pentingnya floor: tanpa floor kita akan turun ke $0.0041.
- **cb/gpt-5.6-luna:** OF=$0.20, minAskIn≈$0.006 (=3%), CAP=$0.10, FLOOR=$0.01. Jika OUR=$0.10 (di cap) dan MARKET_MIN=$0.006 → kita TIDAK termurah → target = 0.006−0.0001=0.0059, floor 0.01 → target=$0.01. Turun dari $0.10 ke $0.01 utk jadi termurah (kompetitor aktif di 3% < floor 5%).

### Trade-off yang perlu disadari Faiz
- **Floor 0.05×official vs kompetitor di 3%:** Di model tertentu kompetitor sudah di 3% (di bawah floor). Algo akan berhenti di floor 5%, artinya **kita mungkin TIDAK selalu jadi termurah mutlak** di model itu (karena floor menahan). Ini SAFE (jaga margin) tapi kadang tidak nomor-1. Jika Faiz mau selalu termurah tanpa batas, floor harus diturunkan atau dihapus — dengan risiko margin (dan race-to-bottom). **Rekomendasi: pertahankan floor 5%** (task eksplisit: "undercut dengan floor 95%").
- **Net take-home publisher = `ask × 0.8`** (`publisherSharePct=80`). Jadi margin bersih per Mtok = `(ask − biaya) × 0.8`. Floor 5% official memastikan ask tidak turun di bawah titik yang terlalu kurus.

---

## Lampiran A — Mapping field → sumber → sisi (consumer/publisher)

| Field | Endpoint | Sisi | Peran dalam auto-pricing |
|---|---|---|---|
| `askInputPerMtok`/`askOutputPerMtok` | `GET /publisher/providers/{id}/asks` | Publisher | Harga jual kita saat ini (utm compare & hasil PUT) |
| `officialInput/OutputPerMtok` | asks + budgets | Neutral | Anchor OF |
| `maxAskPct` | asks + `/pricing/config` | Neutral | = 50 (cap persen) |
| `maxAskIn/Out` | asks | Publisher | CAP (batas jual) |
| `cheapestActivePct` | asks | Neutral | % termurah aktif (cross-check) |
| `avgPriceRequests` | asks | Neutral/global | Popularitas model (BUKAN volume kita) |
| `defaultDiscountPct` | asks | Neutral | Disk. default model baru |
| `minAskIn/Out` | `GET /market` | Neutral | **HARGA KOMPETITOR TERMURAH (sumber undercut)** |
| `lastRate` | `GET /market` | Neutral | Rata-trade 24h terakhir (bisa null) |
| `marketMinAskIn/Out` | `GET /budgets` | Neutral | ❌ SINYAL PLASTIK (official×0.01) — jangan dipakai |
| `maxInputPerMtok`/`minDiscountPct` | `GET /budgets` | Consumer | Cap beli konsumen — BUKAN harga jual |
| `maxAskPctOfOfficial`/`platformFeePct`/`publisherSharePct` | `/pricing/config` | Neutral | 0.5 / 0.2 / 80 — rule monetisasi |

## Lampiran B — Referensi
- OpenAPI: `shared-memory/inferhub-business/docs/inferhub-openapi.json` (resolved `$ref` utk asks/budgets/market/PUT).
- Master audit: `shared-memory/inferhub-business/docs/inferhub-api-master-audit.md`
- Audit cluster: `dashboard/backend/audit/audit-account.md`, `audit-publisher.md`, `audit-usage-market.md`, `riset-cluster3-live.md`
- Skill: `inferhub-integration-api` → `references/auto-pricing-algorithm.md` (PERLU PATCH — floor lama `0.95×official` salah; koreksi di §6).