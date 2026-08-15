# Auto-Pricing Competitor State Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Auto Pricing backend use the genuine orderbook competitor for decisions and expose that same value to state/UI, while preserving the proven target formula.

**Architecture:** `scripts/auto_pricing.py` computes genuine competitor levels in `get_positions()`. `run_cycle()` must always scan those levels before deciding HOLD/UNDERCUT/RESUME; the `/market` anchor is diagnostic only and cannot short-circuit a cycle when orderbook levels exist. Add `competitor_price` to each decision from the first genuine level. `backend/app.py` remains a pass-through API.

**Tech Stack:** Python 3, unittest, Flask pass-through API, JSON state file, SSH runtime on VPS 82.25.62.204.

## Global Constraints

- Genuine competitors are provider slugs not owned by this publisher; `get_positions()` remains the source of truth.
- `competitor_price` is the lowest genuine orderbook level (`levels[0][0]`) or `None` when no genuine competitor exists.
- `comp` remains the existing `/market` diagnostic anchor; it MUST NOT short-circuit orderbook evaluation.
- Pricing target remains `lowest eligible non-trigger competitor - (0.1% × official)`.
- Current production behavior intentionally evaluates genuine competitors at any price, including below trigger, because live proof showed `$0.07` must produce `$0.0686` for official `$1.40`.
- If `official <= 0`, use the already loaded catalog model map (`catalog`) rather than undefined `cat_models`; one bad ask MUST NOT abort a cycle.
- Do not add InferHub API calls; derive all fields from the existing per-cycle snapshot.
- Test first: each new backend behavior needs a failing regression test before production code.
- Validate in the actual VPS runtime after deployment; no completion claim from static inspection alone.

---

### Task 1: Add a tested competitor-price derivation helper

**Files:**
- Modify: `scripts/auto_pricing.py` near `get_positions()` helpers
- Test: `scripts/tests/test_self_undercut.py`

**Interfaces:**
- Produces `_lowest_competitor_price(levels) -> float | None`.
- Input `levels` is the sorted `(price, quantity)` genuine-competitor orderbook list already returned by `get_positions()`.

- [ ] **Step 1: Write the failing test**

Add this test to `TestGetPositionsSelfUndercut`:

```python
def test_lowest_competitor_price_comes_from_genuine_orderbook(self):
    levels = [(0.07, 1), (0.322, 1), (0.336, 1)]
    self.assertEqual(ap._lowest_competitor_price(levels), 0.07)
    self.assertIsNone(ap._lowest_competitor_price([]))
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run:

```bash
python -m unittest scripts.tests.test_self_undercut.TestGetPositionsSelfUndercut.test_lowest_competitor_price_comes_from_genuine_orderbook -v
```

Expected: FAIL because `_lowest_competitor_price` does not exist.

- [ ] **Step 3: Implement the minimal helper**

Add:

```python
def _lowest_competitor_price(levels):
    return float(levels[0][0]) if levels else None
```

Do not sort, fetch, or filter inside this helper; `get_positions()` already returns sorted genuine levels.

- [ ] **Step 4: Run the focused test**

Run the same unittest command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/auto_pricing.py scripts/tests/test_self_undercut.py
git commit -m "test(auto-pricing): define genuine competitor display price"
```

---

### Task 2: Include the real competitor field in every daemon decision

**Files:**
- Modify: `scripts/auto_pricing.py` in `run_cycle()` immediately after `levels` is assigned
- Test: `scripts/tests/test_self_undercut.py`

**Interfaces:**
- Every cycle decision emitted by `run_cycle()` includes `competitor_price`.
- `competitor_price == levels[0][0]` when genuine levels exist; otherwise `None`.
- Existing `comp` field and target computation remain unchanged.

- [ ] **Step 1: Write the failing regression test**

Add:

```python
def test_decision_display_competitor_is_not_market_anchor(self):
    levels = [(0.07, 1), (0.322, 1)]
    decision = {"comp": 0.322, "competitor_price": ap._lowest_competitor_price(levels)}
    self.assertEqual(decision["comp"], 0.322)
    self.assertEqual(decision["competitor_price"], 0.07)
```

- [ ] **Step 2: Run it and verify it fails for the missing decision contract**

Run:

```bash
python -m unittest scripts.tests.test_self_undercut.TestGetPositionsSelfUndercut.test_decision_display_competitor_is_not_market_anchor -v
```

Expected: FAIL until the daemon decision contract test is wired to the new field.

- [ ] **Step 3: Implement the state field**

Immediately after:

```python
levels = pos.get("levels", []) if pos else []
```

add:

```python
            # UI/observability field: actual lowest genuine orderbook competitor.
            # Keep `comp` separate: it is the /market decision anchor.
            a = {**a, "competitor_price": _lowest_competitor_price(levels)}
```

Because every existing `decisions.append({**a, ...})` spreads `a`, all branches (hold, backoff, resume, undercut, error) receive the field without changing pricing behavior.

- [ ] **Step 4: Run focused daemon tests**

```bash
python -m unittest scripts.tests.test_self_undercut -v
```

Expected: all tests pass.

- [ ] **Step 5: Compile the daemon**

```bash
python -m py_compile scripts/auto_pricing.py
```

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/auto_pricing.py scripts/tests/test_self_undercut.py
git commit -m "fix(auto-pricing): expose genuine competitor price in state"
```

---

---

### Task 3: Remove the proven backend pre-scan HOLD bug

**Files:**
- Modify: `scripts/auto_pricing.py:692-699`
- Test: `scripts/tests/test_self_undercut.py`

**Interfaces:**
- A real `levels` list MUST be scanned even when `comp` is missing, stale, or lower than `our`.
- HOLD is allowed only when `levels` is empty, or after the orderbook scan proves the target is already equal/current.
- Do not reintroduce a market-anchor gate before `nontrig_prices` calculation.

- [ ] **Step 1: Write the failing regression test**

Add a pure decision helper test fixture that represents `our=0.14`, market `comp=0.322`, and genuine levels `[(0.07, 1)]`; assert the calculated action is `undercut` and target is `0.0686` for official `1.4`.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
python -m unittest scripts.tests.test_self_undercut.TestGetPositionsSelfUndercut.test_orderbook_competitor_below_our_is_not_hold -v
```

Expected: FAIL against the current pre-scan HOLD branch.

- [ ] **Step 3: Implement the minimal backend correction**

Replace the pre-scan gate with an empty-orderbook-only guard:

```python
if not levels:
    hold[hk] = {"mode": "hold", "our": our, "comp": comp, "ts": prev_ts}
    decisions.append({**a, "action": "hold", "target": our, "comp": comp,
                      "reason": f"no genuine competitor (our ${our:.4f})"})
    continue
```

The following orderbook scan remains the single source for target selection.

- [ ] **Step 4: Run focused tests and compile**

```bash
python -m unittest scripts.tests.test_self_undercut -v
python -m py_compile scripts/auto_pricing.py
```

---

### Task 4: Fix the official-price fallback regression

**Files:**
- Modify: `scripts/auto_pricing.py:599`
- Test: `scripts/tests/test_self_undercut.py`

- [ ] **Step 1: Write a failing test**

Cover an ask with `official=0` and assert the cycle does not raise `NameError` while resolving the catalog model official price.

- [ ] **Step 2: Implement**

Use the actual catalog mapping returned by `get_catalog()` rather than undefined `cat_models`, normalizing the model key exactly as existing catalog access does.

- [ ] **Step 3: Run focused tests and compile**

```bash
python -m unittest scripts.tests.test_self_undercut -v
python -m py_compile scripts/auto_pricing.py
```

### Task 3: Deploy and audit backend state on the VPS

**Files:**
- Runtime: `/home/gamesim/scripts/auto_pricing.py`
- Runtime state: `/home/gamesim/.hermes-suisui/logs/auto-pricing-state.json`

- [ ] **Step 1: Pull and deploy only the daemon source**

```bash
cd /home/gamesim/dashboard && git pull origin main
cp scripts/auto_pricing.py /home/gamesim/scripts/auto_pricing.py
```

Restart the existing daemon process using the repository's established service/process procedure.

- [ ] **Step 2: Verify the daemon emits the new field**

After one fresh cycle:

```bash
python3 - <<'PY'
import json
p='/home/gamesim/.hermes-suisui/logs/auto-pricing-state.json'
d=json.load(open(p))
row=next(x for x in d['cycles'] if x.get('slug') == 'codebuddy' and x.get('model_id') == 'glm-5.2')
print({k: row.get(k) for k in ('model_id', 'comp', 'competitor_price', 'target', 'action')})
PY
```

Expected for a live orderbook containing z-ai at `$0.0700`: `competitor_price` is `0.07`; `comp` may remain a separate market anchor.

- [ ] **Step 3: Verify pricing target independently**

For `glm-5.2` with `official=1.4` and competitor `0.07`, verify target is `0.0686` when that model is eligible for undercut. Do not infer this from the display field alone.

---

### Task 4: Update frontend display only after backend proof

**Files:**
- Modify: `frontend/src/pages/AutoPricing.jsx:184`
- Test: `frontend/src/pages/AutoPricing.test.jsx` if the existing test setup supports rendering; otherwise verify through the deployed browser surface.

- [ ] **Step 1: Change the cell source**

Replace:

```jsx
c.comp != null && c.comp > 0 ? `$${Number(c.comp).toFixed(4)}` : '—'
```

with:

```jsx
c.competitor_price != null && c.competitor_price > 0
  ? `$${Number(c.competitor_price).toFixed(4)}`
  : '—'
```

- [ ] **Step 2: Build and deploy the frontend from `frontend/`**

```bash
npm run build
npx vercel deploy --prod --yes --token "$VERCEL_TOKEN" --cwd /home/gamesim/dashboard/frontend
```

- [ ] **Step 3: Verify the actual Auto Pricing page**

Open `https://upstream-static.vercel.app/#/auto-pricing`, authenticate, and confirm `codebuddy / glm-5.2` displays the same `competitor_price` emitted by the VPS state.

---

### Task 5: Final audit and documentation

**Files:**
- Modify: `docs/auto-pricing.md`
- Review: `scripts/auto_pricing.py`, `backend/app.py`, `frontend/src/pages/AutoPricing.jsx`

- [ ] **Step 1: Run focused backend tests and frontend tests**

```bash
python -m unittest scripts.tests.test_self_undercut -v
cd frontend && npm test -- --run src/hooks/useApi.test.jsx && npm run build
```

- [ ] **Step 2: Review runtime evidence**

Confirm all of:

- daemon process is running;
- state timestamp is newer than deployment;
- every decision has `competitor_price`;
- genuine competitor models show the lowest orderbook price;
- models with no genuine competitor show `None`/`—`;
- target formula remains unchanged;
- no extra InferHub API request was introduced.

- [ ] **Step 3: Document the contract**

Add a short revision to `docs/auto-pricing.md` stating that `comp` is the decision anchor and `competitor_price` is the genuine lowest orderbook competitor used for display/audit.

- [ ] **Step 4: Commit documentation and final review**

```bash
git add docs/auto-pricing.md
git commit -m "docs(auto-pricing): document competitor state fields"
```
