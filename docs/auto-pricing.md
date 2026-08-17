# Auto-Pricing Daemon — Dokumentasi Final & Panduan Maintenance

**Upstream:** CodeBuddy (cb) + CodeBuddy.CN (cbcn) + ClinePass (cp) — undercut kompetitor di InferHub market.

> **Status: PRODUCTION, ARMED.** Logika final 2026-08-13 (setelah 5 iterasi fix selama
> pemantauan live); kontrak trigger-area basis B dikunci permanen 2026-08-16 (lihat §1 & REV11);
> orderbook PER-PROVIDER dikunci 2026-08-17 (REV12 — lihat §1 & REV12).
> Dokumen ini adalah satu-satunya sumber kebenaran — jangan pakai
> versi lama (audit-full.md, README lama).

---

## 1. Logika Keputusan (FINAL — kontrak trigger-area basis B, jangan diubah tanpa persetujuan)

```
per model per cycle (contract basis B — official-price trigger area):

  BOUNDARY  boundary  = round(official x trigger_pct, 6)   (batas area trigger)
            trigger_pct = pecahan (config 10% -> 0.10)
  OFFSET    offset    = round(official x 0.001, 6)         (gap undercut/resume)

  ALUR:
  1. ambil orderbook PER-PROVIDER utk upstream/model yang diproses:
     levels = asksIn catalog[slug][mk] MILIK SLUG ITU SAJA
     (per-provider orderbook REV12 — TIDAK pernah di-pool antar slug;
     termasuk level milik kita sendiri di slug itu, persis seperti halaman Asks)
  2. level VALID = price > 0, price > boundary, |price - our| > 1e-6
     (kalau boundary = None — official/trigger_pct <= 0 — filter boundary di-skip)
     -> level price <= boundary (area trigger) IGNORED, tidak diladenin
    3. pisahkan kandidat VALID menjadi lower (price < our) dan higher (price > our)
    4. jika ada lower VALID -> UNDERCUT kandidat lower sesuai aturan kompetitor
    5. jika kita sudah termurah:
      - jarak <= offset (termasuk tepat 0.1% official) -> HOLD
      - jarak > offset -> RESUME
    6. jika tidak ada kandidat luar-area yang valid -> RESUME ke 50% official
    7. target undercut/resume = round(reference - offset, 6), clamp max_in SAJA
       (max_in <= 0 = off)
       -> TIDAK ada clamp ke boundary (boundary BUKAN floor/target)
       -> target <= 0 (offset > reference) -> HOLD di harga kita
          (jangan kirim nol/negatif)
    8. target < our -> UNDERCUT; target > our -> RESUME

```

**Prinsip kunci (dari Faiz) — kontrak trigger-area (basis B) + orderbook per-provider (REV12):**
- **Orderbook PER-PROVIDER (REV12)**: level untuk row `(upstream, model)` = `asksIn`
  dari catalog entry upstream itu SAJA (`catalog[slug][mk].asksIn`). TIDAK ada pooling
  global per nama model, TIDAK ada exclude antar-slug — row `codebuddy/glm-5.2` membaca
  book codebuddy, row `codebuddy-cn/glm-5.2` membaca book codebuddy-cn, dst. Persis
  seperti halaman Asks (orderbook per provider). `competitor_price` = level terendah
  dari book slug itu sendiri.
- **Undercut/Resume = offset 0.1% × official** DI BAWAH `valid_ref` (level valid
  terendah dari book slug itu). Offset dihitung dari official, bukan dari harga kompetitor.
- **Boundary = round(official × trigger_pct, 6)** — batas area trigger. Harga `price > boundary`
  = kompetitor wajar → kandidat undercut. Harga `price <= boundary` = area trigger →
  DIIGNORASI (cuekin, jangan balas ke area trigger).
- **Trigger BUKAN floor dan BUKAN target**: tidak ada clamp `max(target, boundary)`; target
  boleh turun ke/di bawah boundary. Satu-satunya clamp: `max_in` (batas slot atas).
- **Same-price handling**: level senilai harga kita (`|price − our| ≤ 1e-6`) diabaikan — tidak
  pernah undercut diri sendiri. Resume murni `target > our` (basis B): kalau `valid_ref` ada
  dan hasil `valid_ref − offset` lebih tinggi dari harga kita, naik jemput — gate
  `our_level_qty` dari REV5 sudah dihapus dari kode.
- **RESUME saat tidak ada level valid**: tidak ada level valid (semua di area trigger / tidak
  ada kompetitor di book slug kita) → RESUME ke 50% official minus offset
  (`round(round(official × 0.5, 6) − offset, 6)`) — BUKAN diam di harga kita.
- **Kalau kompetitor melawan** (turunkan harga tapi masih `> boundary`) → kita ikut undercut
  terus agar tetap termurah di range non-trigger. Ini perilaku benar, bukan bug.
- **REBOUND DIHAPUS** (v2). Tidak ada self-correct-up, tidak ada floor terpisah.

### 1a. Empat field harga — jangan tertukar (cara baca dashboard & state)

Setiap keputusan cycle di `auto-pricing-state.json` (dan dashboard Auto Pricing) kini
membawa dua harga kompetitor yang BERBEDA:

| Field | Sumber | Arti | Dipakai dashboard? |
|---|---|---|---|
| `comp` | `/market` `minAskIn` | **Anchor diagnostik** — harga terendah dari market view (bisa menyertakan ask kita sendiri / stale) | **TIDAK** — hanya debug/diagnosis |
| `competitor_price` | orderbook `/catalog` — level terendah dari book slug SENDIRI (`_lowest_competitor_price(levels)`, `_provider_scoped_levels`) | **Harga terendah di orderbook provider itu sendiri** (REV12 per-provider) | **YA** — kolom "Kompetitor" |
| `target` | `round(valid_ref − round(official × 0.001, 6), 6)`, clamp `max_in` | Harga PUT yang dikejar daemon (`valid_ref` = level valid terendah dari book slug sendiri, lihat aturan 2) | YA — kolom "Target" |
| `our`/`ask_in` | ask kita sendiri | Harga kita saat ini | YA — kolom "Ask skrg" |

**Aturan pakai (kontrak, jangan diregressi):**
1. Dashboard **WAJIB** menampilkan `competitor_price`, BUKAN `comp`. `competitor_price`
   kini = level terendah dari orderbook slug itu sendiri (REV12 per-provider), contoh live
   codebuddy/glm-5.2: `competitor_price = 0.2702` (level terendah book codebuddy),
   sedangkan `comp` bisa berbeda (anchor `/market`). Kolom kompetitor menampilkan `—`
   hanya saat `competitor_price` null/≤0 (book slug itu kosong).
2. **Target = `valid_ref` − offset (0.1% × official)**: `valid_ref` adalah level **valid**
   terendah dari book slug sendiri: `price > 0`, `price > boundary =
   round(official × trigger_pct, 6)`, dan `|price − our| > 1e-6` (bukan ask kita). Level
   `price <= boundary` TIDAK pernah jadi `valid_ref`. Formula:
   `round(valid_ref − round(official × 0.001, 6), 6)`, clamp `max_in` saja.
3. **Orderbook scan TIDAK boleh di-short-circuit oleh `comp`** (REV10d): `comp`
   hanyalah anchor diagnostik `/market` yang bisa kosong/stale/berisi ask kita
   sendiri. Selama `levels` orderbook slug sendiri mengandung level, cycle WAJIB
   tetap memprosesnya (HOLD hanya saat `competitor_price` None dan tidak ada
   kandidat valid → malah RESUME 50% official, lihat §1).

---

## 2. Sumber Config — DB adalah SATU-SATUNYA sumber (C6)

| Sumber | Peran |
|---|---|
| **DB `auto_pricing_config`** | **Source of truth** — dibaca daemon tiap cycle (`_load_config_db`) |
| File `~/.hermes-suisui/logs/auto-pricing-config.json` | Turunan legacy; hanya fallback kalau DB gagal |
| Default kode (`band_for`) | Fallback terakhir — **seragam 10% semua upstream** (bukan per-upstream) |

Prioritas: **DB > file JSON > default kode (10%)**.

Tabel config:

| Upstream | trigger_pct | Catatan |
|---|---|---|
| codebuddy | 10 | semua 14 model |
| codebuddy-cn | 10 | semua 8 model |
| cline-pass | 10 (flash) / 20 (lain) | 10 model |

> `rebound_pct` kolom legacy — TIDAK dipakai (REBOUND dihapus). Dipertahankan utk kompatibilitas.

---

## 3. ➕ PANDUAN TAMBAH PROVIDER / MODEL BARU (paling sering dibutuhkan)

### 3a. Provider baru (akun upstream baru)
1. Tambah provider di InferHub dashboard (atau API `/publisher/providers`).
2. **Tidak perlu ubah apa pun di auto-pricing** — daemon otomatis menghitung
   `provider_ok_kita` dari `/publisher/providers` tiap cycle (semua enabled dihitung,
   termasuk invalid — keduanya menerbitkan ask).
3. Verifikasi: `curl .../api/fleet-health` → provider baru muncul, `enabled=true`.

### 3b. Model baru di upstream yang sudah ada (PENTING)
Model baru **TIDAK punya config di DB** → daemon pakai **default 10%**.
Kalau mau band beda (mis. cline-pass flash 10% / lainnya 20%):

```bash
# contoh: model baru 'gpt-6.0' di codebuddy (trigger 10%)
PGPASSWORD=upstream_local psql -h 127.0.0.1 -U gamesim -d upstream -c \
"INSERT INTO auto_pricing_config (upstream, model_id, trigger_pct, rebound_pct, updated_at)
 VALUES ('codebuddy','codebuddy/gpt-6.0',10,10,now())
 ON CONFLICT (upstream, model_id) DO UPDATE SET trigger_pct=10, rebound_pct=10, updated_at=now();"
```

Daemon baca DB tiap cycle — **tidak perlu restart** untuk config baru.

### 3c. Upstream baru (mis. 'groq')
1. Tambah slug ke `scope` di `run_cycle` (scripts/auto_pricing.py):
   ```python
   scope = set(["codebuddy", "cline-pass", "codebuddy-cn"])  # tambah "groq"
   ```
2. Cek mapping prefix market di `get_market_min` (tambah prefix kalau beda):
   ```python
   slug = {"cb": "codebuddy", "cp": "cline-pass", "cbcn": "codebuddy-cn"}.get(pc)
   ```
3. Tambah config band di DB utk model-modelnya (lihat 3b).
4. Restart daemon: `systemctl --user restart wwma-auto-pricing.service` (as gamesim).

---

## 4. ARM / DISARM & Operasi

```bash
echo 1 > ~/.hermes-suisui/logs/auto-pricing-arm   # ARMED (PUT nyata)
echo 0 > ~/.hermes-suisui/logs/auto-pricing-arm   # DISARM (dry-run, tanpa PUT)
```

- Saat DISARM: daemon jalan, log cycle, tapi **tidak PUT** (baris log `[DRY]`).
- Cek status: `cat ~/.hermes-suisui/logs/auto-pricing-arm`
- Cek proses: `systemctl --user status wwma-auto-pricing.service` (as gamesim)

### Log & state

| File | Isi |
|---|---|
| `~/.hermes-suisui/logs/auto-pricing.log` | Cycle log (aksi per model) |
| `~/.hermes-suisui/logs/auto-pricing-state.json` | State cycle terakhir (utk dashboard) |
| `~/.hermes-suisui/logs/auto-pricing-hold.json` | Cooldown/backoff per model |
| `~/.hermes-suisui/logs/auto-pricing-arm` | Flag arm (1/0) |

---

## 5. Anti-Loop & Safety (sudah diimplementasikan)

| Mekanisme | Detail |
|---|---|
| Anchor `/market` (bukan catalog) | Kompetitor sejati, bukan harga kita |
| **Anti-mengejar-diri** | `get_positions` kurangi ask kita di **level harga kita** (`our_price`), bukan level terendah |
| Anti-self-undercut | Hanya aktif saat `abs(comp - our) <= 1e-4` (comp = ask kita) |
| Cooldown | `ts` hanya di-update saat PUT sukses; cb/cbcn 10s, cp 15s |
| Backoff | 429/timeout → skip 180s (`skip_until`) |
| Clamp | `target = min(target, max_in)` saja (`max_in <= 0` = off) — TIDAK ada clamp ke boundary (trigger bukan floor); target boleh masuk area trigger |
| Atomic write | State file: `.tmp` + `os.replace` |
| 429 handling | Skip cycle, tanpa retry |

---

## 6. Troubleshooting Cepat

| Gejala | Cek | Fix |
|---|---|---|
| "no API key" | `INFERHUB_API_KEY` di `~/.hermes-suisui/.env` | Set env / daemon jalan as gamesim |
| UnboundLocalError / NameError | Kode lama | `git pull` di `/home/gamesim/dashboard`, `cp` ke `/home/gamesim/scripts/`, restart |
| Tidak undercut padahal kompetitor murah | Kompetitor di area trigger (`≤ boundary`) memang di-ignore (kontrak basis B) | Kalau memang mau undercut mereka, turunkan `trigger_pct` di DB |
| Harga turun terus | Kompetitor memang melawan (perilaku benar) | Pantau; jangan reset manual |
| PUT gagal 422 | `pctOff` — official=0 | Set official / cek model |
| Daemon mati | `systemctl --user status` | Restart; cek log |

---

## 7. Deployment (systemd user)

```bash
cp deploy/wwma-auto-pricing.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now wwma-auto-pricing.service
```

Unit: `deploy/wwma-auto-pricing.service` → `ExecStart=.../auto_pricing.py --interval 60`
(code default `INTERVAL = 30`; service produksi menimpa dengan `--interval 60`).

---

## Riwayat Fix (2026-08-13 — jangan regresi)

1. `remaining = ok` init (UnboundLocalError crash)
2. `comp_levels = []` init (NameError crash)
3. Anti-self-undercut hanya saat `comp ~= our` (comp jauh di bawah = kompetitor sejati)
4. Jangan hold saat comp di trigger — tetap scan level non-trigger utk undercut (cbcn fix)
5. `band_for` seragam — default 10% semua upstream, DB satu-satunya sumber
6. Penamaan aksi: `undercut` (turun) / `resume` (naik jemput)
7. `get_positions` kurangi ask kita di level harga kita (anti mengejar diri sendiri)

---

## REV5 (2026-08-14) — FIX RESUME "harga nggak balik"

**Keluhan user:** harga kita terdampar murah (mis. $0.0077) & tidak naik balik walau ada kompetitor wajar di atas ($0.0168, jarak 4%).

**Root cause (2 bug):**
1. `get_positions` pakai `remaining = ok` (jumlah SEMUA provider upstream, bisa 40) padahal kita publish **1 ask per model** → kurangi 40 ask dari orderbook yang cuma 6 ask → **semua level habis → `levels=[]`** → daemon anggap tidak ada kompetitor → HOLD mati di harga murah.
2. Saat harga kita tak match orderbook, `comp_levels` di-reset & ask kita dikurangi dari level TERENDAH global → level kompetitor nyata di atas kita ikut terpotong → resume tak ada target.

**Fix:**
- `remaining = 1` (1 ask per model per upstream).
- Jangan reset `comp_levels`; kurangi ask kita hanya di `our_level`.
- **Blok RESUME baru**: kalau `nontrig_below` kosong & `nontrig_above` ada & **level harga kita kosong** (tidak ada kompetitor lain di harga kita — `our_level_qty <= 0`) → RESUME naik ke level wajar terendah di atas (0.1% di bawahnya). Kalau masih ada kompetitor di level kita → TIDAK resume (tetap bersaing).

> ▶ **Ditinjau ulang oleh REV11 / basis B (2026-08-16)**: blok resume ini
> (`nontrig_below` / `nontrig_above` / `our_level_qty`) sudah dihapus dari
> kode. `_decide_trigger_area` mengklasifikasi resume murni
> `target > our` — lihat §1 & REV11.

**Verifikasi live:** cbcn deepseek-v4-flash naik `$0.0077 → $0.01358`; log cline-pass tampil `resume non-trigger`. Commit `59caedc` + `b7723de`.

---

## REV6 (2026-08-14) — CYCLE 1 MENIT (fix 12-14 menit)

**Keluhan user:** kenapa cycle tiap 30 menit / 12-14 menit, bukan 1 menit?

**Root cause (audit 2 subagent):** ~458 HTTP serial per cycle — 444× GET asks per-provider (cb 176 + cbcn 40 + cp 6, DI-FETCH 2× duplikat per upstream) = 97% waktu. Cycle 10-16 menit padahal `--interval 60`.

**Fix (commit `338753e`):**
1. **Cache asks TTL 90s** per upstream (`_ASKS_CACHE`) — cycle kedua+ pakai cache.
2. **Reuse snapshot** per cycle (`_asks_snapshot`) — `get_asks_enabled` dipanggil 1× per upstream, bukan 2× (buang 222 fetch duplikat).
3. **Sample max 3 provider/upstream** utk data ask kita (our_price + official + max_ask_in utk PUT) — anchor kompetitor (/market) & orderbook (/catalog) TETAP full-fetch (akurasi 100%).

**Hasil:** ~458 → ~15 HTTP/cycle. Cycle live: **60-70s** (sebelumnya 10-16 menit = ~13× lebih cepat). Dry-run 58s. `0x429`, 0 error.

---

## REV8 (2026-08-14) — CYCLE STABIL <70s, no 174s spike

**Audit ScoutCycleOptimizer:** 4× `/publisher/providers` fetch per cycle (3× get_asks_enabled + 1× get_positions) = 1MB transfer cycle miss. Cache asks TTL 300s expire → fetch penuh 20 HTTP → kena 429 → retry sleep 30s → cycle 121-174s.

**Fix (commit `cb3e69a` + `7762608`):**
1. **Cache providers 1×/cycle** (`_PROVIDERS_CACHE` TTL 60s) — `_get_providers_cached()` dipakai oleh `get_asks_enabled` & `get_positions` → -3 GET + ~750KB/cycle miss.
2. **Background refresh saat cache ask expire** — `_refresh_asks()` di thread daemon: data lama dipakai langsung, refresh paralel. Cycle TIDAK BLOKIR.
3. **Cold start** (no old data): fetch sync (cycle pertama lambat, ~490s). Setelah itu semua cycle pakai cache miss + background refresh = 61-117s.

**Hasil live (16:00-16:08):**
```
16:00:37 daemon start
16:01:03 cold start (26s) → 16:02:04 (61s) → 16:03:12 (68s) → 16:04:14 (62s)
16:06:11 cache miss + bg refresh (117s) → 16:07:12 (61s) → 16:08:35 (83s)
```
4 undercut PUT [OK] tiap cycle. 0 NameError. ARM=1.

---

## REV10 (2026-08-15) — SELF-UNDERCUT FIX: semua upstream satu publisher

**Keluhan user:** kadang masih undercut sendiri tanpa ada yang di depannya.

**Root cause (audit sistematis):** daemon mengelola 6 upstream MILIK SATU PUBLISHER
(`codebuddy, codebuddy-cn, cline-pass, codex, commandcode, opencode-go`). Model yang sama
dijual oleh beberapa upstream kita (mis. `deepseek-v4-flash` oleh 4 slug kita). Bug lama:
`get_positions` hanya mengurangi ask kita di level harga kita di upstream SAMA → ask dari
upstream LAIN milik kita (commandcode/opencode-go/codex) dianggap **kompetitor sejati** →
daemon undercut ask sendiri. Bukti lapangan: `posKomp=0` tapi tetap undercut; 17 level
orderbook `deepseek-v4-flash` semuanya milik kita.

**Fix (commit `686ae38` + `d2c9f47`):**
1. `get_my_slugs()` — semua upstreamSlug milik kita (dinamis dari `/publisher/providers` enabled, bukan hardcode).
2. `get_positions()` — orderbook per model digabung dari SEMUA slug di catalog (`book[mid][price] → [slug,...]`), lalu hanya level yang ada ask dari slug BUKAN milik kita masuk `levels` (kompetitor sejati). qty = jumlah ask non-kita.
3. `get_market_min()`/`_market_min_from_models()` — exclude slug milik kita dari anchor (jangan anchor ke ask sendiri).

**Hasil live (daemon ARM=1, interval 60s):**
```
sebelum fix: 6 undercut / 30 hold  (14:30)
setelah fix: 0 undercut / 36 hold  (14:31+, 5 cycle konsisten)
```
- `deepseek-v4-flash`: `posisi_komp=0`, `levels=[]` — TIDAK ada kompetitor sejati → hold (sebelumnya 17 level ask kita dikejar).
- **TIDAK ada regresi**: 8 model scope dgn kompetitor sejati (claude-code/z-ai/siliconflow) tetap hold karena **kita termurah** (`our <= comp_low` semua, REGRESI=0).
- Test TDD 4/4 PASS di lokal & VPS (`scripts/tests/test_self_undercut.py`).

---

## REV10b (2026-08-15) — FIX: "gabisa set manual" trigger%

**Keluhan user:** klik Update di halaman Auto-Pricing → error "trigger (NaN) harus > 0" padahal field sudah terisi.

**Root cause (reproduce di browser nyata):**
1. `saveConfig` pakai `parseFloat(f.trigger)` — kalau user klik Update TANPA mengetik ulang (field sudah menampilkan nilai), `form[key]` undefined → `parseFloat(undefined)` = **NaN** → error. Tombol Update tidak bisa dipakai tanpa edit ulang.
2. `model_id` tidak konsisten: cycles cline-pass = prefixed (`cline-pass/deepseek-v4-flash`), codebuddy = bare (`glm-5.2`); config DB campur bare/prefixed/double-prefixed → duplikat config & display salah.

**Fix (commit `4f94458` + `d4fe469`):**
1. **Frontend `saveConfig`**: fallback ke nilai yang TAMPAK (`cfgMap[key]` / default) saat `form[key]` kosong — Update tanpa edit sekarang simpan nilai tampil.
2. **Normalisasi key**: `cfgMap`, `form`, `saveConfig` semua pakai **bare model_id** (`split('/').pop()`) — konsisten antar cline-pass/codebuddy/cbcn.
3. **Backend PUT**: normalisasi `model_id` → selalu simpan **prefixed `upstream/model`** (strip prefix berulang) — cegah duplikat & config tak terbaca daemon.
4. **Konsolidasi DB**: hapus 22 config duplikat (bare+prefixed), konversi sisa bare → prefixed. Sekarang 37 config, 0 duplikat.

**Verifikasi (browser nyata + API + daemon):**
```
Update tanpa edit -> ✓ cline-pass/deepseek-v4-flash -> trigger 2%  (sebelumnya NaN error)
Edit 8 lalu Update -> ✓ cline-pass/deepseek-v4-flash -> trigger 8%
DB: id 51 trigger_pct=8.0 (no duplikat)
Daemon load_config: {'trigger_pct': 8.0} -> dipakai cycle berikutnya
```

---

## REV10c (2026-08-15) — root cause "auto-pricing gak jalan" (trigger-as-floor)

**Keluhan user:** auto-pricing gak jalan — harga tidak turun walau ada kompetitor murah.

**Root cause:** perilaku lama memperlakukan trigger sebagai **floor**: filter
`nontrig_prices = [p for p in levels if p > trigger_px]` membuang level kompetitor ≤ trigger
(mis. z-ai glm-5.2 @ $0.07 di bawah floor $0.14) DAN clamp `target = max(target, trigger_px)`
menahan harga di floor → daemon HOLD diam padahal ada kompetitor di bawah. Terlihat
"gak jalan".

**Fix saat itu (commit `58c3388`):**

1. Hapus filter `p > trigger_px` dari level kompetitor.
2. Hapus clamp `target = max(target, trigger_px)` — boleh turun ke bawah trigger.

**Hasil live (cycle pertama setelah restart):**
```
sebelum: 0 undercut, 36 hold (daemon diam 30+ menit)
sesudah: 4 undercut — glm-5.2/glm-5.3/claude-opus-5 turun ke $0.0686 (kejar z-ai @0.07) [OK]
```

**▶ Ditinjau ulang & dire-arahkan oleh REV11 (2026-08-16) — jangan salah baca:**

- Yang **PERTAHAN permanen**: penghapusan clamp floor — `boundary` BUKAN floor dan BUKAN
  target; target tidak pernah di-clamp naik ke boundary (ini bagian kontrak basis B, §1).
- Yang **DIKOREKSI**: "hapus filter" versi naif di-REPLACE kontrak basis B — level kompetitor
  VALID hanya `price > boundary`; level `price <= boundary` (area trigger) DIIGNORASI sebagai
  referensi (tidak diundercut, cuekin). Otoritas filtering sekarang §1 / REV11 / basis B,
  bukan REV10c.

---

## REV10d (2026-08-15) — FIX: orderbook tetap diproses saat market anchor kosong

**Root cause:** `/market` tidak selalu mengembalikan anchor untuk prefix model yang sama (`z-ai`/`ocg` vs slug publisher). Gate lama `if comp is None: HOLD` menghentikan cycle sebelum membaca `levels` orderbook. Akibatnya kompetitor nyata tetap ada di orderbook tetapi tidak pernah di-undercut.

**Fix (`b85830e`):** HOLD hanya jika `comp` kosong **dan** tidak ada `levels`; bila `levels` berisi kompetitor sejati, daemon lanjut menghitung target `kompetitor - (0.1% × official)`.

Cooldown harga juga dihapus (`4e30323`); backoff hanya tetap aktif setelah HTTP 429/timeout.

---

## REV11 (2026-08-16) — KONTRAK PERMANEN: official-price trigger area (basis B)

**Tujuan:** mengunci kontrak trigger-area secara permanen — future fix TIDAK
boleh kembali ke interpretasi trigger-as-floor. Ini adopsi resmi basis B
(`_decide_trigger_area` di `scripts/auto_pricing.py`) dan menyelesaikan semua
kontradiksi floor/REV10c di dokumen ini.

**Kontrak (satu-satunya yang berlaku; lihat §1):**

1. **orderbook per-provider (REV12)** — levels row `(upstream, model)` = `asksIn`
   catalog entry upstream itu saja; TIDAK ada pooling global / exclude antar-slug.
   (Sebelumnya REV10: exclude semua slug milik kita — kini DIGANTI per-provider.)
2. **boundary official-based** — `boundary = round(official × trigger_pct, 6)` dengan
   `trigger_pct` pecahan (config 10% → 0.10); kalau official/trigger_pct ≤ 0 → boundary
   `None` (tanpa filter boundary).
3. **strict outside-area filtering** — level VALID: `price > 0`, `price > boundary`,
   dan `|price − our| > 1e-6`. Level `price <= boundary` (di area trigger) **IGNORED**.
4. **same-price handling** — level senilai ask kita ditolak sebagai referensi
   (`|price − our| ≤ 1e-6`, anti self-undercut); resume hanya saat level
   kosong kompetitor.
5. **target** — `round(valid_ref − round(official × 0.001, 6), 6)`;
   `valid_ref` = level VALID terendah.
6. **clamp `max_in` only** — `min(target, max_in)` (`max_in ≤ 0` = clamp off).
   **TIDAK ada boundary floor**; target boleh berada di bawah boundary. Guard:
   `target ≤ 0` (offset > `valid_ref`) → HOLD di harga kita, jangan kirim nol/negatif.
7. **aksi** — `undercut` (target < our), `resume` (target > our), `hold`
   (target ≤ our — berarti jarak ≤ offset — atau `target ≤ 0`). Tidak ada level
   valid → **RESUME 50% official** (`round(round(official × 0.5, 6) − offset, 6)`),
   BUKAN hold; `max_in` clamp tetap berlaku.

**Menggantikan (dianggap batal):**

- §1 lama: "trigger = floor harga jual", `target = max(raw_target, trigger_px)`.
- Prinsip kunci lama: "CB 10% → floor 10%; CBCN 5% → floor 5%" —
  config DB sekarang 10/10.
- Tabel anti-loop lama: clamp `max(target, trigger_px)`.
- REV10c klaim "hapus filter kompetitor" (lihat nota ditinjau di REV10c).

**Contoh konkret** (official $1.40, `trigger_pct` 10% → 0.10 → boundary $0.14,
offset $0.0014):

| Skenario | Level kompetitor | `valid_ref` | `target` | Aksi |
|---|---|---|---|---|
| Semua kompetitor di area trigger | kita @ $0.069; z-ai @ $0.07 (≤ boundary) | — (tidak ada) | 0.7 − 0.0014 = **$0.6986** | **RESUME** — tidak ada kandidat valid → 50% official |
| Kompetitor wajar tepat di atas boundary | kita @ $0.145; rival @ $0.142 | $0.142 | 0.142 − 0.0014 = **$0.1406** | **UNDERCUT** (tetap > boundary) |
| `valid_ref` tipis di atas boundary → target lintas area | kita @ $0.150; rival @ $0.1401 | $0.1401 | 0.1401 − 0.0014 = **$0.1387** | **UNDERCUT** — target masuk area trigger, TANPA clamp floor |
| Hanya kita di bawah, kompetitor wajar di atas | kita @ $0.06; rival @ $0.15 | $0.15 | 0.15 − 0.0014 = **$0.1486** | **RESUME** — target > our (basis B) |
| Kompetitor senilai ask kita | kita @ $0.08; rival @ $0.08 (= our) | di-exclude (`\|p − our\| ≤ 1e-6`) | — | **HOLD** — jangan undercut diri sendiri |
| Book slug kosong (hanya slug lain yang punya model) | commandcode @ $0.0035 (di slug lain) | — (book slug kita kosong) | 0.7 − 0.0014 = **$0.6986** | **RESUME** — per-provider, book slug lain tidak dibaca → 50% official |

Catatan: contoh memakai `trigger_pct = 0.10`; model dengan config lain (mis. cline-pass
non-flash 20% → 0.20) boundary ikut berubah. Clamp `max_in` (slot atas) selalu diterapkan
setelah perhitungan target di atas.

---

## REV12 (2026-08-17) — ORDERBOOK PER-PROVIDER (fix "kompetitor tidak terbaca / salah provider")

**Tujuan:** mengunci kontrak orderbook PER-PROVIDER — daemon membaca `asksIn` dari
catalog entry upstream itu SAJA, persis seperti halaman Asks. Sebelumnya orderbook
di-pool global per nama model (`book[mid]`), sehingga row `codebuddy/glm-5.2` ikut
membaca level dari `codebuddy-cn` / `cline-pass` / `z-ai` — kompetitor tampak
hilang/salah, dan keputusan undercut salah sasaran.

**Kontrak (menggantikan aturan "exclude semua slug milik kita" dari REV10):**

1. **levels per-provider** — untuk row `(upstream, model)`, `levels` = `asksIn`
   dari `catalog[slug][mk]` MILIK SLUG ITU SAJA (`_provider_scoped_levels` di
   `scripts/auto_pricing.py`). TIDAK ada pooling global antar slug, TIDAK ada
   exclude-slug-lain. Level milik kita sendiri di slug itu TETAP ada di book
   (persis seperti halaman Asks menampilkan semua ask provider itu).
2. **`competitor_price`** = level terendah dari book slug itu sendiri
   (`_lowest_competitor_price(levels)`); `None` hanya saat book slug itu kosong.
3. **`total_provider` / `posisi_kompetitor`** = kedalaman book slug itu sendiri
   (jumlah ask di level-levelnya), bukan agregasi global.
4. **keputusan** tetap basis B (`_decide_trigger_area`): boundary
   `round(official × trigger_pct, 6)`, valid = `price > 0`, `price > boundary`,
   `|price − our| > 1e-6`; lower → UNDERCUT, higher jarak ≤ offset → HOLD /
   > offset → RESUME, tanpa kandidat valid → RESUME 50% official.
5. **Halaman Asks & daemon kini satu sumber data** (per-provider catalog asksIn) —
   tidak ada lagi perbedaan semantik antara keduanya.

**Contoh live (catalog produksi 2026-08-17, glm-5.2 official $1.40 — TIDAK di-pool):**

| Upstream | `levels` (book slug itu saja) | `competitor_price` |
|---|---|---|
| `codebuddy` | 0.2702, 0.273, 0.2786, 0.28, 0.7 | 0.2702 |
| `codebuddy-cn` | 0.0868, 0.0896, 0.091, 0.098, 0.1204, 0.126, 0.1302, 0.7 | 0.0868 |
| `cline-pass` | 0.126, 0.14, 0.6412, 0.644, 0.658, 0.7 | 0.126 |
| `z-ai` | 0.14, 0.308 | 0.14 |

Row `codebuddy/glm-5.2` hanya melihat level codebuddy; row `cline-pass/glm-5.2`
hanya melihat level cline-pass. Tidak ada satu pun yang membaca book slug lain.

**Risiko / catatan:**
- Karena book per-provider, model yang hanya tersedia di slug lain (bukan slug yang
  dikonfigurasi) → book kosong → RESUME 50% official (bukan HOLD). Pastikan config
  upstream/model di DB sesuai dengan slug yang benar.
- Tingkat "kompetisi" kini diukur per-provider (bukan antar-provider kita).

## REV13 (2026-08-17) — PERSISTENSI OPERASIONAL & CACHE CATALOG

REV13 membuat perubahan produksi dapat diaudit dan mengurangi rate-limit pada endpoint orderbook.

### Tabel PostgreSQL

Daemon membuat tabel berikut secara idempotent saat start; `backend/db_schema.py` juga mendaftarkan schema yang sama:

- `auto_pricing_ops`: satu baris untuk setiap keputusan/PUT, termasuk action, harga awal/target, reference, boundary, HTTP status, mode dry-run, dan reason.
- `auto_pricing_state`: snapshot terakhir per `(slug, model_id)`, di-upsert setiap cycle.
- `auto_pricing_api_log`: endpoint, method, status, durasi milidetik, dan ukuran response untuk setiap request daemon.

`auto_pricing_ops` dan `auto_pricing_api_log` dibersihkan untuk data lebih tua dari 30 hari saat daemon start. Jika PostgreSQL atau `psycopg` tidak tersedia, daemon tetap menjalankan pricing dan JSON state; kegagalan persistence harus terlihat dari tidak bertambahnya timestamp/row di tabel.

DSN memakai `UPSTREAM_DB` bila tersedia, dengan fallback lokal `postgresql://gamesim:upstream_local@127.0.0.1:5432/upstream`. Secret tidak disimpan di unit service atau repository.

### Cache catalog backend

Backend mem-poll `/catalog`, `/publisher/providers`, dan sample provider asks melalui live-cache dengan interval `UPSTREAM_CATALOG_POLL_SECONDS` (default 60 detik). Endpoint `/api/catalog` dan `/api/orderbook` membaca cache terlebih dahulu dan hanya melakukan fetch fallback bila cache belum tersedia. Akibatnya orderbook dashboard dapat tertinggal hingga interval cache, tetapi menghindari setiap request UI menghabiskan rate limit InferHub.

### Verifikasi produksi

```sql
SELECT count(*), min(ts), max(ts) FROM auto_pricing_ops;
SELECT count(*), max(updated_at) FROM auto_pricing_state;
SELECT count(*), max(ts) FROM auto_pricing_api_log;
```

Ketiga query harus menunjukkan row baru setelah daemon cycle. Backup PostgreSQL memakai `pg_dump`, sehingga tabel REV13 ikut tercakup tanpa daftar tabel khusus.

**Status lock:** REV13 wajib committed ke `main` sebelum perubahan runtime berikutnya dianggap production source of truth. Runtime hash, service status, DB freshness, dan rollback backup dicatat di `docs/PRODUCTION-LOCK.md`.
