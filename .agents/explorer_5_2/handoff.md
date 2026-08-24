# Handoff Report: Frontend UI Explorer — Publisher & Operations Tools

**Author**: teamwork_preview_explorer (Frontend UI Explorer)  
**Date**: 2026-08-24T00:29:00+07:00  
**Target Milestone**: Publisher & Operations Tools UI Integration (Phase 5)  
**Parent Conversation**: 9b8791de-8b6d-4f25-9835-abd75f21a494  

---

## 1. Observation

Direct investigation of the codebase revealed the following exact facts, paths, and configurations:

### 1.1 Existing File Locations & Layout Architecture
- **Reliability View**: `frontend/src/pages/Reliability.jsx` (661 lines), tested by `frontend/src/pages/Reliability.test.jsx` (151 lines). Contains Operations Bar, Alert Banner, Control Center Header, 4 FinOps KPI Cards, Model Inventory table, Recent Cycles list, Audit Stream, and slide-out `ModelDetailDrawer`.
- **Finance View**: `frontend/src/pages/Finance.jsx` (412 lines), tested by `frontend/src/pages/Finance.test.jsx` (107 lines). Contains Kurs Banner, 4 FinOps KPI Cards (Net Profit, Payouts, Capex, Impairment), Tab segmented control (`overview`, `assets`, `payouts`), Cashflow breakdown, Upstream Nodes distribution, Asset Inventory table with search/status filters, and Payouts table.
- **Pricing View**: `frontend/src/components/PricingPage.jsx` (555 lines), mounted by `PricingRoute` in `frontend/src/App.jsx` (lines 14–26), tested by `PricingPage.test.jsx` (48 lines) and `PricingMutations.test.jsx` (115 lines). Contains Global per Upstream form grid, Per-Model Override form & table, and Orderbook merged table with manual ask editor.
- **Auto-Pricing View**: `frontend/src/pages/AutoPricing.jsx` (602 lines), tested by `PricingMutations.test.jsx` and `ModelDetailDrawer.test.jsx` (297 lines). Contains Arm/Disarm header, 4 KPI cards, Provider tabs, Trigger % per model table, and Algo Log Terminal.
- **API Client & Hook**: `frontend/src/hooks/useApi.jsx` (163 lines).
  - Lines 42–44: `const FOCUSED_API_PREFIXES = ['/api/auto-pricing', '/api/pricing'];`
  - Lines 69–74: `isApiEnabled(path)` enforces strict whitelist. Calling any path outside whitelist throws `API scope aktif: hanya Auto Pricing yang diizinkan`.
  - Lines 84–88: `apiFetch()` automatically generates and attaches `Idempotency-Key` to all non-GET requests (POST/PUT/DELETE) preventing backend 400 validation errors.
- **Styling System**: `frontend/src/index.css` (1081 lines) implements Apple iOS 26 Glassmorphism design tokens:
  - `.ios-glass-card` (line 166): 28px blur, 190% saturation, subtle borders, 3D hover scale (1.015) and active press compression (0.97).
  - `.ios-btn-glass` (line 539): Liquid Glass deformation, fresnel sheen (`::before`), chromatic aberration edge (`::after`), and SVG liquid-lens filter.
  - `.ios-btn-primary` (line 337): System blue gradient with 3D spring press physics.
  - `.ios-input` (line 649): Translucent input with Apple HIG focus ring (#0a84ff).
  - `.ios-sheet` & `.ios-sheet-handle` (lines 834–868): Spatial modal sheets with drag gesture handle.
  - `.ios-segmented-control` (line 959): Segmented pills for seamless switching.
- **Vitest Test Suite Status**: Verified via `npm test -- --run`: 25 test files passed (187 tests total) with 92.82% statement coverage.
- **Build Status**: Verified via `npm run build`: Vite v8.2.1 successfully compiled the client distribution in 2.41s.

---

## 2. Logic Chain

From the observations, the requirements are derived step-by-step:

### 2.1 R1: Provider Quota Tracker in `Reliability.jsx`
- **Observation**: Audit documentation (`backend/audit/audit-publisher.md` line 126) and prompt require integrating `GET /publisher/providers/usage-windows` (proxied via `/api/publisher/providers/usage-windows`). The response maps provider IDs to arrays of usage windows containing `windowKind` (5h, 7d, monthly, credit), `usedTokens`, `limitTokens`, `usedPct`, `remainingPct`, `resetAt`, and `source` (`poll` | `reactive_429`).
- **Logic**: Add a "Provider Fleet Quota & Capacity Tracker" section in `Reliability.jsx` placed above the Model Inventory table. Each provider card renders progress bars for its active usage windows. Color coding is mapped dynamically:
  - `< 75%` used: Emerald / Sky normal status
  - `75% – 89%` used: Amber warning status
  - `>= 90%` used or drained credit: Rose critical status
  - `source === 'reactive_429'`: Distinctive Red badge alerting that the provider was temporarily throttled.

### 2.2 R2 & R5: Earnings Transfer & Withdrawal OTP Flow in `Finance.jsx`
- **Observation**: Currently, `Finance.jsx` only renders overview metrics and read-only tables without action buttons for balance transfers or payouts.
- **Logic**:
  1. **Transfer to Consumer Balance (R2)**:
     - Add "Transfer ke Saldo Consumer" action button.
     - Open glass modal sheet with max balance reference, numeric input, and live USD/IDR conversion.
     - Submitting sends `POST /api/publisher/earnings/transfer` with body `{ amount: Number(amount) }`.
     - Validates `0 < amount <= maxBalance` with user-friendly inline error alerts and toast feedback.
  2. **Withdrawal Payout OTP Flow (R5)**:
     - Add "Tarik Dana / Payout" action button.
     - Open 2-step glass modal sheet:
       - **Step 1**: Amount and Destination input (USDT, Bank, etc.). User clicks "Minta Kode OTP" -> sends `POST /api/publisher/withdrawals/otp`.
       - **Step 2**: 6-digit OTP code entry (monospace centered tracking) with resend countdown timer -> sends `POST /api/publisher/withdrawals` with `{ amount, destination, otp }`.
     - Error handling catches 400 invalid OTP, expired OTP, or insufficient funds, displaying both inline modal alert and toast notification.
     - Success reloads `/api/finance` and `/api/payouts`.

### 2.3 R3: Simplified Live Market Rates in `Pricing.jsx` (`PricingPage.jsx`)
- **Observation**: `PricingPage.jsx` has global configs, overrides, and orderbook, but lacks an aggregated live market benchmark view.
- **Logic**: Add a "Live Market Rates" section using data from `GET /api/market`. Displays a clean, simplified table showing Model ID, Lowest Live Ask (market floor), Highest Live Ask, Spread ($ and %), and Active Sellers count, with quick search filtering.

### 2.4 R4: Simplified Budget Manager in `AutoPricing.jsx`
- **Observation**: Backend supports `PUT /api/budgets/<mid>` to set spend caps per model. Currently, `AutoPricing.jsx` only exposes `trigger_pct`.
- **Logic**: Provide a Spend Caps / Budget Manager input per model (`maxInputPerMtok`, `maxOutputPerMtok`) in `AutoPricing.jsx` (or `ModelDetailDrawer.jsx`), allowing operators to define maximum cost ceilings that protect against runaway upstream prices.

### 2.5 API Whitelist Updates in `useApi.jsx`
- **Observation**: `isApiEnabled(path)` blocks any path not in `FOCUSED_API_PREFIXES`.
- **Logic**: Expand whitelist to include:
  - `/api/publisher` (for usage-windows, earnings/transfer, withdrawals/otp, withdrawals)
  - `/api/market`
  - `/api/budgets`
  - `/api/finance`
  - `/api/payouts`
  - `/api/usage`
  - `/api/fleet-health`

---

## 3. Caveats & Assumptions

1. **Proxy Dependency**: Frontend requests target `/api/*` and assume `backend/app.py` handles the corresponding proxying to InferHub API using configured bearer tokens.
2. **Idempotency Attachments**: Handled automatically by `apiFetch` in `useApi.jsx`, ensuring mutations never fail due to missing idempotency headers.
3. **Glassmorphism Discipline**: All modals, buttons, cards, and inputs must use existing CSS classes (`.ios-glass-card`, `.ios-btn-glass`, `.ios-btn-primary`, `.ios-sheet`, `.ios-input`) to avoid CSS bloat and preserve dark/light theme fidelity.

---

## 4. Conclusion & Actionable Blueprint

### 4.1 Component Blueprint: Provider Quota Tracker (`Reliability.jsx`)
- **Container**: Responsive grid `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` inside `.ios-glass-card`.
- **Props/Data**: `usageWindows` object from `GET /api/publisher/providers/usage-windows`.
- **Bar Mechanics**: Calculates `usedPct = (usedTokens / limitTokens) * 100` with overflow clamping [0, 100]. Emits amber warning if >= 80%, rose critical if >= 90%, and 429 badge if `source === 'reactive_429'`.

### 4.2 Component Blueprint: Transfer & Withdrawal OTP (`Finance.jsx`)
- **TransferModal**:
  - Modal sheet with blur backdrop.
  - Quick "MAX" button to set full available earnings balance.
  - Live USD + IDR preview calculated with reference `kurs`.
  - Mutation: `POST /api/publisher/earnings/transfer` with body `{ amount: Number(amount) }`.
- **WithdrawalModal**:
  - Step 1: Destination and Amount form calling `POST /api/publisher/withdrawals/otp`.
  - Step 2: 6-digit OTP code form calling `POST /api/publisher/withdrawals` with `{ amount, destination, otp }`.
  - In-modal alert box for immediate validation feedback + toast alert fallback.

### 4.3 Component Blueprint: Live Market Rates (`PricingPage.jsx`)
- **Table**: Placed in `PricingPage.jsx` with search input and live pulsing green indicator.
- **Fields**: Model, Min Ask (Floor), Max Ask, Spread Delta, Active Sellers count.

### 4.4 Component Blueprint: Budget Manager (`AutoPricing.jsx` / `ModelDetailDrawer.jsx`)
- **Form**: Number inputs for `maxInputPerMtok` and `maxOutputPerMtok`.
- **Mutation**: `PUT /api/budgets/{modelId}` with JSON payload.

---

## 5. Verification Method

### 5.1 Test Commands
1. **Run Vitest**:
   ```powershell
   cd frontend
   npx vitest run
   ```
   *Expected Result*: All test suites pass (0 errors).
2. **Run Production Build**:
   ```powershell
   cd frontend
   npm run build
   ```
   *Expected Result*: Build completes with Exit 0.

### 5.2 Unit Test Expansion Plan
- **`Finance.test.jsx`**:
  - Test opening and submitting Transfer modal with valid and invalid amounts.
  - Test 2-step Withdrawal flow: requesting OTP -> entering valid OTP -> verifying payout submission.
  - Test error handling when OTP is rejected.
- **`Reliability.test.jsx`**:
  - Test rendering of Quota progress bars and reactive_429 indicator from usage-windows mock.
- **`PricingPage.test.jsx`**:
  - Test rendering and search filtering in Live Market Rates table.
- **`ModelDetailDrawer.test.jsx` / `AutoPricing.test.jsx`**:
  - Test updating and submitting model budget spend caps via `PUT /api/budgets/{modelId}`.

