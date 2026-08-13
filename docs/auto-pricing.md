# Auto-Pricing Daemon

**Upstream:** CodeBuddy + ClinePass + CodeBuddy.CN — undercut kompetitor di InferHub market.

## Logika Final (2026-08-13, Faiz spec — REBOUND DIHAPUS)

Anchor kompetitor = `/market minAskIn` (kompetitor **sejati** dari platform, BUKAN
catalog/provider milik kita sendiri). Orderbook `/catalog` dipakai utk **posisi**.

```
per model per cycle (position tracking WAJIB):
  total_provider   = len(asksIn) di /catalog utk model itu (SEMUA provider)
  provider_ok_kita = jumlah provider enabled kita utk upstream tsb (ok + invalid)
  posisi_kompetitor = total_provider - provider_ok_kita

  anchor komp  = /market minAskIn (kompetitor sejati)
  trigger      = official x trigger_pct  (batas "harga tidak wajar" / range trigger)

  our <= komp                 -> HOLD/leader  (kita sudah termurah di area non-trigger, DIAM)
  komp <= trigger             -> IGNORE range trigger:
                                   UNDERCUT kompetitor NON-TRIGGER terendah
                                   (level orderbook yg MASIH di atas trigger_px), minus offset
  komp > trigger              -> UNDERCUT normal ikut komp - 0.1% x official
  our sudah ~= target         -> HOLD (jangan gerak)
```

**UNDERCUT** = 0.1% × official di bawah level non-trigger terendah. **TIDAK ada REBOUND**,
**tidak ada floor terpisah** — trigger_px = satu-satunya batas (kompetitor di dalam
range trigger diabaikan).

## Sumber Config (DB = source of truth)

- Tabel `auto_pricing_config` (PostgreSQL) = **satu-satunya sumber kebenaran**.
- Daemon baca DB tiap cycle (`_load_config_db`); fallback file JSON
  `~/.hermes-suisui/logs/auto-pricing-config.json` (turunan sinkron dari DB saat startup
  backend / PUT-DELETE config), lalu default band kode.
- Prioritas: **DB > file JSON > default**.

Band default per upstream (fallback bila tidak ada config):

| Upstream | trigger | rebound (legacy, tak dipakai) |
|----------|---------|-------------------------------|
| codebuddy | 2% | 10% |
| codebuddy-cn | 5% | 15% |
| cline-pass | deepseek-v4-flash 10%, lainnya 20% | 15% / 25% |

> Rebound **tidak dipakai lagi** (REBOUND DIHAPUS v2). Kolom rebound_pct hanya legacy.

## Stabilitas / anti-loop

- **Anchor `/market`, bukan catalog** → tidak undercut ke harga diri sendiri.
- **Anti-self-undercut**: orderbook histogram dikurangi ask kita sendiri (SEMUA provider
  enabled kita, termasuk yang invalid — mereka tetap publikasi ask).
- **Cooldown** per model (cb/cbcn 10s, cp 15s) — `ts` hanya di-update saat PUT sukses.
- **Backoff** pasca 429/timeout: skip model 180s (`skip_until`).
- **HTTP 429 / timeout** → skip, jangan retry cycle sama.
- **Atomic write** untuk semua state file (`.tmp` + `os.replace`).

## Arm / Disarm

```bash
echo 1 > ~/.hermes-suisui/logs/auto-pricing-arm   # ARMED (PUT nyata)
echo 0 > ~/.hermes-suisui/logs/auto-pricing-arm   # DISARM (dry-run saja)
```

> **⚠️ Pastikan config DB benar & provider valid sebelum ARM.** Saat DISARM daemon
> berjalan dry-run (log `[DRY]`, tanpa PUT).

## Deploy (systemd user service)

Unit: `deploy/wwma-auto-pricing.service`

```bash
cp deploy/wwma-auto-pricing.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now wwma-auto-pricing.service
```

## File

- `scripts/auto_pricing.py` — daemon & package importable (argumen: `--once`, `--dry-run`, `--interval`).
- Log: `~/.hermes-suisui/logs/auto-pricing.log`
- State cycle: `~/.hermes-suisui/logs/auto-pricing-state.json`
- Hold/cooldown: `~/.hermes-suisui/logs/auto-pricing-hold.json`
- Arm flag: `~/.hermes-suisui/logs/auto-pricing-arm`

---

## Fin Ops — Single Source Input

DB PostgreSQL = satu-satunya sumber kebenaran keuangan. Dashboard baca DB.
`scripts/fin_ops.py` = satu pintu input transaksi → otomatis update DB → regen workbook → dashboard live.

```bash
python3 scripts/fin_ops.py buy --upstream "X" --qty 2 --cost 6750 --curr IDR [--label ".."]
python3 scripts/fin_ops.py retire --id A-0xx [--label ".."]
python3 scripts/fin_ops.py refund --upstream "X" --qty 60 --amount_idr 403910 [--label ".."]
python3 scripts/fin_ops.py regen        # regen keuangan.xlsx dari DB
python3 scripts/fin_ops.py list
```

`gen_finance.py` baca DB (bukan ledger.json). **Net income workbook = net income dashboard**
(logika disamakan: amort = aset retired full cost, refund dikurang, seed impairment zero-kan, opex 0.10).
Kurs live dari env `FOREX_KEY` (fallback `~/.hermes-suisui/.env`).

## Backup DB

`scripts/backup_db.sh` — pg_dump gzip harian ke `shared-memory/inferhub-business/backups/`,
retensi 14 hari. Jadwalkan via cron/timer.
