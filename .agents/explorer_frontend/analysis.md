# Frontend UI & Navigation Architecture Analysis — Consumer Features

## Executive Summary
This document outlines the UI, navigation, and testing architecture for the new **Consumer Features** in the Upstream Dashboard:
1. **Consumer Analytics (`Analytics.jsx`)**: Apple Health UI-style metrics, Prompt Cache Efficiency rings/gauges, token composition breakdown by model/time, and cost savings indicators.
2. **Request Logs (`Logs.jsx`)**: iOS Inset Grouped List table displaying per-request telemetry (status pills, cost, TTFT, tokens breakdown, model, upstream, and pagination/filtering).
3. **Navigation & App Integration**: Routing in `App.jsx`, item registration in `Sidebar.jsx`, `Topbar.jsx`, `CommandPalette.jsx`, and endpoint authorization in `useApi.jsx`.
4. **Test Architecture**: Test suites for Vitest + Testing Library covering rendering, interactions, filtering, pagination, and error boundaries.

---

## 1. Codebase Survey & Existing Infrastructure

### 1.1 Navigation & Tab State Architecture
- **Router**: `HashRouter` inside `App.jsx` with nested layout route wrapped in `<LoginGate>` and `<Layout>`.
- **Layout (`Layout.jsx`)**:
  - Persistent fixed sidebar on desktop (`lg:pl-64` main offset).
  - Mobile drawer sidebar toggled via state `sidebarOpen`.
  - Topbar with segmented tabs (`ios-tab-bar`), live SSE indicator pill, quick search trigger (`⌘K`), and theme toggle.
  - Command palette (`CommandPalette.jsx`) for spotlight search with keyboard navigation (`ArrowUp`/`ArrowDown`/`Enter`/`Esc`).
- **Sidebar (`Sidebar.jsx`)**:
  - Structured `SECTIONS` with items containing `to`, `label`, `Icon`, and `end`.
  - NavLink styling with `ios-sidebar-item` and active class highlight.
  - Mobile touch gestures: `isSidebarSwipeClose` supporting swipe-to-dismiss.
- **Topbar (`Topbar.jsx`)**:
  - Segmented pill tabs (`ios-tab-bar` / `ios-pill-active`) for desktop navigation.
  - Page title lookup table (`pageNames[location.pathname]`).

### 1.2 Design System & iOS 26 Material Palette
The dashboard strictly follows Apple iOS 26 / HIG VisionOS Liquid Glass aesthetic:
- **Surface**: `.ios-glass-card` (blur(28px), saturate(190%), specular border highlights, 3D haptic spring physics on hover/active).
- **Buttons**:
  - `.ios-btn-glass` (Liquid Glass button with top specular sheen `::before`, chromatic aberration `::after`, and `#liquid-lens` SVG filter on `:active`).
  - `.ios-btn-primary`, `.ios-btn-secondary`, `.ios-btn-danger`, `.ios-icon-btn`.
- **Inputs & Controls**:
  - `.ios-input` (Apple-style rounded fields with subtle border and focus rings).
  - `.ios-segmented-control` and `.ios-segment` for category/time toggles.
  - `.ios-badge` for semantic state and tags.
  - `.tabular-nums` for crisp numeric and financial alignment.
- **Typography & Colors**:
  - Fonts: SF Pro Display / SF Pro Rounded / SF Mono.
  - Dynamic theme CSS variables (`--bg-base`, `--card-bg`, `--card-border`, `--text-title`, `--text-body`, `--text-sub`, `--text-vibrant-*`).

### 1.3 Existing Component Library Reusability
- **`KpiCard.jsx`**: Big metric tabular readout, category eyebrow, tinted squircle icon, sparkline SVG, and delta badge (`deltaDir="up|down|neutral"`).
- **`Badge.jsx`**: Semantic status tags (`green`, `blue`, `amber`, `rose`, `zinc`, `purple`).
- **`Skeleton.jsx`**: `SkeletonBlock` and `SkeletonCard` with shimmer animation for loading states.
- **`Toast.jsx`**: Alert/notification provider for operational feedback.
- **`DataTable.jsx`**: `@tanstack/react-table` wrapper with sorting, filtering, density switcher, and pagination controls.

---

## 2. API Contract & Data Integration Plan

### 2.1 Backend Endpoints & Data Shapes
| Endpoint | Method | Query Parameters | Response Structure | Purpose |
|---|---|---|---|---|
| `/api/usage/cache-stats` | GET | `range` (`24h\|7d\|30d\|90d\|all`) | `{"range":"...","rows":[{"label":"...","reqs":...,"promptTokens":...,"cachedTokens":...,"cacheWriteTokens":...}],"totals":{"reqs":...,"promptTokens":...,"cachedTokens":...,"cacheWriteTokens":...,"hitRate":...}}` | Prompt Cache Efficiency & per-model cache hits |
| `/api/usage/breakdown` (or `/api/breakdown`) | GET | `range` (`24h\|7d\|30d\|90d\|all`) | `{"range":"...","byModel":[...],"byProvider":[...],"byProviderModel":[...]}` | Consumer token & cost breakdown by model and provider |
| `/api/usage/logs` | GET | `range`, `page`, `pageSize`, `model`, `status`, `sort`, `dir` | `{"rows":[{"id":"...","ts":"...","status":"ok","http_status":200,"prompt_tokens":...,"completion_tokens":...,"cached_tokens":...,"cost_consumer_usdc":"0.000417","model":"...","upstream_label":"...","ttft_ms":...}],"total":...,"rangeTotal":...,"page":...,"pageSize":...,"totalCostUsdc":"...","totalTokens":...}` | Per-request history logs |
| `/api/usage/logs-models` | GET | `range` | `[{"value":"...","label":"..."}, ...]` or `["..."]` | Distinct model list for log dropdown filter |

### 2.2 Registration in `useApi.jsx`
Update `FOCUSED_API_PREFIXES` in `frontend/src/hooks/useApi.jsx`:
```javascript
const FOCUSED_API_PREFIXES = ['/api/auto-pricing', '/api/pricing', '/api/usage', '/api/breakdown'];
```
This ensures `isApiEnabled('/api/usage/...')` evaluates to `true`, preventing `apiFetch` from blocking consumer requests.

---

## 3. UI Component Architecture

### 3.1 Consumer Analytics (`frontend/src/pages/Analytics.jsx`)

#### Visual Concept: Apple Health Activity Dashboard
- **Top Header**: Title "Consumer Analytics", subtitle "Prompt cache optimization, token breakdown, and efficiency metrics", and an Apple Segmented Control for time range (`24h`, `7d`, `30d`, `90d`, `All`).
- **Section 1: Apple Health Activity Rings & Summary Cards**:
  1. **Prompt Cache Efficiency Ring Gauge (`CacheEfficiencyRing`)**:
     - Circular SVG Activity Gauge with vibrant Electric Cyan (`#06b6d4` to `#38bdf8`) gradient.
     - Large percentage readout (`totals.hitRate * 100` e.g. `77.0%`).
     - Subtitle badge: "⚡ High Efficiency" (>70%), "⚡ Normal" (40-70%), or "🌱 Cold Cache" (<40%).
  2. **Summary KPI Cards Grid (4 columns)**:
     - **Overall Hit Rate**: `77.0%` with category icon `Sparkles`, delta badge vs previous period.
     - **Cached Tokens**: `1.84 B tokens` (formatted in M/B) with category icon `Zap`.
     - **Total Tokens Consumed**: `2.39 B tokens` (Prompt + Completion).
     - **Estimated Cache Savings**: Calculated savings from cached tokens discount (e.g. `~$937.52 saved`).
- **Section 2: Token Composition (Apple Health Stacked Activity Bars)**:
  - Visual stacked horizontal bar showing token distribution:
    - Cached Prompt Tokens (Emerald Green `#10b981`)
    - Uncached Prompt Tokens (Electric Sky Blue `#0ea5e9`)
    - Completion Tokens (Violet Pink `#ec4899`)
  - Interactive legend with percentage shares and exact token counts.
- **Section 3: Model Cache Performance (iOS Inset Grouped Card)**:
  - Grouped list of all cache-capable models:
    - Model label (e.g. `cp/cline-pass/deepseek-v4-flash`).
    - Mini progress gauge bar for hit rate.
    - Tabular counts: Requests, Prompt Tokens, Cached Tokens, Hit Rate %.
- **Section 4: Provider Consumption Breakdown**:
  - Cards / list for `byProvider` (OpenAI Codex, ClinePass, OpenCode Go, etc.) showing spend ($ USDC), request count, and token share.

---

### 3.2 Request Logs (`frontend/src/pages/Logs.jsx`)

#### Visual Concept: iOS Inset Grouped List Table
- **Top Toolbar**:
  - Quick Search input (`Search by model, upstream, ID...`).
  - Time Range selector (`24h`, `7d`, `30d`, `90d`, `All`).
  - Status Filter dropdown / pills (`All Statuses`, `200 OK`, `429 Rate Limit`, `4xx Client Error`, `5xx Server Error`).
  - Model Filter dropdown (populated dynamically from `GET /api/usage/logs-models`).
  - Refresh button (`RefreshCw`).
- **Inset Grouped Table Structure**:
  - Built with `@tanstack/react-table` or tailored iOS Table component with column headers:
    1. **Time**: Formatted relative time (`2m ago`) + exact ISO time (`12:34:56`).
    2. **Status**: iOS Status Badge (`200 OK` green dot, `429 Rate Limit` amber dot, `500 Error` rose dot).
    3. **Model & Upstream**: Model slug pill + upstream tag (e.g. `ClinePass`).
    4. **Tokens (Prompt / Cached / Compl)**: Crisp tabular numbers with cache hit tag (`⚡ 34.5k cached`).
    5. **Latency (TTFT / Duration)**: Time to first token (`6,703 ms`) and total duration (`6.7s`).
    6. **Cost**: Consumer cost in USDC (e.g. `$0.000417`).
    7. **Inspect Action**: Click row or inspect button to open request detail modal.
- **Pagination & Footer Controls**:
  - Page indicator: `Page X of Y` (from `total` / `rangeTotal` / `pageSize`).
  - Page size dropdown: `10`, `25`, `50`, `100` / page.
  - Previous / Next glass navigation buttons with disabled state styling.
- **Request Detail Sheet / Modal (`RequestDetailModal`)**:
  - iOS Sheet (`.ios-sheet` with drag handle) showing full request payload: Request ID, exact timestamps, provider ask rates, token breakdown, and headers.

---

## 4. Navigation & App Integration Plan

### 4.1 Route Table Updates (`App.jsx`)
```jsx
import Analytics from './pages/Analytics';
import Logs from './pages/Logs';

// In Routes:
<Route element={<LoginGate><Layout /></LoginGate>}>
  <Route path="/" element={<Reliability />} />
  <Route path="/analytics" element={<Analytics />} />
  <Route path="/logs" element={<Logs />} />
  <Route path="/finance" element={<Finance />} />
  <Route path="/auto-pricing" element={<AutoPricing />} />
  <Route path="/pricing" element={<PricingRoute />} />
  <Route path="/settings" element={<Settings />} />
</Route>
```

### 4.2 Sidebar Updates (`Sidebar.jsx`)
Add `Analytics` and `Request Logs` to `SECTIONS`:
```jsx
import { Activity, TrendingUp, SlidersHorizontal, CircleDollarSign, Settings, BarChart3, ScrollText } from 'lucide-react';

const SECTIONS = [
  {
    label: 'Telemetry & Analytics',
    items: [
      { to: '/', label: 'Reliability', Icon: Activity, end: true },
      { to: '/analytics', label: 'Consumer Analytics', Icon: BarChart3 },
      { to: '/logs', label: 'Request Logs', Icon: ScrollText },
    ],
  },
  {
    label: 'Operations & Finance',
    items: [
      { to: '/finance', label: 'Finance & P&L', Icon: TrendingUp },
      { to: '/auto-pricing', label: 'Auto Pricing', Icon: SlidersHorizontal },
      { to: '/pricing', label: 'Pricing', Icon: CircleDollarSign },
      { to: '/settings', label: 'Settings', Icon: Settings },
    ],
  },
];
```

### 4.3 Topbar Updates (`Topbar.jsx`)
Update `pageNames` mapping and navigation tabs:
```jsx
const pageNames = {
  '/': 'Reliability',
  '/analytics': 'Consumer Analytics',
  '/logs': 'Request Logs',
  '/finance': 'Finance & Profitability',
  '/auto-pricing': 'Auto Pricing',
  '/pricing': 'Pricing',
  '/settings': 'Settings',
};
```

### 4.4 Command Palette Updates (`CommandPalette.jsx`)
Add command items:
- `nav-analytics`: 'Consumer Analytics' (keywords: `analytics`, `cache`, `tokens`, `efficiency`, `stats`, `breakdown`) -> `navigate('/analytics')`
- `nav-logs`: 'Request Logs' (keywords: `logs`, `history`, `requests`, `ttft`, `audit`, `telemetry`) -> `navigate('/logs')`

---

## 5. CSS Classes & Design Tokens to Reuse

| Component Element | CSS Classes / Tokens |
|---|---|
| Glass Surface Container | `ios-glass-card p-5 sm:p-6 rounded-[1.75rem] border border-black/10 dark:border-white/10` |
| Segmented Range Control | `ios-segmented-control` + `ios-segment` (with `.active` class) |
| Liquid Glass Button | `ios-btn-glass` (with `#liquid-lens` SVG filter on active) |
| Standard Buttons | `ios-btn-primary`, `ios-btn-secondary`, `ios-icon-btn` |
| Status Badge | `ios-badge` + `PROVIDER_COLORS` / semantic status colors |
| Input Fields | `ios-input` or standard `input[type="search"]` |
| Inset Grouped Table | `ios-glass-card shadow-lg overflow-hidden divide-y divide-black/5 dark:divide-white/10` |
| Text Materials | `text-vibrant-primary`, `text-vibrant-secondary`, `text-vibrant-tertiary`, `tabular-nums` |

---

## 6. Testing & Quality Assurance Plan

### 6.1 Test Suites to Implement
1. **`frontend/src/pages/Analytics.test.jsx`**:
   - Verify rendering of cache stats totals (hit rate, cached tokens, prompt tokens).
   - Verify Apple Health Activity Ring calculation & display.
   - Verify model cache performance list and hit rate bars.
   - Verify range filter switches (`24h` -> `7d` -> `30d`) and triggers API fetch.
   - Verify error and empty state handling.
2. **`frontend/src/pages/Logs.test.jsx`**:
   - Verify request logs table rendering with status pills, TTFT, cost, and timestamps.
   - Verify filtering by status (200, 429, 500) and model search query.
   - Verify pagination controls (page navigation and pageSize selector).
   - Verify model filter dropdown populated from `/api/usage/logs-models`.
   - Verify inspect modal open/close interaction.
3. **Integration & Routing Tests**:
   - Update `Sidebar.test.jsx`, `Layout.test.jsx`, `App.test.jsx`, and `useApi.test.jsx` to test new routes and API prefixes.

### 6.2 Test Command Execution
- Command: `npx vitest run`
- Target: 100% pass on all existing 25 test suites + new Analytics/Logs test suites.
- Build check: `npm run build`
