## 2026-08-23T10:00:12Z
You are a Worker subagent (worker_1) responsible for implementing the "iOS 26" Spatial UI Light Mode Overhaul.

Read ORIGINAL_REQUEST.md at: c:\Users\faizz\upstream-dashboard\.agents\ORIGINAL_REQUEST.md
Read PROJECT.md at: c:\Users\faizz\upstream-dashboard\PROJECT.md
Reference Explorer analyses:
- c:\Users\faizz\upstream-dashboard\.agents\explorer_survey_1\analysis.md
- c:\Users\faizz\upstream-dashboard\.agents\explorer_survey_2\analysis.md
- c:\Users\faizz\upstream-dashboard\.agents\explorer_survey_3\analysis.md

Your working directory is: c:\Users\faizz\upstream-dashboard\.agents\worker_1

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Core Objectives & Implementation Scope:
1. `c:\Users\faizz\upstream-dashboard\frontend\src\index.css`:
   - Update `.theme-light` variables:
     - `--bg-base: #eef2f7;`
     - `--card-bg: rgba(255, 255, 255, 0.76);`
     - `--card-border: rgba(255, 255, 255, 0.85);`
     - `--card-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -4px rgba(15,23,42,0.08), 0 20px 40px -12px rgba(15,23,42,0.06);`
     - `--card-highlight: inset 0 1.5px 1px 0 rgba(255, 255, 255, 1), inset 0 0 0 1px rgba(255, 255, 255, 0.6);`
     - `--mesh-opacity: 0.50;` (active, vibrant background mesh)
     - `--text-sub: #52525b;` (high contrast WCAG AA 7.0:1)
     - `--text-muted: #64748b;` (high contrast WCAG AA 4.6:1)
   - Update `.ios-glass-card`:
     - `background: var(--card-bg);`
     - `backdrop-filter: blur(28px) saturate(190%);`
     - `-webkit-backdrop-filter: blur(28px) saturate(190%);`
     - `border: 1px solid var(--card-border);`
     - `box-shadow: var(--card-shadow), var(--card-highlight);`
   - Update `.ios-glass-nav`, `.ios-glass-panel`, `.ios-glass-btn`, `.ios-pill-bar`, `.ios-pill`, `.tbl`, `.bento-row` and related utilities with deep glass and spatial depth.
2. `c:\Users\faizz\upstream-dashboard\frontend\src\theme.jsx`:
   - Update `THEMES.light`:
     - `--bg: '#eef2f7'` (ensure document.body.style.background doesn't overwrite canvas with flat white)
     - Update card, layer, border, and text tokens to harmonize with spatial light mode.
3. `c:\Users\faizz\upstream-dashboard\frontend\src\components\Layout.jsx`:
   - Enhance ambient dynamic background mesh orbs: vibrant dynamic gradients (electric cyan, violet, indigo, rose, emerald) with heavy blur (`blur-[120px]`) and ensure opacity respects `--mesh-opacity`.
4. `c:\Users\faizz\upstream-dashboard\frontend\src\components\Badge.jsx`:
   - Ensure badge text colors in light mode have high contrast (e.g. `text-emerald-700 dark:text-emerald-400`, `text-amber-800 dark:text-amber-400`, `text-rose-700 dark:text-rose-400`, `text-sky-700 dark:text-sky-400`).
5. All Components & Pages across `c:\Users\faizz\upstream-dashboard\frontend\src`:
   - Review and polish `KpiCard.jsx`, `DataTable.jsx`, `SlideToConfirm.jsx`, `Topbar.jsx`, `Sidebar.jsx`, `CommandPalette.jsx`, `Toast.jsx`, `ModelDetailDrawer.jsx`, `Skeleton.jsx`, `Sparkline.jsx`, `FinanceStatus.jsx`.
   - Review and polish pages: `Finance.jsx`, `Reliability.jsx`, `AutoPricing.jsx`, `Settings.jsx`, `PricingPage.jsx`, `LoginGate.jsx`.
   - Ensure nested sub-cards/trays (like Bento items, provider cards, P&L tiles) use polished frosted glass surfaces (`bg-white/60 dark:bg-black/40 border border-white/80 dark:border-white/10 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)]`).
   - IMPORTANT: DO NOT break any DOM hierarchy, test IDs, roles, button text, or class hooks (`.sidebar`, `.open`, `.active`, `.ios-pill-active`, `.note`, `.login-card`, `.tbl`, `.btn-primary`).
6. Mandatory Verification by Worker:
   - Run `npm run build` in `frontend/` (must pass with exit code 0).
   - Run `npx vitest run` in `frontend/` (must pass all 15 test files and all 65 tests).
   - Run `npx impeccable detect frontend/src` (must report 0 anti-patterns).
   - Verify card drop shadows and specular inner highlights are clearly present.
