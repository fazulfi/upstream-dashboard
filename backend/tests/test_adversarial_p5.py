"""Adversarial and boundary stress tests for Publisher & Operations Tools (R1 to R6)."""
import pytest
import math
import app as app_module


@pytest.fixture
def client():
    app_module.app.config["TESTING"] = True
    app_module._rl.clear()
    previous_limit = app_module.RL_LIMIT
    app_module.RL_LIMIT = 5000
    try:
        with app_module.app.test_client() as c:
            yield c
    finally:
        app_module.RL_LIMIT = previous_limit
        app_module._rl.clear()


def _auth(monkeypatch):
    monkeypatch.setattr(app_module, "_verify_token", lambda token: True)
    monkeypatch.setattr(app_module, "get_operator", lambda token: ("Faiz", "admin"))


def test_earnings_transfer_negative_and_zero(client, monkeypatch):
    """Verify backend rejects <= 0 and non-numeric string values for earnings transfer."""
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}

    # 1. Zero amounts -> 400
    for zero_val in [0, 0.0, "0", "0.00", "0.000"]:
        r = client.post("/api/publisher/earnings/transfer", json={"amount": zero_val}, headers=headers)
        assert r.status_code == 400, f"Expected 400 for zero amount: {zero_val}"

    # 2. Negative amounts -> 400
    for neg_val in [-0.0001, -1, -50.5, "-0.01", "-100", "-9999.99"]:
        r = client.post("/api/publisher/earnings/transfer", json={"amount": neg_val}, headers=headers)
        assert r.status_code == 400, f"Expected 400 for negative amount: {neg_val}"

    # 3. Non-numeric strings, NaN, Inf, and empty values -> 400
    for bad_val in ["abc", "", "   ", None, [], {}, float("nan"), float("inf"), float("-inf"), "NaN", "nan", "inf", "-inf", "Infinity"]:
        r = client.post("/api/publisher/earnings/transfer", json={"amount": bad_val}, headers=headers)
        assert r.status_code == 400, f"Expected 400 for invalid amount: {bad_val}"

    # 4. Valid amounts -> 200 with upstream payload verification
    seen_payload = {}
    def mock_post(path, payload=None, timeout=25):
        seen_payload["path"] = path
        seen_payload["payload"] = payload
        return {"ok": True, "transferred": float(payload["amount"])}
    monkeypatch.setattr(app_module, "inferhub_post", mock_post)

    r = client.post("/api/publisher/earnings/transfer", json={"amount": 42.50}, headers=headers)
    assert r.status_code == 200
    assert seen_payload["path"] == "/publisher/earnings/transfer"
    assert seen_payload["payload"]["amount"] == "42.5"

    # 5. Upstream 502 failure
    monkeypatch.setattr(app_module, "inferhub_post", lambda *args, **kwargs: None)
    r = client.post("/api/publisher/earnings/transfer", json={"amount": 42.50}, headers=headers)
    assert r.status_code == 502


def test_withdrawals_otp_edge_cases(client, monkeypatch):
    """Test validation and error handling on POST /api/publisher/withdrawals/otp."""
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}

    # 1. Missing or whitespace destination
    for bad_dest in [None, "", "   ", " \t "]:
        r = client.post("/api/publisher/withdrawals/otp", json={"destination": bad_dest, "amount": 100}, headers=headers)
        assert r.status_code == 400

    # 2. Zero / negative / non-numeric / NaN / Inf amounts
    for bad_amt in [0, "0", -5, "-10.0", "invalid", None, float("nan"), float("inf"), float("-inf"), "NaN", "inf"]:
        r = client.post("/api/publisher/withdrawals/otp", json={"destination": "0x123", "amount": bad_amt}, headers=headers)
        assert r.status_code == 400

    # 3. Valid OTP request with amount normalization
    captured = {}
    def mock_post(path, payload=None, timeout=25):
        captured["path"] = path
        captured["payload"] = payload
        return {"otpRequested": True}
    monkeypatch.setattr(app_module, "inferhub_post", mock_post)

    r = client.post("/api/publisher/withdrawals/otp", json={"destination": "0x987", "amountUsdc": 75.50}, headers=headers)
    assert r.status_code == 200
    assert captured["payload"]["destination"] == "0x987"
    assert captured["payload"]["amountUsdc"] == "75.5"

    # 4. Upstream 502 failure
    monkeypatch.setattr(app_module, "inferhub_post", lambda *args, **kwargs: None)
    r = client.post("/api/publisher/withdrawals/otp", json={"destination": "0x123", "amount": 50}, headers=headers)
    assert r.status_code == 502


def test_withdrawals_submission_edge_cases(client, monkeypatch):
    """Test validation and error handling on POST /api/publisher/withdrawals."""
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}

    # 1. Missing or whitespace OTP or destination
    for bad_otp in [None, "", "   ", " \t "]:
        r = client.post("/api/publisher/withdrawals", json={"destination": "0x123", "amount": 100, "otp": bad_otp}, headers=headers)
        assert r.status_code == 400

    for bad_dest in [None, "", "   ", " \t "]:
        r = client.post("/api/publisher/withdrawals", json={"destination": bad_dest, "amount": 100, "otp": "123456"}, headers=headers)
        assert r.status_code == 400

    # 2. Zero / negative / non-numeric / NaN / Inf amounts with OTP
    for bad_amt in [0, -10, "abc", float("nan"), float("inf"), float("-inf"), "NaN", "inf"]:
        r = client.post("/api/publisher/withdrawals", json={"destination": "0x123", "amount": bad_amt, "otp": "123456"}, headers=headers)
        assert r.status_code == 400

    # 3. Successful submission
    captured = {}
    def mock_post(path, payload=None, timeout=25):
        captured["path"] = path
        captured["payload"] = payload
        return {"status": "processing", "txHash": "0xabcdef"}
    monkeypatch.setattr(app_module, "inferhub_post", mock_post)

    r = client.post("/api/publisher/withdrawals", json={"destination": "0x456", "amount_usdc": 120, "code": "654321"}, headers=headers)
    assert r.status_code == 200
    assert captured["payload"]["otp"] == "654321"
    assert captured["payload"]["amountUsdc"] == "120"
    assert captured["payload"]["destination"] == "0x456"

    # 4. Upstream 502 failure
    monkeypatch.setattr(app_module, "inferhub_post", lambda *args, **kwargs: None)
    r = client.post("/api/publisher/withdrawals", json={"destination": "0x123", "amount": 50, "otp": "111222"}, headers=headers)
    assert r.status_code == 502


def test_budget_update_slash_model_ids(client, monkeypatch):
    """Test budget PUT route with multi-segment slash model IDs."""
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}

    test_models = [
        "openai/gpt-4o",
        "deepseek/deepseek-r1",
        "anthropic/claude-3-5-sonnet-20241022",
        "meta-llama/llama-3.1-70b-instruct/v2",
        "qwen/qwen-2.5-72b-instruct/turbo/fp8",
    ]

    called = []
    def mock_put(path, payload=None, timeout=25):
        called.append({"path": path, "payload": payload})
        return {"ok": True}
    monkeypatch.setattr(app_module, "inferhub_put", mock_put)

    for mid in test_models:
        r = client.put(f"/api/budgets/{mid}", json={
            "maxInputPerMtok": 1.75,
            "maxOutputPerMtok": 7.50,
            "minDiscountPct": 10,
        }, headers=headers)
        assert r.status_code == 200, f"Failed for model {mid}"
        assert called[-1]["path"] == f"/budgets/{mid}"
        assert called[-1]["payload"]["maxInputPerMtok"] == 1.75
        assert called[-1]["payload"]["maxOutputPerMtok"] == 7.50
        assert called[-1]["payload"]["minDiscountPct"] == 10

    # Test upstream error 502
    monkeypatch.setattr(app_module, "inferhub_put", lambda *args, **kwargs: None)
    r = client.put("/api/budgets/openai/gpt-4o", json={"maxInputPerMtok": 2.0}, headers=headers)
    assert r.status_code == 502


def test_market_and_usage_windows_resilience(client, monkeypatch):
    """Test resilience when upstream market or usage windows return empty or None."""
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}

    # 1. Market unavailable -> safe fallback dict
    monkeypatch.setattr(app_module, "inferhub_get", lambda path, *args, **kwargs: None if path == "/market" else {})
    r = client.get("/api/market", headers=headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data["models"] == []
    assert data["error"] == "unavailable"

    # 2. Usage windows unavailable -> safe empty dict
    monkeypatch.setattr(app_module, "inferhub_get", lambda path, *args, **kwargs: None if "/usage-windows" in path else {})
    r = client.get("/api/publisher/providers/usage-windows", headers=headers)
    assert r.status_code == 200
    assert r.get_json() == {}

    # 3. Withdrawals destinations unavailable -> safe empty list
    monkeypatch.setattr(app_module, "inferhub_get", lambda path, *args, **kwargs: None if "/destinations" in path else {})
    r = client.get("/api/publisher/withdrawals/destinations", headers=headers)
    assert r.status_code == 200
    assert r.get_json() == []
