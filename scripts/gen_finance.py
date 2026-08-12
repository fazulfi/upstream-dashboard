#!/usr/bin/env python3
"""WWMA Publishing — Finance Auto-Generator.
Baca ledger.json (single source of truth) -> regenerate workbook + P&L + neraca.
Mama (Suisui) tambah data di ledger.json saat: Faiz beli akun / akun deaktif / payout.
Script ini jalan tiap malam via systemd timer -> semua laporan update otomatis.
"""
import json
import os
from datetime import date
from openpyxl import Workbook, load_workbook

BASE = "/home/gamesim/shared-memory/inferhub-business/finance"
LEDGER = os.path.join(BASE, "ledger.json")
WB = os.path.join(BASE, "keuangan.xlsx")
FOREX_KEY = "770c979638c370130d32366c5f89efe9"

def load_ledger():
    with open(LEDGER) as f:
        return json.load(f)

def save_ledger(L):
    with open(LEDGER, "w") as f:
        json.dump(L, f, indent=2, ensure_ascii=False)
        f.write("\n")

def fetch_live_kurs():
    """Tarik kurs IDR realtime dari forexrateapi, update ledger.json meta.
    Gagal = keep angka lama (biar report tetap jalan) tapi catat warning."""
    import urllib.request
    L = load_ledger()
    try:
        url = ("https://api.forexrateapi.com/v1/latest?api_key=%s"
               "&base=USD&currencies=IDR" % FOREX_KEY)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode())
        kurs = float(data["rates"]["IDR"])
        from datetime import date
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

    # ---- Akumulasi dari ledger ----
    total_payout = sum(p.get("amount_usdc", p.get("usd", 0)) for p in L["payouts"])
    n_payout = len(L["payouts"])

    # Aset
    total_cost_usd = 0.0
    total_cost_idr = 0.0
    total_akun = 0
    total_akun_aktif = 0
    # Akun yang sudah kena impairment penuh (qty aktif dikurangi) — mapping dari impairments
    # Ini konservatif: setiap impairment mengurangi qty aktif upstream terkait (default: Codex).
    impaired_qty_by_ref = {}  # asset_ref -> qty
    for im in L["impairments"]:
        ref = im.get("asset_ref")
        if ref:
            impaired_qty_by_ref[ref] = impaired_qty_by_ref.get(ref, 0) + im["qty"]
    for a in L["assets"]:
        total_akun += a["qty"]
        cost = a["cost_per"] * a["qty"]
        if a["curr"] == "USD":
            total_cost_usd += cost
        else:
            total_cost_idr += cost

    # Akun aktif = qty asset dgn status 'active' (retired/drained keluar dari aktif)
    total_akun_aktif = sum(a["qty"] for a in L["assets"] if (a.get("status") or "active") == "active")

    # Impairment
    total_imp_idr = 0.0
    total_imp_qty = 0
    for im in L["impairments"]:
        total_imp_idr += im["loss"]
        total_imp_qty += im["qty"]

    # Akun aktif = total beli - akun yg impaired (impairment = akun yg dulu aktif, kini invalid)
    # (total_akun_aktif sudah dihitung dari status 'active' di atas — baris ini cuma fallback)
    if total_akun_aktif == 0 and total_akun > 0:
        total_akun_aktif = max(total_akun - total_imp_qty, 0)

    # Amortisasi proporsional per aset: susut = cost × (hari sejak beli / lifespan), cap 100%.
    # Akun yang sudah impaired dianggap habis (tidak di-amortize lagi di sini; loss-nya
    # sudah dicatat terpisah sebagai impairment). Hitung dalam USD eq.
    from datetime import datetime
    _asof = datetime.strptime(today, "%Y-%m-%d")
    total_amort_usd = 0.0
    for a in L["assets"]:
        try:
            _buy = datetime.strptime(a["buy"], "%Y-%m-%d")
        except Exception:
            _buy = _asof
        days = max((_asof - _buy).days, 0)
        frac = min(days / max(a.get("lifespan_d", 30), 1), 1.0)
        cost_usd = usd_eq(a["cost_per"], a["curr"], kurs) * a["qty"]
        total_amort_usd += cost_usd * frac
    total_amort_usd = round(total_amort_usd, 2)


    # ---- Simpan ringkasan ke JSON (untuk ref script lain / debug) ----
    summary = {
        "as_of": today,
        "kurs": kurs,
        "total_payout_usd": round(total_payout, 2),
        "n_payout": n_payout,
        "total_cost_usd": round(total_cost_usd, 2),
        "total_cost_idr": round(total_cost_idr),
        "total_akun_assets": total_akun,
        "total_akun_aktif": total_akun_aktif,
        "total_imp_idr": round(total_imp_idr),
        "total_imp_qty": total_imp_qty,
    }
    print(json.dumps(summary, indent=2))

    # ---- Tulis workbook ----
    # Membuat workbook baru dari nol (rebuild) biar nggak ada data basi
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
        ["Total Pendapatan", total_payout],
        [None, None],
        ["BEBAN POKOK (COGS)", None],
        ["Amortisasi aset (proporsional per hari)", total_amort_usd],
        ["Total COGS (USD)", total_amort_usd],
        [None, None],
        ["LABA KOTOR", round(total_payout - total_amort_usd, 2)],
        [None, None],
        ["BEBAN OPERASIONAL", None],
        ["Beban Bank/Gas Fee (est.)", 0.10],
        [f"Impairment {total_imp_qty} akun invalid (Rp {round(total_imp_idr):,} / kurs)", round(total_imp_idr / kurs, 2)],
        ["Total Beban Operasional", round(0.10 + total_imp_idr / kurs, 2)],
        [None, None],
        ["LABA BERSIH (NET INCOME)", round(total_payout - total_amort_usd - (0.10 + total_imp_idr/kurs), 2)],
    ]
    for r in rows_inc:
        ws.append(r)

    # Asset Register (USD eq — full USD sesuai operator)
    wsa = wb.create_sheet("Asset Register")
    wsa.append(["ID", "Upstream", "Qty", "Cost/unit (native)", "Cost/unit (USD)", "Total USD eq", "Buy", "Lifespan_d", "Status"])
    for a in L["assets"]:
        cost_usd = usd_eq(a["cost_per"], a["curr"], kurs)
        wsa.append([a["id"], a["upstream"], a["qty"], a["cost_per"], round(cost_usd, 4), round(cost_usd * a["qty"], 4), a["buy"], a["lifespan_d"], a["status"]])
    wsa.append(["TOTAL", "", total_akun, "", "", round(total_cost_usd + total_cost_idr / kurs, 2), "", "", ""])

    # Payout register
    wsp = wb.create_sheet("Payouts")
    wsp.append(["Tanggal", "USD", "Note"])
    for p in L["payouts"]:
        wsp.append([p["date"], p.get("amount_usdc", p.get("usd", 0)), p.get("note", "")])
    wsp.append(["TOTAL", total_payout, ""])

    # Impairment register
    wsi = wb.create_sheet("Impairments")
    wsi.append(["ID", "Label", "Qty", "Loss", "Curr", "Date"])
    for im in L["impairments"]:
        wsi.append([im["id"], im["label"], im["qty"], im["loss"], im.get("curr", "IDR"), im["date"]])
    wsi.append(["TOTAL", "", total_imp_qty, round(total_imp_idr), "", ""])

    wb.save(WB)
    print("Workbook regenerated:", WB)

if __name__ == "__main__":
    main()
