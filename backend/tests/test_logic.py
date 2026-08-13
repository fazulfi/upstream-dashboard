"""Unit test backend/logic.py — pure functions, coverage tinggi tanpa DB/network."""
import time

import pytest

import logic


# ── Auth / sesi ──
def test_sign_session_deterministic():
    a = logic.sign_session(1000, "pw")
    b = logic.sign_session(1000, "pw")
    assert a == b and len(a) == 64


def test_issue_token_format():
    tok = logic.issue_token("pw", 3600, now=1000)
    exp, sig = tok.split(".")
    assert int(exp) == 4600
    assert sig == logic.sign_session(4600, "pw")


def test_verify_token_valid():
    tok = logic.issue_token("pw", 3600, now=1000)
    assert logic.verify_token(tok, "pw", now=2000) is True


def test_verify_token_expired():
    tok = logic.issue_token("pw", 3600, now=1000)
    assert logic.verify_token(tok, "pw", now=5000) is False  # exp 4600 < 5000


def test_verify_token_tampered():
    exp = int(time.time()) + 100
    assert logic.verify_token(f"{exp}.deadbeef", "pw") is False


def test_verify_token_wrong_password():
    tok = logic.issue_token("pwA", 3600, now=1000)
    assert logic.verify_token(tok, "pwB", now=1000) is False


def test_verify_token_garbage():
    assert logic.verify_token("not-a-token", "pw") is False
    assert logic.verify_token("", "pw") is False


def test_constant_time_eq():
    assert logic.constant_time_eq("abc", "abc") is True
    assert logic.constant_time_eq("abc", "abd") is False
    assert logic.constant_time_eq(None, "") is True


# ── Rate limit ──
def test_rate_limit_allows_under_limit():
    store = {}
    for _ in range(3):
        assert logic.rate_limit_hit(store, "1.2.3.4", limit=5, window=60, now=0) is True
    assert len(store["1.2.3.4"]) == 3


def test_rate_limit_blocks_at_limit():
    store = {}
    for _ in range(5):
        logic.rate_limit_hit(store, "ip", limit=5, window=60, now=0)
    assert logic.rate_limit_hit(store, "ip", limit=5, window=60, now=0) is False


def test_rate_limit_expires_old():
    store = {}
    for _ in range(5):
        logic.rate_limit_hit(store, "ip", limit=5, window=60, now=0)
    # semua entry lama > window → reset
    assert logic.rate_limit_hit(store, "ip", limit=5, window=60, now=61) is True


def test_rate_limit_per_ip():
    store = {}
    for _ in range(5):
        logic.rate_limit_hit(store, "a", limit=5, window=60, now=0)
    assert logic.rate_limit_hit(store, "b", limit=5, window=60, now=0) is True


# ── Bucketing (C8) ──
def test_pick_window_all():
    c, w, cutoff = logic.pick_window("all", data_span=86400 * 10)
    assert w == 86400 * 10
    assert cutoff == 0.0
    assert c >= 60


def test_pick_window_7d_is_7d():
    c, w, cutoff = logic.pick_window("7d", data_span=86400 * 100)
    assert w == 604800
    assert c >= 3600  # bukan 60s (2 jam)


def test_pick_window_90d():
    _, w, _ = logic.pick_window("90d", data_span=86400 * 200)
    assert w == 7776000


def test_pick_window_clamps_to_data():
    _, w, _ = logic.pick_window("30d", data_span=3600)
    assert w == 3600  # data lebih pendek dari range


def test_bucket_points_sums():
    pts = [(1000, 1.0), (1000, 2.0), (2000, 3.0)]
    out = logic.bucket_points(pts, candle_s=1000)
    assert out == [(0, 3.0), (1000, 3.0)]


def test_bucket_points_cap():
    pts = [(i * 100, 1.0) for i in range(200)]
    out = logic.bucket_points(pts, candle_s=100, max_candles=50)
    assert len(out) == 50


# ── Pricing ──
def test_pct_off():
    assert logic.pct_off(0.07, 0.14) == 50.0
    assert logic.pct_off(0.1, 0.14) == pytest.approx(28.6)
    assert logic.pct_off(0.001, 0.14) == 99.3  # clamp bawah


def test_pct_off_official_zero():
    assert logic.pct_off(0.07, 0) is None
    assert logic.pct_off(0.07, None) is None


def test_undercut_target():
    t = logic.undercut_target(ref_price=0.07, official=0.14, trigger_px=0.01)
    assert t == pytest.approx(0.06986)
    # clamp bawah trigger
    t2 = logic.undercut_target(ref_price=0.03, official=0.14, trigger_px=0.02)
    assert t2 == 0.02
    # clamp atas max_in
    t3 = logic.undercut_target(ref_price=0.07, official=0.14, trigger_px=0.01, max_in=0.06)
    assert t3 == 0.06


# ── Sanitize SVG ──
def test_sanitize_strips_script():
    out = logic.sanitize_svg('<svg><script>alert(1)</script><rect/></svg>')
    assert "<script" not in out and "<svg>" in out


def test_sanitize_strips_onload():
    assert "onload" not in logic.sanitize_svg('<svg onload="alert(1)"><circle/></svg>')


def test_sanitize_strips_javascript_uri():
    assert "javascript:" not in logic.sanitize_svg('<a href="javascript:alert(1)">x</a>')


def test_sanitize_strips_comments():
    assert "<!--" not in logic.sanitize_svg('<svg><!-- hi --><rect/></svg>')


def test_sanitize_keeps_safe():
    safe = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10"/></svg>'
    assert logic.sanitize_svg(safe) == safe


def test_sanitize_none():
    assert logic.sanitize_svg(None) == ""


# ── Format ──
def test_fmt_usd():
    assert logic.fmt_usd(5) == "$5.00"
    assert logic.fmt_usd(None) == "$0.00"
    assert logic.fmt_usd(1234.5) == "$1,234.50"


def test_fmt_idr():
    assert logic.fmt_idr(1, 17831.73) == "Rp 17.832"
    assert logic.fmt_idr(5, None) == ""
    assert logic.fmt_idr(None, 17831) == ""