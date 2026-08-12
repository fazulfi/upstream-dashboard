#!/usr/bin/env python3
"""fin_ops.py — satu-satunya pintu input transaksi keuangan.

Prinsip: DB PostgreSQL = SATU-SATUNYA sumber kebenaran. Dashboard baca DB.
Workbook keuangan.xlsx di-regen dari DB. Markdown diupdate manual oleh Mama.

Cara pakai (semua tulis ke DB langsung):
  python3 fin_ops.py buy --upstream "CodeBuddy.CN" --qty 2 --cost 6750 --curr IDR [--label ".."] [--buy 2026-08-12] [--lifespan 30]
  python3 fin_ops.py retire --id A-033 [--label ".."]
  python3 fin_ops.py refund --upstream "CodeBuddy.CN" --qty 60 --amount_idr 403910 --label "refund 60 cbcn"
  python3 fin_ops.py regen        # panggil gen_finance.py -> regen workbook dari DB
  python3 fin_ops.py list         # daftar aset

Peer auth: konek via unix socket sebagai OS user (gamesim), tanpa password.
"""
import argparse, os, subprocess, sys

def db():
    # libpq subprocess: psql peer auth sebagai gamesim
    return None  # helper di bawah pakai subprocess psql

def run_sql(sql, single=False):
    """Jalankan SQL via psql peer auth, return rows (list of list) atau [[val]]."""
    r = subprocess.run(["psql", "-d", "upstream", "-t", "-A", "-F", "\t", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"psql error: {r.stderr}")
    if not r.stdout.strip():
        return [] if single else []
    rows = [line.split("\t") for line in r.stdout.strip().split("\n")]
    return rows

def next_asset_id():
    rows = run_sql("SELECT id FROM assets ORDER BY id")
    # parse A-0xx, cari max numeric, dukung suffix huruf (A-017a)
    best = 0
    for (aid,) in rows:
        stem = aid.split("-")[-1]
        digits = ""
        for ch in stem:
            if ch.isdigit():
                digits += ch
            else:
                break
        if digits and int(digits) > best:
            best = int(digits)
    nxt = best + 1
    return f"A-{nxt:03d}"

def find_last_grow():
    """Cek max A-0xx yg ada; kembalikan id berikutnya (persis next_asset_id)."""
    return next_asset_id()

def cmd_buy(a):
    aid = next_asset_id()
    qty = a.qty
    cost = a.cost
    curr = a.curr.upper()
    up = a.upstream
    buy = a.buy or "2026-08-12"
    lifespan = a.lifespan or 30
    label = a.label or f"{up} {qty} akun x {cost:,.0f} {curr} ({buy})"
    lab = label.replace("'", "''")
    up2 = up.replace("'", "''")
    sql = (f"INSERT INTO assets (id, upstream, qty, cost_per, curr, buy, lifespan_d, status, label) "
           f"VALUES ('{aid}', '{up2}', {qty}, {cost}, '{curr}', '{buy}', {lifespan}, 'active', '{lab}') "
           f"ON CONFLICT (id) DO UPDATE SET qty=EXCLUDED.qty, cost_per=EXCLUDED.cost_per, status='active', label=EXCLUDED.label;")
    run_sql(sql)
    print(f"✓ BUY  {aid}  {up}  {qty} x {cost:,.0f} {curr}  [{buy}] active")
    print(f"   label: {label}")
    print(f"   NEXT ID otomatis = {next_asset_id()}")

def cmd_retire(a):
    aid = a.id
    # cek ada
    rows = run_sql(f"SELECT id, upstream, qty, cost_per, curr FROM assets WHERE id='{aid}'")
    if not rows:
        print(f"✗ asset {aid} tidak ditemukan")
        sys.exit(1)
    lab = (a.label or "").replace("'", "''")
    sql = f"UPDATE assets SET status='retired'"
    if lab:
        sql += f", label='{lab}'"
    sql += f" WHERE id='{aid}';"
    run_sql(sql)
    print(f"✓ RETIRE  {aid}  ({rows[0][1]}) -> status retired")

def cmd_refund(a):
    # insert refund, tidak mengubah assets (refund = pengurang beban)
    import uuid
    rid = f"REF-{uuid.uuid4().hex[:4].upper()}"
    up = a.upstream.replace("'", "''")
    lab = (a.label or "").replace("'", "''")
    d = a.date or "2026-08-12"
    aidr = a.amount_idr or 0
    ausd = a.amount_usdc or 0
    qty = a.qty or 0
    sql = (f"INSERT INTO refunds (id, upstream, qty, amount_idr, amount_usdc, label, date) "
           f"VALUES ('{rid}', '{up}', {qty}, {aidr}, {ausd}, '{lab}', '{d}');")
    run_sql(sql)
    print(f"✓ REFUND  {rid}  {up}  qty {qty}  IDR {aidr:,.0f}  USDC {ausd}")

def cmd_list(a):
    rows = run_sql("SELECT id, upstream, qty, cost_per, curr, status, label FROM assets ORDER BY id")
    act = sum(1 for r in rows if r[5] == "active")
    ret = sum(1 for r in rows if r[5] == "retired")
    print(f"ASET ({len(rows)} entry: {act} active, {ret} retired)\n")
    for r in rows:
        print(f"  {r[0]:6s} {r[1]:22s} qty={r[2]:>4}  {float(r[3]):>10,.2f} {r[4]}  {r[5]}")
    print(f"\n  NEXT ID: {next_asset_id()}")

def cmd_regen(a):
    r = subprocess.run([sys.executable, "/home/gamesim/scripts/gen_finance.py"], capture_output=True, text=True)
    print(r.stdout)
    if r.returncode != 0:
        print("STDERR:", r.stderr[-1500:])
        sys.exit(1)
    print("✓ workbook keuangan.xlsx regenerated dari DB")

def main():
    p = argparse.ArgumentParser(description="fin_ops — input transaksi keuangan, DB single source")
    sub = p.add_subparsers(dest="cmd", required=True)

    pb = sub.add_parser("buy", help="beli aset baru (auto A-0xx)")
    pb.add_argument("--upstream", required=True)
    pb.add_argument("--qty", type=int, required=True)
    pb.add_argument("--cost", type=float, required=True)
    pb.add_argument("--curr", required=True, choices=["IDR", "USD"])
    pb.add_argument("--buy", default=None)
    pb.add_argument("--lifespan", type=int, default=30)
    pb.add_argument("--label", default=None)
    pb.set_defaults(fn=cmd_buy)

    pr = sub.add_parser("retire", help="retire aset (habis)")
    pr.add_argument("--id", required=True)
    pr.add_argument("--label", default=None)
    pr.set_defaults(fn=cmd_retire)

    pf = sub.add_parser("refund", help="tambah refund")
    pf.add_argument("--upstream", required=True)
    pf.add_argument("--qty", type=int, default=0)
    pf.add_argument("--amount_idr", type=float, default=0)
    pf.add_argument("--amount_usdc", type=float, default=0)
    pf.add_argument("--label", default="")
    pf.add_argument("--date", default=None)
    pf.set_defaults(fn=cmd_refund)

    pl = sub.add_parser("list", help="list aset")
    pl.set_defaults(fn=cmd_list)

    pg = sub.add_parser("regen", help="regen workbook dari DB")
    pg.set_defaults(fn=cmd_regen)

    a = p.parse_args()
    a.fn(a)

if __name__ == "__main__":
    main()
