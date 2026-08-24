# Backend API Explorer Handoff Report: Publisher & Operations Tools (R1–R5)

## 1. Observation

### Codebase and Architecture Review
- **Backend Framework**: Python Flask (`backend/app.py`) running on Waitress/WSGI with background polling thread (`_poll_once`), PostgreSQL integration (`db_connect`), and pure logic layer (`logic.py`).
- **Auth Gate**: Enforced in `backend/app.py:629` via `@app.before_request` `_auth_gate()` requiring HMAC session Bearer token (`logic.issue_token()`) or `X-Auth` password on all routes except `/health`, `/api/login`, and `OPTIONS`.
- **InferHub API Helpers** (`backend/app.py:415-517`):
  - `inferhub_get(path, params=None, timeout=25)`: Dispatches GET request to `https://inferhub.dev/api{path}` with `Authorization: Bearer {INFERHUB_API_KEY}`. Returns parsed JSON or `None` on failure.
  - `inferhub_post(path, payload=None, timeout=25)`: Dispatches POST JSON request to `https://inferhub.dev/api{path}`. Returns parsed JSON (or `{"ok": True}` if empty) or `None` on failure.
  - `inferhub_put(path, payload=None, timeout=25)`: Dispatches PUT JSON request to `https://inferhub.dev/api{path}`. Returns parsed JSON (or `{"ok": True}` if empty) or `None` on failure.
  - `inferhub_delete(path, timeout=25)`: Dispatches DELETE request. Returns `True` on success, `False` on failure.
- **Frontend API Scoping** (`frontend/src/hooks/useApi.jsx:42-74`):
  - `isApiEnabled(path)` currently restricts requests to `FOCUSED_API_PREFIXES` (`/api/auto-pricing`, `/api/pricing`), `RELIABILITY_PREFIX` (`/api/reliability`), and `MANUAL_ASK_PATHS` (`/api/orderbook`, `/api/ask`).
  - Currently blocks `/api/publisher/*`, `/api/market`, `/api/budgets/*`.
- **Existing Route Audit**:
  - `GET /api/market`: Already defined in `backend/app.py:2186`, but disabled in frontend `useApi.jsx`.
  - `PUT /api/budgets/<mid>`: Defined in `backend/app.py:2043`, but uses `<mid>` which **fails (404 Not Found)** for slash-separated model IDs (e.g. `openai/gpt-4o`).
  - `GET /api/publisher/providers/usage-windows`: Missing in `backend/app.py`.
  - `POST /api/publisher/earnings/transfer`: Missing in `backend/app.py`.
  - `POST /api/publisher/withdrawals/otp`: Missing in `backend/app.py`.
  - `POST /api/publisher/withdrawals`: Missing in `backend/app.py`.

---

## 2. Logic Chain

1. **R1: Provider Quota Tracker (`GET /publisher/providers/usage-windows`)**:
   - `Reliability.jsx` needs quota progress indicators per provider card.
   - InferHub upstream endpoint `GET /publisher/providers/usage-windows` returns a batch dictionary of `providerId -> list[WindowObject]`.
   - Adding `@app.route("/api/publisher/providers/usage-windows")` proxies `inferhub_get("/publisher/providers/usage-windows")`. If InferHub is unavailable (`d is None`), returning `jsonify({})` (or structured fallback) prevents frontend crashes.

2. **R2: Earnings Transfer (`POST /publisher/earnings/transfer`)**:
   - `Finance.jsx` provides an action to transfer publisher earnings to consumer balance.
   - Upstream expects `POST /publisher/earnings/transfer` with `{"amount": "10.0"}`.
   - Adding `@app.route("/api/publisher/earnings/transfer", methods=["POST"])` validates `amount > 0` (returning 400 on invalid input) and forwards `{"amount": str(amount)}` via `inferhub_post()`. Upstream network errors map to 502.

3. **R3: Simplified Live Market Rates (`GET /market`)**:
   - `Pricing.jsx` / `PricingPage.jsx` requires live lowest and highest asks.
   - Backend route `@app.route("/api/market")` already exists (`backend/app.py:2186`) calling `inferhub_get("/market")`.
   - Upstream returns `{ "ts": "...", "models": [ { "slug": "...", "minAskIn": ..., "maxAskIn": ..., "minAskOut": ..., "maxAskOut": ..., "lastRate": ... } ] }`.
   - Enabling `/api/market` in `frontend/src/hooks/useApi.jsx` allows frontend hooks to query it.

4. **R4: Simplified Budget Manager (`PUT /budgets/{modelId}`)**:
   - `AutoPricing.jsx` needs to update spend caps per model.
   - Model IDs can contain slashes (e.g., `openai/gpt-4o`). Flask's `<mid>` router only matches a single segment without `/`.
   - Updating the route to `@app.route("/api/budgets/<path:mid>", methods=["PUT"])` correctly routes composite model identifiers.
   - Normalizing payload to handle both snake_case (`max_input_per_mtok`) and camelCase (`maxInputPerMtok`) ensures resilient communication with `inferhub_put(f"/budgets/{mid}", payload)`.

5. **R5: Withdrawal OTP Flow (`POST /publisher/withdrawals/otp` & `POST /publisher/withdrawals`)**:
   - `Finance.jsx` Payout modal requires a 2-step OTP flow.
   - Step 1: `@app.route("/api/publisher/withdrawals/otp", methods=["POST"])` accepts `{"destination": "...", "amount": "..."}` and calls `inferhub_post("/publisher/withdrawals/otp", {"destination": dest, "amountUsdc": str(amount)})`.
   - Step 2: `@app.route("/api/publisher/withdrawals", methods=["POST"])` accepts `{"destination": "...", "amount": "...", "otp": "..."}` and calls `inferhub_post("/publisher/withdrawals", {"destination": dest, "amountUsdc": str(amount), "otp": str(otp)})`.
   - Optional destination lookup: `@app.route("/api/publisher/withdrawals/destinations", methods=["GET"])` fetches whitelisted addresses.

6. **Frontend Gating (`useApi.jsx`)**:
   - Adding `/api/publisher`, `/api/budgets`, and `/api/market` to `FOCUSED_API_PREFIXES` unlocks all required endpoints for the UI while maintaining strict API gating.

---

## 3. Detailed Route Specifications & Schemas

### Summary Table of Endpoints

| Requirement | Frontend Route | Method | InferHub Upstream Path | Purpose |
|---|---|---|---|---|
| **R1** | `/api/publisher/providers/usage-windows` | `GET` | `GET /publisher/providers/usage-windows` | Provider quota windows batch |
| **R2** | `/api/publisher/earnings/transfer` | `POST` | `POST /publisher/earnings/transfer` | Transfer earnings to consumer balance |
| **R3** | `/api/market` | `GET` | `GET /market` | Live market ask ranges per model |
| **R4** | `/api/budgets/<path:mid>` | `PUT` | `PUT /budgets/{modelId}` | Set spend cap & discount per model |
| **R5 (Step 1)** | `/api/publisher/withdrawals/otp` | `POST` | `POST /publisher/withdrawals/otp` | Request OTP for payout |
| **R5 (Step 2)** | `/api/publisher/withdrawals` | `POST` | `POST /publisher/withdrawals` | Submit payout with OTP |
| **R5 (Helper)** | `/api/publisher/withdrawals/destinations` | `GET` | `GET /publisher/withdrawals/destinations` | List verified payout addresses |

---

### Implementation Code Recipes for `backend/app.py`

#### 1. R1: Provider Usage Windows
```python
@app.route("/api/publisher/providers/usage-windows")
def api_publisher_providers_usage_windows():
    """Batch usage windows per provider from InferHub management API."""
    d = inferhub_get("/publisher/providers/usage-windows")
    if d is None:
        return jsonify({})
    return jsonify(d)
```

#### 2. R2: Earnings Transfer
```python
@app.route("/api/publisher/earnings/transfer", methods=["POST"])
def api_publisher_earnings_transfer():
    """Transfer publisher earnings to consumer balance."""
    body = request.get_json(silent=True) or {}
    amount = body.get("amount")
    if amount is None or str(amount).strip() == "":
        return jsonify({"error": "amount required"}), 400
    try:
        val = float(amount)
        if val <= 0:
            return jsonify({"error": "Amount must be greater than 0"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "invalid numeric amount"}), 400

    payload = {"amount": str(amount).strip()}
    d = inferhub_post("/publisher/earnings/transfer", payload)
    if d is None:
        return jsonify({"error": "transfer failed (network/upstream)"}), 502
    return jsonify(d if isinstance(d, dict) else {"ok": True})
```

#### 3. R3: Live Market Rates (Update Existing Route)
```python
@app.route("/api/market")
def api_market():
    """Live market snapshot (min/max asks per model)."""
    d = inferhub_get("/market")
    if not d:
        return jsonify({"models": [], "error": "unavailable"})
    return jsonify(d)
```

#### 4. R4: Budget Update (Fix Flask Path Matcher & Normalization)
```python
@app.route("/api/budgets/<path:mid>", methods=["PUT"])
def api_budget_put(mid):
    """Set budget spend caps and discounts per model (handles slash in mid)."""
    body = request.get_json(silent=True) or {}
    payload = {
        "maxInputPerMtok": body.get("max_input_per_mtok") or body.get("maxInputPerMtok"),
        "maxOutputPerMtok": body.get("max_output_per_mtok") or body.get("maxOutputPerMtok"),
        "minDiscountPct": body.get("min_discount_pct") or body.get("minDiscountPct"),
        "enabled": body.get("enabled", True),
    }
    d = inferhub_put(f"/budgets/{mid}", payload)
    if d is None:
        return jsonify({"error": "budget update failed"}), 502
    return jsonify({"ok": True})
```

#### 5. R5: Withdrawal OTP & Withdrawal Submission
```python
@app.route("/api/publisher/withdrawals/otp", methods=["POST"])
def api_publisher_withdrawals_otp():
    """Request OTP for payout withdrawal."""
    body = request.get_json(silent=True) or {}
    dest = body.get("destination")
    amount = body.get("amount") or body.get("amountUsdc") or body.get("amount_usdc")
    if not dest or not amount:
        return jsonify({"error": "destination and amount required"}), 400
    try:
        val = float(amount)
        if val <= 0:
            return jsonify({"error": "Amount must be greater than 0"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "invalid numeric amount"}), 400

    payload = {
        "destination": str(dest).strip(),
        "amountUsdc": str(amount).strip(),
    }
    d = inferhub_post("/publisher/withdrawals/otp", payload)
    if d is None:
        return jsonify({"error": "failed to request withdrawal OTP"}), 502
    return jsonify(d if isinstance(d, dict) else {"ok": True})


@app.route("/api/publisher/withdrawals", methods=["POST"])
def api_publisher_withdrawals_post():
    """Submit payout withdrawal with OTP verification."""
    body = request.get_json(silent=True) or {}
    dest = body.get("destination")
    amount = body.get("amount") or body.get("amountUsdc") or body.get("amount_usdc")
    otp = body.get("otp") or body.get("code")
    if not dest or not amount or not otp:
        return jsonify({"error": "destination, amount, and otp required"}), 400
    try:
        val = float(amount)
        if val <= 0:
            return jsonify({"error": "Amount must be greater than 0"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "invalid numeric amount"}), 400

    payload = {
        "destination": str(dest).strip(),
        "amountUsdc": str(amount).strip(),
        "otp": str(otp).strip(),
    }
    d = inferhub_post("/publisher/withdrawals", payload)
    if d is None:
        return jsonify({"error": "withdrawal submission failed"}), 502
    return jsonify(d if isinstance(d, dict) else {"ok": True})


@app.route("/api/publisher/withdrawals/destinations")
def api_publisher_withdrawals_destinations():
    """List verified payout destinations."""
    d = inferhub_get("/publisher/withdrawals/destinations")
    if d is None:
        return jsonify([])
    return jsonify(d)
```

---

### Implementation Code Recipe for `frontend/src/hooks/useApi.jsx`

Update `FOCUSED_API_PREFIXES` in `frontend/src/hooks/useApi.jsx`:
```javascript
const FOCUSED_API_PREFIXES = [
  '/api/auto-pricing',
  '/api/pricing',
  '/api/publisher',
  '/api/budgets',
  '/api/market',
];
```
This automatically permits:
- `/api/publisher/providers/usage-windows`
- `/api/publisher/earnings/transfer`
- `/api/publisher/withdrawals/otp`
- `/api/publisher/withdrawals`
- `/api/publisher/withdrawals/destinations`
- `/api/market`
- `/api/budgets` and `/api/budgets/*`

---

## 4. Caveats

1. **Test Assertion in `useReliabilityStream.test.jsx`**:
   - Line 41 in `frontend/src/hooks/useReliabilityStream.test.jsx` asserts:
     `expect(isApiEnabled('/api/market')).toBe(false);`
   - When `/api/market` is enabled in `isApiEnabled()`, that unit test should be updated to test an unmapped path (e.g. `expect(isApiEnabled('/api/unknown-endpoint')).toBe(false);`).
2. **InferHub Key Dependency**:
   - In development/offline mode without `INFERHUB_API_KEY`, all `inferhub_*` calls gracefully return `None`. The route implementations are structured to return fallback JSON (`{}` or `502` error envelope) rather than throwing uncaught Python exceptions.
3. **Idempotency Keys**:
   - `frontend/src/hooks/useApi.jsx` `apiFetch()` automatically generates and attaches `Idempotency-Key` headers for all mutating (non-GET) requests.

---

## 5. Conclusion

- All necessary route signatures, HTTP methods, request bodies, response models, and error responses have been identified and mapped between frontend requirements and upstream InferHub endpoints.
- Critical path router bug in `<mid>` vs `<path:mid>` has been detected and resolved in the specification.
- Frontend API gating updates in `useApi.jsx` are concise and fully cover R1–R5 without compromising security.

---

## 6. Verification Method

To independently verify these findings:
1. **Frontend Vitest Suite**:
   ```bash
   cd frontend
   npx vitest run
   ```
   (Baseline: 25 passed test files, 187 passed tests).
2. **Backend Pytest Suite**:
   ```bash
   cd backend
   py -3 -m pytest
   ```
   (Baseline: 162 passed tests).
3. **Inspect Routes**:
   Verify route definitions and parameter matching in `backend/app.py` lines 2043, 2186, and the newly added publisher proxy routes.
