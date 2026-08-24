"""Tests for all UI-to-backend endpoint integrations and expected JSON schemas."""
from unittest.mock import MagicMock
import pytest
import app as app_module


def test_ui_finance_endpoint_schema(auth_client, monkeypatch):
    """Verify /api/finance endpoint returns exact schema expected by UI Glass FinOps."""
    data = {
        "meta": [{"v": "17800.0"}],
        "assets": [{"id": "A-001", "upstream": "clinepass", "qty": 1, "label": "server-1",
                    "buy": "2026-08-01", "lifespan_d": 30, "cost_per": 10.0,
                    "curr": "USD", "status": "retired", "kurs_idr_usd": None}],
        "providers": [{"upstream_slug": "cline-pass", "n": 3}],
        "impairments": [{"id": "I-1", "upstream": "codebuddy", "qty": 1,
                         "loss": 17800.0, "label": "test", "date": "2026-08-01"}],
        "payouts": [{"id": "P-1", "date": "2026-08-01", "amount_usdc": 50.0,
                     "status": "confirmed", "destination": "0x123"}],
        "refunds": [],
    }

    class FakeConn:
        def __enter__(self): return self
        def __exit__(self, *a): return False

    class FakeCur:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def execute(self, sql, *args):
            for key in data:
                if key in sql.lower():
                    self._cur = iter([dict(r) for r in data[key]])
                    break
        def fetchall(self):
            return list(self._cur) if hasattr(self, "_cur") else []
        def fetchone(self):
            if not hasattr(self, "_cur"): return None
            try: return next(self._cur)
            except StopIteration: return None

    conn = FakeConn()
    conn.cursor = MagicMock(return_value=FakeCur())
    monkeypatch.setattr(app_module, "db_connect", lambda: conn)

    r = auth_client.get("/api/finance")
    assert r.status_code == 200
    json_data = r.get_json()
    assert "net_income" in json_data
    assert "payout_confirmed" in json_data
    assert "amortization" in json_data
    assert "impairment" in json_data
    assert "impairments_count" in json_data
    assert "kurs_meta" in json_data
    assert "assets" in json_data
    assert "providers" in json_data
    assert isinstance(json_data["providers"], list)
    assert json_data["providers"][0]["upstream_slug"] == "cline-pass"


def test_ui_usage_endpoints_schema(auth_client, monkeypatch):
    """Verify /api/usage/cache-stats, logs-models, and logs return valid schemas."""
    monkeypatch.setattr(app_module, "inferhub_get", lambda path, params=None, timeout=25: None)

    # 1. cache-stats fallback
    r_stats = auth_client.get("/api/usage/cache-stats?range=24h")
    assert r_stats.status_code == 200
    data_stats = r_stats.get_json()
    assert "totals" in data_stats
    assert "promptTokens" in data_stats["totals"]
    assert "cachedTokens" in data_stats["totals"]
    assert "hitRate" in data_stats["totals"]
    assert "completionTokens" in data_stats["totals"]
    assert "estimatedSavingsUsdc" in data_stats["totals"]
    assert "rows" in data_stats

    # 2. breakdown fallback
    r_breakdown = auth_client.get("/api/usage/breakdown?range=24h")
    assert r_breakdown.status_code == 200
    data_breakdown = r_breakdown.get_json()
    assert "byModel" in data_breakdown
    assert "byProvider" in data_breakdown

    # 3. logs-models fallback
    r_models = auth_client.get("/api/usage/logs-models?range=24h")
    assert r_models.status_code == 200
    assert isinstance(r_models.get_json(), list)

    # 4. logs fallback & query param forwarding
    seen_params = {}
    def mock_get_logs(path, params=None, timeout=25):
        if path == "/usage/logs":
            seen_params.update(params or {})
            return {
                "rows": [{"id": "req-1", "model": "deepseek/v3", "tokens": 100, "status": "200"}],
                "total": 1,
                "rangeTotal": 1,
                "page": 1,
                "pageSize": 25,
                "totalCostUsdc": "0.01",
                "totalTokens": 100,
                "totalSavedUsdc": "0.00",
                "range": "24h",
            }
        return None
    monkeypatch.setattr(app_module, "inferhub_get", mock_get_logs)

    r_logs = auth_client.get("/api/usage/logs?range=24h&page=1&pageSize=25&model=deepseek/v3&status=200&q=test")
    assert r_logs.status_code == 200
    assert seen_params.get("q") == "test"
    assert seen_params.get("model") == "deepseek/v3"
    assert len(r_logs.get_json()["rows"]) == 1


def test_ui_market_endpoint_schema(auth_client, monkeypatch):
    """Verify /api/market handles dict and list structures and dictionary of models."""
    # 1. List format
    monkeypatch.setattr(app_module, "inferhub_get", lambda p, params=None, timeout=25: [
        {"model": "deepseek/v3", "minAsk": 0.1, "maxAsk": 0.5, "sellers": 3}
    ])
    r1 = auth_client.get("/api/market")
    assert r1.status_code == 200
    assert "models" in r1.get_json()
    assert len(r1.get_json()["models"]) == 1

    # 2. Dict keyed by model ID (e.g. {"deepseek/v3": {"minAsk": 0.1, "maxAsk": 0.5}})
    monkeypatch.setattr(app_module, "inferhub_get", lambda p, params=None, timeout=25: {
        "deepseek/v3": {"minAsk": 0.1, "maxAsk": 0.5, "sellers": 3},
        "qwen/qwq-32b": {"minAsk": 0.05, "maxAsk": 0.2, "sellers": 2}
    })
    r2 = auth_client.get("/api/market")
    assert r2.status_code == 200
    res2 = r2.get_json()
    assert "models" in res2
    assert len(res2["models"]) == 2
    assert any(m["model"] == "deepseek/v3" for m in res2["models"])

    # 3. Dict with "data" key
    monkeypatch.setattr(app_module, "inferhub_get", lambda p, params=None, timeout=25: {
        "data": [{"model": "claude-3-5-sonnet", "minAsk": 1.5}]
    })
    r3 = auth_client.get("/api/market")
    assert r3.status_code == 200
    assert len(r3.get_json()["models"]) == 1

    # 4. Fallback when offline
    monkeypatch.setattr(app_module, "inferhub_get", lambda p, params=None, timeout=25: None)
    r4 = auth_client.get("/api/market")
    assert r4.status_code == 200
    assert "models" in r4.get_json()


def test_ui_catalog_endpoint_schema(auth_client, monkeypatch):
    """Verify /api/catalog returns upstreams list even when offline."""
    monkeypatch.setattr(app_module, "_cache", {})
    monkeypatch.setattr(app_module, "inferhub_get", lambda p, params=None, timeout=25: None)
    r = auth_client.get("/api/catalog")
    assert r.status_code == 200
    assert "upstreams" in r.get_json()


def test_finance_rules_dict_kurs():
    """Verify _f in finance_rules correctly extracts kurs from dicts."""
    from finance_rules import _f
    assert _f({"kurs_usd_idr": 16500.0}) == 16500.0
    assert _f({"kurs_ref_usd_idr": 17800.0}) == 17800.0
    assert _f({"custom": 15000.0}) == 15000.0
    assert _f(17801.17) == 17801.17
    assert _f(None, default=17801.17) == 17801.17


def test_ui_finance_error_fallback(auth_client, monkeypatch):
    """Verify /api/finance returns complete fallback schema on DB error."""
    monkeypatch.setattr(app_module, "db_connect", lambda: (_ for _ in ()).throw(Exception("DB connection failure")))
    r = auth_client.get("/api/finance")
    assert r.status_code == 200
    data = r.get_json()
    assert data["assets"] == []
    assert data["providers"] == []
    assert data["payout_confirmed"] == 0.0
    assert data["net_income"] == 0.0
    assert data["amortization"] == 0.0
    assert data["impairment"] == 0.0


def test_ui_pricing_override_routes(auth_client, monkeypatch):
    """Verify /api/pricing/override PUT and DELETE routes."""
    called = {}
    def mock_guard(req, conn, tbl, op, fn, **kw):
        called["op"] = op
        return fn()
    monkeypatch.setattr(app_module, "guard_mutation", mock_guard)
    monkeypatch.setattr(app_module, "_save_auto_pricing_config", lambda *a: None)
    monkeypatch.setattr(app_module, "_sync_ap_config_file", lambda *a: None)

    # PUT /api/pricing/override
    r_put = auth_client.put("/api/pricing/override", json={
        "upstream": "clinepass",
        "model_id": "deepseek-v3",
        "trigger_pct": 15.0,
    })
    assert r_put.status_code == 200
    assert r_put.get_json().get("ok") is True

    # DELETE /api/pricing/override/42
    r_del = auth_client.delete("/api/pricing/override/42")
    assert r_del.status_code == 200
    assert r_del.get_json().get("deleted") == 42


def test_ui_budgets_and_asks_routes(auth_client, monkeypatch):
    """Verify /api/budgets/<mid> and /api/ask PUT/POST routes."""
    seen_put = {}
    def mock_put(path, payload=None, timeout=25):
        seen_put["path"] = path
        seen_put["payload"] = payload
        return {"ok": True}
    monkeypatch.setattr(app_module, "inferhub_put", mock_put)

    # PUT /api/budgets/deepseek/deepseek-v3
    r_b = auth_client.put("/api/budgets/deepseek/deepseek-v3", json={
        "max_input_per_mtok": 0.5,
        "max_output_per_mtok": 1.0,
        "min_discount_pct": 10.0,
    })
    assert r_b.status_code == 200
    assert seen_put["path"] == "/budgets/deepseek/deepseek-v3"
    assert seen_put["payload"]["maxInputPerMtok"] == 0.5

    # PUT /api/ask
    r_a = auth_client.put("/api/ask", json={
        "upstream_catalog_model_id": "uuid-123",
        "upstream_slug": "clinepass",
        "ask_input_per_mtok": 0.15,
        "ask_output_per_mtok": 0.20,
    })
    assert r_a.status_code == 200
    assert seen_put["path"] == "/publisher/upstreams/clinepass/asks/uuid-123"


def test_ui_publisher_endpoints(auth_client, monkeypatch):
    """Verify publisher endpoints (earnings transfer, OTP, withdrawals)."""
    seen_post = {}
    def mock_post(path, payload=None, timeout=25):
        seen_post["path"] = path
        seen_post["payload"] = payload
        return {"ok": True}
    monkeypatch.setattr(app_module, "inferhub_post", mock_post)

    # 1. transfer
    r1 = auth_client.post("/api/publisher/earnings/transfer", json={"amount": 25.5})
    assert r1.status_code == 200
    assert seen_post["path"] == "/publisher/earnings/transfer"

    # 2. OTP request
    r2 = auth_client.post("/api/publisher/withdrawals/otp", json={"destination": "0xabc", "amount": 50.0})
    assert r2.status_code == 200
    assert seen_post["path"] == "/publisher/withdrawals/otp"

    # 3. Withdrawal submit
    r3 = auth_client.post("/api/publisher/withdrawals", json={"destination": "0xabc", "amount": 50.0, "otp": "123456"})
    assert r3.status_code == 200
    assert seen_post["path"] == "/publisher/withdrawals"

    # 4. Usage windows
    monkeypatch.setattr(app_module, "inferhub_get", lambda p, *a, **k: {"providers": []})
    r4 = auth_client.get("/api/publisher/providers/usage-windows")
    assert r4.status_code == 200
    assert "providers" in r4.get_json()

    # 5. Withdrawal destinations
    r5 = auth_client.get("/api/publisher/withdrawals/destinations")
    assert r5.status_code == 200


def test_ui_auto_pricing_and_reliability_routes(auth_client, monkeypatch):
    """Verify /api/auto-pricing and /api/reliability routes."""
    # 1. auto-pricing status
    r_ap = auth_client.get("/api/auto-pricing")
    assert r_ap.status_code == 200
    d_ap = r_ap.get_json()
    assert "armed" in d_ap
    assert "cycles" in d_ap

    # 2. reliability summary & sub-routes
    monkeypatch.setattr(app_module, "_reliability_query", lambda *a, **k: [])
    r_rel = auth_client.get("/api/reliability/summary")
    assert r_rel.status_code == 200
    assert "service_status" in r_rel.get_json()

    r_cycles = auth_client.get("/api/reliability/cycles")
    assert r_cycles.status_code == 200
    assert "cycles" in r_cycles.get_json()

    r_events = auth_client.get("/api/reliability/events")
    assert r_events.status_code == 200
    assert "events" in r_events.get_json()

    r_models = auth_client.get("/api/reliability/models")
    assert r_models.status_code == 200
    assert "models" in r_models.get_json()

