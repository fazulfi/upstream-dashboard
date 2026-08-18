"""Unit tests backend/app.py — auth/sesi/CORS/rate-limit/bucketing dgn DB & net di-mock.

Conftest sudah: env test, import app, patch inferhub_* & db_connect, fixture client.
"""
import time
import inspect
from unittest import mock

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
    r = client.get("/api/data", headers={"X-Auth": "test-password-strong"})
    assert r.status_code != 401


# ── Sesi token ──
def test_login_ok(client):
    r = client.post("/api/login", json={"password": "test-password-strong"})
    assert r.status_code == 200
    assert "token" in r.get_json()


def test_login_wrong(client):
    assert client.post("/api/login", json={"password": "x"}).status_code == 401


def test_bearer_token_ok(client):
    tok = client.post("/api/login", json={"password": "test-password-strong"}).get_json()["token"]
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
            client.get("/api/data", headers={"X-Auth": "test-password-strong"})
        r = client.get("/api/data", headers={"X-Auth": "test-password-strong"})
        assert r.status_code == 429
    finally:
        app_mod.RL_LIMIT = 60
        app_mod._rl.clear()


# ── /api/orderbook — Asks-to-daemon parity (2026-08-16) ──
# Root cause: `/api/orderbook` menampilkan SEMUA `/catalog` asksIn termasuk ask dari
# slug upstream MILIK KITA; daemon `get_positions()` (scripts/auto_pricing.py) meng-EXCLUDE
# semua slug milik kita (`my_slugs` dari /publisher/providers enabled). Model non-GLM
# (mis. DeepSeek V4 Flash) yang semua ask-nya dari upstream kita (ClinePass) tampil penuh
# di halaman Asks, tapi daemon mengeluarkan levels=[] -> competitor_price=None -> dash.
# PARITY FIX: `/api/orderbook` menghitung `my_slugs` yang sama, menandai `is_ours` per
# upstream, dan menghitung min_ask/max_ask/spread hanya dari level kompetitor SEJATI.

_CATALOG_DSV = [
    {"slug": "codebuddy", "label": "CodeBuddy", "activeProviders": 2, "models": [
        {"id": "cid-cb", "upstreamModelId": "deepseek-v4-flash", "label": "DeepSeek V4 Flash",
         "officialIn": 0.8, "asksIn": [0.0220]}]},
    {"slug": "cline-pass", "label": "ClinePass", "activeProviders": 3, "models": [
        {"id": "cid-cp", "upstreamModelId": "cline-pass/deepseek-v4-flash", "label": "DeepSeek V4 Flash",
         "officialIn": 0.8, "asksIn": [0.0220, 0.1098, 0.1100]}]},
    {"slug": "z-ai", "label": "Z AI", "activeProviders": 1, "models": [
        {"id": "cid-z", "upstreamModelId": "z-ai/deepseek-v4-flash", "label": "DeepSeek V4 Flash",
         "officialIn": 0.8, "asksIn": [0.05]}]},
]

_PROVIDERS_OURS = [
    {"id": "p1", "upstreamSlug": "codebuddy", "enabled": True},
    {"id": "p2", "upstreamSlug": "cline-pass", "enabled": True},
]

_ASKS_SAMPLE = [
    {"upstreamCatalogModelId": "cid-cb", "upstreamModelId": "deepseek-v4-flash",
     "askInputPerMtok": 0.022, "askOutputPerMtok": 0.022, "enabled": True},
]


def _orderbook_json(client, catalog=None, providers=None, asks=None):
    def _fake_get(path, params=None, timeout=25):
        if path == "/catalog":
            return catalog if catalog is not None else _CATALOG_DSV
        if path == "/publisher/providers":
            return providers if providers is not None else _PROVIDERS_OURS
        if path.startswith("/publisher/providers/"):
            return asks if asks is not None else _ASKS_SAMPLE
        return None

    with mock.patch.object(app_mod, "inferhub_get", side_effect=_fake_get):
        r = client.get("/api/orderbook", headers={"X-Auth": "test-password-strong"})
    assert r.status_code == 200
    return r.get_json()


def test_orderbook_excludes_own_slugs_from_genuine_min_ask(client):
    """PARITY: own ask (codebuddy) + ClinePass (milik kita) + kompetitor sejati
    (z-ai @0.05). min_ask model HARUS 0.05 (kompetitor sejati), BUKAN 0.022
    (ask ClinePass/codebuddy milik kita). Saat ini api_orderbook menampilkan SEMUA
    ask -> min_ask 0.022 -> FAIL."""
    data = _orderbook_json(client)
    by_mid = {m["model_id"].split("/")[-1].lower(): m for m in data["models"]}
    mo = by_mid["deepseek-v4-flash"]
    assert mo["min_ask"] == 0.05
    assert mo["max_ask"] == 0.05
    up = {u["slug"]: u for u in mo["upstreams"]}
    assert up["codebuddy"]["is_ours"] is True
    assert up["cline-pass"]["is_ours"] is True
    assert up["z-ai"]["is_ours"] is False


def test_orderbook_all_ours_has_no_genuine_min_ask(client):
    """PARITY: model yang SEMUA ask-nya dari slug milik kita (ClinePass @.0220/.1098/
    .1100, codebuddy @.0220 — tanpa kompetitor sejati) harus min_ask=None — konsisten
    dgn daemon get_positions() yang mengeluarkan levels=[] / competitor dash. Saat ini
    min_ask 0.022 (ask kita sendiri ditampilkan sbg market) -> FAIL."""
    catalog = [
        {"slug": "codebuddy", "label": "CodeBuddy", "activeProviders": 2, "models": [
            {"id": "cid-cb", "upstreamModelId": "deepseek-v4-flash", "label": "DeepSeek V4 Flash",
             "officialIn": 0.8, "asksIn": [0.0220]}]},
        {"slug": "cline-pass", "label": "ClinePass", "activeProviders": 3, "models": [
            {"id": "cid-cp", "upstreamModelId": "cline-pass/deepseek-v4-flash", "label": "DeepSeek V4 Flash",
             "officialIn": 0.8, "asksIn": [0.0220, 0.1098, 0.1100]}]},
    ]
    data = _orderbook_json(client, catalog=catalog)
    by_mid = {m["model_id"].split("/")[-1].lower(): m for m in data["models"]}
    mo = by_mid["deepseek-v4-flash"]
    assert mo["min_ask"] is None
    assert mo["max_ask"] is None
    up = {u["slug"]: u for u in mo["upstreams"]}
    assert up["cline-pass"]["is_ours"] is True
    assert all(lv["price"] >= 0 for u in mo["upstreams"] for lv in u["levels"])


def test_orderbook_serves_from_cache_without_fetch(client):
    """RATE-LIMIT FIX: api_orderbook harus membaca /catalog dari _cache (di-poll
    background), BUKAN memanggil inferhub_get per request. Kalau inferhub_get dipanggil
    (cache kosong -> fallback), test ini tetap hijau; untuk memastikan cache jalan,
    set _cache dan patch inferhub_get agar raise -> request harus tetap 200."""
    import app as app_mod
    saved = app_mod._cache.get("catalog")
    saved_p = app_mod._cache.get("providers")
    saved_a = app_mod._cache.get("asks")
    try:
        app_mod._cache["catalog"] = _CATALOG_DSV
        app_mod._cache["providers"] = _PROVIDERS_OURS
        app_mod._cache["asks"] = _ASKS_SAMPLE

        def _boom(path, params=None, timeout=25):
            raise AssertionError(f"inferhub_get dipanggil utk {path} — harus dari cache")

        with mock.patch.object(app_mod, "inferhub_get", side_effect=_boom):
            r = client.get("/api/orderbook", headers={"X-Auth": "test-password-strong"})
        assert r.status_code == 200
        data = r.get_json()
        by_mid = {m["model_id"].split("/")[-1].lower(): m for m in data["models"]}
        mo = by_mid["deepseek-v4-flash"]
        assert mo["min_ask"] == 0.05
    finally:
        app_mod._cache["catalog"] = saved
        app_mod._cache["providers"] = saved_p
        app_mod._cache["asks"] = saved_a
