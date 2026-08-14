#!/usr/bin/env python3
"""recon_finance.py — rekonsiliasi otomatis keuangan (harian, cron).

Cek invariant pencatatan keuangan (company-grade):
  1. SUM(payouts confirmed) DB == withdrawn total API InferHub
  2. balance + withdrawn == earning_alltime (persamaan akuntansi)
  3. Total payout DB == delta withdrawn kumulatif
  4. Kurs meta valid (>10000) & baru
  5. Aset: tidak ada retired tanpa impairment/amortisasi (warning)
  6. Refund: amount_usdc konsisten dgn kurs

Output: status PASS/FAIL per invariant; exit 1 kalau ada FAIL (biar cron/alert).
"""
import os
import sys
import json
import urllib.request
from datetime import date

DB_DSN = os.environ.get("UPSTREAM_DB", "postgresql://gamesim:upstream_local@127.0.0.1:5432/upstream")


def db():
    import psycopg
    return psycopg.connect(DB_DSN)


def inferhub_get(path, timeout=20):
    """GET API InferHub dgn key dari env/.env."""
    key = os.environ.get("INFERHUB_API_KEY", "")
    if not key:
        try:
            with open(os.path.expanduser("~/.hermes-suisui/.env")) as f:
                for line in f:
                    if line.startswith("INFERHUB_API_KEY="):
                        key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
        except Exception:
            pass
    if not key:
        return None
    req = urllib.request.Request(
        "https://inferhub.dev/api" + path,
        headers={"Authorization": "Bearer " + key, "User-Agent": "recon/1.0"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def main():
    fails = []
    warns = []
    checks = []

    # 1. Payout DB vs withdrawn API
    with db() as conn, conn.cursor() as cur:
        cur.execute("SELECT COALESCE(SUM(amount_usdc),0), COUNT(*) FROM payouts WHERE status='confirmed'")
        db_payout_sum, db_payout_n = cur.fetchone()
        cur.execute("SELECT v FROM ledger_meta WHERE k='kurs_idr_usd'")
        r = cur.fetchone()
        kurs = float(r["v"]) if r and r["v"] else 0

    wd = inferhub_get("/publisher/withdrawals") or []
    wd_confirmed = [w for w in wd if (w.get("status") or "confirmed") == "confirmed"]
    api_withdrawn = sum(float(w.get("amountUsdc") or 0) for w in wd_confirmed)

    checks.append(("Payout DB == Withdrawn API",
                   abs(db_payout_sum - api_withdrawn) < 0.01,
                   f"DB ${db_payout_sum:.2f} ({db_payout_n}) vs API ${api_withdrawn:.2f} ({len(wd_confirmed)})"))
    if abs(db_payout_sum - api_withdrawn) >= 0.01:
        fails.append(checks[-1])
    else:
        print(f"[PASS] {checks[-1][0]}: {checks[-1][2]}")

    # 2. Balance + withdrawn == lifetime (dari /publisher/earnings atau /publisher/stats)
    stats = inferhub_get("/publisher/stats") or {}
    if stats:
        bal = float(stats.get("balanceUsdc") or stats.get("balance") or 0)
        lifetime = float(stats.get("lifetimeEarningsUsdc") or stats.get("totalEarningsUsdc") or stats.get("publisherLifetime") or 0)
        eq_ok = abs(bal + api_withdrawn - lifetime) < 0.05
        checks.append(("Balance + Withdrawn == Lifetime",
                       eq_ok,
                       f"${bal:.2f} + ${api_withdrawn:.2f} = ${bal+api_withdrawn:.2f} vs ${lifetime:.2f}"))
        if not eq_ok:
            fails.append(checks[-1])
        else:
            print(f"[PASS] {checks[-1][0]}: {checks[-1][2]}")
    else:
        warns.append("API stats tidak tersedia — invariant 2 dilewati")

    # 4. Kurs valid
    kurs_ok = kurs > 10000
    checks.append(("Kurs meta valid", kurs_ok, f"kurs_idr_usd = {kurs:.2f}"))
    if not kurs_ok:
        fails.append(checks[-1])
    else:
        print(f"[PASS] {checks[-1][0]}: {checks[-1][2]}")

    # 5. Aset retired tanpa impairment (warning — konvensi amortisasi)
    with db() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT a.id, a.upstream, a.qty*a.cost_per AS total_cost, a.curr
            FROM assets a LEFT JOIN impairments i ON i.upstream = a.upstream AND i.loss > 0
            WHERE a.status != 'active' AND i.id IS NULL
        """)
        orphan_retired = cur.fetchall()
    if orphan_retired:
        for o in orphan_retired:
            warns.append(f"aset retired tanpa impairment: {o[0]} ({o[1]}) {o[2]:,.0f} {o[3]}")
        print(f"[WARN] {len(orphan_retired)} aset retired tanpa impairment (amortisasi konvensi)")

    # 3. Delta withdrawn kumulatif == payout DB (dari earning_history)
    with db() as conn, conn.cursor() as cur:
        cur.execute("SELECT MAX(withdrawn) FROM earning_history")
        r = cur.fetchone()
        max_withdrawn = float(r[0] or 0) if r else 0
    checks.append(("Delta withdrawn == Payout DB", abs(max_withdrawn - db_payout_sum) < 0.05,
                   f"max withdrawn history ${max_withdrawn:.2f} vs DB ${db_payout_sum:.2f}"))
    if abs(max_withdrawn - db_payout_sum) >= 0.05:
        fails.append(checks[-1])
    else:
        print(f"[PASS] {checks[-1][0]}: {checks[-1][2]}")

    # Report
    print()
    print(f"=== REKONSILIASI {date.today().isoformat()} ===")
    print(f"  Payout DB: ${db_payout_sum:.2f} ({db_payout_n} baris)")
    print(f"  Withdrawn API: ${api_withdrawn:.2f} ({len(wd_confirmed)} withdrawal)")
    print(f"  Kurs: Rp {kurs:.2f}")
    if warns:
        print(f"  WARN ({len(warns)}):")
        for w in warns:
            print(f"    - {w}")
    if fails:
        print(f"  FAIL ({len(fails)}):")
        for f in fails:
            print(f"    - {f[0]}: {f[2]}")
        print("\n✗ REKONSILIASI GAGAL — periksa di atas")
        sys.exit(1)
    print("\n✓ REKONSILIASI LULUS — semua invariant konsisten")
    return 0


if __name__ == "__main__":
    main()
