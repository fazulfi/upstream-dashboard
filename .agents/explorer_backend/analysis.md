# Backend & API Layer Analysis: Consumer Features (Analytics & Request Logs)

## 1. Executive Summary

This report presents the complete investigation and technical design for the Backend & API layer supporting the new Consumer Features: **Consumer Analytics Page (Analytics.jsx)** and **Request Logs Page (Logs.jsx)**.

### Primary Objectives Investigated:
1. **Backend Proxy Routes in `backend/app.py`**:
   - Route definitions, upstream URL mapping, query parameter forwarding, and authentication handling.
   - Mock / fallback response strategy to guarantee zero 500 Internal Server Errors when InferHub API is unreachable or running in development/test environments.
2. **Frontend API Whitelist in `frontend/src/hooks/useApi.jsx`**:
   - Configuration of `FOCUSED_API_PREFIXES`, `MANUAL_ASK_PATHS`, and `isApiEnabled()` to permit `/api/usage/*` and `/api/breakdown`.
3. **Exact Schemas & Contracts**:
   - Verification of live/audited payload shapes from InferHub OpenAPI for `/usage/breakdown`, `/usage/cache-stats`, `/usage/logs`, and `/usage/logs/models`.

---

## 2. Backend Architecture Investigation (`backend/app.py`)

### 2.1 Authentication & Request Lifecycle
- **Session Auth Gate**: All routes under `/api/*` (except `/api/login` and CORS `OPTIONS`) pass through `@app.before_request` -> `_auth_gate()`. Requests must supply an `Authorization: Bearer <session_token>` header or `X-Auth` token.
- **Upstream Forwarding**:
  - `inferhub_get(path, params=None, timeout=25)` fetches data from `https://inferhub.dev/api + path`.
  - It loads the management API key via `load_api_key()` (from `INFERHUB_API_KEY` environment variable or `.env`).
  - It sets `Authorization: Bearer <INFERHUB_API_KEY>`, `User-Agent: upstream-backend/1.0`, and `Accept: application/json`.
  - Query parameters passed in the `params` dict are safely encoded using `urllib.parse.urlencode`.
  - If upstream returns HTTP error, network timeout, or if `INFERHUB_API_KEY` is not configured, `inferhub_get()` catches the exception, logs it to `_cache["last_error"]`, and returns `None`.

### 2.2 Existing Routes vs Target Routes
| Frontend Route | Existing Route in `app.py` | Action Required |
|---|---|---|
| `GET /api/usage/breakdown` | `@app.route("/api/breakdown")` (line 2177) | Add `@app.route("/api/usage/breakdown")` decorator alias |
| `GET /api/usage/cache-stats` | `@app.route("/api/usage/cache-stats")` (line 2285) | Existing route is mapped; enrich fallback response object |
| `GET /api/usage/logs` | `@app.route("/api/usage/logs")` (line 2294) | Existing route is mapped; ensure query params and fallback match schema |
| `GET /api/usage/logs-models` or `/api/usage/logs/models` | `@app.route("/api/usage/logs-models")` (line 2314) | Add `@app.route("/api/usage/logs/models")` decorator alias |

---

## 3. Data Schemas & API Contracts

### 3.1 `GET /api/usage/breakdown` (and `GET /api/breakdown`)
- **Query Parameters**:
  - `range`: `"24h" | "7d" | "30d" | "90d" | "all"` (default: `"7d"`)
- **Upstream Call**: `inferhub_get("/usage/breakdown", {"range": rng})`
- **Upstream Success Response (HTTP 200)**:
```json
{
  "range": "7d",
  "byModel": [
    {
      "model": "cp/cline-pass/deepseek-v4-flash",
      "reqs": 6944,
      "inputTokens": 1742873830,
      "outputTokens": 8921400,
      "costUsdc": "3.412850"
    },
    {
      "model": "cx/gpt-5.6-terra",
      "reqs": 5155,
      "inputTokens": 462776079,
      "outputTokens": 2200134,
      "costUsdc": "7.592990"
    }
  ],
  "byProvider": [
    {
      "providerLabel": "OpenAI Codex",
      "prefix": "cx",
      "reqs": 5155,
      "inputTokens": 462776079,
      "outputTokens": 2200134,
      "costUsdc": "7.592990"
    },
    {
      "providerLabel": "ClinePass",
      "prefix": "cp",
      "reqs": 6944,
      "inputTokens": 1742873830,
      "outputTokens": 8921400,
      "costUsdc": "3.412850"
    }
  ],
  "byProviderModel": []
}
```
- **Fallback Response when `inferhub_get` returns `None`**:
```json
{
  "range": "7d",
  "byModel": [],
  "byProvider": [],
  "byProviderModel": []
}
```

### 3.2 `GET /api/usage/cache-stats`
- **Query Parameters**:
  - `range`: `"24h" | "7d" | "30d" | "90d" | "all"` (default: `"30d"`)
- **Upstream Call**: `inferhub_get("/usage/cache-stats", {"range": rng})`
- **Upstream Success Response (HTTP 200)**:
```json
{
  "range": "30d",
  "rows": [
    {
      "label": "cp/cline-pass/deepseek-v4-flash",
      "reqs": 7221,
      "promptTokens": 1795645782,
      "cachedTokens": 1637529923,
      "cacheWriteTokens": 0
    },
    {
      "label": "og/opencode-go/claude-3-5-sonnet",
      "reqs": 756,
      "promptTokens": 142689131,
      "cachedTokens": 104523000,
      "cacheWriteTokens": 1200000
    }
  ],
  "totals": {
    "reqs": 13128,
    "promptTokens": 2391669231,
    "cachedTokens": 1842275395,
    "cacheWriteTokens": 1200000,
    "hitRate": 0.7702885378634534
  }
}
```
- **Fallback Response when `inferhub_get` returns `None`**:
```json
{
  "error": "unavailable",
  "range": "30d",
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
*(Note: Preserves `"error": "unavailable"` to satisfy existing test assertions in `test_app_p4_routes.py:218` while supplying empty `rows: []` and `totals` to prevent UI null pointer crashes).*

### 3.3 `GET /api/usage/logs`
- **Query Parameters**:
  - `range`: `"24h" | "7d" | "30d" | "90d" | "all"` (default: `"24h"`)
  - `page`: `"1"`, `"2"`, etc. (default: `"1"`)
  - `pageSize`: `"10"`, `"25"`, `"50"`, `"100"` (default: `"25"`)
  - `model`: string filter (e.g. `"cp/cline-pass/deepseek-v4-flash"`)
  - `status`: `"all" | "ok" | "error" | "4xx" | "5xx" | "429"` (default: `"all"`)
  - `sort`: `"ts" | "model" | "status" | "in" | "out" | "cost" | "ttft" | "tps" | "cached"` (default: `"ts"`)
  - `dir`: `"desc" | "asc"` (default: `"desc"`)
- **Upstream Call**: `inferhub_get("/usage/logs", params)`
- **Upstream Success Response (HTTP 200)**:
```json
{
  "range": "24h",
  "page": 1,
  "pageSize": 25,
  "total": 12855,
  "rangeTotal": 3568,
  "totalCostUsdc": "11.358610",
  "totalTokens": 2348339040,
  "totalSavedUsdc": "937.516356",
  "rows": [
    {
      "id": "7bf3b680-e047-495f-9e79-e31dcb6f6424",
      "ts": "2026-08-24T00:15:30.120Z",
      "status": "ok",
      "http_status": 200,
      "prompt_tokens": 35531,
      "completion_tokens": 753,
      "cached_tokens": 34529,
      "cache_write_tokens": null,
      "cost_consumer_usdc": "0.000417",
      "ask_input_per_mtok": "0.07",
      "ask_output_per_mtok": "0.14",
      "region": "us-east",
      "model": "cp/cline-pass/deepseek-v4-flash",
      "upstream_label": "ClinePass",
      "ttft_ms": 420,
      "duration_ms": 670
    }
  ]
}
```
- **Fallback Response when `inferhub_get` returns `None`**:
```json
{
  "error": "unavailable",
  "range": "24h",
  "rows": [],
  "total": 0,
  "rangeTotal": 0,
  "page": 1,
  "pageSize": 25,
  "totalCostUsdc": "0.00",
  "totalTokens": 0,
  "totalSavedUsdc": "0.00"
}
```

### 3.4 `GET /api/usage/logs-models` (and `GET /api/usage/logs/models`)
- **Query Parameters**:
  - `range`: `"24h" | "7d" | "30d" | "90d" | "all"` (default: `"24h"`)
- **Upstream Call**: `inferhub_get("/usage/logs/models", {"range": rng})`
- **Upstream Success Response (HTTP 200)**:
```json
[
  {"value": "cp/cline-pass/deepseek-v4-flash", "label": "cp/cline-pass/deepseek-v4-flash"},
  {"value": "cx/gpt-5.6-terra", "label": "cx/gpt-5.6-terra"},
  {"value": "og/opencode-go/claude-3-5-sonnet", "label": "og/opencode-go/claude-3-5-sonnet"}
]
```
- **Fallback Response when `inferhub_get` returns `None`**: `[]`

---

## 4. Frontend API Layer Investigation (`frontend/src/hooks/useApi.jsx`)

### 4.1 Whitelist Mechanics
Currently in `frontend/src/hooks/useApi.jsx`:
```javascript
const FOCUSED_API_PREFIXES = ['/api/auto-pricing', '/api/pricing'];
const MANUAL_ASK_PATHS = new Set(['/api/orderbook', '/api/ask']);
const RELIABILITY_PREFIX = '/api/reliability';

export function isApiEnabled(path) {
  return FOCUSED_API_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
    || path === RELIABILITY_PREFIX
    || path.startsWith(`${RELIABILITY_PREFIX}/`)
    || MANUAL_ASK_PATHS.has(path);
}
```

### 4.2 Required Modifications in `useApi.jsx`
1. Add `'/api/usage'` to `FOCUSED_API_PREFIXES`.
2. Add `'/api/breakdown'` to `MANUAL_ASK_PATHS`.
3. Normalize `path` by splitting query string (`cleanPath = path ? path.split('?')[0] : ''`) before prefix / set checking. This ensures paths with query arguments (e.g. `/api/breakdown?range=7d` or `/api/usage/logs?page=1&pageSize=25`) resolve cleanly without string mismatch.

---

## 5. Step-by-Step Implementation Proposals

### 5.1 Proposed Changes to `backend/app.py`

```python
# ── Usage & Breakdown Routes ──

@app.route("/api/usage/breakdown")
@app.route("/api/breakdown")
def api_breakdown():
    rng = request.args.get("range", "7d")
    d = inferhub_get("/usage/breakdown", {"range": rng})
    if not d:
        return jsonify({"byModel": [], "byProvider": [], "byProviderModel": [], "range": rng})
    return jsonify(d)


@app.route("/api/usage/cache-stats")
def api_usage_cache_stats():
    rng = request.args.get("range", "30d")
    d = inferhub_get("/usage/cache-stats", {"range": rng})
    if not d:
        return jsonify({
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
        })
    return jsonify(d)


@app.route("/api/usage/logs")
def api_usage_logs():
    rng = request.args.get("range", "24h")
    page = request.args.get("page", "1")
    pageSize = request.args.get("pageSize", "25")
    model = request.args.get("model", "")
    status = request.args.get("status", "all")
    sort = request.args.get("sort", "ts")
    dir_ = request.args.get("dir", "desc")
    params = {"range": rng, "page": page, "pageSize": pageSize, "sort": sort, "dir": dir_}
    if model:
        params["model"] = model
    if status and status != "all":
        params["status"] = status
    d = inferhub_get("/usage/logs", params)
    if not d:
        return jsonify({
            "error": "unavailable",
            "rows": [],
            "total": 0,
            "rangeTotal": 0,
            "page": int(page) if str(page).isdigit() else 1,
            "pageSize": int(pageSize) if str(pageSize).isdigit() else 25,
            "totalCostUsdc": "0.00",
            "totalTokens": 0,
            "totalSavedUsdc": "0.00",
            "range": rng
        })
    return jsonify(d)


@app.route("/api/usage/logs/models")
@app.route("/api/usage/logs-models")
def api_usage_logs_models():
    rng = request.args.get("range", "24h")
    d = inferhub_get("/usage/logs/models", {"range": rng})
    if not d:
        return jsonify([])
    if isinstance(d, list):
        return jsonify(d)
    return jsonify(d.get("models", []) if isinstance(d, dict) else [])
```

### 5.2 Proposed Changes to `frontend/src/hooks/useApi.jsx`

```javascript
const FOCUSED_API_PREFIXES = ['/api/auto-pricing', '/api/pricing', '/api/usage'];
const MANUAL_ASK_PATHS = new Set(['/api/orderbook', '/api/ask', '/api/breakdown']);
const RELIABILITY_PREFIX = '/api/reliability';

export function isApiEnabled(path) {
  const cleanPath = path ? path.split('?')[0] : '';
  return FOCUSED_API_PREFIXES.some(prefix => cleanPath === prefix || cleanPath.startsWith(`${prefix}/`))
    || cleanPath === RELIABILITY_PREFIX
    || cleanPath.startsWith(`${RELIABILITY_PREFIX}/`)
    || MANUAL_ASK_PATHS.has(cleanPath);
}
```

---

## 6. Verification and Test Alignment

1. **Backend Tests**:
   - In `backend/tests/test_app_p4_routes.py`, verify routes respond 200 with Bearer auth:
     - `/api/usage/breakdown`
     - `/api/usage/cache-stats`
     - `/api/usage/logs`
     - `/api/usage/logs-models`
     - `/api/usage/logs/models`
   - Verify unauthenticated requests return 401.
   - Verify mock fallback produces `{"error": "unavailable"}` when inferhub is unavailable, while retaining structure.
2. **Frontend Tests**:
   - In `frontend/src/hooks/useApi.test.jsx`, add test verifying `isApiEnabled('/api/usage/breakdown')`, `isApiEnabled('/api/usage/cache-stats?range=30d')`, and `isApiEnabled('/api/usage/logs?page=1')` return true.
