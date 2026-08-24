# Project: Upstream Dashboard - Consumer Features (Analytics & Request Logs)

## Architecture
- Backend: Flask in `backend/app.py` proxying to InferHub API via `inferhub_get()`. Mock fallback / structured empty fallback when upstream token or dev mode is active.
- Frontend API Layer: `frontend/src/hooks/useApi.jsx` using `FOCUSED_API_PREFIXES` and `isApiEnabled()`.
- Navigation & Routing: `Sidebar.jsx`, `Topbar.jsx`, `CommandPalette.jsx`, and `App.jsx` tab routing.
- Pages:
  - `Analytics.jsx`: Apple Health UI style (circular cache efficiency ring, summary KPI cards, token composition stacked bars, model cache efficiency table, provider breakdown).
  - `Logs.jsx`: iOS Inset Grouped List table with status pill, cost, TTFT, model, timestamp, pagination, search/filter toolbar, inspect modal.

## Feature Inventory
| # | Feature | Description | Milestone | Status |
|---|---------|-------------|-----------|--------|
| 1 | Backend Proxy for Usage | `/api/usage/breakdown`, `/api/usage/cache-stats`, `/api/usage/logs`, `/api/usage/logs-models`, `/api/usage/logs/models` in `backend/app.py` using `inferhub_get()` with proper query forwarding & fallback | M1 | DONE |
| 2 | useApi Path Registration | Register `/api/usage` in `FOCUSED_API_PREFIXES` and `/api/breakdown` in `MANUAL_ASK_PATHS` with query string normalization in `useApi.jsx` | M1 | DONE |
| 3 | Consumer Analytics Page | `Analytics.jsx` fetching `/api/usage/breakdown` & `/api/usage/cache-stats`, rendered in Apple Health UI style | M2 | DONE |
| 4 | Request Logs Page | `Logs.jsx` fetching `/api/usage/logs` with pagination & filtering, rendered in iOS Inset Grouped List style | M2 | DONE |
| 5 | Navigation & Routing | Add Analytics and Request Logs to `Sidebar.jsx`, `Topbar.jsx`, `CommandPalette.jsx`, and `App.jsx` | M2 | DONE |
| 6 | Unit & Verification Tests | Vitest test suites, build check, challenger & auditor verification | M3 | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M0_Survey | Codebase Survey (Backend routes & Frontend components) | None | DONE |
| 2 | M1_Backend_API | Backend `/api/usage/*` proxy routes & `useApi.jsx` registration | M0 | DONE |
| 3 | M2_Frontend_Pages | `Analytics.jsx`, `Logs.jsx`, `Sidebar.jsx`, `Topbar.jsx`, `CommandPalette.jsx`, `App.jsx` | M0 | DONE |
| 4 | M3_Tests_Verification | Vitest test suites, build check, challenger & auditor verification | M1, M2 | DONE |
