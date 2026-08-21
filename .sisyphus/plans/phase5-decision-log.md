# Phase 5 — Decision Log (otoritatif)

> **Tujuan:** Catat setiap keputusan user selama planning Phase 5. File ini adalah source of
> truth untuk implementasi. Setiap jawaban user DICATAT di sini — jangan pernah mengandalkan
> ingatan percakapan.
>
> **Status:** PLANNING (belum ada implementasi)
> **Mulai:** 2026-08-21
> **Baseline production:** main `761b744` (PR #30), bundle `index-D0HqFdo3.js`, backend ac3baf2 (MainPID 1128285)

---

## Konteks yang sudah terverifikasi (dari investigasi, bukan keputusan)

- Daemon `scripts/auto_pricing.py` line 922: `scope = set(["codebuddy", "cline-pass", "codebuddy-cn"])` — HARDCODED.
  Provider lain tidak pernah diproses kecuali ada config per-model eksplisit.
- Katalog live (11 upstream): claude-code 9, cline-pass 15, codebuddy 14, codebuddy-cn 9, codex 6,
  commandcode 12, opencode-go 19, qwencloud-alibaba 5, siliconflow 9, xiaomi-mimo 2, z-ai 7.
- Providers enabled + apiKey ok (live, dari /publisher/providers):
  - commandcode: enabled, apiKey ok (12 model)
  - opencode-go: enabled, apiKey ok (19 model — terbesar kedua)
  - sisanya: claude-code, codex, qwencloud-alibaba, siliconflow, xiaomi-mimo, z-ai — enabled + ok (kecuali beberapa commandcode apiKey invalid)
- Cycle live: ARMED, hanya proses codebuddy (15), cline-pass (13), codebuddy-cn (9) = 37 model.
- Globals live: semua 11 upstream punya max_ask_pct=0.5; hanya codebuddy punya global_trigger_pct=4.0.
- `band_for()` precedence: config per-model eksplisit > global upstream (rebound 0.10) > default 0.10/0.10.
- Cooldown: `COOLDOWN_CP` untuk cline-pass, `COOLDOWN_CB` untuk lainnya.
- BACKOFF = 180s untuk 429/timeout. Asks cache TTL 60s. Providers cache TTL 60s.

---

## KEPUTUSAN USER (diurutkan kronologis)

### K-001 — Phase 5 dipilih + request auto-pricing
- **Tanggal:** 2026-08-21
- **Pertanyaan:** "Mau lanjut ke mana?" (opsi: Phase 5 baru / tutup sisa Phase 2 / stabilisasi / cukup)
- **Jawaban user:** "opsi 1 + aku ingin tambahan auto price untuk commandcode dan opencode"
- **Keputusan:** Lanjut Phase 5 (brainstorm dari awal). Item pertama: auto-pricing untuk commandcode & opencode.
- **Catatan:** "opencode" perlu dikonfirmasi = opencode-go? (ada potensi ambiguity)

### K-002 — Scope auto-pricing = tambah 2 saja
- **Tanggal:** 2026-08-21
- **Pertanyaan:** "Auto-pricing untuk commandcode & opencode-go — seberapa luas scopenya?"
  (opsi: semua provider enabled / tambah 2 saja / semua + dry-run dulu)
- **Jawaban user:** "Tambah 2 saja"
- **Keputusan:** Scope = EKSPLISIT 2 provider baru: commandcode + opencode-go. Provider lain
  (claude-code, codex, qwencloud-alibaba, siliconflow, xiaomi-mimo, z-ai) TETAP tidak diproses.
  Mekanisme: daftar upstream yang diproses jadi daftar eksplisit 5:
  `[codebuddy, cline-pass, codebuddy-cn, commandcode, opencode-go]` — via config/env, bukan hardcode literal inline.

### K-003 — "opencode" = opencode-go
- **Tanggal:** 2026-08-21
- **Jawaban user:** "Ya, opencode-go (Recommended)"
- **Keputusan:** Provider yang dimaksud = `opencode-go` (19 model, enabled + apiKey ok).

### K-004 — Default trigger global untuk 2 provider baru
- **Tanggal:** 2026-08-21
- **Jawaban user:** "default opsi 1, nanti aku set manual di dashboard"
- **Keputusan:** Default global trigger band = **10% / 10%** (sama seperti default existing).
  User akan set nilai manual via dashboard (trigger global per provider sudah ada di halaman
  Auto Pricing sejak PR #29).

### K-005 — Langsung aktif setelah deploy
- **Tanggal:** 2026-08-21
- **Jawaban user:** "Langsung aktif (Recommended)"
- **Keputusan:** Begitu fitur deploy + daemon restart, commandcode & opencode-go langsung
  masuk cycle berikutnya (tidak ada dry-run phase). ARMED sudah true, jadi PUT harga nyata langsung jalan.

### K-006 — Cooldown PUT
- **Tanggal:** 2026-08-21
- **Jawaban user:** "Sama seperti codebuddy (Recommended)"
- **Keputusan:** Cooldown antar PUT untuk commandcode & opencode-go = **COOLDOWN_CB** (sama
  dengan codebuddy/codebuddy-cn). Hanya cline-pass yang tetap pakai COOLDOWN_CP.

### K-007 — Model dengan apiKey invalid
- **Tanggal:** 2026-08-21
- **Jawaban user:** "Skip otomatis (Recommended)"
- **Keputusan:** Tidak ada filter/alert tambahan. Perilaku daemon existing (hanya proses asks
  dari provider enabled + apiKey ok) sudah cukup; model commandcode dengan apiKey invalid auto-skip.

### K-008 — Batas aman
- **Tanggal:** 2026-08-21
- **Jawaban user:** "Sama seperti existing (Recommended)"
- **Keputusan:** Tidak ada guard tambahan khusus untuk commandcode/opencode-go. Guard existing
  berlaku sama: max_ask_pct global 0.5, trigger band, backoff 429, cooldown.

### K-009 — Scope Phase 5
- **Tanggal:** 2026-08-21
- **Jawaban user:** "Hanya auto-pricing (Recommended)"
- **Keputusan:** Phase 5 = SATU item: auto-pricing commandcode + opencode-go. Rampung =
  deployed & verified. Tidak ada item lain di phase ini.

### K-010 — Monitoring/alert
- **Tanggal:** 2026-08-21
- **Jawaban user:** "Cukup dashboard (Recommended)"
- **Keputusan:** Tidak ada alert khusus. Pantau via halaman Auto Pricing existing
  (tab provider, log algo, status per model) sudah cukup.

### K-011 — Lokasi konfigurasi daftar upstream
- **Tanggal:** 2026-08-21
- **Jawaban user:** "File config (Recommended)"
- **Keputusan:** Daftar upstream yang diproses dipindah ke **file config** (file yang sama dengan
  auto-pricing-config.json / load_config, yang sudah dipakai untuk trigger global). Bisa diedit
  tanpa redeploy. Default: 5 upstream `[codebuddy, cline-pass, codebuddy-cn, commandcode, opencode-go]`.
  Catatan impl: load_config() saat ini return (overrides, globals_map) — perlu key baru mis. `upstreams`.
  Perlu cek struktur file & sync function `_sync_ap_config_file` di app.py supaya konsisten.

### K-012 — Verifikasi sukses setelah deploy
- **Tanggal:** 2026-08-21
- **Jawaban user:** "Cek lebih dalam"
- **Keputusan:** Verifikasi tidak cukup cek muncul di UI. Wajib:
  1. UI Auto Pricing: tab commandcode & opencode-go muncul, model terproses, trigger % sesuai.
  2. Tunggu 1-2 cycle penuh.
  3. Bandingkan harga ask sebelum/sesudah utk memastikan PUT benar-benar jalan (bukan hanya dihitung).
  Bukti: snapshot harga sebelum deploy vs sesudah 1-2 cycle, dari /api/auto-pricing atau DB auto_pricing_ops.

### K-013 — Sumber daftar upstream = DB + sync file
- **Tanggal:** 2026-08-21
- **Jawaban user:** "DB + sync file (Recommended)"
- **Keputusan:** Daftar upstream yang diproses mengikuti pola source-of-truth existing
  (seperti trigger): **DB PostgreSQL → sync ke file JSON → default**. Dashboard bisa
  set/unset provider per-upstream. Rincian:
  - Tambahan di DB (additive-only): kolom/tabel untuk scope auto-pricing per upstream
    (mis. kolom `auto_pricing_enabled bool` di `pricing_config_upstream`, atau tabel scope).
  - `_sync_ap_config_file()` menulis key `upstreams` (daftar enabled) ke
    `~/.hermes-suisui/logs/auto-pricing-config.json`.
  - `load_config()` di daemon baca daftar dari file (atau DB), default ke 5 upstream
    `[codebuddy, cline-pass, codebuddy-cn, commandcode, opencode-go]` bila kosong/error.
  - Dashboard: toggle/set per upstream (di halaman Auto Pricing atau Pricing).
  - Keputusan K-002 (tambah 2 saja) = default scope awal 5, TETAP bisa diubah via dashboard.

### K-014 — UI toggle scope
- **Tanggal:** 2026-08-21
- **Jawaban user:** "Toggle di Auto Pricing (Recommended)"
- **Keputusan:** Bangun toggle 'auto-pricing aktif' per upstream **sekarang**, di halaman
  Auto Pricing (dekat panel Trigger global per provider). Dashboard = satu-satunya tempat set/unset.

### K-015 — Alur eksekusi
- **Tanggal:** 2026-08-21
- **Jawaban user:** "Plan + eksekusi penuh (Recommended)"
- **Keputusan:** Susun implementation plan lengkap, lalu eksekusi penuh tanpa jeda:
  backend + daemon + frontend + test + deploy + verifikasi (K-012). User review hasil akhir.

### K-016 — Perilaku scope default: 5 aktif, 6 off
- **Tanggal:** 2026-08-21
- **Jawaban user:** "5 aktif, 6 off (Recommended)"
- **Keputusan:** Kolom `auto_pricing_enabled BOOLEAN NOT NULL DEFAULT TRUE` di
  `pricing_config_upstream`, TETAPI ensure_schema men-seed 6 upstream non-scope
  (claude-code, codex, qwencloud-alibaba, siliconflow, xiaomi-mimo, z-ai) = FALSE
  (idempotent). Hasil: persis 5 upstream diproses: codebuddy, cline-pass, codebuddy-cn,
  commandcode, opencode-go. Toggle UI bisa mengubah TRUE/FALSE kapan saja.

---

## RINGKASAN KEPUTUSAN (final, untuk plan)

| # | Keputusan |
|---|---|
| K-001 | Phase 5 = item auto-pricing commandcode & opencode-go |
| K-002 | Scope = tambah 2 provider saja (eksplisit 5) |
| K-003 | "opencode" = opencode-go |
| K-004 | Default trigger 10%/10%, user set manual via dashboard |
| K-005 | Langsung aktif setelah deploy (tanpa dry-run) |
| K-006 | Cooldown = COOLDOWN_CB (sama codebuddy) |
| K-007 | apiKey invalid = skip otomatis (tanpa alert) |
| K-008 | Batas aman = existing (tanpa guard tambahan) |
| K-009 | Phase 5 = hanya item auto-pricing |
| K-010 | Monitoring = cukup dashboard |
| K-011 | Daftar upstream via file config (bukan env/hardcode) |
| K-012 | Verifikasi = cek UI + banding harga sebelum/sesudah 1-2 cycle |
| K-013 | Sumber daftar = DB → sync file → default 5 |
| K-014 | UI toggle scope dibangun sekarang, di Auto Pricing |
| K-015 | Plan + eksekusi penuh, review hasil akhir |
| K-016 | Scope default: 5 aktif (codebuddy, cline-pass, codebuddy-cn, commandcode, opencode-go), 6 off (claude-code, codex, qwencloud-alibaba, siliconflow, xiaomi-mimo, z-ai) — via seed idempotent + toggle UI |

---

## CATATAN IMPLEMENTASI (draft, belum dieksekusi — update sesuai K-013)

- **File:** `scripts/auto_pricing.py`
  - line 922: ganti `scope = set(["codebuddy", "cline-pass", "codebuddy-cn"])` dengan baca dari config
    (`upstreams` key dari load_config()).
  - `load_config()` tambah key `upstreams`: baca dari DB (kolom baru) → file JSON → default 5.
  - `band_for()` sudah support globals_map — tidak berubah.
  - Cooldown: commandcode/opencode-go pakai COOLDOWN_CB (K-006).
- **File:** `backend/db_schema.py` — additive DDL untuk scope per upstream (kolom/tabel baru).
- **File:** `backend/app.py`
  - `_sync_ap_config_file` ikut menulis key `upstreams` (dari DB).
  - Endpoint (PUT) utk set/unset scope per upstream (guard: admin + idempotency + audit),
    konsisten dengan pola `/api/pricing/global`.
- **Frontend:** tambah kontrol scope per upstream di halaman Auto Pricing (atau Pricing).
  Tab provider sudah otomatis dari cycles.
- **Test:** update unit tests mock load_config `{}` → `({}, {})` (test_self_undercut.py:543 dll)
  + test scope dari config + test endpoint scope.
- **Deploy:** backend VPS pull + restart service + daemon. Frontend build/deploy bila ada perubahan UI.
- **Verifikasi (K-012):** snapshot harga sebelum deploy → deploy → 1-2 cycle → bandingkan
  harga ask (PUT jalan nyata) + tab UI muncul + trigger % sesuai.

---

## PERTANYAAN YANG SUDAH TERJAWAB (arsip — jangan tanya ulang)

1. Default trigger % → K-004: 10%/10%, user set manual via dashboard.
2. Cooldown → K-006: COOLDOWN_CB.
3. Langsung arm vs dry-run → K-005: langsung aktif.
4. apiKey invalid → K-007: skip otomatis, tanpa alert.
5. UI baru → K-014: toggle scope di Auto Pricing.
6. Batas aman → K-008: existing saja.
7. Item lain di Phase 5 → K-009: hanya auto-pricing.
8. Monitoring/alert → K-010: cukup dashboard.
9. Konfigurasi daftar upstream → K-011 + K-013: DB + sync file, default 5.
10. Verifikasi sukses → K-012: UI + banding harga 1-2 cycle.
11. Alur eksekusi → K-015: plan + eksekusi penuh.
