"""Test mutation guard core (Phase 4 C3)."""
import json
import pytest

from mutation_guard import guard_mutation, MutationGuardError


class FakeCur:
    def __init__(self):
        self.executed = []
        self._fetch = None

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        # Replay-row contract: fake cursor mengembalikan dict row replay
        # (bukan tuple) supaya `row["response_json"]` di guard_mutation bekerja.
        if self._fetch is None and self._conn_replay is not None:
            self._fetch = {"response_json": self._conn_replay[1]}

    def fetchone(self):
        return self._fetch


class FakeConn:
    def __init__(self, replay=None):
        self.cur = FakeCur()
        self.replay = replay
        self.cur._conn_replay = replay
        self.committed = False

    def cursor(self):
        return self.cur

    def commit(self):
        self.committed = True


class FakeReq:
    def __init__(self, headers=None):
        self.headers = headers or {}


def test_guard_mutation_replays_idempotent_key():
    conn = FakeConn(replay=("replay-hash", json.dumps({"status": 200, "payload": {"ok": True}})))
    res = guard_mutation(
        FakeReq({"Idempotency-Key": "key-1"}),
        conn, "pricing_config", "update", lambda: (200, {"ok": True}),
        idempotency_key="key-1")
    assert res == (200, {"ok": True})
    assert conn.committed is False  # replay: tidak re-execute


def test_guard_mutation_executes_when_no_replay():
    conn = FakeConn(replay=None)
    res = guard_mutation(
        FakeReq({"Idempotency-Key": "key-2"}),
        conn, "pricing_config", "update", lambda: (200, {"ok": True}),
        idempotency_key="key-2")
    assert res == (200, {"ok": True})
    assert conn.committed is True


def test_guard_mutation_requires_idempotency_key():
    with pytest.raises(MutationGuardError) as e:
        guard_mutation(FakeReq({}), FakeConn(), "x", "y", lambda: (200, {}))
    assert e.value.status_code == 400


def test_guard_mutation_writes_audit():
    conn = FakeConn(replay=None)
    guard_mutation(
        FakeReq({"Idempotency-Key": "key-3", "X-Operator": "Faiz"}),
        conn, "pricing_config", "update", lambda: (200, {"ok": True}),
        idempotency_key="key-3", actor="Faiz", source="dashboard")
    insert = [s for s, p in conn.cur.executed if "INSERT INTO financial_audit" in s]
    assert insert, "audit insert missing"


def test_guard_mutation_menolak_role_tanpa_izin():
    with pytest.raises(MutationGuardError) as e:
        guard_mutation(
            FakeReq({"Idempotency-Key": "key-4", "X-Operator": "Faiz"}),
            FakeConn(), "pricing_config", "update", lambda: (200, {}),
            idempotency_key="key-4", actor="Faiz", actor_role="operator",
            required_roles=["admin"])
    assert e.value.status_code == 403
