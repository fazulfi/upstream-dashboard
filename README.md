# Upstream Dashboard — InferHub Publisher Operations

**Enterprise-grade operations dashboard & auto-pricing engine for AI API publishers on InferHub.**

Dashboard memantau fleet provider, earnings, keuangan (P&L), market/orderbook, dan mengendalikan
harga jual (ask) per model secara manual maupun otomatis (auto-pricing daemon) — dengan
PostgreSQL sebagai sumber kebenaran (single source of truth) untuk data finansial, konfigurasi,
dan jejak operasional auto-pricing.

**Production:** frontend <https://upstream-static.vercel.app> (Vercel) · backend
<https://ops.budgezen.com> (nginx :443 → Flask :8124, VPS `82.25.62.204`) · daemon auto-pricing
(systemd user, interval 60s).

---

## 🚀 Quickstart

```bash
# backend (VPS / local, dari backend/)
pip install -r requirements.txt
export UPSTREAM_DB='postgresql://gamesim:***@127.0.0.1:5432/upstream'
export UPSTREAM_API_PORT=8124
python app.py                       # → http://127.0.0.1:8124/health

# frontend (dari frontend/)
npm install
npm run dev

# auto-pricing daemon (dry-run dulu)
python3 scripts/auto_pricing.py --once --dry-run
```

Login dashboard: `/api/login` → token sesi HMAC (24h) → `Authorization: Bearer <token>`.

---

## ✨ Fitur

| Area | Kemampuan |
|---|---|
| **Fleet** | Health provider per upstream (ok / invalid / drained), usage windows, recheck, enabled toggle |
| **Market** | Orderbook per model (ladder harga + depth per upstream), min/max/spread, catalog, combos |
| **Harga** | Set harga ask manual (per model × upstream), auto-pricing daemon (per-provider orderbook, trigger-area undercut/resume) |
| **Keuangan** | P&L lengkap (amortisasi, impairment, refund, payout), workbook Excel, kurs live, topup/refund/buy/retire CLI |
| **Analytics** | Earnings trend per-call, breakdown per model/provider, model ranking, publisher analytics per range |
| **Ops** | API keys InferHub (create/rotate/revoke), budgets & aliases, topup QRIS, settings, arm/disarm auto-pricing |
| **Reliability (Phase 1)** | Reliability dashboard: cycle/event/model timeline + SSE live, ARM/DISARM audit, PID lock (no auto-kill), no circuit breaker, DB best-effort, retention 30d/90d — lihat `docs/PRODUCTION-LOCK.md` |

---

## 🏗️ Arsitektur

```
┌─────────────┐   HTTPS /api/*    ┌──────────────────┐   HTTPS /api/*   ┌─────────────────┐
│  Frontend   │ ────────────────▶ │  Nginx (TLS)     │ ───────────────▶ │  Backend Flask  │
│  React/Vite │  (Vercel deploy)  │ ops.budgezen.com │  proxy :8124    │  (waitress)     │
│  Vercel     │  rewrite /api/*   │  (VPS 82.25.62.204)│                │ 127.0.0.1:8124  │
└─────────────┘                   └──────────────────┘                 └────────┬────────┘
                                                                                 │ poll (10s)
                                                                                 ▼
                                        ┌──────────────────────┐        ┌─────────────────┐
                                        │  PostgreSQL upstream │◀───────│ InferHub API    │
                                        │  (finance, history,  │        │ inferhub.dev/api│
                                        │   fleet, config,     │        └─────────────────┘
                                        │   reliability)       │
                                        └──────────▲───────────┘
                                                   │ SSE /api/reliability/stream + REST
                                                   │ (reliability live ke frontend)
                                        ┌──────────┴───────────┐
                                        │ Auto-pricing daemon  │──▶ InferHub /market
                                        │ (systemd user, 60s,  │
                                        │  PID lock, ARM flag) │
                                        └──────────────────────┘
```

### Komponen

| Komponen | Path | Teknologi |
|---|---|---|
| Backend API | `backend/app.py` | Python 3 · Flask · waitress · psycopg3 · SSE (`/api/reliability/stream`) |
| Full sync & ledger CLI | `backend/full_sync.py`, `backend/ledger_update.py` | Python |
| Schema DB (kanonikal) | `backend/db_schema.py` | PostgreSQL DDL idempotent |
| Frontend | `frontend/` | React 19 · Vite 8 · recharts · react-table |
| Auto-pricing | `scripts/auto_pricing.py` | Python daemon (systemd user, interval 60s, PID lock) |
| Finance CLI | `scripts/fin_ops.py` (input tunggal), `scripts/gen_finance.py` (regen workbook) | Python |
| Backup | `scripts/backup_db.sh` | pg_dump · gzip · retention 14d |
| Deploy units | `deploy/*.service` | systemd user |
| Reverse proxy | nginx (`ops.budgezen.com`) | TLS :443 → Flask :8124 |
| Frontend host | Vercel `upstream-static` | `vercel.json` rewrite `/api/*` → `https://ops.budgezen.com/api/*` |
| Production lock | `docs/PRODUCTION-LOCK.md` | phase gates, evidence, rollback |

---

## 🔐 Keamanan (produksi)

- **Auth**: semua route API (kecuali `/health` & login) wajib token. Password dashboard
  **tidak boleh** di-bundle ke frontend — gunakan `/api/login` → token sesi HMAC (TTL 24h)
  → `Authorization: Bearer <token>`. X-Auth (password) tetap didukung utk CLI/curl.
- **CORS**: allowlist origin dashboard (`ALLOWED_ORIGINS` env). Nol wildcard.
- **Rate limit**: per-IP (default 60 req/60s, `RL_LIMIT`/`RL_WINDOW`).
- **Query `?auth=`**: dihapus total (password tidak pernah di query string / access log).
- **Secret**: `.env` di VPS 0600; API key InferHub dibaca dari env/file, tidak pernah dikirim ke browser.
- **InferHub key**: DB hanya menyimpan `key_prefix`; `secret` tidak pernah di-return API.

### Set env (VPS)

`DASHBOARD_PASSWORD` adalah **server-side secret** (dibaca dari file env VPS yang dilindungi,
mis. `~/.hermes-suisui/backend.env` / `Environment=` unit) — **jangan pernah menuliskan nilainya
di repo atau dokumen**. Referensi nama variabel saja:

```bash
# variabel yang wajib tersedia (nilai di file env VPS 0600, bukan di repo)
export ALLOWED_ORIGINS='https://upstream-static.vercel.app'
export UPSTREAM_DB='postgresql://gamesim:***@127.0.0.1:5432/upstream'
export UPSTREAM_API_PORT=8124
export UPSTREAM_POLL_SECONDS=10
export RL_LIMIT=60 RL_WINDOW=60 SESSION_TTL=86400
# DASHBOARD_PASSWORD  (server-side secret — hanya di VPS, jangan di-commit)
# FOREX_KEY           (server-side secret — kurs live gen_finance)
```

---

## 🚀 Deploy

### Backend (VPS)

Service berjalan sebagai systemd user di bawah user `gamesim`. Akses unit dengan
`XDG_RUNTIME_DIR` yang benar:

```bash
# unit systemd user (lihat deploy/wwma-upstream-backend.service)
cp deploy/wwma-upstream-backend.service ~/.config/systemd/user/
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) systemctl --user daemon-reload
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) systemctl --user enable --now wwma-upstream-backend.service

# auto-pricing daemon (60s)
cp deploy/wwma-auto-pricing.service ~/.config/systemd/user/
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) systemctl --user enable --now wwma-auto-pricing.service

# finance regen (timer harian)
cp deploy/wwma-finance.service deploy/wwma-finance.timer ~/.config/systemd/user/
sudo -u gamesim XDG_RUNTIME_DIR=/run/user/$(id -u gamesim) systemctl --user enable --now wwma-finance.timer

# backup DB harian (cron atau timer)
# 30 3 * * * /home/gamesim/scripts/backup_db.sh >> /home/gamesim/backup.log 2>&1
```

> Perilaku unit: lihat `docs/OPS-RUNBOOK.md` §2 (pola akses), §2a (health check), §2b (journal & env).

### Frontend (Vercel)

```bash
cd frontend
vercel link --yes --project upstream-static
vercel --prod        # JANGAN set VITE_DASHBOARD_PASSWORD — pakai /api/login + token
```

### Auto-pricing arm/disarm

Prefer the audited dashboard/API transition (`POST /api/reliability/arm` | `/disarm`, logged to
`auto_pricing_control_audit`). The file flag remains the operational switch:

```bash
echo 1 > ~/.hermes-suisui/logs/auto-pricing-arm    # ARMED (PUT nyata)
echo 0 > ~/.hermes-suisui/logs/auto-pricing-arm    # DISARM (dry-run)
```

> **⚠️ ARM dengan hati-hati**: pastikan config DB `auto_pricing_config` benar & status
> provider valid. Saat DISARM, daemon hanya dry-run (tidak PUT). Setiap transisi via API di-audit
> (operator, timestamp, old/new state, reason).

## 🔗 Reliability API & SSE

Phase 1 Reliability (shipped) — semua route terautentikasi (kecuali `/health`, `/api/login`):

| Endpoint | Fungsi |
|---|---|
| `GET /api/reliability/summary` | Ringkasan live (armed, service_status, heartbeat, counts, db_freshness, aggregates) |
| `GET /api/reliability/cycles` | Riwayat cycle (cursor `limit` default 50) |
| `GET /api/reliability/events` | Timeline event (cursor `?after=`, `limit` default 100) |
| `GET /api/reliability/models` | State terakhir per model |
| `POST /api/reliability/arm` · `POST /api/reliability/disarm` | ARM/DISARM audited |
| `GET /api/reliability/stream` | SSE live (replay berbasis cursor) |

Detail lengkap: `docs/PRODUCTION-LOCK.md` (endpoint, SSE, event schema, retention 30d/90d,
ARM/DISARM audit, policy).

## 📖 Dokumentasi

- `docs/PRODUCTION-LOCK.md` — **fakta produksi**: VPS, unit, commit `main`, reliability API/SSE, retention, rollback
- `docs/OPS-RUNBOOK.md` — **operasional harian**: health check, journal, env, nginx, rollback, incident response
- `docs/auto-pricing.md` — logika auto-pricing FINAL + daemon reliability + panduan tambah provider/model
- `docs/audit-full.md` — audit keamanan & data (2026-08-12)
- `docs/AUDIT-2026-08-13.md` — audit menyeluruh (6 subagent) + rekomendasi fix
- `docs/inferhub-openapi-spec.json` — OpenAPI spec API InferHub (55 endpoint)

## ➕ Tambah Provider / Model Baru (runbook singkat)

Lengkap: `docs/auto-pricing.md` §3. Ringkasnya:

1. **Provider baru** (akun upstream) — cukup tambah di InferHub. Daemon otomatis
   menghitung `provider_ok_kita` tiap cycle. **Tidak perlu ubah kode/config.**
2. **Model baru di upstream lama** — default band 10% otomatis. Mau band beda,
   insert config DB:
   ```bash
   PGPASSWORD=upstream_local psql -h 127.0.0.1 -U gamesim -d upstream -c \
   "INSERT INTO auto_pricing_config (upstream, model_id, trigger_pct, rebound_pct, updated_at)
    VALUES ('codebuddy','codebuddy/gpt-6.0',10,10,now())
    ON CONFLICT (upstream, model_id) DO UPDATE SET trigger_pct=10, rebound_pct=10, updated_at=now();"
   ```
   Daemon baca DB tiap cycle — **tanpa restart**.
3. **Upstream baru** (mis. groq) — tambah slug ke `scope` + prefix mapping di
   `get_market_min` (`scripts/auto_pricing.py`), config DB utk modelnya, restart daemon.

> Config DB `auto_pricing_config` = satu-satunya sumber band. Kode fallback seragam 10%.

---

## 🧪 Test & CI

CI (GitHub Actions) menjalankan: backend `pytest` + coverage, frontend `vitest` + coverage,
lint & build — **tanpa CD** (deploy manual via VPS).

```bash
# backend (dari backend/)
pip install -r requirements.txt pytest pytest-cov
pytest --cov=app --cov-report=term-missing

# frontend (dari frontend/)
npm install
npm test          # vitest run --coverage
npm run build
```

Workflow: `.github/workflows/ci.yml` (backend + frontend).

---

## 🗄️ Database (PostgreSQL `upstream`)

Tabel inti: `assets`, `payouts`, `refunds`, `impairments` (finance); `earning_history`,
`usage_logs`, `providers`, `provider_asks`, `model_ranking`, `market_snapshot`, `catalog_models`
(ops); `api_keys`, `topups`, `budgets`, `budget_aliases`, `combos`, `combo_models`,
`auto_pricing_config`, `auto_pricing_ops`, `auto_pricing_state`, `auto_pricing_api_log`,
`auto_pricing_control`, `auto_pricing_control_audit`, `reliability_cycles`, `reliability_events`,
`reliability_aggregates`, `pricing_config`, `ledger_meta`.

```bash
pg_dump -d upstream | gzip > backups/inferhub-$(date +%F).sql.gz   # manual
# otomatis: scripts/backup_db.sh (retensi 14 hari)
```

> Retention reliability: raw event 30 hari, aggregate 90 hari (hourly 30d / daily 31–90). Lihat
> `docs/PRODUCTION-LOCK.md`.

---

## 🛠️ Maintenance

```bash
# transaksi keuangan (input tunggal → DB → workbook)
python3 scripts/fin_ops.py buy  --upstream "X" --qty 2 --cost 6750 --curr IDR
python3 scripts/fin_ops.py retire --id A-0xx
python3 scripts/fin_ops.py refund --upstream "X" --qty 60 --amount_idr 403910
python3 scripts/fin_ops.py regen
python3 scripts/fin_ops.py list

# payout / sync dari ledger (legacy)
python3 backend/ledger_update.py add-payout --date 2026-08-13 --amount_usdc 10
```

---

## 🔄 Release Flow

1. Branch `fix` → commit → push → **PR ke `main`** (CI: test + lint + build, tanpa deploy).
2. Review & merge setelah CI hijau.
3. Deploy manual: `git pull` di VPS (`/home/gamesim/dashboard`) → restart unit systemd
   (`wwma-upstream-backend.service`, `wwma-auto-pricing.service`) → `vercel --prod` (frontend,
   dari `frontend/`). **Phase 1 deployment** mensyaratkan CI hijau + PR disetujui + persetujuan
   deploy manual eksplisit; `main` saat ini @ `207a259`.

> Deploy flow lengkap + rollback: `docs/OPS-RUNBOOK.md` §6 (checklist) & §5b (rollback).

---

## 📄 License

Private / enterprise — © 2026. Jangan sebarkan tanpa izin.
