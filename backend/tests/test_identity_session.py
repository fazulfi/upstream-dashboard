"""Test operator identity/role di session (P4-Q4)."""
import app as app_module


def test_login_menerima_operator_name_dan_role(monkeypatch):
    captured = {}

    def fake_issue_token(name, role):
        captured["name"] = name
        captured["role"] = role
        return "token-abc"

    monkeypatch.setattr(app_module, "issue_token", fake_issue_token)
    app_module._handle_login({"password": app_module.DASHBOARD_PASSWORD, "operator_name": "Faiz", "role": "admin"}, captured)
    assert captured["name"] == "Faiz"
    assert captured["role"] == "admin"
