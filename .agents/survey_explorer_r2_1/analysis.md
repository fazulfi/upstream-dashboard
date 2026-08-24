# Architectural & Codebase Survey: R2 Enhanced Spotlight / Command Palette & Glass Context Menu

**Survey Explorer ID**: `survey_explorer_r2_1`  
**Date**: 2026-08-23  
**Target Codebase**: `c:\Users\faizz\upstream-dashboard\frontend`  

---

## 1. Executive Summary

This survey provides a comprehensive architectural and code analysis of the **Spotlight / Command Palette** (`src/components/CommandPalette.jsx`), the newly specified **Glass Context Menu** (`src/components/ContextMenu.jsx`), and the **Skeleton Loading System** (`src/components/Skeleton.jsx`) across `Reliability.jsx` and `Finance.jsx`.

### Key Verification & Health Metrics:
- **Build Status**: `npm run build` succeeds cleanly (`✓ built in 2.79s`, 0 errors).
- **Test Suite**: `npx vitest run` executes **24 test files** with **173 passing tests** (100% pass rate).
- **Dependencies**: React 19 (`19.2.8`), `motion` (`13.1.1` via `motion/react`), `lucide-react` (`1.31.0`), `@tanstack/react-table` (`9.1.2`), `tailwindcss` (`4.3.3`).

---

## 2. Command Palette / Spotlight Search Deep Dive

### 2.1 Component Structure (`src/components/CommandPalette.jsx`)
- **Location**: `src/components/CommandPalette.jsx` (522 lines)
- **Mount Point**: Mounted in `src/components/Layout.jsx` (lines 130–131) and controlled by `searchOpen` state.
- **Global Triggers**:
  - `Ctrl+K` or `Cmd+K` keyboard event listener in `Layout.jsx` (lines 18–27).
  - Quick Search button in `Topbar.jsx` via `onOpenSearch`.

### 2.2 Command Catalog & Data Model
The palette maintains a structured catalog organized into 4 primary categories:
1. **Pages (Navigation)**:
   - `Reliability & Telemetry` (`⌘1`, `/`)
   - `Finance & Profitability` (`⌘2`, `/finance`)
   - `Auto-Pricing Engine` (`⌘3`, `/auto-pricing`)
   - `Pricing & Orderbook` (`⌘4`, `/pricing`)
   - `Settings & Security` (`⌘5`, `/settings`)
2. **Models (Fleet & Endpoints)**:
   - `anthropic/claude-3-5-sonnet` (`↵`, `/?search=claude-3-5-sonnet`)
   - `openai/gpt-4o` (`↵`, `/?search=gpt-4o`)
   - `meta-llama/llama-3.3-70b-instruct` (`↵`, `/?search=llama-3.3`)
   - `deepseek/deepseek-chat` (`↵`, `/?search=deepseek-chat`)
   - `google/gemini-flash-1.5` (`↵`, `/?search=gemini-flash`)
3. **Actions (Operational Controls)**:
   - `Arm Auto-Pricing Daemon`
   - `Disarm Auto-Pricing Daemon`
   - `Refresh Telemetry Stream`
   - `Export Finance Statement (CSV)`
   - `Inspect Session Auth Token`
4. **Preferences (System & UI)**:
   - `Switch to Light Mode` / `Switch to Dark Mode` (`⇧⌘T`)

### 2.3 Search & Fuzzy Filtering
- **Multi-Field Filtering**: Matches query across `title`, `sub`, `category`, and `keywords[]` (e.g., searching `"cost leader"` finds DeepSeek; searching `"jwt"` finds Inspect Session Auth Token).
- **Grouped Categories**: `groupedResults` maintains category priority order: `['Pages', 'Models', 'Actions', 'Preferences']`.
- **Global Index Tracking**: Every item in every category receives a continuous `globalIndex` (0 to N-1), enabling continuous cross-category keyboard navigation.

### 2.4 Visual Styling & Glass Aesthetics
- **Backdrop**: `fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md`.
- **Window**: `w-full max-w-2xl rounded-3xl border border-white/20 dark:border-white/10 ios-sheet p-2 shadow-2xl overflow-hidden`.
- **Section Headers**:
  ```jsx
  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center justify-between bg-black/5 dark:bg-white/5 backdrop-blur-md rounded-lg mb-1">
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-sky-500/70" />
      <span>{group.category}</span>
    </div>
    <span className="text-[10px] font-mono opacity-60">
      {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
    </span>
  </div>
  ```
- **Staggered Row Animation**:
  ```jsx
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.18, delay: Math.min(item.globalIndex * 0.03, 0.3) }}
  ```
- **Row Elements**:
  - **Leading Icon**: Squircle container `p-2.5 rounded-xl shrink-0` with active highlight (`bg-sky-500/25 text-sky-600 dark:text-sky-300`).
  - **Label & Subtitle**: `title` (text-xs sm:text-sm font-semibold truncate) + `sub` (text-[11px] sm:text-xs text-zinc-500 truncate).
  - **Shortcut Badge**: `<kbd className="px-2 py-0.5 text-[10px] font-mono ...">{item.shortcut}</kbd>`.
  - **Return Icon**: Pulsing `CornerDownLeft` icon when item is actively selected.

### 2.5 Keyboard Navigation & Accessibility
- `ArrowDown` / `ArrowUp` with circular wrap-around (`(prev + 1) % length` and `(prev - 1 + length) % length`).
- `Enter` invokes active item `action()` and closes palette.
- `Escape` dismisses palette.
- Direct shortcut jumps: `⌘1`–`⌘5` for direct page navigation, `⇧⌘T` for theme toggle.
- Auto-scroll: `itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })`.
- Mouse hover syncs `selectedIndex` on `onMouseEnter`.

### 2.6 Empty State
- Rendered when `filtered.length === 0`:
  - Glowing icon container with `bg-gradient-to-tr from-sky-500/10 to-indigo-500/20` and pulsing badge.
  - Heading: `No matching results for “{query}”`.
  - Suggestions for page, model, and action search keywords.
  - Interactive `Clear search` button.

---

## 3. Glass Context Menu Specification (`src/components/ContextMenu.jsx`)

### 3.1 Requirements Matrix
| Requirement | Design / Implementation Specification |
|---|---|
| **Backdrop & Material** | `fixed z-50 bg-white/80 dark:bg-black/80 backdrop-blur-[40px] border border-white/20 dark:border-white/10 rounded-2xl p-1.5 shadow-2xl` |
| **Animation** | `motion.div` with spring entrance: `initial={{ opacity: 0, scale: 0.92, y: -4 }}`, `animate={{ opacity: 1, scale: 1, y: 0 }}`, `exit={{ opacity: 0, scale: 0.95 }}`, `transition={{ type: 'spring', damping: 24, stiffness: 350 }}` |
| **Smart Positioning** | Clamps `x` and `y` coordinates against `window.innerWidth` and `window.innerHeight` (menu width ~200px, height ~160px) to prevent offscreen clipping. |
| **Menu Items** | 1. **View Details** (`Eye` / `Sliders` icon, opens `ModelDetailDrawer`)<br>2. **Copy Model ID** (`Copy` icon, writes `model.model_id` to clipboard, triggers toast notification)<br>3. **Dismiss** (`X` icon, closes context menu) |
| **Event Handling** | Closes on `Escape` key, click outside (`window.addEventListener('pointerdown', ...)`), or clicking any menu item. |

### 3.2 Integration with Model Table (`Reliability.jsx`)
In `src/pages/Reliability.jsx`:
- Add state: `const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, model: null });`
- Attach right-click handler on model `<tr>`:
  ```jsx
  onContextMenu={(e) => {
    e.preventDefault();
    setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, model });
  }}
  ```
- Render ContextMenu component conditionally or with AnimatePresence at the bottom of `Reliability.jsx`.

---

## 4. Skeleton Loading Integration (`src/components/Skeleton.jsx`)

### 4.1 Existing Skeleton Exports
In `src/components/Skeleton.jsx`:
1. `Skeleton({ w, h, className, style })`: Shimmer bar with `before:animate-[shimmer_1.5s_infinite]`.
2. `SkeletonCard({ className })`: Full KPI card placeholder with title, icon, value, and footer skeletons.
3. `SkeletonBlock({ children, loading, rows, skeleton })`: Container wrapper that renders shimmer rows when `loading=true` and `children` when `loading=false`.

### 4.2 Integration Targets
1. **`Reliability.jsx`**:
   - Import `{ SkeletonBlock, SkeletonCard }` from `../components/Skeleton`.
   - KPI metric cards: Render `SkeletonCard` while `!summary && !recoveryError`.
   - Model table: Wrap table body with `<SkeletonBlock loading={!models.length && !recoveryError} rows={5}>`.
2. **`Finance.jsx`**:
   - Import `{ SkeletonBlock, SkeletonCard }` from `../components/Skeleton`.
   - KPI metric cards: Render `SkeletonCard` while `loading || !financeData`.
   - Tables (P&L breakdown, Asset inventory, Payouts): Wrap table content with `<SkeletonBlock loading={loading || !financeData} rows={5}>`.

---

## 5. Existing Test Coverage Analysis

| Test File | Test Count | Key Features Covered |
|---|---|---|
| `src/components/CommandPalette.test.jsx` | 13 | Rendering, category headers, filtering (title, sub, keywords), clear button, keyboard arrow navigation, hover selection, Enter execution, click execution, Esc closing, direct ⌘1-⌘5 shortcuts, theme toggle ⇧⌘T, empty state illustration, scrollIntoView. |
| `src/components/Layout.test.jsx` | 4 | Layout routes, mobile nav drawer, ambient mesh cross-fade, Ctrl+K / Cmd+K toggle, Topbar quick search button. |
| `src/pages/Reliability.test.jsx` | 7 | Loading/empty state, REST recovery failure, SSE auth-required / reconnect, Arm/disarm transitions, unknown outcome alert, model tab & search filtering, model detail drawer opening, severity filtering & SSE events. |
| `src/pages/Finance.test.jsx` | 2 | P&L overview KPIs, currency toggle (USD/IDR), tab navigation (Overview, Assets, Payouts). |
| `src/components/ModelDetailDrawer.test.jsx` | 14 | Model economics, close button/backdrop, manual ask price submission, trigger % submission, swipe gesture dismissal, Escape key dismissal. |
| `src/components/Sidebar.test.jsx` | 10 | Route navigation, active link styling, swipe gesture closing, Escape key closing. |
| **Total Test Suite** | **173 tests** | **All 24 test suites pass.** |

---

## 6. Implementation Checklist & Verification Strategy

1. **Build & Lint Verification**:
   - `npm run build` must produce clean bundle without warnings/errors.
   - `npx vitest run` must pass all 173+ tests including newly added test cases.
2. **Visual & Interaction Verification**:
   - Spotlight search operates with 4 categorized sections, keyboard shortcuts, spring animations, and empty state.
   - Right-clicking any model table row in `Reliability.jsx` displays the Glass Context Menu at cursor coordinates with View Details, Copy Model ID, and Dismiss.
   - During initial data loading in `Reliability.jsx` and `Finance.jsx`, shimmering `SkeletonCard` and `SkeletonBlock` appear smoothly with no layout jitter or unstyled text.
