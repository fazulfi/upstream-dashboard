"""Test fail-closed config writes via mutation guard (P4-Q6)."""
import app as app_module


class FakeConn:
    """Context manager koneksi in-memory: commit dicatat, query tidak dieksekusi."""

    def __init__(self):
        self.commits = 0
        self.closed = False

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.commits = 0

    def close(self):
        self.closed = True

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql, params=None):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_config_put_fail_closed_saat_publish_gagal(auth_client, monkeypatch):
    """Publish gagal → SATU transaksi (conn route) tidak di-commit → 500 + error 'file'."""

    def fake_sync(cfg):
        raise RuntimeError("file publish failed")

    state = {"conns": []}

    def fake_db_connect():
        c = FakeConn()
        state["conns"].append(c)
        return c

    def fake_guard(req, conn, entity, action, executor, **kw):
        try:
            return executor()
        except RuntimeError:
            conn.rollback()
            return 500, {"error": "config publish failed: file publish failed"}

    monkeypatch.setattr(app_module, "_sync_ap_config_file", fake_sync)
    monkeypatch.setattr(app_module, "db_connect", fake_db_connect)
    monkeypatch.setattr(app_module, "guard_mutation", fake_guard)
    r = auth_client.put(
        "/api/auto-pricing/config",
        json={"upstream": "clinepass", "model_id": "m1", "trigger_pct": 0.1},
        headers={"Idempotency-Key": "cfg-1"})
    assert r.status_code == 500
    assert "file" in r.get_json()["error"]
    assert state["conns"], "route tidak membuat koneksi db_connect"
    assert all(c.commits == 0 for c in state["conns"])
    assert all(c.closed for c in state["conns"])
