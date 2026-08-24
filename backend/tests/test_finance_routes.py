"""Test route /api/finance + db_read_finance (mock db_connect)."""
from unittest.mock import MagicMock

import pytest

import app as app_module


def _rows(seq):
    """Kembalikan list dict nyata (bukan MagicMock) — db_read_finance memakai
    dict(r); MagicMock tidak punya keys()/__iter__ nyata → dict(r) = {}."""
    return [dict(r) for r in seq]


@pytest.fixture
def fake_finance_db(monkeypatch):
    """Mock db_connect agar db_read_finance memakai data sintetis."""
    def _make(**over):
        data = {
            "meta": [{"v": "17000.0"}],
            "assets": [{"id": "A-001", "upstream": "clinepass", "qty": 1, "label": "a1",
                        "buy": "2026-08-01", "lifespan_d": 30, "cost_per": 10.0,
                        "curr": "USD", "status": "retired", "kurs_idr_usd": None},
                       {"id": "A-002", "upstream": "clinepass", "qty": 1, "label": "a2",
                        "buy": "2026-08-01", "lifespan_d": 30, "cost_per": 5.0,
                        "curr": "USD", "status": "active", "kurs_idr_usd": None}],
            "providers": [{"upstream_slug": "cline-pass", "n": 2}],
            "impairments": [{"id": "I-1", "upstream": "codebuddy", "qty": 1,
                             "loss": 17000.0, "label": "", "date": "2026-08-01"}],
            "payouts": [{"id": "P-1", "date": "2026-08-01", "amount_usdc": 100.0,
                         "status": "confirmed", "destination": "x"}],
            "refunds": [{"id": "R-1", "upstream": "x", "qty": 1, "amount_idr": 0,
                         "amount_usdc": 2.0, "label": "", "kurs_idr_usd": None}],
        }
        data.update(over)

        class FakeConn:
            def __init__(self):
                self.cursor = MagicMock()

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        class FakeCur:
            def __init__(self):
                self.results = {}

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def execute(self, sql, *args):
                for key in self.results:
                    if key in sql.lower() or key in sql:
                        self._cur = iter(_rows(self.results[key]))
                        break

            def fetchall(self):
                return list(self._cur) if hasattr(self, "_cur") else []

            def fetchone(self):
                if not hasattr(self, "_cur"):
                    return None
                try:
                    return next(self._cur)
                except StopIteration:
                    return None

        cur = FakeCur()
        cur.results = data
        conn = FakeConn()
        conn.cursor.return_value = cur
        monkeypatch.setattr(app_module, "db_connect", lambda: conn)
        return data

    return _make


def test_db_read_finance_amort_retired_dihitung(fake_finance_db):
    fake_finance_db()
    res = app_module.db_read_finance()
    assert res["amort_usd"] == 10.0
    assert res["total_payout"] == 100.0
    assert res["total_refund_usd"] == 2.0
    assert res["total_imp_loss_usd"] == 1.0
    assert res["net_income"] == round(100 + 2 - 10 - 1 - 0.10, 2)
