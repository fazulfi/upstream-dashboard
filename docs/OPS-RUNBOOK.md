# OPS RUNBOOK — upstream-dashboard (VPS 82.25.62.204)

**Update:** 2026-08-17. Dokumen operasional harian — layanan, health check, journal, env,
backup/restore, troubleshooting, rollback, incident response. Untuk logika auto-pricing &
tambah provider lihat `docs/auto-pricing.md`. Fakta produksi di `docs/PRODUCTION-LOCK.md`.

---

## 1. Arsitektur Ringkas

| Layer | Detail | Port |
|---|---|---|
| Frontend | Vercel project `upstream-static` → https://upstream-static.vercel.app; `vercel.json` rewrites `/api/:path*` → `https://ops.budgezen.com/api/:path*` | 443 |
| Nginx | `ops.budgezen.com` → TLS :443 proxy to backend API | 443 |
| Backend | Flask + waitress (`backend/app.py`) on `127.0.0.1:8124` (behind nginx) | 8124 |
| DB | PostgreSQL `upstream` (gamesim@127.0.0.1) | 5432 |
| Daemon | auto-pricing (`scripts/auto_pricing.py`, service interval **60s**; code default 30s) | — |

User layanan: **gamesim** (bukan root). Systemd user instance: `XDG_RUNTIME_DIR=/run/user/<uid>`.

**Fakta produksi:** VPS `root@82.25.62.204`, checkout `/home/gamesim/dashboard`, venv
`/home/gamesim/.venv-dash`, backend `127.0.0.1:8124` via nginx:443, units
`wwma-upstream-backend.service` + `wwma-auto-pricing.service`, Vercel project `upstream-static`,
`main` @ `9733e48`. `DASHBOARD_PASSWORD` adalah secret server-side (baca dari
`~/.hermes-suisui/backend.env`, 0600) — **jangan pernah menuliskan nilainya di dokumen apa pun**.

---

## 2. Layanan & Unit (systemd user — as gamesim)

| Unit | Fungsi | Status |
|---|---|---|
| `wwma-upstream-backend.service` | Backend API :8124 (via `~/.hermes-suisui/backend.env`) | active |
| `wwma-auto-pricing.service` | Daemon harga (60s) | active (ARM=1) |
| `wwma-finance.service` + `.timer` | Regen workbook keuangan (harian) | timer enabled |

### Pola akses unit user (dari root)

Unit dijalankan sebagai user-scoped service di bawah user `gamesim`; akses systemd user **harus**
melalui `sudo -u gamesim` dengan `XDG_RUNTIME_DIR` yang benar. Jangan set `User=`/`Group=` di unit
(pitfall status=216/GROUP). Gunakan pola konsisten:

```bash
# akses sbg gamesim dari root (pola baku)
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) systemctl --user status wwma-auto-pricing.service

# restart
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) systemctl --user restart wwma-auto-pricing.service

# cek backend langsung (lewat nginx & local)
curl -sk https://ops.budgezen.com/health
curl -sk http://127.0.0.1:8124/health
```

> Backend produksi dijalankan oleh `wwma-upstream-backend.service` sebagai user `gamesim`.
> Jangan start manual dengan nohup; restart unit agar tidak terjadi `Address already in use`.

---

## 2a. Health Checks

| Target | Cek | Harapan |
|---|---|---|
| Backend (public) | `curl -sk https://ops.budgezen.com/health` | HTTP 200 |
| Backend (local) | `curl -sk http://127.0.0.1:8124/health` | HTTP 200 |
| Backend service | `sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) systemctl --user is-active wwma-upstream-backend.service` | `active` |
| Daemon service | `... systemctl --user is-active wwma-auto-pricing.service` | `active` |
| Daemon single proc | `pgrep -af '/home/gamesim/scripts/auto_pricing.py'` | tepat 1 baris |
| ARM state | `cat /home/gamesim/.hermes-suisui/logs/auto-pricing-arm` | `1` (ARM) / `0` (DISARM) |
| Heartbeat (summary) | `curl -sk -H "Authorization: Bearer <token>" https://ops.budgezen.com/api/reliability/summary` | `service_status` + `last_heartbeat` fresh |
| DB freshness | via summary `db_freshness`, atau query `max(occurred_at)` dari `reliability_events` | < 2 menit |

> Setiap cycle daemon (60s) harus memproduksi heartbeat & event baru. `service_status` di summary
> = `healthy` saat cycle terakhir `completed`. Kalau `db_freshness`/heartbeat kedaluwarsa, lihat §6.

---

## 2b. Journal daemon & env backend

### Baca journal daemon (systemd user)

Daemon ditulis dengan `PYTHONUNBUFFERED=1` sehingga output cycle terpantau via journald:

```bash
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) journalctl --user -u wwma-auto-pricing.service -n 100 --no-pager
# live follow:
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) journalctl --user -u wwma-auto-pricing.service -f
# backend:
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) journalctl --user -u wwma-upstream-backend.service -n 100 --no-pager
```

### Baca env backend (verifikasi secret/config runtime, tanpa expose ke dokumen)

Unit backend memuat env dari `EnvironmentFile=/home/gamesim/.hermes-suisui/backend.env`. Untuk
memverifikasi env yang benar-benar aktif (mis. `DASHBOARD_PASSWORD` set, `UPSTREAM_DB` benar)
tanpa restart, baca `/proc/<pid>/environ` dari PID proses backend:

```bash
# PID backend:
pgrep -f 'dashboard/backend/app.py'
# tampilkan nama variabel yang ter-set (jangan echo nilainya ke log publik):
sudo cat /proc/$(pgrep -f 'dashboard/backend/app.py' | head -1)/environ | tr '\0' '\n' | cut -d= -f1
```

> ⚠️ Nilai env (terutama `DASHBOARD_PASSWORD`, `INFERHUB_API_KEY`) **jangan dicetak/di-log** —
> verifikasi nama & keberadaan variabel saja (via `cut -d= -f1`), jangan isinya. Secret hanya ada
> di file env VPS (0600) dan proses runtime.

---

## 3. Backup & Restore

### Backup (manual/otomatis)
```bash
# otomatis (script): pg_dump gzip, retensi lokal 14 hari; offsite 30 hari bila dikonfigurasi
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
>
> Reliability retention is separate from backup retention: raw reliability events remain 30 days and UTC aggregates 90 days; the existing 14-day local/30-day offsite backup policy is preserved and does not promise 90-day backup recovery. Cleanup/rollup must be rerun after restore and checked via the reliability aggregate timestamps and maintenance status.

### W6 maintenance checks
```bash
# Inspect live retention and aggregate freshness without exposing credentials.
PGPASSWORD="$PGPASSWORD" psql -h 127.0.0.1 -U gamesim -d upstream -c \
  "SELECT bucket_granularity, max(bucket_start), count(*) FROM reliability_aggregates GROUP BY bucket_granularity ORDER BY bucket_granularity;"
```
The daemon performs bounded cleanup at startup: operational `auto_pricing_ops`/`auto_pricing_api_log` remain on their existing 30-day policy, reliability events are cleaned at 30 days only when their cycle is completed, and aggregates are recomputed/upserted for the 90-day UTC window. Maintenance failures return an error status for audit/reporting and must not be treated as healthy cleanup.

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
# start ulang via unit (PREFER — hindari nohup manual → Address already in use):
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) systemctl --user restart wwma-upstream-backend.service
# cek journal kalau gagal start:
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) journalctl --user -u wwma-upstream-backend.service -n 50 --no-pager
```

### Auto-pricing error / crash
```bash
tail -20 /home/gamesim/.hermes-suisui/logs/auto-pricing.log
# UnboundLocalError/NameError = kode lama → update:
cd /home/gamesim/dashboard && git pull origin main
cp /home/gamesim/dashboard/scripts/auto_pricing.py /home/gamesim/scripts/
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) systemctl --user restart wwma-auto-pricing.service
# journal daemon:
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) journalctl --user -u wwma-auto-pricing.service -n 50 --no-pager
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

## 5a. Nginx Config

Nginx menyediakan TLS :443 dan reverse-proxy ke Flask `127.0.0.1:8124`. Konfigurasi server
block `ops.budgezen.com` (bukan di repo; kelola di `/etc/nginx/`):

```bash
# validasi & reload (setelah perubahan)
sudo nginx -t && sudo systemctl reload nginx
# cek listen & proxy
sudo nginx -T | grep -nE 'server_name ops.budgezen.com|proxy_pass|listen 443'
```

Poin penting: proxy `location /api/` → `http://127.0.0.1:8124` (API-only; frontend statis
ditangani Vercel). SSE (`/api/reliability/stream`) sudah dikirim dengan `Cache-Control: no-cache`
dan `X-Accel-Buffering: no` dari backend — pastikan nginx tidak mem-buffer proxied stream
(buffering off di blok stream) supaya event sampai realtime. `Access-Control-Allow-Origin`
mengikuti allowlist `ALLOWED_ORIGINS` (dashboards) di backend.

---

## 5b. Rollback

Sebelum perubahan schema/backend apa pun, **backup DB dulu** (lihat §3). Rollback = operator
DISARM bila keselamatan harga tak pasti → catat incident → pulihkan versi terakhir known-good →
restart layanan → verifikasi heartbeat/DB/state → re-ARM.

```bash
# 1. DISARM (block PUT nyata) kalau pricing tidak aman — via dashboard / API (audited):
#    POST /api/reliability/disarm  (atau tulis flag langsung):
echo 0 > /home/gamesim/.hermes-suisui/logs/auto-pricing-arm

# 2. Rollback kode ke commit known-good (tag/reflog)
cd /home/gamesim/dashboard && git log --oneline -10
git checkout <known-good-commit> -- backend/app.py scripts/auto_pricing.py
cp scripts/auto_pricing.py /home/gamesim/scripts/

# 3. Restart daemon & backend
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) systemctl --user restart wwma-auto-pricing.service
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) systemctl --user restart wwma-upstream-backend.service

# 4. Restore DB (kalau migrasi gagal) — TIMPA DB, backup dulu
gunzip -c /home/gamesim/shared-memory/inferhub-business/backups/inferhub-YYYY-MM-DD.sql.gz | \
  PGPASSWORD="$PGPASSWORD" psql -h 127.0.0.1 -U gamesim -d upstream

# 5. Frontend rollback: promote deployment Vercel sebelumnya
cd /home/gamesim/dashboard/frontend && npx vercel ls --token "$VERCEL_TOKEN"   # pilih deployment lama
npx vercel promote <url> --yes --token "$VERCEL_TOKEN"

# 6. Verifikasi sebelum re-ARM: /health 200, satu daemon, heartbeat fresh, DB fresh
```

---

## 5c. Incident Response

Alur incident: **DISARM kalau ragu → catat di event/audit history → diagnosis → fix → verifikasi
→ re-ARM.**

| Skenario | Deteksi | Tindakan |
|---|---|---|
| Daemon mati / tidak ada cycle | `is-active` inactive; heartbeat summary kosong/stale | Restart unit; cek journal §2b; pastikan satu PID |
| Backend down / 8124 kosong | `/health` non-200; `pgrep` kosong | Restart unit; cek journal; jangan nohup manual |
| PUT gagal berulang (429/5xx) | journal `error`, summary `error_count` naik; `auto_pricing_api_log` | Cek rate-limit InferHub; backoff 180s otomatis; catat sebagai warning (bukan breaker) |
| `persistence_warning` / DB freshness stale | summary `db_freshness` lama; state `status=persistence_warning` | Cek PostgreSQL up; DB best-effort — pricing lanjut, jangan block PUT karena DB down |
| Duplicate daemon | `pgrep` > 1; PID lock menolak start | **Tidak auto-kill.** DISARM, investigasi PID, matikan proses duplikat manual, restart satu unit |
| Undercut→resume→undercut oscilasi | audit events `undercut`/`resume` bergantian per model | DISARM, catat incident, rollback §5b, verifikasi, re-ARM |
| 5 consecutive technical errors (1 model) | event `error`/`critical` | Warning dashboard saja; TIDAK stop pricing; tidak mempengaruhi model lain |

> **Aturan operasional:** kalau pricing safety tak pasti → **DISARM dulu** (daemon tetap jalan
> dry-run), baru diagnosa. Semua tindakan penting (DISARM/rollback) harus tercatat di audit.

---

## 6. Checklist Deploy Kode Baru (5 menit)

1. `git pull origin main` di `/home/gamesim/dashboard` (pastikan `main` @ `9733e48` atau lebih baru)
2. Backend: `backend/app.py` sudah ter-pull → restart backend via unit
3. Scripts: `cp scripts/auto_pricing.py scripts/fin_ops.py scripts/gen_finance.py /home/gamesim/scripts/`
4. Restart daemon: `sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) systemctl --user restart wwma-auto-pricing.service`
5. Verifikasi: `/health` 200 · auto-pricing log cycle sukses · `cat auto-pricing-arm` · summary heartbeat & DB fresh
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
- **Reliability API/SSE & Phase 1:** lihat `docs/PRODUCTION-LOCK.md` (endpoint, SSE, event schema,
  retention, ARM/DISARM audit, policy) dan `docs/auto-pricing.md` (daemon & persistence)
