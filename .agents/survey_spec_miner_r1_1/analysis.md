# Specification & Test Suite Analysis Report

**Date**: 2026-08-23T23:30:00+07:00  
**Investigator**: Specification Miner (`survey_spec_miner_r1_1`)  
**Workspace**: `c:\Users\faizz\upstream-dashboard\frontend`  
**Specification Sources**: `ORIGINAL_REQUEST.md`, Parent Clarification Dispatch, Frontend Codebase & Vitest Suite

---

## 1. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|---|---|---|---|---|---|---|
| 1 | Visual / Physics | Liquid Glass Material (`.ios-btn-glass`) | Authentic Apple Liquid Glass pill button with specular sheen and chromatic aberration | Button clicks, hover, active press | Glass button rendering with `backdrop-filter: blur(28px)`, optical refraction | Falls back gracefully if SVG filter missing | `ORIGINAL_REQUEST.md`, `src/index.css:537-613` |
| 2 | Visual / Physics | Optical Displacement SVG Filter (`#liquid-lens`) | SVG filter with `feTurbulence`, `feDisplacementMap`, `feSpecularLighting`, `feComposite`, `feBlend` for liquid refraction on active state | SVG filter id referenced via CSS `filter: url(#liquid-lens)` | Fluid surface deformation on `:active` | Hidden SVG in DOM with `pointer-events: none` | `ORIGINAL_REQUEST.md`, `index.html:15-36` |
| 3 | Visual / Physics | Button Fresnel Sheen (`::before`) | Linear gradient overlay (`rgba(255,255,255,0.6)` to transparent) positioned on top half of button | Button hover / focus | Sheen opacity intensifies from 0.8 to 1.0 with subtle spring scale | Visual CSS only | `ORIGINAL_REQUEST.md`, `src/index.css:566-599` |
| 4 | Visual / Physics | Button Chromatic Aberration (`::after`) | Iridescent edge border using conic gradient with `mask-composite: exclude` and `mix-blend-mode: color-dodge` | CSS pseudo-element | Prismatic color edge refraction around glass pill border | Supported modern browsers; harmless fallback | `ORIGINAL_REQUEST.md` R1.2 |
| 5 | Visual / Physics | Haptic Spring Feedback on Cards (`.ios-glass-card`) | 3D spring hover/active physics for cards (Hover: `translateY(-4px) scale(1.015)`, Active: `translateY(1px) scale(0.975)`) | Hover and active/press pointer events | Smooth elevation on hover; compressed surface with deeper shadow on press | Prefers-reduced-motion disables transform | `ORIGINAL_REQUEST.md` R2, `src/index.css:166-228` |
| 6 | Visual / Physics | Ambient Mesh Cross-fade Wallpaper | Multi-orb radial gradient mesh background with 700ms cross-fade between light and dark modes | Theme state (`theme-dark` / `theme-light`) | Refractive ambient background glow behind frosted glass | Zero pointer events, contained layout | `src/components/Layout.jsx:40-108`, `src/index.css:988-1034` |
| 7 | Component / Navigation | Persistent & Drawer Sidebar (`Sidebar.jsx`) | Desktop fixed w-64 sidebar and mobile gesture-driven drawer with swipe-to-close | Route path, `isOpen`, swipe gesture offset/velocity | Navigation links, brand header, live stream pill, theme toggle | Closes on Escape, backdrop click, or swipe left (offset < -80px / velocity < -300px/s) | `src/components/Sidebar.jsx`, `src/components/Sidebar.test.jsx` |
| 8 | Component / Navigation | Spatial Topbar (`Topbar.jsx`) | Glass navigation bar with route title, desktop segmented tabs (`.ios-tab-bar`), live SSE status indicator, search trigger, theme toggle | `streamStatus`, current pathname | Sticky header with quick actions | Displays fallback status if stream unknown | `src/components/Topbar.jsx`, `src/components/Layout.test.jsx` |
| 9 | Component / Search | Spotlight Command Palette (`CommandPalette.jsx`) | Spotlight search modal with 4 categories (Pages, Models, Actions, Preferences), keyboard navigation (↑↓, Enter, Esc), direct ⌘1-5 shortcuts | User query string, keyboard events | Filtered command rows with category badges, keyboard hint footer | Shows glass empty state when no query matches | `src/components/CommandPalette.jsx`, `src/components/CommandPalette.test.jsx` |
| 10 | Component / UI | Skeleton Loading System (`Skeleton.jsx`) | Shimmer placeholder elements (`Skeleton`, `SkeletonCard`, `SkeletonBlock`) for tables and metrics | `loading` boolean, `rows` count, `w`, `h` dimensions | `role="status" aria-label="Loading"` DOM when loading; passes through `children` when resolved | Pure declarative wrapper | `src/components/Skeleton.jsx`, Parent Dispatch R1 |
| 11 | Component / Context | Glass Context Menu (`ContextMenu.jsx`) | Floating frosted glass context menu on table row right-click (View Details, Copy Model ID, Dismiss) with spring animation & screen clamping | `x`, `y`, `model`, `isOpen`, `onClose`, action handlers | Positioned glass panel with menu actions | Auto-clamps to viewport edges; dismisses on Escape, outside click, or selection | Parent Dispatch R2, `src/pages/Reliability.jsx` |
| 12 | Component / Drawer | Model Detail Inspector (`ModelDetailDrawer.jsx`) | Centered floating sheet with drag handle, economics breakdown, manual ask input, auto-pricing trigger tuning, telemetry specs | `model` object, `isOpen`, `onClose`, `onUpdated` callback | Form submissions to `/api/ask` and `/api/auto-pricing/config` | Validates > 0 inputs; catches API errors and displays toast alerts | `src/components/ModelDetailDrawer.jsx`, `src/components/ModelDetailDrawer.test.jsx` |
| 13 | Page / Monitoring | Reliability Page (`Reliability.jsx`) | Real-time operations cockpit: daemon status, 4 KPI metric cards, model snapshot table with tabs/search, execution cycles, audit event stream | REST snapshot APIs + SSE event stream | Live operations dashboard with arm/disarm toggle and model inspector trigger | Displays alert banner on HTTP 500, stream auth expiry, or connection loss | `src/pages/Reliability.jsx`, `src/pages/Reliability.test.jsx` |
| 14 | Page / FinOps | Finance & Profitability Page (`Finance.jsx`) | Financial ledger: USD/IDR currency toggle (Apple segmented control), 4 P&L cards, P&L breakdown, node distribution, Asset Inventory table, Payouts table | `/api/finance`, `/api/payouts` endpoints | Financial summary and asset management | Shows empty table states if records are empty | `src/pages/Finance.jsx`, `src/pages/Finance.test.jsx` |
| 15 | Page / Automation | Auto-Pricing Engine (`AutoPricing.jsx`) | Configure undercut margins, trigger percentages, provider scopes, and daemon arm/disarm | `/api/auto-pricing`, `/api/pricing` endpoints | Idempotent PUT requests to configure pricing rules | Catches network errors with inline error banners | `src/pages/AutoPricing.jsx`, `src/components/PricingMutations.test.jsx` |
| 16 | System / Theme | Apple Spatial Theme Engine (`theme.jsx`) | Seamless dark/light theme switcher with `localStorage` persistence, `color-scheme` update, and 500ms smooth cross-fade | User theme toggle | Updates `<html>` class (`theme-dark` / `theme-light`) | Falls back to system/dark mode if uninitialized | `src/theme.jsx`, `src/theme.test.jsx`, `src/index.css:10-82` |

---

## 2. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---|---|---|
| 1 | `SkeletonBlock` Table Loading | `loading={true}` vs `loading={false}` | When `true`, renders `role="status"` placeholder rows with shimmer animations; when `false`, renders original `children` immediately without DOM remount flicker |
| 2 | `SkeletonCard` Metric Loading | `data=null` during initial fetch | Renders glass card placeholder with matching dimensions and sub-bar skeletons, preventing layout shifts (CLS = 0) |
| 3 | `ContextMenu` Viewport Clamping | Right-click near right or bottom edge of viewport (`x > window.innerWidth - 220` or `y > window.innerHeight - 180`) | Menu position is clamped so the glass panel remains fully visible within the viewport |
| 4 | `ContextMenu` Dismiss Listeners | Press `Escape`, click outside window, or resize browser | Closes immediately, cleans up event listeners from `window` |
| 5 | `ModelDetailDrawer` Drag Dismiss | Swipe down with `offset.y > 100` or `velocity.y > 500` | Triggers `onClose()`, dismisses the modal with spring physics; minor drags snap back to origin |
| 6 | `Sidebar` Swipe Gesture | Drag left on mobile drawer (`offset.x < -80` or `velocity.x < -300`) | Dismisses sidebar drawer; ignores rightward drag or upward touch scrolling |
| 7 | `CommandPalette` Keyboard Navigation | ArrowDown at bottom of list or ArrowUp at top of list | Wraps around seamlessly to the opposite end (index 0 <-> length - 1) |
| 8 | `CommandPalette` Direct Shortcuts | Press `⌘1`, `⌘2`, `⌘3`, `⌘4`, `⌘5` while palette is open | Directly invokes navigation action for that page index and closes palette |
| 9 | `CommandPalette` Empty Query Result | Query matches no items (e.g. `xyz-123`) | Renders frosted glass empty state card with pulsing blue badge and "Clear search" button |
| 10 | `Reliability` SSE Stream Drop | Stream disconnects or returns `auth-required` | Displays prominent amber/rose alert banner with "Session expired" or "Retry connection" button |
| 11 | `Finance` Currency Conversion | Toggle between `USD ($)` and `IDR (Rp)` | Converts all monetary values using live `kurs_meta` (e.g. Rp 17,801.17/USD) with formatted locale strings (`id-ID` vs `en-US`) |
| 12 | Motion Accessibility | `@media (prefers-reduced-motion: reduce)` | All CSS transitions, keyframe shimmers, and 3D transforms reduce to 0.01ms / `none` for accessibility |

---

## 3. Test Suite Architecture & Verification Strategy

### 3.1 Framework & Config
- **Runner**: Vitest v3.2.7 (`vitest.config.js`)
- **Environment**: `jsdom` (v26.0.0) with global helpers (`describe`, `it`, `expect`, `vi`)
- **Setup File**: `src/test/setup.js` (mocks `matchMedia`, `ResizeObserver`, `scrollIntoView`)
- **Build Tool**: Vite v8.2.0 (`npm run build`)
- **Coverage Config**: Includes `src/App.jsx`, `src/components/LoginGate.jsx`, `src/components/Layout.jsx`, `src/components/Sidebar.jsx`, `src/pages/Reliability.jsx`, `src/hooks/**`, `src/lib/**` with thresholds: `lines: 80%`, `functions: 80%`, `branches: 70%`, `statements: 80%`.

### 3.2 Existing Test Inventory (24 Test Files, 173 Tests)
1. `src/App.test.jsx` (4 tests) — Protected routes, login gate, error boundary recovery
2. `src/components/Layout.test.jsx` (4 tests) — Route title display, mobile nav toggle, ambient mesh layers, Ctrl+K/Cmd+K shortcuts, quick search button
3. `src/components/Sidebar.test.jsx` (10 tests) — Active route highlight, theme toggle, mobile close button/backdrop, Escape key, `touch-pan-y`, `isSidebarSwipeClose` thresholds
4. `src/components/CommandPalette.test.jsx` (13 tests) — Spotlight search modal, category headers, query filtering, X clear button, arrow navigation, mouse hover, Enter/Click action execution, Escape dismiss, ⌘1-5 shortcuts, empty state illustration, `scrollIntoView`
5. `src/components/ModelDetailDrawer.test.jsx` (14 tests) — Economics breakdown, manual ask submission, trigger % submission, input validation, swipe-to-close handle, Escape dismiss
6. `src/components/Badge.test.jsx` (5 tests) — Variants (default, success, warning, danger, neutral), glow effect, custom class
7. `src/components/KpiCard.test.jsx` & `KpiCard.adversarial.test.jsx` (29 tests) — Trend arrows, featured glass styling, large numbers, edge case inputs
8. `src/components/Sparkline.test.jsx` (4 tests) — SVG polyline paths, color props, empty data
9. `src/components/LoginGate.test.jsx` & `LoginFlow.test.jsx` (9 tests) — Operator login, session token storage, invalid credential alerts
10. `src/components/PricingMutations.test.jsx` & `PricingPage.test.jsx` (11 tests) — Config update, delete rollback, arm/disarm, global triggers, scope toggle, idempotency keys
11. `src/components/FinanceActions.test.jsx` & `FinanceStatus.test.jsx` (6 tests) — Buy action modal, status verification badges
12. `src/components/StressAdversarial.test.jsx` (18 tests) — Toast burst stress testing, timers, dismissals
13. `src/pages/Reliability.test.jsx` (7 tests) — Snapshot loading/empty state, REST failure, SSE auth-required, arm/disarm audit feedback, model tab/search filtering, model inspector trigger, stream event processing
14. `src/pages/Finance.test.jsx` (2 tests) — P&L overview KPIs, USD/IDR currency switcher, Asset Inventory and Payouts tab switching
15. `src/theme.test.jsx` (9 tests) — Light/dark toggling, localStorage persistence, media query fallback
16. `src/hooks/useApi.test.jsx` & `useReliabilityStream.test.jsx` (13 tests) — Polling, cached tokens, SSE reconnection
17. `src/lib/fmt.test.js`, `lib/reliabilityApi.test.js`, `lib/utils.test.js` (15 tests) — Formatting, micro-cents, error unwrapping

### 3.3 Test Execution Performance Note
- On Windows systems with multi-core JSDOM worker allocation, running `npx vitest run --poolOptions.threads.singleThread` executes in ~17.4s with 100% pass rate (173/173 tests passed), avoiding concurrent CPU throttle timeouts.
- `npm run build` bundles client in ~3.6s with zero syntax or CSS errors.

---

## 4. DOM Hierarchy & CSS Contract Inventory

### 4.1 DOM & Test Selector Contracts
- **Layout**:
  - `.layout` root container with `.ambient-mesh-container`, `.ambient-mesh-dark`, `.ambient-mesh-light`
  - `.sidebar` aside with `.ios-sidebar` and `.open` class on mobile toggle
  - Topbar contains `h1` with current route title (`Reliability`, `Finance & Profitability`, `Auto Pricing`, etc.)
  - Topbar quick search button with `aria-label` or text `/quick search/i`
- **Sidebar**:
  - `nav[aria-label="Main"]` with `NavLink` items having `.ios-sidebar-item` and `.active` class
  - Mobile close button: `button[aria-label="Close menu"]`
  - Theme button: `button[aria-label="Switch to light mode" | "Switch to dark mode"]`
- **Command Palette**:
  - Modal container: `div[role="dialog"][aria-label="Spotlight Search"]`
  - Input: `input[placeholder*="Type a command"]`
  - Category headers: text elements with `Pages`, `Models`, `Actions`, `Preferences`
- **Skeleton Component**:
  - `SkeletonBlock`: when loading, renders `<div role="status" aria-label="Loading" className="space-y-3 py-2">`
  - `SkeletonCard`: renders `<div className="ios-glass-card p-4 space-y-3 ...">`
- **Context Menu**:
  - Floating element with `role="menu"` or glass container
  - Action items: `View Details`, `Copy Model ID`, `Dismiss`

### 4.2 CSS Material & Physics Contracts
- `.ios-btn-glass`:
  - `background: rgba(255, 255, 255, 0.25)` (light) / `rgba(30, 30, 35, 0.45)` (dark)
  - `backdrop-filter: blur(28px) saturate(200%)`
  - `border-radius: 9999px` (pill)
  - `::before` sheen gradient: `linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 100%)`
  - `::after` chromatic aberration: iridescent conic border with `mix-blend-mode: color-dodge`
  - `:hover::before`: `opacity: 1; transform: translateY(-1px) scaleX(1.04);`
  - `:active`: `filter: url(#liquid-lens); transform: translateY(0.5px) scale(0.96);`
- `.ios-glass-card`:
  - `backdrop-filter: blur(28px) saturate(190%) brightness(105%)`
  - `transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.5s ...`
  - `:hover`: `transform: translateY(-4px) scale(1.015);` with floating box shadow
  - `:active`: `transform: translateY(1px) scale(0.975);` with compressed heavy surface shadow

---

## 5. Implementation Strategy for Planned Features

### 5.1 R1: Skeleton Loading Integration (`Reliability.jsx` & `Finance.jsx`)
1. **`Reliability.jsx`**:
   - Import `{ SkeletonBlock, SkeletonCard }` from `../components/Skeleton`.
   - In KPI metrics grid: when `!summary` (initial fetch), render 4 `<SkeletonCard />` components.
   - In Model Inventory snapshot table: wrap table body or rows with `<SkeletonBlock loading={!models.length && !recoveryError} rows={5}>`.
   - In Execution History: wrap cycles list with `<SkeletonBlock loading={!cycles.length && !recoveryError} rows={4}>`.
   - In Audit timeline: wrap events list with `<SkeletonBlock loading={!events.length && !recoveryError} rows={4}>`.
   - Ensure existing tests in `src/pages/Reliability.test.jsx` continue to pass without regression.
2. **`Finance.jsx`**:
   - Import `{ SkeletonBlock, SkeletonCard }` from `../components/Skeleton`.
   - In KPI metrics grid: when `loading` or `!financeData`, render 4 `<SkeletonCard />` components.
   - In Overview cashflow cards: display skeleton states while `loading`.
   - In Asset Inventory tab: wrap asset table with `<SkeletonBlock loading={loading} rows={5}>`.
   - In Payouts tab: wrap payouts table with `<SkeletonBlock loading={loading} rows={5}>`.
   - Remove plain text "Loading..." or spinner indicators in data sections.

### 5.2 R2: Glass Context Menu Component (`ContextMenu.jsx`)
1. **Create `src/components/ContextMenu.jsx`**:
   - Props: `x`, `y`, `isOpen`, `onClose`, `model`, `onViewDetails(model)`, `onCopyModelId(modelId)`.
   - Styling: floating glass panel (`backdrop-filter: blur(40px) saturate(200%)`, `border: 1px solid var(--card-border)`, `box-shadow: 0 20px 50px rgba(0,0,0,0.3)`).
   - Framer Motion animation: `initial={{ opacity: 0, scale: 0.92, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}` with spring transition (`damping: 24, stiffness: 350`).
   - Smart position clamping:
     ```js
     const clampedX = Math.min(Math.max(8, x), window.innerWidth - 220);
     const clampedY = Math.min(Math.max(8, y), window.innerHeight - 180);
     ```
   - Menu items:
     - **View Details** (icon: `Info` or `Eye`): invokes `onViewDetails(model)` and closes menu.
     - **Copy Model ID** (icon: `Copy`): writes `model.model_id` to `navigator.clipboard` with toast success, closes menu.
     - **Dismiss** (icon: `X`): closes menu.
   - Keyboard & click-away handlers: listens for `Escape` key and mousedown outside menu.
2. **Wire in `Reliability.jsx`**:
   - Add `contextMenu` state `{ isOpen: false, x: 0, y: 0, model: null }`.
   - On table `<tr>` elements: add `onContextMenu={(e) => { e.preventDefault(); setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, model }); }}`.
   - Render `<ContextMenu ... />` inside `Reliability.jsx`.
3. **Unit Tests**:
   - Add test coverage in `src/components/ContextMenu.test.jsx` verifying right-click trigger, item clicks, copy action, Escape dismissal, and position clamping.
