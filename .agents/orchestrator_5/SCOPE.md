# Scope: Publisher & Operations Tools (Orchestrator 5)

## Architecture
- **Backend (`backend/app.py`)**: Python Flask API proxy using `inferhub_get()`, `inferhub_post()`, `inferhub_put()`, `inferhub_delete()`. Handles authentication, downstream InferHub API routing, payload normalization, and safe fallback data.
- **Frontend Hook (`frontend/src/hooks/useApi.jsx`)**: Coordinates client-side fetch, caching, and `isApiEnabled` routing filter (`FOCUSED_API_PREFIXES`).
- **Frontend Pages & Components**:
  - `Reliability.jsx`: Provider Quota Tracker with usage window progress bars and active 429 throttle badge.
  - `Finance.jsx`: Earnings Transfer Modal & Withdrawal OTP Flow 2-Step Modal.
  - `PricingPage.jsx`: Simplified Live Market Rates table/list (`GET /api/market`).
  - `ModelDetailDrawer.jsx` / `AutoPricing.jsx`: Simplified Budget Manager spend cap controls (`PUT /api/budgets/<path:mid>`).
  - `Logs.jsx`: Inset grouped request logs with telemetry details and pagination.
- **Styling**: Apple HIG / iOS 26 glassmorphism (`.ios-glass-card`, `.ios-btn-glass`, `.ios-sheet`, `.ios-btn-primary`, `.ios-input`, `#liquid-lens` SVG filter).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1. Provider Quota Tracker | In `Reliability.jsx`, added quota progress bars per provider card using `GET /api/publisher/providers/usage-windows` | M1 | ORIGINAL_REQUEST §Follow-up (2026-08-24T00:24:18) |
| 2 | R2. Earnings Transfer | In `Finance.jsx`, added "Transfer ke Saldo Consumer" modal/button calling `POST /api/publisher/earnings/transfer` | M1 | ORIGINAL_REQUEST §Follow-up (2026-08-24T00:24:18) |
| 3 | R3. Simplified Live Market Rates | In `PricingPage.jsx`, added table/list displaying lowest & highest live asks from `GET /api/market` | M1 | ORIGINAL_REQUEST §Follow-up (2026-08-24T00:24:18) |
| 4 | R4. Simplified Budget Manager | In `ModelDetailDrawer.jsx` & `AutoPricing.jsx`, provided inputs for spend caps (`maxInputPerMtok`, `maxOutputPerMtok`) per model calling `PUT /api/budgets/<path:mid>` | M1 | ORIGINAL_REQUEST §Follow-up (2026-08-24T00:24:18) |
| 5 | R5. Withdrawal OTP Flow | In `Finance.jsx`, added 2-step Payout modal with OTP verification calling `POST /api/publisher/withdrawals/otp` and `POST /api/publisher/withdrawals` | M1 | ORIGINAL_REQUEST §Follow-up (2026-08-24T00:24:18) |
| 6 | R6. Backend Integration | In `backend/app.py`, proxy endpoints active with `inferhub_*` and input hardening against NaN/Inf/whitespace. Whitelist updated in `useApi.jsx` | M1 | ORIGINAL_REQUEST §Follow-up (2026-08-24T00:24:18) |
| 7 | Verification & Quality Assurance | 212/212 Vitest tests passing, 169/169 Pytest tests passing, `npm run build` exits 0 | M1 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Publisher & Operations Tools End-to-End | Backend proxy routes, frontend UI updates in Reliability, Finance, PricingPage, ModelDetailDrawer, useApi hook, and unit/integration tests | none | DONE |
