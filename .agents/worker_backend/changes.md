# Code Changes Report — Backend & API Layer (Milestone M1)

## Summary of Changes

### 1. `backend/app.py`
- **Route `/api/usage/breakdown`**: Added `@app.route("/api/usage/breakdown")` decorator alongside existing `/api/breakdown`. Ensures parameter `range` is forwarded to `inferhub_get("/usage/breakdown", {"range": rng})` and returns fallback `{"byModel": [], "byProvider": [], "byProviderModel": [], "range": rng}` when upstream is unreachable.
- **Route `/api/usage/cache-stats`**: Enhanced fallback structure when `inferhub_get` returns `None`. Now returns:
  ```json
  {
    "error": "unavailable",
    "range": rng,
    "rows": [],
    "totals": {
      "reqs": 0,
      "promptTokens": 0,
      "cachedTokens": 0,
      "cacheWriteTokens": 0,
      "hitRate": 0.0
    }
  }
  ```
  This preserves contract expectations for `error == "unavailable"` while ensuring UI components consuming `rows` and `totals` don't crash with null reference exceptions.
- **Route `/api/usage/logs`**: Enhanced query parameter forwarding (`range`, `page`, `pageSize`, `model`, `status`, `sort`, `dir`) to `inferhub_get("/usage/logs", params)` and structured fallback object when upstream is unavailable:
  ```json
  {
    "error": "unavailable",
    "rows": [],
    "total": 0,
    "rangeTotal": 0,
    "page": int(page),
    "pageSize": int(pageSize),
    "totalCostUsdc": "0.00",
    "totalTokens": 0,
    "totalSavedUsdc": "0.00",
    "range": rng
  }
  ```
- **Route `/api/usage/logs/models`**: Added `@app.route("/api/usage/logs/models")` decorator alongside existing `/api/usage/logs-models` with safe array/dict unnesting.

### 2. `frontend/src/hooks/useApi.jsx`
- Added `'/api/usage'` to `FOCUSED_API_PREFIXES`.
- Added `'/api/breakdown'` to `MANUAL_ASK_PATHS`.
- Updated `isApiEnabled(path)` to sanitize/strip query strings prior to prefix and Set matching:
  ```javascript
  export function isApiEnabled(path) {
    const cleanPath = path ? path.split('?')[0] : '';
    return FOCUSED_API_PREFIXES.some(prefix => cleanPath === prefix || cleanPath.startsWith(`${prefix}/`))
      || cleanPath === RELIABILITY_PREFIX
      || cleanPath.startsWith(`${RELIABILITY_PREFIX}/`)
      || MANUAL_ASK_PATHS.has(cleanPath);
  }
  ```
  This ensures calls with query parameters like `/api/usage/cache-stats?range=30d` or `/api/breakdown?range=7d` evaluate to `true`.

### 3. Test Suites
- **`backend/tests/test_app_p4_routes.py`**:
  - Updated `test_provider_ask_and_breakdown_contracts` and `test_route_sweep_critical_paths` to include `/api/usage/breakdown` and `/api/usage/logs/models`.
  - Added `test_usage_proxy_routes_query_params_and_fallbacks` covering route resolution, exact query parameter forwarding, alias routes, dictionary shape unpacking, and offline/None fallback structures.
- **`frontend/src/hooks/useApi.test.jsx`**:
  - Added unit test suite for `isApiEnabled` checking `/api/usage/*`, `/api/breakdown`, query-parameterized paths, and rejection of unregistered paths.
