"""Critical-path route tests (Phase 4 Q12b) — raise app.py coverage."""
import pytest
import app as app_module


@pytest.fixture
def client():
    app_module.app.config["TESTING"] = True
    app_module._rl.clear()
    previous_limit = app_module.RL_LIMIT
    app_module.RL_LIMIT = 1000
    try:
        with app_module.app.test_client() as c:
            yield c
    finally:
        app_module.RL_LIMIT = previous_limit
        app_module._rl.clear()


def test_health_route(client):
    # Route health = `/health` (app.py:2458), BUKAN `/api/health`.
    r = client.get("/health")
    assert r.status_code == 200


def test_login_route(client, monkeypatch):
    monkeypatch.setattr(app_module, "DASHBOARD_PASSWORD", "test-pass")
    r = client.post("/api/login", json={"password": "test-pass", "operator_name": "Faiz"})
    assert r.status_code == 200
    assert "token" in r.get_json()


def _auth(monkeypatch):
    monkeypatch.setattr(app_module, "_verify_token", lambda token: True)
    monkeypatch.setattr(app_module, "get_operator", lambda token: ("Faiz", "admin"))


def test_finance_route_authed(client, monkeypatch):
    _auth(monkeypatch)
    monkeypatch.setattr(app_module, "db_read_finance", lambda: {"net_income": 10.0})
    r = client.get("/api/finance", headers={"Authorization": "Bearer fake-token"})
    assert r.status_code == 200


def test_pricing_route_authed(client, monkeypatch):
    _auth(monkeypatch)
    monkeypatch.setattr(app_module, "_load_pricing_merged", lambda: {"globals": {}, "overrides": [], "orderbook": []})
    r = client.get("/api/pricing", headers={"Authorization": "Bearer fake-token"})
    assert r.status_code == 200

def test_critical_read_routes(client, monkeypatch):
    _auth(monkeypatch)
    monkeypatch.setattr(app_module, "inferhub_get", lambda path, params=None, timeout=25: {
        "/usage/logs": {"rows": [], "total": 0, "totalCostUsdc": 0},
        "/usage/breakdown": {"byModel": [], "byProvider": [], "byProviderModel": []},
        "/market": {"markets": []}, "/catalog": [], "/usage/logs/models": [],
    }.get(path, []))
    monkeypatch.setattr(app_module, "inferhub_inf_get", lambda *args, **kwargs: {"data": []})
    monkeypatch.setattr(app_module, "db_read_providers", lambda: [])
    monkeypatch.setattr(app_module, "db_read_model_rank", lambda: {})
    monkeypatch.setattr(app_module, "db_read_earning_range", lambda _range: 0.0)
    monkeypatch.setattr(app_module, "get_cache", lambda: {
        "withdrawals": [], "earnings_alltime": {}, "fleet": {"raw": []}, "refreshed": None,
    })
    for path in (
        "/api/payouts", "/api/upstreams", "/api/earnings-log", "/api/earnings-alltime",
        "/api/earnings-trend", "/api/earnings-summary", "/api/publisher-analytics",
        "/api/model-ranking", "/api/breakdown", "/api/market", "/api/catalog",
        "/api/orderbook", "/api/usage/cache-stats", "/api/usage/logs",
        "/api/usage/logs-models", "/api/v1-models", "/api/v1-me-usage", "/api/fleet-health",
        "/api/asks", "/api/auto-pricing",
    ):
        response = client.get(path, headers={"Authorization": "Bearer fake-token"})
        assert response.status_code == 200, path


def test_db_backed_read_routes_empty_on_db_failure(client, monkeypatch):
    _auth(monkeypatch)
    monkeypatch.setattr(app_module, "db_connect", lambda: (_ for _ in ()).throw(RuntimeError("db unavailable")))
    for path in ("/api/keys", "/api/topups", "/api/budgets", "/api/combos", "/api/pricing-config", "/api/budgets/aliases", "/api/combos/available-models", "/api/auto-pricing/config"):
        response = client.get(path, headers={"Authorization": "Bearer fake-token"})
    assert response.status_code == 200


def test_poller_once_and_sync_helpers(monkeypatch, tmp_path):
    original = app_module._cache.copy()
    try:
        app_module._cache.update({"history": [], "_rank_running": False, "model_rank": None, "earnings_log": None, "_dbsync_done": 1, "catalog": None})
        responses = {
            "/publisher/earnings": {"publisherEarningsUsdc": 3, "consumerBalanceUsdc": 4},
            "/me": {"email": "e", "displayName": "D", "roles": ["r"], "balances": {}},
            "/publisher/providers": [{"id": "p", "displayName": "P", "upstreamSlug": "u", "upstreamLabel": "U", "apiKeyCheckStatus": "ok", "enabled": True, "earningsLifetimeUsdc": 2}],
            "/publisher/withdrawals": [{"id": "w", "amountUsdc": 1}],
            "/catalog": [{"slug": "u", "models": []}],
            "/usage/logs": {"rows": [], "total": 0},
        }
        monkeypatch.setattr(app_module, "inferhub_get", lambda path, *args, **kwargs: responses.get(path, []))
        monkeypatch.setattr(app_module, "db_insert", lambda *args: None)
        monkeypatch.setattr(app_module, "db_save_model_rank", lambda *args: None)
        monkeypatch.setattr(app_module, "_compute_model_rank", lambda prov: {"rows": [], "total_requests": 0})
        monkeypatch.setattr(app_module, "_poll_earnings_log", lambda: {"rows": [], "count": 0})
        monkeypatch.setattr(app_module, "_incremental_db_sync", lambda: None)
        monkeypatch.setattr(app_module, "_sync_account_light", lambda: None)
        monkeypatch.setattr(app_module, "HIST", str(tmp_path / "history.ndjson"))
        app_module._poll_once(1000)
        assert app_module._cache["balances"]["publisher_earnings"] == 3.0
        assert app_module._cache["earnings_alltime"]["earning_alltime"] == 4.0
    finally:
        app_module._cache.clear()
        app_module._cache.update(original)


def test_incremental_and_account_sync_helpers(monkeypatch):
    cur = _Cursor()
    conn = _Conn(cur)
    monkeypatch.setattr(app_module, "db_connect", lambda: conn)
    responses = {
        "/publisher/providers": [{"id": "p", "displayName": "P", "upstreamSlug": "u", "upstreamLabel": "U", "apiKeyCheckStatus": "ok", "enabled": True}],
        "/market": {"models": [{"slug": "m"}]},
        "/usage/logs": {"rows": [{"id": "l", "ts": "2026-01-01T00:00:00Z", "model": "m", "cost_consumer_usdc": 1}], "total": 1},
        "/publisher/withdrawals": [], "/keys": [{"id": "k", "name": "K", "scopes": []}],
        "/topups": [{"id": "t", "amountUsdc": 1}], "/pricing/config": {"maxAskPctOfOfficial": 5},
        "/budgets": [], "/combos": [],
    }
    monkeypatch.setattr(app_module, "inferhub_get", lambda path, *args, **kwargs: responses.get(path, []))
    monkeypatch.setattr(app_module, "_sync_payouts_rows", lambda *args, **kwargs: 0)
    app_module._incremental_db_sync()
    app_module._sync_account_light()
    assert cur.executed


def test_low_level_auth_and_http_helpers(monkeypatch):
    monkeypatch.setenv("INFERHUB_API_KEY", "key")
    assert app_module.load_api_key() == "key"
    assert app_module._sign_session(1)
    token = app_module.issue_token("Faiz", "admin")
    assert app_module.get_operator(token) == ("Faiz", "admin")
    assert app_module._read_credentials is not None
    import urllib.request
    class Reply:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self): return b'{"ok": true}'
    monkeypatch.setattr(urllib.request, "urlopen", lambda *args, **kwargs: Reply())
    assert app_module.inferhub_get("/x")["ok"] is True
    assert app_module.inferhub_inf_get("/x")["ok"] is True
    assert app_module.inferhub_post("/x", {"a": 1})["ok"] is True
    assert app_module.inferhub_put("/x", {"a": 1})["ok"] is True
    assert app_module.inferhub_delete("/x") is True
    monkeypatch.setattr(urllib.request, "urlopen", lambda *args, **kwargs: (_ for _ in ()).throw(OSError("network")))
    assert app_module.inferhub_get("/x") is None
    assert app_module.inferhub_inf_get("/x") is None
    assert app_module.inferhub_post("/x") is None
    assert app_module.inferhub_put("/x") is None
    assert app_module.inferhub_delete("/x") is False


def test_db_provider_and_ranking_contracts(monkeypatch):
    rows = [{"id": "p", "display_name": "P", "upstream_slug": "u", "upstream_label": "U", "enabled": 1, "status": "ok", "drained": 0, "used_pct": 10, "reset_at": "2026-01-01", "earnings_lifetime": 2, "model_count": 1}]
    conn, _ = _conn(monkeypatch, {"providers": rows, "model_ranking": [{"model": "m", "requests": 2, "avg_price_in": 1, "avg_price_out": 2, "ask_in": 3, "ask_out": 4, "active_providers": 1, "est_earning": 5, "status": "available"}]})
    assert app_module.db_read_providers()[0]["slug"] == "u"
    monkeypatch.setattr(app_module, "db_read_model_rank", lambda: {"rows": [{"model": "m", "requests": 2}], "total_requests": 2})
    with app_module.app.test_request_context():
        assert app_module.api_model_ranking().json["total_requests"] == 2
    assert app_module.db_read_providers() is not None


def test_nonempty_analytics_and_usage_contracts(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    provider = {"slug": "u", "label": "U", "name": "N", "id": "p", "status": "ok", "drained": False, "earnings": 4, "used_pct": 20}
    monkeypatch.setattr(app_module, "db_read_providers", lambda: [provider])
    monkeypatch.setattr(app_module, "db_read_earning_range", lambda value: 2.5)
    usage = {"rows": [{"ts": "2026-01-01T00:00:00Z", "model": "m", "upstream_label": "U", "prompt_tokens": 1, "completion_tokens": 2, "cost_consumer_usdc": 4}], "total": 1, "totalCostUsdc": 4}
    monkeypatch.setattr(app_module, "inferhub_get", lambda path, *args, **kwargs: usage)
    app_module._cache.pop("earn_log_cache", None)
    assert client.get("/api/upstreams", headers=headers).get_json()[0]["earnings"] == 4.0
    assert client.get("/api/publisher-analytics?range=all", headers=headers).get_json()["total_providers"] == 1
    assert client.get("/api/earnings-log", headers=headers).get_json()["total"] == 1
    assert client.get("/api/earnings-summary", headers=headers).get_json()["total_calls"] == 1
    assert client.get("/api/earnings-trend", headers=headers).get_json()["calls"] == 1
    monkeypatch.setattr(app_module, "get_cache", lambda: {"withdrawals": [{"id": "w", "requestedAt": "2026-01-01", "amountUsdc": 3, "status": "confirmed", "destination": "d"}], "earnings_alltime": {"earning_alltime": 3}, "fleet": {"raw": []}})
    assert client.get("/api/payouts", headers=headers).get_json()["total"] == 3.0


def test_reliability_summary_contract_data(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    from datetime import datetime, timezone
    started = datetime.now(timezone.utc)
    def query(sql, params=()):
        if "reliability_aggregates" in sql: return [{"metric": "m", "value": 1, "bucket_start": "t", "bucket_granularity": "1h"}]
        if "reliability_cycles" in sql and "count" not in sql: return [{"started_at": started, "completed_at": started, "status": "completed", "summary": {}}]
        if "reliability_cycles" in sql: return [{"n": 2}]
        if "model_hold" in sql: return [{"n": 1}]
        if "severity" in sql: return [{"n": 1}]
        if "delayed_data" in sql: return [{"n": 1}]
        if "max(occurred_at)" in sql: return [{"at": started}]
        if "auto_pricing_state" in sql: return [{"n": 3}]
        return []
    monkeypatch.setattr(app_module, "_reliability_query", query)
    payload = client.get("/api/reliability/summary", headers=headers).get_json()
    assert payload["service_status"] == "healthy" and payload["stale"] is True and payload["cycle_count"] == 2


def test_provider_ask_and_breakdown_contracts(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    providers = [{"id": "p1", "upstreamSlug": "u", "upstreamLabel": "U", "enabled": True}]
    asks = [{"upstreamCatalogModelId": "m", "upstreamModelId": "model", "enabled": True, "askInputPerMtok": 1, "askOutputPerMtok": 2, "officialInputPerMtok": 3, "officialOutputPerMtok": 4, "maxAskIn": 5, "maxAskOut": 6, "avgPriceRequests": 7, "modelStatus": "available"}]
    monkeypatch.setattr(app_module, "inferhub_get", lambda path, *args, **kwargs: providers if path == "/publisher/providers" else asks if "/asks" in path else {"byModel": ["x"]})
    assert client.get("/api/asks", headers=headers).get_json()["count"] == 1
    assert client.get("/api/breakdown?range=24h", headers=headers).get_json()["byModel"] == ["x"]
    assert client.get("/api/usage/breakdown?range=24h", headers=headers).get_json()["byModel"] == ["x"]
    monkeypatch.setattr(app_module, "inferhub_get", lambda *args, **kwargs: None)
    assert client.get("/api/asks", headers=headers).get_json()["rows"] == []
    assert client.get("/api/breakdown", headers=headers).get_json()["range"] == "7d"
    assert client.get("/api/usage/breakdown", headers=headers).get_json()["range"] == "7d"
    assert client.get("/api/market", headers=headers).status_code == 200
    cache_stats = client.get("/api/usage/cache-stats", headers=headers).get_json()
    assert cache_stats["error"] == "unavailable" and cache_stats["rows"] == [] and cache_stats["totals"]["hitRate"] == 0.0
    logs = client.get("/api/usage/logs", headers=headers).get_json()
    assert logs["error"] == "unavailable" and logs["rows"] == [] and logs["total"] == 0 and logs["page"] == 1
    assert client.get("/api/usage/logs-models", headers=headers).get_json() == []
    assert client.get("/api/usage/logs/models", headers=headers).get_json() == []
    assert client.get("/api/v1-models", headers=headers).get_json()["error"] == "unavailable"
    assert client.get("/api/v1-me-usage", headers=headers).get_json()["error"] == "unavailable"


def test_route_sweep_critical_paths(client, monkeypatch):
    _auth(monkeypatch)
    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def execute(self, *args): pass
        def fetchall(self): return []
        def fetchone(self): return None
    class Conn:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def cursor(self): return Cursor()
        def commit(self): pass
        def close(self): pass
    monkeypatch.setattr(app_module, "db_connect", lambda: Conn())
    monkeypatch.setattr(app_module, "inferhub_get", lambda *args, **kwargs: [])
    monkeypatch.setattr(app_module, "inferhub_post", lambda *args, **kwargs: {})
    monkeypatch.setattr(app_module, "inferhub_put", lambda *args, **kwargs: {})
    monkeypatch.setattr(app_module, "inferhub_delete", lambda *args, **kwargs: True)
    monkeypatch.setattr(app_module, "inferhub_inf_get", lambda *args, **kwargs: {})
    monkeypatch.setattr(app_module, "db_read_providers", lambda: [])
    monkeypatch.setattr(app_module, "db_read_model_rank", lambda: {})
    monkeypatch.setattr(app_module, "db_read_earning_range", lambda *args: 0.0)
    monkeypatch.setattr(app_module, "_reliability_query", lambda *args: [])
    headers = {"Authorization": "Bearer fake-token"}
    for path in ("/api/history", "/api/data", "/api/payouts", "/api/upstreams", "/api/earnings-log", "/api/earnings-alltime", "/api/earnings-trend", "/api/earnings-summary", "/api/publisher-analytics", "/api/model-ranking", "/api/keys", "/api/topups", "/api/budgets", "/api/combos", "/api/pricing-config", "/api/pricing", "/api/budgets/aliases", "/api/combos/available-models", "/api/breakdown", "/api/usage/breakdown", "/api/market", "/api/catalog", "/api/orderbook", "/api/usage/cache-stats", "/api/usage/logs", "/api/usage/logs-models", "/api/usage/logs/models", "/api/v1-models", "/api/v1-me-usage", "/api/fleet-health", "/api/asks", "/api/auto-pricing", "/api/reliability/summary", "/api/reliability/cycles", "/api/reliability/events", "/api/reliability/models", "/api/auto-pricing/config"):
        response = client.get(path, headers=headers)
        assert response.status_code in (200, 502), path


def test_reliability_routes_and_transitions(client, monkeypatch):
    _auth(monkeypatch)
    monkeypatch.setattr(app_module, "_reliability_query", lambda sql, params=(): [])
    monkeypatch.setattr(app_module, "_set_auto_pricing_state", lambda armed, **kwargs: {"event_id": "e1", "armed": armed})
    headers = {"Authorization": "Bearer fake-token"}
    for path in ("/api/reliability/summary", "/api/reliability/cycles", "/api/reliability/events", "/api/reliability/models"):
        assert client.get(path, headers=headers).status_code == 200
    assert client.post("/api/reliability/arm", json={"reason": "test"}, headers=headers).status_code == 200
    assert client.post("/api/reliability/disarm", json={"reason": "test"}, headers=headers).status_code == 200
    assert client.post("/api/auto-pricing/arm", json={"armed": True}, headers=headers).status_code == 200


def test_helper_critical_paths(monkeypatch):
    rows = [{"upstreamModelId": "m", "avgPriceRequests": 2, "avgPriceIn": 1, "avgPriceOut": 2, "askInputPerMtok": 3, "askOutputPerMtok": 4, "modelStatus": "available", "enabled": True}]
    monkeypatch.setattr(app_module, "inferhub_get", lambda *args, **kwargs: rows if "/asks" in args[0] else {"rows": [], "total": 0})
    assert app_module._compute_model_rank([{"id": "p"}])["total_requests"] == 2
    assert app_module._poll_earnings_log()["rows"] == []
    assert app_module._is_drained({"drainedUntil": "2999-01-01T00:00:00Z"}) is True
    assert app_module._is_drained({"drainedUntil": "not-a-date"}) is True
    assert app_module._is_drained({}) is False
    assert app_module._fetch_all_usage("30d")[0] == []


class _Cursor:
    def __init__(self, rows_by_query=None, fetchone_rows=None):
        self.rows_by_query = rows_by_query or {}
        self.fetchone_rows = list(fetchone_rows or [])
        self.sql = ""
        self.executed = []

    def __enter__(self): return self
    def __exit__(self, *args): return False
    def execute(self, sql, params=()):
        self.sql = sql
        self.executed.append((sql, params))
    def executemany(self, sql, params):
        self.sql = sql
        self.executed.extend((sql, item) for item in params)
    def fetchall(self):
        for key, rows in self.rows_by_query.items():
            if key in self.sql:
                return rows
        return []
    def fetchone(self):
        if self.fetchone_rows:
            return self.fetchone_rows.pop(0)
        for key, rows in self.rows_by_query.items():
            if key in self.sql:
                return rows[0] if rows else None
        return None


class _Conn:
    def __init__(self, cursor): self.cur = cursor; self.closed = False
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def cursor(self): return self.cur
    def commit(self): pass
    def close(self): self.closed = True


def _conn(monkeypatch, rows_by_query=None, fetchone_rows=None):
    cur = _Cursor(rows_by_query, fetchone_rows)
    conn = _Conn(cur)
    monkeypatch.setattr(app_module, "db_connect", lambda: conn)
    return conn, cur


def test_finance_helper_and_data_contract(client, monkeypatch):
    _auth(monkeypatch)
    monkeypatch.setattr(app_module, "db_read_finance", lambda: {"net_income": 12.5, "assets": []})
    monkeypatch.setattr(app_module, "get_cache", lambda: {"balances": {"publisher_earnings": 3}, "fleet": {"raw": [], "total": 0}, "history": [{"earnings": 1}], "account": {}, "earnings_alltime": {}, "refreshed": "now"})
    payload = client.get("/api/data", headers={"Authorization": "Bearer fake-token"}).get_json()
    assert payload["finance"]["net_income"] == 12.5
    assert payload["trend"]["earnings_usdc"] == [1]


def test_history_contract_branches(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    monkeypatch.setattr(app_module, "read_history", lambda: [])
    assert client.get("/api/history", headers=headers).get_json()["points"] == []
    now = app_module.datetime.now(app_module.timezone.utc).timestamp()
    monkeypatch.setattr(app_module, "read_history", lambda: [{"epoch": now - 120, "ts": "a", "earnings": 1}, {"epoch": now - 60, "ts": "b", "earnings": 3}])
    payload = client.get("/api/history?range=7d", headers=headers).get_json()
    assert payload["earnings"] == [1, 3]
    assert payload["deltas"] == [0.0, 2.0]


def test_db_read_route_contracts(monkeypatch):
    rows = {
        "api_keys": [{"id": "k", "name": "n", "key_prefix": "kp", "scopes": "a,b", "created_at": "t", "last_used_at": None, "expires_at": None, "replaced_by": None}],
        "topups": [{"id": "t", "amount_usdc": 2, "amount_idr": 3, "payment_method": "qris", "status": "pending", "payment_url": "u", "topup_key": "tk", "created_at": "c"}],
        "budgets": [{"upstream_catalog_model_id": "m", "prefix": "p", "upstream_model_id": "model", "upstream_label": "up", "official_in": 1, "official_out": 2, "market_min_ask_in": 3, "market_min_ask_out": 4, "max_input_per_mtok": 5, "max_output_per_mtok": 6, "min_discount_pct": 7, "enabled": 1}],
        "combos": [{"id": "c", "name": "combo", "slug": "s", "max_input_per_mtok": 1, "max_output_per_mtok": 2, "created_at": "t"}],
        "combo_models": [{"combo_id": "c", "model": "m"}],
        "budget_aliases": [{"alias": "a", "label": "A", "member_count": 1, "min_discount_pct": 2, "upstream_labels": ["U"]}],
        "pricing_config": [{"max_ask_pct": 10, "platform_fee_pct": 2, "publisher_share_pct": 88}],
        "combo_models_distinct": [{"model": "m"}],
    }
    conn, _ = _conn(monkeypatch, rows)
    with app_module.app.test_request_context():
        assert app_module.api_keys().json[0]["scopes"] == ["a", "b"]
        assert app_module.api_topups().json[0]["topup_key"] == "tk"
        assert app_module.api_budgets().json[0]["enabled"] is True
        assert app_module.api_combos().json[0]["models"] == ["m"]
        assert app_module.api_budget_aliases().json[0]["alias"] == "a"
        assert app_module.api_pricing_config().json["max_ask_pct"] == 10
        assert app_module.api_combos_available().json == ["m"]
    assert conn.closed is False


def test_key_budget_topup_combo_and_recheck_contracts(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    _conn(monkeypatch)
    monkeypatch.setattr(app_module, "inferhub_post", lambda path, payload=None: {"id": "k", "name": "N", "prefix": "p", "secret": "s", "topupKey": "tk", "amountUsdc": "4", "qrData": "q", "qrSvg": "svg"})
    monkeypatch.setattr(app_module, "inferhub_delete", lambda path: True)
    monkeypatch.setattr(app_module, "inferhub_put", lambda path, payload: {"ok": True, "path": path, "payload": payload})
    assert client.post("/api/keys/k/rotate", headers=headers).status_code == 201
    assert client.delete("/api/keys/k", headers=headers).get_json()["ok"] is True
    budget = client.put("/api/budgets/m", json={"max_input_per_mtok": 1, "max_output_per_mtok": 2, "min_discount_pct": 3, "enabled": False}, headers=headers)
    assert budget.get_json()["ok"] is True
    assert client.post("/api/topups", json={"amount": "10"}, headers=headers).status_code == 201
    assert client.post("/api/topups/tk/refresh", headers=headers).get_json()["topupKey"] == "tk"
    assert client.post("/api/provider-recheck?id=p1", headers=headers).status_code == 200
    assert client.post("/api/combos", json={"name": "C", "slug": "c", "model_ids": ["m"]}, headers=headers).get_json()["ok"] is True
    assert client.delete("/api/combos/c", headers=headers).get_json()["ok"] is True


def test_key_budget_topup_recheck_failures(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    monkeypatch.setattr(app_module, "inferhub_post", lambda *args, **kwargs: None)
    monkeypatch.setattr(app_module, "inferhub_delete", lambda *args, **kwargs: False)
    monkeypatch.setattr(app_module, "inferhub_put", lambda *args, **kwargs: None)
    assert client.post("/api/keys/k/rotate", headers=headers).status_code == 502
    assert client.delete("/api/keys/k", headers=headers).status_code == 502
    assert client.put("/api/budgets/m", json={}, headers=headers).status_code == 502
    assert client.post("/api/topups", json={"amount": 10}, headers=headers).status_code == 502
    assert client.post("/api/topups/tk/refresh", headers=headers).status_code == 502
    assert client.post("/api/provider-recheck", json={}, headers=headers).status_code == 400
    assert client.post("/api/provider-recheck?id=p1", headers=headers).status_code == 502
    assert client.post("/api/combos", json={"name": "C", "slug": "c", "model_ids": ["m"]}, headers=headers).status_code == 502
    assert client.delete("/api/combos/c", headers=headers).status_code == 502


def test_topup_validation_and_refresh_db_failure(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    assert client.post("/api/topups", json={}, headers=headers).status_code == 400
    assert client.post("/api/topups", json={"amount": "x"}, headers=headers).status_code == 400
    assert client.post("/api/topups", json={"amount": 0}, headers=headers).status_code == 400
    monkeypatch.setattr(app_module, "inferhub_post", lambda *args, **kwargs: {"topupKey": "tk", "amountUsdc": "bad"})
    monkeypatch.setattr(app_module, "db_connect", lambda: (_ for _ in ()).throw(RuntimeError("db")))
    assert client.post("/api/topups", json={"amount": 10}, headers=headers).status_code == 500
    assert client.post("/api/topups/tk/refresh", headers=headers).status_code == 200


def test_asks_and_ask_contract(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    asks = [{"upstreamCatalogModelId": "m", "upstreamModelId": "model", "enabled": True, "askInputPerMtok": "1", "askOutputPerMtok": "2", "officialInputPerMtok": 3, "officialOutputPerMtok": 4, "maxAskIn": 5, "maxAskOut": 6, "avgPriceRequests": 7, "modelStatus": "available"}, {"enabled": False}]
    monkeypatch.setattr(app_module, "inferhub_get", lambda path, *args, **kwargs: [{"id": "p", "upstreamSlug": "u", "upstreamLabel": "U", "enabled": True}] if path == "/publisher/providers" else asks)
    payload = client.get("/api/asks?upstream=u&q=model", headers=headers).get_json()
    assert payload["count"] == 1 and payload["rows"][0]["ask_in"] == 1.0
    seen = {}
    monkeypatch.setattr(app_module, "inferhub_put", lambda path, data: seen.update(path=path, data=data) or {"ok": True})
    response = client.put("/api/ask", json={"upstream_catalog_model_id": "m", "upstream_slug": "u", "ask_input_per_mtok": 1.2, "ask_output_per_mtok": 2.3}, headers=headers)
    assert response.get_json()["ok"] is True and seen["path"] == "/publisher/upstreams/u/asks/m"
    assert seen["data"] == {"askInputPerMtok": "1.2", "askOutputPerMtok": "2.3"}
    assert client.put("/api/ask", json={}, headers=headers).status_code == 400
    monkeypatch.setattr(app_module, "inferhub_put", lambda *args, **kwargs: None)
    assert client.put("/api/ask", json={"upstream_catalog_model_id": "m", "upstream_slug": "u", "ask_input_per_mtok": 1, "ask_output_per_mtok": 2}, headers=headers).status_code == 502


def test_orderbook_catalog_and_pricing_contracts(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    catalog = [{"slug": "ours", "label": "Ours", "models": [{"id": "cid", "upstreamModelId": "vendor/model", "officialIn": 1, "asksIn": ["bad", 0.2, 0.2]}]}, {"slug": "ext", "label": "External", "models": [{"id": "cid2", "upstreamModelId": "vendor/model", "asksIn": [0.5, 0.3]}]}]
    app_module._cache["catalog"] = catalog
    app_module._cache["providers"] = [{"id": "p", "upstreamSlug": "ours", "enabled": True}]
    app_module._cache["asks"] = [{"upstreamCatalogModelId": "cid", "askInputPerMtok": 0.15}]
    data = app_module._orderbook_payload()
    model = data["models"][0]
    assert model["our_ask"] == 0.15 and model["min_ask"] == 0.3
    assert [level["qty"] for level in model["upstreams"][1]["levels"]] == [1, 1]
    app_module._cache["catalog"] = {"upstreams": catalog}
    assert client.get("/api/catalog", headers=headers).get_json()["upstreams"] == catalog
    monkeypatch.setattr(app_module, "_load_pricing_merged", lambda: {"globals": {"ours": {"max_ask_pct": 5}}, "overrides": [], "orderbook": []})
    assert client.get("/api/pricing", headers=headers).get_json()["globals"]["ours"]["max_ask_pct"] == 5


def test_pricing_global_validation_and_update(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    assert client.put("/api/pricing/global", json={}, headers=headers).status_code == 400
    assert client.put("/api/pricing/global", json={"upstream": "u", "max_ask_pct": "x"}, headers=headers).status_code == 400
    assert client.put("/api/pricing/global", json={"upstream": "u", "max_ask_pct": 0}, headers=headers).status_code == 400
    conn, _ = _conn(monkeypatch)
    monkeypatch.setattr(app_module, "guard_mutation", lambda request, conn, *args, **kwargs: (200, kwargs["request_body"]))
    response = client.put("/api/pricing/global", json={"upstream": "u", "max_ask_pct": 5, "platform_fee_pct": 2}, headers=headers)
    assert response.get_json()["upstream"] == "u" and conn.closed


def test_finance_analytics_branch_contracts(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    rows = [{"slug": "u", "label": "U", "earnings": 4, "status": "invalid", "drained": False, "used_pct": None}, {"slug": "u", "label": "U", "earnings": 2, "status": "ok", "drained": True, "used_pct": 50}]
    monkeypatch.setattr(app_module, "db_read_providers", lambda: rows)
    monkeypatch.setattr(app_module, "db_read_earning_range", lambda _: 3)
    monkeypatch.setattr(app_module, "inferhub_get", lambda path, *args, **kwargs: {"totalCostUsdc": 10, "total": 2} if path == "/usage/logs" else None)
    analytics = client.get("/api/publisher-analytics?range=7d", headers=headers).get_json()
    assert analytics["by_upstream"][0]["invalid"] == 1
    upstreams = client.get("/api/upstreams?slug=u", headers=headers).get_json()
    assert upstreams["invalid"] == 1 and upstreams["drained"] == 1
    assert client.get("/api/fleet-health?q=missing", headers=headers).get_json()["count"] == 0


def test_finance_mutation_contracts(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    conn, cur = _conn(monkeypatch)
    def guard(request, conn, *args, **kwargs):
        return args[2]()
    monkeypatch.setattr(app_module, "guard_mutation", guard)
    import ledger_update
    monkeypatch.setattr(ledger_update, "upsert_asset", lambda payload: None)
    monkeypatch.setattr(ledger_update, "update_asset_status", lambda *args: None)
    buy = client.post("/api/finance/buy", json={"id": "a", "upstream": "u", "cost": 3}, headers=headers)
    assert buy.get_json()["ok"] is True
    assert client.post("/api/finance/retire", json={"id": "a"}, headers=headers).get_json()["status"] == "retired"
    refund = client.post("/api/finance/refund", json={"id": "r", "upstream": "u", "amount_usdc": 2}, headers=headers)
    assert refund.get_json()["amount_usdc"] == 2.0
    assert client.post("/api/finance/retire", json={}, headers=headers).status_code == 400
    assert client.post("/api/finance/refund", json={}, headers=headers).status_code == 400
    assert client.post("/api/finance/refund", json={"id": "r"}, headers=headers).status_code == 400
    assert client.post("/api/finance/refund", json={"id": "r", "upstream": "u", "amount_usdc": "x"}, headers=headers).status_code == 400


def test_auto_pricing_config_contracts(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    conn, cur = _conn(monkeypatch)
    monkeypatch.setattr(app_module, "guard_mutation", lambda request, conn, *args, **kwargs: (200, kwargs["request_body"]))
    monkeypatch.setattr(app_module, "_save_auto_pricing_config", lambda *args: {"ok": True})
    monkeypatch.setattr(app_module, "_sync_ap_config_file", lambda *args: None)
    assert client.put("/api/auto-pricing/config", json={"upstream": "u", "model_id": "vendor/m", "trigger_pct": 5}, headers=headers).status_code == 200
    assert client.put("/api/auto-pricing/config", json={}, headers=headers).status_code == 400
    assert client.put("/api/auto-pricing/config", json={"upstream": "u", "model_id": "m", "trigger_pct": "x"}, headers=headers).status_code == 400
    assert client.put("/api/auto-pricing/config", json={"upstream": "u", "model_id": "m", "trigger_pct": 0}, headers=headers).status_code == 400
    assert client.delete("/api/auto-pricing/config/3", headers=headers).status_code == 200


def test_auto_pricing_state_and_config_helpers(monkeypatch, tmp_path):
    cur = _Cursor({"auto_pricing_config": [{"upstream": "u", "model_id": "m", "trigger_pct": 5, "rebound_pct": 1}]}, fetchone_rows=[(False,)])
    conn = _Conn(cur)
    monkeypatch.setattr(app_module, "db_connect", lambda: conn)
    monkeypatch.setattr(app_module.os.path, "expanduser", lambda path: str(tmp_path / path.split("/")[-1]))
    import os
    monkeypatch.setattr(os, "fsync", lambda fd: None)
    monkeypatch.setattr(os, "replace", lambda src, dst: None)
    monkeypatch.setattr(app_module, "db_schema", type("Schema", (), {"ensure_schema": staticmethod(lambda cur: None)})(), raising=False)
    result = app_module._set_auto_pricing_state(True, operator="Faiz", correlation_id="cid")
    assert result["armed"] is True and result["operator"] == "Faiz"
    assert app_module._save_auto_pricing_config({"upstream": "u", "model_id": "u/m", "trigger_pct": 4}, conn)["ok"] is True
    monkeypatch.setattr(os, "makedirs", lambda *args, **kwargs: None)
    monkeypatch.setattr(app_module, "open", open, raising=False)
    app_module._sync_ap_config_file(conn)


def test_arm_disarm_and_reliability_stream_contract(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    monkeypatch.setattr(app_module, "_set_auto_pricing_state", lambda armed, **kwargs: {"event_id": "e", "armed": armed})
    assert client.post("/api/auto-pricing/arm", json={"armed": False}, headers=headers).get_json()["armed"] is False
    assert client.post("/api/auto-pricing/arm", json={"armed": 1}, headers=headers).status_code == 400
    monkeypatch.setattr(app_module, "_set_auto_pricing_state", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("x")))
    assert client.post("/api/auto-pricing/arm", json={"armed": True}, headers=headers).status_code == 500
    assert client.post("/api/reliability/arm", json={}, headers=headers).status_code == 500
    assert client.post("/api/reliability/disarm", json={}, headers=headers).status_code == 500
    rows = [{"cursor": 4, "event_id": "e", "event_type": "hold", "severity": "info", "occurred_at": "t", "payload": {}}]
    monkeypatch.setattr(app_module, "_reliability_query", lambda sql, params=(): rows if "reliability_events" in sql else [])
    monkeypatch.setattr(app_module.time, "sleep", lambda _: None)
    sequence = iter([0, 31])
    monkeypatch.setattr(app_module.time, "monotonic", lambda: next(sequence, 31))
    response = client.get("/api/reliability/stream?after=1", headers=headers)
    assert response.status_code == 200


def test_pricing_merge_fallback_and_override_rows(monkeypatch):
    orderbook = {"models": [{"upstreams": [{"slug": "fallback"}, {"slug": "custom"}]}]}
    monkeypatch.setattr(app_module, "_orderbook_payload", lambda: orderbook)
    rows = {"pricing_config_upstream": [{"upstream": "custom", "max_ask_pct": 9, "platform_fee_pct": 2, "publisher_share_pct": 89}], "pricing_config": [{"max_ask_pct": 7, "platform_fee_pct": 3, "publisher_share_pct": 90}], "auto_pricing_config": [{"upstream": "custom", "model_id": "custom/m", "trigger_pct": 5, "rebound_pct": 1, "updated_at": "t"}]}
    _conn(monkeypatch, rows)
    merged = app_module._load_pricing_merged()
    assert merged["globals"]["custom"]["max_ask_pct"] == 9
    assert merged["globals"]["fallback"]["max_ask_pct"] == 7
    assert merged["overrides"]
    rows["pricing_config"] = []
    _conn(monkeypatch, rows)
    merged = app_module._load_pricing_merged()
    assert merged["globals"]["fallback"]["max_ask_pct"] is None


def test_finance_mutation_guard_errors(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    conn, _ = _conn(monkeypatch)
    error = app_module.MutationGuardError("denied", 403)
    monkeypatch.setattr(app_module, "guard_mutation", lambda *args, **kwargs: (_ for _ in ()).throw(error))
    assert client.post("/api/finance/buy", json={"id": "a", "upstream": "u", "cost": 1}, headers=headers).get_json()["error"] == "denied"
    assert client.post("/api/finance/retire", json={"id": "a"}, headers=headers).status_code == 403
    assert client.post("/api/finance/refund", json={"id": "r", "upstream": "u", "amount_usdc": 1}, headers=headers).status_code == 403
    monkeypatch.setattr(app_module, "guard_mutation", lambda *args, **kwargs: (_ for _ in ()).throw(app_module.MutationGuardError("idempotency conflict", 400)))
    assert client.post("/api/finance/refund", json={"id": "r", "upstream": "u", "amount_usdc": 1}, headers=headers).get_json()["error"] == "idempotency conflict"


def test_finance_mutation_executor_errors(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    _conn(monkeypatch)
    monkeypatch.setattr(app_module, "guard_mutation", lambda request, conn, *args, **kwargs: args[2]())
    import ledger_update
    monkeypatch.setattr(ledger_update, "upsert_asset", lambda payload: (_ for _ in ()).throw(RuntimeError("buy failed")))
    with pytest.raises(RuntimeError, match="buy failed"):
        client.post("/api/finance/buy", json={"id": "a", "upstream": "u", "cost": 1}, headers=headers)
    monkeypatch.setattr(ledger_update, "update_asset_status", lambda *args: (_ for _ in ()).throw(RuntimeError("retire failed")))
    with pytest.raises(RuntimeError, match="retire failed"):
        client.post("/api/finance/retire", json={"id": "a"}, headers=headers)


def test_reliability_summary_db_failure_contract(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    monkeypatch.setattr(app_module, "_reliability_query", lambda *args, **kwargs: [])
    payload = client.get("/api/reliability/summary", headers=headers).get_json()
    assert payload["service_status"] == "unknown"
    assert payload["cycle_count"] == 0 and payload["model_count"] == 0


def test_trend_empty_and_range_contracts(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    monkeypatch.setattr(app_module, "_fetch_all_usage", lambda *args, **kwargs: ([], 0))
    assert client.get("/api/earnings-trend?range=7d", headers=headers).get_json()["points"] == []
    now = app_module.datetime.now(app_module.timezone.utc)
    rows = [{"ts": now.isoformat(), "cost_consumer_usdc": 2}, {"ts": "invalid", "cost_consumer_usdc": 4}]
    monkeypatch.setattr(app_module, "_fetch_all_usage", lambda *args, **kwargs: (rows, 2))
    payload = client.get("/api/earnings-trend?range=1h", headers=headers).get_json()
    assert payload["calls"] == 1 and payload["total_cost_consumer"] == 2


def test_credentials_and_route_error_branches(client, monkeypatch):
    with app_module.app.test_request_context("/api/data"):
        assert app_module._read_credentials() == (None, None)
    with app_module.app.test_request_context("/api/data", headers={"X-Auth": "pw"}):
        assert app_module._read_credentials() == ("password", "pw")
    with app_module.app.test_request_context("/api/data", headers={"Authorization": "Bearer tok"}):
        assert app_module._read_credentials() == ("token", "tok")
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    _conn(monkeypatch)
    monkeypatch.setattr(app_module, "inferhub_post", lambda *args, **kwargs: {"id": "k", "prefix": "p", "secret": "s"})
    assert client.post("/api/keys", json={"name": "key"}, headers=headers).status_code == 201
    monkeypatch.setattr(app_module, "db_connect", lambda: (_ for _ in ()).throw(RuntimeError("db")))
    monkeypatch.setattr(app_module, "inferhub_delete", lambda *args: True)
    assert client.delete("/api/keys/k", headers=headers).status_code == 500
    monkeypatch.setattr(app_module, "inferhub_delete", lambda *args: True)
    assert client.delete("/api/combos/c", headers=headers).status_code == 500


def test_trend_cutoff_and_bucket_limit(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}
    now = app_module.datetime.now(app_module.timezone.utc).timestamp()
    rows = [{"ts": app_module.datetime.fromtimestamp(now - i * 60, app_module.timezone.utc).isoformat(), "cost_consumer_usdc": 1} for i in range(400)]
    monkeypatch.setattr(app_module, "_fetch_all_usage", lambda *args, **kwargs: (rows, 400))
    payload = client.get("/api/earnings-trend?range=all", headers=headers).get_json()
    assert payload["candles"] <= app_module.MAX_CANDLES
    old = [{"ts": "2020-01-01T00:00:00Z", "cost_consumer_usdc": 1}]
    monkeypatch.setattr(app_module, "_fetch_all_usage", lambda *args, **kwargs: (old, 1))
    assert client.get("/api/earnings-trend?range=1h", headers=headers).get_json()["points"] == []


def test_initialization_database_helpers(monkeypatch, tmp_path):
    conn, cur = _conn(monkeypatch, {"count(*)": [{"count": 1}], "earning_history": [{"epoch": 1, "ts": "2026-01-01", "publisher_lifetime": 2, "balance": 1}]})
    assert app_module.db_count() == 1
    monkeypatch.setattr(app_module, "db_read_history", lambda: [{"earnings": 2.0}])
    assert app_module.db_read_history()[0]["earnings"] == 2.0
    assert app_module.db_read_ledger() is not None
    assert app_module.db_seed(10) is False
    assert app_module.db_save_model_rank({"rows": [{"model": "m", "requests": 1}]}) == 1
    monkeypatch.setattr(app_module, "db_connect", lambda: (_ for _ in ()).throw(RuntimeError("db")))
    assert app_module.db_count() == -1
    monkeypatch.undo()
    monkeypatch.setattr(app_module, "db_connect", lambda: (_ for _ in ()).throw(RuntimeError("db")))
    assert app_module.db_read_ledger() is None
    assert app_module.db_save_model_rank({"rows": []}) == 0
    app_module.db_insert(1, "t", 1, 1, 0)
    monkeypatch.setattr(app_module, "load_json", lambda *args: {"meta": {"business_start": "invalid"}})
    assert app_module.db_seed(1) is True


def test_auto_pricing_state_file_failure_rolls_back(monkeypatch, tmp_path):
    conn, _ = _conn(monkeypatch, fetchone_rows=[(False,)])
    monkeypatch.setattr(app_module.os.path, "expanduser", lambda path: str(tmp_path / "arm"))
    monkeypatch.setattr(app_module, "os_replace", lambda *args: None, raising=False)
    import os
    monkeypatch.setattr(os, "replace", lambda *args: (_ for _ in ()).throw(OSError("write failed")))
    with pytest.raises(OSError, match="write failed"):
        app_module._set_auto_pricing_state(True, correlation_id="cid")


def test_publisher_and_budget_endpoints(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}

    # 1. usage-windows
    monkeypatch.setattr(app_module, "inferhub_get", lambda path, params=None, timeout=25: {"prov-1": [{"windowKind": "5h"}]} if path == "/publisher/providers/usage-windows" else None)
    r = client.get("/api/publisher/providers/usage-windows", headers=headers)
    assert r.status_code == 200
    assert "prov-1" in r.get_json()

    # usage-windows fallback
    monkeypatch.setattr(app_module, "inferhub_get", lambda *args, **kwargs: None)
    r = client.get("/api/publisher/providers/usage-windows", headers=headers)
    assert r.status_code == 200
    assert r.get_json() == {}

    # 2. earnings transfer
    # invalid amount
    r = client.post("/api/publisher/earnings/transfer", json={"amount": -5}, headers=headers)
    assert r.status_code == 400
    r = client.post("/api/publisher/earnings/transfer", json={"amount": "abc"}, headers=headers)
    assert r.status_code == 400

    # success
    monkeypatch.setattr(app_module, "inferhub_post", lambda path, payload=None, timeout=25: {"ok": True, "transferred": 10.0} if path == "/publisher/earnings/transfer" else None)
    r = client.post("/api/publisher/earnings/transfer", json={"amount": 10.0}, headers=headers)
    assert r.status_code == 200
    assert r.get_json()["ok"] is True

    # 3. budget put with slash model ID
    called_budget = {}
    def mock_inferhub_put(path, payload=None, timeout=25):
        called_budget["path"] = path
        called_budget["payload"] = payload
        return {"ok": True}
    monkeypatch.setattr(app_module, "inferhub_put", mock_inferhub_put)

    r = client.put("/api/budgets/openai/gpt-4o", json={"max_input_per_mtok": 2.5, "max_output_per_mtok": 10.0, "min_discount_pct": 5}, headers=headers)
    assert r.status_code == 200
    assert called_budget["path"] == "/budgets/openai/gpt-4o"
    assert called_budget["payload"]["maxInputPerMtok"] == 2.5

    # 4. withdrawals OTP
    r = client.post("/api/publisher/withdrawals/otp", json={"destination": "0x123", "amount": -1}, headers=headers)
    assert r.status_code == 400
    monkeypatch.setattr(app_module, "inferhub_post", lambda path, payload=None, timeout=25: {"otpRequested": True} if path == "/publisher/withdrawals/otp" else None)
    r = client.post("/api/publisher/withdrawals/otp", json={"destination": "0x123", "amount": 50}, headers=headers)
    assert r.status_code == 200
    assert r.get_json()["otpRequested"] is True

    # 5. withdrawals submission
    r = client.post("/api/publisher/withdrawals", json={"destination": "0x123", "amount": 50}, headers=headers) # missing otp
    assert r.status_code == 400
    monkeypatch.setattr(app_module, "inferhub_post", lambda path, payload=None, timeout=25: {"txHash": "0xabc"} if path == "/publisher/withdrawals" else None)
    r = client.post("/api/publisher/withdrawals", json={"destination": "0x123", "amount": 50, "otp": "123456"}, headers=headers)
    assert r.status_code == 200
    assert r.get_json()["txHash"] == "0xabc"

    # 6. withdrawals destinations
    monkeypatch.setattr(app_module, "inferhub_get", lambda path, params=None, timeout=25: [{"address": "0x123"}] if path == "/publisher/withdrawals/destinations" else None)
    r = client.get("/api/publisher/withdrawals/destinations", headers=headers)
    assert r.status_code == 200
    assert len(r.get_json()) == 1


def test_usage_proxy_routes_query_params_and_fallbacks(client, monkeypatch):
    _auth(monkeypatch)
    headers = {"Authorization": "Bearer fake-token"}

    recorded = []
    def mock_get(path, params=None, timeout=25):
        recorded.append({"path": path, "params": params})
        if path == "/usage/breakdown":
            return {"range": (params or {}).get("range"), "byModel": [{"model": "m1"}], "byProvider": []}
        if path == "/usage/cache-stats":
            return {"range": (params or {}).get("range"), "rows": [{"label": "m1"}], "totals": {"hitRate": 0.85}}
        if path == "/usage/logs":
            return {"range": (params or {}).get("range"), "rows": [{"id": "1"}], "total": 1, "page": int((params or {}).get("page", 1))}
        if path == "/usage/logs/models":
            return [{"value": "m1", "label": "m1"}]
        return None

    monkeypatch.setattr(app_module, "inferhub_get", mock_get)

    # 1. /api/usage/breakdown and /api/breakdown
    r1 = client.get("/api/usage/breakdown?range=30d", headers=headers)
    assert r1.status_code == 200
    assert r1.get_json()["byModel"] == [{"model": "m1"}]
    assert recorded[-1] == {"path": "/usage/breakdown", "params": {"range": "30d"}}

    r1_alias = client.get("/api/breakdown?range=90d", headers=headers)
    assert r1_alias.status_code == 200
    assert recorded[-1] == {"path": "/usage/breakdown", "params": {"range": "90d"}}

    # 2. /api/usage/cache-stats
    r2 = client.get("/api/usage/cache-stats?range=24h", headers=headers)
    assert r2.status_code == 200
    assert r2.get_json()["totals"]["hitRate"] == 0.85
    assert recorded[-1] == {"path": "/usage/cache-stats", "params": {"range": "24h"}}

    # 3. /api/usage/logs with full query params
    r3 = client.get("/api/usage/logs?range=7d&page=2&pageSize=50&model=deepseek&status=ok&sort=cost&dir=asc", headers=headers)
    assert r3.status_code == 200
    assert r3.get_json()["total"] == 1
    assert recorded[-1] == {
        "path": "/usage/logs",
        "params": {
            "range": "7d",
            "page": "2",
            "pageSize": "50",
            "sort": "cost",
            "dir": "asc",
            "model": "deepseek",
            "status": "ok",
        },
    }

    # 4. /api/usage/logs/models and /api/usage/logs-models
    r4 = client.get("/api/usage/logs/models?range=7d", headers=headers)
    assert r4.status_code == 200
    assert len(r4.get_json()) == 1
    assert recorded[-1] == {"path": "/usage/logs/models", "params": {"range": "7d"}}

    r4_alias = client.get("/api/usage/logs-models?range=30d", headers=headers)
    assert r4_alias.status_code == 200
    assert len(r4_alias.get_json()) == 1
    assert recorded[-1] == {"path": "/usage/logs/models", "params": {"range": "30d"}}

    # 5. Dict format in logs/models
    monkeypatch.setattr(app_module, "inferhub_get", lambda path, params=None, timeout=25: {"models": [{"value": "m2"}]})
    r5 = client.get("/api/usage/logs/models", headers=headers)
    assert r5.status_code == 200
    assert r5.get_json() == [{"value": "m2"}]

    # 6. Fallback when upstream is None (dev mode / offline)
    monkeypatch.setattr(app_module, "inferhub_get", lambda *args, **kwargs: None)
    fb_breakdown = client.get("/api/usage/breakdown?range=24h", headers=headers).get_json()
    assert fb_breakdown == {"byModel": [], "byProvider": [], "byProviderModel": [], "range": "24h"}

    fb_cache = client.get("/api/usage/cache-stats?range=90d", headers=headers).get_json()
    assert fb_cache["error"] == "unavailable"
    assert fb_cache["range"] == "90d"
    assert fb_cache["rows"] == []
    assert fb_cache["totals"]["hitRate"] == 0.0

    fb_logs = client.get("/api/usage/logs?range=30d&page=3&pageSize=10", headers=headers).get_json()
    assert fb_logs["error"] == "unavailable"
    assert fb_logs["range"] == "30d"
    assert fb_logs["rows"] == []
    assert fb_logs["total"] == 0
    assert fb_logs["page"] == 3
    assert fb_logs["pageSize"] == 10

    fb_models = client.get("/api/usage/logs/models", headers=headers).get_json()
    assert fb_models == []



