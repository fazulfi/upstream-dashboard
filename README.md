# Upstream Dashboard — InferHub Publisher Operations

**Enterprise-grade operations dashboard & auto-pricing engine for AI API publishers on InferHub.**

Dashboard memantau fleet provider, earnings, keuangan (P&L), market/orderbook, dan mengendalikan
harga jual (ask) per model secara manual maupun otomatis (auto-pricing daemon) — dengan
PostgreSQL sebagai sumber kebenaran (single source of truth) untuk data finansial.

---

## ✨ Fitur

| Area | Kemampuan |
|---|---|
| **Fleet** | Health provider per upstream (ok / invalid / drained), usage windows, recheck, enabled toggle |
| **Market** | Orderbook per model (ladder harga + depth per upstream), min/max/spread, catalog, combos |
| **Harga** | Set harga ask manual (per model × upstream), auto-pricing daemon (undercut kompetitor non-trigger, HOLD leader) |
| **Keuangan** | P&L lengkap (amortisasi, impairment, refund, payout), workbook Excel, kurs live, topup/refund/buy/retire CLI |
| **Analytics** | Earnings trend per-call, breakdown per model/provider, model ranking, publisher analytics per range |
| **Ops** | API keys InferHub (create/rotate/revoke), budgets & aliases, topup QRIS, settings, arm/disarm auto-pricing |

---

## 🏗️ Arsitektur

```
┌─────────────┐   HTTPS /api/*    ┌──────────────────┐   HTTPS /api/*   ┌─────────────────┐
│  Frontend   │ ────────────────▶ │  Nginx (TLS)     │ ───────────────▶ │  Backend Flask  │
│  React/Vite │  (Vercel deploy)  │ ops.budgezen.com │  proxy :8124    │  (waitress)     │
└─────────────┘                   └──────────────────┘                 └────────┬────────┘
                                                                                 │ poll (10s)
                                                                                 ▼
                                        ┌──────────────────────┐        ┌─────────────────┐
                                        │  PostgreSQL upstream │◀───────│ InferHub API    │
                                        │  (finance, history,  │        │ inferhub.dev/api│
                                        │   fleet, config)     │        └─────────────────┘
                                        └──────────────────────┘
                                                                        ┌─────────────────┐
                                        Auto-pricing daemon ───────────▶│ InferHub /market │
                                        (systemd user service)          └─────────────────┘
```

### Komponen

| Komponen | Path | Teknologi |
|---|---|---|
| Backend API | `backend/app.py` | Python 3 · Flask · waitress · psycopg3 |
| Full sync & ledger CLI | `backend/full_sync.py`, `backend/ledger_update.py` | Python |
| Frontend | `frontend/` | React 19 · Vite 8 · recharts · react-table |
| Auto-pricing | `scripts/auto_pricing.py` | Python daemon (systemd user) |
| Finance CLI | `scripts/fin_ops.py` (input tunggal), `scripts/gen_finance.py` (regen workbook) | Python |
| Backup | `scripts/backup_db.sh` | pg_dump · gzip · retention 14d |
| Deploy units | `deploy/*.service` | systemd user |

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

```bash
export DASHBOARD_PASSWORD='...'        # atau Environment= di unit systemd
export ALLOWED_ORIGINS='https://frontend-fazulfis-projects.vercel.app'
export UPSTREAM_DB='postgresql://gamesim:***@127.0.0.1:5432/upstream'
export UPSTREAM_API_PORT=8124
export UPSTREAM_POLL_SECONDS=10
export RL_LIMIT=60 RL_WINDOW=60 SESSION_TTL=86400
export FOREX_KEY='...'                 # utk gen_finance (kurs live)
```

---

## 🚀 Deploy

### Backend (VPS)

```bash
# unit systemd user (lihat deploy/wwma-upstream-backend.service)
cp deploy/wwma-upstream-backend.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now wwma-upstream-backend

# auto-pricing daemon
cp deploy/wwma-auto-pricing.service ~/.config/systemd/user/
systemctl --user enable --now wwma-auto-pricing.service

# finance regen (timer harian)
cp deploy/wwma-finance.service deploy/wwma-finance.timer ~/.config/systemd/user/
systemctl --user enable --now wwma-finance.timer

# backup DB harian (cron atau timer)
# 30 3 * * * /home/gamesim/scripts/backup_db.sh >> /home/gamesim/backup.log 2>&1
```

### Frontend (Vercel)

```bash
cd frontend
vercel link --yes --project frontend
vercel --prod        # JANGAN set VITE_DASHBOARD_PASSWORD — pakai /api/login + token
```

### Auto-pricing arm/disarm

```bash
echo 1 > ~/.hermes-suisui/logs/auto-pricing-arm    # ARMED (PUT nyata)
echo 0 > ~/.hermes-suisui/logs/auto-pricing-arm    # DISARM (dry-run)
```

> **⚠️ ARM dengan hati-hati**: pastikan config DB `auto_pricing_config` benar & status
> provider valid. Saat DISARM, daemon hanya dry-run (tidak PUT).

---

## 📖 Dokumentasi

- `docs/audit-full.md` — audit keamanan & data (2026-08-12)
- `docs/AUDIT-2026-08-13.md` — audit menyeluruh (6 subagent) + rekomendasi fix
- `docs/auto-pricing.md` — logika auto-pricing & fin ops
- `docs/inferhub-openapi-spec.json` — OpenAPI spec API InferHub (55 endpoint)

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

Workflow: `.github/workflows/ci.yml` (backend) · `.github/workflows/frontend.yml` (frontend).

---

## 🗄️ Database (PostgreSQL `upstream`)

Tabel inti: `assets`, `payouts`, `refunds`, `impairments` (finance); `earning_history`,
`usage_logs`, `providers`, `provider_asks`, `model_ranking`, `market_snapshot`, `catalog_models`
(ops); `api_keys`, `topups`, `budgets`, `budget_aliases`, `combos`, `combo_models`,
`auto_pricing_config`, `pricing_config`, `ledger_meta`.

```bash
pg_dump -d upstream | gzip > backups/inferhub-$(date +%F).sql.gz   # manual
# otomatis: scripts/backup_db.sh (retensi 14 hari)
```

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
3. Deploy manual: pull di VPS → restart unit systemd → `vercel --prod` (frontend).

---

## 📄 License

Private / enterprise — © 2026. Jangan sebarkan tanpa izin.
