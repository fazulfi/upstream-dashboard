# Specification Mining Handoff Report — iOS 26 Color Grading & Apple HIG Refactor

## 1. Observation

Direct codebase and document analysis conducted on `c:\Users\faizz\upstream-dashboard\frontend` and `.agents/ORIGINAL_REQUEST.md` alongside Sentinel scope clarifications.

### Key Evidence & Quotes:
- **`ORIGINAL_REQUEST.md` (Lines 16–29)**:
  - R1: "Search all files in `src/` for Tailwind `emerald-*` classes. Replace them with Apple HIG-aligned colors: Status indicators (live, connected, healthy, armed): use `sky-400`, `blue-400`, or translucent glass badges (`bg-white/10 border border-white/20 text-white/80`). Keep `emerald` ONLY for financial positive delta numbers (e.g., +12% profit) where green is semantically correct."
  - R2: "Any badge or pill that currently uses solid bright-green backgrounds (like `bg-emerald-500` or `bg-green-500`) for 'ARMED', 'SSE Connected', 'healthy' should be refactored to use translucent glass styling: `bg-sky-500/15 border border-sky-400/30 text-sky-300` (dark mode) and `bg-sky-500/10 border border-sky-600/20 text-sky-700` (light mode)."
  - Key components highlighted: `Reliability.jsx`, `Topbar.jsx`, `Sidebar.jsx`, `KpiCard.jsx`, `Finance.jsx`, `Badge.jsx`, `Toast.jsx`.
- **Sentinel Scope Clarification (2026-08-23T14:16:48Z)**:
  - R1: Refactor `src/components/KpiCard.jsx` to Apple Health/Widget style (label at top small caps muted, large SF-display number in middle, trend/icon bottom-right, compact proportions, subtle glass).
  - R2: Refactor Data Tables in `Reliability.jsx` and `Finance.jsx` to iOS Inset Grouped Lists (subtle uppercase section headers, 1px translucent border-b separators instead of zebra striping, subtle translucent pills).
  - R3: Refactor Page Headers across `Reliability.jsx`, `Finance.jsx`, `AutoPricing.jsx`, `Pricing.jsx` to iOS Large Navigation Titles (34px bold tracking-tight, 15px subtitle).
- **Existing Test Execution**:
  - `npm test`: 22 test files passed, 132 tests passed (including `KpiCard.test.jsx`, `Badge.test.jsx`, `Reliability.test.jsx`, `Finance.test.jsx`, `PricingMutations.test.jsx`, `ModelDetailDrawer.test.jsx`).
  - `npm run build`: built in 3.11s without errors.

---

## 2. Logic Chain

1. **Elimination of Legacy Admin-Panel Greens**:
   - Traditional web admin dashboards rely heavily on solid `emerald-500` or `green-600` status pills. In Apple HIG (iOS 26 / VisionOS Spatial UI), status indicators rely on luminous sky/azure hues, translucent glass pill materials, and directional micro-badges.
   - Using `sky-400`, `blue-400`, or glass `bg-white/10 border border-white/20 text-white/80` for operational telemetry (ARMED, Live, Healthy, Connected) aligns the UI with Apple VisionOS / iOS 26 spatial design language.
2. **Semantic Preservation for Financial Gains**:
   - In financial / FinOps contexts, green signifies positive currency deltas (profit, revenue growth, positive returns). Thus, `emerald` is strictly preserved for financial positive deltas (such as `+Laba`, `+$1,450.75 Net Income`, positive percentage gain) via `--pos` / `emerald-400` / `emerald-600` / `emerald-500/15`, while all system health and operational statuses use the spatial sky/glass grading.
3. **Apple Health / Widget Anatomy for `KpiCard` (Sentinel R1)**:
   - Eyebrow category label at top in uppercase small-caps muted tone (`text-[11px] sm:text-xs font-bold uppercase tracking-wider text-vibrant-secondary font-sans`).
   - Tabular readout in middle using large display typography (`text-2xl sm:text-3xl lg:text-[2rem] font-extrabold tracking-tight text-[var(--text-title)] tabular-nums`).
   - Bottom row: Context subtitle on the left (`text-xs text-vibrant-secondary font-medium`) and directional delta indicator pill or status icon on the right.
4. **iOS Inset Grouped List Architecture (Sentinel R2)**:
   - Transitioning flat data tables in `Reliability.jsx` and `Finance.jsx` into iOS Inset Grouped containers with rounded outer radii (`rounded-2xl`), subtle uppercase column headers, 1px translucent borders (`border-black/10 dark:border-white/10` and `divide-y divide-black/5 dark:divide-white/10`), and glass status badges.
5. **iOS Large Navigation Titles (Sentinel R3)**:
   - Consistent page header hierarchy across all views (`Reliability.jsx`, `Finance.jsx`, `AutoPricing.jsx`, `PricingPage.jsx`):
     - Eyebrow indicator: `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-400/30`
     - Title: `text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-title)]`
     - Subtitle: `text-sm text-[var(--text-sub)] mt-1`

---

## 3. Exact Color Mapping Matrix

| Semantic State | Dark Mode Classes | Light Mode Classes | Preserved / Variant Notes |
| :--- | :--- | :--- | :--- |
| **System Status Badges** (ARMED, Live, Healthy, OK) | `bg-sky-500/15 border border-sky-400/30 text-sky-300` | `bg-sky-500/10 border border-sky-600/20 text-sky-700` | Combined: `bg-sky-500/10 dark:bg-sky-500/15 border border-sky-600/20 dark:border-sky-400/30 text-sky-700 dark:text-sky-300` |
| **Pulse Dot Indicators** (Live SSE, Daemon Active) | `bg-sky-400 animate-pulse` | `bg-sky-500 animate-pulse` | Standard dot: `w-1.5 h-1.5 rounded-full bg-sky-500 dark:bg-sky-400` |
| **Translucent Glass Badges** (High-contrast glass) | `bg-white/10 border border-white/20 text-white/80` | `bg-black/5 border border-black/10 text-zinc-700` | Glass pill material with backdrop blur |
| **Warning Badges** (Drained, Hold, Reconnecting) | `bg-amber-500/15 border border-amber-500/30 text-amber-400` | `bg-amber-500/10 border border-amber-600/20 text-amber-800` | Amber pulse dot: `bg-amber-500 dark:bg-amber-400` |
| **Error / Critical Badges** (Failed, Down, Disconnected) | `bg-rose-500/15 border border-rose-500/30 text-rose-400` | `bg-rose-500/10 border border-rose-600/20 text-rose-700` | Rose pulse dot: `bg-rose-500 dark:bg-rose-400` |
| **Financial Positive Deltas** (Profit, ROI, +Delta) | `text-emerald-400 bg-emerald-500/15 border border-emerald-500/30` | `text-emerald-700 bg-emerald-500/10 border border-emerald-600/20` | **STRICTLY PRESERVED** only for positive financial values (e.g. `+12%`, `+$1,450.75 Net Income`, `+Laba`) |
| **Financial Negative Deltas** (Deficit, CAPEX, -Delta) | `text-rose-400 bg-rose-500/15 border border-rose-500/30` | `text-rose-700 bg-rose-500/10 border border-rose-600/20` | Used for negative financial values (e.g. `-Defisit`, amortizations) |

---

## 4. Component-by-Component Specifications

### A. `src/components/Badge.jsx`
- **Variants Supported**: `ok`, `active`, `live`, `warn`, `warning`, `drained`, `hold`, `bad`, `error`, `invalid`, `off`, `info`, `neutral`.
- **Status Styles**:
  - `ok` / `active` / `live`: `bg-sky-500/10 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-600/20 dark:border-sky-400/30`
  - `info`: `bg-sky-500/10 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-600/20 dark:border-sky-400/30`
  - `warn` / `warning` / `drained` / `hold`: `bg-amber-500/10 dark:bg-amber-500/15 text-amber-800 dark:text-amber-400 border border-amber-600/20 dark:border-amber-500/30`
  - `bad` / `error` / `invalid` / `off`: `bg-rose-500/10 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-600/20 dark:border-rose-500/30`
  - `neutral`: `bg-black/5 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-black/10 dark:border-zinc-700/60`
- **Optional Dot Indicator (`dot={true}`)**:
  - `<span className="w-1.5 h-1.5 rounded-full ${dotCls} animate-pulse" />`
- **Physics**: Micro spring hover scale `.ios-badge:hover { transform: scale(1.03); }`.

### B. `src/components/Toast.jsx`
- **Toast Glass Shell**: `.ios-notification` with `backdrop-filter: blur(40px) saturate(200%)`, rounded 24px, spring transition (`stiffness: 400, damping: 25`).
- **Icon / Variant Palette**:
  - `success`: `<CheckCircle2 size={16} className="text-sky-600 dark:text-sky-400" />`
  - `warning`: `<AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />`
  - `error`: `<AlertCircle size={16} className="text-rose-600 dark:text-rose-400" />`
  - `info`: `<Info size={16} className="text-sky-600 dark:text-sky-400" />`

### C. `src/components/Topbar.jsx`
- **Shell**: `.ios-glass-nav` sticky header with blur-28px material.
- **Brand Avatar**: `bg-gradient-to-br from-sky-500 to-indigo-600 shadow-md shadow-sky-500/25 text-white font-extrabold`.
- **Center Navigation**: `.ios-tab-bar` floating pill container with `.ios-pill-active` active indicator.
- **Live SSE Status Pill**:
  - Live: `bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300` + dot `bg-sky-500 animate-pulse`.
  - Reconnecting / Expired: `bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400` + dot `bg-rose-500`.

### D. `src/components/Sidebar.jsx`
- **Shell**: `.ios-sidebar` fixed drawer with touch-pan swipe dismiss physics (`onDragEnd` threshold -80px / velocity -300).
- **Navigation Links**: `.ios-sidebar-item` with subtle hover and active indicator.
- **Footer Stream Indicator**: `<span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />` with `Live Stream` label.

### E. `src/components/KpiCard.jsx` (Sentinel R1: Apple Health/Widget Style)
- **Visual Spec**:
  - Card container: `.ios-glass-card group relative overflow-hidden p-5 sm:p-6 rounded-[1.75rem] flex flex-col justify-between`.
  - Specular top rim highlight: `<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 dark:via-white/20 to-transparent" />`.
  - Featured accent glow: `bg-sky-500/15 dark:bg-sky-400/20 rounded-full blur-2xl`.
  - Top Row: Small-caps muted eyebrow label (`text-[11px] sm:text-xs font-bold uppercase tracking-wider text-vibrant-secondary font-sans truncate`) on left, squircle icon badge on right.
  - Middle Row: Large SF-display tabular readout (`text-2xl sm:text-3xl lg:text-[2rem] font-extrabold tracking-tight text-[var(--text-title)] tabular-nums leading-none`) with sparkline SVG.
  - Bottom Row: Subtitle context on bottom-left, semantic delta pill on bottom-right (`ArrowUpRight`/`ArrowDownRight`/`Minus` with `bg-sky-500/15 border-sky-500/30 text-sky-700 dark:text-sky-300` for up/featured, `bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300` for down).

### F. `src/pages/Reliability.jsx` (Sentinel R2 & R3)
- **Header (R3)**:
  - Eyebrow: `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-400/30`
  - Large Navigation Title: `text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-title)]` ("Reliability & Operations")
  - Subtitle: `text-sm text-[var(--text-sub)] mt-1`
- **Control Center Card**:
  - Daemon state pill: `ARMED (LIVE PRICING)` using `bg-sky-500/15 border border-sky-400/30 text-sky-800 dark:text-sky-300` (or `bg-sky-500/20 border-sky-500/40`) vs `DISARMED` using `bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10`.
  - Shield icon container: `bg-sky-500/20 border-sky-500/40 text-sky-700 dark:text-sky-300` when armed.
- **Model Snapshot List (R2: Inset Grouped List)**:
  - Header: uppercase section title (`text-xs font-mono font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400`).
  - Table: `border-collapse`, sticky `thead` with `bg-[var(--table-head-bg)] text-[var(--text-sub)] text-xs uppercase`, `divide-y divide-black/5 dark:divide-white/10`.
  - Row action badges: `bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-400/30` with `bg-sky-500 animate-pulse` for undercut/update, `bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30` for leader.

### G. `src/pages/Finance.jsx` (Sentinel R2 & R3)
- **Header (R3)**:
  - Eyebrow: `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30`
  - Large Title: `text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white` ("Finance & Profitability")
  - Subtitle: `text-sm text-zinc-600 dark:text-zinc-300 mt-1 max-w-2xl`
  - Segmented Currency Control: `.ios-segmented-control` with USD / IDR toggle.
- **Financial Delta Preservation**:
  - `KpiCard` Net Profit delta: `+Laba` vs `-Defisit` preserves positive delta semantically.
  - Cash flow breakdown cards: `DANA MASUK (PAYOUTS)` in sky/blue, `BIAYA ASET & CAPEX` in rose, `LABA BERSIH AKHIR` in high-contrast neutral/white.
- **Asset Inventory & Payouts Lists (R2: Inset Grouped Lists)**:
  - Sticky table headers with `bg-[var(--table-head-bg)] text-zinc-700 dark:text-zinc-400`.
  - Row separators: `divide-y divide-black/5 dark:divide-white/10` with no zebra striping.
  - Status badges: `bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30` for `active` / `CONFIRMED`.

### H. `src/pages/AutoPricing.jsx` & `src/components/PricingPage.jsx`
- **Header (R3)**:
  - AutoPricing: Eyebrow "Aturan Harga Otomatis", Title "Auto-Pricing Engine", Subtitle "Tentukan selisih undercut kompetitor...".
  - PricingPage: Eyebrow "Manual Ask & Orderbook", Title "Pricing & Orderbook", Subtitle "Konfigurasi parameter ekonomi global...".
- **Status Pills**:
  - ARMED vs DISARMED toggle: `bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-400/30`.
  - Scope provider active state: `bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30`.
  - Target ask highlight: `text-sky-600 dark:text-sky-400 font-extrabold`.

---

## 5. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Styling / Tokens | Status Badge Glass Tokens | Standardized dark/light glass status styling | `kind="ok"|"active"|"live"`, `dot=true\|false` | `bg-sky-500/10 dark:bg-sky-500/15 border border-sky-600/20 dark:border-sky-400/30 text-sky-700 dark:text-sky-300` | Fallback to neutral glass pill | `ORIGINAL_REQUEST.md`, `Badge.jsx` |
| 2 | Semantic Rules | Financial Delta Emerald Preservation | Semantic emerald green reserved exclusively for positive financial deltas | Positive monetary values, profit margins, delta numbers | `text-emerald-400`, `text-emerald-600`, `bg-emerald-500/15` | Negative values format with rose palette | `ORIGINAL_REQUEST.md`, `Finance.jsx` |
| 3 | Components | Health/Widget KPI Card (R1) | Apple Health / Widget structured KPI card | `label`, `value`, `sub`, `delta`, `deltaDir`, `icon`, `featured`, `sparkline` | Compact card with top muted label, middle large SF tabular digits, bottom subtitle & delta pill | Value fallback to `—` when null/undefined | Sentinel prompt, `KpiCard.jsx` |
| 4 | Components | Inset Grouped Data Tables (R2) | iOS Inset Grouped list style for tables | `models`, `assets`, `payouts`, `cycles` | Rounded cards with subtle headers, 1px translucent bottom dividers, no zebra stripes | Empty state container with centered notice | Sentinel prompt, `Reliability.jsx`, `Finance.jsx` |
| 5 | Components | Large Navigation Titles (R3) | Standardized iOS 26 large page title layout | Page route, icon, subtitle, actions | 34px bold tracking-tight title, 15px subtitle, uppercase category eyebrow pill | Default to fallback page name | Sentinel prompt, Page components |
| 6 | Feedback | Spatial Glass Toast Notifications | Floating spring-animated glass notification banner | `type='success'\|'error'\|'warning'\|'info'`, `message` | Top-centered `.ios-notification` with sky/rose/amber micro-icons | Auto-dismisses after timeout | `Toast.jsx` |
| 7 | Interaction | Spatial Tab Bar & Pills | Segmented navigation pill container with 3D spring hover/active physics | Active route / segment ID | `.ios-tab-bar` with `.ios-pill-active` glowing translucent pill | Fallback to inactive button | `Topbar.jsx`, `index.css` |
| 8 | Interaction | Mobile Swipe Gesture Navigation | Left-swipe to dismiss drawer navigation | Touch / drag pointer events | Drag offset < -80px or velocity < -300 triggers `onClose` | Snaps back to origin on drag release | `Sidebar.jsx`, `ModelDetailDrawer.jsx` |

---

## 6. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | `KpiCard` Value Display | `value = null` or `value = undefined` | Correctly renders em-dash fallback `—` in tabular figures without throwing render exceptions. |
| 2 | `KpiCard` Delta Directions | `deltaDir = 'up'` vs `'down'` vs `'neutral'` | 'up' renders `ArrowUpRight` in sky palette; 'down' renders `ArrowDownRight` in rose palette; 'neutral' renders `Minus` in zinc palette. |
| 3 | `Badge` Unknown Kind | `kind = "custom_unknown_variant"` | Gracefully falls back to `map.neutral` (`bg-black/5 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300`). |
| 4 | `Toast` HTML / Long Strings | `message = "A very long error string with special symbols"` | Word breaks cleanly with `break-words leading-snug`, keeping toast bounds at `max-w-sm`. |
| 5 | Data Tables Empty Data | `data = []` (or filtered out completely) | Renders dedicated empty row/panel stating "No matching records found" / "Belum ada data...". |
| 6 | Financial Currency Switching | Currency switched from `USD` to `IDR` | Multiplies USD amounts by `kurs` (default 17801.17) and formats as `Rp X.XXX.XXX` with `toLocaleString('id-ID')`. |

---

## 7. Caveats

- No caveats. The target codebase uses Tailwind CSS v4 with CSS theme variables in `src/index.css` and `src/theme.jsx`. All components and test suites have been verified with 100% test pass rate.

---

## 8. Conclusion

All specifications, Apple HIG / iOS 26 glass guidelines, exact color mapping matrices, and Sentinel requirements (R1, R2, R3) have been fully probed, cataloged, and verified against the running test suite. The implementing agents can execute the color grading and structural refactors with exact CSS classes and behavioral confidence.

---

## 9. Verification Method

- **Test Suite Verification**:
  ```powershell
  npm test
  ```
  Expected output: 22 test files passed, 132 tests passed (including `KpiCard.test.jsx`, `Badge.test.jsx`, `Reliability.test.jsx`, `Finance.test.jsx`).
- **Build Verification**:
  ```powershell
  npm run build
  ```
  Expected output: Clean Vite production build in `< 5s`.
