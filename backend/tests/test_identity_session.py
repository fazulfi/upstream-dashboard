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


def test_login_ignore_client_role_selalu_admin(monkeypatch):
    """Keamanan: role dari body login TIDAK dipercaya (single password = admin semua,
    keputusan owner). Klien mengirim role='operator' → server tetap admin."""
    captured = {}

    def fake_issue_token(name, role):
        captured["name"] = name
        captured["role"] = role
        return "token-abc"

    monkeypatch.setattr(app_module, "issue_token", fake_issue_token)
    app_module._handle_login({"password": app_module.DASHBOARD_PASSWORD, "operator_name": "Eve", "role": "operator"}, captured)
    assert captured["name"] == "Eve"
    assert captured["role"] == "admin"


def test_login_sanitize_operator_name(monkeypatch):
    """operator_name dipakai sebagai label audit — di-sanitize (strip + batas 64)."""
    captured = {}

    def fake_issue_token(name, role):
        captured["name"] = name
        return "token-abc"

    monkeypatch.setattr(app_module, "issue_token", fake_issue_token)
    app_module._handle_login({"password": app_module.DASHBOARD_PASSWORD, "operator_name": "   "}, captured)
    assert captured["name"] == "operator"

    app_module._handle_login({"password": app_module.DASHBOARD_PASSWORD,
                              "operator_name": "x" * 100}, captured)
    assert len(captured["name"]) <= 64
