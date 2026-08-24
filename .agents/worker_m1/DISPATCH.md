## 2026-08-23T16:30:26Z
You are the implementation worker for Milestone 1: iOS Loading States + Glass Context Menu.
Your working directory is: c:\Users\faizz\upstream-dashboard\.agents\worker_m1
Project root: c:\Users\faizz\upstream-dashboard
Codebase path: c:\Users\faizz\upstream-dashboard\frontend

Read these files before starting:
- User Request: c:\Users\faizz\upstream-dashboard\.agents\ORIGINAL_REQUEST.md
- Project Scope: c:\Users\faizz\upstream-dashboard\.agents\orchestrator_1\PROJECT.md
- Survey Reports:
  - c:\Users\faizz\upstream-dashboard\.agents\survey_explorer_r1_1\analysis.md
  - c:\Users\faizz\upstream-dashboard\.agents\survey_explorer_r2_1\analysis.md
  - c:\Users\faizz\upstream-dashboard\.agents\survey_spec_miner_r1_1\analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
1. Create `src/components/ContextMenu.jsx`:
   - Floating glass panel (`backdrop-filter: blur(40px)`, `bg-white/80 dark:bg-zinc-900/80 border border-white/20 dark:border-white/10 shadow-2xl rounded-2xl p-1.5 min-w-[200px] z-50 fixed`).
   - Items:
     - "View Details" (icon) -> calls `onViewDetails?.(model)` and `onClose()`.
     - "Copy Model ID" (icon) -> copies `model?.model_id || model?.id` to clipboard via `navigator.clipboard?.writeText` (with fallback/safe check) and `onClose()`.
     - "Dismiss" (icon) -> calls `onClose()`.
   - Framer Motion spring entrance (`initial={{ opacity: 0, scale: 0.92, y: -4 }}`, `animate={{ opacity: 1, scale: 1, y: 0 }}`, `exit={{ opacity: 0, scale: 0.95 }}`).
   - Smart positioning: Clamp coordinates `x` and `y` within viewport bounds so menu never clips offscreen.
   - Closes on Escape key, outside click/pointerdown, or selecting any item.

2. Create `src/components/ContextMenu.test.jsx`:
   - Full Vitest suite testing rendering, item clicks, copy action, Escape key dismiss, and outside click.

3. Update `src/pages/Reliability.jsx`:
   - Import `{ SkeletonBlock, SkeletonCard }` from `'../components/Skeleton'`.
   - Import `ContextMenu` from `'../components/ContextMenu'`.
   - Add `contextMenu` state: `{ isOpen: false, x: 0, y: 0, model: null }`.
   - In KPI section, when `!summary` (or loading), render `<SkeletonCard />` (x4) instead of empty or plain loading.
   - Wrap the Model Inventory Table in `<SkeletonBlock loading={!models || models.length === 0} rows={5}>...</SkeletonBlock>`.
   - Add `onContextMenu={(e) => { e.preventDefault(); setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, model: m }); }}` to model `<tr>` rows.
   - Render `<ContextMenu isOpen={contextMenu.isOpen} x={contextMenu.x} y={contextMenu.y} model={contextMenu.model} onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))} onViewDetails={(model) => setSelectedModel(model)} />`.

4. Update `src/pages/Finance.jsx`:
   - Import `{ SkeletonBlock, SkeletonCard }` from `'../components/Skeleton'`.
   - In KPI section, when `loading || !financeData`, render `<SkeletonCard />` (x4).
   - Wrap Asset Balance table and Payouts table in `<SkeletonBlock loading={loading || !financeData} rows={5}>...</SkeletonBlock>`.
   - Remove any plain text "Loading..." or spinners.

5. Verify:
   - Run `npm run build` in `frontend`.
   - Run `npx vitest run --poolOptions.threads.singleThread` in `frontend`.
   - Ensure all test suites pass with 0 errors and build succeeds cleanly.

6. Write your detailed handoff report to `c:\Users\faizz\upstream-dashboard\.agents\worker_m1\handoff.md` and notify the parent orchestrator via `send_message`.
