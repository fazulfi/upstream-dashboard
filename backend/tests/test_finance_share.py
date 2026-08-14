"""Unit test backend/finance_share.py — publisher share dari DB (R15).

Tanpa Postgres: helper pakai cursor mock. Verifikasi:
- fallback default 0.80 saat tabel kosong/error
- konversi integer 80 (DB) -> 0.80 (float)
- cache per-proses + invalidate
"""
from unittest import mock

import finance_share


def _reset():
    finance_share._CACHE = None


def _cur_with_rows(rows):
    """cursor mock yg return rows utk fetchall()."""
    cur = mock.MagicMock()
    cur.fetchall.return_value = rows
    return cur


def test_default_fallback_when_empty():
    _reset()
    # tabel kosong -> fetchall() -> [] -> default 0.80
    cur = _cur_with_rows([])
    assert finance_share.publisher_share_pct(cur) == 0.80


def test_default_fallback_on_error():
    _reset()
    cur = mock.MagicMock()
    cur.execute.side_effect = Exception("db down")
    assert finance_share.publisher_share_pct(cur) == 0.80


def test_converts_integer_80_to_float():
    _reset()
    # DB simpan integer 80 (bukan 0.80) -> helper return 0.80
    cur = _cur_with_rows([{"publisher_share_pct": 80}])
    assert finance_share.publisher_share_pct(cur) == 0.80


def test_custom_share_converted():
    _reset()
    cur = _cur_with_rows([{"publisher_share_pct": 75}])
    assert finance_share.publisher_share_pct(cur) == 0.75


def test_cache_per_process():
    _reset()
    cur = _cur_with_rows([{"publisher_share_pct": 80}])
    assert finance_share.publisher_share_pct(cur) == 0.80
    # panggil kedua tanpa execute (cache) — kalau execute dipanggil lagi = cache bocor
    finance_share.publisher_share_pct(cur)
    assert cur.execute.call_count == 1


def test_invalidate_clears_cache():
    _reset()
    cur1 = _cur_with_rows([{"publisher_share_pct": 80}])
    assert finance_share.publisher_share_pct(cur1) == 0.80
    finance_share.invalidate_publisher_share()
    cur2 = _cur_with_rows([{"publisher_share_pct": 90}])
    assert finance_share.publisher_share_pct(cur2) == 0.90
