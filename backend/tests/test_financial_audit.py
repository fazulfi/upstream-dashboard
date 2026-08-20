"""Test tabel financial_audit + helper audit_write."""
import json

from db_schema import ensure_schema
from financial_audit import audit_write


class FakeCur:
    def __init__(self):
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql, params=None):
        self.executed.append((sql, params))


class FakeConn:
    def __init__(self):
        self.cur = FakeCur()

    def cursor(self):
        return self.cur

    def commit(self):
        pass


def test_ensure_schema_membuat_financial_audit():
    cur = FakeCur()
    ensure_schema(cur)
    ddl = "\n".join(s for s, _ in cur.executed)
    assert "CREATE TABLE IF NOT EXISTS financial_audit" in ddl
    assert "entity TEXT" in ddl
    assert "before JSONB" in ddl
    assert "after JSONB" in ddl


def test_audit_write_insert():
    conn = FakeConn()
    audit_write(conn, "assets", "A-001", "add-asset", "operator-test", "cli",
                {"status": None}, {"status": "active"})
    sql, params = conn.cur.executed[-1]
    assert sql.strip().lower().startswith("insert into financial_audit")
    assert params[2] == "add-asset"
    assert json.loads(params[6]) == {"status": "active"}
