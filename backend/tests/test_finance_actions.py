import app as app_module


def test_finance_buy_lewat_guard(auth_client, monkeypatch):
    called = {}

    def fake_guard(req, conn, entity, action, executor, **kw):
        called["action"] = action
        return 200, {"ok": True, "id": "A-073"}

    monkeypatch.setattr(app_module, "guard_mutation", fake_guard)
    r = auth_client.post(
        "/api/finance/buy",
        json={"id": "A-073", "upstream": "x", "qty": 1, "cost": 5.0},
        headers={"Idempotency-Key": "k-1"},
    )
    assert r.status_code == 200
    assert called["action"] == "finance-buy"


def test_finance_retire_lewat_guard(auth_client, monkeypatch):
    called = {}

    def fake_guard(req, conn, entity, action, executor, **kw):
        called["action"] = action
        return 200, {"ok": True, "id": "A-073", "status": "retired"}

    monkeypatch.setattr(app_module, "guard_mutation", fake_guard)
    r = auth_client.post(
        "/api/finance/retire",
        json={"id": "A-073", "label": "mati/expired"},
        headers={"Idempotency-Key": "k-2"},
    )
    assert r.status_code == 200
    assert called["action"] == "finance-retire"


def test_finance_refund_lewat_guard(auth_client, monkeypatch):
    called = {}

    def fake_guard(req, conn, entity, action, executor, **kw):
        called["action"] = action
        return 200, {"ok": True, "id": "R-1", "upstream": "x", "amount_usdc": 2.0}

    monkeypatch.setattr(app_module, "guard_mutation", fake_guard)
    r = auth_client.post(
        "/api/finance/refund",
        json={"id": "R-1", "upstream": "x", "amount_usdc": 2.0},
        headers={"Idempotency-Key": "k-3"},
    )
    assert r.status_code == 200
    assert called["action"] == "finance-refund"
