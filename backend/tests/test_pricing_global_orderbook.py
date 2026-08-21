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
              "platform_fee_pct": 0.1, "publisher_share_pct": 80,
              "global_trigger_pct": 15},
        headers={"Idempotency-Key": "pg-1"})
    assert r.status_code == 200
    assert called["action"] == "pricing-global-update"
    assert called["required_roles"] == ["admin"]


def test_pricing_global_put_terima_global_trigger_pct(auth_client, monkeypatch):
    """global_trigger_pct diteruskan ke guard _exec (config global per provider)."""
    seen = {}

    def fake_guard(req, conn, entity, action, executor, **kw):
        status, payload = executor()
        seen["exec_status"] = status
        seen["payload"] = payload
        return status, payload

    monkeypatch.setattr(app_module, "guard_mutation", fake_guard)
    monkeypatch.setattr(app_module, "_sync_ap_config_file", lambda conn=None: None)
    r = auth_client.put(
        "/api/pricing/global",
        json={"upstream": "clinepass", "max_ask_pct": 0.05,
              "platform_fee_pct": 0.1, "publisher_share_pct": 80,
              "global_trigger_pct": 15},
        headers={"Idempotency-Key": "pg-2"})
    assert r.status_code == 200
    assert seen["payload"]["config"]["global_trigger_pct"] == 15


def test_pricing_merged_exposes_auto_pricing_enabled(monkeypatch):
    """_load_pricing_merged expose auto_pricing_enabled per global upstream."""
    monkeypatch.setattr(app_module, "_orderbook_payload",
                        lambda: {"models": [{"upstreams": [{"slug": "clinepass"}, {"slug": "novo"}]}]})

    def fake_db():
        class FakeCur:
            def __init__(self):
                self.sql = ""

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def execute(self, sql, params=None):
                self.sql = sql

            def fetchall(self):
                if "auto_pricing_config" in self.sql:
                    return []
                if "pricing_config_upstream" in self.sql:
                    return [
                        {"upstream": "clinepass", "max_ask_pct": 0.05,
                         "platform_fee_pct": 0.1, "publisher_share_pct": 80,
                         "global_trigger_pct": None, "auto_pricing_enabled": True},
                    ]
                return []

            def fetchone(self):
                if "pricing_config WHERE" in self.sql:
                    return {"max_ask_pct": 0.5, "platform_fee_pct": 0.1, "publisher_share_pct": 80}
                return None

        class FakeConn:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def cursor(self):
                return FakeCur()

        return FakeConn()

    monkeypatch.setattr(app_module, "db_connect", fake_db)
    res = app_module._load_pricing_merged()
    assert res["globals"]["clinepass"]["auto_pricing_enabled"] is True
    assert res["globals"]["novo"]["auto_pricing_enabled"] is True


def test_scope_put_lewat_guard(auth_client, monkeypatch):
    """PUT /api/auto-pricing/scope gated: action scope-update + role admin."""
    called = {}
    seen_exec = {}

    def fake_guard(req, conn, entity, action, executor, **kw):
        called["action"] = action
        called["entity"] = entity
        called["required_roles"] = kw.get("required_roles")
        status, payload = executor()
        seen_exec["payload"] = payload
        return status, payload

    monkeypatch.setattr(app_module, "guard_mutation", fake_guard)
    monkeypatch.setattr(app_module, "_sync_ap_config_file", lambda conn=None: None)
    monkeypatch.setattr(app_module, "_cache", {"catalog": [{"slug": "commandcode"}]})
    r = auth_client.put(
        "/api/auto-pricing/scope",
        json={"upstream": "commandcode", "enabled": False},
        headers={"Idempotency-Key": "scope-1"})
    assert r.status_code == 200
    assert called["action"] == "scope-update"
    assert called["entity"] == "pricing_config_upstream"
    assert called["required_roles"] == ["admin"]
    assert seen_exec["payload"]["enabled"] is False


def test_scope_put_validasi_enabled_boolean(auth_client, monkeypatch):
    """enabled wajib boolean — selain itu 400."""
    r = auth_client.put(
        "/api/auto-pricing/scope",
        json={"upstream": "commandcode", "enabled": "yes"},
        headers={"Idempotency-Key": "scope-2"})
    assert r.status_code == 400
    assert "enabled" in r.get_json()["error"]


def test_scope_put_tolak_upstream_tidak_dikenal(auth_client, monkeypatch):
    """upstream di luar catalog ditolak 400 (kalau catalog tersedia)."""
    monkeypatch.setattr(app_module, "_cache", {"catalog": [{"slug": "codebuddy"}, {"slug": "z-ai"}]})
    r = auth_client.put(
        "/api/auto-pricing/scope",
        json={"upstream": "not-a-real-upstream", "enabled": True},
        headers={"Idempotency-Key": "scope-3"})
    assert r.status_code == 400
    assert "unknown upstream" in r.get_json()["error"]
