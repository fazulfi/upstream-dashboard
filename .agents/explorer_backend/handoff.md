# Handoff Report: Explorer Backend & API Layer

## 1. Observation
1. **Backend Route Layout (`backend/app.py`)**:
   - `inferhub_get(path, params=None, timeout=25)` (lines 415–435) securely queries `https://inferhub.dev/api` with Bearer auth and URL-encoded query params.
   - `@app.route("/api/breakdown")` (line 2177) queries `GET /usage/breakdown`.
   - `@app.route("/api/usage/cache-stats")` (line 2285) queries `GET /usage/cache-stats`.
   - `@app.route("/api/usage/logs")` (line 2294) queries `GET /usage/logs` with pagination (`page`, `pageSize`, `range`, `model`, `status`, `sort`, `dir`).
   - `@app.route("/api/usage/logs-models")` (line 2314) queries `GET /usage/logs/models`.
2. **Frontend Whitelist Gate (`frontend/src/hooks/useApi.jsx`)**:
   - `FOCUSED_API_PREFIXES = ['/api/auto-pricing', '/api/pricing']` (line 42).
   - `isApiEnabled(path)` (lines 69–74) currently evaluates only auto-pricing, pricing, orderbook, ask, and reliability paths. Any request to `/api/usage/...` or `/api/breakdown` returns `null` unless registered.
3. **Audit Records (`backend/audit/riset-cluster2-live.md` & `backend/audit/audit-usage-market.md`)**:
   - `/usage/cache-stats`: returns `{ range, rows: [...], totals: { reqs, promptTokens, cachedTokens, cacheWriteTokens, hitRate } }`.
   - `/usage/breakdown`: returns `{ range, byModel: [...], byProvider: [...], byProviderModel: [...] }`.
   - `/usage/logs`: returns `{ range, page, pageSize, total, rangeTotal, totalCostUsdc, totalTokens, totalSavedUsdc, rows: [...] }`.
4. **Existing Test Baselines**:
   - Pytest passed: `162 passed, 1 warning` (`python -m pytest backend/tests`).
   - Vitest passed: `187 passed across 25 test files` (`npm run test` in `frontend/`).
   - Contract in `test_app_p4_routes.py:218-220` requires `["error"] == "unavailable"` when `inferhub_get` returns `None`.

## 2. Logic Chain
1. To satisfy **Requirement R3** without breaking existing routes or backwards compatibility:
   - Decorator `@app.route("/api/usage/breakdown")` should be added alongside `@app.route("/api/breakdown")` in `backend/app.py:2177`.
   - Decorator `@app.route("/api/usage/logs/models")` should be added alongside `@app.route("/api/usage/logs-models")` in `backend/app.py:2314`.
2. To avoid UI null reference errors when upstream is unavailable or in development mode while preserving test assertions in `test_app_p4_routes.py`:
   - `/api/usage/cache-stats` fallback returns `{"error": "unavailable", "range": rng, "rows": [], "totals": {"reqs": 0, "promptTokens": 0, "cachedTokens": 0, "cacheWriteTokens": 0, "hitRate": 0.0}}`.
   - `/api/usage/logs` fallback returns `{"error": "unavailable", "rows": [], "total": 0, "rangeTotal": 0, "page": 1, "pageSize": 25, "totalCostUsdc": "0.00", "totalTokens": 0, "totalSavedUsdc": "0.00", "range": rng}`.
3. To enable frontend fetch calls to `/api/usage/...` and `/api/breakdown` via `useApi` / `apiFetch`:
   - Add `'/api/usage'` to `FOCUSED_API_PREFIXES` in `frontend/src/hooks/useApi.jsx`.
   - Add `'/api/breakdown'` to `MANUAL_ASK_PATHS` in `frontend/src/hooks/useApi.jsx`.
   - In `isApiEnabled(path)`, strip query parameters (`path.split('?')[0]`) before checking prefix / exact match to ensure parameter-rich URLs like `?range=30d&page=1` match accurately.

## 3. Caveats
- No caveats regarding endpoint availability or proxy structures.
- Note: Rate limit on local backend is governed by `RL_LIMIT` and `_rate_limit()`, which applies per IP. Frontend polling should use reasonable intervals (e.g. 15s to 30s) or on-demand fetch.

## 4. Conclusion
- The backend proxy architecture in `backend/app.py` is ready and fully mapped. Adding the alias routes and structured fallback fields completes milestone M1 for the backend.
- Adding `'/api/usage'` and query string normalization to `frontend/src/hooks/useApi.jsx` seamlessly unblocks milestone M2 (Consumer Analytics & Request Logs pages).
- All proposed schemas, fallback payloads, and patch snippets are documented in `.agents/explorer_backend/analysis.md`.

## 5. Verification Method
1. **Backend Verification**:
   - Run `python -m pytest backend/tests` -> verify all 162+ tests pass.
   - Run test client requests against `/api/usage/breakdown`, `/api/usage/cache-stats`, `/api/usage/logs`, and `/api/usage/logs/models`.
2. **Frontend Verification**:
   - Run `npx vitest run src/hooks/useApi.test.jsx` in `frontend/` -> verify whitelist and session handling pass.
   - Run `npx vitest run` in `frontend/` -> verify all 187+ unit tests pass with Exit 0.
