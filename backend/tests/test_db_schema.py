import re
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import db_schema


class RecordingCursor:
    def __init__(self):
        self.statements = []

    def execute(self, sql, params=None):
        self.statements.append(" ".join(sql.split()))


def test_reliability_schema_is_additive_and_idempotent_contract():
    cur = RecordingCursor()
    db_schema.ensure_schema(cur)
    sql = "\n".join(cur.statements)

    assert "CREATE TABLE IF NOT EXISTS refunds" in sql
    assert sql.index("CREATE TABLE IF NOT EXISTS refunds") < sql.index("ALTER TABLE refunds ADD COLUMN")
    assert "CREATE TABLE IF NOT EXISTS reliability_cycles" in sql
    assert "CREATE TABLE IF NOT EXISTS reliability_events" in sql
    assert "CREATE TABLE IF NOT EXISTS reliability_aggregates" in sql
    assert "cycle_id UUID PRIMARY KEY" in sql
    assert "event_id UUID PRIMARY KEY" in sql
    assert "gen_random_uuid()" in sql
    assert "CREATE TABLE IF NOT EXISTS auto_pricing_control" in sql
    assert "CREATE TABLE IF NOT EXISTS auto_pricing_control_audit" in sql
    assert "UNIQUE(cycle_id, event_type)" not in sql
    assert "idx_reliability_cycles_started" in sql
    assert "idx_reliability_events_cycle" in sql
    assert "idx_reliability_aggregates_bucket" in sql
    assert not re.search(r"\b(DROP|TRUNCATE|DELETE|ALTER TABLE .*DROP)\b", sql, re.I)


def test_finance_table_alters_follow_fresh_table_creation():
    cur = RecordingCursor()
    db_schema.ensure_schema(cur)
    sql = "\\n".join(cur.statements)

    assert sql.index("CREATE TABLE IF NOT EXISTS impairments") < sql.index(
        "ALTER TABLE impairments ADD COLUMN"
    )
    assert sql.index("CREATE TABLE IF NOT EXISTS payouts") < sql.index(
        "ALTER TABLE payouts ADD COLUMN"
    )


def test_reliability_schema_converges_on_repeated_invocation():
    first = RecordingCursor()
    second = RecordingCursor()
    db_schema.ensure_schema(first)
    db_schema.ensure_schema(second)

    assert first.statements == second.statements


def test_existing_rev13_schema_remains_present():
    cur = RecordingCursor()
    db_schema.ensure_schema(cur)
    sql = "\n".join(cur.statements)

    assert "CREATE TABLE IF NOT EXISTS auto_pricing_ops" in sql
    assert "CREATE TABLE IF NOT EXISTS auto_pricing_state" in sql
    assert "CREATE TABLE IF NOT EXISTS auto_pricing_api_log" in sql
    assert "idx_ap_ops_ts" in sql
    assert "idx_ap_ops_model" in sql
    assert "idx_ap_api_ts" in sql


def test_daemon_uses_canonical_schema_path():
    import sys

    sys.path.insert(0, str(Path(__file__).parents[2]))
    import scripts.auto_pricing as daemon

    conn = MagicMock()
    conn.__enter__.return_value = conn
    cur = conn.cursor.return_value.__enter__.return_value
    psycopg_mock = MagicMock()
    psycopg_mock.connect.return_value = conn
    with patch.object(daemon, "psycopg", psycopg_mock), patch.object(
        daemon, "DB_DSN", "dsn"
    ), patch("db_schema.ensure_schema") as ensure:
        daemon._db_ensure_schema()

    ensure.assert_called_once_with(cur)
    conn.commit.assert_called_once()
