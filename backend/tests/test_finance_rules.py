"""Fixture tests: formula rule engine keuangan (RED/GREEN)."""
import pytest

from finance_rules import amortization, compute_finance


def _asset(aid, status="active", cost=100.0, qty=1, curr="USD", kurs=None, upstream="clinepass"):
    return {"id": aid, "upstream": upstream, "qty": qty, "cost_per": cost,
            "curr": curr, "status": status, "kurs_idr_usd": kurs}


def test_amortization_hanya_aset_non_active_full_cost():
    assets = [_asset("A-001", "active"), _asset("A-002", "retired", cost=50.0)]
    rows, total = amortization(assets, 17000.0)
    assert [r["id"] for r in rows] == ["A-002"]
    assert total == 50.0


def test_amortization_full_cost_bukan_prorata():
    # 3 retired, lifespan 30, beli kemarin: HARUS full cost, bukan prorata
    assets = [_asset("A-001", "retired", cost=120.0)] * 1
    _, total = amortization(assets, 17000.0)
    assert total == 120.0


def test_compute_finance_net_income_formula():
    assets = [_asset("A-001", "retired", cost=10.0), _asset("A-002", "active", cost=5.0)]
    payouts = [{"amount_usdc": 100.0, "status": "confirmed"}]
    refunds = [{"amount_idr": 0, "amount_usdc": 2.0, "kurs_idr_usd": None}]
    impairments = [{"upstream": "codebuddy", "loss": 300.0, "qty": 1, "label": "", "id": "I-1"}]
    res = compute_finance(assets, payouts, refunds, impairments, 17000.0)
    # 100 + 2 - 10 - (300/17000) - 0.10
    assert res["net_income"] == round(100.0 + 2.0 - 10.0 - (300.0 / 17000.0) - 0.10, 2)


def test_compute_finance_kurs_per_asset_idr():
    assets = [_asset("A-001", "active", cost=17000.0, curr="IDR", kurs=17000.0),
              _asset("A-002", "active", cost=10.0, curr="USD")]
    res = compute_finance(assets, [], [], [], 17000.0)
    # cost_usd asset IDR = 17000/17000 = 1; asset USD = 10
    assert res["total_capital_usd"] == 11.0


def test_compute_finance_impairment_seed_zero():
    impairments = [{"upstream": "upstream-9", "loss": 27167.0, "qty": 1, "label": "", "id": "I-S"}]
    res = compute_finance([], [], [], impairments, 17000.0)
    assert res["total_imp_loss_usd"] == 0.0
    assert res["impairments"][0]["seed_residue"] is True


def test_compute_finance_refund_kurs_per_row():
    refunds = [{"amount_idr": 34000.0, "amount_usdc": 0, "kurs_idr_usd": 17000.0, "label": "", "id": "R-1", "upstream": "x", "qty": 1}]
    res = compute_finance([], [], refunds, [], 10000.0)
    assert res["total_refund_usd"] == 2.0  # pakai kurs per-row 17000, bukan meta 10000


def test_compute_finance_payout_hanya_confirmed():
    payouts = [{"amount_usdc": 100.0, "status": "confirmed"},
               {"amount_usdc": 999.0, "status": "pending"}]
    res = compute_finance([], payouts, [], [], 17000.0)
    assert res["total_payout"] == 100.0
    assert res["n_payout"] == 1


def test_amort_bug_dashboard_harus_hitung_retired():
    # Regression: bug lama db_read_finance membuat amort_assets selalu [].
    assets = [_asset("A-001", "retired", cost=10.0)]
    res = compute_finance(assets, [], [], [], 17000.0)
    assert res["amort_usd"] == 10.0
    assert len(res["amort_assets"]) == 1
