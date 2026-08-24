# Codebase Survey & Analysis: Skeleton Loading, Glass Context Menu & Layout System

**Survey Agent**: `survey_explorer_r1_1`  
**Date**: 2026-08-23  
**Status**: Complete  
**Target Codebase**: `c:\Users\faizz\upstream-dashboard\frontend`

---

## 1. Executive Summary

This survey provides a comprehensive architectural and code-level investigation of the frontend codebase for:
1. **R1: Skeleton Loading Integration** into `src/pages/Reliability.jsx` and `src/pages/Finance.jsx` using `SkeletonCard` and `SkeletonBlock` from `src/components/Skeleton.jsx`.
2. **R2: Glass Context Menu Component** (`src/components/ContextMenu.jsx`) featuring VisionOS/iOS 26 glass material (`backdrop-filter: blur(40px)`), Framer Motion spring physics entrance, smart viewport positioning, Escape/outside click dismissal, and integration with model inventory rows in `src/pages/Reliability.jsx`.
3. **Responsive iPad Split View & Layout System** in `src/components/Layout.jsx`, `src/components/Sidebar.jsx`, and `src/components/Topbar.jsx`.
4. **Test Suite Analysis**: Verification of all 24 existing test suites (173 tests passing) and test impact analysis for new features.

---

## 2. Component Inventory & Existing Implementation Details

### 2.1 `src/components/Skeleton.jsx`
- **Location**: `src/components/Skeleton.jsx` (44 lines)
- **Exports**:
  - `Skeleton({ w = '100%', h = 14, className = '', style = {} })`: Shimmer bar animated via `@keyframes shimmer` (1.5s infinite linear sweep).
  - `SkeletonCard({ className = '' })`: iOS glass card wrapper (`ios-glass-card p-4 space-y-3`) with header (40% width + 24x24 box), body value (70% width, h=28), and footer divider with two metric pills (30% and 25% widths).
  - `SkeletonBlock({ children, loading, rows = 4, skeleton })`: Conditional wrapper. When `loading=true`, renders `<div role="status" aria-label="Loading" className="space-y-3 py-2">` with `rows` rows of 3-column placeholder bars (55%, 25%, 15%). When `loading=false`, renders `children`.

### 2.2 `src/pages/Reliability.jsx`
- **Location**: `src/pages/Reliability.jsx` (631 lines)
- **Current State**:
  - State variables: `summary` (null initially), `models` (empty array initially), `cycles`, `events`, `filter`, `activeTab`, `selectedModel`, `transition`, `recoveryError`.
  - KPI Cards (lines 330-358): 4 `KpiCard` components for "Status Layanan Daemon", "Heartbeat & Latensi", "Cakupan Model Aktif", "Sinkronisasi Database".
  - Model Inventory Snapshot (lines 362-481): Table inside `rel-table-wrap overflow-x-auto max-h-[480px]`.
  - Empty state: `<p className="empty py-12 text-center text-sm text-[var(--text-sub)] font-sans">No model snapshot is available yet.</p>`.
- **Target Changes**:
  1. Import `{ SkeletonBlock, SkeletonCard }` from `../components/Skeleton`.
  2. In KPI Section (lines 330-358): When `!summary && !models.length` (or `loading` state), render 4 `<SkeletonCard />` components.
  3. In Model Table Section (lines 412-475): Wrap table in `<SkeletonBlock loading={!summary && !models.length} rows={5}>...</SkeletonBlock>`.
  4. Context Menu Integration:
     - Add `contextMenu` state: `{ isOpen: false, x: 0, y: 0, model: null }`.
     - Attach `onContextMenu` to `<tr>` rows:
       ```jsx
       onContextMenu={(e) => {
         e.preventDefault();
         setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, model });
       }}
       ```
     - Wire `ContextMenu` props: `isOpen={contextMenu.isOpen}`, `position={{ x: contextMenu.x, y: contextMenu.y }}`, `target={contextMenu.model}`, `onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))}`, `onViewDetails={(m) => setSelectedModel(m)}`, `onCopyId={(m) => navigator.clipboard?.writeText(m.model_id)}`.

### 2.3 `src/pages/Finance.jsx`
- **Location**: `src/pages/Finance.jsx` (396 lines)
- **Current State**:
  - Uses `useApi('/api/finance', 30000)` which provides `{ data: financeData, loading, reload }`.
  - Uses `useApi('/api/payouts', 30000)` which provides `{ data: payoutsData, reload: reloadPayouts }`.
  - KPI Cards (lines 131-164): 4 `KpiCard` components for Net Profit, Payouts, Capex, Impairment.
  - Tab 1 Overview (lines 187-264): Ringkasan P&L cashflow cards.
  - Tab 2 Assets (lines 266-350): Asset inventory table.
  - Tab 3 Payouts (lines 352-392): Payouts and withdrawals table.
- **Target Changes**:
  1. Import `{ SkeletonBlock, SkeletonCard }` from `../components/Skeleton`.
  2. In KPI Section (lines 131-164): When `loading || !financeData`, render 4 `<SkeletonCard />` components.
  3. In Assets Table Section (lines 294-350): Wrap table container with `<SkeletonBlock loading={loading || !financeData} rows={5}>...</SkeletonBlock>`.
  4. In Payouts Table Section (lines 353-392): Wrap table container with `<SkeletonBlock loading={loading || !payoutsData} rows={5}>...</SkeletonBlock>`.

### 2.4 `src/components/ContextMenu.jsx` (New Component Design)
- **File**: `src/components/ContextMenu.jsx`
- **Specs & Architecture**:
  - **Props**:
    - `isOpen`: boolean
    - `position`: `{ x: number, y: number }`
    - `target`: any object (e.g. `model`)
    - `onClose`: `() => void`
    - `onViewDetails`: `(target) => void`
    - `onCopyId`: `(target) => void`
  - **Glass Styling**:
    - Panel: `fixed z-50 min-w-[200px] p-1.5 rounded-2xl border border-white/20 dark:border-white/10 bg-white/75 dark:bg-zinc-900/80 shadow-2xl backdrop-blur-[40px] text-zinc-800 dark:text-zinc-100`
    - Items: `flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-left`
  - **Animation (Framer Motion)**:
    - `initial={{ opacity: 0, scale: 0.9, y: -4 }}`
    - `animate={{ opacity: 1, scale: 1, y: 0 }}`
    - `exit={{ opacity: 0, scale: 0.92, y: -2 }}`
    - `transition={{ type: 'spring', damping: 25, stiffness: 350 }}`
  - **Smart Viewport Positioning**:
    ```js
    const getAdjustedPosition = (x, y) => {
      const menuWidth = 220;
      const menuHeight = 160;
      const padding = 16;
      let left = x;
      let top = y;
      if (typeof window !== 'undefined') {
        if (left + menuWidth > window.innerWidth - padding) {
          left = Math.max(padding, window.innerWidth - menuWidth - padding);
        }
        if (top + menuHeight > window.innerHeight - padding) {
          top = Math.max(padding, window.innerHeight - menuHeight - padding);
        }
      }
      return { left, top };
    };
    ```
  - **Dismissal**:
    - Escape key handler via `useEffect`.
    - Transparent backdrop overlay `<div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />`.

---

## 3. Responsive Layout & Split View Architecture

### 3.1 `src/components/Layout.jsx`
- Outer wrapper: `div.layout` — Add `lg:flex lg:flex-row` for split-view container hierarchy.
- Sidebar component: `<Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />`
- Content wrapper: `<div className="flex-1 flex flex-col lg:pl-64 min-w-0 transition-all duration-300">`
- Topbar: `<Topbar onOpenSearch={() => setSearchOpen(true)} onToggleSidebar={toggleSidebar} />`

### 3.2 `src/components/Sidebar.jsx`
- Mobile backdrop: `<motion.div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden cursor-pointer" ... />`
- Aside styling: `fixed top-0 bottom-0 left-0 z-50 lg:z-30 w-64 flex flex-col ...`
- Large viewport (`lg:`): `lg:relative lg:translate-x-0 lg:flex lg:pointer-events-auto` ensuring desktop persistent sidebar is always visible and interactive without drawer toggle.

### 3.3 `src/components/Topbar.jsx`
- Hamburger menu button: `className="menu-btn lg:hidden ..."` — Hidden on `lg:` viewports.

---

## 4. Test Suite Impact & Verification Strategy

### 4.1 Existing Test Suite Status
- Total test files: **24 passed**
- Total tests: **173 passed**
- Duration: ~75s
- Coverage threshold: Lines 80%, Functions 80%, Branches 70%, Statements 80%.

### 4.2 Impact Matrix

| Component / File | Changes | Impact on Existing Tests | Recommendation |
|---|---|---|---|
| `Reliability.jsx` | Skeletons on `!summary`, Context Menu on `<tr>` | `Reliability.test.jsx` tests `shows loading/empty state` where `api.summary` returns a pending promise. `SkeletonBlock` and `SkeletonCard` will render with `role="status"` and `aria-label="Loading"`. | Verify `Reliability.test.jsx` passes. Add tests for ContextMenu right-click, Copy ID, and View Details. |
| `Finance.jsx` | Skeletons on `loading` | `Finance.test.jsx` mocks `loading: false`. Table content continues to render directly when `loading: false`. | Verify `Finance.test.jsx` passes. Add test verifying `SkeletonBlock` and `SkeletonCard` render when `loading: true`. |
| `ContextMenu.jsx` | New file | None (new component). | Create `src/components/ContextMenu.test.jsx` with full unit test coverage. |
| `Layout.jsx` / `Sidebar.jsx` | Layout styling enhancements | `Layout.test.jsx` and `Sidebar.test.jsx` test navigation, backdrop, and menu toggle. | Verify both suites continue to pass 100%. |

---

## 5. Proposed Implementation Files & Code Structure

### 5.1 `src/components/ContextMenu.jsx`
```jsx
import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, Copy, X } from 'lucide-react';

export function calculatePosition(x, y, windowWidth = 1024, windowHeight = 768) {
  const menuWidth = 200;
  const menuHeight = 140;
  const padding = 12;

  let left = x;
  let top = y;

  if (left + menuWidth > windowWidth - padding) {
    left = Math.max(padding, windowWidth - menuWidth - padding);
  }
  if (top + menuHeight > windowHeight - padding) {
    top = Math.max(padding, windowHeight - menuHeight - padding);
  }

  return { left, top };
}

export default function ContextMenu({
  isOpen = false,
  position = { x: 0, y: 0 },
  target = null,
  onClose,
  onViewDetails,
  onCopyId,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !target) return null;

  const { left, top } = calculatePosition(
    position.x,
    position.y,
    typeof window !== 'undefined' ? window.innerWidth : 1024,
    typeof window !== 'undefined' ? window.innerHeight : 768
  );

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-transparent"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose?.();
        }}
      />
      <motion.div
        ref={menuRef}
        role="menu"
        aria-label="Context Menu"
        initial={{ opacity: 0, scale: 0.9, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -2 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        style={{ top, left }}
        className="fixed z-50 min-w-[200px] p-1.5 rounded-2xl border border-white/20 dark:border-white/10 bg-white/80 dark:bg-zinc-900/85 shadow-2xl backdrop-blur-[40px] text-zinc-800 dark:text-zinc-100 font-sans text-xs select-none"
      >
        <div className="px-3 py-1.5 font-mono text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500 border-b border-black/5 dark:border-white/10 truncate">
          {target.model_id || target.id || 'Model Actions'}
        </div>
        <div className="py-1 space-y-0.5">
          <button
            role="menuitem"
            onClick={() => {
              onViewDetails?.(target);
              onClose?.();
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-left cursor-pointer text-zinc-900 dark:text-zinc-100"
          >
            <Eye size={14} className="text-sky-500" />
            <span>View Details</span>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onCopyId?.(target);
              if (navigator.clipboard && target.model_id) {
                navigator.clipboard.writeText(target.model_id);
              }
              onClose?.();
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-left cursor-pointer text-zinc-900 dark:text-zinc-100"
          >
            <Copy size={14} className="text-indigo-500" />
            <span>Copy Model ID</span>
          </button>
          <div className="my-1 border-t border-black/5 dark:border-white/10" />
          <button
            role="menuitem"
            onClick={onClose}
            className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-left cursor-pointer"
          >
            <X size={14} />
            <span>Dismiss</span>
          </button>
        </div>
      </motion.div>
    </>
  );
}
```

---

## 6. Next Steps for Implementation Team
1. Create `src/components/ContextMenu.jsx` and unit tests in `src/components/ContextMenu.test.jsx`.
2. Update `src/pages/Reliability.jsx` to incorporate `SkeletonCard`, `SkeletonBlock`, and `ContextMenu`.
3. Update `src/pages/Finance.jsx` to incorporate `SkeletonCard` and `SkeletonBlock`.
4. Run `npm test` and `npm run build` to verify clean build and 100% test pass rate.
