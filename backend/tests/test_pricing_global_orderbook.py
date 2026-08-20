"""Test pricing global per-upstream + orderbook merge (P4-Q2c/Q11)."""
import app as app_module


def test_pricing_merge_globals_overrides_orderbook(monkeypatch):
    fake_data = {
        "globals": {"clinepass": {"max_ask_pct": 0.05}},
        "overrides": [{"upstream": "clinepass", "model_id": "m1", "trigger_pct": 0.1}],
        "orderbook": [{"upstream": "clinepass", "model_id": "m1", "ask": 0.08}],
    }

    def fake_load():
        return fake_data

    monkeypatch.setattr(app_module, "_load_pricing_merged", fake_load)
    res = app_module._pricing_merged_view()
    assert res["globals"]["clinepass"]["max_ask_pct"] == 0.05
    assert len(res["overrides"]) == 1
    assert res["orderbook"][0]["ask"] == 0.08


def test_pricing_global_put_lewat_guard(auth_client, monkeypatch):
    """PUT /api/pricing/global gated: guard dipanggil dgn action + role admin."""
    called = {}

    def fake_guard(req, conn, entity, action, executor, **kw):
        called["action"] = action
        called["required_roles"] = kw.get("required_roles")
        return 200, {"ok": True, "config": {"upstream": "clinepass", "max_ask_pct": 0.05}}

    monkeypatch.setattr(app_module, "guard_mutation", fake_guard)
    r = auth_client.put(
        "/api/pricing/global",
        json={"upstream": "clinepass", "max_ask_pct": 0.05,
              "platform_fee_pct": 0.1, "publisher_share_pct": 80},
        headers={"Idempotency-Key": "pg-1"})
    assert r.status_code == 200
    assert called["action"] == "pricing-global-update"
    assert called["required_roles"] == ["admin"]
