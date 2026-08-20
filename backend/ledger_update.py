#!/usr/bin/env python3
"""Upstream ledger updater — tulis asset/impairment/payout ke PostgreSQL + sync ledger.json.
Dipakai untuk update ledger TANPA restart backend (backend baca DB tiap request).

Usage:
  python ledger_update.py add-asset --id A-023 --upstream "ChatGPT+ VCC" --qty 1 --cost 45000 --curr IDR --buy 2026-08-10 --lifespan 30
  python ledger_update.py retire-asset --id A-022 --label "mati/expired"
  python ledger_update.py reactivate-asset --id A-017a
  python ledger_update.py add-payout --date 2026-08-11 --usd 10 --note "Payout #14"
  python ledger_update.py sync-from-file   # import ulang ledger.json -> DB
  python ledger_update.py show
"""
import argparse
import getpass
import json
import os
import sys
import urllib.request

import psycopg

from financial_audit import audit_write
from psycopg.rows import dict_row

BASE = "/home/gamesim/shared-memory/inferhub-business"
LEDGER = os.path.join(BASE, "finance", "ledger.json")
DB_DSN = os.environ.get("UPSTREAM_DB")
if not DB_DSN:
    raise RuntimeError("UPSTREAM_DB must be configured")


def conn():
    return psycopg.connect(DB_DSN, row_factory=dict_row)


def load_file():
    try:
        with open(LEDGER) as f:
            return json.load(f)
    except Exception:
        return {"meta": {}, "assets": [], "impairments": [], "payouts": []}


def save_file(ledger):
    with open(LEDGER, "w") as f:
        json.dump(ledger, f, indent=2, ensure_ascii=False)


def _ser_date(v):
    """date/datetime -> ISO string; None -> None"""
    if v is None:
        return None
    return v.isoformat() if hasattr(v, "isoformat") else str(v)


def load_forex_key():
    """Baca FOREX_KEY dari env file user (default ~/.hermes-suisui/.env)."""
    for path in (os.path.expanduser("~/.hermes-suisui/.env"),
                 os.path.expanduser("~/.env")):
        try:
            with open(path) as f:
                for line in f:
                    if line.startswith("FOREX_KEY="):
                        return line.split("=", 1)[1].strip().strip('"').strip("'")
        except Exception:
            continue
    return ""


def fetch_live_kurs():
    """Tarik kurs IDR realtime (forexrateapi). Gagal = None (pakai meta DB)."""
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


def read_db():
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("SELECT id, upstream, qty, cost_per, curr, buy, lifespan_d, status, label, kurs_idr_usd FROM assets")
            assets = cur.fetchall()
            cur.execute("SELECT id, upstream, qty, loss, label, date FROM impairments")
            imps = cur.fetchall()
            cur.execute("SELECT id, date, amount_usdc, status FROM payouts WHERE status='confirmed'")
            pays = cur.fetchall()
            cur.execute("SELECT k, v FROM ledger_meta")
            meta = {r["k"]: r["v"] for r in cur.fetchall()}
    # normalisasi: date/buy -> string
    for a in assets:
        a["buy"] = _ser_date(a.get("buy"))
    for im in imps:
        im["date"] = _ser_date(im.get("date"))
    for p in pays:
        p["date"] = _ser_date(p.get("date"))
    return {"meta": meta, "assets": assets, "impairments": imps, "payouts": pays}


def _actor(args):
    return getattr(args, "actor", None) or os.environ.get("FIN_OPS_ACTOR") or getpass.getuser()


def upsert_asset(a, kurs=None):
    with conn() as c:
        with c.cursor() as cur:
            if a.get("curr") == "IDR":
                a_kurs = a.get("kurs_idr_usd") or kurs
            else:
                a_kurs = None
            cur.execute("""
                INSERT INTO assets (id, upstream, qty, cost_per, curr, buy, lifespan_d, status, label, kurs_idr_usd)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO UPDATE SET
                  upstream=EXCLUDED.upstream, qty=EXCLUDED.qty, cost_per=EXCLUDED.cost_per,
                  curr=EXCLUDED.curr, buy=EXCLUDED.buy, lifespan_d=EXCLUDED.lifespan_d,
                  status=EXCLUDED.status, label=EXCLUDED.label,
                  kurs_idr_usd=COALESCE(EXCLUDED.kurs_idr_usd, assets.kurs_idr_usd)
            """, (a["id"], a.get("upstream"), int(a.get("qty") or 0), float(a.get("cost_per") or 0),
                  a.get("curr", "USD"), str(a.get("buy") or "")[:10], int(a.get("lifespan_d") or 30),
                  a.get("status", "active"), a.get("label"), a_kurs))
        audit_write(c, "assets", a["id"], "upsert-asset", os.environ.get("FIN_OPS_ACTOR") or getpass.getuser(),
                    "ledger_update.upsert_asset", before=None,
                    after={"id": a["id"], "upstream": a.get("upstream"), "qty": a.get("qty"),
                           "cost_per": a.get("cost_per"), "curr": a.get("curr"),
                           "buy": str(a.get("buy") or "")[:10], "lifespan_d": a.get("lifespan_d"),
                           "status": a.get("status", "active"), "label": a.get("label")})
        c.commit()


def update_asset_status(aid, status, label=None):
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("SELECT status FROM assets WHERE id=%s", (aid,))
            row = cur.fetchone()
            if row is None:
                print(f"  [!] asset {aid} tidak ditemukan di DB")
                return
            old_status = row["status"]
            cur.execute("UPDATE assets SET status=%s, label=COALESCE(%s,label) WHERE id=%s", (status, label, aid))
        audit_write(c, "assets", aid, f"set-{status}", os.environ.get("FIN_OPS_ACTOR") or getpass.getuser(),
                    "ledger_update.update_asset_status", before={"status": old_status},
                    after={"status": status, "label": label})
        print(f"  [OK] {aid} -> {status}")
        c.commit()


def add_payout(date, usd, note):
    """DEPRECATED — payouts di-sync otomatis dari API InferHub /publisher/withdrawals
    (upsert by id, no double-count). Jangan pakai UUID random utk payout (F3 audit
    keuangan 2026-08-14): id random tak bisa dedup -> double-count risk."""
    raise SystemExit("add-payout dihapus: payout otomatis dari API live. Hapus manual = hapus row payouts di DB.")


def sync_db_to_file():
    """Tulis DB -> ledger.json (supaya tool legacy konsisten)."""
    led = read_db()
    save_file(led)
    print("  [OK] ledger.json disinkronkan dari DB:", len(led["assets"]), "assets,", len(led["impairments"]), "impairments,", len(led["payouts"]), "payouts")


def main():
    ap = argparse.ArgumentParser(description="Upstream ledger updater (DB + file sync)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("add-asset"); p.add_argument("--id", required=True); p.add_argument("--upstream", required=True); p.add_argument("--actor", default=None)
    p.add_argument("--qty", type=int, default=1); p.add_argument("--cost", type=float, required=True)
    p.add_argument("--curr", default="IDR"); p.add_argument("--buy", required=True)
    p.add_argument("--lifespan", type=int, default=30); p.add_argument("--label", default="")

    p = sub.add_parser("retire-asset"); p.add_argument("--id", required=True); p.add_argument("--label", default="mati/expired"); p.add_argument("--actor", default=None)
    p = sub.add_parser("reactivate-asset"); p.add_argument("--id", required=True); p.add_argument("--actor", default=None)
    p = sub.add_parser("add-payout"); p.add_argument("--date", required=True); p.add_argument("--usd", type=float, required=True); p.add_argument("--note", default="")
    p = sub.add_parser("sync-from-file")
    p = sub.add_parser("sync-to-file")
    p = sub.add_parser("show")

    args = ap.parse_args()

    if args.cmd == "add-asset":
        kurs = fetch_live_kurs() if args.curr == "IDR" else None
        upsert_asset({"id": args.id, "upstream": args.upstream, "qty": args.qty, "cost_per": args.cost,
                      "curr": args.curr, "buy": args.buy, "lifespan_d": args.lifespan,
                      "status": "active", "label": args.label}, kurs)
        print(f"  [OK] asset {args.id} ditambahkan ke DB")
        sync_db_to_file()
    elif args.cmd == "retire-asset":
        update_asset_status(args.id, "retired", args.label)
        sync_db_to_file()
    elif args.cmd == "add-payout":
        add_payout(args.date, args.usd, args.note)  # raise SystemExit dgn pesan jelas
        sync_db_to_file()
    elif args.cmd == "reactivate-asset":
        update_asset_status(args.id, "active")
        sync_db_to_file()
    elif args.cmd == "sync-from-file":
        led = load_file()
        for a in led.get("assets", []) or []:
            upsert_asset(a)
        print(f"  [OK] ledger.json diimpor ke DB: {len(led.get('assets',[]))} assets")
    elif args.cmd == "sync-to-file":
        sync_db_to_file()
    elif args.cmd == "show":
        led = read_db()
        for a in led["assets"]:
            print(f"  {a['id']:8} {a['upstream']:22} qty={a['qty']} cost={a['cost_per']} {a['curr']:3} buy={a['buy']} status={a['status']}")
        print(f"  --- {len(led['impairments'])} impairments, {len(led['payouts'])} payouts")


if __name__ == "__main__":
    main()
