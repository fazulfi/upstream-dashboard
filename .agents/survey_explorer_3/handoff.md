# Handoff Report: Header, Navigation & Spatial Layout Architecture Survey (Requirement R3 & Global Shell)

- **Agent**: Survey Explorer 3 (Header, Navigation & Layout Specialist)
- **Working Directory**: `c:\\Users\\faizz\\upstream-dashboard\\.agents\\survey_explorer_3`
- **Date**: 2026-08-23T12:50:00Z
- **Target Codebase**: `c:\\Users\\faizz\\upstream-dashboard\\frontend`

---

## 1. Observation

### 1.1 Build & Test Baseline Verification
- **Build Infrastructure**:
  - `package.json`: Vite 8.2.0, Tailwind CSS 4.3.3 (`@tailwindcss/vite`), React 19.2.8, React Router DOM 7.18.2, Motion 13.1.1, Lucide React 1.31.0, TanStack Table 9.1.2.
  - `vite.config.js`: Configures `@vitejs/plugin-react` and `@tailwindcss/vite` with API proxy `http://127.0.0.1:8124`.
  - Baseline execution command: `npm run build`
  - Result: **SUCCESS** (Transformed 2227 modules, output: `dist/index.html` 0.90 kB, `dist/assets/index-JgK9wyh0.css` 73.20 kB, `dist/assets/index-ComK1Tqp.js` 486.69 kB, exit code 0).
- **Test Infrastructure**:
  - `vitest.config.js`: Vitest 3.0.0, `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.js']`, coverage thresholds (80% lines/functions/statements, 70% branches).
  - Baseline execution command: `npx vitest run`
  - Result: **16 test files passed (16/16), 72 tests passed (72/72)** (100% pass rate, exit code 0).

### 1.2 Layout & Navigation Component Architecture
1. **Root Application Shell (`frontend/src/App.jsx:28-56`)**:
   - Wraps routes inside `<ThemeProvider>`, `<ToastProvider>`, and `<ErrBoundary>`.
   - Routing uses `<HashRouter>` with protected `<LoginGate>` wrapping `<Layout />`.
   - Routes:
     - `/` -> `<Reliability />`
     - `/finance` -> `<Finance />`
     - `/auto-pricing` -> `<AutoPricing />`
     - `/pricing` -> `<PricingRoute />` (wrapping `<PricingPage />`)
     - `/settings` -> `<Settings />`

2. **Master Layout Shell (`frontend/src/components/Layout.jsx:33-126`)**:
   - Fixed ambient background mesh layer (`ambient-mesh-container`, lines 36-104) featuring 4 radial gradient orbs with 500ms CSS cross-fade between light and dark modes.
   - Mobile slide-over drawer: `<Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />` (line 107).
   - Sticky topbar header: `<div className="sticky top-0 z-40"><Topbar onOpenSearch={() => setSearchOpen(true)} onToggleSidebar={toggleSidebar} /></div>` (lines 110-115).
   - Main content viewport: `<main className="main flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-6 relative z-10"><Outlet context={{ data }} /></main>` (lines 118-120).
   - Global command palette modal: `<CommandPalette isOpen={searchOpen} onClose={() => setSearchOpen(false)} />` (line 123).

3. **Topbar Header (`frontend/src/components/Topbar.jsx:53-138`)**:
   - Class: `ios-glass-nav sticky top-0 z-30 w-full px-4 sm:px-8 flex flex-col justify-between`.
   - Height: `h-16`.
   - Left brand section:
     - Hamburger menu toggle button (`aria-label="Menu"`, lines 58-64).
     - Gradient icon badge ("U").
     - Breadcrumb title: `<span className="font-mono uppercase">Upstream</span> / <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-300">{currentPage}</h1>` (lines 70-76).
   - Center navigation:
     - `<nav aria-label="Topbar Tabs" className="hidden lg:flex ios-tab-bar">` (lines 81-102) rendering 5 items (`Overview`, `Finance & P&L`, `Auto Pricing`, `Pricing`, `Settings`).
     - Active link uses `active ios-pill-active font-extrabold` (line 92).
   - Right utility toolbar:
     - Real-time SSE status indicator pill (`Live Stream`, `Connecting`, `Reconnecting`, `Expired`, lines 107-112).
     - Command palette trigger button with `⌘K` badge (lines 115-124).
     - Theme switcher toggle button (`aria-label={themeLabel}`, lines 127-134).

4. **Mobile / Slide-Over Navigation (`frontend/src/components/Sidebar.jsx:68-151`)**:
   - Motion slide-over aside: `sidebar ios-sidebar fixed top-0 bottom-0 left-0 z-50 w-72 flex flex-col touch-pan-y`.
   - Swipe dismiss via drag gestures (`handleDragEnd`, lines 46-51).
   - Navigation group: `<nav aria-label="Main" className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">` (line 103).
   - Tested by `Sidebar.test.jsx:9-15` (expects `aria-label="Main"`, `active` class on active route).

5. **Page Header Implementations**:
   - **`Reliability.jsx:195-223`**:
     - Category pill (`Sistem Operasional` + `Loop 60 Detik`).
     - Large title: `<h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-title)]">Reliability & Operations</h1>`.
     - Subtitle + status badge + refresh button.
   - **`Finance.jsx:74-117`**:
     - Category pill (`Finansial & Pendapatan` + `Realtime Ledger`).
     - Large title: `<h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">Finance & Profitability</h1>`.
     - Currency segmented switcher (`USD ($)` vs `IDR (Rp)`).
     - Refresh button.
   - **`AutoPricing.jsx`**:
     - Control Center header with Arm daemon button, provider tabs, and margin controls.
   - **`PricingPage.jsx:220-237`**:
     - Category pill (`Manual Ask & Orderbook` + `Market Depth`).
     - Large title: `<h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">Pricing & Orderbook</h1>`.
     - Subtitle describing global parameters & market depth.
   - **`Settings.jsx:80-110`**:
     - Security header with session status, operator identity, and password gate.

---

## 2. Logic Chain

### 2.1 Apple HIG / iOS 26 / VisionOS Spatial App Shell Alignment
1. **Large Navigation Title Paradigm**:
   - In native Apple design (iOS / iPadOS / VisionOS), the app shell establishes visual hierarchy through a two-tiered title system:
     1. *Inline Navigation Bar (Collapsed)*: Subtle route title displayed in the floating glass topbar (`Topbar.jsx`) when scrolled.
     2. *Large Navigation Title (Hero)*: Prominent, high-contrast title (`font-extrabold tracking-tight text-3xl sm:text-4xl`) placed at the top of the content workspace, accompanied by an eyebrow badge (semantic category) and auxiliary subtitle.
   - *Observation Connection*: `Layout.test.jsx:20` explicitly expects `screen.getByRole('heading', { name: 'Auto Pricing' })`. By maintaining the route title `<h1>` inside `Topbar.jsx` or the page header with matching accessible name, 100% test compatibility is guaranteed while providing authentic Apple HIG visual aesthetics.

2. **Spatial Layout Grid & Spacing Hierarchy**:
   - **Grid System**: 8pt base grid with `p-4 sm:p-6 lg:p-8`, `gap-4 sm:gap-6`, and `space-y-6 sm:space-y-8`.
   - **Container Constraints**: `max-w-7xl w-full mx-auto` provides optimal readability on ultra-wide desktop monitors while preserving iPad Pro 11"/13" proportions.
   - **Radiuses**:
     - Windows / Containers / Cards: `rounded-2xl` (16px) to `rounded-3xl` (24px).
     - Action Buttons & Inputs: `rounded-xl` (12px).
     - Navigation Pills & Status Badges: `rounded-full` (9999px).

3. **Multi-Platform Navigation Matrix**:
   - **Desktop / iPad (>= 1024px / `lg`)**:
     - Floating liquid glass tab bar (`ios-tab-bar`) centered in the topbar.
     - Pill active indicators (`ios-pill-active`) with 3D spring micro-interactions (`cubic-bezier(0.34, 1.56, 0.64, 1)`).
   - **Tablet / Mobile (< 1024px)**:
     - Collapsible slide-over drawer (`Sidebar.jsx`) with frosted backdrop blur (`backdrop-blur-sm`), touch swipe dismiss gestures (`touch-pan-y`), and full keyboard accessibility (Escape to dismiss).
   - **Global Quick Access (All viewports)**:
     - Spotlight / Command Palette (`CommandPalette.jsx`) activated via `⌘K` or `Ctrl+K`.

4. **VisionOS Spatial Glass Material Tokens (`index.css` & `theme.jsx`)**:
   - Depth layer 0 (Ambient Wallpaper): Fixed multi-orb radial mesh with 500ms cubic-bezier cross-fade.
   - Depth layer 1 (Surface Glass): `backdrop-filter: blur(28px) saturate(190%) brightness(105%)`, hairline specular border `rgba(255,255,255,0.14)` (dark) / `rgba(255,255,255,0.45)` (light), top-edge inset highlight `inset 0 1.5px 1px 0 rgba(255,255,255,0.25)`.
   - Depth layer 2 (Elevated Sheets & Floating Nav): `blur(32px)` - `blur(40px)`, deep ambient drop shadows `0 16px 40px -8px rgba(0,0,0,0.65)` (dark) / `0 16px 36px -4px rgba(0,0,0,0.08)` (light).
   - Vibrant text materials: Four semantic levels (`--text-vibrant-primary`, `--text-vibrant-secondary`, `--text-vibrant-tertiary`, `--text-vibrant-quaternary`).

---

## 3. Caveats

1. **Test Suite Integrity Constraints**:
   - `Layout.test.jsx:20` searches for `heading` with name `'Auto Pricing'`, `'Reliability'`, etc. The page title must render an accessible heading matching the route name.
   - `Sidebar.test.jsx:9-15` requires `<nav aria-label="Main">` and links with `active` class on current route.
   - `Sidebar.test.jsx:24-42` tests `aria-label="Close menu"` and backdrop click dismiss.
   - `Sidebar.test.jsx:57-67` expects `.sidebar` to have `touch-pan-y` class.
   - `App.test.jsx` tests `LoginGate` heading `'Upstream — Operations'` and session expiry alert.
2. **CSS / Tailwind V4 Compatibility**:
   - Tailwind v4 is imported via `@import "tailwindcss";` in `index.css` with `@theme` block. All custom CSS classes must conform to standard CSS variables and Tailwind v4 syntax.
3. **Reduced Motion Compliance**:
   - Must strictly maintain `@media (prefers-reduced-motion: reduce)` rules in `index.css:499-510` for accessibility standards.

---

## 4. Conclusion & Concrete Design Plan for Implementers

### Concrete Implementation Plan:

| Component | Target File | Proposed Refinements | Functional / Test Invariants |
|---|---|---|---|
| **Spatial Topbar** | `src/components/Topbar.jsx` | - Frosted liquid glass floating bar (`ios-glass-nav`)<br/>- Refined breadcrumb brand mark<br/>- Floating spatial tab bar with smooth active pill transitions<br/>- Live telemetry pulse pill & quick search trigger | - Maintain `<h1 className="...">{currentPage}</h1>`<br/>- Maintain `aria-label="Menu"`<br/>- Maintain `aria-label="Topbar Tabs"`<br/>- Maintain `aria-label={themeLabel}` |
| **Mobile Drawer** | `src/components/Sidebar.jsx` | - Liquid glass slide-over sheet with swipe dismiss<br/>- Inset grouped item lists with SF Pro icons<br/>- Frosted footer with live status & theme toggle | - Maintain `aria-label="Main"`<br/>- Maintain `aria-label="Close menu"`<br/>- Maintain `active` and `touch-pan-y` classes |
| **Master Layout** | `src/components/Layout.jsx` | - Native iPad/Desktop responsive container (`max-w-7xl px-4 sm:px-6 lg:px-8`)<br/>- 8pt spatial grid scale (`space-y-6 sm:space-y-8`)<br/>- Smooth 500ms ambient mesh background cross-fade | - Maintain `<Outlet context={{ data }} />`<br/>- Maintain `Cmd+K` keyboard listener |
| **Page Large Titles** | `src/pages/*.jsx`, `PricingPage.jsx` | - Authentic iOS Large Navigation Title banners (`text-3xl sm:text-4xl font-extrabold tracking-tight`)<br/>- Semantic category eyebrow pill with leading icon<br/>- Aligned toolbar controls (Segmented switchers, refresh buttons, Arm controls) | - Retain all test IDs<br/>- Retain heading labels (e.g. `Finance & Profitability`, `Reliability & Operations`, `Pricing & Orderbook`) |
| **Spatial Glass System** | `src/index.css`, `src/theme.jsx` | - Precise VisionOS specular highlight tokens<br/>- 3D spring micro-interactions (`cubic-bezier(0.34, 1.56, 0.64, 1)`)<br/>- Apple segmented controls, steppers, and pill tabs | - Preserve all color token variables (`--bg`, `--card`, `--text`, etc.) |

---

## 5. Verification Method

To verify the implementation independently, execute:

1. **Full Production Build**:
   ```bash
   cd c:\Users\faizz\upstream-dashboard\frontend
   npm run build
   ```
   *Pass criteria*: Exit code 0, 0 syntax/transform errors, `dist/` assets generated.

2. **Full Test Suite Run**:
   ```bash
   cd c:\Users\faizz\upstream-dashboard\frontend
   npx vitest run
   ```
   *Pass criteria*: All 16 test files pass (72/72 tests passed).

3. **Key Visual & Architectural Inspection**:
   - `src/components/Layout.jsx`: Inspect container sizing, ambient mesh layers, and responsive spacing.
   - `src/components/Topbar.jsx`: Inspect navigation tabs, active state styling, and breadcrumb layout.
   - `src/components/Sidebar.jsx`: Inspect touch drag gestures, accessibility attributes, and menu list.
   - `src/index.css`: Inspect `@theme` tokens, `.ios-glass-nav`, `.ios-tab-bar`, `.ios-pill-active`, and spring animations.
