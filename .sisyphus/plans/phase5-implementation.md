# Phase 5 — Auto-Pricing commandcode + opencode-go (Implementation Plan)

> **Keputusan user:** Lihat `.sisyphus/plans/phase5-decision-log.md` (K-001..K-016) — source of truth.
> **Status:** IMPLEMENTED — audit selesai (1 CRITICAL + 3 minor fixed), siap feature branch → PR → deploy.
> **Baseline:** main `761b744`, backend ac3baf2, bundle index-D0HqFdo3.js
> **Keputusan user (follow-up):** (1) Toggle scope **tetap terikat orderbook** — upstream yang
> tidak muncul di orderbook tidak di-render di panel (gap diterima, tidak perlu ubah).
> (2) Kerja pakai workflow penuh: research/audit → plan → implement → verify, semua skill/MCP/TODO.

## Goal

Daemon auto-pricing memproses **commandcode** (12 model) + **opencode-go** (19 model) — bergabung
dengan codebuddy/cline-pass/codebuddy-cn. Daftar upstream yang diproses jadi **configurable**:
DB → sync file JSON → default 5, dengan toggle di dashboard (halaman Auto Pricing).

## Keputusan kunci (ringkas)

- K-002/K-003: scope = eksplisit 5 upstream: `[codebuddy, cline-pass, codebuddy-cn, commandcode, opencode-go]`.
- K-004: default trigger band 10%/10%; user set manual via dashboard (sudah ada sejak PR #29).
- K-005: langsung aktif setelah deploy (tanpa dry-run phase).
- K-006: cooldown commandcode/opencode-go = COOLDOWN_CB.
- K-007: apiKey invalid = skip otomatis (perilaku existing).
- K-008: guard existing saja (max_ask_pct 0.5, backoff 429, dll).
- K-011/K-013: daftar upstream = kolom DB (additive) → `_sync_ap_config_file()` menulis key
  `upstreams` → `load_config()` baca → default 5 bila kosong.
- K-014: toggle 'auto-pricing aktif' per upstream di halaman Auto Pricing (dekat panel Trigger global).
- K-012: verifikasi = UI tab muncul + banding harga ask sebelum/sesudah 1-2 cycle (PUT jalan nyata).

## Desain teknis

### 1. DB (additive-only)

`pricing_config_upstream` tambah kolom:

```sql
ALTER TABLE pricing_config_upstream ADD COLUMN IF NOT EXISTS auto_pricing_enabled BOOLEAN NOT NULL DEFAULT TRUE
```

- **K-016:** ensure_schema men-seed idempotent: 6 upstream non-scope
  (claude-code, codex, qwencloud-alibaba, siliconflow, xiaomi-mimo, z-ai) → `auto_pricing_enabled=FALSE`.
  Hasil default = persis 5 aktif (codebuddy, cline-pass, codebuddy-cn, commandcode, opencode-go).
- Row per-upstream di-create via `PUT /api/pricing/global` (existing) — upsert insert row baru
  dengan default TRUE; seed menjamin 6 non-scope tetap FALSE (idempotent, ON CONFLICT do nothing
  atau update terarah).
- **FIX AUDIT (CRITICAL):** prod sudah punya row utk SEMUA 11 upstream (dibuat P4 via PUT global)
  → `DEFAULT TRUE` meng-enable 11, seed `ON CONFLICT DO NOTHING` skip semua. Solusi: deteksi kolom
  baru via `information_schema.columns`; HANYA saat kolom baru (belum ada toggle manual) jalankan
  satu-kali `UPDATE ... SET auto_pricing_enabled=FALSE WHERE upstream IN (6 non-scope)`. Run
  berikutnya insert-only — toggle manual tidak pernah di-revert. Regression test:
  `test_ensure_schema_migrasi_kolom_baru_matikan_6_non_scope` + `test_ensure_schema_kolom_sudah_ada_tidak_update`.

### 2. `_sync_ap_config_file()` (backend/app.py)

Tulis key tambahan `upstreams` = daftar upstream yang `auto_pricing_enabled=TRUE`:

```json
{
  "configs": [...],
  "globals": [...],
  "upstreams": ["codebuddy", "cline-pass", "codebuddy-cn", "commandcode", "opencode-go"],
  "updated_at": ...
}
```

- Query baru: `SELECT upstream FROM pricing_config_upstream WHERE auto_pricing_enabled = TRUE`.
- File tetap ditulis ATOMik (tmp + os.replace), fail-closed.

### 3. Daemon `scripts/auto_pricing.py`

- `load_config()` / `_load_config_db()`: tambah kembalian `upstreams` (set of str) — baca dari DB
  (kolom baru), fallback file JSON key `upstreams`, fallback default 5:
  `{"codebuddy", "cline-pass", "codebuddy-cn", "commandcode", "opencode-go"}`.
  **Catatan:** `load_config()` saat ini return 2-tuple → jadi 3-tuple `(configs, globals_map, upstreams)`.
  Update SEMUA caller + tests yang mock `({}, {})` → `({}, {}, DEFAULT_SCOPE)`.
  **FIX AUDIT (fail-closed):** `_load_config_db` return `None` saat tabel kosong (fresh install) vs
  `set()` saat semua disabled — fallback default 5 HANYA pada `None`. File fallback: key `upstreams`
  ada (termasuk `[]`) → dihormati fail-closed; key hilang (file lama) → default.
- line 922: ganti `scope = set(["codebuddy", "cline-pass", "codebuddy-cn"])` dengan:
  `scope = set(upstreams)` (dari load_config) + tetap filter `scope = {s for s in scope if s in catalog}`.
  - Tambahan: filter `scope` hanya upstream yang ada di providers enabled + apiKey ok?
    K-007 bilang skip otomatis — daemon `get_asks_enabled` sudah return asks hanya dari
    provider enabled+ok, jadi model invalid otomatis kosong → skip. Scope cukup katalog-filter.
- Cooldown: `cooldown = COOLDOWN_CP if slug == "cline-pass" else COOLDOWN_CB` — tidak berubah
  (commandcode/opencode-go → COOLDOWN_CB, sesuai K-006).

### 4. Backend endpoint scope (backend/app.py)

- `PUT /api/auto-pricing/scope` body `{upstream, enabled: bool}` → guard (admin, idempotency,
  audit entity `pricing_config_upstream`, action `scope-update`) → UPDATE
  `pricing_config_upstream SET auto_pricing_enabled=%s WHERE upstream=%s` →
  `_sync_ap_config_file(conn)` → return `{ok: true}`.
  **FIX AUDIT:** entity guard `pricing_config_upstream` (bukan `auto_pricing_config`) agar audit
  queryable — konsisten dgn sibling `PUT /api/pricing/global`. Validasi upstream terhadap slug
  catalog cache (400 `unknown upstream` bila catalog tersedia; fail-open bila catalog kosong).
- `GET /api/pricing` (existing `_load_pricing_merged`) tambah field `auto_pricing_enabled` di tiap
  global cfg → frontend baca untuk render toggle.
- **Guard:** `auto_pricing_enabled=TRUE` TANPA row di pricing_config_upstream? Row dibuat via
  PUT global. Untuk upstream yang belum ada row-nya (mis. sebelum global pernah di-set), `GET /api/pricing`
  pakai fallback `pc` (pricing_config id=1). Tambah: kalau upstream ada di scope default 5 tapi belum
  ada row → dianggap enabled (default TRUE).

### 5. Frontend (halaman Auto Pricing)

- `AutoPricing.jsx`: di panel "Trigger global · per provider", tiap kartu upstream tambah
  **toggle "auto-pricing"** (checkbox/switch) — state dari `globals[upstream].auto_pricing_enabled`.
  - On change → `apiFetch('/api/auto-pricing/scope', {method:'PUT', body:{upstream, enabled}})` → reload.
  - Tab provider (dari cycles) otomatis mencerminkan scope yang benar-benar diproses.
- Tidak ada perubahan routing/nav (tab sudah otomatis).

### 6. Test

- Backend:
  - `test_self_undercut.py` line 543 dll: mock `load_config` → `({}, {}, DEFAULT_SCOPE)`.
  - Test baru: `load_config` baca upstreams dari DB + fallback default; endpoint scope PUT
    (guard, idempotency, sync file); `_load_pricing_merged` expose `auto_pricing_enabled`.
  - Coverage gate tetap >=80 (jangan turunkan).
- Frontend: test toggle scope di AutoPricing (mock apiFetch PUT `/api/auto-pricing/scope`).
- CI: backend + frontend + Vercel preview.

### 7. Deploy + verifikasi (K-012)

1. PR → merge → CI green.
2. Backend VPS: `git pull --ff-only` → restart service `wwma-upstream-backend.service` +
   daemon auto_pricing (systemd) → schema migrate (additive, otomatis via ensure_schema startup).
3. Snapshot harga SEBELUM deploy (commandcode/opencode-go ask dari /api/pricing atau DB).
4. Frontend build + deploy Vercel upstream-static (bundle baru).
5. Tunggu 1-2 cycle → verifikasi:
   - UI: tab commandcode & opencode-go muncul, model terproses, trigger % sesuai.
   - Banding harga ask sebelum/sesudah: PUT jalan nyata (bukan hanya dihitung).
   - DB `auto_pricing_ops` ada row baru utk commandcode/opencode-go.
6. Update PRODUCTION-LOCK + evidence artifact.

## File yang berubah

- `backend/db_schema.py` (kolom `auto_pricing_enabled`)
- `backend/app.py` (`_sync_ap_config_file`, `_load_pricing_merged`, endpoint `PUT /api/auto-pricing/scope`)
- `scripts/auto_pricing.py` (`load_config` 3-tuple, scope dari config, line 922)
- `frontend/src/pages/AutoPricing.jsx` (toggle scope)
- `backend/tests/*` + `frontend/src/components/PricingMutations.test.jsx` (update + baru)

## Risiko / catatan

- `load_config()` jadi 3-tuple → semua caller & mock harus diupdate (break test kalau lupa).
- Default TRUE untuk semua row → semua 11 upstream enabled di DB, TAPI daemon scope = baca
  daftar enabled; kalau mau scope default tepat 5, alternatif: scope di daemon = intersection
  (enabled DB) ∩ (default 5 ∪ tambahan user). **Perlu keputusan kecil:** apakah toggle yang
  dimatikan user HARUS tetap bisa dimatikan (ya — itu gunanya toggle). Jadi daemon scope =
  `enabled DB` saja (default TRUE semua → tapi hanya 5 yang di-katalog & di-cycle karena
  upstream lain tidak pernah masuk scope default? TIDAK — kalau enabled semua, semua 11 diproses).
  → **Solusi presisi (K-016):** kolom `BOOLEAN NOT NULL DEFAULT TRUE` + seed idempotent 6
  upstream non-scope = FALSE. Daemon scope = upstreams enabled di DB (bukan semua).
  Toggle off = excluded; toggle on = masuk. Perilaku default = persis 5. Ini masuk plan.

## Hasil Audit Plan-Compliance (oracle, 2026-08-21) — FAIL → semua fixed

| Temuan | Severity | Fix |
|---|---|---|
| Seed tidak bisa matikan row pre-existing 11 upstream → scope 11 bukan 5 (K-002/K-016) | **CRITICAL** | Gated one-time UPDATE saat kolom baru (information_schema) + 2 regression test |
| File fallback fail-open utk empty list (DB down + semua disabled → resurrect 5) | MINOR | Key `upstreams` ada → dihormati (fail-closed); key hilang → default. +2 test |
| docs/auto-pricing.md §3c stale (hardcoded scope 3 provider) | MINOR | Ganti dgn alur toggle/PUT scope |
| docs/auto-pricing.md:257 "38 model" stale | NITPICK | Default 5 upstream + config DB |

**Verifikasi pasca-fix:** backend pytest **161 passed**, daemon unittest **58/58 OK**, frontend
vitest 63 passed, build OK. Semua 13 todo selesai di working tree (uncommitted, siap branch).

## Keputusan user & status rilis

- Toggle scope terikat orderbook (gap diterima — upstream tanpa orderbook tidak di-render).
- Rilis: feature branch → PR → CI green → deploy manual (ADR-003). Deploy langkah sesuai
  OPS-RUNBOOK §6 (restart backend menjalankan migrasi scope; verifikasi SQL persis 5 enabled).
