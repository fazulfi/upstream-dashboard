"""Test payout sync tanpa UUID fallback (P4-Q9)."""
import app as app_module


def test_payout_sync_skip_kosong_id(monkeypatch):
    events = []

    def fake_audit(conn, entity, entity_id, action, actor, source, before, after):
        events.append((entity, entity_id, action))

    class FakePayoutConn:
        def __init__(self):
            self.commits = 0
            self.closed = False

        def cursor(self):
            return self

        def execute(self, sql, params=None):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def commit(self):
            self.commits += 1

        def close(self):
            self.closed = True

    def fake_db_connect():
        return FakePayoutConn()

    monkeypatch.setattr(app_module, "audit_write", fake_audit)
    monkeypatch.setattr(app_module, "db_connect", fake_db_connect)
    skipped = app_module._sync_payouts_rows(
        [{"id": None, "amount_usdc": 5.0, "status": "confirmed", "date": "2026-08-20"}],
        conn=None)
    assert skipped == 1
    assert any(a == "sync-payouts-skip" for _, _, a in events)
