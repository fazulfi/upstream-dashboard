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
import json
import os
import sys

import psycopg
from psycopg.rows import dict_row

BASE = "/home/gamesim/shared-memory/inferhub-business"
LEDGER = os.path.join(BASE, "finance", "ledger.json")
DB_DSN = os.environ.get("UPSTREAM_DB", "postgresql://gamesim:upstream_local@127.0.0.1:5432/upstream")


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


def read_db():
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("SELECT id, upstream, qty, cost_per, curr, buy, lifespan_d, status, label FROM assets")
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


def upsert_asset(a):
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("""
                INSERT INTO assets (id, upstream, qty, cost_per, curr, buy, lifespan_d, status, label)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO UPDATE SET
                  upstream=EXCLUDED.upstream, qty=EXCLUDED.qty, cost_per=EXCLUDED.cost_per,
                  curr=EXCLUDED.curr, buy=EXCLUDED.buy, lifespan_d=EXCLUDED.lifespan_d,
                  status=EXCLUDED.status, label=EXCLUDED.label
            """, (a["id"], a.get("upstream"), int(a.get("qty") or 0), float(a.get("cost_per") or 0),
                  a.get("curr", "USD"), str(a.get("buy") or "")[:10], int(a.get("lifespan_d") or 30),
                  a.get("status", "active"), a.get("label")))
        c.commit()


def update_asset_status(aid, status, label=None):
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("UPDATE assets SET status=%s, label=COALESCE(%s,label) WHERE id=%s", (status, label, aid))
            if cur.rowcount == 0:
                print(f"  [!] asset {aid} tidak ditemukan di DB")
            else:
                print(f"  [OK] {aid} -> {status}")
        c.commit()


def add_payout(date, usd, note):
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("INSERT INTO payouts (id, date, amount_usdc, status, synced_at) VALUES (gen_random_uuid()::text, %s, %s, 'confirmed', now())",
                        (date, float(usd)))
        c.commit()


def sync_db_to_file():
    """Tulis DB -> ledger.json (supaya tool legacy konsisten)."""
    led = read_db()
    save_file(led)
    print("  [OK] ledger.json disinkronkan dari DB:", len(led["assets"]), "assets,", len(led["impairments"]), "impairments,", len(led["payouts"]), "payouts")


def main():
    ap = argparse.ArgumentParser(description="Upstream ledger updater (DB + file sync)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("add-asset"); p.add_argument("--id", required=True); p.add_argument("--upstream", required=True)
    p.add_argument("--qty", type=int, default=1); p.add_argument("--cost", type=float, required=True)
    p.add_argument("--curr", default="IDR"); p.add_argument("--buy", required=True)
    p.add_argument("--lifespan", type=int, default=30); p.add_argument("--label", default="")

    p = sub.add_parser("retire-asset"); p.add_argument("--id", required=True); p.add_argument("--label", default="mati/expired")
    p = sub.add_parser("reactivate-asset"); p.add_argument("--id", required=True)
    p = sub.add_parser("add-payout"); p.add_argument("--date", required=True); p.add_argument("--usd", type=float, required=True); p.add_argument("--note", default="")
    p = sub.add_parser("sync-from-file")
    p = sub.add_parser("sync-to-file")
    p = sub.add_parser("show")

    args = ap.parse_args()

    if args.cmd == "add-asset":
        upsert_asset({"id": args.id, "upstream": args.upstream, "qty": args.qty, "cost_per": args.cost,
                      "curr": args.curr, "buy": args.buy, "lifespan_d": args.lifespan,
                      "status": "active", "label": args.label})
        print(f"  [OK] asset {args.id} ditambahkan ke DB")
        sync_db_to_file()
    elif args.cmd == "retire-asset":
        update_asset_status(args.id, "retired", args.label)
        sync_db_to_file()
    elif args.cmd == "reactivate-asset":
        update_asset_status(args.id, "active")
        sync_db_to_file()
    elif args.cmd == "add-payout":
        add_payout(args.date, args.usd, args.note)
        print(f"  [OK] payout {args.date} ${args.usd} ditambahkan")
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
