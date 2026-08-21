"""Test additive schema Phase 4: mutation_replay + operator_session."""
import pytest
from db_schema import ensure_schema


class FakeCur:
    def __init__(self, col_exists=True):
        self.executed = []
        self.col_exists = col_exists

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchone(self):
        return (1,) if self.col_exists else None


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


def test_ensure_schema_migrasi_kolom_baru_matikan_6_non_scope():
    """K-016 prod: kolom auto_pricing_enabled BARU ditambahkan (11 row sudah ada,
    semuanya DEFAULT TRUE) -> UPDATE satu-kali harus mematikan 6 non-scope."""
    cur = FakeCur(col_exists=False)
    ensure_schema(cur)
    updates = [s for s, _ in cur.executed if s.strip().upper().startswith("UPDATE")]
    assert len(updates) == 1
    assert "claude-code" in updates[0] and "z-ai" in updates[0]
    assert "codebuddy" not in updates[0]


def test_ensure_schema_kolom_sudah_ada_tidak_update():
    """Kolom sudah ada (run berikutnya / toggle manual sudah mungkin terjadi):
    TIDAK ada UPDATE — toggle manual tidak pernah di-revert."""
    cur = FakeCur(col_exists=True)
    ensure_schema(cur)
    updates = [s for s, _ in cur.executed if s.strip().upper().startswith("UPDATE")]
    assert updates == []
