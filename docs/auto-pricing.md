# Auto-Pricing Daemon

**Upstream:** CodeBuddy + ClinePass + CodeBuddy.CN — undercut kompetitor di InferHub market.

## Logika Final (2026-08-12, Faiz spec)

Anchor kompetitor = `/market minAskIn` (kompetitor **sejati** dari platform, BUKAN
catalog/provider milik kita sendiri). Ini krusial — catalog `asksIn` hanya berisi harga
provider kita, jadi kalau dipakai sebagai anchor daemon bakal "undercut ke harga diri
sendiri" → loop tak berujung.

```
comp          = /market minAskIn    (kompetitor sejati)
floor         = official x rebound_pct    (jual wajar minimum utk REBOUND)
trigger       = official x trigger_pct    (batas "harga tidak wajar")

per model per cycle:
  our <= komp        -> HOLD/leader   (kita sudah termurah, DIAM)
  komp <= trigger    -> REBOUND ke floor (kompetitor gila murah, balik jual wajar)
  komp > trigger     -> UNDERCUT ke (komp - 0.1% x official)   (BEBAS di bawah floor)
  our ~= target      -> HOLD
```

**UNDERCUT tidak dibatasi floor** — kalau kompetitor murah (mis. 96% off), kita ikut turun
sampai jadi termurah. **REBOUND hanya saat kompetitor ≤ trigger** (harga tidak wajar) →
balik ke floor.

### Band default per upstream (bisa di-override config per model)

| Upstream      | trigger | rebound |
|---------------|---------|---------|
| codebuddy     | 2%      | 10%     |
| codebuddy-cn  | 2%      | 10%     |
| cline-pass    | deepseek-flash 10%, lain 20% | deepseek-flash 15%, lain 25% |

Config per model dari DB (`auto_pricing_config`) → file
`~/.hermes-suisui/logs/auto-pricing-config.json` menang atas default.

## Stabilitas / anti-loop

- **Anchor `/market`, bukan catalog** → tidak undercut ke harga diri sendiri.
- **Cooldown** per model (cb/cbcn 10s, cp 15s) → tidak gerak ganda dalam 1 cycle.
- **HTTP 429 / timeout** → skip model, jangan retry cycle sama.
- **Atomic write** untuk semua state file (`.tmp` + `os.replace`).

## Deploy (systemd user service)

Unit: `deploy/wwma-auto-pricing.service`

```bash
# install ke systemd user
cp deploy/wwma-auto-pricing.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now wwma-auto-pricing.service

# cek status / log
systemctl --user status wwma-auto-pricing.service
systemctl --user stop  wwma-auto-pricing.service

# arm/disarm eksekusi PUT nyata (tanpa mengubah interval)
echo 1 > ~/.hermes-suisui/logs/auto-pricing-arm   # ARMED (PUT nyata)
echo 0 > ~/.hermes-suisui/logs/auto-pricing-arm   # DISARM (dry-run saja)
```

Service `ExecStart` pakai interpreter `.venv-dash/bin/python3` dan interval `--interval 30`.

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

`gen_finance.py` baca DB (bukan ledger.json). Markdown diupdate manual per transaksi.
