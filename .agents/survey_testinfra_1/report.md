# Test Infrastructure & Test Coverage Survey Report

## Executive Summary
This survey provides a comprehensive audit of the frontend testing infrastructure, build pipeline, existing test suites, and test coverage across navigation and UI shell components (`Layout`, `Sidebar`, `Topbar`, `CommandPalette`), as well as requirements for visual and physics enhancements (R1 Liquid Glass Button Deformation, R2 Haptic Spring Card Physics, and iPad/Desktop Shell Layouts).

- **Vitest Execution**: 24 test files, 173 tests passing cleanly in ~21.7s via `npx vitest run`.
- **Vite Build**: Production build (`npm run build`) bundles cleanly in ~11.4s.
- **Coverage Status**: Baseline coverage config in `vitest.config.js` sets 80% lines/functions/statements and 70% branches thresholds.
- **Identified Gap**: `Topbar.jsx` lacks a dedicated unit test file (`Topbar.test.jsx`), and visual/CSS material assertions for R1/R2 require dedicated DOM/CSS verification fixtures.

---

## 1. Test & Build Infrastructure

### 1.1 Tooling & Environment
| Component | Package / Version | Role |
| :--- | :--- | :--- |
| **Test Runner** | Vitest `^3.0.0` | ESM-native test runner with JSDOM environment |
| **DOM Testing** | `@testing-library/react` `^16.3.2`, `@testing-library/jest-dom` `^7.0.1` | Component integration & interaction tests |
| **DOM Simulation** | `jsdom` `^26.0.0` | Browser DOM emulation |
| **Coverage Engine** | `@vitest/coverage-v8` `^3.0.0` | V8 bytecode coverage instrumentation |
| **Linter** | `oxlint` `^1.75.0` | Fast Rust-based JavaScript/JSX linter |
| **Bundler** | Vite `^8.2.0` with `@vitejs/plugin-react` `^6.0.4` | Production bundler & dev server |
| **Styling** | Tailwind CSS `^4.3.3` with `@tailwindcss/vite` `^4.3.3` | Utility & CSS variables framework |
| **Animation** | `motion` `^13.1.1` (`motion/react`) | Apple spring physics & gesture animations |

### 1.2 Configuration Files
- **`frontend/package.json`**:
  - `npm run dev`: starts Vite dev server.
  - `npm run build`: executes `vite build`.
  - `npm run lint`: executes `oxlint`.
  - `npm test`: executes `vitest run --coverage`.
  - `npm run test:watch`: executes `vitest` interactive watcher.
- **`frontend/vitest.config.js`**:
  - `environment: 'jsdom'`
  - `globals: true`
  - `setupFiles: ['./src/test/setup.js']` (stubs `fetch`, `window.scrollTo`, resets mocks & sessionStorage in `afterEach`).
  - `include: ['src/**/*.test.{js,jsx}']`
  - Thresholds: lines: 80%, functions: 80%, branches: 70%, statements: 80%.
- **`frontend/vite.config.js`**:
  - Plugins: `[react(), tailwindcss()]`
  - Proxy: `/api` -> `http://127.0.0.1:8124`.

---

## 2. Existing Test Coverage Analysis

### 2.1 Navigation & Shell Components

#### A. `Layout` (`src/components/Layout.jsx` | `src/components/Layout.test.jsx`)
- **Current Tests (4 tests)**:
  1. Route title rendering, navigation links, and mobile sidebar toggle (`.sidebar.open`).
  2. Ambient mesh cross-fade container & light/dark mode layers (`.ambient-mesh-container`, `.ambient-mesh-dark`, `.ambient-mesh-light`).
  3. Command palette keyboard toggling with `Ctrl+K`, `Cmd+K`, and `Escape` dismiss.
  4. Quick search button in Topbar opening Command Palette, dismissed via `Escape`.
- **Strengths**: Solid integration testing of the main viewport shell, keyboard listener wiring, and search palette mount/unmount.
- **Gaps**: Responsive layout adaptation across viewport widths (mobile <640px vs iPad/tablet 768px-1024px vs desktop >=1024px `lg:pl-64`).

#### B. `Sidebar` (`src/components/Sidebar.jsx` | `src/components/Sidebar.test.jsx`)
- **Current Tests (10 tests)**:
  1. Renders `nav[aria-label="Main"]` and applies active route class.
  2. Theme toggle button switching between light/dark modes.
  3. `onClose` callback invocation on close button and backdrop click.
  4. `Escape` key listener invoking `onClose` when open.
  5. `touch-pan-y` mobile scroll handling class and `open` state class.
  6. Automatic close on navigation link selection.
  7. Motion drag constraints and spring animations configured on `<motion.aside>`.
  8–10. Unit tests for `isSidebarSwipeClose` swipe gesture logic (distance threshold `< -80px`, velocity threshold `< -300px/s`, undefined/null safety).
- **Strengths**: Excellent gesture physics unit testing and accessibility checks.

#### C. `Topbar` (`src/components/Topbar.jsx`)
- **Current Coverage**: **0 dedicated tests** (`Topbar.test.jsx` does not exist). Only indirectly rendered during `Layout.test.jsx`.
- **Gaps**:
  1. Stream status pills for all 5 lifecycle states: `live`, `connecting`, `reconnecting`, `recovering`, `auth-required`.
  2. Segmented tab navigation (`NAV_ITEMS`: Overview, Finance, Auto Pricing, Pricing, Settings) active state classes.
  3. Route title mapping and fallback logic (`pageNames[location.pathname]`).
  4. Quick search button click callback (`onOpenSearch`) and `⌘K` badge rendering.
  5. Theme toggle action in Topbar.

#### D. `CommandPalette` (`src/components/CommandPalette.jsx` | `src/components/CommandPalette.test.jsx`)
- **Current Tests (13 tests)**:
  1. Mount/unmount lifecycle (`isOpen=false` returns null).
  2. Initial search input, 4 category headers (`Pages`, `Models`, `Actions`, `Preferences`), initial command items, and keyboard shortcut badges (`⌘1`, `⌘2`, `⇧⌘T`).
  3. Search filtering across title, subtitle description, and keywords.
  4. Query reset via clear `X` button.
  5. Keyboard list navigation with `ArrowUp` / `ArrowDown` wrap-around.
  6. Mouse hover selection synchronization.
  7. Action execution and modal closure on `Enter` key.
  8. Action execution and modal closure on item click.
  9. Keyboard dismissal via `Escape`.
  10. Direct numerical jump shortcuts `⌘1`–`⌘5` for Pages category.
  11. Theme toggle shortcut `⇧⌘T`.
  12. Empty state glass card illustration and "Clear search" action.
  13. `scrollIntoView` auto-scroll on selection change.
- **Strengths**: Comprehensive coverage of keyboard interactions, fuzzy matching, category grouping, and shortcuts.

---

## 3. Test Strategy for R1 (Liquid Glass Deformation) & R2 (Haptic Spring Feedback)

To ensure high quality across all implementation requirements, tests should be organized into the standard **4-Tier Testing Model**:

```
        ▲
       / \     Tier 4: Real-World Scenarios (Multi-device, rapid interactions)
      /   \    Tier 3: Cross-Feature Interactions (Theme, focus, SSE stream + Topbar)
     /     \   Tier 2: Boundary & Corner Cases (Disabled, empty, overflow, viewport resize)
    /       \  Tier 1: Feature Coverage (CSS rules, SVG filter primitives, component DOM)
   ───────────
```

### Tier 1: Feature Coverage (Core Capabilities)
1. **SVG Filter Primitives Verification**:
   - Verify SVG `#liquid-lens` filter is present in `index.html` (or rendered via `Layout.jsx`).
   - Check presence of `<feTurbulence>`, `<feDisplacementMap>`, `<feSpecularLighting>`, `<feComposite>`, `<feBlend>` with correct attributes (`baseFrequency="0.015 0.02"`, `scale="14"` or `"18"`, `operator="in"`, `mode="screen"`).
2. **CSS Material Class Declarations**:
   - Verify `.ios-btn-glass` styling in `src/index.css` has `::before` specular sheen and `::after` chromatic aberration pseudo-elements.
   - Verify `.ios-btn-glass:active` applies `filter: url(#liquid-lens)`.
   - Verify `.ios-glass-card` has hover physics (`translateY(-4px) scale(1.015)` or `-2px`), active press physics (`translateY(1px) scale(0.975)` or `scale(0.97)`), and release spring transition (`cubic-bezier(0.34, 1.56, 0.64, 1)`).
3. **Dedicated `Topbar.test.jsx`**:
   - Add unit tests verifying all status pill variants (`live`, `connecting`, `reconnecting`, `recovering`, `auth-required`).
   - Test segmented tabs navigation on desktop and menu button trigger on mobile.

### Tier 2: Boundary & Corner Cases
1. **Disabled Button State**:
   - Buttons with `.ios-btn-glass:disabled` or `aria-disabled="true"` must not trigger hover deformation, active displacement filter, or transform scaling.
2. **Extreme Viewport Resizing / Split View**:
   - Viewport width simulations:
     - Phone: 375px (sidebar in drawer mode, topbar compact).
     - iPad Split View: 768px / 820px (test navigation accessibility and touch targets).
     - Desktop: >=1024px (persistent sidebar, expanded topbar tabs).
3. **Filter Fallback & Malformed Query Handling**:
   - CommandPalette handling non-ASCII, regex special characters, or empty strings without throwing.

### Tier 3: Cross-Feature Interactions
1. **Modal & Drawer Focus Precedence**:
   - When CommandPalette is open over an active Sidebar or Drawer, focus and `Escape` key dismisses CommandPalette first, preserving underlying drawer state.
2. **Theme Switching on Glass Materials**:
   - Dynamic theme change (`theme-dark` <-> `theme-light`) updates CSS variables (`--card-bg`, `--card-border`, `--card-shadow`, `--card-highlight`) without breaking button sheen or spring transitions.
3. **SSE Stream Updates & Topbar Status**:
   - Verify Topbar status pill updates dynamically as `streamStatus` prop transitions from `connecting` -> `live` -> `reconnecting`.

### Tier 4: Real-World Scenarios
1. **Rapid Click / Tap Stress**:
   - Rapid multiple clicks on `.ios-btn-glass` to ensure CSS spring animations do not produce layout shift, stuck active states, or memory leaks.
2. **End-to-End Shell Workflow**:
   - Open CommandPalette -> search model -> navigate -> trigger drawer -> toggle theme -> inspect glass card rendering.

---

## 4. Recommended New Test Files & Fixtures

| Target File | Purpose | Priority |
| :--- | :--- | :--- |
| `src/components/Topbar.test.jsx` | Unit tests for Topbar status badges, route titles, tabs, search button, and theme switcher | **High** (Closes current coverage gap) |
| `src/components/VisualPhysics.test.jsx` | Integration assertions for SVG `#liquid-lens` filter structure, `.ios-btn-glass` pseudo-elements, and `.ios-glass-card` spring physics classes | **High** (Direct verification of R1/R2) |

---

## 5. Verification Commands
- Run test suite: `npx vitest run`
- Run test suite with coverage: `npm test`
- Run production build: `npm run build`
- Run oxlint: `npm run lint`
