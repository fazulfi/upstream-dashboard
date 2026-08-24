# Handoff Report — Survey Explorer 1

**Mission:** Investigate frontend styling, UI component architecture, Framer Motion, icons, theme providers, and modals/context menus for iOS Loading States + Glass Context Menu.  
**Working Directory:** `c:\Users\faizz\upstream-dashboard\.agents\survey_explorer_1`  
**Date:** 2026-08-23T16:10:15Z  
**Type:** Hard Handoff (Investigation Complete)

---

## 1. Observation

1. **Package & Dependencies (`frontend/package.json:14-39`)**:
   - `"react": "^19.2.8"`, `"react-dom": "^19.2.8"`
   - `"tailwindcss": "^4.3.3"`, `"@tailwindcss/vite": "^4.3.3"` (Tailwind v4 with Vite plugin in `vite.config.js:3,7`)
   - `"motion": "^13.1.1"` (Framer Motion v13 for React)
   - `"lucide-react": "^1.31.0"`
   - `"@tanstack/react-table": "^9.1.2"`
   - `"recharts": "^3.10.1"`
   - `"clsx": "^2.1.1"`, `"tailwind-merge": "^3.6.0"`
   - Test framework: `vitest` v3.0.0, `@testing-library/react` v16.3.2, `@testing-library/jest-dom` v7.0.1.

2. **Tailwind & Theme Setup (`frontend/src/index.css:1-82` & `frontend/src/theme.jsx:9-106`)**:
   - `index.css:1` uses `@import "tailwindcss";` and custom variant `@custom-variant dark (&:where(.theme-dark, .theme-dark *));`.
   - `theme.jsx:87-106` defines `ThemeProvider` injecting CSS custom properties on `:root` (`document.documentElement`), toggling `.theme-light` / `.theme-dark` classes, and reading/writing `localStorage['upstream-theme']`.
   - Theme properties define colors for `--bg-base`, `--card-bg`, `--card-border`, `--card-shadow`, `--card-highlight`, `--nav-bg`, `--text-title`, `--text-sub`, `--accent` (`#0a84ff` dark / `#0071e3` light), and `--mesh-opacity`.

3. **Glass Styling Definitions (`frontend/src/index.css:166-215, 748-770`)**:
   - `.ios-glass-card`:
     - Line 167-171: `background: var(--card-bg); backdrop-filter: blur(28px) saturate(190%) brightness(105%); -webkit-backdrop-filter: blur(28px) saturate(190%) brightness(105%); border: 1px solid var(--card-border); box-shadow: var(--card-shadow), var(--card-highlight); border-radius: 1.5rem;`
     - Line 182-189: `:hover` translates `translateY(-2px)`, `:active` scales `scale(0.995)`.
     - Used across 30+ locations including `KpiCard.jsx:79`, `DataTable.jsx:53`, `PricingPage.jsx:256`, `Finance.jsx:120,190,235`, `Reliability.jsx:278,363,484,524`.
   - `.ios-sheet`:
     - Line 748-770: `background: var(--nav-bg, rgba(255, 255, 255, 0.85)); backdrop-filter: blur(40px) saturate(200%); -webkit-backdrop-filter: blur(40px) saturate(200%); border-radius: 20px; box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.2); border: 1px solid var(--card-border, rgba(0,0,0,0.1));`
     - Used in `CommandPalette.jsx:123`, `ModelDetailDrawer.jsx:127`.

4. **Framer Motion Import & Conventions**:
   - Imports in all components use `import { motion, AnimatePresence } from 'motion/react';` (e.g. `ModelDetailDrawer.jsx:2`, `Sidebar.jsx:3`, `Toast.jsx:2`, `PricingPage.jsx:2`, `Reliability.jsx:2`).
   - Standard spring config for floating sheet/palette/dialogs: `transition={{ type: 'spring', damping: 26, stiffness: 280 }}` or `{ type: 'spring', stiffness: 400, damping: 25 }`.

5. **Existing Loading & Context Menu State**:
   - `Skeleton.jsx:1-44` has basic `Skeleton`, `SkeletonCard`, and `SkeletonBlock`, using `before:animate-[shimmer_1.5s_infinite]`.
   - No explicit `@keyframes shimmer` definition currently exists in `index.css` or `App.css`.
   - `Finance.jsx:25` uses `useApi('/api/finance', 30000)` which provides `loading` state, but does not display skeleton loading while `loading` is true.
   - `Reliability.jsx:104,114-135` fetches rest data via `recover()` in `useEffect`, with no skeleton loader for KPI cards or table rows during initial fetch.
   - Context menus: No context menu component (`ContextMenu.jsx` or similar) currently exists in the project.

6. **Build & Test Baseline Verification**:
   - Ran `npm test` (`vitest run --coverage`): 23 test files passed, 158 tests passed, 92.88% statement coverage.
   - Ran `npm run build` (`vite build`): Built successfully in 1.36s (`dist/assets/index-BIr9x00K.js` 490.86 kB).

---

## 2. Logic Chain

1. **Observation 1 & 2** establish that the project uses Tailwind v4 with `@theme` and `.theme-dark`/`.theme-light` classes managed via `ThemeProvider`. Any new component (e.g., `SkeletonLoader.jsx`, `ContextMenu.jsx`) can use Tailwind utility classes combined with the existing CSS variables (`--card-bg`, `--card-border`, `--nav-bg`, `--text-title`, `--text-sub`, `--accent`) for light/dark mode parity.
2. **Observation 3** shows that all major UI panels, cards, and metric displays share the `.ios-glass-card` class name. A global context menu listener targeting elements with `.ios-glass-card` (or delegating to the closest `.ios-glass-card` ancestor via `e.target.closest('.ios-glass-card')`) will reliably intercept right-clicks on all intended dashboard cards.
3. **Observation 3 & 4** show that modal sheets and popups use `.ios-sheet` with Motion v13 springs (`import { motion, AnimatePresence } from 'motion/react'`). Styling `ContextMenu.jsx` with `.ios-sheet` and spring scale `0.8 -> 1` aligns with the established interaction physics of `ModelDetailDrawer` and `Toast`.
4. **Observation 5** demonstrates that `Reliability.jsx` and `Finance.jsx` currently lack high-fidelity skeleton loading. Integrating `SkeletonLoader.jsx` (with `SkeletonKpiCard`, `SkeletonRow`, `SkeletonPage`) when `loading` is active will complete the iOS 26 loading state requirements.
5. **Observation 5** reveals that `@keyframes shimmer` is not explicitly declared in CSS. Adding the `@keyframes shimmer` rule to `index.css` will ensure the shimmer sweep animation functions across all browsers.
6. **Observation 6** establishes the baseline that the application builds and passes all tests cleanly with zero regressions.

---

## 3. Caveats

- **CSS Shimmer Rule**: While Tailwind allows arbitrary animation syntax (`before:animate-[shimmer_1.5s_infinite]`), without `@keyframes shimmer` in CSS or `@theme`, the animation may render as a static gradient without horizontal translation. It must be explicitly defined in `index.css`.
- **Context Menu Event Propagation**: Standard right-click inside form inputs (`input`, `textarea`, `select`) within a glass card should preserve native browser context menus unless explicitly intended for the card actions. The event handler should check `e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA'`.
- **Viewport Boundary Collision**: Right clicks near the right or bottom edges of the screen need viewport measurement (`window.innerWidth`, `window.innerHeight`) to reposition the context menu upwards/leftwards so it never overflows.

---

## 4. Conclusion

The UI and styling architecture is modular and ready for the implementation of both required iOS 26 patterns:
1. **`SkeletonLoader.jsx`**: Implement with `shimmer` keyframe animation and 3 distinct variants (`SkeletonKpiCard`, `SkeletonRow`, `SkeletonPage`), integrated into `Reliability.jsx` and `Finance.jsx`.
2. **`ContextMenu.jsx`**: Implement with `.ios-sheet` styling, Motion v13 spring entrance (`scale: 0.8 -> 1`), smart boundary clamping, Escape and click-outside dismissal, triggered on right-click on `.ios-glass-card`.

---

## 5. Verification Method

To independently verify this survey:
1. **Inspect CSS Variables and Classes**:
   - View `frontend/src/index.css:166-215` (`.ios-glass-card`)
   - View `frontend/src/index.css:748-770` (`.ios-sheet`)
   - View `frontend/src/theme.jsx` (Theme provider and color maps)
2. **Verify Motion and Lucide Imports**:
   - Check `frontend/src/components/ModelDetailDrawer.jsx:2-3`
   - Check `frontend/src/components/Toast.jsx:2-3`
3. **Execute Test Suite**:
   ```bash
   cd c:\Users\faizz\upstream-dashboard\frontend
   npm test
   ```
   *Expected:* 23 test suites pass, 158 tests pass.
4. **Execute Build**:
   ```bash
   cd c:\Users\faizz\upstream-dashboard\frontend
   npm run build
   ```
   *Expected:* Vite build completes with exit code 0.
