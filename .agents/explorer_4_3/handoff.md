# Explorer 3 Investigation Report: Frontend Build & Test Environment

## 1. Observation

### 1.1 Baseline Build & Test Execution
- **Command**: `npm run build` executed in `c:\Users\faizz\upstream-dashboard\frontend`
  - **Result**: Exit code `0` (Completed in 2.40s)
  - **Output**:
    ```
    vite v8.2.1 building client environment for production...
    transforming...✓ 2227 modules transformed.
    rendering chunks...
    computing gzip size...
    dist/index.html                   0.90 kB │ gzip:   0.48 kB
    dist/assets/index-CTe9fY2v.css   83.95 kB │ gzip:  13.73 kB
    dist/assets/index-BIr9x00K.js   490.86 kB │ gzip: 143.86 kB
    ✓ built in 2.40s
    ```
- **Command**: `npx vitest run` executed in `c:\Users\faizz\upstream-dashboard\frontend`
  - **Result**: Exit code `0`
  - **Output**:
    ```
    Test Files  23 passed (23)
         Tests  158 passed (158)
      Duration  67.94s
    ```
- **Command**: `npm test` (`vitest run --coverage`)
  - **Result**: Tests pass, but v8 coverage provider on Windows intermittently encounters an unhandled filesystem race condition:
    ```
    Error: ENOENT: no such file or directory, open 'C:\Users\faizz\upstream-dashboard\frontend\coverage\.tmp\coverage-*.json'
    ```
  - **Assessment**: `npx vitest run` is the stable baseline test runner command on Windows.

---

### 1.2 Test Suite Architecture & Existing Test Files
The project contains 23 test files under `src/`:
1. `src/App.test.jsx` (4 tests): Authentication routing, ErrorFallback boundary rendering & clipboard copy trace, session expiry token clearance, navigation to `/pricing`.
2. `src/components/Badge.test.jsx` (5 tests): Badges for `ok`, `warn`, `error`, `neutral`, pulse dot indicator; asserts `.ios-badge`, `.bg-sky-500/15`, `.bg-amber-500/15`, `.bg-rose-500/15`.
3. `src/components/FinanceActions.test.jsx` (4 tests): Buy and Refund action modal/API requests.
4. `src/components/FinanceStatus.test.jsx` (2 tests): Verified badge per metric and status rendering.
5. `src/components/KpiCard.adversarial.test.jsx` (23 tests): Malformed values, deltaDir fallbacks, custom classes (`custom-grid-span`, `col-span-2`, `.ios-glass-card`), Lucide icons, sparkline extremes.
6. `src/components/KpiCard.test.jsx` (6 tests): Standard KPI metrics rendering, fallback dash, delta badges, featured state glow border (`border-sky-500/40`), sparkline points.
7. `src/components/Layout.test.jsx` (4 tests): Route title, sidebar toggle, ambient mesh cross-fade layers (light & dark mode), command palette (Ctrl+K / Cmd+K), search button.
8. `src/components/LoginFlow.test.jsx` (4 tests): Login form, credential submission, session setup.
9. `src/components/LoginGate.test.jsx` (5 tests): Unauthenticated landing state, ambient mesh, login card.
10. `src/components/ModelDetailDrawer.test.jsx` (14 tests): Detail drawer visibility, dismiss via close button/backdrop/Escape, touch drag handle (`touch-none`), manual ask submission, auto-pricing trigger submission, input validation, error handling.
11. `src/components/PricingMutations.test.jsx` (7 tests): Updating pricing configs, `Idempotency-Key` headers, deleting pricing config rollback, arming/disarming auto-pricing, mutation error alerts, toggling auto-pricing provider scope.
12. `src/components/PricingPage.test.jsx` (4 tests): Globals, overrides, orderbook sections, ask form modal.
13. `src/components/Sidebar.test.jsx` (10 tests): Navigation item rendering, active route class, theme toggle, close button, backdrop click, Escape key listener, `.ios-sidebar` and `.open` class toggling.
14. `src/components/Sparkline.test.jsx` (4 tests): Sparkline SVG points generation, empty data fallback.
15. `src/components/StressAdversarial.test.jsx` (18 tests): Stress testing `KpiCard` extreme values/XSS, `Badge` neutral fallbacks, `Toast` rapid burst rendering & timer-based auto-dismissal.
16. `src/hooks/useApi.test.jsx` (7 tests): Session management, fetch lifecycle, HTTP errors, abort on component unmount.
17. `src/hooks/useReliabilityStream.test.jsx` (6 tests): SSE stream connection, auth 401 session expiry, reconnection logic.
18. `src/lib/fmt.test.js` (10 tests): Number, currency, and date formatting utilities.
19. `src/lib/reliabilityApi.test.js` (4 tests): REST client API helpers.
20. `src/lib/utils.test.js` (1 test): `cn` class merger function.
21. `src/pages/Finance.test.jsx` (2 tests): P&L overview KPIs, currency toggle (USD / IDR), tab switching (Asset Inventory, Payouts).
22. `src/pages/Reliability.test.jsx` (7 tests): Loading/empty state, REST recovery failure, SSE reconnect, arm/disarm daemon transition, model filtering & search, event severity filter.
23. `src/theme.test.jsx` (7 tests): `ThemeProvider`, `useTheme`, light/dark mode toggling, `localStorage` persistence, CSS custom properties (`--bg-base`, `--mesh-opacity`, `--accent`), and static `index.css` verification (global transition curves, ambient mesh `0.7s` opacity, `@media (prefers-reduced-motion)` `0.01ms`).

---

### 1.3 Analysis of Tested Styles, Components, and Classes
- **Tested CSS Classes**:
  - `ios-badge` in `Badge.test.jsx:11`
  - `ios-glass-card` in `KpiCard.adversarial.test.jsx:111`
  - `ios-sidebar` and `open` in `Sidebar.test.jsx:94-95`
  - `theme-dark` / `theme-light` on `document.documentElement` in `theme.test.jsx:30,49`
  - `border-sky-500/40`, `bg-sky-500/15`, `bg-amber-500/15`, `bg-rose-500/15`, `touch-none`, `break-words`
- **Untested Classes**:
  - `ios-btn-glass`: Used across `ModelDetailDrawer.jsx`, `PricingPage.jsx`, `Topbar.jsx`, `AutoPricing.jsx`, `Finance.jsx`, `Reliability.jsx`, `Settings.jsx`, but NOT directly verified in any test.
  - CSS rule declarations for `.ios-glass-card` and `.ios-btn-glass` (e.g., `backdrop-filter`, `transform`, `cubic-bezier` spring transition curves, active scale states, specular highlight box-shadows) are not verified via static CSS inspection in `theme.test.jsx` or separate style tests.
- **Skeleton Component Coverage**:
  - `Skeleton.jsx` contains `Skeleton`, `SkeletonCard`, and `SkeletonBlock`, but lacks a dedicated unit test suite (`src/components/Skeleton.test.jsx` does not exist).
- **Context Menu Coverage**:
  - `ContextMenu.jsx` does not yet exist.

---

## 2. Logic Chain

1. **Build & Test Baseline**:
   - `npm run build` completed successfully without warnings or errors.
   - `npx vitest run` executed 23 test suites and 158 tests with 100% pass rate.
   - Therefore, the baseline development environment is clean, stable, and ready for feature implementation.

2. **CSS / Style Test Verification Pattern**:
   - In `src/theme.test.jsx:113-141`, Vitest directly tests `index.css` content using Node `fs.readFileSync(path.resolve(__dirname, 'index.css'), 'utf-8')` to verify that transition cubic-beziers, accessibility reduced-motion rules, and ambient mesh opacity timings are present.
   - This pattern avoids JSDOM's inability to compute real CSS pseudo-elements, backdrop-filters, and transitions while guaranteeing that critical CSS rules are not accidentally broken or removed during refactoring.

3. **Gaps in Current Coverage for Upcoming Features**:
   - **Gap A (.ios-btn-glass & .ios-glass-card)**:
     - No test asserts `.ios-btn-glass` class attachment on interactive buttons.
     - No test validates that `.ios-btn-glass` and `.ios-glass-card` CSS rules (spring cubic-bezier `(0.34, 1.56, 0.64, 1)` or `(0.16, 1, 0.3, 1)`, `backdrop-filter: blur(28px)`, hover/active scale transformations) are defined in `index.css`.
   - **Gap B (Skeleton Loading States)**:
     - When `SkeletonLoader.jsx` (and variants `SkeletonKpiCard`, `SkeletonRow`, `SkeletonPage`) is implemented, a dedicated unit test suite (`SkeletonLoader.test.jsx`) and integration tests in `Reliability.test.jsx` and `Finance.test.jsx` are needed to verify shimmer animation classes and loading state rendering when `useApi` returns `loading: true`.
   - **Gap C (Glass Context Menu)**:
     - When `ContextMenu.jsx` is implemented, unit tests in `ContextMenu.test.jsx` must verify right-click event triggering on `.ios-glass-card`, Framer Motion spring entrance scale, click-outside dismissal, Escape key dismissal, and viewport edge boundary clamping/flipping.

---

## 3. Caveats

1. **JSDOM CSS Limitations**: JSDOM does not execute layout engines, SVG filters (`feDisplacementMap`), or CSS transitions. Tests checking `.ios-btn-glass` and `.ios-glass-card` physics must either:
   - Verify class presence in the DOM (`expect(el).toHaveClass('ios-btn-glass')`), AND/OR
   - Statically assert CSS rule properties and selectors from `index.css` (following the `theme.test.jsx` pattern).
2. **Context Menu Viewport Coordinates in JSDOM**: In JSDOM, `window.innerWidth`, `window.innerHeight`, and `element.getBoundingClientRect()` default to 0. Context menu position testing will require mocking `window.innerWidth`/`innerHeight` or `getBoundingClientRect()` to test smart boundary clamping.
3. **Coverage Command Flakiness on Windows**: `npm test` runs `@vitest/coverage-v8` which has occasional temporary file locking race conditions on Windows. `npx vitest run` should be the standard test verification command.

---

## 4. Conclusion & Recommended Test Strategy

### Test Plan for Upcoming Milestones:
1. **Add `src/components/GlassStyles.test.jsx` (or extend `theme.test.jsx`)**:
   - Verify `index.css` contains `.ios-btn-glass` with `border-radius: 9999px`, `backdrop-filter`, spring transitions, and `:active` scale deformation.
   - Verify `index.css` contains `.ios-glass-card` with `backdrop-filter`, 3D spring hover/active physics, and theme-light/theme-dark shadow definitions.
2. **Add `src/components/SkeletonLoader.test.jsx`**:
   - Test `SkeletonLoader`, `SkeletonKpiCard`, `SkeletonRow`, `SkeletonPage` rendering.
   - Test accessibility (`role="status"`, `aria-label="Loading"`, `aria-hidden="true"` on shimmer placeholders).
   - Test dark and light mode styling classes.
3. **Update `Reliability.test.jsx` and `Finance.test.jsx`**:
   - Add test cases verifying that `SkeletonLoader` (or skeleton placeholders) render when data is loading (`useApi` returns `loading: true`).
4. **Add `src/components/ContextMenu.test.jsx`**:
   - Test right-click contextmenu event handling on `.ios-glass-card` elements.
   - Test menu item actions and callbacks.
   - Test dismissal on Escape key and outside click.
   - Test boundary clamping / positioning calculations.

---

## 5. Verification Method

To independently verify all findings and test suite status:

1. **Run Production Build**:
   ```bash
   cd c:\Users\faizz\upstream-dashboard\frontend
   npm run build
   ```
   *Expected result*: Exit code 0, bundle generated in `dist/`.

2. **Run Full Test Suite**:
   ```bash
   cd c:\Users\faizz\upstream-dashboard\frontend
   npx vitest run
   ```
   *Expected result*: 23 test files passed, 158 tests passed, exit code 0.

3. **Inspect CSS Verification Pattern**:
   - View `c:\Users\faizz\upstream-dashboard\frontend\src\theme.test.jsx` (lines 113–141) to inspect how `index.css` rules are statically verified.
