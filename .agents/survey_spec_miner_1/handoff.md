# Handoff Report — Survey Spec Miner 1
**Target Path**: `c:\Users\faizz\upstream-dashboard\.agents\survey_spec_miner_1\handoff.md`  
**Author**: Survey Spec Miner 1  
**Timestamp**: 2026-08-23T16:10:35Z  
**Handoff Type**: Hard (Task Complete)  

---

### 1. Observation
1. **Data Fetching Layer**:
   - `frontend/src/hooks/useApi.jsx`: Returns `{ data, loading, error, reload, refetch }` (lines 99–145). `loading` starts as `true`, sets to `false` in `finally` block (line 129).
   - `frontend/src/hooks/useReliabilityStream.js`: Returns `{ status, error, reconnect, cursor }` (lines 34–100) handling `/api/reliability/stream`.
   - `frontend/src/lib/reliabilityApi.js`: Exposes REST endpoints `summary()`, `cycles()`, `events()`, `models()`, `transition()` (lines 18–27).
2. **Reliability Page (`frontend/src/pages/Reliability.jsx`)**:
   - Maintains local state `summary` (null), `models` ([]), `cycles` ([]), `events` ([]) (lines 104–107).
   - Has no explicit `loading` flag during `recover()` execution; renders default placeholder text (e.g. line 478: *"No model snapshot is available yet."*) when `models.length === 0`.
   - Contains 4 KPI cards (lines 331–357), Model Table with 6 columns (lines 413–475), Execution History list (lines 484–520), and Audit Stream list (lines 524–597).
   - `frontend/src/pages/Reliability.test.jsx` line 56 explicitly tests: `expect(screen.getByText('No model snapshot is available yet.')).toBeInTheDocument()`.
3. **Finance Page (`frontend/src/pages/Finance.jsx`)**:
   - Calls `const { data: financeData, loading, reload } = useApi('/api/finance', 30000);` (line 25).
   - Currently disables the refresh button when `loading` is true and spins the refresh icon (lines 110, 114), but falls back to dashes (`'—'`) for KPI card values and empty state text for tables without rendering skeleton loaders.
   - Contains 4 KPI cards (lines 131–164), Kurs Banner (lines 119–128), Segmented tabs (lines 167–184), Overview 3-card summary + node distribution (lines 187–264), Asset Table with 7 columns (lines 294–348), and Payouts Table with 5 columns (lines 352–392).
4. **Existing Skeleton Component (`frontend/src/components/Skeleton.jsx`)**:
   - Defines `Skeleton`, `SkeletonCard`, and `SkeletonBlock` (lines 1–44).
   - References `before:animate-[shimmer_1.5s_infinite]` (line 7), but `@keyframes shimmer` is not yet defined in `index.css`.
   - Does not have specialized variants for `SkeletonKpiCard`, `SkeletonRow`, or `SkeletonPage`.
5. **Glass Card Styling (`frontend/src/index.css`)**:
   - Defines `.ios-glass-card` (lines 166–215) and `.ios-sheet` (lines 748–771) with support for `.theme-light` and `.theme-dark`.
   - Used across all KPI cards, tables, panels, and sections.
6. **Test Baseline (`npx vitest run`)**:
   - Executed `npx vitest run` across 23 test suites (158 tests): **158 passed (100% pass rate)**.

---

### 2. Logic Chain
1. **Observation**: `useApi` provides a deterministic `loading` boolean state, but `Finance.jsx` only uses it to spin the refresh icon, while `Reliability.jsx` relies on asynchronous `recover()` without a dedicated loading state, resulting in blank/dash placeholders and layout jumping.
2. **Observation**: `KpiCard.jsx` has a fixed height (~152px) and structured layout (top label + icon, middle value + sparkline, bottom subtext + delta pill) styled with `.ios-glass-card`.
3. **Inference**: Creating a `SkeletonKpiCard` component that mirrors `KpiCard.jsx`'s DOM tree, padding (`p-5 sm:p-6`), and specular highlights will provide a 1:1 visual match during data loading, preventing cumulative layout shift (CLS).
4. **Observation**: The tables in `Reliability.jsx` (6 cols), `Finance.jsx` Assets (7 cols), and `Finance.jsx` Payouts (5 cols) have distinct column ratios and right-aligned numeric cells.
5. **Inference**: A configurable `SkeletonRow` component accepting column widths (e.g. `cols={[15, 30, 15, 15, 15, 10]}`) allows table loading states to accurately mirror real tabular data.
6. **Observation**: `ORIGINAL_REQUEST.md` requires `SkeletonLoader.jsx` with shimmer animation supporting light and dark modes, variants for `SkeletonKpiCard`, `SkeletonRow`, `SkeletonPage`, and `ContextMenu.jsx` on `.ios-glass-card` elements with Framer Motion spring physics.
7. **Inference**: Defining `@keyframes shimmer` in `index.css` alongside `.theme-light` and `.theme-dark` tokens, implementing `SkeletonLoader.jsx`, re-exporting from `Skeleton.jsx`, and creating `ContextMenu.jsx` will fulfill all functional and visual acceptance criteria.

---

### 3. Caveats
- `Reliability.test.jsx` expects `"No model snapshot is available yet."` when models are empty. When integrating skeleton loading in `Reliability.jsx`, skeleton placeholders should render during the active `loading` cycle, and transition to the empty state message when data fetching completes with zero items.
- Context menu positioning must account for mobile viewports and right-click near viewport boundaries using clamping logic (`Math.min(x, window.innerWidth - menuWidth - 16)`).

---

### 4. Conclusion
All view components, data hooks, layouts, and loading patterns have been thoroughly investigated and documented in `survey_components.md`. The design requirements for `SkeletonLoader.jsx` (`SkeletonKpiCard`, `SkeletonRow`, `SkeletonPage`) and `ContextMenu.jsx` are fully mapped, verified against the current test suite, and ready for immediate implementation.

---

### 5. Verification Method
1. **Survey Document Inspection**:
   - Inspect `c:\Users\faizz\upstream-dashboard\.agents\survey_spec_miner_1\survey_components.md` to verify all component hierarchies, table column definitions, layout dimensions, and skeleton specifications.
2. **Baseline Test Command**:
   - Run `npx vitest run` in `c:\Users\faizz\upstream-dashboard\frontend` to confirm all 23 test suites pass.
3. **Invalidation Conditions**:
   - Any layout mismatch between `SkeletonKpiCard` and `KpiCard.jsx`.
   - Any broken tests in `Reliability.test.jsx` or `Finance.test.jsx`.
