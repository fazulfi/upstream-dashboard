# Auto-Pricing Daemon — Dokumentasi Final & Panduan Maintenance

**Upstream:** CodeBuddy (cb) + CodeBuddy.CN (cbcn) + ClinePass (cp) — undercut kompetitor di InferHub market.

> **Status: PRODUCTION, ARMED.** Logika final 2026-08-13 (setelah 5 iterasi fix selama
> pemantauan live). Dokumen ini adalah satu-satunya sumber kebenaran — jangan pakai
> versi lama (audit-full.md, README lama).

---

## 1. Logika Keputusan (FINAL — jangan diubah tanpa persetujuan)

```
per model per cycle:

  ANCHOR KOMPETITOR  comp = /market minAskIn (kompetitor sejati, BUKAN catalog kita)
  TRIGGER            trigger_px = official x trigger_pct   (batas "harga tidak wajar")
  OFFSET             offset = official x 0.1%              (gap undercut/resume)

  ALUR:
  1. our <= comp              -> HOLD leader   (kita sudah termurah, DIAM)
  2. cek orderbook kompetitor MURNI (ask kita SUDAH dikurangi di level harga kita):
       nontrig_prices = [p di orderbook jika p > trigger_px DAN p != harga kita]
  3. tidak ada nontrig      -> HOLD (tidak ada kompetitor wajar utk dikejar)
  4. ref = nontrig terendah
     target = ref - offset, clamp [trigger_px, max_in]
  5. target ~= our           -> HOLD (sudah di target)
  6. target < our            -> UNDERCUT (turun 0.1%xofficial di bawah kompetitor)
  7. target > our            -> RESUME   (naik jemput kompetitor — harga balik mahal)
```

**Prinsip kunci (dari Faiz):**
- **Undercut = 0.1% × official** (BUKAN 0.1% dari harga kompetitor).
- **Trigger = batas ABAIKAN**: kompetitor ≤ trigger_px → diabaikan (tidak diundercut,
  tidak dibalas). Hanya kompetitor > trigger_px yang jadi target.
- **Kalau hanya kita di level harga itu** → naik (resume) ke level kompetitor wajar
  terendah di atas — **tidak perlu reset manual rutin**.
- **Kalau kompetitor melawan** (turunkan harga di bawah kita) → kita ikut undercut
  terus agar tetap termurah di range non-trigger. Ini perilaku benar, bukan bug.
- **REBOUND DIHAPUS** (v2). Tidak ada self-correct-up, tidak ada floor terpisah.

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
| Clamp | `target = max(target, trigger_px)` & `min(target, max_in)` — tidak pernah di range trigger / di atas slot |
| Atomic write | State file: `.tmp` + `os.replace` |
| 429 handling | Skip cycle, tanpa retry |

---

## 6. Troubleshooting Cepat

| Gejala | Cek | Fix |
|---|---|---|
| "no API key" | `INFERHUB_API_KEY` di `~/.hermes-suisui/.env` | Set env / daemon jalan as gamesim |
| UnboundLocalError / NameError | Kode lama | `git pull` di `/home/gamesim/dashboard`, `cp` ke `/home/gamesim/scripts/`, restart |
| Tidak undercut padahal kompetitor di bawah | Trigger terlalu tinggi vs harga kompetitor | Turunkan trigger_pct di DB |
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

Unit: `deploy/wwma-auto-pricing.service` → `ExecStart=.../auto_pricing.py --interval 30`.

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

## REV10c (2026-08-15) — FIX: "auto-pricing gak jalan" (daemon diam saat kompetitor murah)

**Keluhan user:** auto-pricing gak jalan — harga tidak turun walau ada kompetitor murah.

**Root cause:** filter `nontrig_prices = [p for p in levels if p > trigger_px]` — kompetitor sejati yang harganya ≤ trigger (mis. z-ai glm-5.2 @ $0.07 ≤ trigger $0.14) diabaikan → daemon HOLD diam padahal kompetitor di bawah. Terlihat "gak jalan".

**Fix (commit `58c3388`):**
1. `nontrig_prices` → semua level kompetitor SEJATI (hapus filter `p > trigger_px`) — kompetitor sejati APAPUN harganya diundercut.
2. Hapus clamp `target = max(target, trigger_px)` — boleh turun ke bawah trigger.

**Hasil live (cycle pertama setelah restart):**
```
sebelum: 0 undercut, 36 hold (daemon diam 30+ menit)
sesudah: 4 undercut — glm-5.2/glm-5.3/claude-opus-5 turun ke $0.0686 (kejar z-ai @0.07) [OK]
```
Trigger % tetap berfungsi utk config per model — hanya tidak lagi memfilter kompetitor sejati.
