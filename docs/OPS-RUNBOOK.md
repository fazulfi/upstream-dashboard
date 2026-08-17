# OPS RUNBOOK — upstream-dashboard (VPS 82.25.62.204)

**Update:** 2026-08-13. Dokumen operasional harian — layanan, backup/restore, troubleshooting,
checklist. Untuk logika auto-pricing & tambah provider lihat `docs/auto-pricing.md`.

---

## 1. Arsitektur Ringkas

| Layer | Detail | Port |
|---|---|---|
| Frontend | Vercel (`upstream-static` → https://upstream-static.vercel.app) | 443 |
| Nginx | `ops.budgezen.com` → proxy API-only | 80/443 |
| Backend | Flask + waitress (`backend/app.py`) | 8124 |
| DB | PostgreSQL `upstream` (gamesim@127.0.0.1) | 5432 |
| Daemon | auto-pricing (`scripts/auto_pricing.py`, interval 30s) | — |

User layanan: **gamesim** (bukan root). Systemd user instance: `XDG_RUNTIME_DIR=/run/user/1001`.

---

## 2. Layanan & Unit (systemd user — as gamesim)

| Unit | Fungsi | Status |
|---|---|---|
| `wwma-upstream-backend.service` | Backend API :8124 | active |
| `wwma-auto-pricing.service` | Daemon harga (30s) | active (ARM=1) |
| `wwma-finance.service` + `.timer` | Regen workbook keuangan (harian) | timer enabled |

```bash
# akses sbg gamesim dari root
su - gamesim -c 'export XDG_RUNTIME_DIR=/run/user/1001; systemctl --user status wwma-auto-pricing.service'

# restart
su - gamesim -c 'export XDG_RUNTIME_DIR=/run/user/1001; systemctl --user restart wwma-auto-pricing.service'

# cek backend langsung
curl -sk http://127.0.0.1:8124/health
```

> ⚠️ Backend dijalankan manual via nohup (bukan unit aktif) — `pgrep -f backend/app.py`.
> Unit file ada utk referensi; jangan start ganda (Address already in use).

---

## 3. Backup & Restore

### Backup (manual/otomatis)
```bash
# otomatis (script): pg_dump gzip, retensi 14 hari
/home/gamesim/scripts/backup_db.sh

# jadwalkan via cron gamesim (mis. 03:30 harian)
# 30 3 * * * /home/gamesim/scripts/backup_db.sh >> /home/gamesim/backup.log 2>&1

# lokasi backup
ls /home/gamesim/shared-memory/inferhub-business/backups/
```

### Restore
```bash
gunzip -c backups/inferhub-YYYY-MM-DD.sql.gz | PGPASSWORD=upstream_local psql -h 127.0.0.1 -U gamesim -d upstream
```
> ⚠️ Restore menimpa DB. Backup dulu DB saat ini sebelum restore.

---

## 4. Konfigurasi Penting

### Env backend (unit / nohup start)
`DASHBOARD_PASSWORD`, `ALLOWED_ORIGINS`, `UPSTREAM_DB`, `UPSTREAM_API_PORT=8124`,
`UPSTREAM_POLL_SECONDS=10`, `RL_LIMIT=60`, `RL_WINDOW=60`, `SESSION_TTL=86400`.

### Secret di VPS
- `~/.hermes-suisui/.env` (0600) — INFERHUB_API_KEY, VERCEL_TOKEN, FOREX_KEY, dll.
- `frontend/.env.production` — **harus kosong** (`VITE_DASHBOARD_PASSWORD=`). Jangan isi password!
  (Build Vercel membaca file ini & meng-inject ke bundle publik → C1 security.)

### Config auto-pricing (DB)
```sql
SELECT upstream, model_id, trigger_pct FROM auto_pricing_config ORDER BY upstream;
```
Band aktif: codebuddy 10%, codebuddy-cn 10%, cline-pass flash 10%/lain 20%.

---

## 5. Troubleshooting

### Backend down / port 8124 kosong
```bash
pgrep -f 'dashboard/backend/app.py' || echo DOWN
# start ulang (as gamesim, dari dir backend):
su - gamesim -c 'cd /home/gamesim/dashboard/backend && UPSTREAM_API_PORT=8124 UPSTREAM_POLL_SECONDS=10 DASHBOARD_PASSWORD=*** nohup /home/gamesim/.venv-dash/bin/python app.py >> /home/gamesim/.hermes-suisui/logs/upstream-backend.log 2>&1 &'
```

### Auto-pricing error / crash
```bash
tail -20 /home/gamesim/.hermes-suisui/logs/auto-pricing.log
# UnboundLocalError/NameError = kode lama → update:
cd /home/gamesim/dashboard && git pull origin main
cp /home/gamesim/dashboard/scripts/auto_pricing.py /home/gamesim/scripts/
su - gamesim -c 'export XDG_RUNTIME_DIR=/run/user/1001; systemctl --user restart wwma-auto-pricing.service'
```

### Daemon "no API key"
Daemon harus jalan **as gamesim** (bukan root) supaya `~/.hermes-suisui/.env` kebaca.

### 401 di dashboard
- Token sesi expired (>24h) → login ulang via Settings.
- `VITE_DASHBOARD_PASSWORD` ter-set di bundle → kosongkan `.env.production` & redeploy.

### Frontend Vercel deploy — WAJIB dari `frontend/` (⚠️ 2026-08-14: fix RC5)
Deploy **HARUS** dari subfolder `frontend/` (bukan root repo):
```bash
cd /home/gamesim/dashboard/frontend
export VERCEL_TOKEN=$(grep VERCEL_TOKEN ~/.hermes-suisui/.env | cut -d= -f2)
npx vercel deploy --prod --yes --token "$VERCEL_TOKEN" --cwd /home/gamesim/dashboard/frontend
```
⚠️ Deploy dari root (`--cwd /home/gamesim/dashboard`) membuat Vercel build **backend λ**
(project settings RootDirectory `.`) → rewrite `/api` ke λ lokal tanpa env auth → **SEMUA API 401**.
Gejala: dashboard tampil tapi data kosong, `/api/login` 401 padahal password benar.
Verifikasi setelah deploy: `curl -H "Authorization: Bearer <token>" https://upstream-static.vercel.app/api/history?range=24h` → 200 dgn data.

---
## 6. Checklist Deploy Kode Baru (5 menit)

1. `git pull origin main` di `/home/gamesim/dashboard`
2. Backend: `cp backend/app.py backend/logic.py` sudah ter-pull → restart backend (bunuh PID lama, start baru)
3. Scripts: `cp scripts/auto_pricing.py scripts/fin_ops.py scripts/gen_finance.py /home/gamesim/scripts/`
4. Restart daemon: `systemctl --user restart wwma-auto-pricing.service`
5. Verifikasi: `/health` 200 · auto-pricing log cycle sukses · `cat auto-pricing-arm`
6. Frontend (bila ada perubahan): `vercel deploy --prod --yes --token "$VERCEL_TOKEN" --cwd /home/gamesim/dashboard/frontend` ⚠️ dari `frontend/`, BUKAN root (lihat §5 troubleshooting).

---

## 7. Checklist Tambah Provider Baru

Lihat `docs/auto-pricing.md` §3 — singkatnya:
1. Tambah provider di InferHub → otomatis terhitung, no code change.
2. Model baru → config DB (band 10% default / override per model).
3. Upstream baru → scope + prefix mapping + config DB + restart.

---

## 8. Kontak & Riwayat

- **Repo:** github.com/fazulfi/upstream-dashboard (branch `main` = produksi)
- **CI:** GitHub Actions (test + lint + build, tanpa CD — deploy manual)
- **Audit terakhir:** 2026-08-13 (`docs/AUDIT-2026-08-13.md`) — 14 CRITICAL + 19 REQUIRED, semua difix
