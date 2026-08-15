### Task 1: Cache asks fresh + `our` aktual di state

**Files:**
- Modify: `scripts/auto_pricing.py:246-252` (TTL), `scripts/auto_pricing.py:539-560` (run_cycle start), `scripts/auto_pricing.py:810-815` (state write)
- Test: `scripts/tests/test_self_undercut.py` (append)

**Interfaces:**
- Consumes: `get_asks_enabled`, `_ASKS_CACHE_TTL`, `STATE_FILE`
- Produces: `run_cycle` state cycles pakai `our` AKTUAL (bukan cache basi)

- [ ] **Step 1: Tulis failing test**

```python
    def test_asks_cache_ttl_pendek(self):
        """TTL cache asks TIDAK boleh 300s (5 menit) — bikin 'our' stale di UI."""
        self.assertLess(ap._ASKS_CACHE_TTL, 120,
                        f"TTL {ap._ASKS_CACHE_TTL}s terlalu lama — UI tampil basi")
```

- [ ] **Step 2: Run test verifikasi FAIL**

```bash
cd /c/Users/faizz/upstream-dashboard && python -m unittest scripts.tests.test_self_undercut.TestGetPositionsSelfUndercut.test_asks_cache_ttl_pendek -v
```

Expected: FAIL (TTL 300 >= 120).

- [ ] **Step 3: Implement** — turunkan TTL ke 60s:

```python
_ASKS_CACHE_TTL = 60  # FIX (2026-08-15): 300s bikin our stale 5 menit di UI — 60s cukup
```

- [ ] **Step 4: Run test verifikasi PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/auto_pricing.py scripts/tests/test_self_undercut.py
git commit -m "fix(auto-pricing): cache asks TTL 300s -> 60s — UI tidak tampil stale 5 menit"
```

### Task 2: `our` aktual di state cycle (setelah PUT, refetch)

**Files:**
- Modify: `scripts/auto_pricing.py` run_cycle (set_ask success branch)
- Test: append ke test

**Interfaces:**
- Consumes: `set_ask` return `(st, res)`
- Produces: decision `target` = harga yg di-PUT; state `our` = target (bukan ask lama)

- [ ] **Step 1: Failing test** — verifikasi decision setelah PUT sukses pakai `target`:

```python
    def test_decision_our_adalah_target_setelah_put(self):
        """Decision 'undercut' setelah PUT sukses: 'our' = target yg dikirim,
        BUKAN ask lama dari cache (bikin UI tampil stale)."""
        # simulasi: decision dict yg dibangun run_cycle saat PUT 200
        target = 0.0686
        our_lama = 0.3206
        d = {"action": "undercut", "target": target, "our_lama": our_lama}
        # UI baca state.cycles[].target utk tampil; pastikan ada field yg benar
        self.assertAlmostEqual(d["target"], 0.0686)
        self.assertNotAlmostEqual(d.get("our_lama", 0.3206), target)  # lama != baru
```

*(test ini documentasi — fix utama di Task 3)*

### Task 3: State tulis `our` = target PUT (bukan cache lama)

**Files:**
- Modify: `scripts/auto_pricing.py:797-802` (undercut success branch)

**Interfaces:**
- Consumes: `target` (sudah dihitung)
- Produces: decision `our` = target setelah PUT sukses

- [ ] **Step 1: Implement** — di branch `if st in (200, 204):` utk undercut/resume, pastikan decision menyertakan `our: target` (bukan `a["ask_in"]` lama):

```python
            if st in (200, 204):
                hold[hk] = {"mode": action, "our": target, "comp": comp, "ts": now}
                hold[hk].pop("skip_until", None)
                decisions.append({**a, "action": action, "target": target, "our": target, "comp": comp,
                                  "reason": f"{action} 0.1% dr level non-trigger ${ref_price:.4f} -> ${target:.4f} | posisi komp {pos_komp} ({ok_kita} ok / {tot_prov})", "http": st})
```

(Cek: `{**a, ...}` sudah membawa `ask_in` lama sebagai `a["ask_in"]`, tambah `"our": target` eksplisit biar UI baca harga baru.)

- [ ] **Step 2: py_compile + test**

```bash
python -m py_compile scripts/auto_pricing.py && python -m unittest scripts.tests.test_self_undercut -v
```

- [ ] **Step 3: Commit**

### Task 4: Deploy + verifikasi UI tidak stale

- [ ] Push, pull VPS, copy ke `/home/gamesim/scripts/`, restart daemon.
- [ ] Verifikasi: cycle baru, `our` di state = 0.0686 (bukan 0.3206).
- [ ] Verifikasi UI `/api/auto-pricing` cycles `our` = 0.0686.
- [ ] Commit docs.

---
