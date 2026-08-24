# iOS 26 Light Mode Spatial UI: Component Inventory & Spatial Card Separation Analysis

**Target Workspace**: `c:\Users\faizz\upstream-dashboard\frontend\src`  
**Agent**: `explorer_survey_2`  
**Date**: 2026-08-23  
**Status**: Complete Survey & Architectural Specification  

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 Why Light Mode Cards Look Flat or Invisible ("Kotak-kotaknya Tidak Kelihatan")

The user reported that in Light Mode, the cards and boxes are flat, washed out, and practically invisible (*"kotak-kotaknya tidak kelihatan"*). A deep audit of `src/index.css`, `src/theme.jsx`, and all 20+ frontend components reveals four concrete root causes:

1. **Invisible Card Borders (`--card-border: transparent`)**:
   In `src/index.css` under `.theme-light` (line 40):
   ```css
   --card-border: transparent;
   ```
   Cards apply `border: 1px solid var(--card-border)`. Because the border color is `transparent`, there is zero perimeter definition separating cards from the background canvas.

2. **Near-Zero Drop Shadows (`--card-shadow: 0 1px 3px rgba(0, 0, 0, 0.02)`)**:
   In `src/index.css` (line 41):
   An alpha of `0.02` (2% opacity) on a 3px radius is imperceptible on screens. Furthermore, light mode cards lack any specular top-edge highlight (`inset 0 1px 1px rgba(255, 255, 255, 1)` or `inset 0 0 0 1px ...`), whereas dark mode has `inset 0 1px 0 0 rgba(255, 255, 255, 0.22)`.

3. **Disabled Background Ambient Mesh Gradient (`--mesh-opacity: 0`)**:
   In `src/index.css` (line 54):
   ```css
   --mesh-opacity: 0;
   ```
   `Layout.jsx` renders three large atmospheric gradient orbs (cyan, indigo, emerald) with `blur-[140px]...[160px]`. In light mode, `--mesh-opacity` is set to `0`, completely turning off the background mesh. Because the background is a flat uniform gray (`#f2f2f7`), and `--card-bg` is solid opaque `#ffffff`, `backdrop-filter: blur(28px) saturate(190%)` has zero visual refraction effect.

4. **Conflicting Global Theme Override in `theme.jsx`**:
   In `src/theme.jsx` (lines 37-61, 74-82):
   `THEMES.light` sets `--bg: '#FFFFFF'`, `--card: '#FFFFFF'`, `--layer: '#FAFAFA'`, and line 80 executes `document.body.style.background = vars['--bg']` (forcing `document.body` to solid `#FFFFFF`). A solid `#ffffff` card on a solid `#ffffff` body with transparent borders and a 2% shadow creates an optical illusion of a completely borderless, flat white page.

5. **Hardcoded Dark Palette Classes Across Key Components**:
   Components like `DataTable.jsx`, `Sidebar.jsx`, `CommandPalette.jsx`, `Toast.jsx`, and `Skeleton.jsx` hardcode Tailwind `zinc-800` / `zinc-900` / `zinc-950` classes instead of semantic tokens or dual light/dark variants.

---

## 2. Complete Component & Container Inventory

Below is the complete inventory of all UI components, panels, tables, charts, navigation, modals, and drawers across `frontend/src`:

| # | Component / File | Category | Container Type | Key Elements & Test ID Surface | Current Limitations in Light Mode |
|---|---|---|---|---|---|
| 1 | `components/Layout.jsx` | Spatial Shell | Root Layout & Background Mesh | 3x ambient mesh orbs (`#38bdf8`, `#818cf8`, `#34d399`), Sidebar, Topbar, CommandPalette, `<main>` | `--mesh-opacity: 0` disables orbs; flat background kills glass refraction. |
| 2 | `components/Topbar.jsx` | Navigation | Sticky Glass Header (`.ios-glass-nav`) | Brand badge `U`, Segmented tabs (`NAV_ITEMS`), SSE status pill, Quick search button, Theme switcher | Faint `border-black/10`, inactive tabs lack glass pill depth, status pill washed out. |
| 3 | `components/Sidebar.jsx` | Navigation | Mobile Drawer (`.sidebar`) | Brand header, NavLink list with `.active`, Theme toggle button | Hardcoded `bg-zinc-950/98 border-zinc-800/80` (looks like dark mode modal in light mode). |
| 4 | `components/CommandPalette.jsx` | Modal / Overlay | Spotlight Dialog | Search input, Command list items, Kbd shortcut footer | Hardcoded `bg-zinc-950 border-zinc-800 text-zinc-100` with no light mode glass support. |
| 5 | `components/ModelDetailDrawer.jsx` | Modal / Drawer | Slide-out Sheet Panel | Header, Market Economics card, Manual Ask form, Trigger Tuning form, Telemetry specs card | Faint borders (`border-black/10`), inner sub-cards `bg-black/5` lack frosted glass elevation. |
| 6 | `components/KpiCard.jsx` | Widget / Card | Metric Glass Card (`.ios-glass-card`) | Label, Icon tile, Big Number (`tabular-nums`), Sparkline SVG, Delta pill, Sub context | In light mode, blends completely into background; lacks 3D specular highlight and drop shadow. |
| 7 | `components/DataTable.jsx` | Table Container | TanStack Table Card | Search input, Density toggle, Sortable `<thead>`, `<tbody>` rows, Pagination footer | Hardcoded `border-zinc-800 bg-zinc-900/40 bg-zinc-950/40` (dark mode only). |
| 8 | `components/EarningsChart.jsx` | Chart Container | Recharts Area Chart | ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip | Needs glassmorphic tooltip styling (`backdrop-filter`, `var(--card-shadow)`). |
| 9 | `components/PricingPage.jsx` | Page / Panels | Multi-Panel Control Plane | Global per Upstream grid, Per-Model Override form & table, Orderbook table, Ask Form modal | Global cards and orderbook tables use `bg-black/5` which looks muddy on white; needs glass separation. |
| 10 | `components/FinanceStatus.jsx` | Widget | Decision-Grade Status Box | Metrics list with `✓ verified` / `pending` badges, variance note | Needs crisp glass card border and inner contrast. |
| 11 | `components/Badge.jsx` | Widget | Status Pill Badge | Colored badges (`ok`, `warn`, `bad`, `info`, `neutral`) with pulsing dot | Light mode colors (e.g. `text-emerald-400`, `text-amber-400`) have low WCAG contrast on bright glass. |
| 12 | `components/Toast.jsx` | Modal / Notification | Floating Alert Toasts | AnimatePresence toasts (`success`, `error`, `warning`, `info`) | Hardcoded `bg-zinc-900/90`, `bg-emerald-950/80` (dark mode only). |
| 13 | `components/Skeleton.jsx` | Widget / Loading | Shimmer Placeholders | `Skeleton`, `SkeletonCard`, `SkeletonBlock` | Hardcoded `bg-zinc-800/60` dark shimmer. |
| 14 | `components/SlideToConfirm.jsx` | Widget | Interactive Slider | Draggable thumb, label, status feedback | Faint light mode track contrast. |
| 15 | `components/Sparkline.jsx` | Widget | Inline SVG Trend Chart | SVG linear gradient area & polyline | Needs crisp stroke contrast in light mode. |
| 16 | `components/LoginGate.jsx` | Page / Modal | Session Gate Card | Form container (`.login-card.ios-glass-card`), brand mark, inputs, submit button, error alert | Needs deep 3D glass card elevation and crisp input inset styling. |
| 17 | `pages/AutoPricing.jsx` | Page / Hub | Multi-Section Hub | Top Bar, 4x `KpiCard`, Provider Control & Table card (`.ios-glass-card`), Quick Control strip, Algo Log terminal | Table headers, sub-strips, and terminal pre-blocks lack 3D glass layering. |
| 18 | `pages/Finance.jsx` | Page / Hub | FinOps Dashboard | Top Bar, Kurs Banner (`.ios-glass-card`), 4x `KpiCard`, Tabs, P&L Summary (3 tiles), Upstream Nodes grid, Asset Table, Payouts Table | Inner summary tiles `bg-black/5` look flat; tables lack clear perimeter framing. |
| 19 | `pages/Reliability.jsx` | Page / Hub | Reliability Telemetry Hub | Top Bar, Daemon Control card (`.ios-glass-card`), 4x `KpiCard`, Model Inventory table (2 cols), Cycles panel (1 col), Audit Stream panel | Panels blend into one another without distinct overlapping drop shadows and borders. |
| 20 | `pages/Settings.jsx` | Page / Hub | Settings & Security Hub | Top Bar, System & Account bento grid, Infrastructure Topology card, Session Token card, Finance Status card | Bento boxes (`bg-black/5`) lack specular borders and spatial depth. |

---

## 3. Spatial 3D Glass & Token Specifications

To achieve the genuine "iOS 26" VisionOS spatial aesthetic, the UI requires a three-tier depth hierarchy:

```
[Layer 0: Background Canvas]  -> Tinted #eef2f7 + 3x Atmospheric Refraction Mesh Orbs (opacity 0.38)
       ↓ (elevated 8px - 16px)
[Layer 1: Primary Glass Cards] -> Translucent frosted glass (rgba(255,255,255,0.72)) + Specular Inner Edge (inset 0 1px 1px rgba(255,255,255,1)) + Multi-Layer Drop Shadow + 1px Crisp Highlight Border
       ↓ (elevated 2px - 6px)
[Layer 2: Inner Trays & Tiles] -> Polished Sub-Glass Trays (rgba(255,255,255,0.60) / rgba(0,0,0,0.03)) + Inner Inset Highlight + Subtle Border
       ↓
[Layer 3: Modals, Drawers & Toasts] -> High-Elevation Glass Sheets (rgba(255,255,255,0.88)) + Heavy Backdrop Blur (32px) + Deep Ambient Shadow (0 24px 64px)
```

### 3.1 New CSS Variables for `src/index.css`

```css
@layer base {
  .theme-light {
    /* ── Canvas Background & Text ── */
    --bg-base: #eef2f7;
    --text-title: #0f172a;
    --text-body: #1e293b;
    --text-sub: #475569;
    --text-muted: #64748b;

    /* ── iOS 26 Deep 3D Frosted Glass ── */
    --card-bg: rgba(255, 255, 255, 0.72);
    --card-bg-elevated: rgba(255, 255, 255, 0.88);
    --card-border: rgba(255, 255, 255, 0.85);
    --card-border-subtle: rgba(15, 23, 42, 0.08);

    /* ── Multi-Layer Overlapping 3D Drop Shadows & Specular Highlights ── */
    --card-shadow: 
      inset 0 1px 1px 0 rgba(255, 255, 255, 1),
      inset 0 0 0 1px rgba(255, 255, 255, 0.6),
      0 1px 2px 0 rgba(15, 23, 42, 0.04),
      0 8px 24px -4px rgba(15, 23, 42, 0.08),
      0 20px 40px -12px rgba(15, 23, 42, 0.06);

    --card-shadow-hover:
      inset 0 1px 1.5px 0 rgba(255, 255, 255, 1),
      inset 0 0 0 1px rgba(255, 255, 255, 0.8),
      0 2px 4px 0 rgba(15, 23, 42, 0.04),
      0 14px 32px -4px rgba(15, 23, 42, 0.12),
      0 28px 56px -12px rgba(15, 23, 42, 0.09);

    /* ── Navigation & Headers ── */
    --nav-bg: rgba(255, 255, 255, 0.78);
    --table-head-bg: rgba(241, 245, 249, 0.85);

    /* ── Form Controls & Sub-Boxes ── */
    --input-bg: rgba(255, 255, 255, 0.75);
    --input-border: rgba(15, 23, 42, 0.12);
    --btn-secondary-bg: rgba(255, 255, 255, 0.75);
    --btn-secondary-border: rgba(15, 23, 42, 0.10);
    --btn-secondary-text: #0284c7;
    --btn-secondary-hover: rgba(255, 255, 255, 0.95);

    /* ── Segmented Pills & Hover ── */
    --pill-active-bg: rgba(255, 255, 255, 0.95);
    --pill-active-border: rgba(15, 23, 42, 0.08);
    --pill-active-text: #0f172a;
    --row-hover: rgba(14, 165, 233, 0.05);

    /* ── Mesh & Scrollbar ── */
    --mesh-opacity: 0.38;
    --scrollbar-thumb: rgba(15, 23, 42, 0.18);
    --scrollbar-thumb-hover: rgba(15, 23, 42, 0.30);
  }
}
```

### 3.2 Harmonizing `src/theme.jsx`

In `THEMES.light`:
```javascript
light: {
  '--bg': '#eef2f7',
  '--layer': 'rgba(255, 255, 255, 0.60)',
  '--card': 'rgba(255, 255, 255, 0.72)',
  '--elevated': 'rgba(255, 255, 255, 0.88)',
  '--surface2': 'rgba(241, 245, 249, 0.85)',
  '--border': 'rgba(15, 23, 42, 0.08)',
  '--border-strong': 'rgba(15, 23, 42, 0.16)',
  '--text': '#0f172a',
  '--text2': '#334155',
  '--text3': '#64748b',
  '--accent': '#0284c7',
  '--accent-hover': '#0369a1',
  '--accent-soft': 'rgba(2, 132, 199, 0.10)',
  '--on-accent': '#FFFFFF',
  '--pos': '#15803d',
  '--pos-soft': 'rgba(21, 128, 61, 0.10)',
  '--neg': '#b91c1c',
  '--neg-soft': 'rgba(185, 28, 28, 0.10)',
  '--warn': '#b45309',
  '--warn-soft': 'rgba(180, 83, 9, 0.10)',
  '--btn': '#0f172a',
  '--on-btn': '#FFFFFF',
  '--btn-hover': '#1e293b',
  '--selection': 'rgba(2, 132, 199, 0.20)',
}
```

---

## 4. Component-by-Component Transformation Specifications

### 4.1 Card Components

#### `KpiCard.jsx`
- **Class target**: `.ios-glass-card`
- **Specification**:
  - Retain existing DOM structure, `motion.div`, `whileHover={{ y: -3 }}`.
  - Featured state: Add dynamic glow `border-sky-500/50 shadow-[0_12px_32px_-4px_rgba(14,165,233,0.20),inset_0_1px_1px_rgba(255,255,255,0.95)]`.
  - Icon container: Update to `bg-white/70 dark:bg-white/5 border border-white/80 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.8)]`.
  - Sparkline stroke: `#0284c7` (featured/up) or `#10b981` with crisp stroke width.

#### `Skeleton.jsx`
- **Specification**:
  - `Skeleton`: `bg-slate-200/70 dark:bg-zinc-800/60 before:via-white/50 dark:before:via-zinc-700/30`.
  - `SkeletonCard`: `ios-glass-card p-4 space-y-3`.

### 4.2 Table Components

#### `DataTable.jsx`
- **Class target**: `<div className="w-full flex flex-col rounded-xl ...">`
- **Specification**:
  - Replace hardcoded `bg-zinc-900/40 border-zinc-800` with `ios-glass-card border border-white/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/40 shadow-lg`.
  - Filter bar header: `bg-slate-100/70 dark:bg-zinc-900/60 border-b border-black/10 dark:border-zinc-800/80`.
  - Density buttons: Active `bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-black/5 dark:border-zinc-700`.
  - Table header: `bg-slate-100/90 dark:bg-zinc-950/40 text-zinc-700 dark:text-zinc-400 font-semibold`.
  - Table rows: `divide-black/5 dark:divide-zinc-800/50`, hover `hover:bg-sky-500/5 dark:hover:bg-zinc-800/30`.
  - Pagination bar: `bg-slate-100/70 dark:bg-zinc-950/40 border-t border-black/10 dark:border-zinc-800/80`.

#### Tables in `AutoPricing.jsx`, `Finance.jsx`, `PricingPage.jsx`, `Reliability.jsx`
- **Specification**:
  - Outer wrapper: `border border-white/80 dark:border-white/10 rounded-2xl overflow-hidden shadow-inner bg-white/40 dark:bg-black/20`.
  - Sticky header `<thead>`: `bg-[var(--table-head-bg)] backdrop-blur-xl border-b border-black/10 dark:border-white/10 text-[var(--text-sub)] font-bold`.
  - Zebra/hover `<tr>`: `hover:bg-black/5 dark:hover:bg-white/5 transition-colors`.

### 4.3 Modals, Drawers & Overlays

#### `ModelDetailDrawer.jsx`
- **Specification**:
  - Slide-out sheet: `bg-white/85 dark:bg-[var(--nav-bg)] backdrop-blur-3xl border-l border-white/80 dark:border-white/10 shadow-[0_0_60px_-10px_rgba(0,0,0,0.25)]`.
  - Inner cards: Each sub-section wrapped in `.ios-glass-card` with `p-5 space-y-4 shadow-md bg-white/75 dark:bg-[var(--card-bg)]`.
  - Input fields: `bg-white/90 dark:bg-black/50 border border-black/15 dark:border-white/10 rounded-xl shadow-inner focus:border-sky-500`.

#### `CommandPalette.jsx`
- **Specification**:
  - Dialog container: `rounded-2xl border border-white/80 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/95 backdrop-blur-3xl shadow-[0_24px_64px_-12px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.9)]`.
  - Search input: `text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500`.
  - Command item (selected): `bg-sky-500/15 dark:bg-sky-950/60 text-sky-900 dark:text-sky-100 border border-sky-400/30`.
  - Shortcut footer: `bg-slate-100/80 dark:bg-zinc-900/40 border-t border-black/10 dark:border-zinc-800/80`.

#### `Toast.jsx`
- **Specification**:
  - Toast item: `rounded-xl border backdrop-blur-xl shadow-[0_12px_32px_-4px_rgba(0,0,0,0.15),inset_0_1px_1px_rgba(255,255,255,0.8)]`.
  - Success: `bg-white/95 dark:bg-emerald-950/80 border-emerald-500/40 text-emerald-900 dark:text-emerald-200`.
  - Error: `bg-white/95 dark:bg-rose-950/80 border-rose-500/40 text-rose-900 dark:text-rose-200`.
  - Warning: `bg-white/95 dark:bg-amber-950/80 border-amber-500/40 text-amber-900 dark:text-amber-200`.

### 4.4 Navigation & Layout

#### `Topbar.jsx`
- **Specification**:
  - Nav bar container: `ios-glass-nav sticky top-0 z-30 w-full px-4 sm:px-8 border-b border-white/80 dark:border-white/10 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]`.
  - Segmented tab bar: `bg-black/5 dark:bg-white/5 p-1.5 rounded-2xl border border-black/10 dark:border-white/10 backdrop-blur-xl`.
  - Active tab: `.ios-pill-active` with `bg-white dark:bg-white/15 text-zinc-900 dark:text-white shadow-[0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,1)]`.
  - Theme switcher button: `bg-white/70 dark:bg-white/5 border border-black/10 dark:border-white/10 shadow-sm`.

#### `Sidebar.jsx`
- **Specification**:
  - Mobile drawer: `bg-white/95 dark:bg-zinc-950/98 backdrop-blur-2xl border-r border-black/10 dark:border-zinc-800/80 text-zinc-900 dark:text-zinc-100 shadow-2xl`.
  - NavLink items: `hover:bg-black/5 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-400`, active: `bg-black/5 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold border border-black/10 dark:border-zinc-700`.

### 4.5 Hub Page Panels & Bento Boxes

#### `AutoPricing.jsx`
- **Specification**:
  - Provider Tab bar & Target Price Table wrapped in `.ios-glass-card`.
  - Provider Quick Control strip: `p-4 rounded-2xl bg-white/60 dark:bg-black/40 border border-white/80 dark:border-white/10 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)]`.
  - Algo Log terminal: `ios-glass-card` header + `<pre className="bg-slate-900 text-slate-100 p-4 rounded-b-2xl font-mono text-xs shadow-inner">`.

#### `Finance.jsx`
- **Specification**:
  - Kurs banner: `.ios-glass-card px-5 py-3 shadow-md`.
  - Summary breakdown: 3 inner metric tiles (`DANA MASUK`, `BIAYA ASET`, `LABA BERSIH`) styled with `p-5 rounded-2xl bg-white/60 dark:bg-black/50 border border-white/80 dark:border-white/10 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)]`.
  - Upstream distribution tiles: `bg-white/60 dark:bg-black/40 border border-white/80 dark:border-white/10`.

#### `Reliability.jsx`
- **Specification**:
  - Daemon Control center: `.ios-glass-card p-6 sm:p-7 shadow-xl`.
  - Model Coverage panel: `.panel.ios-glass-card shadow-xl`.
  - Recent completions: `.panel.ios-glass-card shadow-xl` with cycle row items `hover:bg-black/5 dark:hover:bg-white/5`.
  - Audited stream: `.panel.ios-glass-card shadow-xl` with select dropdown filters styled with `bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl`.

#### `Settings.jsx`
- **Specification**:
  - Bento setting rows: `p-4 rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-black/40 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)]`.
  - Topology items: `bg-white/60 dark:bg-black/40 border border-white/80 dark:border-white/10`.
  - Session token panel: `.panel.ios-glass-card shadow-xl`.

---

## 5. Strict Constraints & Integrity Verification

To ensure zero regression:
1. **DOM Structure & Test IDs**: All HTML elements, ARIA roles, class names relied upon by tests (e.g. `.sidebar`, `.sidebar.open`, `.ios-pill-active`, `active`, `.note`, `.login-card`, `.tbl`, `.btn-primary`), form input placeholders, button names, and test IDs MUST remain intact.
2. **WCAG Legibility**: Contrast on translucent cards is maintained with dark slate body text (`#0f172a`, `#1e293b`, `#475569`) and solid, vibrant status tints (`#15803d`, `#b91c1c`, `#0284c7`, `#b45309`).
3. **Build & Test Pass**: `npm run build` and `npx vitest run` (all 65 tests) must pass with 0 errors.
