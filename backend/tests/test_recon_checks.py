"""Test invariant parity finance untuk recon_finance.py."""
from finance_rules import compute_finance


def test_net_income_identitas_rule_engine():
    assets = [{"id": "A-001", "upstream": "clinepass", "qty": 1, "cost_per": 10.0,
               "curr": "USD", "status": "retired", "kurs_idr_usd": None}]
    payouts = [{"amount_usdc": 50.0, "status": "confirmed"}]
    refunds = [{"amount_idr": 0, "amount_usdc": 3.0, "kurs_idr_usd": None, "id": "R", "upstream": "x", "qty": 1}]
    impairments = [{"id": "I", "upstream": "codebuddy", "qty": 1, "loss": 34000.0, "label": ""}]
    res = compute_finance(assets, payouts, refunds, impairments, 17000.0)
    expected = round(50.0 + 3.0 - 10.0 - (34000.0 / 17000.0) - 0.10, 2)
    assert res["net_income"] == expected


def test_jumlah_amort_assets_sama_non_active():
    assets = [{"id": "A-001", "upstream": "clinepass", "qty": 1, "cost_per": 1.0,
               "curr": "USD", "status": "retired", "kurs_idr_usd": None},
              {"id": "A-002", "upstream": "clinepass", "qty": 1, "cost_per": 1.0,
               "curr": "USD", "status": "active", "kurs_idr_usd": None}]
    res = compute_finance(assets, [], [], [], 17000.0)
    non_active = sum(1 for a in assets if (a.get("status") or "active") != "active")
    assert len(res["amort_assets"]) == non_active
