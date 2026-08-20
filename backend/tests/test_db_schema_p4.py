"""Test additive schema Phase 4: mutation_replay + operator_session."""
import pytest
from db_schema import ensure_schema


class FakeCur:
    def __init__(self):
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))


def test_ensure_schema_membuat_mutation_replay():
    cur = FakeCur()
    ensure_schema(cur)
    ddl = "\n".join(s for s, _ in cur.executed)
    assert "CREATE TABLE IF NOT EXISTS mutation_replay" in ddl
    assert "key TEXT" in ddl
    assert "response_json JSONB" in ddl


def test_ensure_schema_membuat_operator_session():
    cur = FakeCur()
    ensure_schema(cur)
    ddl = "\n".join(s for s, _ in cur.executed)
    assert "CREATE TABLE IF NOT EXISTS operator_session" in ddl
    assert "operator_name TEXT" in ddl
    assert "role TEXT" in ddl


def test_ensure_schema_membuat_pricing_config_upstream():
    cur = FakeCur()
    ensure_schema(cur)
    ddl = "\n".join(s for s, _ in cur.executed)
    assert "CREATE TABLE IF NOT EXISTS pricing_config_upstream" in ddl
    assert "upstream TEXT" in ddl
    assert "max_ask_pct DOUBLE PRECISION" in ddl
