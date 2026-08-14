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
