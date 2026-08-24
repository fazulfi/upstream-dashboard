# Upstream FinOps Dashboard — Component & Loading State Survey
**Document**: `survey_components.md`  
**Author**: Survey Spec Miner 1  
**Target Milestone**: iOS-Style Loading States + Glass Context Menu  
**Date**: 2026-08-23  

---

## 1. Executive Summary

This survey provides an exhaustive architectural and visual layout specification for the frontend data fetching layer, view components, loading states, and context menu interactions in the Upstream FinOps Dashboard (`frontend/src`).

The dashboard currently uses custom glassmorphism styling (`.ios-glass-card`, `.ios-sheet`, `.ios-segmented-control`, `.ios-badge`) designed for an Apple iOS 26 / VisionOS aesthetic. However, loading states across core views (`Reliability.jsx`, `Finance.jsx`, `AutoPricing.jsx`) are inconsistent—often showing blank content, unstyled empty placeholders (e.g. *"No model snapshot is available yet."*), spinning icons (`<RefreshCw className="animate-spin" />`), or fallback dashes (`'—'`) instead of native-feeling iOS skeleton shimmer states.

This document maps the exact component structures, dimensions, data hooks, and layout hierarchies required to implement:
1. **`SkeletonLoader.jsx`**: High-fidelity iOS skeleton loading system with hardware-accelerated shimmer animations, custom variants (`SkeletonKpiCard`, `SkeletonRow`, `SkeletonPage`), and seamless light/dark mode adaptation.
2. **`ContextMenu.jsx`**: Native iOS glass context menu triggered on right-click on any `.ios-glass-card`, featuring spring physics (`scale: 0.8 -> 1`), smart boundary clamping, and contextual actions.

---

## 2. Data Fetching Architecture & State Analysis

### 2.1 Hook: `useApi.jsx` (`frontend/src/hooks/useApi.jsx`)
- **Signature**: `useApi(path, pollMs = 0)`
- **Return Type**: `{ data, loading, error, reload, refetch }`
- **Initial State**:
  - `data = null`
  - `loading = true`
  - `error = null`
- **Lifecycle & Behaviors**:
  1. On mount, initiates `load()`.
  2. If `isApiEnabled(path)` is false: sets `data = null`, `loading = false`, `error = null`.
  3. AbortController cancels prior in-flight requests when `path` changes or on unmount.
  4. On HTTP error (non-2xx) or network failure: sets `error = err.message`, `loading = false`.
  5. On success: sets `data = json`, `error = null`, `loading = false`.
  6. If `pollMs > 0`: sets up interval polling via `setInterval`.
  7. Handles session expiry (`401`/`403`) by dispatching `'session-expired'` event and clearing token.
- **Helper Utilities**:
  - `getSessionToken()`, `setSessionToken(tok)`, `clearSessionToken()`
  - `apiFetch(path, options)`: Injects `Authorization: Bearer <token>` and auto-attaches `Idempotency-Key` for non-GET requests.
  - `usd(v)`, `idr(v, kurs)`, `usdIdr(v, kurs)`: Monetary formatters.

### 2.2 Hook: `useReliabilityStream.js` (`frontend/src/hooks/useReliabilityStream.js`)
- **Signature**: `useReliabilityStream(onEvent, recover)`
- **Return Type**: `{ status, error, reconnect, cursor }`
- **Status States**: `'connecting'` | `'live'` | `'recovering'` | `'reconnecting'` | `'auth-required'`
- **SSE Stream Endpoint**: `/api/reliability/stream`
- **Stream Processing**:
  - Parses event stream frames (`parseFrame`).
  - Maintains event ID cursor in `sessionStorage` (`reliability_stream_last_event_id`).
  - Triggers `recover()` callback whenever the stream connects/recovers to re-sync snapshot state.

### 2.3 API Service: `reliabilityApi.js` (`frontend/src/lib/reliabilityApi.js`)
- Methods:
  - `summary()`: `GET /api/reliability/summary`
  - `cycles(params)`: `GET /api/reliability/cycles?limit=25`
  - `events(params)`: `GET /api/reliability/events?limit=25`
  - `models(params)`: `GET /api/reliability/models?limit=50`
  - `transition(state)`: `POST /api/reliability/{arm|disarm}`
- Utility: `unwrap(payload)` unwraps `{ data: ... }` or `{ result: ... }` envelopes.

---

## 3. Current Loading State & Fallback Audit

| Page / Component | Data Source | Current Loading State Representation | UX Shortcoming / Defect |
|---|---|---|---|
| **Reliability.jsx** | `reliabilityApi` (`summary`, `cycles`, `events`, `models`) + SSE stream | Does NOT have explicit `loading` boolean; arrays default to `[]`, `summary` defaults to `null`. KPI cards show hardcoded defaults (`"Healthy"`, `"1.482 ms"`, `"0 Model"`); tables show *"No model snapshot is available yet."* | Flashes empty state text momentarily before data loads; KPI cards flash placeholder values with sudden layout shifts. |
| **Finance.jsx** | `useApi('/api/finance', 30000)` + `useApi('/api/payouts', 30000)` | Tracks `loading` boolean from `useApi`; passes to refresh button spinner. All monetary metrics render fallback `'—'`; tables render empty message *"Tidak ada aset yang sesuai filter."* | Abrupt transition from blank/dashes to rendered metrics; no skeleton shimmer; tables jump in height. |
| **AutoPricing.jsx** | `useApi('/api/auto-pricing', 15000)` + `useApi('/api/auto-pricing/config')` + `useApi('/api/pricing')` | Imports `SkeletonBlock` from `Skeleton.jsx` but does not render it. Uses `<RefreshCw className={loading ? 'animate-spin' : ''} />`. Content renders empty until `data` arrives. | Incomplete skeleton integration; unused import; visual jerkiness during initial page load. |
| **PricingPage.jsx** | `globals`, `overrides`, `orderbook` passed as props from `PricingRoute` (`useApi('/api/pricing')`) | Receives `loading` prop but does not render skeleton blocks for the pricing configuration tables or overrides. | Blank tables until initial load completes. |
| **KpiCard.jsx** | Metric card component | Renders `value != null ? value : '—'`. When `value` is undefined, leaves middle row with a dash `'—'`. | No native skeleton loading state when `loading` prop is passed. |
| **DataTable.jsx** | Generic table component | Shows *"No matching records found."* if data is empty during fetch. | Table displays false empty state while data is still loading. |

---

## 4. Detailed Component & Layout Survey

### 4.1 `Reliability.jsx` (`frontend/src/pages/Reliability.jsx`)

The Reliability page is the primary operational dashboard for daemon monitoring and model economics.

#### Visual Hierarchy & Dimensions:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Top Operations Bar                                                       │
│    [Eyebrow: Radio + Sistem Operasional] [Loop 60 Detik]                    │
│    H1: Reliability & Operations                                             │
│    Subtitle: Monitoring status daemon harga otomatis...                      │
│    [Controls: State Badge (SSE Connected/Connecting) + Refresh Button]      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. Alerts Banner (AnimatePresence) (Error / Stale / Auth-Required)          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. Control Center Header (ios-glass-card, p-6 sm:p-7, shadow-xl)            │
│    ┌───────────────────────────────────┬──────────────────────────────────┐ │
│    │ [32px Shield Icon Squircle]       │ [Button: Arm / Disarm Daemon]   │ │
│    │ STATUS DAEMON: ARMED / DISARMED   │                                  │ │
│    │ Mode simulasi aktif / Live PUT... │                                  │ │
│    └───────────────────────────────────┴──────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. 4 FinOps Metric KPI Cards (grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4)│
│    ┌───────────────┬───────────────┬───────────────┬──────────────────────┐ │
│    │ Layanan Daemon│ Heartbeat/Lat │ Model Aktif   │ Sinkronisasi DB      │ │
│    │ "Healthy"     │ "14:20:00"    │ "50 Model"    │ "14:19:55"           │ │
│    │ 100% Uptime   │ Respon: 1.4ms │ 5 Provider    │ Holds: 0 · Errors: 0 │ │
│    └───────────────┴───────────────┴───────────────┴──────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. Main Grid (grid grid-cols-1 lg:grid-cols-3 gap-6)                        │
│    ┌──────────────────────────────────────────────┬───────────────────────┐ │
│    │ 5A. Model Coverage Table (lg:col-span-2)     │ 5B. Execution History │ │
│    │     - Header: Snapshot title, Search input,  │     (1 col)           │ │
│    │       Filter Tabs (All, Undercut, Leader...) │     - Recent cycle    │ │
│    │     - Table (6 cols): Provider, Model ID,    │       rows with time  │ │
│    │       Action, Our price, Reference, Freshness│       & model count   │ │
│    │     - Max Height: 480px scrollable           │     - Max H: 480px    │ │
│    └──────────────────────────────────────────────┴───────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ 6. Audited Operations & Mutation Stream (ios-glass-card full width)         │
│    - Header: Audit timeline + Provider / Severity filter selects            │
│    - Event list: severity dot, event type, model slug, timestamp             │
│    - Max Height: 256px (max-h-64) scrollable                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Skeleton Layout Requirements for `Reliability.jsx`:
- **When Loading**:
  - Control Center Header: Skeleton icon squircle (48x48px), skeleton title badge (140x24px), skeleton subtitle (320x14px), skeleton button (130x42px).
  - 4 KPI Cards: Render `4x SkeletonKpiCard`.
  - Model Table: Render table skeleton with 5 header columns and 6-8 `SkeletonRow`s matching column proportions:
    - Provider: 15% width (badge shape)
    - Model ID: 30% width
    - Action: 15% width (pill shape)
    - Our price: 15% width (right-aligned)
    - Reference: 15% width (right-aligned)
    - Freshness: 10% width (right-aligned)
  - Execution History List: Render 4-5 cycle skeleton rows (title + timestamp left, model badge right).
  - Audit Stream: Render 3-4 event stream skeleton rows (dot + title left, timestamp right).

---

### 4.2 `Finance.jsx` (`frontend/src/pages/Finance.jsx`)

The Finance page visualizes publisher revenues, cash flows, asset amortizations, and withdrawal transactions.

#### Visual Hierarchy & Dimensions:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Top Header & Segmented Controls                                          │
│    [Eyebrow: Wallet + Finansial & Pendapatan] [Realtime Ledger]              │
│    H1: Finance & Profitability                                              │
│    Subtitle: Pantau pendapatan publisher, saldo penarikan dana...           │
│    [Controls: Currency Switcher USD/IDR (ios-segmented-control) + Refresh]  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. Kurs Banner (ios-glass-card, px-5 py-3)                                  │
│    "Kurs Referensi (USD/IDR): 1 USD = Rp 17.801,17"                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. 4 FinOps Metric KPI Cards (grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4)│
│    ┌───────────────┬───────────────┬───────────────┬──────────────────────┐ │
│    │ Laba Bersih   │ Total Penarikan│ Biaya Aset   │ Impairment / Rugi    │ │
│    │ "$1,450.75"   │ "$2,000.00"   │ "$400.00"     │ "$100.00"            │ │
│    │ +Laba (up)    │ 1 transaksi   │ Amortisasi    │ 0 kejadian           │ │
│    └───────────────┴───────────────┴───────────────┴──────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. Tab Navigation (Apple Segmented Control)                                 │
│    [ Ringkasan P&L (Overview) | Asset Inventory (67) | Payouts & W/D (1) ]  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. Active Tab View                                                          │
│    Tab 1: Overview                                                          │
│      - Cash Flow Summary Card (3 metric sub-cards: Dana Masuk, Biaya, Laba) │
│      - Upstream Provider Node Distribution Grid (3-col cards)                │
│    Tab 2: Asset Inventory                                                   │
│      - Filter bar: Search input + Status dropdown                           │
│      - Asset Table (7 cols): Asset ID, Provider, Label, Qty, Biaya, Cost, St│
│    Tab 3: Payouts & Withdrawals                                             │
│      - Payouts Table (5 cols): ID Transaksi, Tanggal, Catatan, Jumlah, Stat │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Skeleton Layout Requirements for `Finance.jsx`:
- **When Loading**:
  - Kurs Banner: Skeleton text line (240x16px).
  - 4 KPI Cards: Render `4x SkeletonKpiCard`.
  - Tab 1 Overview:
    - Summary Box: 3 skeleton metric tiles (each with label, large 28px text, subtext).
    - Provider Node Grid: 3 skeleton provider cards with squircle badge.
  - Tab 2 Assets:
    - Filter Bar: Skeleton search box (240x36px) + skeleton select box (120x36px).
    - Table: 7-column skeleton rows (Asset ID 15%, Provider 15%, Label 25%, Qty 5%, Cost 15%, USD 15%, Status 10%).
  - Tab 3 Payouts:
    - Table: 5-column skeleton rows (Ref 20%, Date 20%, Note 30%, USD 15%, Status 15%).

---

### 4.3 `KpiCard.jsx` (`frontend/src/components/KpiCard.jsx`)

`KpiCard` is the signature metric container across all views.

#### Layout Anatomy & Exact Dimensions:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────────┐ (Top Rim Specular)
│ │ TOP ROW:                                               │                  │
│ │ [LABEL: 11px uppercase bold]       [ICON SQUIRCLE: 38x38px]               │
│ ├────────────────────────────────────────────────────────┤                  │
│ │ MIDDLE ROW:                                            │                  │
│ │ [VALUE: 28-32px font-extrabold]    [SPARKLINE: 80x28px]│                  │
│ ├────────────────────────────────────────────────────────┤                  │
│ │ BOTTOM ROW (pt-3 border-t border-black/6 dark:white/8):│                  │
│ │ [SUB: 12px medium truncated]       [DELTA PILL: 22px H]│                  │
│ └────────────────────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
```
- **Padding**: `p-5 sm:p-6`
- **Border Radius**: `rounded-[1.75rem]` (28px)
- **Container Class**: `ios-glass-card group relative overflow-hidden flex flex-col justify-between`
- **Specular Highlight**: `pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 dark:via-white/20 to-transparent`
- **Ambient Glow (Featured)**: `-top-12 -right-12 w-32 h-32 bg-sky-500/15 dark:bg-sky-400/20 rounded-full blur-2xl`
- **Estimated Rendered Height**: ~148px - 160px.

---

### 4.4 Table Components & Layouts

1. **`DataTable.jsx`**:
   - Header toolbar (search + compact/comfortable density toggle).
   - Table headers with sort direction indicators.
   - Paging footer with rows-per-page selector and next/prev buttons.
2. **`Reliability` Table**:
   - Headers: `Provider`, `Model`, `Action`, `Our price`, `Reference`, `Freshness`.
   - Density: Monospace cells, right-aligned monetary numbers, pill badges for actions.
3. **`Finance` Asset Table**:
   - Headers: `Asset ID`, `Provider`, `Deskripsi`, `Qty`, `Biaya Asli`, `Biaya (USD)`, `Status`.
4. **`Finance` Payouts Table**:
   - Headers: `ID Transaksi`, `Tanggal`, `Catatan`, `Jumlah`, `Status`.

---

## 5. Required Skeleton Architecture (`SkeletonLoader.jsx`)

To ensure modularity, accessibility, and high visual fidelity, the skeleton architecture must provide the following primitives and compound components:

### 5.1 Base `SkeletonLoader` (`Skeleton`)
- **Props**:
  - `w` / `width`: `string | number` (default: `'100%'`)
  - `h` / `height`: `string | number` (default: `14`)
  - `variant`: `'text' | 'circular' | 'rectangular' | 'rounded'` (default: `'rounded'`)
  - `animate`: `boolean` (default: `true`)
  - `className`: `string`
  - `style`: `React.CSSProperties`
- **Accessibility**: `role="status"` or `aria-hidden="true"` with wrapper `aria-busy="true"`
- **Visual Styling**:
  - **Light Mode**: Base `bg-slate-200/80` (or `rgba(0, 0, 0, 0.06)`), shimmer gradient `via-white/70`
  - **Dark Mode**: Base `bg-zinc-800/60` (or `rgba(255, 255, 255, 0.08)`), shimmer gradient `via-zinc-700/40`

### 5.2 `SkeletonKpiCard`
Matches `KpiCard.jsx` structure pixel-for-pixel:
```jsx
export function SkeletonKpiCard({ featured = false, className = '' }) {
  return (
    <div className={`ios-glass-card relative overflow-hidden p-5 sm:p-6 rounded-[1.75rem] flex flex-col justify-between h-[152px] ${featured ? 'border-sky-500/30' : ''} ${className}`}>
      {/* Specular highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 dark:via-white/20 to-transparent" />
      
      {/* Top Row: Eyebrow + Icon Squircle */}
      <div className="flex items-center justify-between gap-2">
        <Skeleton w="45%" h={12} className="rounded-md" />
        <Skeleton w={36} h={36} className="rounded-2xl shrink-0" />
      </div>

      {/* Middle Row: Value + Sparkline */}
      <div className="flex items-baseline justify-between gap-3 my-2">
        <Skeleton w="60%" h={30} className="rounded-lg" />
        <Skeleton w={72} h={24} className="rounded-md hidden sm:block shrink-0" />
      </div>

      {/* Bottom Row: Subtitle + Delta Pill */}
      <div className="flex items-center justify-between pt-3 border-t border-black/[0.06] dark:border-white/[0.08] gap-2">
        <Skeleton w="40%" h={12} className="rounded-md" />
        <Skeleton w="25%" h={18} className="rounded-full shrink-0" />
      </div>
    </div>
  );
}
```

### 5.3 `SkeletonRow`
Configurable skeleton table row supporting custom column counts, widths, and alignments:
```jsx
export function SkeletonRow({ cols = [20, 35, 15, 15, 15], className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-5 py-3.5 border-b border-black/5 dark:border-white/10 ${className}`}>
      {cols.map((colWidth, i) => (
        <div key={i} style={{ width: typeof colWidth === 'number' ? `${colWidth}%` : colWidth }} className="flex">
          <Skeleton h={14} w="85%" className="rounded-md" />
        </div>
      ))}
    </div>
  );
}
```

### 5.4 `SkeletonPage`
Preset compound skeletons for full page layouts:
- `SkeletonPage.Reliability`: Control center header + 4 KPI cards + 2-column main grid (Model table + History list) + Stream timeline.
- `SkeletonPage.Finance`: Kurs banner + 4 KPI cards + Segmented tabs + Overview/Table panels.
- `SkeletonPage.Generic`: Header + 4 KPI cards + 1 large table card.

### 5.5 Shimmer Keyframe CSS
Defined in `index.css` / `App.css`:
```css
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.animate-shimmer {
  animation: shimmer 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
```

---

## 6. Glass Context Menu Specification (`ContextMenu.jsx`)

### 6.1 Requirement Summary
- **Trigger**: Right-click (`contextmenu` event) on any `.ios-glass-card` element.
- **Styling**: Native `.ios-sheet` liquid glass panel with heavy backdrop blur (`blur(40px)`), iOS specular rim, vibrant text, divider lines, and tactile menu items.
- **Animation**: Framer Motion spring entrance:
  - Initial: `{ opacity: 0, scale: 0.8, y: -4 }`
  - Animate: `{ opacity: 1, scale: 1, y: 0 }`
  - Exit: `{ opacity: 0, scale: 0.8, y: -4 }`
  - Spring Transition: `{ type: 'spring', damping: 24, stiffness: 320, mass: 0.8 }`
- **Dismissal**:
  - Click outside (pointerdown on document)
  - Pressing `Escape` key
  - Window scroll / resize
- **Positioning**:
  - Smart viewport bounding box calculation:
    ```js
    const menuWidth = 220;
    const menuHeight = 240;
    const x = Math.max(12, Math.min(clientX, window.innerWidth - menuWidth - 16));
    const y = Math.max(12, Math.min(clientY, window.innerHeight - menuHeight - 16));
    ```

### 6.2 Contextual Actions Matrix
When triggered on a `.ios-glass-card`, the menu can inspect the card's context (e.g. card title, text content, data attributes) to display actions:
1. **Copy Card Summary / JSON** (Copies metrics or text to clipboard + trigger toast feedback).
2. **Refresh Metric** (Calls active reload callback).
3. **Inspect Details** (Opens drawer or expands view if applicable).
4. **Copy Link / Share**.
5. **Dismiss / Close**.

---

## 7. Features Discovered & Edge Cases

### Features Discovered
| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|---|---|---|---|---|---|---|
| 1 | Loading States | `useApi` loading hook | Returns `{ data, loading, error, reload }` on 15s/30s polling intervals | API path, poll interval ms | React state object | Sets `error` string and `loading=false` on failure | `src/hooks/useApi.jsx` |
| 2 | Stream Telemetry | `useReliabilityStream` | SSE stream for real-time model events and cycle completion | `onEvent` callback, `recover` callback | `{ status, error, reconnect, cursor }` | Exponential backoff reconnect on drop | `src/hooks/useReliabilityStream.js` |
| 3 | Skeletons | Existing `Skeleton.jsx` | Basic skeleton primitives (`Skeleton`, `SkeletonCard`, `SkeletonBlock`) | `w`, `h`, `className`, `rows` | Rendered JSX shimmer div | Fallback gracefully if unloaded | `src/components/Skeleton.jsx` |
| 4 | FinOps Cards | `KpiCard.jsx` | Standard FinOps KPI metric card with sparklines & delta badges | `label`, `value`, `sub`, `delta`, `icon`, `featured`, `sparkline` | Rendered `.ios-glass-card` | Fallback dash `'—'` on undefined | `src/components/KpiCard.jsx` |
| 5 | Surface Glass | `.ios-glass-card` CSS | Glassmorphism card surface with 3D spring hover/active and dark/light modes | CSS class | Translucent backdrop blurred card | Degrades gracefully without backdrop-filter | `src/index.css:166` |
| 6 | Sheet Glass | `.ios-sheet` CSS | Glass modal / sheet panel with heavy 40px blur & saturate(200%) | CSS class | Apple HIG glass sheet | None | `src/index.css:748` |
| 7 | Theme System | `ThemeProvider` | Dark/light theme context via CSS custom properties on `:root` | `dark` \| `light` | Injected CSS vars & `.theme-dark`/`.theme-light` | LocalStorage fallback | `src/theme.jsx` |
| 8 | Table Engine | `DataTable.jsx` | TanStack Table v8 with pagination, density switcher, global filter | `columns`, `data`, `searchable` | Full interactive glass table | "No matching records found" | `src/components/DataTable.jsx` |

### Edge Cases
| # | Feature | Input / Condition | Observed / Required Behavior |
|---|---|---|---|
| 1 | `Reliability.jsx` Initial Load | `summary === null && models.length === 0` | Render `SkeletonPage.Reliability` or skeleton KPI cards + table skeleton instead of flashing empty text. |
| 2 | `Reliability.test.jsx` Compatibility | `models = []` after resolve | `Reliability.test.jsx` line 56 expects `"No model snapshot is available yet."` when models are empty. Skeleton should only show while `loading === true`, not when data is loaded but empty. |
| 3 | `Finance.jsx` Currency Switch | Toggle USD -> IDR during loading | Skeleton value widths should accommodate longer IDR values without overflow. |
| 4 | Context Menu Screen Edges | Right-click near bottom-right corner (e.g. `x=1900, y=1000` on 1920x1080) | Smart boundary clamping adjusts menu origin to prevent offscreen rendering. |
| 5 | Context Menu Outside Clicks | User clicks outside or scrolls page | Immediately dismisses context menu with scale 0.8 exit animation. |
| 6 | Theme Toggle During Skeleton Loading | User switches theme while skeleton is shimmering | Shimmer base and gradient instantly adapt to light/dark tokens without layout jump. |
| 7 | In-flight Network Failure | `useApi` receives HTTP 500 | `loading` transitions to `false`, error banner renders, skeleton is unmounted. |

---

## 8. Implementation Plan & File Matrix

1. **`frontend/src/components/SkeletonLoader.jsx`**:
   - Implement `SkeletonLoader` (with `Skeleton` alias), `SkeletonKpiCard`, `SkeletonRow`, `SkeletonPage`.
   - Support light & dark mode tokens.
   - Include `@keyframes shimmer` in `index.css`.
2. **`frontend/src/components/Skeleton.jsx`**:
   - Re-export all members from `SkeletonLoader.jsx` to preserve backward compatibility.
3. **`frontend/src/components/ContextMenu.jsx`**:
   - Implement global context menu component listening to `.ios-glass-card` right clicks.
   - Connect to `Layout.jsx` or root app wrapper.
4. **`frontend/src/pages/Reliability.jsx`**:
   - Integrate `loading` state during initial `recover()` fetch.
   - Render `SkeletonKpiCard` for 4 KPI cards and `SkeletonRow`s for tables during `loading`.
   - Preserve `"No model snapshot is available yet."` when loaded and empty for test compatibility.
5. **`frontend/src/pages/Finance.jsx`**:
   - Check `loading` from `useApi`.
   - Render `SkeletonKpiCard` and `SkeletonRow`s when `loading` is true.
6. **Tests**:
   - Create unit tests for `SkeletonLoader.test.jsx` and `ContextMenu.test.jsx`.
   - Verify `npx vitest run` and `npm run build`.

---
*End of Survey Report.*
