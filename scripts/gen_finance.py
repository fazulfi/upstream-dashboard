#!/usr/bin/env python3
"""WWMA Publishing — Finance Auto-Generator.
Baca dari PostgreSQL (single source of truth) -> regenerate workbook + P&L + neraca.
Mama (Suisui) tambah data di ledger saat: Faiz beli akun / akun deaktif / payout.
Script ini jalan tiap malam via systemd timer -> semua laporan update otomatis.

Logika keuangan DISAMAKAN dgn dashboard (`backend/app.py` `db_read_finance`) supaya
net income workbook == net income dashboard:
  net_income = payout + refund − amort − impairment − opex
  - amortisasi = hanya aset `status != 'active'`, FULL cost (bukan pro-rata)
  - refund   DIKURANG dari beban (income), bukan ditambah
  - impairment seed (upstream startswith 'upstream-') di-zero-kan (DATA-HILANG)
  - opex = 0.10
 FOREX_KEY dibaca dari env (FOREX_KEY) atau `~/.hermes-suisui/.env`, bukan hardcode.
"""
import json
import os
import subprocess
import sys
from datetime import date
from openpyxl import Workbook, load_workbook

BASE = "/home/gamesim/shared-memory/inferhub-business/finance"
LEDGER = os.path.join(BASE, "ledger.json")
WB = os.path.join(BASE, "keuangan.xlsx")
ENV_FILE = os.path.expanduser("~/.hermes-suisui/.env")


def load_forex_key():
    """FOREX_KEY dari env; fallback baca ~/.hermes-suisui/.env. Bukan hardcode."""
    if os.environ.get("FOREX_KEY"):
        return os.environ["FOREX_KEY"].strip().strip('"').strip("'")
    try:
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line.startswith("FOREX_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


FOREX_KEY = load_forex_key()


def load_ledger():
    """Baca dari PostgreSQL (single source of truth) — bentuk dict yg sama dgn ledger.json.
    assets, payouts, refunds, impairments diambil langsung dari DB."""
    def q(sql):
        r = subprocess.run(["psql", "-d", "upstream", "-t", "-A", "-F", "\t", "-c", sql],
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr)
        if not r.stdout.strip():
            return []
        return [line.split("\t") for line in r.stdout.strip().split("\n")]

    assets = []
    for rid, up, qty, cost, curr, buy, life, status, label in q(
            "SELECT id, upstream, qty, cost_per, curr, buy, lifespan_d, status, label FROM assets ORDER BY id"):
        assets.append({
            "id": rid, "upstream": up, "qty": int(float(qty)),
            "cost_per": float(cost), "curr": curr,
            "buy": (buy or "")[:10], "lifespan_d": int(float(life or 30)),
            "status": status, "label": label or "",
        })

    payouts = []
    for pid, amt, st, d in q("SELECT id, amount_usdc, status, date FROM payouts ORDER BY date"):
        payouts.append({"id": pid, "amount_usdc": float(amt or 0), "status": st or "confirmed", "date": str(d)[:10]})

    refunds = []
    for rid, up, qty, aidr, ausd, lab, d in q(
            "SELECT id, upstream, qty, amount_idr, amount_usdc, label, date FROM refunds ORDER BY date"):
        refunds.append({"id": rid, "upstream": up, "qty": int(float(qty or 0)),
                        "amount_idr": float(aidr or 0), "amount_usdc": float(ausd or 0),
                        "label": lab or "", "date": str(d)[:10]})

    impairments = []
    for iid, up, qty, loss, lab, d in q(
            "SELECT id, upstream, qty, loss, label, date FROM impairments ORDER BY date"):
        impairments.append({"id": iid, "upstream": up, "qty": int(float(qty or 0)),
                            "loss": float(loss or 0), "label": lab or "", "date": str(d)[:10]})

    return {
        "meta": {"name": "WWMA Publishing — Ledger", "as_of": str(date.today()),
                 "kurs_idr_usd": 17798.25, "kurs_updated": str(date.today())},
        "assets": assets, "payouts": payouts, "refunds": refunds, "impairments": impairments,
    }


def save_ledger(L):
    with open(LEDGER, "w") as f:
        json.dump(L, f, indent=2, ensure_ascii=False)
        f.write("\n")


def fetch_live_kurs():
    """Tarik kurs IDR realtime dari forexrateapi, update ledger.json meta.
    Gagal = keep angka lama (biar report tetap jalan) tapi catat warning."""
    import urllib.request
    L = load_ledger()
    if not FOREX_KEY:
        print("⚠️ FOREX_KEY tidak ada (env / ~/.hermes-suisui/.env) — pakai kurs lama %.2f"
              % L["meta"].get("kurs_idr_usd"))
        return L["meta"]["kurs_idr_usd"]
    try:
        url = ("https://api.forexrateapi.com/v1/latest?api_key=%s"
               "&base=USD&currencies=IDR" % FOREX_KEY)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode())
        kurs = float(data["rates"]["IDR"])
        L["meta"]["kurs_idr_usd"] = kurs
        L["meta"]["kurs_updated"] = str(date.today())
        save_ledger(L)
        print("Kurs live: $1 = Rp %.2f (updated %s)" % (kurs, L["meta"]["kurs_updated"]))
    except Exception as e:
        print("⚠️ Gagal fetch kurs live (%s) — pakai lama %.2f" % (e, L["meta"].get("kurs_idr_usd")))
    return L["meta"]["kurs_idr_usd"]


def usd_eq(amount, curr, kurs):
    return amount if curr == "USD" else amount / kurs


def main():
    L = load_ledger()
    kurs = fetch_live_kurs()          # selalu tarik kurs realtime, update meta
    today = L["meta"]["as_of"]

    # ── Hitung net income — logika SAMA dgn backend/app.py db_read_finance ──
    # payout (confirmed saja)
    total_payout = sum(p.get("amount_usdc", p.get("usd", 0))
                       for p in L["payouts"] if p.get("status", "confirmed") == "confirmed")
    n_payout = sum(1 for p in L["payouts"] if p.get("status", "confirmed") == "confirmed")

    # Aset -> cost_usd per asset (seperti db_read_finance: IDR dibagi kurs)
    asset_list = []
    total_capital_usd = 0.0
    total_akun = 0
    for a in L["assets"]:
        cost_per = a["cost_per"]
        qty = a["qty"]
        curr = (a.get("curr") or "USD").strip().upper()
        cost_usd = cost_per * qty / kurs if curr == "IDR" else cost_per * qty
        total_capital_usd += cost_usd
        total_akun += qty
        asset_list.append({**a, "cost_usd": round(cost_usd, 4)})
    total_akun_aktif = sum(a["qty"] for a in asset_list if (a.get("status") or "active") == "active")

    # Amortisasi = hanya aset status != 'active', FULL cost (bukan pro-rata)
    amort_assets = [a for a in asset_list if a["status"] != "active"]
    total_amort_usd = round(sum(a["cost_usd"] for a in amort_assets), 4)

    # Impairment: seed (upstream startswith 'upstream-') di-zero-kan (DATA-HILANG),
    # loss_usd = loss/kurs jika loss > 100, minus 100 -> pakai raw.
    total_imp_loss_usd = 0.0
    impaired_rows = []
    for im in L["impairments"]:
        _up = im.get("upstream") or ""
        seed = _up.startswith("upstream-")
        loss = 0.0 if seed else im["loss"]
        loss_usd = loss / kurs if loss > 100 else loss
        total_imp_loss_usd += loss_usd
        impaired_rows.append({**im, "loss_usd": round(loss_usd, 2),
                              "label": (im.get("label") or "") + (" [DATA-HILANG]" if seed else ""),
                              "seed_residue": seed})
    total_imp_loss_usd = round(total_imp_loss_usd, 2)

    # Refund = uang kembali (income) — kurangi beban rugi bersih (tdk ditambah)
    total_refund_usd = 0.0
    refund_rows = []
    for rd in L["refunds"]:
        aidr = rd["amount_idr"]
        ausd = rd["amount_usdc"]
        v = ausd if ausd > 0 else (aidr / kurs if aidr > 100 else aidr)
        total_refund_usd += v
        refund_rows.append({**rd, "refund_usd": round(v, 4)})
    total_refund_usd = round(total_refund_usd, 2)

    opex = 0.10
    net_income = round(total_payout + total_refund_usd - total_amort_usd
                       - total_imp_loss_usd - opex, 2)

    # ---- Simpan ringkasan ke JSON (untuk ref script lain / debug) ----
    summary = {
        "as_of": today,
        "kurs": kurs,
        "total_payout_usd": round(total_payout, 2),
        "n_payout": n_payout,
        "total_refund_usd": total_refund_usd,
        "total_amort_usd": total_amort_usd,
        "amort_assets": [{**a, "cost_usd": a["cost_usd"]} for a in amort_assets],
        "total_imp_loss_usd": total_imp_loss_usd,
        "opex": opex,
        "net_income": net_income,
        "total_capital_usd": round(total_capital_usd, 2),
        "total_akun_assets": total_akun,
        "total_akun_aktif": total_akun_aktif,
    }
    print(json.dumps(summary, indent=2))

    # ---- Tulis workbook ----
    wb = Workbook()

    # Income Statement (USD only)
    ws = wb.active
    ws.title = "Income Statement"
    rows_inc = [
        ["LAPORAN LABA RUGI", None],
        [f"Periode: 05 Jul – {today} • USD ONLY • Kurs $1 = Rp {kurs:,.2f}", None],
        [None, None],
        ["PENDAPATAN", None],
        [f"Revenue – Earnings USDC ({n_payout} payout)", total_payout],
        [f"Refund ({len(refund_rows)}) — pengurang beban", total_refund_usd],
        ["Total Pendapatan", round(total_payout + total_refund_usd, 2)],
        [None, None],
        ["BEBAN POKOK (COGS)", None],
        ["Amortisasi aset (non-active, full cost)", total_amort_usd],
        ["Total COGS (USD)", total_amort_usd],
        [None, None],
        ["LABA KOTOR", round(total_payout + total_refund_usd - total_amort_usd, 2)],
        [None, None],
        ["BEBAN OPERASIONAL", None],
        ["Beban Bank/Gas Fee (est.)", opex],
        [f"Impairment {len(impaired_rows)} akun invalid ({round(total_imp_loss_usd, 2)} USD)",
         total_imp_loss_usd],
        ["Total Beban Operasional", round(opex + total_imp_loss_usd, 2)],
        [None, None],
        ["LABA BERSIH (NET INCOME)", net_income],
    ]
    for r in rows_inc:
        ws.append(r)

    # Asset Register (USD eq — full USD sesuai operator)
    wsa = wb.create_sheet("Asset Register")
    wsa.append(["ID", "Upstream", "Qty", "Cost/unit (native)", "Cost/unit (USD)", "Total USD eq", "Buy", "Lifespan_d", "Status"])
    for a in asset_list:
        cost_usd = usd_eq(a["cost_per"], a["curr"], kurs)
        wsa.append([a["id"], a["upstream"], a["qty"], a["cost_per"], round(cost_usd, 4),
                    round(a["cost_usd"], 4), a["buy"], a["lifespan_d"], a["status"]])
    wsa.append(["TOTAL", "", total_akun, "", "", round(total_capital_usd, 2), "", "", ""])

    # Payout register
    wsp = wb.create_sheet("Payouts")
    wsp.append(["Tanggal", "USD", "Status", "Note"])
    for p in L["payouts"]:
        wsp.append([p["date"], p.get("amount_usdc", p.get("usd", 0)), p.get("status", ""), p.get("note", "")])
    wsp.append(["TOTAL", total_payout, "", ""])

    # Refund register
    wsr = wb.create_sheet("Refunds")
    wsr.append(["ID", "Upstream", "Qty", "IDR", "USD", "Refund USD", "Label", "Date"])
    for rd in refund_rows:
        wsr.append([rd["id"], rd["upstream"], rd["qty"], rd["amount_idr"], rd["amount_usdc"],
                    rd["refund_usd"], rd["label"], rd["date"]])
    wsr.append(["TOTAL", "", "", "", "", total_refund_usd, "", ""])

    # Impairment register
    wsi = wb.create_sheet("Impairments")
    wsi.append(["ID", "Label", "Qty", "Loss", "Loss USD", "Curr", "Date"])
    for im in impaired_rows:
        wsi.append([im["id"], im["label"], im["qty"], im["loss"], im["loss_usd"],
                    im.get("curr", "IDR"), im["date"]])
    wsi.append(["TOTAL", "", "", total_imp_loss_usd, "", "", ""])

    wb.save(WB)
    print("Workbook regenerated:", WB)


if __name__ == "__main__":
    main()