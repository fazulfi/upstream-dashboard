# Phase 4: Dashboard Control Plane + Technical Debt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose gated operational controls (pricing + finance) on the dashboard with authorization, idempotency, audit, feedback, and rollback — while cleaning up pre-existing technical debt (recon earning-equation, app.py coverage, rclone offsite).

**Architecture:** One shared mutation wrapper (`backend/mutation_guard.py`) enforced on the gated mutation endpoints IN SCOPE: config PUT/DELETE (Task 4), pricing global PUT (Task 6), finance buy/retire/refund (Task 7) — operator identity+role from session (P4-Q4), Idempotency-Key replay table (P4-Q5), audit write to `financial_audit`, fail-closed feedback (P4-Q6), and rollback/disarm hook (P4-Q7 manual). Pre-existing mutating routes NOT in scope (keys/budgets/topups/combos/ask/recheck/arm/disarm, see Task 4 CATATAN inventory) KEEP their current behavior — they are inventory-listed for a follow-up hardening wave, NOT guard-wrapped in this phase. A unified Pricing page merges global per-upstream config + per-model overrides + merged orderbook (P4-Q11). Debt: fix producer invariant for earning rows, raise app.py coverage via critical-path route tests, configure rclone offsite and stop claiming 30d policy when skipped (P4-Q12).

**Tech Stack:** Python 3.11 Flask/psycopg3 (backend), React/Vite/vitest/jsdom (frontend), GitHub Actions CI (no CD), systemd user services (VPS), rclone (offsite backups).

## Global Constraints

- DB production = `wuthering_waves_multi_agent` via `127.0.0.1:6432`, DSN from env `UPSTREAM_DB` only — **JANGAN hardcode nama DB/password**; secret file `/home/gamesim/.dashboard.env` (chmod 600) via `set -a && . ... && set +a`.
- Semua mutation endpoint WAJIB lewat mutation wrapper: authz → idempotency → audit → feedback → rollback hook.
- Idempotency-Key header WAJIB untuk setiap request mutasi; replay table mencegah double-execution.
- Operator identity+role dari session (login name field), bukan 'dashboard-api' hardcoded; tanpa multi-password.
- `/api/pricing-config` TETAP read-only (sync InferHub); dashboard hanya menampilkan.
- Auto-disarm = MANUAL saja (no auto-disarm), audit log tetap ditulis.
- Fail-closed: publish file gagal → rollback + HTTP 500 (bukan 200).
- Payout sync: id kosong → skip + warning + audit (NO UUID fallback).
- Hapus DSN fallback ber-password di semua script (env wajib).
- Dilarang commit: secrets, `.env*`, `session-*.md`, `revenue/`, backup files. `VERCEL_TOKEN`, `DASHBOARD_PASSWORD`, `UPSTREAM_DB` hanya via env saat eksekusi.
- Unit test minimal 80% (backend finance gate + frontend vitest thresholds 80/80/70/80).
- PR dulu, CI tanpa CD, deploy manual VPS `ssh root@82.25.62.204` + Vercel `upstream-static` setelah merge + backup.
- Dilarang menurunkan threshold untuk 'menghijaukan'; pragma hanya narrow-scope (main/waitress bootstrap), tidak mengecualikan route/error handling.
- Semua perubahan schema additive-only (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
- Bahasa pesan audit/UI konsisten: English untuk technical fields, boleh Indonesian untuk UI copy.

---

### Task 1: Mutation Guard Core (TDD)

**Files:**
- Create: `backend/mutation_guard.py`
- Create: `backend/tests/test_mutation_guard.py`

**Interfaces:**
- Produces: `MutationGuardError(message, status_code)`, `guard_mutation(request, conn, audit_entity, audit_action, executor, idempotency_key=None, actor="unknown", source="dashboard", request_body=None, rollback_hook=None, actor_role="operator", required_roles=None)` — returns `(status, payload)`; menolak 403 bila `required_roles` diisi dan `actor_role` tidak termasuk di dalamnya.
- Consumes: `financial_audit.audit_write(conn, entity, entity_id, action, actor, source, before, after)` from Phase 3.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_mutation_guard.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_mutation_guard.py -v`
Expected: FAIL `ModuleNotFoundError: No module named 'mutation_guard'`.

- [ ] **Step 3: Implement minimal mutation_guard.py**

`backend/mutation_guard.py`:

```python
"""Mutation Guard — satu abstraksi utk semua kontrol mutasi (Phase 4 C3).

Alur: validasi Idempotency-Key → cek replay table → eksekusi executor →
tulis financial_audit → commit. Error → rollback + MutationGuardError.
"""
import hashlib
import json

from financial_audit import audit_write


class MutationGuardError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


_REPLAY_TABLE = "mutation_replay"


def _request_hash(request_body):
    return hashlib.sha256(
        json.dumps(request_body, sort_keys=True, default=str).encode()
    ).hexdigest()


def guard_mutation(request, conn, audit_entity, audit_action, executor,
                   idempotency_key=None, actor="unknown", source="dashboard",
                   request_body=None, rollback_hook=None, actor_role="operator",
                   required_roles=None):
    """Jalankan satu mutasi dengan guard. Returns (status, payload)."""
    if not idempotency_key:
        raise MutationGuardError("Idempotency-Key header wajib utk request mutasi", 400)

    # P4-Q4/Q13: otorisasi berbasis role — tolak SEBELUM eksekusi bila role
    # aktor tidak termasuk required_roles (default None = semua role boleh).
    if required_roles and actor_role not in required_roles:
        raise MutationGuardError(
            "role '%s' tidak berhak menjalankan %s (butuh %s)"
            % (actor_role, audit_action, "/".join(required_roles)), 403)

    body_hash = _request_hash(request_body or {})
    with conn.cursor() as cur:
        cur.execute(
            "SELECT response_json FROM %s WHERE key=%s AND route=%s" % (_REPLAY_TABLE,),
            (idempotency_key, audit_action))
        row = cur.fetchone()
        if row:
            # replay — jangan re-execute; unpack tuple (status, payload) supaya
            # return shape konsisten dgn jalur execute: (status, payload)
            replayed = json.loads(row["response_json"])
            return replayed["status"], replayed["payload"]

        try:
            status, payload = executor()
            audit_write(conn, audit_entity, None, audit_action, actor, source,
                        before=request_body, after=payload)
            cur.execute(
                "INSERT INTO %s (key, route, request_hash, response_json, created_at)"
                " VALUES (%%s, %%s, %%s, %%s, now())" % (_REPLAY_TABLE,),
                (idempotency_key, audit_action, body_hash, json.dumps({"status": status, "payload": payload})))
            conn.commit()
            return status, payload
        except Exception:
            if rollback_hook:
                rollback_hook()
            conn.rollback()
            raise
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_mutation_guard.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/mutation_guard.py backend/tests/test_mutation_guard.py
git commit -m "feat: mutation guard core (idempotency + audit + rollback)"
```

---

### Task 2: Replay Table + Operator Identity Schema (additive)

**Files:**
- Modify: `backend/db_schema.py` (tambah DDL di akhir `ensure_schema`)
- Create: `backend/tests/test_db_schema_p4.py`

**Interfaces:**
- Produces: tables `mutation_replay` + `operator_session` (additive).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_db_schema_p4.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_db_schema_p4.py -v`
Expected: FAIL (DDL belum ada).

- [ ] **Step 3: Add DDL**

Di akhir `ensure_schema(cur)` di `backend/db_schema.py`:

```python
    # ── Phase 4 C3: replay + operator identity ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS mutation_replay (
            key TEXT PRIMARY KEY,
            route TEXT NOT NULL,
            request_hash TEXT NOT NULL,
            response_json JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS operator_session (
            token_hash TEXT PRIMARY KEY,
            operator_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'operator',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            expires_at TIMESTAMPTZ NOT NULL
        )
    """)
    # ── Phase 4 Q2c/Q11: global per-upstream pricing (additive) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pricing_config_upstream (
            upstream TEXT PRIMARY KEY,
            max_ask_pct DOUBLE PRECISION NOT NULL,
            platform_fee_pct DOUBLE PRECISION,
            publisher_share_pct INT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_db_schema_p4.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/db_schema.py backend/tests/test_db_schema_p4.py
git commit -m "feat: additive schema mutation_replay + operator_session"
```

---

### Task 3: Identity + Role Session (P4-Q4)

**Files:**
- Modify: `backend/app.py` (login route ~line 600 + token validation)
- Modify: `backend/logic.py` (`issue_token_operator` + `verify_token_operator`)
- Create: `backend/tests/test_identity_session.py`

**Interfaces:**
- Produces: login accepts optional `operator_name` + `role`; token payload extended; `get_operator(token)` returns `(name, role)`.
- CONTRACT (dipatuhi Task 3 DAN Task 7): `get_operator(token: str) -> (name, role)` — argumennya TOKEN (string), bukan `request` object. `_handle_login(body, resp)` menulis dict `{status, body}` (dipakai test). Fungsi token baru bernama `issue_token(operator_name, role)` di app.py (wrapper ke `logic.issue_token_operator`), BUKAN `_issue_token`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_identity_session.py`:

```python
"""Test operator identity/role di session (P4-Q4)."""
import app as app_module


def test_login_menerima_operator_name_dan_role(monkeypatch):
    captured = {}

    def fake_issue_token(name, role):
        captured["name"] = name
        captured["role"] = role
        return "token-abc"

    monkeypatch.setattr(app_module, "issue_token", fake_issue_token)
    app_module._handle_login({"password": "x", "operator_name": "Faiz", "role": "admin"}, captured)
    assert captured["name"] == "Faiz"
    assert captured["role"] == "admin"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_identity_session.py -v`
Expected: FAIL (fungsi `_handle_login`/`issue_token` belum ada).

- [ ] **Step 3: Implement**

Di `backend/app.py`, tambah (wrapper + login + extractor; semua HMAC dilakukan di `logic.py`):

```python
def issue_token(operator_name="operator", role="operator"):
    """Token operator 4-part: <expiry>.<name>.<role>.<hmac> (Phase 4 Q4)."""
    return logic.issue_token_operator(operator_name, role, SESSION_TTL, DASHBOARD_PASSWORD)


def _handle_login(body, resp):
    """Login — verifikasi DASHBOARD_PASSWORD + simpan identity."""
    pw = (body or {}).get("password", "")
    if not hmac.compare_digest(pw, DASHBOARD_PASSWORD):
        resp["status"] = 401
        resp["body"] = {"error": "invalid password"}
        return
    name = (body or {}).get("operator_name") or "operator"
    role = (body or {}).get("role") or "operator"
    resp["status"] = 200
    resp["body"] = {"token": issue_token(name, role), "operator_name": name, "role": role}


def get_operator(token):
    """Extract (name, role) dari token; default ('operator','operator')."""
    try:
        name, role = logic.verify_token_operator(token, DASHBOARD_PASSWORD)
        return name, role
    except Exception:
        return "operator", "operator"
```

CATATAN MIGRASI WAJIB (jangan rusak auth existing): repo saat ini (app.py:533-548) memakai `_issue_token()`/`_verify_token()` via `logic.issue_token(password, ttl)` dgn token bentuk `expiry.signature` (2 part, no identity). Migrasi ini HARUS dilakukan bersama-sama:
1. **logic.py**: tambah `issue_token_operator(name, role, ttl, password)` yang memakai `hmac` dengan secret yang sama (lihat `logic.issue_token` existing — reuse `sign_session`/key; JANGAN ganti format token lama karena `_verify_token` dipakai route lain). Format token operator **4-part** `expiry.name.role.hmac` (recompute hmac dari `expiry.name.role`, cek expiry, constant-time compare) → return `(name, role)` saat valid. Simpan `_verify_token`/`verify_token` tetap (backward-compat untuk token 2-part) + tambah `verify_token_operator(token, password, now=None) -> (name, role)` yang melempar `ValueError`/return falsy saat token invalid/expired.
2. **app.py**:
   - `issue_token(operator_name, role)` = wrapper baru memanggil `logic.issue_token_operator(...)` (bukan logic.issue_token password). PERHATIAN: nama `issue_token` di app.py BERTENTANGAN dgn fungsi existing `_issue_token()` — `_issue_token()` lama harus tetap ada (dipakai `test_app.py:66` & `/api/login` path lama) dan `issue_token` baru hanya dipanggil oleh `_handle_login`. JANGAN monkeypatch/hapus `_issue_token` di task ini.
   - `_handle_login(body, resp)` — verifikasi password (DASHBOARD_PASSWORD) lalu `resp["body"] = {"token": issue_token(name, role), "operator_name": name, "role": role}`.
   - Route `/api/login` (baris ~600): ganti body handler agar memanggil `_handle_login` dengan dict `{"password": ..., "operator_name": ..., "role": ...}`; bila `resp["status"] == 200` → `jsonify(resp["body"])`; bila 401 → `jsonify(resp["body"]), 401`.
   - `require_auth`/`before_request` (baris ~577-582): token lama 2-part tetap lewat `_verify_token`; tambahkan cabang `logic.verify_token_operator` untuk token 4-part — keduanya boleh; simpan `(name, role)` di request context bila token operator.
   - `get_operator(token)` — terima STRING token (dari `auth_token()` / header), panggil `logic.verify_token_operator`, return `(name, role)`; fallback `("operator", "operator")` bila gagal (backward-compat dengan token lama/unit test yang tidak kirim identity).
   - Tambah helper `auth_token()`: baca `Authorization: Bearer <token>` via `_read_credentials()` → return token string (atau `""` bila tidak ada). Dipakai `get_operator(auth_token())` di route (Task 7) dan test.
3. **Verifikasi**: setelah migrasi, `pytest tests/test_app.py tests/test_identity_session.py -v` harus ALL PASS (login lama tetap bekerja — token 2-part masih diverifikasi; login baru 4-part bekerja). `pytest --cov=logic --cov=app --cov-report=term-missing -q` jangan turun drastis.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_identity_session.py -v`
Expected: 1 passed.

- [ ] **Step 5: Run full suite**

Run: `cd backend && python -m pytest --cov=logic --cov=app --cov-report=term-missing -q`
Expected: ALL PASS (existing login tests disesuaikan bila perlu).

- [ ] **Step 6: Commit**

```bash
git add backend/app.py backend/logic.py backend/tests/test_identity_session.py
git commit -m "feat: operator identity + role di session (P4-Q4)"
```

---

### Task 4: Fail-Closed Config Writes (P4-Q6)

**Files:**
- Modify: `backend/app.py` (auto-pricing config PUT ~2389 + DELETE ~2431)
- Create: `backend/tests/test_config_fail_closed.py`

**Interfaces:**
- Produces: config PUT/DELETE fail-closed: `_sync_ap_config_file` gagal → raise `RuntimeError` (TIDAK menelan exception), route tangkap → 500 + rollback row yang barusan ditulis; SEMUA mutasi lewat `guard_mutation` (P4-C3) dengan actor role + audit.
- Role guard: `required_roles=["admin"]` untuk PUT/DELETE config (lihat matriks role di Task 1/CATATAN).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_config_fail_closed.py`:

```python
"""Test fail-closed config writes via mutation guard (P4-Q6).

Route PUT memakai guard_mutation — test memakai app.test_client() dan mock
guard_mutation + db_connect supaya tanpa DB nyata (pola Task 7).
"""
import app as app_module


class FakeConn:
    """Context manager koneksi in-memory: commit dicatat, query tidak dieksekusi."""

    def __init__(self):
        self.commits = 0
        self.closed = False

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.commits = 0

    def close(self):
        self.closed = True

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql, params=None):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_config_put_fail_closed_saat_publish_gagal(auth_client, monkeypatch):
    """Publish gagal → SATU transaksi (conn route) tidak di-commit → 500 + error 'file'.

    Pakai fixture `auth_client` (test_client + login Bearer token) supaya lewat
    _auth_gate before_request (P4-Q6) — tanpa header auth route akan 401 sebelum
    db_connect/guard_mutation/_sync_ap_config_file tersentuh.
    """

    def fake_sync(cfg):
        raise RuntimeError("file publish failed")

    state = {"conns": []}

    def fake_db_connect():
        c = FakeConn()
        state["conns"].append(c)
        return c

    def fake_guard(req, conn, entity, action, executor, **kw):
        # simulasi guard asli: executor raise → rollback (tidak commit) + 500
        try:
            return executor()
        except RuntimeError:
            conn.rollback()
            return 500, {"error": "config publish failed: file publish failed"}

    monkeypatch.setattr(app_module, "_sync_ap_config_file", fake_sync)
    monkeypatch.setattr(app_module, "db_connect", fake_db_connect)
    monkeypatch.setattr(app_module, "guard_mutation", fake_guard)
    r = auth_client.put(
        "/api/auto-pricing/config",
        json={"upstream": "clinepass", "model_id": "m1", "trigger_pct": 0.1},
        headers={"Idempotency-Key": "cfg-1"})
    assert r.status_code == 500
    assert "file" in r.get_json()["error"]
    # KONTRAK transaksi: koneksi route (satu-satunya) TIDAK pernah di-commit —
    # rollback → tidak ada row yatim, request bisa diulang.
    assert state["conns"], "route tidak membuat koneksi db_connect"
    assert all(c.commits == 0 for c in state["conns"])
    assert all(c.closed for c in state["conns"])  # finally: conn.close()
```

Test memakai fixture `auth_client` dari conftest (test_client + login Bearer token) — sama seperti Task 6/7. FakeConn punya method `rollback()` (dipakai fake_guard): `def rollback(self): self.commits = 0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_config_fail_closed.py -v`
Expected: FAIL (route `api_auto_pricing_config_put` belum wrapped guard / `_sync_ap_config_file` masih menelan exception).

- [ ] **Step 3: Implement**

Di `backend/app.py`:

1. **Buat `_sync_ap_config_file(conn=None)` RAISE + atomik** (jangan menelan exception; app.py:2444-2455):

```python
def _sync_ap_config_file(conn=None):
    """Sync auto_pricing_config DB -> JSON file (daemon baca file ini, tanpa psycopg).

    - conn diberikan (jalur route/guard): baca row dalam TRANSAKSI PEMANGGIL
      (READ COMMITTED tidak bisa melihat row uncommitted dari koneksi lain —
      wajib pakai koneksi yang sama dengan upsert).
    - conn=None (jalur main()/startup): buka koneksi sendiri.
    - Tulis ATOMik: temp file + os.replace — file target TIDAK pernah setengah
      jadi; raise menyebar ke pemanggil (fail-closed, TIDAK di-swallow).
    """
    own = conn is None
    c = conn or db_connect()
    try:
        with c.cursor() as cur:
            cur.execute("SELECT upstream, model_id, trigger_pct, rebound_pct FROM auto_pricing_config")
            rows = cur.fetchall()
        path = os.path.expanduser("~/.hermes-suisui/logs/auto-pricing-config.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w") as f:
            json.dump({"configs": rows, "updated_at": time.time()}, f, indent=2)
        os.replace(tmp, path)
    finally:
        if own:
            c.close()
```

2. **Buat helper `_save_auto_pricing_config(cfg_row, conn)`** — menulis DB dalam TRANSAKSI KONEKSI PEMANGGIL, TIDAK commit:

```python
def _save_auto_pricing_config(cfg_row, conn):
    """Upsert satu config auto-pricing dalam transaksi koneksi pemanggil (P4-Q6).

    KONTRAK: tulis pakai `conn` (koneksi guard_mutation) dan TIDAK commit —
    guard yang commit SETELAH publish sukses. Publish gagal → guard rollback →
    row ikut ter-rollback (satu transaksi, tidak ada row yatim).
    """
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO auto_pricing_config (upstream, model_id, trigger_pct, rebound_pct, updated_at)
            VALUES (%s, %s, %s, COALESCE(%s, 1.0), now())
            ON CONFLICT (upstream, model_id) DO UPDATE SET
              trigger_pct=EXCLUDED.trigger_pct,
              rebound_pct=COALESCE(EXCLUDED.rebound_pct, auto_pricing_config.rebound_pct),
              updated_at=now()
        """, (cfg_row["upstream"], cfg_row["model_id"], cfg_row["trigger_pct"],
              cfg_row.get("rebound_pct")))
    return {"ok": True, "upstream": cfg_row["upstream"],
            "model_id": cfg_row["model_id"], "trigger_pct": cfg_row["trigger_pct"]}
```

3. **Refactor route PUT `api_auto_pricing_config_put`** — wrap `guard_mutation`; SATU koneksi dipakai guard DAN executor:

```python
@app.route("/api/auto-pricing/config", methods=["PUT"])
def api_auto_pricing_config_put():
    body = request.get_json(silent=True) or {}
    upstream = (body.get("upstream") or "").strip()
    model_id = (body.get("model_id") or "").strip()
    try:
        trigger_pct = float(body.get("trigger_pct"))
    except (TypeError, ValueError):
        return jsonify({"error": "trigger_pct numeric required"}), 400
    if not upstream or not model_id:
        return jsonify({"error": "upstream & model_id required"}), 400
    if trigger_pct <= 0:
        return jsonify({"error": "trigger_pct harus > 0"}), 400
    parts = model_id.split("/")
    bare = parts[-1] if parts else model_id
    if not bare:
        return jsonify({"error": "model_id invalid"}), 400
    model_id = f"{upstream}/{bare}"
    cfg_row = {"upstream": upstream, "model_id": model_id, "trigger_pct": trigger_pct}

    def _exec():
        # 1) upsert DB (SAME conn sbg guard, tanpa commit) → 2) publish file
        # (SAME conn — baca row dlm transaksi yg sama). Urutan ini wajib.
        _save_auto_pricing_config(cfg_row, conn)
        _sync_ap_config_file(conn)   # RAISE bila gagal → guard rollback semua
        return 200, {"ok": True, "config": cfg_row}

    conn = db_connect()
    try:
        name, role = get_operator(auth_token())
        status, payload = guard_mutation(
            request, conn, "auto_pricing_config", "config-update", _exec,
            idempotency_key=request.headers.get("Idempotency-Key"),
            actor=name, source="dashboard", request_body=body,
            actor_role=role, required_roles=["admin"])
    except MutationGuardError as e:
        return jsonify({"error": e.message}), e.status_code
    finally:
        conn.close()
    return jsonify(payload), status
```

Import di app.py: `from mutation_guard import MutationGuardError` (bila belum ada; guard_mutation dipakai route lain juga — import sekali di module top).

4. **Route DELETE `api_auto_pricing_config_delete`** — pola sama: buat `conn = db_connect()` sebelum guard; `_exec` = `DELETE ... WHERE id=%s` via `conn.cursor()` (tanpa commit) lalu `_sync_ap_config_file(conn)` (raise bila gagal); `audit_action="config-delete"`, `required_roles=["admin"]`; tangkap `MutationGuardError` → `jsonify({"error": e.message}), e.status_code`; `finally: conn.close()`.

5. **Rollback** (guard asli, mutation_guard.py): saat `_exec` raise (publish gagal) → `rollback_hook` dipanggil → `conn.rollback()` → row upsert TIDAK commit (satu transaksi dengan guard) + replay row TIDAK ditulis → request bisa diulang tanpa state yatim. File target juga TIDAK berubah (tulis atomik via os.replace — tmp dibuang). DB dan file selalu konsisten.

CATATAN: `_sync_ap_config_file()` (conn=None) tetap dipanggil di `main()` (app.py:2470) dalam try/except pass — biarkan (startup best-effort), HANYA jalur route yang fail-closed.

CATATAN SCOPE — INVENTORI MUTATING ROUTES (app.py, verified 2026-08-21): daftar lengkap route mutasi: `/api/login` POST (600, exclude — auth), `/api/keys` POST (1684), `/api/keys/<kid>/rotate` POST (1707), `/api/keys/<kid>` DELETE (1726), `/api/budgets/<mid>` PUT (1754), `/api/topups` POST (1769), `/api/topups/<topupKey>/refresh` POST (1806), `/api/combos` POST (1819), `/api/combos/<cid>` DELETE (1838), `/api/provider-recheck` POST (2068), `/api/ask` PUT (2131), `/api/auto-pricing/arm` POST (2234), `/api/reliability/arm` POST (2331), `/api/reliability/disarm` POST (2341), `/api/auto-pricing/config` PUT (2389), `/api/auto-pricing/config/<cid>` DELETE (2431). DALAM SCOPE phase ini (dibungkus guard): config PUT/DELETE (task ini), pricing global PUT (Task 6), finance buy/retire/refund (Task 7). DI LUAR SCOPE (tetap perilaku existing; diinventori untuk hardening wave berikutnya — TIDAK dibungkus guard di phase ini): keys, budgets, topups, combos, provider-recheck, ask, arm/disarm. Audit claim "semua endpoint mutasi" pada checklist di-refrase menjadi "semua endpoint mutasi DALAM SCOPE" (lihat Task 15 Step 2).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_config_fail_closed.py -v`
Expected: 1 passed.

- [ ] **Step 5: Run full suite**

Run: `cd backend && python -m pytest --cov=logic --cov=app --cov-report=term-missing -q`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app.py backend/tests/test_config_fail_closed.py
git commit -m "fix: config writes fail-closed (publish gagal → rollback + 500) P4-Q6"
```

---

### Task 5: Payout UUID Fallback Removal (P4-Q9)

**Files:**
- Modify: `backend/app.py` (~line 929)
- Create: `backend/tests/test_payout_dedup.py`

**Interfaces:**
- Produces: payout sync skip rows tanpa id + audit 'sync-payouts-skip'.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_payout_dedup.py`:

```python
"""Test payout sync tanpa UUID fallback (P4-Q9)."""
import app as app_module


def test_payout_sync_skip_kosong_id(monkeypatch):
    events = []

    def fake_audit(conn, entity, entity_id, action, actor, source, before, after):
        events.append((entity, entity_id, action))

    # db_connect dimock: conn=None pada helper HARUS membuat koneksi sendiri,
    # dan env test UPSTREAM_DB di-refuse (conftest) — tanpa mock test gagal.
    class FakePayoutConn:
        def __init__(self):
            self.commits = 0
            self.closed = False

        def cursor(self):
            return self

        def execute(self, sql, params=None):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def commit(self):
            self.commits += 1

        def close(self):
            self.closed = True

    def fake_db_connect():
        return FakePayoutConn()

    monkeypatch.setattr(app_module, "audit_write", fake_audit)
    monkeypatch.setattr(app_module, "db_connect", fake_db_connect)
    skipped = app_module._sync_payouts_rows(
        [{"id": None, "amount_usdc": 5.0, "status": "confirmed", "date": "2026-08-20"}],
        conn=None)
    assert skipped == 1
    assert any(a == "sync-payouts-skip" for _, _, a in events)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_payout_dedup.py -v`
Expected: FAIL (fungsi `_sync_payouts_rows` belum ada).

- [ ] **Step 3: Implement**

Di `backend/app.py`, ganti loop payout sync:

```python
def _sync_payouts_rows(rows, conn):
    """Insert payouts; id kosong → skip + audit (P4-Q9, no UUID fallback).

    KONTRAAK: `conn` OPSIONAL — bila None, helper membuat koneksi sendiri via
    db_connect() (supaya unit test bisa memanggil `conn=None`).
    Format baris MASUK mengikuti field API sync existing:
    {id, amountUsdc, requestedAt, status, destination} — helper menormalisasi
    ke kolom DB (amount_usdc, date).
    """
    skipped = 0
    own_conn = conn is None
    try:
        if own_conn:
            conn = db_connect()
        with conn.cursor() as cur:
            for w in rows:
                wid = w.get("id")
                if not wid:
                    skipped += 1
                    audit_write(conn, "payouts", None, "sync-payouts-skip", "system",
                                "payout_sync", before=w, after=None)
                    continue
                # normalisasi: amountUsdc/requestedAt (API sync) OR amount_usdc/date (DB)
                amt = w.get("amountUsdc", w.get("amount_usdc"))
                dt = w.get("requestedAt", w.get("date"))
                cur.execute("""
                    INSERT INTO payouts (id, date, amount_usdc, status, destination, created_at)
                    VALUES (%s, %s, %s, %s, %s, now())
                    ON CONFLICT (id) DO UPDATE SET
                      date=EXCLUDED.date, amount_usdc=EXCLUDED.amount_usdc,
                      status=EXCLUDED.status, destination=EXCLUDED.destination
                """, (wid, str(dt or "")[:10], float(amt or 0),
                      w.get("status", "confirmed"), w.get("destination")))
            conn.commit()
    finally:
        if own_conn:
            conn.close()
    return skipped
```

CATATAN: panggil dari `_incremental_db_sync`/payout poll — replace blok `wid = w.get('id') or str(uuid.uuid4())`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_payout_dedup.py -v`
Expected: 1 passed.

- [ ] **Step 5: Run full suite**

Run: `cd backend && python -m pytest --cov=logic --cov=app --cov-report=term-missing -q`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app.py backend/tests/test_payout_dedup.py
git commit -m "fix: payout sync skip id kosong + audit (P4-Q9)"
```

---

### Task 6: Global Per-Upstream Config + Orderbook Merge (P4-Q2c/Q11 backend)

**Files:**
- Modify: `backend/app.py` (routes pricing + orderbook)
- Create: `backend/tests/test_pricing_global_orderbook.py`

**Interfaces:**
- Produces: `GET /api/pricing` → `{globals: {upstream: {max_ask_pct,...}}, overrides: [...], orderbook: [...]}` (read-only, tanpa guard); `PUT /api/pricing/global` (gated via guard_mutation, `required_roles=["admin"]`, `audit_action="pricing-global-update"`).
- Orderbook source: refactor `api_orderbook` (app.py:1917) → `_orderbook_payload()` (cache `catalog`/`providers`/`asks`; model → upstreams → levels ladder; min_ask/max_ask/spread dari level NON-ours; `is_ours` flag; `our_ask`). `api_orderbook` = `jsonify(_orderbook_payload())`; `_load_pricing_merged` memakai `_orderbook_payload()["models"]` (bukan query DB — tabel `provider_asks` TIDAK dipakai untuk orderbook view; verified: tidak ada tabel `upstream_asks` di db_schema).
- PUT payload: `{"upstream": "<slug>", "max_ask_pct": 0.05, "platform_fee_pct": 0.1, "publisher_share_pct": 80}` → upsert `pricing_config_upstream` (PK upstream; additive, table dibuat Task 2) → 200 `{"ok": True, "config": {...}}`. Validasi: upstream wajib, `max_ask_pct` numeric `> 0` (400 bila invalid).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_pricing_global_orderbook.py`:

```python
"""Test pricing global per-upstream + orderbook merge (P4-Q2c/Q11)."""
import app as app_module


def test_pricing_merge_globals_overrides_orderbook(monkeypatch):
    fake_data = {
        "globals": {"clinepass": {"max_ask_pct": 0.05}},
        "overrides": [{"upstream": "clinepass", "model_id": "m1", "trigger_pct": 0.1}],
        "orderbook": [{"upstream": "clinepass", "model_id": "m1", "ask": 0.08}],
    }

    def fake_load():
        return fake_data

    monkeypatch.setattr(app_module, "_load_pricing_merged", fake_load)
    res = app_module._pricing_merged_view()
    assert res["globals"]["clinepass"]["max_ask_pct"] == 0.05
    assert len(res["overrides"]) == 1
    assert res["orderbook"][0]["ask"] == 0.08


def test_pricing_global_put_lewat_guard(auth_client, monkeypatch):
    """PUT /api/pricing/global gated: guard dipanggil dgn action + role admin."""
    called = {}

    def fake_guard(req, conn, entity, action, executor, **kw):
        called["action"] = action
        called["required_roles"] = kw.get("required_roles")
        return 200, {"ok": True, "config": {"upstream": "clinepass", "max_ask_pct": 0.05}}

    monkeypatch.setattr(app_module, "guard_mutation", fake_guard)
    r = auth_client.put(
        "/api/pricing/global",
        json={"upstream": "clinepass", "max_ask_pct": 0.05,
              "platform_fee_pct": 0.1, "publisher_share_pct": 80},
        headers={"Idempotency-Key": "pg-1"})
    assert r.status_code == 200
    assert called["action"] == "pricing-global-update"
    assert called["required_roles"] == ["admin"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_pricing_global_orderbook.py -v`
Expected: FAIL (fungsi `_pricing_merged_view` belum ada / route PUT belum ada).

- [ ] **Step 3: Implement**

Di `backend/app.py`:

```python
def _orderbook_payload():
    """Refactor dari api_orderbook (app.py:1917-1997): model → upstreams → levels.

    Sumber = cache/InferHub (catalog + providers + asks), BUKAN DB — parity
    penuh dgn api_orderbook. Ladder per price (round 6), norm_mid (segmen
    setelah '/' terakhir), is_ours via my_slugs, min/max/spread dari level
    NON-ours, our_ask dari asks_map, sort by min_ask asc.
    """
    cat = _cache.get("catalog")
    if not cat:
        cat = inferhub_get("/catalog")
    asks_map = {}
    ad = _cache.get("providers")
    if ad is None:
        ad = inferhub_get("/publisher/providers")
    my_slugs = {p.get("upstreamSlug") for p in (ad or []) if p.get("enabled") and p.get("upstreamSlug")}
    sample = None
    if isinstance(ad, list):
        sample = next((p for p in ad if p.get("enabled")), None)
    if sample:
        a = _cache.get("asks")
        if a is None:
            a = inferhub_get(f"/publisher/providers/{sample['id']}/asks")
        if isinstance(a, list):
            for x in a:
                asks_map[x.get("upstreamCatalogModelId")] = x

    ups = cat if isinstance(cat, list) else (cat or {}).get("upstreams", []) if isinstance(cat, dict) else []
    models = {}
    for u in ups:
        slug = u.get("slug"); ulabel = u.get("label")
        is_ours = slug in my_slugs
        for m in (u.get("models") or []):
            cid = m.get("id") or m.get("upstreamCatalogModelId")
            mid = m.get("upstreamModelId")
            label = m.get("label") or mid or cid
            official = m.get("officialIn") or m.get("officialInputPerMtok")
            try: official = float(official)
            except (TypeError, ValueError): official = None
            asks_in = m.get("asksIn") or []
            cnt = {}
            for price in asks_in:
                try: p = round(float(price), 6)
                except (TypeError, ValueError): continue
                cnt[p] = cnt.get(p, 0) + 1
            levels = [{"price": p, "qty": q} for p, q in sorted(cnt.items())]
            raw_mid = mid or ""
            norm_mid = raw_mid.split("/")[-1].strip().lower()
            if not norm_mid:
                norm_mid = label or cid or ""
            key = norm_mid
            mo = models.setdefault(key, {
                "model_id": raw_mid, "label": label, "official_in": official,
                "upstreams": [], "our_ask": None,
            })
            our_a = asks_map.get(cid)
            if our_a and mo["our_ask"] is None:
                try: mo["our_ask"] = round(float(our_a.get("askInputPerMtok") or 0), 6)
                except (TypeError, ValueError): pass
            mo["upstreams"].append({"slug": slug, "label": ulabel, "levels": levels,
                                    "active": u.get("activeProviders"), "cid": cid, "is_ours": is_ours})
    out = []
    for key, mo in models.items():
        genuine = [lv for u in mo["upstreams"] if not u.get("is_ours") for lv in u["levels"]]
        prices = [lv["price"] for lv in genuine if lv["price"] > 0]
        mn = min(prices) if prices else None
        mx = max(prices) if prices else None
        mo["min_ask"] = mn; mo["max_ask"] = mx
        mo["spread"] = round(mx - mn, 6) if mn is not None and mx is not None else None
        out.append(mo)
    out.sort(key=lambda x: (x["min_ask"] is None, x["min_ask"] if x["min_ask"] is not None else float("inf")))
    return {"models": out, "count": len(out)}


def _load_pricing_merged():
    """Gabungkan config global per-upstream + override per-model + orderbook (P4-Q2c/Q11).

    Global per-upstream dibaca dari pricing_config_upstream (additive, Task 2);
    bila tabel kosong → fallback ke row pricing_config id=1 utk semua upstream
    yang muncul di orderbook (backward-compat).
    """
    with db_connect() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT upstream, max_ask_pct, platform_fee_pct, publisher_share_pct
            FROM pricing_config_upstream ORDER BY upstream
        """)
        upstream_rows = {r["upstream"]: r for r in cur.fetchall()}
        cur.execute("SELECT id, max_ask_pct, platform_fee_pct, publisher_share_pct FROM pricing_config WHERE id=1")
        pc = cur.fetchone() or {}
        cur.execute("SELECT upstream, model_id, trigger_pct, rebound_pct, updated_at FROM auto_pricing_config ORDER BY upstream, model_id")
        overrides = [dict(r) for r in cur.fetchall()]
    orderbook = _orderbook_payload()["models"]
    globals_cfg = {}
    for mo in orderbook:
        for u in mo.get("upstreams") or []:
            up = u["slug"]
            if up in upstream_rows:
                row = upstream_rows[up]
                globals_cfg[up] = {"max_ask_pct": row["max_ask_pct"],
                                   "platform_fee_pct": row.get("platform_fee_pct"),
                                   "publisher_share_pct": row.get("publisher_share_pct")}
            else:
                globals_cfg[up] = {"max_ask_pct": pc.get("max_ask_pct"),
                                   "platform_fee_pct": pc.get("platform_fee_pct"),
                                   "publisher_share_pct": pc.get("publisher_share_pct")}
    return {"globals": globals_cfg, "overrides": overrides, "orderbook": orderbook}


def _pricing_merged_view():
    """View helper — dipanggil langsung oleh unit test (tanpa HTTP)."""
    return _load_pricing_merged()


@app.route("/api/pricing", methods=["GET"])
def api_pricing():
    return jsonify(_load_pricing_merged())


@app.route("/api/pricing/global", methods=["PUT"])
def api_pricing_global_put():
    """Upsert config global per-upstream (gated, P4-Q2c/Q11)."""
    body = request.get_json(silent=True) or {}
    upstream = (body.get("upstream") or "").strip()
    if not upstream:
        return jsonify({"error": "upstream required"}), 400
    try:
        max_ask_pct = float(body.get("max_ask_pct"))
    except (TypeError, ValueError):
        return jsonify({"error": "max_ask_pct numeric required"}), 400
    if max_ask_pct <= 0:
        return jsonify({"error": "max_ask_pct harus > 0"}), 400
    cfg = {"upstream": upstream, "max_ask_pct": max_ask_pct,
           "platform_fee_pct": body.get("platform_fee_pct"),
           "publisher_share_pct": body.get("publisher_share_pct")}

    def _exec():
        # upsert dalam SATU transaksi dgn guard (tanpa commit) — guard yang commit
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO pricing_config_upstream
                    (upstream, max_ask_pct, platform_fee_pct, publisher_share_pct, updated_at)
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (upstream) DO UPDATE SET
                  max_ask_pct=EXCLUDED.max_ask_pct,
                  platform_fee_pct=EXCLUDED.platform_fee_pct,
                  publisher_share_pct=EXCLUDED.publisher_share_pct,
                  updated_at=now()
            """, (cfg["upstream"], cfg["max_ask_pct"],
                  cfg["platform_fee_pct"], cfg["publisher_share_pct"]))
        return 200, {"ok": True, "config": cfg}

    conn = db_connect()
    try:
        name, role = get_operator(auth_token())
        status, payload = guard_mutation(
            request, conn, "pricing_config_upstream", "pricing-global-update", _exec,
            idempotency_key=request.headers.get("Idempotency-Key"),
            actor=name, source="dashboard", request_body=body,
            actor_role=role, required_roles=["admin"])
    except MutationGuardError as e:
        return jsonify({"error": e.message}), e.status_code
    finally:
        conn.close()
    return jsonify(payload), status
```

CATATAN: `_exec` memakai `conn` (koneksi guard, closure dari route) dan TIDAK commit — pola sama dengan Task 4. Orderbook memakai `_orderbook_payload()` (cache/InferHub, refactor dari `api_orderbook` app.py:1917) — BUKAN query DB: tabel `provider_asks` (db_schema.py:174) hanya menyimpan data provider asks untuk halaman lain, dan TIDAK ada tabel `upstream_asks`. Global per-upstream disimpan ke tabel baru `pricing_config_upstream` (additive, dibuat Task 2), dengan sync dari InferHub bila ada sumbernya. Test `test_pricing_global_put_lewat_guard` memakai fixture `auth_client` dari conftest (test_client + login Bearer token) dan mock `guard_mutation` — tanpa DB nyata.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_pricing_global_orderbook.py -v`
Expected: 2 passed.

- [ ] **Step 5: Run full suite**

Run: `cd backend && python -m pytest --cov=logic --cov=app --cov-report=term-missing -q`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app.py backend/tests/test_pricing_global_orderbook.py
git commit -m "feat: pricing merged view (global per-upstream + overrides + orderbook)"
```

---

### Task 7: Finance Dashboard Actions (P4-Q10) — gated wrapper

**Files:**
- Modify: `backend/app.py` (routes finance actions)
- Create: `backend/tests/test_finance_actions.py`

**Interfaces:**
- Produces: `POST /api/finance/buy`, `/api/finance/retire`, `/api/finance/refund` (gated via mutation_guard; terhubung `financial_audit`).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_finance_actions.py`:

```python
"""Test finance dashboard actions via mutation guard (P4-Q10).

Route api_finance_buy() membaca Flask global request — test memakai
app.test_client() (fixture `auth_client` dari conftest) dan mock
guard_mutation + db_connect supaya tanpa DB nyata.
"""
import app as app_module
from conftest import auth_client  # fixture: test_client + login Bearer token


def test_finance_buy_lewat_guard(auth_client, monkeypatch):
    called = {}

    def fake_guard(req, conn, entity, action, executor, **kw):
        called["action"] = action
        return 200, {"ok": True, "id": "A-073"}

    monkeypatch.setattr(app_module, "guard_mutation", fake_guard)
    r = auth_client.post(
        "/api/finance/buy",
        json={"id": "A-073", "upstream": "x", "qty": 1, "cost": 5.0},
        headers={"Idempotency-Key": "k-1"},
    )
    assert r.status_code == 200
    assert called["action"] == "finance-buy"


def test_finance_retire_lewat_guard(auth_client, monkeypatch):
    """POST /api/finance/retire gated: action finance-retire."""
    called = {}

    def fake_guard(req, conn, entity, action, executor, **kw):
        called["action"] = action
        return 200, {"ok": True, "id": "A-073", "status": "retired"}

    monkeypatch.setattr(app_module, "guard_mutation", fake_guard)
    r = auth_client.post(
        "/api/finance/retire",
        json={"id": "A-073", "label": "mati/expired"},
        headers={"Idempotency-Key": "k-2"},
    )
    assert r.status_code == 200
    assert called["action"] == "finance-retire"


def test_finance_refund_lewat_guard(auth_client, monkeypatch):
    """POST /api/finance/refund gated: action finance-refund."""
    called = {}

    def fake_guard(req, conn, entity, action, executor, **kw):
        called["action"] = action
        return 200, {"ok": True, "id": "R-1", "upstream": "x", "amount_usdc": 2.0}

    monkeypatch.setattr(app_module, "guard_mutation", fake_guard)
    r = auth_client.post(
        "/api/finance/refund",
        json={"id": "R-1", "upstream": "x", "amount_usdc": 2.0},
        headers={"Idempotency-Key": "k-3"},
    )
    assert r.status_code == 200
    assert called["action"] == "finance-refund"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_finance_actions.py -v`
Expected: FAIL (route `api_finance_buy`/`api_finance_retire`/`api_finance_refund` belum ada).

- [ ] **Step 3: Implement**

Di `backend/app.py`:

```python
@app.route("/api/finance/buy", methods=["POST"])
def api_finance_buy():
    body = request.get_json(silent=True) or {}
    def _exec():
        # upsert_asset membuka koneksi SENDIRI + commit sendiri (ledger_update.py:114
        # `with conn() as c`); guard tetap menulis replay row pada koneksinya —
        # commit terpisah TAPI atomic dari sisi operasi asset (audit asset ditulis
        # upsert_asset sendiri via audit_write). Ini keputusan desain: operasi
        # ledger nyata tidak boleh setengah jadi.
        from ledger_update import upsert_asset
        upsert_asset({"id": body["id"], "upstream": body["upstream"], "qty": int(body.get("qty", 1)),
                      "cost_per": float(body["cost"]), "curr": body.get("curr", "USD"),
                      "buy": body.get("buy", ""), "lifespan_d": int(body.get("lifespan", 30)),
                      "status": "active", "label": body.get("label", "")})
        return 200, {"ok": True, "id": body["id"]}
    name, role = get_operator(auth_token())
    status, payload = guard_mutation(request, db_connect(), "assets", "finance-buy", _exec,
                                     idempotency_key=request.headers.get("Idempotency-Key"),
                                     actor=name, source="dashboard",
                                     actor_role=role, required_roles=["admin", "ops"],
                                     request_body=body, rollback_hook=None)
    return jsonify(payload), status
```

CATATAN impl:
- Route TIDAK dipanggil langsung oleh test — test memakai `auth_client.post(...)`; route membaca `request` global Flask (seperti semua route lain di app.py). Contract return: karena `guard_mutation` menghasilkan tuple `(status, payload)`, route harus mengembalikan `jsonify(payload), status` — ikuti pola route POST existing di app.py (mis. `/api/topups` POST ~1769) supaya Flask bisa render.
- `get_operator(auth_token())` menerima STRING token dari `auth_token()` (lihat Task 3 — contract `get_operator(token)`, bukan `get_operator(request)`); bila token lama 2-part → fallback ("operator","operator").
- Otorisasi role (P4-Q13): finance actions butuh `required_roles=["admin", "ops"]`; bila role tidak berhak → `guard_mutation` lempar `MutationGuardError(403)`. Route harus tangkap `MutationGuardError` → `jsonify({"error": e.message}), e.status_code` (pola Task 4/6).
- Matriks role (default: role "operator" TIDAK bisa mutasi keuangan): finance buy/retire/refund → admin/ops; config pricing (Task 4) → admin; pricing global (Task 6) → admin.

### Contract routes retire/refund (EXECUTABLE — implementasi + test kedua route):

```python
@app.route("/api/finance/retire", methods=["POST"])
def api_finance_retire():
    """Retire asset: {id, label?}. Status asset -> 'retired'. Gated, admin/ops."""
    body = request.get_json(silent=True) or {}
    aid = (body.get("id") or "").strip()
    if not aid:
        return jsonify({"error": "id required"}), 400

    def _exec():
        # update_asset_status buka koneksi SENDIRI + commit sendiri (ledger_update.py:143);
        # guard menulis replay row di koneksinya — desain: operasi ledger atomic.
        from ledger_update import update_asset_status
        update_asset_status(aid, "retired", body.get("label", "mati/expired"))
        return 200, {"ok": True, "id": aid, "status": "retired"}

    name, role = get_operator(auth_token())
    try:
        status, payload = guard_mutation(
            request, db_connect(), "assets", "finance-retire", _exec,
            idempotency_key=request.headers.get("Idempotency-Key"),
            actor=name, source="dashboard", request_body=body,
            actor_role=role, required_roles=["admin", "ops"])
    except MutationGuardError as e:
        return jsonify({"error": e.message}), e.status_code
    return jsonify(payload), status


@app.route("/api/finance/refund", methods=["POST"])
def api_finance_refund():
    """Catat refund: {id, upstream, qty?, amount_usdc, date?, label?}.
    Insert row ke tabel `refunds` (db_schema.py:43: id TEXT PK, upstream TEXT,
    qty INT DEFAULT 0, amount_idr DOUBLE PRECISION DEFAULT 0, amount_usdc DOUBLE
    PRECISION DEFAULT 0, label TEXT, date DATE, synced_at; + kurs_idr_usd,
    created_by, created_at). Gated, admin/ops.
    """
    body = request.get_json(silent=True) or {}
    rid = (body.get("id") or "").strip()
    if not rid:
        return jsonify({"error": "id required"}), 400
    upstream = (body.get("upstream") or "").strip()
    if not upstream:
        return jsonify({"error": "upstream required"}), 400
    try:
        amount_usdc = float(body.get("amount_usdc", body.get("amountUsdc")))
    except (TypeError, ValueError):
        return jsonify({"error": "amount_usdc numeric required"}), 400

    def _exec():
        # tulis dalam SATU transaksi koneksi guard (tanpa commit) — guard yang commit
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO refunds (id, upstream, qty, amount_idr, amount_usdc, label, date, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                  upstream=EXCLUDED.upstream, qty=EXCLUDED.qty,
                  amount_idr=EXCLUDED.amount_idr, amount_usdc=EXCLUDED.amount_usdc,
                  label=EXCLUDED.label, date=EXCLUDED.date
            """, (rid, upstream, int(body.get("qty") or 0), 0.0, amount_usdc,
                  body.get("label"), (body.get("date") or "")[:10] or None, name))
        return 200, {"ok": True, "id": rid, "upstream": upstream, "amount_usdc": amount_usdc}

    conn = db_connect()
    try:
        name, role = get_operator(auth_token())
        status, payload = guard_mutation(
            request, conn, "refunds", "finance-refund", _exec,
            idempotency_key=request.headers.get("Idempotency-Key"),
            actor=name, source="dashboard", request_body=body,
            actor_role=role, required_roles=["admin", "ops"])
    except MutationGuardError as e:
        return jsonify({"error": e.message}), e.status_code
    finally:
        conn.close()
    return jsonify(payload), status
```

CATATAN: route retire/refund TERHUBUNG financial_audit via guard (`audit_action` `finance-retire`/`finance-refund`). Buy/retire memakai helper ledger_update (koneksi sendiri, atomic); refund menulis DB langsung dalam transaksi koneksi guard (pola Task 4/6). Semua `MutationGuardError` → `jsonify({"error": e.message}), e.status_code`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_finance_actions.py -v`
Expected: 3 passed (buy + retire + refund).

- [ ] **Step 5: Run full suite**

Run: `cd backend && python -m pytest --cov=logic --cov=app --cov-report=term-missing -q`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app.py backend/tests/test_finance_actions.py
git commit -m "feat: finance dashboard actions gated (buy/retire/refund) P4-Q10"```

---

### Task 8: Recon Earning-Equation Fix (P4-Q12a)

**Files:**
- Modify: `scripts/recon_finance.py` (invariant earning equation + classifier)
- Create: `backend/tests/test_recon_earning_classifier.py`

**Interfaces:**
- Produces: `classify_earning_violation(balance, withdrawn, lifetime, ts, baseline)` → `'ok' | 'withdrawn_transition' | 'precision' | 'unexplained'`; invariant exit 0 hanya jika tidak ada 'unexplained' (opsi B — klasifikasi, strict pada unexplained).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_recon_earning_classifier.py`:

```python
"""Test klasifikasi pelanggaran earning equation (P4-Q12a)."""
from recon_earning import classify_earning_violation


def test_exact_match_ok():
    assert classify_earning_violation(100.0, 30.0, 130.0, "2026-08-11 00:00:00",
                                      baseline="2026-08-10 17:56:45") == "ok"


def test_precision_only_ok():
    assert classify_earning_violation(100.0, 30.0, 130.001, "2026-08-11 00:00:00",
                                      baseline="2026-08-10 17:56:45") == "precision"


def test_withdrawn_transition_ok():
    # withdrawn naik 0->130 dalam satu baris: balance+withdrawn baru = lifetime
    assert classify_earning_violation(0.0, 130.0, 130.0, "2026-08-11 00:00:00",
                                      baseline="2026-08-10 17:56:45") == "withdrawn_transition"


def test_unexplained_fail():
    assert classify_earning_violation(50.0, 30.0, 130.0, "2026-08-11 00:00:00",
                                      baseline="2026-08-10 17:56:45") == "unexplained"


def test_pre_baseline_excluded():
    assert classify_earning_violation(50.0, 30.0, 130.0, "2026-08-09 00:00:00",
                                      baseline="2026-08-10 17:56:45") == "ok"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_recon_earning_classifier.py -v`
Expected: FAIL `ModuleNotFoundError: No module named 'recon_earning'`.

- [ ] **Step 3: Implement**

Create `backend/recon_earning.py`:

```python
"""Klasifikasi pelanggaran earning equation (Phase 4 Q12a).

Invariant: abs((balance+withdrawn) - publisher_lifetime) <= 0.01 untuk ts >= baseline.
Klasifikasi: ok (match), precision (delta <= 0.01), withdrawn_transition
(balance lama 0 & withdrawn==lifetime — sync artifact), unexplained (strict FAIL).
"""
from datetime import datetime


def classify_earning_violation(balance, withdrawn, lifetime, ts, baseline="2026-08-10 17:56:45"):
    try:
        ts_dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        bl_dt = datetime.fromisoformat(baseline.replace("Z", "+00:00"))
        if ts_dt < bl_dt:
            return "ok"  # pre-baseline excluded
    except Exception:
        pass

    bal = float(balance or 0)
    wd = float(withdrawn or 0)
    lt = float(lifetime or 0)
    delta = abs((bal + wd) - lt)
    if delta <= 0.01:
        return "ok"
    if delta <= 0.05:  # precision-only
        return "precision"
    if bal == 0 and abs(wd - lt) <= 0.01:
        return "withdrawn_transition"
    return "unexplained"
```

CATATAN: di `scripts/recon_finance.py`, ganti query agregat dengan per-row classification via module ini (import via sys.path backend); exit 1 hanya jika ada `unexplained`; `precision`/`withdrawn_transition` → WARN.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_recon_earning_classifier.py -v`
Expected: 5 passed.

- [ ] **Step 5: Run full suite**

Run: `cd backend && python -m pytest --cov=logic --cov=app --cov-report=term-missing -q`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/recon_earning.py backend/tests/test_recon_earning_classifier.py scripts/recon_finance.py
git commit -m "fix: recon earning-equation classifier (P4-Q12a) — strict pada unexplained"
```

---

### Task 9: app.py Coverage ≥80 via Critical-Path Route Tests (P4-Q12b)

**Files:**
- Modify: `backend/tests/test_app_p4_routes.py` (create)
- Modify: `.github/workflows/ci.yml` (tambah gate app coverage)

**Interfaces:**
- Produces: route tests utk critical paths; CI gate `--cov=app --cov-fail-under=80`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_app_p4_routes.py` (create; gunakan conftest mocks yang ada):

```python
"""Critical-path route tests (Phase 4 Q12b) — raise app.py coverage."""
import pytest
import app as app_module


@pytest.fixture
def client():
    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as c:
        yield c


def test_health_route(client):
    # Route health = `/health` (app.py:2458), BUKAN `/api/health`.
    r = client.get("/health")
    assert r.status_code == 200


def test_login_route(client, monkeypatch):
    monkeypatch.setattr(app_module, "DASHBOARD_PASSWORD", "test-pass")
    r = client.post("/api/login", json={"password": "test-pass", "operator_name": "Faiz"})
    assert r.status_code == 200
    assert "token" in r.get_json()


def test_finance_route_authed(client, monkeypatch):
    monkeypatch.setattr(app_module, "db_read_finance", lambda: {"net_income": 10.0})
    monkeypatch.setattr(app_module, "get_operator", lambda t: ("Faiz", "admin"))
    r = client.get("/api/finance", headers={"Authorization": "Bearer fake-token"})
    assert r.status_code == 200


def test_pricing_route_authed(client, monkeypatch):
    monkeypatch.setattr(app_module, "_load_pricing_merged", lambda: {"globals": {}, "overrides": [], "orderbook": []})
    monkeypatch.setattr(app_module, "get_operator", lambda t: ("Faiz", "admin"))
    r = client.get("/api/pricing", headers={"Authorization": "Bearer fake-token"})
    assert r.status_code == 200
```

CATATAN: sesuaikan fixture auth dengan mekanisme sebelum-request yang ada (mock `get_operator`/token validator); tambahkan tests error/timeout/DB-failure branch + arm/disarm + reliability summary/stream sampai coverage app ≥80.

- [ ] **Step 2: Run test to verify they fail (red)**

Run: `cd backend && python -m pytest tests/test_app_p4_routes.py -v`
Expected: FAIL sebagian (route/fixture mismatch — iterasi per test sampai hijau).

- [ ] **Step 3: Iterate hingga coverage ≥80**

Run: `cd backend && python -m pytest --cov=app --cov-report=term-missing -q`
Expected: app coverage ≥80% (tambah tests critical-path + error/DB-failure + mutasi + arm/disarm + reliability sampai tercapai; jangan pragma mengecualikan route).

- [ ] **Step 4: Tambah CI gate**

`.github/workflows/ci.yml` — tambah step di job backend:

```yaml
      - name: App coverage gate (Phase 4 Q12b)
        run: |
          cd backend
          python -m pytest tests/test_app_p4_routes.py tests/test_finance_routes.py \
            --cov=app --cov-report=term-missing --cov-fail-under=80 -q
```

- [ ] **Step 5: Run full suite**

Run: `cd backend && python -m pytest --cov=logic --cov=app --cov-report=term-missing -q`
Expected: ALL PASS, app ≥80.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/test_app_p4_routes.py .github/workflows/ci.yml
git commit -m "test: app.py coverage ≥80 critical-path routes + CI gate (P4-Q12b)"
```

---

### Task 10: rclone Offsite Backup (P4-Q12c)

**Files:**
- Modify: `scripts/backup_db.sh` (offsite status marker + RCLONE_CONFIG explicit)
- Create: `scripts/tests/test_backup_offsite.sh`
- Modify: `docs/OPS-RUNBOOK.md` (offsite contract)

**Interfaces:**
- Produces: offsite run emits status marker `/home/gamesim/.backup-offsite-status` (timestamp + result); script tidak mengklaim offsite success bila skip; `RCLONE_CONFIG` explicit.

- [ ] **Step 1: Write the failing test**

`scripts/tests/test_backup_offsite.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
# Stub pg_dump + rclone, verify offsite gate + status marker (P4-Q12c).
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT

export BACKUP_DIR="$TEST_DIR/backups"
export UPSTREAM_DB="postgresql://x:x@127.0.0.1:1/x"
export PATH="$TEST_DIR/bin:$PATH"
mkdir -p "$TEST_DIR/bin"

# Repo-root resolution: test dijalankan dari scripts/ — jangan hardcode CWD.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-$REPO_ROOT/scripts/backup_db.sh}"

cat > "$TEST_DIR/bin/pg_dump" <<'EOF'
#!/usr/bin/env bash
cat /dev/null
EOF
cat > "$TEST_DIR/bin/rclone" <<'EOF'
#!/usr/bin/env bash
echo "rclone-call"
EOF
chmod +x "$TEST_DIR/bin/pg_dump" "$TEST_DIR/bin/rclone"

# offsite env tidak ada → skip offsite, status marker = skipped, exit 0
# Path injectable (WWMA_ENV_FILE/OFFSITE_STATUS/RCLONE_CONFIG) — lihat Step 3;
# test ini akan FAIL di Step 1 karena variabel tsb belum dibaca script.
export OFFSITE_STATUS="$TEST_DIR/offsite-status"
export WWMA_ENV_FILE="$TEST_DIR/wwma-env-missing"
if UPSTREAM_BACKUP_SKIP_S3=1 bash "$BACKUP_SCRIPT"; then
  echo "PASS: backup local exit 0"
else
  echo "FAIL: backup local exit != 0"
  exit 1
fi
grep -q "offsite skipped" "$OFFSITE_STATUS" || { echo "FAIL: skipped marker"; exit 1; }
echo "PASS: skipped marker (injectable path)"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && bash tests/test_backup_offsite.sh`
Expected: FAIL (marker belum ada).

- [ ] **Step 3: Implement**

Di `scripts/backup_db.sh` (60 baris; verified 2026-08-21), tambahkan **path injectable** di bagian atas (setelah `RETENTION_DAYS`):

```bash
# ── Path injectable — override via env utk test (default = prod) ──
WWMA_ENV_FILE="${WWMA_ENV_FILE:-/run/wwma/env}"
OFFSITE_STATUS="${OFFSITE_STATUS:-/home/gamesim/.backup-offsite-status}"
RCLONE_CONFIG="${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}"
export RCLONE_CONFIG
```

Ganti gate offsite (baris 34) — pakai `${WWMA_ENV_FILE}`, bukan hardcoded `/run/wwma/env`:

```bash
if [ -f "${WWMA_ENV_FILE}" ] && [ -z "${UPSTREAM_BACKUP_SKIP_S3:-}" ] && command -v rclone >/dev/null 2>&1; then
  set +e
  S3_PREFIX_UP="${S3_PREFIX_UP:-upstream-dashboard}"
  # shellcheck disable=SC1091
  . "${WWMA_ENV_FILE}"
  export S3_ENDPOINT="${S3_ENDPOINT:-https://is3.cloudhost.id}"
  if [ -n "${S3_BUCKET:-}" ]; then
    if rclone copy "${OUTFILE}" "is3:${S3_BUCKET}/${S3_PREFIX_UP%/}/db/" --log-level ERROR; then
      echo "✓ Offsite: is3:${S3_BUCKET}/${S3_PREFIX_UP%/}/db/$(basename "${OUTFILE}")"
      # verifikasi: rclone ls sukses → offsite ok; gagal → offsite failed
      if rclone ls "is3:${S3_BUCKET}/${S3_PREFIX_UP%/}/db/" >/dev/null 2>&1; then
        echo "offsite ok $(date -u +%FT%TZ)" > "$OFFSITE_STATUS"
      else
        echo "offsite failed $(date -u +%FT%TZ)" > "$OFFSITE_STATUS"
        echo "WARN: offsite upload tidak terverifikasi" >&2
      fi
      # Retensi remote 30 hari (blok existing, tidak berubah)
      rclone ls "is3:${S3_BUCKET}/${S3_PREFIX_UP%/}/db/" 2>/dev/null | while read -r _size name; do
        stamp="${name#inferhub-}"; stamp="${stamp%.sql.gz}"
        if [ -n "$stamp" ] && [ "${#stamp}" -ge 15 ]; then
          ts="${stamp:0:8} ${stamp:9:2}:${stamp:11:2}:${stamp:13:2}"
          if [ "$(date -d "${ts}" +%s 2>/dev/null)" -lt "$(date -d '-30 days' +%s)" ]; then
            rclone delete "is3:${S3_BUCKET}/${S3_PREFIX_UP%/}/db/${name}" --log-level ERROR 2>/dev/null
          fi
        fi
      done
    else
      echo "offsite failed $(date -u +%FT%TZ)" > "$OFFSITE_STATUS"
      echo "WARN: offsite upload gagal" >&2
    fi
  else
    echo "offsite skipped $(date -u +%FT%TZ)" > "$OFFSITE_STATUS"
    echo "⚠️ Offsite dilewati: S3_BUCKET kosong"
  fi
  set -e
else
  echo "offsite skipped $(date -u +%FT%TZ)" > "$OFFSITE_STATUS"
  echo "⚠️ Offsite dilewati: rclone / ${WWMA_ENV_FILE} tidak ada"
fi
```

Marker kontrak (isi PERSIS): `offsite skipped <ISO-UTC>` / `offsite ok <ISO-UTC>` / `offsite failed <ISO-UTC>`. Gagal offsite ≠ gagal backup lokal — script tetap exit 0.

- [ ] **Step 4: Run test to verify it passes**

Update `scripts/tests/test_backup_offsite.sh` — tambah `WWMA_ENV_FILE` + `OFFSITE_STATUS` injectable dan stub rclone deterministik utk KETIGA state (tanpa /run, tanpa root, tanpa rclone asli):

```bash
#!/usr/bin/env bash
set -euo pipefail
# Stub pg_dump + rclone, verify offsite gate + status marker (P4-Q12c).
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT

# Resolve repo root: test dijalankan dari scripts/ (bash tests/test_backup_offsite.sh).
# Pakai repo-root-relative path ke backup_db.sh supaya TIDAK bergantung CWD.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-$REPO_ROOT/scripts/backup_db.sh}"

export BACKUP_DIR="$TEST_DIR/backups"
export UPSTREAM_DB="postgresql://x:x@127.0.0.1:1/x"
export PATH="$TEST_DIR/bin:$PATH"
mkdir -p "$TEST_DIR/bin"

cat > "$TEST_DIR/bin/pg_dump" <<'EOF'
#!/usr/bin/env bash
cat /dev/null
EOF
# Stub rclone deterministik: SUCCESS default; STUB_RCLONE_EXIT != 0 → gagal.
cat > "$TEST_DIR/bin/rclone" <<'EOF'
#!/usr/bin/env bash
echo "rclone-call $*"
exit "${STUB_RCLONE_EXIT:-0}"
EOF
chmod +x "$TEST_DIR/bin/pg_dump" "$TEST_DIR/bin/rclone"

# env file dummy (disource script; sumber S3_BUCKET)
echo 'export S3_BUCKET=test-bucket' > "$TEST_DIR/wwma-env"
touch "$TEST_DIR/rclone.conf"

export OFFSITE_STATUS="$TEST_DIR/offsite-status"
export WWMA_ENV_FILE="$TEST_DIR/wwma-env"
export RCLONE_CONFIG="$TEST_DIR/rclone.conf"

# case skipped: SKIP_S3=1 → gate gagal → marker "offsite skipped"
UPSTREAM_BACKUP_SKIP_S3=1 bash "$BACKUP_SCRIPT"
grep -q "offsite skipped" "$OFFSITE_STATUS" || { echo "FAIL: skipped marker"; exit 1; }
echo "PASS: skipped marker"

# case ok: rclone sukses (STUB_RCLONE_EXIT=0) + env dummy + S3_BUCKET → "offsite ok"
STUB_RCLONE_EXIT=0 bash "$BACKUP_SCRIPT"
grep -q "offsite ok" "$OFFSITE_STATUS" || { echo "FAIL: ok marker"; exit 1; }
echo "PASS: ok marker"

# case failed-upload: rclone copy gagal (STUB_RCLONE_EXIT=1) → "offsite failed"
STUB_RCLONE_EXIT=1 bash "$BACKUP_SCRIPT"
grep -q "offsite failed" "$OFFSITE_STATUS" || { echo "FAIL: failed marker"; exit 1; }
echo "PASS: failed marker"

echo "ALL PASS: offsite status marker (3 states)"
```

Run: `cd scripts && bash tests/test_backup_offsite.sh`
Expected: PASS (marker created + isi sesuai state; tanpa permission error karena path injectable; tanpa root — `/run/wwma/env` TIDAK disentuh).

- [ ] **Step 5: Docs fix**

`docs/OPS-RUNBOOK.md` — ganti klaim "14d local/30d offsite" menjadi "14d local; 30d offsite hanya jika status marker `offsite ok` (cek `/home/gamesim/.backup-offsite-status`)" — konsisten di README + PRODUCTION-LOCK.

- [ ] **Step 6: Commit**

```bash
git add scripts/backup_db.sh scripts/tests/test_backup_offsite.sh docs/OPS-RUNBOOK.md
git commit -m "fix: backup offsite status marker + docs (P4-Q12c)"
```

---

### Task 11: Frontend — Unified Pricing Page + Orderbook Merge (P4-Q11)

**Files:**
- Modify: `frontend/src/pages/AutoPricing.jsx` (rename/unify → Pricing)
- Modify: `frontend/src/App.jsx` (route `/auto-pricing` → render Pricing; keep path)
- Modify: `frontend/src/components/Layout.jsx` (TITLES)
- Modify: `frontend/src/components/Sidebar.jsx` (label)
- Create: `frontend/src/components/PricingPage.jsx` + `frontend/src/components/PricingPage.test.jsx`

**Interfaces:**
- Produces: halaman Pricing = global per-upstream config + per-model override CRUD (gated, Idempotency-Key) + orderbook merged (manual ask + auto-pricing).

- [ ] **Step 1: Write the failing test**

`frontend/src/components/PricingPage.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import PricingPage from './PricingPage';

describe('PricingPage', () => {
  it('renders globals, overrides and orderbook sections', () => {
    render(<PricingPage
      globals={{ clinepass: { max_ask_pct: 0.05 } }}
      overrides={[{ upstream: 'clinepass', model_id: 'm1', trigger_pct: 0.1 }]}
      orderbook={[{ upstream: 'clinepass', model_id: 'm1', ask: 0.08 }]}
    />);
    expect(screen.getByText(/clinepass/i)).toBeInTheDocument();
    expect(screen.getByText(/max_ask_pct/i)).toBeInTheDocument();
    expect(screen.getByText(/trigger_pct/i)).toBeInTheDocument();
    expect(screen.getByText(/ask/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/PricingPage.test.jsx`
Expected: FAIL `Cannot find module './PricingPage'`.

- [ ] **Step 3: Implement PricingPage.jsx**

`frontend/src/components/PricingPage.jsx` (baca pola AutoPricing.jsx + FinanceStatus.jsx yang ada):

```jsx
export default function PricingPage({ globals = {}, overrides = [], orderbook = [] }) {
  return (
    <section className="pricing-page" aria-label="Pricing control plane">
      <h3>Pricing Control</h3>
      <div className="pricing-globals">
        <h4>Global per Upstream</h4>
        {Object.entries(globals).map(([up, cfg]) => (
          <div key={up} className="pricing-global">
            <strong>{up}</strong>
            <span>max_ask_pct: {cfg.max_ask_pct}</span>
            <span>platform_fee_pct: {cfg.platform_fee_pct}</span>
            <span>publisher_share_pct: {cfg.publisher_share_pct}</span>
          </div>
        ))}
      </div>
      <div className="pricing-overrides">
        <h4>Per-Model Override</h4>
        {overrides.map((o) => (
          <div key={`${o.upstream}-${o.model_id}`} className="pricing-override">
            <span>{o.upstream} / {o.model_id}</span>
            <span>trigger_pct: {o.trigger_pct}</span>
            <span>rebound_pct: {o.rebound_pct}</span>
          </div>
        ))}
      </div>
      <div className="pricing-orderbook">
        <h4>Orderbook (merged asks + auto-pricing)</h4>
        {orderbook.map((o) => (
          <div key={`${o.upstream}-${o.model_id}`} className="pricing-order-row">
            <span>{o.upstream} / {o.model_id}</span>
            <span>ask: {o.ask}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/PricingPage.test.jsx`
Expected: PASS.

- [ ] **Step 5: Integrate ke App.jsx + data fetch**

Baca `AutoPricing.jsx` saat implementasi; ubah halaman agar memakai `useApi('/api/pricing')` (tambahkan `/api/pricing` ke allowlist useApi.jsx FOCUSED prefixes) dan render `<PricingPage globals={data?.globals} overrides={data?.overrides} orderbook={data?.orderbook} />`; guard null.

- [ ] **Step 6: Full frontend test + build**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: PASS (thresholds 80/80/70/80) + build sukses.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: unified Pricing page + orderbook merge (P4-Q11)"
```

---

### Task 12: Frontend — Page-Level Tests Critical Workflows (P4-Q13)

**Files:**
- Modify: `frontend/src/App.test.jsx` (login/session expiry flow)
- Create: `frontend/src/components/LoginFlow.test.jsx`, `frontend/src/components/PricingMutations.test.jsx`, `frontend/src/components/FinanceActions.test.jsx`

**Interfaces:**
- Produces: page-level tests: login/session-expiry, pricing config CRUD, arm/disarm, finance actions, orderbook view, error/rollback states, responsive nav.

- [ ] **Step 1: Write tests**

`frontend/src/components/LoginFlow.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import LoginGate from './LoginGate'; // komponen login aktual (bukan Login.jsx)

describe('LoginFlow', () => {
  it('menampilkan error saat password salah', async () => {
    // mock loginWithPassword reject → expect error state
    render(<LoginGate><div>dashboard</div></LoginGate>);
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /masuk/i }));
    expect(await screen.findByText(/login gagal/i)).toBeInTheDocument();
  });

  it('menampilkan form login saat belum ada token', () => {
    // sessionStorage kosong → LoginGate render form login (bukan children)
    render(<LoginGate><div>dashboard</div></LoginGate>);
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /masuk/i })).toBeInTheDocument();
  });

  it('merender children saat token ada', () => {
    // set session token (getSessionToken truthy) → LoginGate render children
    const { getSessionToken } = require('../hooks/useApi');
    // gunakan setSessionToken dari useApi bila perlu; cleanup sessionStorage di afterEach
    render(<LoginGate><div>dashboard-content</div></LoginGate>);
    expect(screen.getByText('dashboard-content')).toBeInTheDocument();
  });
});
```

CATATAN (verified 2026-08-21): komponen login aktual adalah `LoginGate.jsx` (`export default function LoginGate({ children })`), BUKAN `Login.jsx`. Form login: input password via `placeholder="Dashboard password"` (tidak pakai `<label>`), tombol submit text `Masuk`, error state teks `Login gagal: ...` dengan `role="alert"`. Session expiry sudah ditangani LoginGate via listener `session-expired` (setSessionToken('') + render form login). `loginWithPassword(password)` ada di `frontend/src/hooks/useApi.jsx` (export). Adaptasi test ke struktur aktual: mock `../hooks/useApi` (loginWithPassword resolve/reject, getSessionToken/setSessionToken spy) bila perlu; pastikan sessionStorage di-reset antar test. Tambah test session-expiry (event 'session-expired' → form login muncul lagi), pricing config CRUD gated (Idempotency-Key header), arm/disarm, finance actions, orderbook view, error/rollback states, responsive nav.

- [ ] **Step 2: Run tests — iterate sampai PASS**

Run: `cd frontend && npx vitest run src/components/LoginFlow.test.jsx src/components/PricingMutations.test.jsx src/components/FinanceActions.test.jsx`
Expected: PASS semua.

- [ ] **Step 3: Full frontend test + build**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: PASS (thresholds 80/80/70/80) + build sukses.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/
git commit -m "test: page-level critical workflows (P4-Q13)"
```

---

### Task 13: Verifikasi Final + PR (pola Phase 3)

**Files:**
- Seluruh perubahan Task 1-12.

- [ ] **Step 1: Backend full suite + coverage**

Run: `cd backend && python -m pytest --cov=logic --cov=app --cov-report=term-missing -q && python -m pytest tests/test_logic.py --cov=logic --cov-fail-under=80 -q && python -m pytest tests/test_finance_rules.py tests/test_financial_audit.py tests/test_recon_checks.py tests/test_mutation_guard.py tests/test_db_schema_p4.py tests/test_identity_session.py tests/test_config_fail_closed.py tests/test_payout_dedup.py tests/test_pricing_global_orderbook.py tests/test_finance_actions.py tests/test_recon_earning_classifier.py --cov=finance_rules --cov=financial_audit --cov=mutation_guard --cov=recon_earning --cov-fail-under=80 -q && python -m pytest tests/test_app_p4_routes.py tests/test_finance_routes.py --cov=app --cov-fail-under=80 -q`
Expected: ALL PASS, masing-masing gate ≥80.

- [ ] **Step 2: Frontend full suite + build**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: PASS (thresholds 80/80/70/80) + build sukses.

- [ ] **Step 3: Secret scan + diff check**

Run: `grep -rn "wwma_app_production\|upstream_local\|gamesim:upstream" backend/ scripts/ frontend/src/ || echo CLEAN` + `git diff --check`
Expected: CLEAN + no whitespace errors.

- [ ] **Step 4: Push branch + buka PR**

```bash
git checkout -b feat/phase4-control-plane
git push -u origin feat/phase4-control-plane
gh pr create --title "feat: Phase 4 Dashboard Control Plane (mutation guard, pricing page, debt cleanup)" \
  --body "Closes Phase 4: mutation wrapper (idempotency+audit+rollback), operator identity+role session, fail-closed config, payout UUID fix, pricing merged view + orderbook, finance dashboard actions, recon earning classifier, app.py coverage ≥80, backup offsite status. CI only (no CD)."
```

- [ ] **Step 5: Tunggu CI green**

Run: `gh pr checks --watch`
Expected: backend + frontend jobs PASS.

- [ ] **Step 6: Merge PR**

```bash
gh pr merge --squash --delete-branch
```

---

### Task 14: Deploy Production (setelah merge + backup)

**Files:**
- VPS: `/home/gamesim/dashboard` (pull main), systemd user services
- Vercel: `upstream-static`

**Prerequisite:** Backup dulu (wajib):
```bash
ssh root@82.25.62.204 'su - gamesim -c "cd /home/gamesim/dashboard && set -a && . /home/gamesim/.dashboard.env && set +a && UPSTREAM_BACKUP_SKIP_S3=1 bash scripts/backup_db.sh"'
```

- [ ] **Step 1: Deploy backend (VPS)**

```bash
ssh root@82.25.62.204 'su - gamesim -c "cd /home/gamesim/dashboard && git stash --include-untracked -m vps-local-pre-p4 2>/dev/null; git pull --ff-only origin main"'
ssh root@82.25.62.204 'systemctl --user -M gamesim@ daemon-reload && systemctl --user -M gamesim@ restart wwma-upstream-backend.service wwma-finance.service'
```
Verifikasi:
```bash
ssh root@82.25.62.204 'systemctl --user -M gamesim@ --no-pager status wwma-upstream-backend.service | head -8'
```

- [ ] **Step 2: Migrasi schema additive (mutation_replay + operator_session) — otomatis di ensure_schema saat startup backend; verifikasi:**

```bash
ssh root@82.25.62.204 'su - gamesim -c "set -a && . /home/gamesim/.dashboard.env && set +a && /home/gamesim/.venv-dash/bin/python3 -c \"import psycopg; c=psycopg.connect(__import__(\"os\").environ[\"UPSTREAM_DB\"]); r=c.execute(\"SELECT to_regclass(%s)\",(\"public.mutation_replay\",)).fetchone(); print(\"mutation_replay:\", r[0]); c.close()\""'
```
Expected: `mutation_replay: public.mutation_replay` + operator_session.

- [ ] **Step 3: Deploy frontend (Vercel)**

```bash
ssh root@82.25.62.204 'su - gamesim -c "export VERCEL_TOKEN=\$(grep VERCEL_TOKEN ~/.hermes-suisui/.env | cut -d= -f2); cd /home/gamesim/dashboard/frontend && npx vercel deploy --prod --yes --token \"\$VERCEL_TOKEN\""'
```

- [ ] **Step 4: Smoke test penuh**

```bash
curl -s -o /dev/null -w "frontend %{http_code}\n" https://upstream-static.vercel.app/
curl -s -o /dev/null -w "backend-health %{http_code}\n" https://ops.budgezen.com/api/health
# login + operator name
curl -s -X POST https://ops.budgezen.com/api/login -H "Content-Type: application/json" \
  -d '{"password":"'"$DASHBOARD_PASSWORD"'","operator_name":"deploy-check"}' | head -c 200
# pricing (authed, new merged view)
TOKEN=$(curl -s -X POST https://ops.budgezen.com/api/login -H "Content-Type: application/json" \
  -d '{"password":"'"$DASHBOARD_PASSWORD"'"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s https://ops.budgezen.com/api/pricing -H "Authorization: Bearer $TOKEN" | python -m json.tool | head -40
curl -s https://ops.budgezen.com/api/finance -H "Authorization: Bearer $TOKEN" | python -m json.tool | head -20
curl -s -o /dev/null -w "reliability %{http_code}\n" https://ops.budgezen.com/api/reliability/summary -H "Authorization: Bearer $TOKEN"
```
Expected: 200 semua; pricing merged view menampilkan globals/overrides/orderbook.

- [ ] **Step 5: Jalankan recon + cek offsite status**

```bash
ssh root@82.25.62.204 'su - gamesim -c "cd /home/gamesim/dashboard && set -a && . /home/gamesim/.dashboard.env && set +a && /home/gamesim/.venv-dash/bin/python3 scripts/recon_finance.py"'
ssh root@82.25.62.204 'cat /home/gamesim/.backup-offsite-status 2>/dev/null || echo "marker belum ada"'
```
Expected: recon PASS (earning classifier: hanya unexplained yang FAIL; 192 lama → classified); offsite status marker terlihat.

---

### Task 15: Evidence + Audit 5/5 (pola Phase 3)

**Files:**
- Create: `artifacts/phase4/deploy/evidence-<ts>Z.md`
- Create: `artifacts/phase4/audit/phase4-audit.md`

- [ ] **Step 1: Buat evidence (template inline)**

`artifacts/phase4/deploy/evidence-<ts>Z.md`:

```markdown
# Phase 4 Release Evidence — Dashboard Control Plane

- **Title**: Phase 4 Control Plane (mutation guard, pricing page, debt cleanup)
- **Timestamp (UTC)**: <YYYY-MM-DDTHH:MM:SSZ>
- **Operator**: Sisyphus (orchestrator)
- **Source commit**: <hash main setelah merge>
- **Release description**: mutation wrapper (idempotency+audit+rollback), operator
  identity+role session, fail-closed config, payout UUID fix, pricing merged view +
  orderbook, finance dashboard actions gated, recon earning classifier, app.py
  coverage ≥80, backup offsite status marker.

## Backup (pre-deploy)
- Path: `<backup path>`
- sha256: `<hash>`
- Retention: 14d local / 30d offsite (status marker: ok/skipped — jangan klaim bila skip)

## Schema
- Additive: `mutation_replay` + `operator_session` + `pricing_config_upstream` (CREATE IF NOT EXISTS). Verifikasi: <output>.

## Systemd (VPS)
- `wwma-upstream-backend.service`: <active (running), MainPID>
- `wwma-finance.service`: <status>

## Smoke test
- Frontend → HTTP 200; Backend health → 200/401; Login + operator_name → 200 token;
  Pricing merged → 200 (globals/overrides/orderbook); Finance → 200; Reliability → 200.

## Reconciliation
- `recon_finance.py` → PASS (earning classifier: unexplained=0; classifier rows: precision/withdrawn_transition = WARN)

## CI + Coverage
- GitHub Actions: backend + frontend PASS (CI only, no CD)
- Backend: finance_rules ≥80, financial_audit ≥80, mutation_guard ≥80, recon_earning ≥80, app ≥80, logic ≥80
- Frontend: vitest thresholds 80/80/70/80 PASS

## Signature
- Operator: Sisyphus — <date>
- Owner approval: ✅ (approved design summary + FULL AUTONOMUS mandate)
```

- [ ] **Step 2: Audit 5/5 iterate**

`artifacts/phase4/audit/phase4-audit.md` — checklist:
1. ✅ Mutation guard (authz+idempotency+audit+feedback+rollback) semua endpoint mutasi DALAM SCOPE (config PUT/DELETE, pricing global PUT, finance buy/retire/refund; inventory lengkap di Task 4 CATATAN)
2. ✅ Operator identity+role session (bukan dashboard-api hardcoded)
3. ✅ Fail-closed config (publish gagal → 500)
4. ✅ Payout UUID fallback dihapus (skip+audit)
5. ✅ Pricing merged view + orderbook (global per-upstream + overrides + orderbook via `_orderbook_payload` — parity dgn `/api/orderbook`)
6. ✅ Finance dashboard actions gated (buy/retire/refund via guard)
7. ✅ Recon earning classifier (unexplained=0; pre-existing 192 terselesaikan/classified)
8. ✅ app.py coverage ≥80 (CI gate)
9. ✅ Backup offsite status marker + docs tidak mengklaim 30d saat skip
10. ✅ Page-level tests critical workflows (P4-Q13)
11. ✅ Unit test ≥80 backend + frontend
12. ✅ PR CI tanpa CD, deploy VPS+Vercel, evidence
Iterasi sampai semua PASS.

- [ ] **Step 3: Commit evidence**

```bash
git add artifacts/phase4/
git commit -m "chore: Phase 4 release evidence + audit"
```

- [ ] **Step 4: Update decision log + PRODUCTION-LOCK**

Update `artifacts/phase4/audit/decision-log.md` status → `✅ DEPLOYED (2026-08-20)`; `docs/PRODUCTION-LOCK.md` release info (main hash, bundle, backup sha256). Commit + push via branch + PR (branch protection main).

---

## Self-Review

**1. Spec coverage:**
- C1 (existing surface) → Tasks 1-7 (reuse app.py routes + db) ✓
- C2 (read-only summaries dulu) → Task 6 (pricing merged view GET) + Task 9 (route tests) ✓
- C3 (mutation gated) → Tasks 1-5, 7 (guard + idempotency + audit + fail-closed + payout). Scope: semua route mutasi DALAM SCOPE phase ini dibungkus guard (config PUT/DELETE Task 4, pricing global PUT Task 6, finance buy/retire/refund Task 7); route mutasi lain (keys/budgets/topups/combos/recheck/ask/arm/disarm) diinventori di Task 4 CATATAN untuk hardening wave berikutnya — TIDAK di-claim "semua endpoint mutasi" ✓
- C4 (page-level tests) → Task 12 ✓
- C5 (manual deploy, CI-only) → Task 13-14 ✓
- P4-Q2 (pricing + finance + global + orderbook) → Tasks 6, 7, 11 ✓
- P4-Q3 (wrapper) → Task 1 ✓
- P4-Q4 (identity+role) → Task 3 ✓
- P4-Q5 (idempotency) → Tasks 1-2 ✓
- P4-Q6 (fail-closed) → Task 4 ✓
- P4-Q7 (manual disarm) → constraint (no auto-disarm; audit tetap) ✓
- P4-Q8 (pricing-config read-only) → constraint (tidak ada PUT pricing-config) ✓
- P4-Q9 (payout UUID) → Task 5 ✓
- P4-Q10 (finance actions) → Task 7 ✓
- P4-Q11 (pricing page unify) → Task 11 ✓
- P4-Q12 (debt: recon/coverage/rclone) → Tasks 8, 9, 10 ✓
- P4-Q13 (page-level tests) → Task 12 ✓
- README/docs enterprise + evidence + audit 5/5 → Task 15 + Task 10 Step 5 ✓

**2. Placeholder scan:** Semua task berisi kode/command exact; CATATAN untuk titik wire yang bergantung konteks aktual (nama komponen frontend) — diizinkan karena file existing menentukan; instruksi alternatif diberikan. Orderbook resolved: memakai `_orderbook_payload()` (cache/InferHub, parity `api_orderbook`), BUKAN tabel DB — tidak ada placeholder nama tabel.

**3. Type consistency:** `guard_mutation(request, conn, entity, action, executor, idempotency_key, actor, source, request_body, rollback_hook, actor_role, required_roles)` konsisten Task 1/4/6/7; `classify_earning_violation(balance, withdrawn, lifetime, ts, baseline)` konsisten Task 8; `_load_pricing_merged()` → `{globals, overrides, orderbook}` konsisten Task 6/11; `get_operator(token)` → `(name, role)` konsisten Task 3/7; matriks role: finance → admin/ops, config pricing → admin, pricing global → admin (Task 4/6/7).
