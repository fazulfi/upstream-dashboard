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

DB akses via psycopg langsung (DSN dari env UPSTREAM_DB). Semua perintah
atomic (satu transaksi: BEGIN/COMMIT, rollback pada error) + query parameterized
(tanpa manual quoting) + validasi input.
"""
import argparse
import os
import subprocess
import sys
from datetime import date

import psycopg
import json
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
from financial_audit import audit_write  # noqa: E402

# DSN wajib dari env — TIDAK ada fallback hardcode.
DB_DSN = os.environ.get("UPSTREAM_DB")
if not DB_DSN:
    raise SystemExit("UPSTREAM_DB env wajib diisi (DB production). Refuse to run.")


def db():
    """Koneksi psycopg baru (auto-commit off — transaksi dikontrol pemanggil)."""
    return psycopg.connect(DB_DSN)
def load_forex_key():
    """FOREX_KEY dari env; fallback baca ~/.hermes-suisui/.env. Bukan hardcode."""
    if os.environ.get("FOREX_KEY"):
        return os.environ["FOREX_KEY"].strip().strip('"').strip("'")
    try:
        with open(os.path.expanduser("~/.hermes-suisui/.env")) as f:
            for line in f:
                if line.startswith("FOREX_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return ""


def fetch_live_kurs():
    """Tarik kurs IDR realtime (forexrateapi). Gagal = None (pakai meta lama)."""
    key = load_forex_key()
    if not key:
        print("  ⚠️ FOREX_KEY tidak ada — kurs pakai nilai meta DB")
        return None
    try:
        url = ("https://api.forexrateapi.com/v1/latest?api_key=%s&base=USD&currencies=IDR" % key)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode())
        kurs = float(data["rates"]["IDR"])
        print("  Kurs live: $1 = Rp %.2f" % kurs)
        return kurs
    except Exception as e:
        print("  ⚠️ Gagal fetch kurs live (%s) — pakai nilai meta DB" % e)
        return None


def update_meta_kurs(conn, cur, kurs, actor):
    """Simpan kurs terbaru ke ledger_meta (agar report lain ikut realtime)."""
    try:
        cur.execute(
            "INSERT INTO ledger_meta (k, v) VALUES ('kurs_idr_usd', %s) "
            "ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v",
            (str(round(kurs, 4)),),
        )
        audit_write(conn, "ledger_meta", "kurs_idr_usd", "update-kurs", actor, "fin_ops.buy",
                    before=None, after={"kurs_idr_usd": kurs})
        cur.execute(
            "INSERT INTO ledger_meta (k, v) VALUES ('kurs_updated', %s) "
            "ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v",
            (date.today().isoformat(),),
        )
    except Exception:
        pass


def parse_asset_id_number(aid):
    """Ambil angka maksimal dari id aset (dukung suffix huruf, mis. 'A-017a')."""
    best = 0
    stem = aid.split("-")[-1]
    digits = ""
    for ch in stem:
        if ch.isdigit():
            digits += ch
        elif digits:
            break
    return int(digits) if digits else 0


def next_asset_id(conn, cur):
    """Generate id aset berikutnya DALAM transaksi yang sama (serialized via lock).

    Dipanggil hanya di dalam blok transaksi (setelah conn.rollback/commit),
    sehingga 2 buy concurrent tidak bisa memilih id yang sama:
    lock tabel assets (SHARE ROW EXCLUSIVE) dibuat dulu, lalu SELECT max + INSERT
    dalam satu transaksi yang sama -> atomic, tanpa TOCTOU & tanpa reuse id.
    """
    cur.execute("LOCK TABLE assets IN SHARE ROW EXCLUSIVE MODE")
    cur.execute("SELECT id FROM assets")
    best = 0
    for (aid,) in cur.fetchall():
        n = parse_asset_id_number(aid)
        if n > best:
            best = n
    return f"A-{best + 1:03d}"


def cmd_buy(a):
    up = (a.upstream or "").strip()
    if not up:
        print("✗ --upstream wajib diisi")
        sys.exit(1)
    qty = a.qty
    cost = a.cost
    if qty <= 0:
        print("✗ --qty harus > 0")
        sys.exit(1)
    if cost <= 0:
        print("✗ --cost harus > 0")
        sys.exit(1)
    curr = a.curr.upper()
    if curr not in ("IDR", "USD"):
        print("✗ --curr harus IDR atau USD")
        sys.exit(1)
    buy = a.buy or date.today().isoformat()
    import datetime
    try:
        datetime.date.fromisoformat(buy)
    except ValueError:
        print(f"✗ --buy bukan tanggal ISO ({buy})")
        sys.exit(1)
    lifespan = a.lifespan or 30
    if not (1 <= lifespan <= 365):
        print("✗ --lifespan harus 1..365 hari")
        sys.exit(1)
    label = a.label or f"{up} {qty} akun x {cost:,.0f} {curr} ({buy})"

    # Kurs realtime saat INPUT (wajib utk pencatatan perusahaan — kurs per-transaksi)
    kurs = fetch_live_kurs()

    with db() as conn:
        with conn.cursor() as cur:
            aid = next_asset_id(conn, cur)  # id di-generate di transaksi yg sama
            cur.execute(
                "INSERT INTO assets (id, upstream, qty, cost_per, curr, buy, lifespan_d, status, label, kurs_idr_usd, created_by) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', %s, %s, %s)",
                (aid, up, qty, cost, curr, buy, lifespan, label, kurs if curr == "IDR" else None, a.actor),
            )
            if kurs is not None:
                update_meta_kurs(conn, cur, kurs, a.actor)
            audit_write(conn, "assets", aid, "add-asset", a.actor, "fin_ops.buy",
                        before=None, after={"id": aid, "upstream": up, "qty": qty,
                                             "cost_per": cost, "curr": curr, "buy": buy,
                                             "lifespan_d": lifespan, "label": label})
        conn.commit()


def cmd_retire(a):
    aid = (a.id or "").strip()
    if not aid:
        print("✗ --id wajib diisi")
        sys.exit(1)
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, upstream, qty, cost_per, curr FROM assets WHERE id=%s", (aid,))
            rows = cur.fetchall()
            if not rows:
                print(f"✗ asset {aid} tidak ditemukan")
                sys.exit(1)
            if a.label:
                cur.execute(
                    "UPDATE assets SET status='retired', label=%s, retired_by=%s, retired_at=now() WHERE id=%s",
                    (a.label, a.actor, aid))
            else:
                cur.execute(
                    "UPDATE assets SET status='retired', retired_by=%s, retired_at=now() WHERE id=%s",
                    (a.actor, aid))
            audit_write(conn, "assets", aid, "retire-asset", a.actor, "fin_ops.retire",
                        before={"status": "active"}, after={"status": "retired"})
        conn.commit()
    print(f"✓ RETIRE  {aid}  ({rows[0][1]}) -> status retired")


def cmd_refund(a):
    import datetime
    import uuid
    up = (a.upstream or "").strip()
    if not up:
        print("✗ --upstream wajib diisi")
        sys.exit(1)
    d = a.date or date.today().isoformat()
    try:
        datetime.date.fromisoformat(d)
    except ValueError:
        print(f"✗ --date bukan tanggal ISO ({d})")
        sys.exit(1)
    if (a.qty or 0) < 0:
        print("✗ --qty tidak boleh negatif")
        sys.exit(1)
    # Minimal satu nominal harus ada, TIDAK boleh dua-duanya (ambigu).
    idr_ok = (a.amount_idr or 0) > 0
    usd_ok = (a.amount_usdc or 0) > 0
    if idr_ok == usd_ok:
        print("✗ butuh TEPAT SATU nominal: --amount_idr ATAU --amount_usdc (> 0)")
        sys.exit(1)
    kurs = fetch_live_kurs()
    # Anti-duplikat: cek (upstream, date, nominal) yang sama sudah ada.
    with db() as conn:
        with conn.cursor() as cur:
            if idr_ok:
                cur.execute(
                    "SELECT id FROM refunds WHERE upstream=%s AND date=%s AND amount_idr=%s",
                    (up, d, float(a.amount_idr)),
                )
            else:
                cur.execute(
                    "SELECT id FROM refunds WHERE upstream=%s AND date=%s AND amount_usdc=%s",
                    (up, d, float(a.amount_usdc)),
                )
            if cur.fetchone():
                print(f"✗ Refund duplikat terdeteksi: {up} {d} sudah tercatat. Abort.")
                return
            rid = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO refunds (id, upstream, qty, amount_idr, amount_usdc, label, date, kurs_idr_usd, created_by) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (rid, up, a.qty or 0, a.amount_idr or 0, a.amount_usdc or 0, a.label or "", d,
                 kurs if idr_ok else None, a.actor),
            )
            audit_write(conn, "refunds", rid, "add-refund", a.actor, "fin_ops.refund",
                        before=None, after={"upstream": up, "qty": a.qty or 0,
                                           "amount_idr": a.amount_idr, "amount_usdc": a.amount_usdc,
                                           "label": a.label})
    print(f"✓ REFUND  {rid}  {up}  qty {a.qty or 0}  IDR {a.amount_idr or 0:,.0f}  USDC {a.amount_usdc or 0}  kurs {kurs or 'meta'}")


def cmd_list(a):
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, upstream, qty, cost_per, curr, status, label FROM assets ORDER BY id")
            rows = cur.fetchall()
            best = 0
            for r in rows:
                n = parse_asset_id_number(r[0])
                if n > best:
                    best = n
            nxt = f"A-{best + 1:03d}"
    act = sum(1 for r in rows if r[5] == "active")
    ret = sum(1 for r in rows if r[5] == "retired")
    print(f"ASET ({len(rows)} entry: {act} active, {ret} retired)\n")
    for r in rows:
        print(f"  {r[0]:6s} {r[1]:22s} qty={r[2]:>4}  {float(r[3]):>10,.2f} {r[4]}  {r[5]}")
    print(f"\n  NEXT ID: {nxt}")


def cmd_regen(a):
    r = subprocess.run([sys.executable, "/home/gamesim/scripts/gen_finance.py"], capture_output=True, text=True)
    print(r.stdout)
    if r.returncode != 0:
        print("STDERR:", r.stderr[-1500:])
        sys.exit(1)
    print("✓ workbook keuangan.xlsx regenerated dari DB")


def resolve_actor(a):
    """Prioritas: --actor > env FIN_OPS_ACTOR > user OS (getpass.getuser())."""
    actor = getattr(a, "actor", None) or os.environ.get("FIN_OPS_ACTOR") or ""
    if actor:
        return actor.strip()
    try:
        import getpass
        return getpass.getuser() or "unknown"
    except Exception:
        return "unknown"


def main():
    p = argparse.ArgumentParser(description="fin_ops — input transaksi keuangan, DB single source")
    p.add_argument("--actor", default=None, help="siapa yang mencatat (default: env FIN_OPS_ACTOR / user OS)")
    sub = p.add_subparsers(dest="cmd", required=True)

    pb = sub.add_parser("buy", help="beli aset baru (auto A-0xx)")
    pb.add_argument("--upstream", required=True)
    pb.add_argument("--qty", type=int, required=True)
    pb.add_argument("--cost", type=float, required=True)
    pb.add_argument("--curr", required=True, choices=["IDR", "USD"])
    pb.add_argument("--buy", default=None)
    pb.add_argument("--lifespan", type=int, default=30)
    pb.add_argument("--label", default=None)
    pb.add_argument("--actor", default=None)
    pb.set_defaults(fn=cmd_buy)

    pr = sub.add_parser("retire", help="retire aset (habis)")
    pr.add_argument("--id", required=True)
    pr.add_argument("--label", default=None)
    pr.add_argument("--actor", default=None)
    pr.set_defaults(fn=cmd_retire)

    pf = sub.add_parser("refund", help="tambah refund")
    pf.add_argument("--upstream", required=True)
    pf.add_argument("--qty", type=int, default=0)
    pf.add_argument("--amount_idr", type=float, default=0)
    pf.add_argument("--amount_usdc", type=float, default=0)
    pf.add_argument("--label", default="")
    pf.add_argument("--date", default=None)
    pf.add_argument("--actor", default=None)
    pf.set_defaults(fn=cmd_refund)

    pl = sub.add_parser("list", help="list aset")
    pl.set_defaults(fn=cmd_list)

    pg = sub.add_parser("regen", help="regen workbook dari DB")
    pg.set_defaults(fn=cmd_regen)

    a = p.parse_args()
    a.actor = resolve_actor(a)
    a.fn(a)

if __name__ == "__main__":
    main()