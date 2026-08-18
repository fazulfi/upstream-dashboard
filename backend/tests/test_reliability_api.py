import pytest


def test_reliability_routes_require_auth(client):
    for path in ("/api/reliability/summary", "/api/reliability/cycles", "/api/reliability/events", "/api/reliability/models", "/api/reliability/stream"):
        assert client.get(path).status_code == 401


def test_reliability_limit_is_bounded(client, auth_headers, monkeypatch):
    monkeypatch.setattr("app._reliability_query", lambda sql, params=(): [])
    response = client.get("/api/reliability/cycles?limit=999999", headers=auth_headers)
    assert response.status_code == 200
    assert response.json["limit"] == 200


def test_events_use_monotonic_cursor(client, auth_headers, monkeypatch):
    queries = []
    monkeypatch.setattr("app._reliability_query", lambda sql, params=(): (queries.append((sql, params)) or []))
    response = client.get("/api/reliability/events?after=12", headers=auth_headers)
    assert response.status_code == 200
    assert "cursor >" in queries[0][0]
    assert queries[0][1] == ("12", 100)


def test_rest_envelopes_include_data_and_cursor_meta(client, auth_headers, monkeypatch):
    monkeypatch.setattr("app._reliability_query", lambda sql, params=(): [])
    assert client.get("/api/reliability/summary", headers=auth_headers).json["meta"]["cursor"] is None
    assert client.get("/api/reliability/events", headers=auth_headers).json["data"] == []


def test_arm_requires_strict_boolean_and_hides_path(client, auth_headers, monkeypatch):
    assert client.post("/api/auto-pricing/arm", json={"armed": 1}, headers=auth_headers).status_code == 400
    monkeypatch.setattr("app._set_auto_pricing_state", lambda armed, **kwargs: {"event_id": "event-1", "armed": armed})
    response = client.post("/api/reliability/arm", json={"reason": "test"}, headers=auth_headers)
    assert response.status_code == 200
    assert "file" not in response.json
    assert response.json["event_id"] == "event-1"


def test_stream_rejects_invalid_cursor(client, auth_headers):
    response = client.get("/api/reliability/stream?after=not-a-cursor", headers=auth_headers)
    assert response.status_code == 400


def test_stream_accepts_last_event_id(client, auth_headers, monkeypatch):
    monkeypatch.setattr("app._reliability_query", lambda sql, params=(): [])
    response = client.get("/api/reliability/stream?interval=10", headers={**auth_headers, "Last-Event-ID": "1"})
    assert response.status_code == 200
    assert response.mimetype == "text/event-stream"
    assert b"\\\\n" not in response.data
    assert b": keepalive\n\n" in response.data
