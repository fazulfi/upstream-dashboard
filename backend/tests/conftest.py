"""Konfigurasi pytest backend — app.py aman utk diimport (runtime-init di main()).
Test memakai mock db_connect/inferhub per-fixture supaya tanpa Postgres/InferHub.
"""

import os
import sys
from unittest import mock

import pytest

# ── env test-friendly (sebelum import app) ──
os.environ.setdefault("DASHBOARD_PASSWORD", "test-pass")
os.environ.setdefault(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,https://dash.example",
)
# arahkan DB ke addr penolak cepat agar kalau ada call tak sengaja, gagal cepat
os.environ["UPSTREAM_DB"] = "postgresql://nope:nope@127.0.0.1:1/nox"

_BACKEND = os.path.dirname(os.path.dirname(__file__))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

import app  # noqa: E402


@pytest.fixture()
def client():
    app.app.config["TESTING"] = True
    with mock.patch("app.inferhub_get", return_value=None), \
         mock.patch("app.inferhub_post", return_value=None), \
         mock.patch("app.inferhub_put", return_value=None), \
         mock.patch("app.inferhub_delete", return_value=False), \
         mock.patch("app.db_connect"):
        with app.app.test_client() as c:
            yield c


@pytest.fixture()
def auth_client(client):
    r = client.post("/api/login", json={"password": "test-pass"})
    tok = r.get_json()["token"]
    client.et = {"Authorization": f"Bearer {tok}"}
    return client