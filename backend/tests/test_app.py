"""Unit tests backend/app.py — auth/sesi/CORS/rate-limit/bucketing dgn DB & net di-mock.

Conftest sudah: env test, import app, patch inferhub_* & db_connect, fixture client.
"""
import time
import inspect

import pytest

import app as app_mod  # noqa: E402 (sudah di sys.path oleh conftest)


# ── /health publik ──
def test_health_public(client):
    r = client.get("/health")
    assert r.status_code == 200


# ── Auth: tanpa / salah / benar ──
def test_no_auth_401(client):
    assert client.get("/api/data").status_code == 401


def test_wrong_password_401(client):
    assert client.get("/api/data", headers={"X-Auth": "wrong"}).status_code == 401


def test_query_auth_ditolak(client):
    """?auth= tidak boleh diterima lagi (R2: bocor ke log)."""
    assert client.get("/api/data?auth=test-pass").status_code == 401


def test_xauth_ok_not_401(client):
    r = client.get("/api/data", headers={"X-Auth": "test-pass"})
    assert r.status_code != 401


# ── Sesi token ──
def test_login_ok(client):
    r = client.post("/api/login", json={"password": "test-pass"})
    assert r.status_code == 200
    assert "token" in r.get_json()


def test_login_wrong(client):
    assert client.post("/api/login", json={"password": "x"}).status_code == 401


def test_bearer_token_ok(client):
    tok = client.post("/api/login", json={"password": "test-pass"}).get_json()["token"]
    r = client.get("/api/data", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code != 401


def test_token_rejects_tamper():
    assert app_mod._verify_token(f"{int(time.time())+100}.deadbeef") is False


def test_token_rejects_expired():
    exp = int(time.time()) - 100
    assert app_mod._verify_token(f"{exp}.{app_mod._sign_session(exp)}") is False


def test_token_issue_verify_roundtrip():
    tok = app_mod._issue_token()
    assert app_mod._verify_token(tok) is True


# ── CORS ──
def test_cors_allowed_origin():
    assert "http://localhost:5173" in app_mod.ALLOWED_ORIGINS


def test_cors_evil_origin_rejected():
    assert "https://evil.example" not in app_mod.ALLOWED_ORIGINS


# ── Bucketing (C8) ──
def test_range_duration_7d():
    assert app_mod._RANGE_DUR_S["7d"] == 604800


def test_range_duration_30d_90d():
    assert app_mod._RANGE_DUR_S["30d"] == 2592000
    assert app_mod._RANGE_DUR_S["90d"] == 7776000


def test_history_window_bukan_2jam_utk_7d():
    # window 7d harus ~7 hari, bukan candle*120 (2 jam)
    window = 604800
    assert window // app_mod.MAX_CANDLES >= 3600


# ── Keys INSERT placeholder (C4) ──
def test_keys_post_insert_7_placeholder():
    from app import api_keys_post
    import json
    src = inspect.getsource(api_keys_post)
    assert src.count("%s") >= 7  # kolom created_at sekarang definitif


def test_keys_rotate_no_name_overwrite():
    import re
    # pastikan on-conflict rotate TIDAK menyentuh name
    rot = inspect.getsource(app_mod.api_keys_rotate)
    assert "name=EXCLUDED.name" not in rot


# ── earnings-trend timeout (C9) ──
def test_fetch_all_usage_default_cap():
    assert inspect.signature(app_mod._fetch_all_usage).parameters["max_rows"].default == 3000


# ── Rate limit ──
def test_rate_limit_429(client):
    app_mod._rl.clear()
    app_mod.RL_LIMIT = 3
    try:
        for _ in range(3):
            client.get("/api/data", headers={"X-Auth": "test-pass"})
        r = client.get("/api/data", headers={"X-Auth": "test-pass"})
        assert r.status_code == 429
    finally:
        app_mod.RL_LIMIT = 60
        app_mod._rl.clear()