# Handoff Report: Survey of Skeleton Loading, Glass Context Menu & Layout System

**Author**: `survey_explorer_r1_1`  
**Date**: 2026-08-23  
**Working Directory**: `c:\Users\faizz\upstream-dashboard\.agents\survey_explorer_r1_1`  
**Handoff Type**: Hard (Investigation complete)

---

## 1. Observation

1. **`src/components/Skeleton.jsx`**:
   - Lines 3–11: `export function Skeleton({ w = '100%', h = 14, className = '', style = {} })` uses `@keyframes shimmer` (1.5s infinite sweep).
   - Lines 13–27: `export function SkeletonCard({ className = '' })` renders an `ios-glass-card` with header, body value, and footer skeletons.
   - Lines 29–43: `export function SkeletonBlock({ children, loading, rows = 4, skeleton })` renders `<div role="status" aria-label="Loading">` when `loading=true` and `children` when `loading=false`.

2. **`src/pages/Reliability.jsx`**:
   - Lines 103–135: State manages `summary`, `models`, `cycles`, `events`. `summary` is initially `null` and `models` is initially `[]`.
   - Lines 330–358: 4 `KpiCard` components for "Status Layanan Daemon", "Heartbeat & Latensi", "Cakupan Model Aktif", "Sinkronisasi Database" rendered directly without `SkeletonCard`.
   - Lines 412–475: Model Inventory Table `<table className="tbl w-full text-left ...">` rendered without `SkeletonBlock`.
   - `src/components/ContextMenu.jsx` is not yet present in the codebase.

3. **`src/pages/Finance.jsx`**:
   - Lines 25–26: `const { data: financeData, loading, reload } = useApi('/api/finance', 30000);` and `const { data: payoutsData, reload: reloadPayouts } = useApi('/api/payouts', 30000);`.
   - Lines 131–164: 4 `KpiCard` components rendered directly without checking `loading` for `SkeletonCard`.
   - Lines 294–350 & 353–392: Asset table and Payouts table rendered directly without `SkeletonBlock`.

4. **Layout Components & Split View**:
   - `src/components/Layout.jsx` line 38: Outer div is `<div className="layout min-h-screen text-[var(--text-body)] flex flex-col font-sans relative overflow-x-hidden transition-colors duration-500">`.
   - `src/components/Sidebar.jsx` line 67 & 73: Mobile backdrop has `lg:hidden`, sidebar aside has `fixed top-0 bottom-0 left-0 z-50 lg:z-30 w-64 flex flex-col touch-pan-y`.
   - `src/components/Topbar.jsx` line 60: Hamburger menu button has `className="menu-btn lg:hidden ..."`.

5. **Test Suite Execution**:
   - Command: `npx vitest run` in `c:\Users\faizz\upstream-dashboard\frontend`
   - Result: **24 test files passed (24/24), 173 tests passed (173/173)**, duration 74.84s.
   - `vitest.config.js` coverage thresholds: lines: 80, functions: 80, branches: 70, statements: 80.

---

## 2. Logic Chain

1. **Step 1 (Skeleton Integration)**:
   - Observation 1 shows that `SkeletonCard` and `SkeletonBlock` already exist with Apple HIG glass styling and shimmer animation.
   - Observation 2 & 3 show that `Reliability.jsx` and `Finance.jsx` currently render fallback text or static cards rather than `SkeletonCard` / `SkeletonBlock`.
   - Wrapping the KPI grids in conditional `{loading ? <SkeletonCard /> * 4 : <KpiCard /> * 4}` and wrapping the tables with `<SkeletonBlock loading={loading} rows={5}>` will eliminate blank/empty flashes and satisfy requirement R1 cleanly.

2. **Step 2 (Glass Context Menu Design & Wiring)**:
   - Observation 2 shows that model table rows in `Reliability.jsx` handle `onClick` for `selectedModel` but do not handle `onContextMenu`.
   - Creating `src/components/ContextMenu.jsx` with Framer Motion spring physics, `backdrop-filter: blur(40px)`, smart screen-boundary adjustment, Escape key dismissal, and backdrop click handler, then connecting it via `onContextMenu={(e) => { e.preventDefault(); setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, model }); }}` in `Reliability.jsx` satisfies requirement R2.

3. **Step 3 (Test Stability & Coverage)**:
   - Observation 5 confirms all 173 existing tests currently pass.
   - In `Finance.test.jsx`, `loading` is mocked as `false`, so wrapping tables with `SkeletonBlock` will not break existing tests.
   - In `Reliability.test.jsx`, loading state tests check for initial rendering before promise resolution. Adding `SkeletonBlock` and `SkeletonCard` keeps the component accessible via standard `role="status"` and `aria-label="Loading"`.
   - Adding a dedicated `src/components/ContextMenu.test.jsx` ensures the new component meets the 80% coverage threshold defined in `vitest.config.js`.

---

## 3. Caveats

1. In `Reliability.jsx`, data is fetched via `reliabilityApi` (Promise.all in `recover()`) rather than `useApi`. A local `loading` boolean state or checking `!summary && !models.length` should be used for the skeleton trigger.
2. In `ContextMenu.jsx`, `navigator.clipboard` access in unit test environments (jsdom) may require mocking or safe-navigation (`navigator.clipboard?.writeText`).
3. No caveats regarding layout breakpoints or test compatibility.

---

## 4. Conclusion

The codebase is fully analyzed and in a healthy state (100% tests passing). The exact implementation roadmap for R1 and R2 is ready:
1. Integrate `SkeletonCard` and `SkeletonBlock` into `src/pages/Reliability.jsx` and `src/pages/Finance.jsx`.
2. Implement `src/components/ContextMenu.jsx` with Apple liquid glass blur(40px), spring physics, smart positioning, and right-click trigger on `Reliability.jsx` model rows.
3. Add unit tests for `ContextMenu.jsx` in `src/components/ContextMenu.test.jsx`.

---

## 5. Verification Method

To verify the investigation and changes independently:
1. Run test suite:
   ```bash
   cd c:\Users\faizz\upstream-dashboard\frontend
   npx vitest run
   ```
2. Verify build:
   ```bash
   npm run build
   ```
3. Inspect `analysis.md` at `c:\Users\faizz\upstream-dashboard\.agents\survey_explorer_r1_1\analysis.md`.
