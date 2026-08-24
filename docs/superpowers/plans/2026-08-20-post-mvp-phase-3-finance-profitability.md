# Phase 3 — Finance & Profitability: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menjadikan laporan keuangan (dashboard + workbook + ledger) decision-grade: satu rule engine bersama, sumber tunggal DB, rekonsiliasi audit-only, audit trail, badge per metrik, dan membersihkan 14 page frontend yang API-nya dimatikan (efisiensi rate limit).

**Architecture:** Modul `backend/finance_rules.py` menjadi SATU-SATUNYA implementasi formula keuangan (net income, amortisasi, impairment, refund, opex, kurs). `backend/app.py` (dashboard) dan `scripts/gen_finance.py` (workbook) memanggil modul yang sama — menghapus divergensi yang selama ini menyebabkan dashboard ≠ workbook. Fix hardcode DB `upstream` di gen_finance (baca `UPSTREAM_DB` env). Tambah tabel `financial_audit` (additive). Hapus 14 page frontend yang API-nya diblokir allowlist. Upgrade README/docs ke spek enterprise SaaS.

**Tech Stack:** Python 3.11 (Flask 3, psycopg 3, pytest 8, pytest-cov 5), React 19 + Vite (Vitest 3, Testing Library, jsdom), PostgreSQL, GitHub Actions (CI only), Vercel + VPS systemd (manual deploy).

## Global Constraints

- DB production = `wuthering_waves_multi_agent` via `127.0.0.1:6432` (DSN dari env `UPSTREAM_DB`). **JANGAN hardcode nama DB/password** — semua script baca `UPSTREAM_DB` env; `fin_ops.py`/`recon_finance.py`/`backup_db.sh` harus HAPUS fallback DSN ber-password.
- Skema DB: **additive-only** (CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS) — pola `db_schema.py`.
- Formula rule engine (PASTI): `net_income = payout_confirmed + refund − amort − impairment − opex`; `opex = 0.10`; amortisasi = aset `status != 'active'` FULL cost (bukan pro-rata); refund = income (pengurang beban); impairment seed (`upstream` startswith `upstream-`) = 0.0 + label `[DATA-HILANG]`; loss_usd = `loss/kurs if loss > 100 else loss`; kurs per-asset (`assets.kurs_idr_usd`) preferred, fallback meta; IDR cost → `cost/kurs`.
- Formula `db_read_finance` di `backend/app.py` TIDAK BOLEH berubah numeriknya (hanya refactor ke rule engine) — kecuali bug amortisasi (amort_assets selalu empty) yang HARUS diperbaiki agar dashboard == workbook.
- Test coverage: frontend thresholds `lines 80 / functions 80 / branches 70 / statements 80`; backend `pytest tests/test_logic.py --cov-fail-under=80`. Semua test baru harus ikut pola `conftest.py` (mock `db_connect`).
- CI: `.github/workflows/ci.yml` TANPA CD. Deploy manual: VPS SSH `root@82.25.62.204` + Vercel `upstream-static`.
- Dilarang commit: secrets, `.env*`, `session-*.md`, `revenue/`, backup files. `VERCEL_TOKEN`, `DASHBOARD_PASSWORD`, `UPSTREAM_DB` hanya via env saat eksekusi.
- Bahasa kode: Indonesia (konsisten dgn codebase); docstring header file konsisten.
- Setiap task berakhir dengan test hijau + commit terpisah (conventional commit: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).

---

### Task 1: Fixture-test rule engine (RED)

**Files:**
- Create: `backend/tests/test_finance_rules.py`
- Create: `backend/finance_rules.py` (hanya stub kosong dulu — dibuat penuh di Task 2)

**Interfaces:**
- Produces: fungsi `compute_finance(...)` dan `amortization(...)` yang diharapkan — signature exact:
  - `compute_finance(assets, payouts, refunds, impairments, kurs_meta, providers=None, opex=0.10) -> dict`
  - `amortization(assets, kurs_meta) -> tuple[list, float]` (amort_assets, total_usd)
  - Input dict asset: `{"id","upstream","qty","cost_per","curr","status","kurs_idr_usd"}` — semua string/float/None diperbolehkan.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_finance_rules.py
"""Fixture tests: formula rule engine keuangan (RED/GREEN)."""
import pytest

from finance_rules import amortization, compute_finance


def _asset(aid, status="active", cost=100.0, qty=1, curr="USD", kurs=None, upstream="clinepass"):
    return {"id": aid, "upstream": upstream, "qty": qty, "cost_per": cost,
            "curr": curr, "status": status, "kurs_idr_usd": kurs}


def test_amortization_hanya_aset_non_active_full_cost():
    assets = [_asset("A-001", "active"), _asset("A-002", "retired", cost=50.0)]
    rows, total = amortization(assets, 17000.0)
    assert [r["id"] for r in rows] == ["A-002"]
    assert total == 50.0


def test_amortization_full_cost_bukan_prorata():
    # 3 retired, lifespan 30, beli kemarin: HARUS full cost, bukan prorata
    assets = [_asset("A-001", "retired", cost=120.0)] * 1
    _, total = amortization(assets, 17000.0)
    assert total == 120.0


def test_compute_finance_net_income_formula():
    assets = [_asset("A-001", "retired", cost=10.0), _asset("A-002", "active", cost=5.0)]
    payouts = [{"amount_usdc": 100.0, "status": "confirmed"}]
    refunds = [{"amount_idr": 0, "amount_usdc": 2.0, "kurs_idr_usd": None}]
    impairments = [{"upstream": "codebuddy", "loss": 300.0, "qty": 1, "label": "", "id": "I-1"}]
    res = compute_finance(assets, payouts, refunds, impairments, 17000.0)
    # 100 + 2 - 10 - (300/17000) - 0.10
    assert res["net_income"] == round(100.0 + 2.0 - 10.0 - (300.0 / 17000.0) - 0.10, 2)


def test_compute_finance_kurs_per_asset_idr():
    assets = [_asset("A-001", "active", cost=17000.0, curr="IDR", kurs=17000.0),
              _asset("A-002", "active", cost=10.0, curr="USD")]
    res = compute_finance(assets, [], [], [], 17000.0)
    # cost_usd asset IDR = 17000/17000 = 1; asset USD = 10
    assert res["total_capital_usd"] == 11.0


def test_compute_finance_impairment_seed_zero():
    impairments = [{"upstream": "upstream-9", "loss": 27167.0, "qty": 1, "label": "", "id": "I-S"}]
    res = compute_finance([], [], [], impairments, 17000.0)
    assert res["total_imp_loss_usd"] == 0.0
    assert res["impairments"][0]["seed_residue"] is True


def test_compute_finance_refund_kurs_per_row():
    refunds = [{"amount_idr": 34000.0, "amount_usdc": 0, "kurs_idr_usd": 17000.0, "label": "", "id": "R-1", "upstream": "x", "qty": 1}]
    res = compute_finance([], [], refunds, [], 10000.0)
    assert res["total_refund_usd"] == 2.0  # pakai kurs per-row 17000, bukan meta 10000


def test_compute_finance_payout_hanya_confirmed():
    payouts = [{"amount_usdc": 100.0, "status": "confirmed"},
               {"amount_usdc": 999.0, "status": "pending"}]
    res = compute_finance([], payouts, [], [], 17000.0)
    assert res["total_payout"] == 100.0
    assert res["n_payout"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_finance_rules.py -v`
Expected: FAIL dengan `ModuleNotFoundError: No module named 'finance_rules'`

- [ ] **Step 3: Create stub module (minimal agar import sukses)**

```python
# backend/finance_rules.py
"""Rule engine keuangan — satu-satunya sumber formula net income.

Docstring lengkap diisi Task 2."""
```

- [ ] **Step 4: Run test to verify it still fails (ImportError: cannot import name)**

Run: `cd backend && python -m pytest tests/test_finance_rules.py -q`
Expected: FAIL `ImportError: cannot import name 'amortization' from 'finance_rules'` — RED confirmed.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_finance_rules.py backend/finance_rules.py
git commit -m "test: fixture tests rule engine finance (RED)"
```

---

### Task 2: Implement rule engine (GREEN)

**Files:**
- Modify: `backend/finance_rules.py`

**Interfaces:**
- Consumes: Task 1 test expectations (signature exact).
- Produces: `compute_finance(assets, payouts, refunds, impairments, kurs_meta, opex=0.10)` → dict berisi keys: `total_payout, n_payout, total_refund_usd, refunds, amort_usd, amort_assets, total_imp_loss_usd, impairments, opex, net_income, total_capital_usd, total_asset_qty, assets, aktif, kurs`. Plus `amortization(assets, kurs_meta)`.

- [ ] **Step 1: Write the full implementation**

```python
# backend/finance_rules.py
"""Rule engine keuangan — SATU-SATUNYA sumber formula net income.

Dipakai bersama oleh:
- backend/app.py `db_read_finance()` (dashboard)
- scripts/gen_finance.py (workbook keuangan.xlsx + ledger.json)

Formula (verified 2026-08-20, disamakan dgn keputusan Phase 3 F3):
  net_income = payout_confirmed + refund − amort − impairment − opex
- amortisasi = hanya aset `status != 'active'`, FULL cost (bukan pro-rata)
- refund   DIKURANG dari beban (income), bukan ditambah
- impairment seed (upstream startswith 'upstream-') di-zero-kan (DATA-HILANG),
  loss_usd = loss/kurs jika loss > 100, selain itu raw
- opex = 0.10 (beban bank/gas fee est.)
- kurs per-asset (`kurs_idr_usd`) preferred; fallback kurs meta;
  aset IDR: cost_usd = cost_per*qty/kurs; aset USD: cost_per*qty
"""


def _slug_of(name):
    n = (name or "").strip().lower()
    if "clinepass" in n or n.startswith("cline-pass"):
        return "cline-pass"
    if "codebuddy" in n and ("cn" in n or n.endswith("cn")):
        return "codebuddy-cn"
    if "codebuddy" in n:
        return "codebuddy"
    if "command code" in n:
        return "commandcode"
    if "opencode" in n or "open code" in n:
        return "opencode-go"
    if "chatgpt" in n or "chatgpt+" in n or n.startswith("chatgpt"):
        return "codex"
    return None


def _f(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def amortization(assets, kurs_meta):
    """Amortisasi = aset status != active, FULL cost (bukan pro-rata).

    cost_usd dihitung dari cost_per/qty/curr/kurs — input bisa berupa asset
    mentah (belum ada cost_usd) ATAU hasil compute_finance (sudah ada cost_usd):
      - USD: cost_usd = cost_per * qty
      - IDR: cost_usd = cost_per * qty / kurs (per-asset preferred, fallback meta)
    """
    kurs = _f(kurs_meta) or 17801.17
    amort_assets = []
    for a in assets:
        if (a.get("status") or "active") != "active":
            cost_usd = a.get("cost_usd")
            if cost_usd is None:
                curr = (a.get("curr") or "USD").strip().upper()
                qty = int(_f(a.get("qty"), 0))
                a_kurs = _f(a.get("kurs_idr_usd")) or kurs
                cost_usd = _f(a.get("cost_per")) * qty / a_kurs if curr == "IDR" else _f(a.get("cost_per")) * qty
            amort_assets.append({**a, "cost_usd": round(cost_usd, 4)})
    total = round(sum(_f(a.get("cost_usd")) for a in amort_assets), 4)
    return amort_assets, total


def compute_finance(assets, payouts, refunds, impairments, kurs_meta, providers=None, opex=0.10):
    """Hitung seluruh metrik finance dgn aturan yang sama untuk semua konsumen.

    providers: optional — list dict {upstream_slug, n} dari tabel providers
    (status='ok'). REV9: qty aset aktif per slug dikali rasio = min(1.0,
    n_ok_provider / qty_aset_aktif_slug). Aset yang akunnya mati tidak dihitung
    penuh. Jika providers None → rasio 1.0 (perilaku workbook legacy, gen_finance).
    """
    kurs = _f(kurs_meta) or 17801.17

    # ── payout (confirmed saja) ──
    total_payout = sum(_f(p.get("amount_usdc", p.get("usd"))) for p in payouts
                       if p.get("status", "confirmed") == "confirmed")
    n_payout = sum(1 for p in payouts if p.get("status", "confirmed") == "confirmed")

    # ── REV9: rasio provider ok per slug (untuk qty aset aktif) ──
    prov_ok = {}
    for pr in providers or []:
        slug = pr.get("upstream_slug") or pr.get("slug") or ""
        if slug:
            prov_ok[slug] = int(_f(pr.get("n", pr.get("count")), 0))
    asset_qty_by = {}
    for a in assets:
        if (a.get("status") or "active") != "active":
            continue
        sl = _slug_of(a.get("upstream") or "")
        if sl:
            asset_qty_by[sl] = asset_qty_by.get(sl, 0) + int(_f(a.get("qty"), 0))
    ratio_by = {sl: min(1.0, prov_ok.get(sl, 0) / q) for sl, q in asset_qty_by.items() if q > 0}

    # ── aset → cost_usd per asset (IDR dibagi kurs per-asset) ──
    asset_list = []
    total_capital = 0.0
    total_asset_qty = 0
    for a in assets:
        cost_per = _f(a.get("cost_per"))
        qty_raw = int(_f(a.get("qty"), 0))
        sl = _slug_of(a.get("upstream") or "")
        ratio = ratio_by.get(sl, 1.0)
        qty = int(round(qty_raw * ratio))
        curr = (a.get("curr") or "USD").strip().upper()
        a_kurs = _f(a.get("kurs_idr_usd")) or kurs
        cost_usd = cost_per * qty / a_kurs if curr == "IDR" else cost_per * qty
        if (a.get("status") or "active") != "active":
            # tetap masuk asset_list (untuk amortisasi) tapi tidak ke total_capital
            asset_list.append({**a, "qty": qty, "cost_usd": round(cost_usd, 4)})
            continue
        total_capital += cost_usd
        total_asset_qty += qty
        asset_list.append({**a, "qty": qty, "cost_usd": round(cost_usd, 4)})
    aktif = sum(1 for a in asset_list if (a.get("status") or "active") == "active")

    amort_assets, amort_usd = amortization(asset_list, kurs)

    # ── impairment: seed di-zero-kan (DATA-HILANG); loss>100 → /kurs ──
    total_imp_loss = 0.0
    imp_rows = []
    for im in impairments:
        _up = im.get("upstream") or ""
        seed = _up.startswith("upstream-")
        loss = 0.0 if seed else _f(im.get("loss"))
        loss_usd = loss / kurs if loss > 100 else loss
        total_imp_loss += loss_usd
        imp_rows.append({**im, "loss_usd": round(loss_usd, 2),
                         "seed_residue": seed,
                         "label": (im.get("label") or "") + (" [DATA-HILANG]" if seed else "")})
    total_imp_loss = round(total_imp_loss, 2)

    # ── refund (income): kurs per-row preferred ──
    total_refund = 0.0
    refund_rows = []
    for rd in refunds:
        aidr = _f(rd.get("amount_idr"))
        ausd = _f(rd.get("amount_usdc"))
        r_kurs = _f(rd.get("kurs_idr_usd")) or kurs
        v = ausd if ausd > 0 else (aidr / r_kurs if aidr > 100 else aidr)
        total_refund += v
        refund_rows.append({**rd, "refund_usd": round(v, 4)})
    total_refund = round(total_refund, 2)

    net_income = round(total_payout + total_refund - amort_usd - total_imp_loss - opex, 2)

    return {
        "total_payout": total_payout, "n_payout": n_payout,
        "total_refund_usd": total_refund, "refunds": refund_rows,
        "amort_usd": amort_usd, "amort_assets": amort_assets,
        "total_imp_loss_usd": total_imp_loss, "impairments": imp_rows,
        "opex": opex, "net_income": net_income,
        "total_capital_usd": round(total_capital, 4), "total_asset_qty": total_asset_qty,
        "assets": asset_list, "aktif": aktif,
        "kurs": kurs, "source": "finance_rules (rule engine)",
    }
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_finance_rules.py -v`
Expected: 7 passed.

- [ ] **Step 3: Run full backend test suite**

Run: `cd backend && python -m pytest --cov=logic --cov=app --cov-report=term-missing -q`
Expected: ALL PASS (tidak ada regresi; finance_rules belum ter-cover → muncul di coverage sebagai file baru, dibiarkan dulu).

- [ ] **Step 4: Commit**

```bash
git add backend/finance_rules.py
git commit -m "feat: rule engine finance bersama (GREEN)"
```

---

### Task 3: Refactor `db_read_finance` ke rule engine + fix bug amortisasi

**Files:**
- Modify: `backend/app.py:317-469` (ganti body `db_read_finance`)

**Interfaces:**
- Consumes: `finance_rules.compute_finance(...)` dari Task 2.
- Produces: `db_read_finance()` → dict dengan key sama persis seperti sebelumnya (agar `/api/finance` dan frontend TIDAK berubah), PLUS `"source": "db (finance_rules)"`. **Perubahan numerik yang disengaja**: `amort_usd` sekarang > 0 untuk aset retired (bug fix), dan `total_capital_usd` TIDAK lagi mengandung retired (sudah benar sebelumnya).

- [ ] **Step 1: Tulis test regression dulu (amort bug — RED)**

Tambahkan ke `backend/tests/test_finance_rules.py`:

```python
def test_amort_bug_dashboard_harus_hitung_retired():
    # Regression: bug lama db_read_finance membuat amort_assets selalu [].
    assets = [_asset("A-001", "retired", cost=10.0)]
    res = compute_finance(assets, [], [], [], 17000.0)
    assert res["amort_usd"] == 10.0
    assert len(res["amort_assets"]) == 1
```

Run: `cd backend && python -m pytest tests/test_finance_rules.py -q`
Expected: PASS (rule engine sudah benar — regression test untuk app.py di Step 2).

- [ ] **Step 2: Tulis test app.py db_read_finance (RED — pakai mock db_connect)**

Buat `backend/tests/test_finance_routes.py`:

```python
"""Test route /api/finance + db_read_finance (mock db_connect)."""
from unittest.mock import patch, MagicMock

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
                self.order = ["meta", "assets", "providers", "impairments", "payouts", "refunds"]

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
    assert res["amort_usd"] == 10.0          # A-001 retired full cost
    assert res["total_payout"] == 100.0
    assert res["total_refund_usd"] == 2.0
    # impairment loss 17000 -> /kurs 17000 = 1.0
    assert res["total_imp_loss_usd"] == 1.0
    # net = 100 + 2 - 10 - 1 - 0.10
    assert res["net_income"] == round(100 + 2 - 10 - 1 - 0.10, 2)
```

Run: `cd backend && python -m pytest tests/test_finance_routes.py::test_db_read_finance_amort_retired_dihitung -v`
Expected: FAIL — `res["amort_usd"] == 0.0` (bug: `asset_list` hanya berisi active).

- [ ] **Step 3: Refactor `db_read_finance` body**

Ganti seluruh body `db_read_finance()` di `backend/app.py` (baris 317-469) dengan versi yang memakai rule engine:

```python
def db_read_finance():
    """Baca finance dari DB (assets/impairments/payouts/refunds tables) — via rule engine."""
    from finance_rules import compute_finance
    try:
        with db_connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT v FROM ledger_meta WHERE k='kurs_idr_usd'")
            r = cur.fetchone()
            kurs = float(r["v"]) if r else 17801.17
            cur.execute("SELECT id, upstream, qty, label, buy, lifespan_d, cost_per, curr, status, kurs_idr_usd FROM assets")
            assets = cur.fetchall()
            # provider OK per slug — utk rasio qty aset aktif (REV9, dipindah ke rule engine)
            cur.execute("SELECT upstream_slug, count(*) AS n FROM providers WHERE status='ok' GROUP BY upstream_slug")
            providers = cur.fetchall()
            cur.execute("SELECT id, upstream, qty, loss, label, date FROM impairments")
            impairments = cur.fetchall()
            cur.execute("SELECT id, date, amount_usdc, status, destination FROM payouts WHERE status='confirmed'")
            payouts = cur.fetchall()
            cur.execute("SELECT id, upstream, qty, amount_idr, amount_usdc, label, kurs_idr_usd FROM refunds")
            refunds = cur.fetchall()

        def _norm(rows):
            return [dict(r) for r in rows]

        res = compute_finance(
            assets=_norm(assets),
            payouts=[{"amount_usdc": p.get("amount_usdc"), "status": p.get("status") or "confirmed",
                      "date": p.get("date"), "id": p.get("id")} for p in payouts],
            refunds=_norm(refunds),
            impairments=_norm(impairments),
            kurs_meta=kurs,
            providers=_norm(providers),
        )
        res["source"] = "db (finance_rules)"
        return res
    except Exception as e:
        return {"error": str(e), "source": "db_read_finance failed"}
```

CATATAN: mock `FakeCur.fetchone()` mengembalikan `dict` (dari `_rows`) yang mendukung `r["v"]`. Di production, psycopg row juga mendukung subscript. `dict(r)` normalisasi dijamin bekerja untuk keduanya.

- [ ] **Step 4: Run regression test — verify it passes**

Run: `cd backend && python -m pytest tests/test_finance_routes.py -v`
Expected: 1 passed.

- [ ] **Step 5: Run full backend suite + coverage**

Run: `cd backend && python -m pytest --cov=logic --cov=app --cov-report=term-missing -q`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app.py backend/tests/test_finance_routes.py backend/tests/test_finance_rules.py
git commit -m "fix: dashboard amortisasi aset retired via rule engine (bug F1.1)"
```

---

### Task 4: Fix `gen_finance.py` — UPSTREAM_DB env + reuse rule engine

**Files:**
- Modify: `scripts/gen_finance.py` (seluruh bagian load + hitung)

**Interfaces:**
- Consumes: `finance_rules.compute_finance(...)` (import dari `backend.finance_rules` via sys.path append).
- Produces: `load_ledger()` yang membaca DB VIA `UPSTREAM_DB` env (psycopg, bukan subprocess psql); `main()` menghasilkan summary + workbook yang NUMERIK SAMA dengan dashboard.

- [ ] **Step 1: Tulis test unit load_ledger pakai env (RED — pakai DSN test)**

Buat `backend/tests/test_gen_finance_loader.py` (test dijalankan dari `backend/`):

```python
"""Test loader gen_finance — baca UPSTREAM_DB env, bukan hardcode 'upstream'."""
import importlib.util
import os
import sys
import types

import pytest


@pytest.fixture
def gen_finance_mod(monkeypatch, tmp_path):
    """Load scripts/gen_finance.py sebagai modul (tanpa eksekusi main).

    UPSTREAM_DB dummy WAJIB diset — modul baru raise SystemExit jika kosong.
    openpyxl di-mock dengan ModuleType berisi Workbook/load_workbook stub —
    gen_finance mengimpor 'from openpyxl import Workbook, load_workbook' di
    top-level, sehingga None tidak cukup (import akan fail).
    """
    monkeypatch.setenv("UPSTREAM_DB", "postgresql://dummy:dummy@127.0.0.1:1/dummy")
    monkeypatch.setenv("FOREX_KEY", "dummy-key")
    fake_openpyxl = types.ModuleType("openpyxl")
    fake_openpyxl.Workbook = object
    fake_openpyxl.load_workbook = object
    monkeypatch.setitem(sys.modules, "openpyxl", fake_openpyxl)
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
    spec = importlib.util.spec_from_file_location(
        "gen_finance", os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "gen_finance.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    yield mod
    sys.path.pop(0)


def test_gen_finance_tidak_hardcode_db_upstream(gen_finance_mod):
    import inspect
    src = inspect.getsource(gen_finance_mod.load_ledger)
    assert "psql" not in src
    assert '"-d", "upstream"' not in src
    assert "UPSTREAM_DB" in src


def test_gen_finance_import_rule_engine(gen_finance_mod):
    assert gen_finance_mod.compute_finance is not None
```

Run: `cd backend && python -m pytest tests/test_gen_finance_loader.py -v`
Expected: FAIL (masih `psql -d upstream`).

- [ ] **Step 2: Rewrite loader + komputasi di gen_finance.py**

Ganti bagian atas `scripts/gen_finance.py`:

```python
#!/usr/bin/env python3
"""WWMA Publishing — Finance Auto-Generator.
Baca dari PostgreSQL (single source of truth) -> regenerate workbook + P&L + neraca.
Script ini jalan tiap malam via systemd timer -> semua laporan update otomatis.

Logika keuangan diambil dari rule engine bersama (`backend/finance_rules.py`)
supaya net income workbook == net income dashboard:
  net_income = payout + refund − amort − impairment − opex
  - amortisasi = hanya aset `status != 'active'`, FULL cost (bukan pro-rata)
  - refund   DIKURANG dari beban (income), bukan ditambah
  - impairment seed (upstream startswith 'upstream-') di-zero-kan (DATA-HILANG)
  - opex = 0.10
FOREX_KEY dibaca dari env (FOREX_KEY) atau `~/.hermes-suisui/.env`, bukan hardcode.
DB dibaca dari env `UPSTREAM_DB` (psycopg) — BUKAN hardcode 'upstream'.
"""
import json
import os
import sys
from datetime import date

import psycopg
from openpyxl import Workbook, load_workbook

# Rule engine bersama — satu-satunya sumber formula.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
from finance_rules import compute_finance  # noqa: E402
BASE = "/home/gamesim/shared-memory/inferhub-business/finance"
LEDGER = os.path.join(BASE, "ledger.json")
WB = os.path.join(BASE, "keuangan.xlsx")
ENV_FILE = os.path.expanduser("~/.hermes-suisui/.env")

# DSN wajib dari env — TIDAK ada fallback hardcode.
DB_DSN = os.environ.get("UPSTREAM_DB")
if not DB_DSN:
    raise SystemExit("UPSTREAM_DB env wajib diisi (DB production). Refuse to run.")


def load_forex_key():
    """FOREX_KEY dari env; fallback baca ~/.hermes-suisui/.env. Bukan hardcode."""
    if os.environ.get("FOREX_KEY"):
        return os.environ["FOREX_KEY"].strip().strip('"').strip("'")
    try:
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line.startswith("FOREX_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


FOREX_KEY = load_forex_key()


def load_ledger():
    """Baca dari PostgreSQL (single source of truth) via UPSTREAM_DB env.
    assets, payouts, refunds, impairments diambil langsung dari DB (psycopg)."""
    with psycopg.connect(DB_DSN) as conn, conn.cursor() as cur:
        cur.execute("SELECT COALESCE(v, '') FROM ledger_meta WHERE k='kurs_idr_usd'")
        r = cur.fetchone()
        meta_kurs = float(r[0]) if r and r[0] else 17801.17

        cur.execute("SELECT id, upstream, qty, cost_per, curr, buy, lifespan_d, status, label, kurs_idr_usd FROM assets ORDER BY id")
        assets = [{"id": rid, "upstream": up, "qty": int(float(qty)), "cost_per": float(cost),
                   "curr": curr, "buy": (buy or "")[:10], "lifespan_d": int(float(life or 30)),
                   "status": status, "label": label or "", "kurs_idr_usd": float(kurs_a) if kurs_a is not None else None}
                  for rid, up, qty, cost, curr, buy, life, status, label, kurs_a in cur.fetchall()]

        cur.execute("SELECT id, amount_usdc, status, date FROM payouts ORDER BY date")
        payouts = [{"id": pid, "amount_usdc": float(amt or 0), "status": st or "confirmed", "date": str(d)[:10]}
                   for pid, amt, st, d in cur.fetchall()]

        cur.execute("SELECT id, upstream, qty, amount_idr, amount_usdc, label, date, kurs_idr_usd FROM refunds ORDER BY date")
        refunds = [{"id": rid, "upstream": up, "qty": int(float(qty or 0)), "amount_idr": float(aidr or 0),
                    "amount_usdc": float(ausd or 0), "label": lab or "", "date": str(d)[:10],
                    "kurs_idr_usd": float(kurs_r) if kurs_r is not None else None}
                   for rid, up, qty, aidr, ausd, lab, d, kurs_r in cur.fetchall()]

        cur.execute("SELECT id, upstream, qty, loss, label, date FROM impairments ORDER BY date")
        impairments = [{"id": iid, "upstream": up, "qty": int(float(qty or 0)), "loss": float(loss or 0),
                        "label": lab or "", "date": str(d)[:10]}
                       for iid, up, qty, loss, lab, d in cur.fetchall()]

        # provider OK per slug — parity dgn dashboard (REV9 qty ratio), rule engine
        cur.execute("SELECT upstream_slug, count(*) AS n FROM providers WHERE status='ok' GROUP BY upstream_slug")
        providers = [{"upstream_slug": slug, "n": int(n)} for slug, n in cur.fetchall()]

    return {
        "meta": {"name": "WWMA Publishing — Ledger", "as_of": str(date.today()),
                 "kurs_idr_usd": meta_kurs, "kurs_updated": str(date.today())},
        "assets": assets, "payouts": payouts, "refunds": refunds, "impairments": impairments,
        "providers": providers,
    }
```

- [ ] **Step 3: Ganti main() agar pakai compute_finance**

Ganti blok hitung di `main()` (mulai dari `# ── Hitung net income` sampai sebelum `# ---- Simpan ringkasan`) menjadi:

```python
    # ── Hitung net income — rule engine bersama (backend/finance_rules.py) ──
    res = compute_finance(
        assets=L["assets"], payouts=L["payouts"], refunds=L["refunds"],
        impairments=L["impairments"], kurs_meta=kurs, providers=L["providers"],
    )
    total_payout = res["total_payout"]
    n_payout = res["n_payout"]
    total_amort_usd = res["amort_usd"]
    amort_assets = res["amort_assets"]
    total_imp_loss_usd = res["total_imp_loss_usd"]
    impaired_rows = res["impairments"]
    total_refund_usd = res["total_refund_usd"]
    refund_rows = res["refunds"]
    opex = res["opex"]
    net_income = res["net_income"]
    asset_list = res["assets"]
    total_capital_usd = res["total_capital_usd"]
    total_akun = res["total_asset_qty"]
    total_akun_aktif = res["aktif"]
```

Catatan: `usd_eq()` di gen_finance dipakai Asset Register (baris 241) — pertahankan fungsi itu (tetap ada di bawah `fetch_live_kurs`). `asset_list` sekarang sudah berisi `cost_usd` dari rule engine.

- [ ] **Step 4: Run test — verify it passes**

Run: `cd backend && python -m pytest tests/test_gen_finance_loader.py -v`
Expected: 2 passed.

- [ ] **Step 5: Pastikan tidak ada referensi 'upstream' hardcode tersisa**

Run: `cd backend && grep -n "psql\|-d.*upstream" ../scripts/gen_finance.py || echo "CLEAN"`
Expected: `CLEAN` (atau hanya komentar yang tidak menyebut command psql).

- [ ] **Step 6: Compile check seluruh scripts**

Run: `cd backend && python -m compileall -q ../scripts/`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/gen_finance.py backend/tests/test_gen_finance_loader.py
git commit -m "fix: gen_finance baca UPSTREAM_DB env + pakai rule engine (bug F1)"
```

---

### Task 5: Hapus DSN fallback hardcode di fin_ops.py & recon_finance.py

**Files:**
- Modify: `scripts/fin_ops.py:29`
- Modify: `scripts/recon_finance.py:20`

- [ ] **Step 1: Tulis test (RED)**

Tambahkan ke `backend/tests/test_gen_finance_loader.py`:

```python
def test_fin_ops_dsn_tidak_ada_fallback():
    src = open(os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "fin_ops.py"), encoding="utf-8").read()
    assert "postgresql://gamesim" not in src
    assert "upstream_local" not in src
    assert "os.environ.get(\"UPSTREAM_DB\")" in src


def test_recon_finance_dsn_tidak_ada_fallback():
    src = open(os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "recon_finance.py"), encoding="utf-8").read()
    assert "postgresql://gamesim" not in src
    assert "upstream_local" not in src
```

Run: `cd backend && python -m pytest tests/test_gen_finance_loader.py -v`
Expected: 2 FAIL (fallback masih ada).

- [ ] **Step 2: Fix fin_ops.py**

Ganti baris 29 di `scripts/fin_ops.py`:

```python
# DSN wajib dari env (sama dgn backend/app.py) — TIDAK ada fallback hardcode.
DB_DSN = os.environ.get("UPSTREAM_DB")
if not DB_DSN:
    raise SystemExit("UPSTREAM_DB env wajib diisi (DB production). Refuse to run.")
```

- [ ] **Step 3: Fix recon_finance.py**

Ganti baris 20 di `scripts/recon_finance.py`:

```python
DB_DSN = os.environ.get("UPSTREAM_DB")
if not DB_DSN:
    raise SystemExit("UPSTREAM_DB env wajib diisi (DB production). Refuse to run.")
```

- [ ] **Step 4: Run test — verify GREEN**

Run: `cd backend && python -m pytest tests/test_gen_finance_loader.py -v`
Expected: 4 passed (2 lama + 2 baru).

- [ ] **Step 5: Commit**

```bash
git add scripts/fin_ops.py scripts/recon_finance.py backend/tests/test_gen_finance_loader.py
git commit -m "fix: hapus fallback DSN ber-password di fin_ops/recon_finance (env wajib)"
```

---

### Task 6: Tabel `financial_audit` (additive) + write points

**Files:**
- Modify: `backend/db_schema.py` (tambah DDL di akhir `ensure_schema`)
- Modify: `scripts/fin_ops.py` (tulis audit di cmd_buy/cmd_retire/cmd_refund)
- Modify: `backend/ledger_update.py` (tulis audit di add/retire/reactivate)
- Create: `backend/tests/test_financial_audit.py`

**Interfaces:**
- Produces: tabel `financial_audit(id BIGSERIAL PK, entity TEXT, entity_id TEXT, action TEXT, actor TEXT, source TEXT, before JSONB, after JSONB, created_at TIMESTAMPTZ DEFAULT now())` + helper `audit_write(conn, entity, entity_id, action, actor, source, before, after)`.

- [ ] **Step 1: Tulis test DDL additive (RED)**

`backend/tests/test_financial_audit.py`:

```python
"""Test tabel financial_audit + helper audit_write."""
import json

import pytest

from db_schema import ensure_schema
from financial_audit import audit_write


class FakeCur:
    def __init__(self):
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql, params=None):
        self.executed.append((sql, params))


class FakeConn:
    def __init__(self):
        self.cur = FakeCur()

    def cursor(self):
        return self.cur

    def commit(self):
        pass


def test_ensure_schema_membuat_financial_audit():
    cur = FakeCur()
    ensure_schema(cur)
    ddl = "\n".join(s for s, _ in cur.executed)
    assert "CREATE TABLE IF NOT EXISTS financial_audit" in ddl
    assert "entity TEXT" in ddl
    assert "before JSONB" in ddl
    assert "after JSONB" in ddl


def test_audit_write_insert():
    conn = FakeConn()
    audit_write(conn, "assets", "A-001", "add-asset", "operator-test", "cli",
                {"status": None}, {"status": "active"})
    sql, params = conn.cur.executed[-1]
    assert sql.strip().lower().startswith("insert into financial_audit")
    assert params[2] == "add-asset"
    assert json.loads(params[6]) == {"status": "active"}
```

- [ ] **Step 2: Run test — verify RED**

Run: `cd backend && python -m pytest tests/test_financial_audit.py -v`
Expected: FAIL `ModuleNotFoundError: No module named 'financial_audit'` / `CREATE TABLE IF NOT EXISTS financial_audit` not in ddl.

- [ ] **Step 3: Tambah DDL ke db_schema.py**

Tambahkan di akhir `ensure_schema(cur)`:

```python
    # ── financial audit trail (Phase 3 F4) — semua mutasi finansial ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS financial_audit (
            id BIGSERIAL PRIMARY KEY,
            entity TEXT NOT NULL,
            entity_id TEXT,
            action TEXT NOT NULL,
            actor TEXT,
            source TEXT NOT NULL,
            before JSONB,
            after JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fin_audit_entity ON financial_audit(entity, entity_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fin_audit_created ON financial_audit(created_at DESC)")
```

- [ ] **Step 4: Buat helper financial_audit.py**

`backend/financial_audit.py`:

```python
"""Helper audit trail finansial — semua mutasi keuangan dicatat (Phase 3 F4)."""
import json


def audit_write(conn, entity, entity_id, action, actor, source, before=None, after=None):
    """Tulis satu baris audit. conn = koneksi psycopg (transaksi pemanggil)."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO financial_audit (entity, entity_id, action, actor, source, before, after)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (entity, entity_id, action, actor, source,
             json.dumps(before) if before is not None else None,
             json.dumps(after) if after is not None else None),
        )
```

- [ ] **Step 5: Run test — verify GREEN**

Run: `cd backend && python -m pytest tests/test_financial_audit.py -v`
Expected: 2 passed.

- [ ] **Step 6: Wire audit ke fin_ops.py (buy/retire/refund)**

Di `scripts/fin_ops.py`, tambah import di atas (setelah `import psycopg`):

```python
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
from financial_audit import audit_write  # noqa: E402
```

Lalu di `cmd_buy`, sebelum `conn.commit()`:

```python
        audit_write(conn, "assets", asset_id, "add-asset", actor, "fin_ops.buy",
                    before=None, after={"id": asset_id, "upstream": args.upstream, "qty": args.qty,
                                         "cost_per": args.cost, "curr": args.curr,
                                         "buy": args.buy, "lifespan_d": args.lifespan,
                                         "label": args.label})
```

Di `cmd_retire`, sebelum `conn.commit()`:

```python
        audit_write(conn, "assets", args.id, "retire-asset", actor, "fin_ops.retire",
                    before={"status": "active"}, after={"status": "retired"})
```

Di `cmd_refund`, setelah INSERT refund dan sebelum `conn.commit()`:

```python
        audit_write(conn, "refunds", refund_id, "add-refund", actor, "fin_ops.refund",
                    before=None, after={"upstream": args.upstream, "qty": args.qty,
                                         "amount_idr": args.amount_idr, "amount_usdc": args.amount_usdc,
                                         "label": args.label})
```

CATATAN implementasi: sesuaikan nama variabel aktual di masing-masing fungsi (baca `fin_ops.py` baris 116-230 saat implementasi — `args`, `actor`, `asset_id`/`refund_id` sudah ada di scope).

- [ ] **Step 7: Wire audit ke ledger_update.py (add/retire/reactivate)**

Di `backend/ledger_update.py`, import helper (di atas, setelah `import psycopg`):

```python
import getpass
import os

from financial_audit import audit_write
```

**Sumber actor** (konsisten dgn fin_ops): `--actor` CLI arg > env `FIN_OPS_ACTOR` > `getpass.getuser()`. Tambahkan resolver:

```python
def _actor(args):
    return getattr(args, "actor", None) or os.environ.get("FIN_OPS_ACTOR") or getpass.getuser()
```

Dan tambahkan `--actor` ke subparser `add-asset`, `retire-asset`, `reactivate-asset`:

```python
p.add_argument("--actor", default=None)
```

**Wiring aktual** (fungsi di file ini adalah `upsert_asset` dan `update_asset_status` — BUKAN `add_asset`/`retire_asset`/`reactivate_asset`):

Di `upsert_asset(a, kurs=None)` — audit setelah cursor block, sebelum `c.commit()`:

```python
def upsert_asset(a, kurs=None):
    with conn() as c:
        with c.cursor() as cur:
            if a.get("curr") == "IDR":
                a_kurs = a.get("kurs_idr_usd") or kurs
            else:
                a_kurs = None
            cur.execute("""
                INSERT INTO assets (id, upstream, qty, cost_per, curr, buy, lifespan_d, status, label, kurs_idr_usd)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO UPDATE SET
                  upstream=EXCLUDED.upstream, qty=EXCLUDED.qty, cost_per=EXCLUDED.cost_per,
                  curr=EXCLUDED.curr, buy=EXCLUDED.buy, lifespan_d=EXCLUDED.lifespan_d,
                  status=EXCLUDED.status, label=EXCLUDED.label,
                  kurs_idr_usd=COALESCE(EXCLUDED.kurs_idr_usd, assets.kurs_idr_usd)
            """, (a["id"], a.get("upstream"), int(a.get("qty") or 0), float(a.get("cost_per") or 0),
                  a.get("curr", "USD"), str(a.get("buy") or "")[:10], int(a.get("lifespan_d") or 30),
                  a.get("status", "active"), a.get("label"), a_kurs))
        # audit terpisah dari cursor block — audit_write membuka cursor sendiri
        audit_write(c, "assets", a["id"], "upsert-asset", os.environ.get("FIN_OPS_ACTOR") or getpass.getuser(),
                    "ledger_update.upsert_asset",
                    before=None,
                    after={"id": a["id"], "upstream": a.get("upstream"), "qty": a.get("qty"),
                           "cost_per": a.get("cost_per"), "curr": a.get("curr"),
                           "buy": str(a.get("buy") or "")[:10], "lifespan_d": a.get("lifespan_d"),
                           "status": a.get("status", "active"), "label": a.get("label")})
        c.commit()
```

Di `update_asset_status(aid, status, label=None)` — audit setelah cursor block, sebelum `c.commit()`. Baca status lama dulu agar `before` akurat:

```python
def update_asset_status(aid, status, label=None):
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("SELECT status FROM assets WHERE id=%s", (aid,))
            row = cur.fetchone()
            if row is None:
                print(f"  [!] asset {aid} tidak ditemukan di DB")
                return
            old_status = row["status"]
            cur.execute("UPDATE assets SET status=%s, label=COALESCE(%s,label) WHERE id=%s", (status, label, aid))
        # audit terpisah dari cursor block — audit_write membuka cursor sendiri
        audit_write(c, "assets", aid, f"set-{status}", os.environ.get("FIN_OPS_ACTOR") or getpass.getuser(),
                    "ledger_update.update_asset_status",
                    before={"status": old_status}, after={"status": status, "label": label})
        print(f"  [OK] {aid} -> {status}")
        c.commit()
```

CATATAN: `add_payout` deprecated (raise SystemExit) — jangan sentuh. `sync-from-file` memanggil `upsert_asset` per asset → otomatis tercatat audit (action `upsert-asset`), sesuai Q5/Q9 (semua mutasi tercatat).

- [ ] **Step 8: Full backend suite**

Run: `cd backend && python -m pytest --cov=logic --cov=app --cov-report=term-missing -q`
Expected: ALL PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/db_schema.py backend/financial_audit.py backend/tests/test_financial_audit.py scripts/fin_ops.py backend/ledger_update.py
git commit -m "feat: financial_audit trail untuk semua mutasi finansial (additive)"
```

---

### Task 7: Reconciliation — parity rule engine di recon_finance.py

**Files:**
- Modify: `scripts/recon_finance.py`
- Create: `backend/tests/test_recon_checks.py`

**Interfaces:**
- Consumes: `finance_rules.compute_finance(...)`.
- Produces: tambahan invariant di `recon_finance.py`:
  - `FIN-PARITY-1`: dashboard finance (`db_read_finance` lewat rule engine) == gen_finance summary — dibandingkan via `compute_finance` terhadap DB yang sama, sekali jalan.
  - `FIN-PARITY-2`: `net_income == payout + refund − amort − imp − opex` (identitas rule engine).
  - `FIN-PARITY-3`: jumlah aset non-active == jumlah amort_assets.

- [ ] **Step 1: Tulis test fungsi parity (RED)**

`backend/tests/test_recon_checks.py`:

```python
"""Test invariant parity finance untuk recon_finance.py."""
from finance_rules import compute_finance


def test_net_income_identitas_rule_engine():
    assets = [{"id": "A-001", "upstream": "clinepass", "qty": 1, "cost_per": 10.0,
               "curr": "USD", "status": "retired", "kurs_idr_usd": None}]
    payouts = [{"amount_usdc": 50.0, "status": "confirmed"}]
    refunds = [{"amount_idr": 0, "amount_usdc": 3.0, "kurs_idr_usd": None, "id": "R", "upstream": "x", "qty": 1}]
    impairments = [{"id": "I", "upstream": "codebuddy", "qty": 1, "loss": 34000.0, "label": ""}]
    res = compute_finance(assets, payouts, refunds, impairments, 17000.0)
    expected = round(50.0 + 3.0 - 10.0 - (34000.0 / 17000.0) - 0.10, 2)
    assert res["net_income"] == expected


def test_jumlah_amort_assets_sama_non_active():
    assets = [{"id": "A-001", "upstream": "clinepass", "qty": 1, "cost_per": 1.0,
               "curr": "USD", "status": "retired", "kurs_idr_usd": None},
              {"id": "A-002", "upstream": "clinepass", "qty": 1, "cost_per": 1.0,
               "curr": "USD", "status": "active", "kurs_idr_usd": None}]
    res = compute_finance(assets, [], [], [], 17000.0)
    non_active = sum(1 for a in assets if (a.get("status") or "active") != "active")
    assert len(res["amort_assets"]) == non_active
```

Run: `cd backend && python -m pytest tests/test_recon_checks.py -v`
Expected: PASS (rule engine sudah benar — test jaga parity).

- [ ] **Step 2: Tambah invariant ke recon_finance.py**

Tambahkan fungsi di `scripts/recon_finance.py` (setelah definisi `db()`):

```python
def parity_rule_engine():
    """FIN-PARITY-1/2/3: identitas net income + jumlah amort dari rule engine.

    Membuka koneksi DB sendiri (pola file ini: tiap check pakai blok
    `with db() as conn` pendek — TIDAK ada koneksi persisten di main()).
    """
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
    from finance_rules import compute_finance

    with db() as conn, conn.cursor() as cur:
        cur.execute("SELECT COALESCE(v, '') FROM ledger_meta WHERE k='kurs_idr_usd'")
        r = cur.fetchone()
        kurs = float(r[0]) if r and r[0] else 17801.17
        cur.execute("SELECT id, upstream, qty, cost_per, curr, status, kurs_idr_usd FROM assets")
        assets = [dict(zip(["id", "upstream", "qty", "cost_per", "curr", "status", "kurs_idr_usd"], row))
                  for row in cur.fetchall()]
        cur.execute("SELECT amount_usdc, status FROM payouts")
        payouts = [{"amount_usdc": row[0], "status": row[1] or "confirmed"} for row in cur.fetchall()]
        cur.execute("SELECT amount_idr, amount_usdc, kurs_idr_usd FROM refunds")
        refunds = [{"amount_idr": row[0], "amount_usdc": row[1], "kurs_idr_usd": row[2]} for row in cur.fetchall()]
        cur.execute("SELECT upstream, loss FROM impairments")
        impairments = [{"upstream": row[0], "loss": row[1]} for row in cur.fetchall()]
        cur.execute("SELECT upstream_slug, count(*) AS n FROM providers WHERE status='ok' GROUP BY upstream_slug")
        providers = [{"upstream_slug": row[0], "n": row[1]} for row in cur.fetchall()]

    res = compute_finance(assets, payouts, refunds, impairments, kurs, providers=providers)
    expected = round(res["total_payout"] + res["total_refund_usd"] - res["amort_usd"]
                     - res["total_imp_loss_usd"] - res["opex"], 2)
    ok = (res["net_income"] == expected)
    non_active = sum(1 for a in assets if (a.get("status") or "active") != "active")
    ok = ok and (len(res["amort_assets"]) == non_active)
    return ok, res
```

Dan di `main()`, setelah blok invariant yang ada (check terakhir, sebelum laporan summary), tambahkan:

```python
    # 7. FIN-PARITY: rule engine identitas + amort count (koneksi sendiri)
    try:
        ok_par, res_par = parity_rule_engine()
        checks.append(("FIN-PARITY rule engine identitas net income", ok_par))
        if not ok_par:
            fails.append("FIN-PARITY rule engine tidak konsisten")
    except Exception as e:
        fails.append("FIN-PARITY gagal eksekusi: %s" % e)
```

CATATAN: `parity_rule_engine()` TIDAK memakai `conn` dari `main()` — tidak ada koneksi persisten di `main()` (file membuka blok `with db() as conn` pendek per check). Letakkan panggilan setelah semua invariant lain dievaluasi dan SEBELUM blok print summary/final fail verdict, agar error dari parity masuk ke `fails`.

- [ ] **Step 3: Run test — GREEN**

Run: `cd backend && python -m pytest tests/test_recon_checks.py -v`
Expected: 2 passed.

- [ ] **Step 4: Compile check + full suite**

Run: `cd backend && python -m compileall -q ../scripts/ && python -m pytest --cov=logic --cov=app --cov-report=term-missing -q`
Expected: exit 0 + ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/recon_finance.py backend/tests/test_recon_checks.py
git commit -m "feat: recon_finance parity rule engine (FIN-PARITY-1/2/3)"
```

---

### Task 8: Backend CI — tambah coverage gate finance_rules ≥80

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Tambah step CI untuk rule engine**

Di job `backend`, setelah step `pytest tests/test_logic.py ... --cov-fail-under=80`, tambahkan:

```yaml
      - name: Rule engine finance coverage gate
        run: |
          pytest tests/test_finance_rules.py tests/test_financial_audit.py tests/test_recon_checks.py \
            --cov=finance_rules --cov=financial_audit \
            --cov-report=term-missing --cov-fail-under=80 -q
```

- [ ] **Step 2: Run local setara CI**

Run: `cd backend && pytest tests/test_finance_rules.py tests/test_financial_audit.py tests/test_recon_checks.py --cov=finance_rules --cov=financial_audit --cov-report=term-missing --cov-fail-under=80 -q`
Expected: PASS, total coverage finance_rules ≥80 (jika <80, tambah fixture test di Task 1/7 sampai ≥80).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: coverage gate rule engine finance (finance_rules ≥80)"
```

---

### Task 9: Frontend — hapus 14 page blocked (Q13)

**Files:**
- Delete: `frontend/src/pages/{Analytics,Budgets,Catalog,Combos,Dashboard,FleetHealth,Keys,Market,Pnl,Settlements,Topups,Upstreams,Earnings,Usage}.jsx`
- Delete: `frontend/src/pages/Topups.test.jsx`
- Modify: `frontend/src/App.jsx` (hapus 14 import + 14 Route)
- Modify: `frontend/src/components/Layout.jsx` (hapus 14 entry TITLES)
- Modify: `frontend/src/components/Sidebar.jsx` (hapus 14 nav link + section)
- Modify: `frontend/src/components/Sidebar.test.jsx`
- Modify: `frontend/src/components/Layout.test.jsx`

**Interfaces:**
- Produces: App.jsx hanya 5 route: `/`(Reliability), `/asks`, `/auto-pricing`, `/settings` + login gate. Layout TITLES hanya untuk page yang tersisa. Sidebar section: Overview(Reliability), Publisher(Ask Price, Auto-Pricing), System(Settings).

- [ ] **Step 1: Hapus file page + test**

Run:
```bash
git rm frontend/src/pages/Analytics.jsx frontend/src/pages/Budgets.jsx frontend/src/pages/Catalog.jsx \
  frontend/src/pages/Combos.jsx frontend/src/pages/Dashboard.jsx frontend/src/pages/FleetHealth.jsx \
  frontend/src/pages/Keys.jsx frontend/src/pages/Market.jsx frontend/src/pages/Pnl.jsx \
  frontend/src/pages/Settlements.jsx frontend/src/pages/Topups.jsx frontend/src/pages/Upstreams.jsx \
  frontend/src/pages/Earnings.jsx frontend/src/pages/Usage.jsx frontend/src/pages/Topups.test.jsx
```

- [ ] **Step 2: Update App.jsx — hapus import + route**

Hapus 14 baris import (Analytics, Budgets, Catalog, Combos, Dashboard, Earnings, FleetHealth, Keys, Market, Pnl, Settlements, Topups, Upstreams, Usage) dan 14 baris `<Route ...>` yang bersesuaian. Sisakan route:
```jsx
<Route path="/" element={<Reliability />} />
<Route path="/asks" element={<Asks />} />
<Route path="/auto-pricing" element={<AutoPricing />} />
<Route path="/settings" element={<Settings />} />
```

- [ ] **Step 3: Update Layout.jsx — TITLES hanya 5**

File: `frontend/src/components/Layout.jsx`.

Ganti map TITLES (18 entry) menjadi 5:
```jsx
const TITLES = {
  '': 'Reliability',
  '/': 'Reliability',
  '/asks': 'Ask Price',
  '/auto-pricing': 'Auto-Pricing',
  '/settings': 'Settings',
};
```
(Baca Layout.jsx saat implementasi — pastikan key path cocok dengan route yang tersisa.)

- [ ] **Step 4: Update Sidebar.jsx**

File: `frontend/src/components/Sidebar.jsx`.

Ganti SECTIONS menjadi:
```jsx
const SECTIONS = [
  {
    title: 'Overview',
    links: [
      { to: '/', label: 'Reliability', icon: Activity },
    ],
  },
  {
    title: 'Publisher',
    links: [
      { to: '/asks', label: 'Ask Price', icon: MessageSquare },
      { to: '/auto-pricing', label: 'Auto-Pricing', icon: Zap },
    ],
  },
  {
    title: 'System',
    links: [
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];
```
(Baca Sidebar.jsx saat implementasi — ikuti struktur icon import yang ada.)

- [ ] **Step 5: Update Sidebar.test.jsx & Layout.test.jsx**

`frontend/src/components/Sidebar.test.jsx`: ganti referensi `'/topups'` → `'/asks'` dan `'Top-ups'` → `'Ask Price'`.
`frontend/src/components/Layout.test.jsx`: ganti `renderLayout('/topups')` + heading `'Top-ups'` → `renderLayout('/asks')` + heading `'Ask Price'`.

- [ ] **Step 6: Run frontend test + build**

Run:
```bash
cd frontend && npm test -- --run && npm run build
```
Expected: PASS + build sukses. Jika coverage < threshold, tambah/update test untuk page tersisa (Reliability/Asks/AutoPricing/Settings) sampai ≥ 80/80/70/80.

- [ ] **Step 7: Commit**

```bash
git add -A frontend/
git commit -m "feat: hapus 14 page API mati (Q13) — efisiensi rate limit"
```

---

### Task 10: Frontend — badge per metrik + variance summary (finance pages)

**Files:**
- Modify: `frontend/src/components/FinanceStatus.jsx` (Create jika belum ada)
- Modify: `frontend/src/pages/Settings.jsx` (atau halaman yang menampilkan finance summary — baca struktur saat implementasi)
- Modify: `frontend/src/App.test.jsx` (jika perlu)

**Interfaces:**
- Produces: komponen `FinanceStatus` dengan props `metrics` (array `{key,label,value,verified}`) → render badge `verified` (hijau ✓) / `pending` (kuning) per metrik + variance summary line.

- [ ] **Step 1: Tulis test komponen (RED)**

`frontend/src/components/FinanceStatus.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import FinanceStatus from './FinanceStatus';

describe('FinanceStatus', () => {
  it('renders verified badge per metric', () => {
    render(<FinanceStatus metrics={[
      { key: 'net_income', label: 'Net Income', value: '$100.00', verified: true },
      { key: 'kurs', label: 'Kurs', value: '17,781', verified: false },
    ]} />);
    expect(screen.getByText('Net Income')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('verified')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('renders variance summary line', () => {
    render(<FinanceStatus metrics={[]} variance="2 aset retired tanpa impairment (variance report)" />);
    expect(screen.getByText(/variance report/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — RED**

Run: `cd frontend && npx vitest run src/components/FinanceStatus.test.jsx`
Expected: FAIL `Cannot find module './FinanceStatus'`.

- [ ] **Step 3: Implement komponen**

`frontend/src/components/FinanceStatus.jsx`:

```jsx
export default function FinanceStatus({ metrics = [], variance = '' }) {
  return (
    <section className="finance-status" aria-label="Finance status">
      <h3>Status Metrik (decision-grade)</h3>
      <ul className="finance-metrics">
        {metrics.map((m) => (
          <li key={m.key} className={`metric metric-${m.verified ? 'verified' : 'pending'}`}>
            <span className="metric-label">{m.label}</span>
            <span className="metric-value">{m.value}</span>
            <span className={`badge badge-${m.verified ? 'verified' : 'pending'}`}>
              {m.verified ? '✓ verified' : 'pending'}
            </span>
          </li>
        ))}
      </ul>
      {variance ? <p className="finance-variance">{variance}</p> : null}
    </section>
  );
}
```

- [ ] **Step 4: Run test — GREEN**

Run: `cd frontend && npx vitest run src/components/FinanceStatus.test.jsx`
Expected: 2 passed.

- [ ] **Step 5: Integrasi ke halaman finance yang tersisa**

Pada halaman yang menampilkan finance (lihat `Settings.jsx` / route yang tersisa — implementasi disesuaikan), render:
```jsx
<FinanceStatus
  metrics={[
    { key: 'net_income', label: 'Net Income', value: usd(fin?.net_income), verified: fin?.verified?.net_income ?? false },
    { key: 'payout', label: 'Payout', value: usd(fin?.total_payout), verified: fin?.verified?.total_payout ?? false },
    { key: 'amort', label: 'Amortisasi', value: usd(fin?.amort_usd), verified: fin?.verified?.amort_usd ?? false },
    { key: 'kurs', label: 'Kurs', value: fin?.kurs?.toLocaleString('id-ID'), verified: fin?.verified?.kurs ?? false },
  ]}
  variance={fin?.variance ? `${fin.variance.length} variance terdeteksi — lihat report` : ''}
/>
```
CATATAN: halaman finance lama (Pnl/Earnings) sudah dihapus Task 9 — jika tidak ada halaman finance tersisa di 5 route, integrasi komponen cukup di `Settings.jsx` (atau route yang dipilih owner). Sesuaikan saat implementasi.

- [ ] **Step 6: Full frontend test + build**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: PASS + build sukses.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/FinanceStatus.jsx frontend/src/components/FinanceStatus.test.jsx frontend/src/pages/Settings.jsx
git commit -m "feat: badge per metrik + variance summary (F4 decision-grade)"
```

---

### Task 11: Docs & README enterprise SaaS (14 gap)

**Files:**
- Create: `LICENSE` (MIT — keputusan owner default; sesuaikan bila owner pilih lain)
- Create: `.env.example` (template variabel)
- Modify: `README.md` (env matrix, API quickstart link, Vercel deploy policy, CI status, data retention, ADR index, RACI, support/SLA)
- Modify: `docs/ARCHITECTURE.md` (reconcile Vercel auto-deploy vs manual)
- Modify: `docs/PRODUCTION-LOCK.md` (hapus kontradiksi deploy model)
- Modify: `docs/OPS-RUNBOOK.md` (UPSTREAM_DB wajib, DSN production 6432, gen_finance via env)
- Modify: `.gitignore` (tambah `session-*.md`)

- [ ] **Step 1: Buat LICENSE (MIT)**

```text
MIT License

Copyright (c) 2026 Faiz (fazulfi)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Buat .env.example**

```bash
# ── Backend (server-only) ──
# DSN PostgreSQL production. WAJIB. Tidak ada fallback hardcode.
UPSTREAM_DB=postgresql://USER:PASSWORD@127.0.0.1:6432/wuthering_waves_multi_agent
# Password dashboard (login). WAJIB.
DASHBOARD_PASSWORD=change-me
# CORS origin list (pisahkan koma). WAJIB di production.
ALLOWED_ORIGINS=https://upstream-static.vercel.app
# Port backend. Default 8124.
UPSTREAM_API_PORT=8124
# Rate limit. Default 60 req / 60 detik.
RL_LIMIT=60
RL_WINDOW=60
# Sesi login. Default 86400 detik.
SESSION_TTL=86400
# Poll interval (detik). Default 10.
UPSTREAM_POLL_SECONDS=10

# ── Integrasi eksternal (server-only) ──
INFERHUB_API_KEY=change-me
FOREX_KEY=change-me

# ── Frontend (public, hanya saat build) ──
VITE_API_URL=http://localhost:8124
```

- [ ] **Step 3: Update .gitignore**

Tambahkan:
```gitignore
session-*.md
```

- [ ] **Step 4: Update README.md**

Tambahkan/mutakhirkan section:
- License badge: `[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)`
- Section "Environment Variables" (tabel matrix dari audit):
  | Variable | Scope | Required | Exposure |
  |---|---|---|---|
  | `VITE_API_URL` | frontend build/local | optional | public |
  | `DASHBOARD_PASSWORD` | backend | yes | server-only |
  | `UPSTREAM_DB` | backend/scripts | yes | server-only |
  | `ALLOWED_ORIGINS` | backend | yes in production | server-only |
  | `VERCEL_TOKEN` | deploy operator | deploy-only | secret |
  | `INFERHUB_API_KEY` | backend/daemon | yes in production | server-only |
  | `FOREX_KEY` | finance service | depending | server-only |
- Section "API Reference": link `docs/inferhub-openapi-spec.json` + quickstart curl contoh.
- Section "Deployment": tulis eksplisit — *GitHub Actions = CI only (no CD). Frontend Vercel `upstream-static` deploy manual via token; backend VPS manual via SSH + systemd. Vercel auto-deploy pada main merge TIDAK digunakan sebagai mekanisme rilis; rilis = PR merged + CI green + manual promote.*
- Section "Release & Versioning" + "Changelog" (pola semver, CHANGELOG.md di root).
- Section "Support & SLA": single-tenant, best-effort, kontak owner.
- Section "Data Retention & Backup": 14d lokal / 30d offsite, backup sebelum deploy.
- Section "Architecture Decision Records (ADR)": index `docs/adr/` dengan entri pertama ADR-001 (rule engine finance), ADR-002 (hapus page blocked), ADR-003 (deploy manual no-CD).
- Section "CI Status Matrix": backend (python 3.11: compileall, unittest, pytest, cov), frontend (node 20: oxlint, vitest, build).

- [ ] **Step 5: Reconcile docs PRODUCTION-LOCK.md & ARCHITECTURE.md**

`docs/PRODUCTION-LOCK.md` — ganti baris deploy model menjadi:
```text
Deploy model: GitHub Actions = CI only (no CD). Frontend Vercel `upstream-static` deploy
manual via token (lihat OPS-RUNBOOK). Backend VPS manual via SSH + systemd. Tidak ada
auto-deploy ke production pada main merge.
```
`docs/ARCHITECTURE.md` — sesuaikan bagian deployment agar konsisten (hapus kalimat "Vercel auto-deploy on main merge", pakai kalimat sama dgn PRODUCTION-LOCK).

- [ ] **Step 6: Update OPS-RUNBOOK.md (finance DSN)**

Tambah subsection "Finance scripts (Phase 3)":
```text
Semua script finance (gen_finance.py, fin_ops.py, recon_finance.py, ledger_update.py)
WAJIB dipanggil dengan env UPSTREAM_DB (production 6432). Tidak ada fallback hardcode.

Secret disimpan di /home/gamesim/.dashboard.env (chmod 600, di luar repo) — JANGAN tulis
DSN ber-password di shell history, unit file, atau command line.

Contoh (source secret file, bukan inline):
  cd /home/gamesim/dashboard && \
  set -a && . /home/gamesim/.dashboard.env && set +a && \
  /home/gamesim/.venv-dash/bin/python3 scripts/gen_finance.py

Systemd unit wwma-finance.service harus memiliki EnvironmentFile=/home/gamesim/.dashboard.env
(tambahkan drop-in .d bila belum ada — jangan edit unit utama).
```

- [ ] **Step 7: Buat docs/adr/ADR-001.md s/d ADR-003.md**

`docs/adr/ADR-001-rule-engine-finance.md`:
```markdown
# ADR-001: Rule Engine Finance sebagai Satu-Satunya Sumber Formula

**Status**: Accepted (2026-08-20)
**Context**: Dashboard (app.py db_read_finance) dan workbook (gen_finance.py)
menghitung net income dengan formula terpisah → mismatch (amortisasi retired,
kurs global vs per-asset).
**Decision**: Buat `backend/finance_rules.py`; kedua konsumen memanggil fungsi yang sama.
**Consequences**: Satu titik perubahan formula; regression test wajib; parity dijamin
oleh recon_finance (FIN-PARITY).
```

`docs/adr/ADR-002-hapus-page-blocked.md`:
```markdown
# ADR-002: Hapus Page yang API-nya Dimatikan (Q13)

**Status**: Accepted (2026-08-20)
**Context**: Allowlist frontend hanya mengizinkan auto-pricing/reliability/orderbook/ask.
14 page lain memanggil API terblokir setiap interval poll → boros rate limit.
**Decision**: Hapus 14 page (frontend-only). Route backend tetap (tidak dipanggil =
tidak konsumsi rate limit). Reversible via git.
**Consequences**: Dashboard lebih ramping (5 route), polling sia-sia berhenti.
```

`docs/adr/ADR-003-deploy-manual-no-cd.md`:
```markdown
# ADR-003: Deploy Manual, CI Tanpa CD

**Status**: Accepted (2026-08-20, konsisten dgn Phase 2)
**Context**: Ada kontradiksi dokumentasi Vercel auto-deploy vs manual deploy.
**Decision**: GitHub Actions = CI only. Frontend Vercel + backend VPS = manual promote
setelah PR merged + CI green. Tidak ada auto-deploy production.
**Consequences**: Release terkontrol, evidence diambil sebelum promote.
```

- [ ] **Step 8: Docs link check + commit**

Run: `git diff --check && git status`
Expected: tidak ada whitespace error.

```bash
git add LICENSE .env.example .gitignore README.md docs/ARCHITECTURE.md docs/PRODUCTION-LOCK.md docs/OPS-RUNBOOK.md docs/adr/
git commit -m "docs: enterprise SaaS README + LICENSE + env matrix + ADR + deploy policy"
```

---

### Task 12: Verifikasi akhir + PR

**Files:**
- Seluruh perubahan task 1-11.

- [ ] **Step 1: Backend full suite + coverage**

Run: `cd backend && python -m pytest --cov=logic --cov=app --cov-report=term-missing -q && python -m pytest tests/test_logic.py --cov=logic --cov-report=term-missing --cov-fail-under=80 -q`
Expected: ALL PASS, logic ≥80.

- [ ] **Step 2: Frontend full suite + build**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: PASS (thresholds 80/80/70/80) + build sukses.

- [ ] **Step 3: Compile all + git status bersih**

Run: `python -m compileall -q backend/ scripts/ && git status`
Expected: exit 0; working tree hanya berisi perubahan plan ini (tidak ada `session-*.md`, `.env*`, `revenue/`).

- [ ] **Step 4: Push branch + buka PR (CI tanpa CD)**

```bash
git checkout -b feat/phase3-finance-profitability
git push -u origin feat/phase3-finance-profitability
gh pr create --title "feat: Phase 3 Finance & Profitability (rule engine, audit trail, page cleanup)" \
  --body "Closes Phase 3: rule engine finance bersama, gen_finance UPSTREAM_DB fix, financial_audit trail, recon parity, hapus 14 page blocked, README enterprise SaaS. CI only (no CD)."
```

- [ ] **Step 5: Tunggu CI green**

Run: `gh pr checks --watch`
Expected: backend + frontend jobs PASS (termasuk coverage gate finance_rules ≥80).

- [ ] **Step 6: Merge PR**

```bash
gh pr merge --squash --delete-branch
```
(Catatan: merge dilakukan setelah CI green + review. Branch protection main require PR + CI green.)

---

### Task 13: Deploy production (setelah merge + backup)

**Files:**
- VPS: `/home/gamesim/dashboard` (pull main), systemd user services, `wwma-finance.service` drop-in
- Vercel: `upstream-static`

**Prerequisite:** Backup dulu (wajib, pola Phase 2):
```bash
ssh root@82.25.62.204 'su - gamesim -c "cd /home/gamesim/dashboard && UPSTREAM_BACKUP_SKIP_S3=1 bash scripts/backup_db.sh"'
```

- [ ] **Step 1: Deploy backend (VPS)**

```bash
ssh root@82.25.62.204 'su - gamesim -c "cd /home/gamesim/dashboard && git pull --ff-only origin main"'
```
Lalu pasang secret file (sekali saja — jangan pernah tulis password di shell/repo):
```bash
# JALANKAN SEKALI SAJA (bootstrap): buat file secret di luar repo, chmod 600
ssh root@82.25.62.204 'su - gamesim -c "umask 077 && printf \"UPSTREAM_DB=postgresql://wwma_app:<REDACTED-PASSWORD>@127.0.0.1:6432/wuthering_waves_multi_agent\n\" > /home/gamesim/.dashboard.env && chmod 600 /home/gamesim/.dashboard.env"'
```
> ⚠️ Operator: isi `<REDACTED-PASSWORD>` saat eksekusi langsung di VPS (jangan di-commit, jangan di command line history yang persisten). Setelah file dibuat, JANGAN print isinya.
Lalu pasang drop-in `EnvironmentFile` (bukan `Environment=` — menghindari password di unit file yang bisa ke-expose):
```bash
ssh root@82.25.62.204 'su - gamesim -c "mkdir -p ~/.config/systemd/user/wwma-finance.service.d && cat > ~/.config/systemd/user/wwma-finance.service.d/override.conf <<EOF
[Service]
EnvironmentFile=/home/gamesim/.dashboard.env
EOF
systemctl --user daemon-reload && systemctl --user restart wwma-finance.service wwma-upstream-backend.service"'
```
Verifikasi (tanpa print secret):
```bash
ssh root@82.25.62.204 'su - gamesim -c "systemctl --user --no-pager status wwma-finance.service wwma-upstream-backend.service | head -30"'
```

- [ ] **Step 2: Regenerate ledger + workbook dari DB production (fix F1)**

```bash
ssh root@82.25.62.204 'su - gamesim -c "cd /home/gamesim/dashboard && set -a && . /home/gamesim/.dashboard.env && set +a && /home/gamesim/.venv-dash/bin/python3 scripts/gen_finance.py"'
```
Expected: summary net income dengan data DB production (70 assets); ledger.json + keuangan.xlsx regenerated BENAR.

- [ ] **Step 3: Deploy frontend (Vercel)**

```bash
ssh root@82.25.62.204 'su - gamesim -c "export VERCEL_TOKEN=\$(grep VERCEL_TOKEN ~/.hermes-suisui/.env | cut -d= -f2); cd /home/gamesim/dashboard/frontend && npx vercel deploy --prod --yes --token \"\$VERCEL_TOKEN\""'
```

- [ ] **Step 4: Smoke test penuh**

```bash
curl -s -o /dev/null -w "frontend %{http_code}\n" https://upstream-static.vercel.app/
curl -s -o /dev/null -w "backend-health %{http_code}\n" https://ops.budgezen.com/api/health
# login
curl -s -X POST https://ops.budgezen.com/api/login -H "Content-Type: application/json" \
  -d '{"password":"'"$DASHBOARD_PASSWORD"'"}' | head -c 200
# finance (authed)
TOKEN=$(curl -s -X POST https://ops.budgezen.com/api/login -H "Content-Type: application/json" \
  -d '{"password":"'"$DASHBOARD_PASSWORD"'"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s https://ops.budgezen.com/api/finance -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -40
# reliability + SSE live
curl -s -o /dev/null -w "reliability %{http_code}\n" https://ops.budgezen.com/api/reliability/summary -H "Authorization: Bearer $TOKEN"
```
Expected: 200 semua; finance net_income konsisten.

- [ ] **Step 5: Jalankan recon_finance**

```bash
ssh root@82.25.62.204 'su - gamesim -c "cd /home/gamesim/dashboard && set -a && . /home/gamesim/.dashboard.env && set +a && /home/gamesim/.venv-dash/bin/python3 scripts/recon_finance.py"'
```
Expected: PASS semua invariant (termasuk FIN-PARITY rule engine).

---

### Task 14: Evidence release + audit

**Files:**
- Create: `artifacts/phase3/deploy/evidence-<YYYYMMDDTHHMMSS>Z.md`
- Create: `artifacts/phase3/audit/phase3-audit.md` (5/5 iterate)

- [ ] **Step 1: Buat evidence (template inline — pola Phase 2)**

`artifacts/phase3/deploy/evidence-<ts>Z.md` — gunakan template persis berikut (isi `<...>` saat implementasi):

```markdown
# Phase 3 Release Evidence — Finance & Profitability

- **Title**: Phase 3 Finance & Profitability (rule engine, audit trail, page cleanup)
- **Timestamp (UTC)**: <YYYY-MM-DDTHH:MM:SSZ>
- **Operator**: <nama/role>
- **Source commit**: <hash main setelah merge PR Phase 3>
- **Release description**: rule engine finance bersama (F3), gen_finance UPSTREAM_DB fix (F1),
  tabel financial_audit (F4), recon FIN-PARITY (F2), hapus 14 page frontend blocked (Q13),
  README/docs enterprise SaaS, unit test ≥80.

## Backup (pre-deploy)
- Path: `/home/gamesim/shared-memory/inferhub-business/backups/inferhub-<ts>.sql.gz`
- sha256: `<hash>`
- Retention: 14d local / 30d offsite (rclone)

## Schema
- Additive-only: `financial_audit` CREATE TABLE IF NOT EXISTS + 2 index; semua DDL IF NOT EXISTS. Verifikasi: <output check>.

## Systemd (VPS)
- `wwma-finance.service`: <active (running), timer OnCalendar 23:30>
- `wwma-upstream-backend.service`: <active (running)>
- Drop-in `wwma-finance.service.d/override.conf`: `EnvironmentFile=/home/gamesim/.dashboard.env` (isi secret tidak pernah di-print)

## Smoke test
- Frontend `https://upstream-static.vercel.app/` → <HTTP 200>
- Backend `https://ops.budgezen.com/api/health` → <HTTP 200>
- Login `/api/login` → <200, token issued>
- Finance `/api/finance` (authed) → <200, net_income konsisten>
- Reliability `/api/reliability/summary` (authed) → <200>
- SSE live → <stream OK>

## Reconciliation
- `recon_finance.py` → PASS (invariant 1-6 + FIN-PARITY-1/2/3)

## CI + Coverage
- GitHub Actions: backend + frontend jobs PASS (CI only, no CD)
- Backend: finance_rules ≥80%, logic ≥80%
- Frontend: vitest thresholds 80/80/70/80 PASS

## Signature
- Operator: <nama> (2026-08-20)
- Owner approval: ✅ (approved plan 2026-08-20)
```

- [ ] **Step 2: Audit 5/5 iterate**

Audit ulang terhadap semua requirement owner:
1. ✅ Rule engine (formula sama, test hijau)
2. ✅ gen_finance UPSTREAM_DB (bug F1 fixed, xlsx benar)
3. ✅ financial_audit trail (buy/retire/refund/add)
4. ✅ Recon parity (FIN-PARITY)
5. ✅ Page cleanup 14 (frontend-only, 5 route tersisa)
6. ✅ README/docs enterprise SaaS (env matrix, LICENSE, ADR, deploy policy)
7. ✅ Unit test ≥80 (backend + frontend)
8. ✅ PR CI tanpa CD, deploy VPS+Vercel, evidence
Iterasi sampai semua PASS — tulis hasil di `artifacts/phase3/audit/phase3-audit.md`.

- [ ] **Step 3: Commit evidence**

```bash
git add artifacts/phase3/
git commit -m "chore: Phase 3 release evidence + audit"
```

- [ ] **Step 4: Update decision log + PRODUCTION-LOCK**

Update `artifacts/phase3/audit/decision-log.md` status → `✅ DEPLOYED (2026-08-20)` dan `docs/PRODUCTION-LOCK.md` dengan release terbaru. Commit:
```bash
git add artifacts/phase3/audit/decision-log.md docs/PRODUCTION-LOCK.md
git commit -m "chore: Phase 3 release lock + decision log updated"
```

---

## Self-Review

**1. Spec coverage:**
- F1 (single source of truth) → Task 4 (gen_finance UPSTREAM_DB) + Task 5 (hapus fallback DSN) ✓
- F2 (reconciliation audit-only) → Task 7 (recon parity) + Task 13 Step 5 (run recon) ✓
- F3 (rule engine) → Task 1-3 (rule engine + fixture tests + refactor app.py) ✓
- F4 (decision-grade: badge per metrik, variance, audit trail) → Task 6 (audit table) + Task 10 (badge) ✓
- Q13 (hapus page blocked) → Task 9 (14 page) ✓
- Q7/Q10/Q11 (deploy: backup, additive, timer, manual) → Task 13 (deploy) + Task 14 (evidence) ✓
- README enterprise SaaS (14 gap) → Task 11 ✓
- Unit test ≥80 → Task 1-3, 7-10 (tests) + Task 8 (CI gate) ✓
- PR dulu CI tanpa CD → Task 12 ✓

**2. Placeholder scan:** Semua task berisi kode/command exact; tidak ada TBD/TODO/"appropriate". Task 6/10/11 menyebut "baca struktur saat implementasi" untuk titik wire yang bergantung konteks aktual — ini diizinkan karena nama variabel persis ditentukan oleh file yang sudah ada, dan instruksi alternatif (CATATAN) diberikan.

**3. Type consistency:** `compute_finance(assets, payouts, refunds, impairments, kurs_meta, opex=0.10)` konsisten dipakai Task 1/2/3/4/7. `amortization(assets, kurs_meta)` → `(rows, total)` konsisten. Key dict return (`total_payout, n_payout, total_refund_usd, refunds, amort_usd, amort_assets, total_imp_loss_usd, impairments, opex, net_income, total_capital_usd, total_asset_qty, assets, aktif, kurs`) konsisten di Task 2 dan Task 3/4/7.
