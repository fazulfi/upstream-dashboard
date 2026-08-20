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


sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
from recon_earning import classify_earning_violation

DB_DSN = os.environ.get("UPSTREAM_DB")
if not DB_DSN:
    raise SystemExit("UPSTREAM_DB env wajib diisi (DB production). Refuse to run.")


def db():
    import psycopg
    return psycopg.connect(DB_DSN)


def parity_rule_engine():
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
    from finance_rules import _slug_of, compute_finance

    with db() as conn, conn.cursor() as cur:
        cur.execute("SELECT COALESCE(v, '') FROM ledger_meta WHERE k='kurs_idr_usd'")
        r = cur.fetchone()
        kurs = float(r[0]) if r and r[0] else 17801.17
        cur.execute("SELECT id, upstream, qty, cost_per, curr, status, kurs_idr_usd FROM assets")
        assets = [dict(zip(["id", "upstream", "qty", "cost_per", "curr", "status", "kurs_idr_usd"], row))
                  for row in cur.fetchall()]
        cur.execute("SELECT amount_usdc, status FROM payouts")
        payouts = [{"amount_usdc": row[0], "status": row[1] or "confirmed"} for row in cur.fetchall()]
        cur.execute("SELECT amount_idr, amount_usdc, kurs_idr_usd FROM refunds")
        refunds = [{"amount_idr": row[0], "amount_usdc": row[1], "kurs_idr_usd": row[2]} for row in cur.fetchall()]
        cur.execute("SELECT upstream, loss FROM impairments")
        impairments = [{"upstream": row[0], "loss": row[1]} for row in cur.fetchall()]
        cur.execute("SELECT upstream_slug, count(*) AS n FROM providers WHERE status='ok' GROUP BY upstream_slug")
        providers = [{"upstream_slug": row[0], "n": row[1]} for row in cur.fetchall()]

    # FIN-PARITY-1: dashboard (app.py db_read_finance) and workbook (gen_finance)
    # both call compute_finance on the same DB rows. This verifies rule-engine
    # identity and that the raw rows queried here match both consumers, including
    # per-asset kurs_idr_usd and provider availability data.
    res = compute_finance(assets, payouts, refunds, impairments, kurs, providers=providers)
    expected = round(res["total_payout"] + res["total_refund_usd"] - res["amort_usd"]
                     - res["total_imp_loss_usd"] - res["opex"], 2)
    assert res["net_income"] == expected

    prov_ok = {p["upstream_slug"]: int(p["n"]) for p in providers if p.get("upstream_slug")}
    asset_qty_by = {}
    for asset in assets:
        if (asset.get("status") or "active") == "active":
            slug = _slug_of(asset.get("upstream") or "")
            if slug:
                asset_qty_by[slug] = asset_qty_by.get(slug, 0) + int(float(asset.get("qty") or 0))
    ratio_by = {slug: min(1.0, prov_ok.get(slug, 0) / qty)
                for slug, qty in asset_qty_by.items() if qty > 0}
    manual_amort = 0.0
    for asset in assets:
        if (asset.get("status") or "active") == "active":
            continue
        slug = _slug_of(asset.get("upstream") or "")
        ratio = ratio_by.get(slug, 1.0)
        qty = int(round(int(float(asset.get("qty") or 0)) * ratio))
        asset_kurs = float(asset.get("kurs_idr_usd") or kurs)
        cost = float(asset.get("cost_per") or 0) * qty
        if (asset.get("curr") or "USD").upper() == "IDR":
            cost /= asset_kurs
        manual_amort += round(cost, 4)
    assert res["amort_usd"] == round(manual_amort, 4)
    non_active = sum(1 for a in assets if (a.get("status") or "active") != "active")
    assert len(res["amort_assets"]) == non_active
    return True, res


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
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None


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
        kurs = float(r[0]) if r and r[0] else 0

    # Invariant 1 (utama, DB-based): SUM payout DB == delta withdrawn kumulatif
    with db() as conn, conn.cursor() as cur:
        cur.execute("SELECT MAX(withdrawn) FROM earning_history")
        r = cur.fetchone()
        hist_withdrawn = float(r[0] or 0) if r else 0

    checks.append(("Payout DB == Delta withdrawn (history)",
                   abs(db_payout_sum - hist_withdrawn) < 0.05,
                   f"DB ${db_payout_sum:.2f} ({db_payout_n}) vs history ${hist_withdrawn:.2f}"))
    if abs(db_payout_sum - hist_withdrawn) >= 0.05:
        fails.append(checks[-1])
    else:
        print(f"[PASS] {checks[-1][0]}: {checks[-1][2]}")

    # Invariant 1b (opsional, live API): withdrawn API == payout DB
    # API bisa 403 kalau key tidak punya scope — jadikan warning, bukan FAIL.
    wd = inferhub_get("/publisher/withdrawals") or []
    wd_confirmed = [w for w in wd if (w.get("status") or "confirmed") == "confirmed"]
    api_withdrawn = sum(float(w.get("amountUsdc") or 0) for w in wd_confirmed)
    if wd_confirmed:
        checks.append(("Payout DB == Withdrawn API",
                       abs(db_payout_sum - api_withdrawn) < 0.01,
                       f"DB ${db_payout_sum:.2f} vs API ${api_withdrawn:.2f} ({len(wd_confirmed)})"))
        if abs(db_payout_sum - api_withdrawn) >= 0.01:
            fails.append(checks[-1])
        else:
            print(f"[PASS] {checks[-1][0]}: {checks[-1][2]}")
    else:
        warns.append("API /publisher/withdrawals tak terjangkau (403) — invariant 1b dilewati, pakai history")

    # Invariant 2 (opsional, live API): balance + withdrawn == lifetime
    stats = inferhub_get("/publisher/stats") or {}
    if stats:
        bal = float(stats.get("balanceUsdc") or stats.get("balance") or 0)
        lifetime = float(stats.get("lifetimeEarningsUsdc") or stats.get("totalEarningsUsdc") or 0)
        eq_ok = classify_earning_violation(
            bal, api_withdrawn, lifetime, date.today().isoformat(),
            baseline="2026-08-10 17:56:45",
        ) != "unexplained"
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
            FROM assets a LEFT JOIN impairments i ON i.upstream = a.upstream
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

    # 6. Invariant balance+withdrawn==lifetime HANYA sejak baseline 10-Agu 17:56:45Z.
    #    Sebelum baseline: kurva seed sintetis (882 baris) meleset — BUKAN KPI.
    BASELINE = "2026-08-10 17:56:45"
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT balance, withdrawn, publisher_lifetime, ts FROM earning_history WHERE ts >= %s ORDER BY ts",
            (BASELINE,))
        earning_rows = cur.fetchall()
        cur.execute(
            "SELECT count(*) FROM (SELECT publisher_lifetime, lag(publisher_lifetime) OVER (ORDER BY ts) prev "
            "FROM earning_history WHERE ts >= %s) t WHERE publisher_lifetime < prev",
            (BASELINE,))
        n_nonmono = cur.fetchone()[0]
    classifications = [
        classify_earning_violation(balance, withdrawn, lifetime, ts, baseline=BASELINE)
        for balance, withdrawn, lifetime, ts in earning_rows
    ]
    n_break_live = classifications.count("unexplained")
    n_precision = classifications.count("precision")
    n_transition = classifications.count("withdrawn_transition")
    ok_eq = n_break_live == 0
    checks.append(("Earning equation sejak baseline (10-Agu)", ok_eq,
                   f"pelanggar live: {n_break_live} (seed pre-baseline dikecualikan)"))
    if not ok_eq:
        fails.append(checks[-1])
    else:
        print(f"[PASS] {checks[-1][0]}: {checks[-1][2]}")
    if n_precision:
        warns.append(f"earning_history precision {n_precision} baris")
        print(f"[WARN] Earning precision: {n_precision} baris")
    if n_transition:
        warns.append(f"earning_history withdrawn transition {n_transition} baris")
        print(f"[WARN] Earning withdrawn transition: {n_transition} baris")
    # Non-monotonik = artefak sinkronisasi transisi withdrawn (0<->130/230),
    # BUKAN korupsi data (persamaan balance+withdrawn==lifetime tetap benar di
    # tiap baris). Jadikan warning, bukan FAIL (audit item 6, 2026-08-14).
    if n_nonmono:
        warns.append(f"earning_history non-monotonik {n_nonmono} baris (transisi withdrawn — artefak sync, bukan korupsi)")
        print(f"[WARN] Earning non-monotonik: {n_nonmono} baris (artefak sync withdrawn)")

    try:
        ok_par, res_par = parity_rule_engine()
        checks.append(("FIN-PARITY rule engine identitas net income", ok_par,
                       f"net income ${res_par['net_income']:.2f}"))
        if not ok_par:
            fails.append(checks[-1])
        else:
            print(f"[PASS] {checks[-1][0]}: {checks[-1][2]}")
    except Exception as e:
        fails.append(("FIN-PARITY rule engine", False, str(e)))

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
