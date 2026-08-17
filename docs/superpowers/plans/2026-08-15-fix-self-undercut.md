### Task 1: Menambahkan helper `get_my_slugs()` + perbaikan `get_positions`

**Files:**
- Modify: `scripts/auto_pricing.py:440-536` (get_positions)
- Test: `scripts/tests/test_self_undercut.py` (baru)

**Interfaces:**
- Consumes: `_get_providers_cached()` (sudah ada) — list provider dgn field `upstreamSlug`, `enabled`.
- Produces: `get_my_slugs(provs=None) -> set[str]` — set semua upstreamSlug milik kita (enabled). `get_positions(catalog, our_price=None)` tetap signature, tapi `levels` sekarang exclude SEMUA ask slug milik kita.

- [ ] **Step 1: Tulis failing test**

Buat `scripts/tests/test_self_undercut.py`:

```python
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import auto_pricing as ap

class TestGetPositionsSelfUndercut(unittest.TestCase):
    def test_levels_exclude_ask_semua_upstream_kita(self):
        """Ask dari upstream LAIN milik kita (commandcode, opencode-go) TIDAK boleh
        jadi 'kompetitor' — semua slug dari providers enabled = milik kita."""
        provs = [
            {"upstreamSlug": "codebuddy", "enabled": True},
            {"upstreamSlug": "cline-pass", "enabled": True},
            {"upstreamSlug": "commandcode", "enabled": True},
            {"upstreamSlug": "opencode-go", "enabled": True},
            {"upstreamSlug": "codebuddy-cn", "enabled": True},
            {"upstreamSlug": "codex", "enabled": True},
            # kompetitor sejati
            {"upstreamSlug": "competitor-x", "enabled": True},
        ]
        catalog = {
            "codebuddy": {"deepseek-v4-flash": {"asksIn": [0.07, 0.0119], "officialIn": 0.07}},
            "commandcode": {"deepseek-v4-flash": {"asksIn": [0.0035, 0.007], "officialIn": 0.07}},
            "opencode-go": {"deepseek-v4-flash": {"asksIn": [0.0042], "officialIn": 0.07}},
            "competitor-x": {"deepseek-v4-flash": {"asksIn": [0.05], "officialIn": 0.07}},
        }
        ap._PROVIDERS_CACHE["ts"] = 0
        ap._PROVIDERS_CACHE["data"] = provs
        # our_price: kita (codebuddy) di 0.07
        pos = ap.get_positions(catalog, our_price={("codebuddy", "deepseek-v4-flash"): 0.07})
        levels = pos[("codebuddy", "deepseek-v4-flash")]["levels"]
        prices = [p for p, q in levels]
        # 0.0035/0.0042/0.007 (commandcode/opencode-go) = milik kita -> EXCLUDED
        # 0.05 (competitor-x) = kompetitor sejati -> TETAP ADA
        # 0.0119/0.07 (codebuddy) = milik kita -> EXCLUDED
        self.assertNotIn(0.0035, prices)
        self.assertNotIn(0.0042, prices)
        self.assertNotIn(0.007, prices)
        self.assertIn(0.05, prices)
        self.assertNotIn(0.0119, prices)

    def test_levels_include_kompetitor_sejati(self):
        """Kalau ADA kompetitor sejati di bawah kita, tetap muncul di levels."""
        provs = [{"upstreamSlug": "codebuddy", "enabled": True}]
        catalog = {
            "codebuddy": {"m1": {"asksIn": [0.07], "officialIn": 0.07}},
            "rival": {"m1": {"asksIn": [0.05], "officialIn": 0.07}},
        }
        ap._PROVIDERS_CACHE["ts"] = 0
        ap._PROVIDERS_CACHE["data"] = provs
        pos = ap.get_positions(catalog, our_price={("codebuddy", "m1"): 0.07})
        prices = [p for p, q in pos[("codebuddy", "m1")]["levels"]]
        self.assertIn(0.05, prices)

    def test_get_my_slugs_dinamis(self):
        provs = [
            {"upstreamSlug": "codebuddy", "enabled": True},
            {"upstreamSlug": "codebuddy", "enabled": False},
            {"upstreamSlug": "codex", "enabled": True},
        ]
        slugs = ap.get_my_slugs(provs)
        self.assertEqual(slugs, {"codebuddy", "codex"})

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test, verifikasi FAIL**

```bash
cd /c/Users/faizz/upstream-dashboard && python -m unittest scripts.tests.test_self_undercut -v 2>&1 | tail -20
```

Expected: FAIL — `get_my_slugs` tidak ada (AttributeError), dan `0.0035` masih ada di levels (karena commandcode tidak diexclude).

- [ ] **Step 3: Implement minimal fix**

Di `scripts/auto_pricing.py`, tambahkan setelah `_get_providers_cached` (sekitar line 322):

```python
def get_my_slugs(provs=None):
    """Semua upstreamSlug milik kita (satu publisher) — dari providers enabled.
    Dipakai utk exclude ask kita lintas-upstream dari orderbook & market anchor."""
    if provs is None:
        provs = _get_providers_cached()
    return {p.get("upstreamSlug") for p in provs if p.get("enabled") and p.get("upstreamSlug")}
```

Di `get_positions`, ganti blok `ok_kita` (line 463-471) dan logika `remaining` (line 503-525):

```python
    try:
        provs = _get_providers_cached()
        my_slugs = get_my_slugs(provs)
        ok_kita = {}
        if provs:
            for p in provs:
                if p.get("enabled") and p.get("upstreamSlug"):
                    s = p.get("upstreamSlug")
                    ok_kita[s] = ok_kita.get(s, 0) + 1
    except Exception:
        my_slugs = set()
        ok_kita = {}
```

Lalu di loop per model, ganti block `remaining=1 ... comp_levels` dengan exclude SEMUA slug milik kita:

```python
            # FIX self-undercut (2026-08-15): SEMUA ask dari upstreamSlug milik kita
            # (lintas-upstream: commandcode, opencode-go, codex, dll) adalah ask KITA
            # — bukan kompetitor. Exclude penuh dari orderbook.
            comp_levels = []
            for p, q in sorted(cnt.items()):
                # (p, q) adalah qty ask di level p — semua dari slug milik kita?
                # cnt dihitung dari asksIn catalog utk slug ini; slug lain di key
                # catalog terpisah. Kita exclude ask slug milik kita DI SINI dengan
                # memeriksa slug pemilik level.
                q_after = q
                if slug in my_slugs:
                    q_after = 0
                if q_after > 0:
                    comp_levels.append((p, q_after))
```

**PENTING — analisis struktural:** `get_positions` di-loop per `(slug, sub)` di catalog. `cnt` hanya berisi asksIn dari SATU slug (key loop `slug`). Ask dari slug LAIN milik kita ada di key catalog terpisah — TAPI `out[(slug, mid)]` dihitung per-slug. Masalahnya: daemon baca `levels` utk `(slug, mid)` dari catalog slug KITA, jadi ask commandcode TIDAK ADA di cnt slug codebuddy-cn.

**Koreksi desain:** `levels` utk `(codebuddy-cn, deepseek-v4-flash)` harus menggabungkan orderbook SEMUA slug yang jual model itu, lalu exclude ask dari slug milik kita. Ini butuh restrukturisasi `get_positions`: kumpulkan semua level per `mid` dari semua slug di catalog, tandai pemilik slug, lalu exclude milik kita.

Implementasi baru `get_positions` (ganti seluruh body function):

```python
def get_positions(catalog, our_price=None):
    """POSISI KOMPETITOR per model (Faiz v2 — wajib tiap cycle).

    FIX self-undercut (2026-08-15): SEMUA upstreamSlug milik kita (satu publisher)
    = ask KITA, bukan kompetitor. Orderbook per model digabung dari SEMUA slug di
    catalog, lalu ask dari slug milik kita di-EXCLUDE total. Kompetitor sejati =
    hanya slug yang BUKAN milik kita.
    """
    try:
        provs = _get_providers_cached()
        my_slugs = get_my_slugs(provs)
        ok_kita = {}
        if provs:
            for p in provs:
                if p.get("enabled") and p.get("upstreamSlug"):
                    s = p.get("upstreamSlug")
                    ok_kita[s] = ok_kita.get(s, 0) + 1
    except Exception:
        my_slugs = set()
        ok_kita = {}

    # kumpulkan orderbook GLOBAL per model: {mid: {price: [slug,...]}}
    book = {}
    items_by_slug = catalog.items() if isinstance(catalog, dict) else []
    for slug, sub in items_by_slug:
        if not isinstance(sub, dict):
            continue
        for mk, m in sub.items():
            if not isinstance(m, dict):
                continue
            mid = mk.split("/")[-1].strip().lower()
            book.setdefault(mid, {})
            for price in (m.get("asksIn") or []):
                try:
                    p = round(float(price), 6)
                except (TypeError, ValueError):
                    continue
                if p > 0:
                    book[mid].setdefault(p, []).append(slug)

    out = {}
    for slug, sub in items_by_slug:
        if not isinstance(sub, dict):
            continue
        for mk, m in sub.items():
            if not isinstance(m, dict):
                continue
            mid = mk.split("/")[-1].strip().lower()
            levels = book.get(mid, {})
            total = sum(len(v) for v in levels.values())
            ok = ok_kita.get(slug, 0)
            # kompetitor MURNI: level yang ada ask dari slug BUKAN milik kita
            comp_levels = []
            for p in sorted(levels):
                owners = levels[p]
                if any(s not in my_slugs for s in owners):
                    # ada kompetitor sejati di level ini -> qty = jumlah ask NON-kita
                    q_comp = sum(1 for s in owners if s not in my_slugs)
                    comp_levels.append((p, q_comp))
            out[(slug, mid)] = {
                "total_provider": total,
                "provider_ok_kita": ok,
                "posisi_kompetitor": sum(1 for p, q in comp_levels for _ in range(q)),
                "levels": comp_levels,
            }
    return out
```

- [ ] **Step 4: Run test, verifikasi PASS**

```bash
cd /c/Users/faizz/upstream-dashboard && python -m unittest scripts.tests.test_self_undercut -v 2>&1 | tail -20
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/auto_pricing.py scripts/tests/test_self_undercut.py
git commit -m "fix(auto-pricing): exclude SEMUA ask upstream milik kita (satu publisher) dari orderbook — stop self-undercut lintas-upstream"
```

### Task 2: Perbaikan `get_market_min` — exclude upstream milik kita

**Files:**
- Modify: `scripts/auto_pricing.py:407-437` (get_market_min)
- Test: `scripts/tests/test_self_undercut.py`

**Interfaces:**
- Consumes: `get_my_slugs()` (dari Task 1)
- Produces: `get_market_min` — anchor TIDAK pernah = ask slug milik kita.

- [ ] **Step 1: Tulis failing test** (append ke test_self_undercut.py)

```python
    def test_market_min_exclude_upstream_kita(self):
        """minAskIn dari upstreamSlug milik kita TIDAK boleh jadi anchor kompetitor."""
        provs = [{"upstreamSlug": "commandcode", "enabled": True}]
        ap._PROVIDERS_CACHE["ts"] = 0
        ap._PROVIDERS_CACHE["data"] = provs
        # market dengan ask commandcode (milik kita) + rival
        market_models = [
            {"slug": "cmd/deepseek-v4-flash", "minAskIn": 0.0035},   # commandcode = kita
            {"slug": "rival/deepseek-v4-flash", "minAskIn": 0.05},   # kompetitor sejati
        ]
        out = ap._market_min_from_models(market_models)
        # commandcode harus di-skip; rival tetap
        self.assertNotIn(("commandcode", "deepseek-v4-flash"), out)
        self.assertIn(("rival", "deepseek-v4-flash"), out)
```

- [ ] **Step 2: Run test, verifikasi FAIL**

```bash
cd /c/Users/faizz/upstream-dashboard && python -m unittest scripts.tests.test_self_undercut.TestGetPositionsSelfUndercut.test_market_min_exclude_upstream_kita -v 2>&1 | tail -15
```

Expected: FAIL — `_market_min_from_models` tidak ada.

- [ ] **Step 3: Implement fix**

Ganti `get_market_min` (line 407-437) dengan versi yang pakai `get_my_slugs`:

```python
def _market_min_from_models(models):
    """Terjemahkan /market models -> {(slug, model): minAskIn}, EXCLUDE slug milik kita.
    Prefix petakan: cb->codebuddy, cp->cline-pass, cbcn->codebuddy-cn, dst.
    Slug yang BUKAN milik kita (kompetitor sejati) tetap di-anchor."""
    my = get_my_slugs()
    out = {}
    prefix_map = {"cb": "codebuddy", "cp": "cline-pass", "cbcn": "codebuddy-cn"}
    for m in (models or []):
        slug_full = m.get("slug") or ""
        min_in = m.get("minAskIn")
        if not slug_full or not min_in:
            continue
        parts = slug_full.split("/")
        if len(parts) < 2:
            continue
        model = parts[-1]
        pc = parts[0]
        # slug dari prefix yang kita kenal, tapi PASTIKAN bukan milik kita
        slug = prefix_map.get(pc) or pc
        if slug in my:
            continue  # ask kita sendiri — jangan jadi anchor
        out[(slug, model)] = min_in
    return out


def get_market_min(use_cache=True):
    """Anchor kompetitor dari /market — minAskIn per (table-prefix/model).
    EXCLUDE upstream milik kita (satu publisher). Cache TTL 120s."""
    if use_cache and time.time() - _MARKET_CACHE["ts"] < _ANCHOR_TTL:
        return _MARKET_CACHE["data"]
    try:
        st, d = api("/market")
        if st != 200 or not isinstance(d, dict):
            return _MARKET_CACHE["data"] if _MARKET_CACHE["data"] else {}
        out = _market_min_from_models(d.get("models") or [])
        _MARKET_CACHE["ts"] = time.time()
        _MARKET_CACHE["data"] = out
        return out
    except Exception:
        return _MARKET_CACHE["data"] if _MARKET_CACHE["data"] else {}
```

- [ ] **Step 4: Run seluruh test, verifikasi PASS**

```bash
cd /c/Users/faizz/upstream-dashboard && python -m unittest scripts.tests.test_self_undercut -v 2>&1 | tail -20
```

Expected: semua test PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/auto_pricing.py scripts/tests/test_self_undercut.py
git commit -m "fix(auto-pricing): market anchor exclude upstream milik kita (satu publisher) — stop anchor ke ask sendiri"
```

### Task 3: Update docs & verifikasi compile

**Files:**
- Modify: `docs/auto-pricing.md`
- Modify: `docs/superpowers/plans/2026-08-15-fix-self-undercut.md` (selesai, tandai checkbox)

**Interfaces:**
- Consumes: Task 1 & 2.

- [ ] **Step 1: py_compile**

```bash
cd /c/Users/faizz/upstream-dashboard && python -m py_compile scripts/auto_pricing.py && echo COMPILE_OK
```

- [ ] **Step 2: Update docs/auto-pricing.md** — tambah bagian "Self-undercut fix (2026-08-15)": semua upstream satu publisher, exclude ask milik kita.

- [ ] **Step 3: Commit**

```bash
git add docs/auto-pricing.md
git commit -m "docs: self-undercut fix — exclude semua ask upstream milik kita (satu publisher)"
```

---
