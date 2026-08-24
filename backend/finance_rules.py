"""Rule engine keuangan — SATU-SATUNYA sumber formula net income.

Dipakai bersama oleh:
- backend/app.py `db_read_finance()` (dashboard)
- scripts/gen_finance.py (workbook keuangan.xlsx + ledger.json)

Formula (verified 2026-08-20, disamakan dgn keputusan Phase 3 F3):
  net_income = payout_confirmed + refund − amort − impairment − opex
- amortisasi = hanya aset `status != 'active'`, FULL cost (bukan pro-rata)
- refund   DIKURANG dari beban (income), bukan ditambah
- impairment seed (upstream startswith 'upstream-') di-zero-kan (DATA-HILANG),
  loss_usd = loss/kurs jika loss > 100, selain itu raw
- opex = 0.10 (beban bank/gas fee est.)
- kurs per-asset (`kurs_idr_usd`) preferred; fallback kurs meta;
  aset IDR: cost_usd = cost_per*qty/kurs; aset USD: cost_per*qty
"""


def _slug_of(name):
    n = (name or "").strip().lower()
    if "clinepass" in n or n.startswith("cline-pass"):
        return "cline-pass"
    if "codebuddy" in n and ("cn" in n or n.endswith("cn")):
        return "codebuddy-cn"
    if "codebuddy" in n:
        return "codebuddy"
    if "command code" in n:
        return "commandcode"
    if "opencode" in n or "open code" in n:
        return "opencode-go"
    if "chatgpt" in n or "chatgpt+" in n or n.startswith("chatgpt"):
        return "codex"
    return None


def _f(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def amortization(assets, kurs_meta):
    """Amortisasi = aset status != active, FULL cost (bukan pro-rata).

    cost_usd dihitung dari cost_per/qty/curr/kurs — input bisa berupa asset
    mentah (belum ada cost_usd) ATAU hasil compute_finance (sudah ada cost_usd):
      - USD: cost_usd = cost_per * qty
      - IDR: cost_usd = cost_per * qty / kurs (per-asset preferred, fallback meta)
    """
    kurs = _f(kurs_meta) or 17801.17
    amort_assets = []
    for a in assets:
        if (a.get("status") or "active") != "active":
            cost_usd = a.get("cost_usd")
            if cost_usd is None:
                curr = (a.get("curr") or "USD").strip().upper()
                qty = int(_f(a.get("qty"), 0))
                a_kurs = _f(a.get("kurs_idr_usd")) or kurs
                cost_usd = _f(a.get("cost_per")) * qty / a_kurs if curr == "IDR" else _f(a.get("cost_per")) * qty
            amort_assets.append({**a, "cost_usd": round(cost_usd, 4)})
    total = round(sum(_f(a.get("cost_usd")) for a in amort_assets), 4)
    return amort_assets, total


def compute_finance(assets, payouts, refunds, impairments, kurs_meta, providers=None, opex=0.10):
    """Hitung seluruh metrik finance dgn aturan yang sama untuk semua konsumen.

    providers: optional — list dict {upstream_slug, n} dari tabel providers
    (status='ok'). REV9: qty aset aktif per slug dikali rasio = min(1.0,
    n_ok_provider / qty_aset_aktif_slug). Aset yang akunnya mati tidak dihitung
    penuh. Jika providers None → rasio 1.0 (perilaku workbook legacy, gen_finance).
    """
    kurs = _f(kurs_meta) or 17801.17
    total_payout = sum(_f(p.get("amount_usdc", p.get("usd"))) for p in payouts
                       if p.get("status", "confirmed") == "confirmed")
    n_payout = sum(1 for p in payouts if p.get("status", "confirmed") == "confirmed")

    prov_ok = {}
    for pr in providers or []:
        slug = pr.get("upstream_slug") or pr.get("slug") or ""
        if slug:
            prov_ok[slug] = int(_f(pr.get("n", pr.get("count")), 0))
    asset_qty_by = {}
    for a in assets:
        if (a.get("status") or "active") != "active":
            continue
        sl = _slug_of(a.get("upstream") or "")
        if sl:
            asset_qty_by[sl] = asset_qty_by.get(sl, 0) + int(_f(a.get("qty"), 0))
    ratio_by = {sl: min(1.0, prov_ok.get(sl, 0) / q) for sl, q in asset_qty_by.items() if q > 0}

    asset_list = []
    total_capital = 0.0
    total_asset_qty = 0
    for a in assets:
        cost_per = _f(a.get("cost_per"))
        qty_raw = int(_f(a.get("qty"), 0))
        sl = _slug_of(a.get("upstream") or "")
        ratio = 1.0 if providers is None else ratio_by.get(sl, 1.0)
        qty = int(round(qty_raw * ratio))
        curr = (a.get("curr") or "USD").strip().upper()
        a_kurs = _f(a.get("kurs_idr_usd")) or kurs
        cost_usd = cost_per * qty / a_kurs if curr == "IDR" else cost_per * qty
        if (a.get("status") or "active") != "active":
            asset_list.append({**a, "qty": qty, "cost_usd": round(cost_usd, 4)})
            continue
        total_capital += cost_usd
        total_asset_qty += qty
        asset_list.append({**a, "qty": qty, "cost_usd": round(cost_usd, 4)})
    aktif = sum(1 for a in asset_list if (a.get("status") or "active") == "active")
    amort_assets, amort_usd = amortization(asset_list, kurs)

    total_imp_loss = 0.0
    imp_rows = []
    for im in impairments:
        upstream = im.get("upstream") or ""
        seed = upstream.startswith("upstream-")
        loss = 0.0 if seed else _f(im.get("loss"))
        loss_usd = loss / kurs if loss > 100 else loss
        total_imp_loss += loss_usd
        imp_rows.append({**im, "loss_usd": round(loss_usd, 2),
                         "seed_residue": seed,
                         "label": (im.get("label") or "") + (" [DATA-HILANG]" if seed else "")})
    total_imp_loss = round(total_imp_loss, 2)

    total_refund = 0.0
    refund_rows = []
    for rd in refunds:
        aidr = _f(rd.get("amount_idr"))
        ausd = _f(rd.get("amount_usdc"))
        r_kurs = _f(rd.get("kurs_idr_usd")) or kurs
        value = ausd if ausd > 0 else (aidr / r_kurs if aidr > 100 else aidr)
        total_refund += value
        refund_rows.append({**rd, "refund_usd": round(value, 4)})
    total_refund = round(total_refund, 2)

    net_income = round(total_payout + total_refund - amort_usd - total_imp_loss - opex, 2)
    return {
        "total_payout": total_payout, "n_payout": n_payout,
        "total_refund_usd": total_refund, "refunds": refund_rows,
        "amort_usd": amort_usd, "amort_assets": amort_assets,
        "total_imp_loss_usd": total_imp_loss, "impairments": imp_rows,
        "opex": opex, "net_income": net_income,
        "total_capital_usd": round(total_capital, 4), "total_asset_qty": total_asset_qty,
        "assets": asset_list, "aktif": aktif,
        "kurs": kurs, "source": "finance_rules (rule engine)",
    }
