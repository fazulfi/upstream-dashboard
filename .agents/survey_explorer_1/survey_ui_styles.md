# Frontend UI, Styling, & Architecture Survey Report

**Project:** iOS Loading States + Glass Context Menu  
**Author:** Survey Explorer 1  
**Date:** 2026-08-23  
**Target Codebase:** `c:\Users\faizz\upstream-dashboard\frontend`

---

## Executive Summary

The frontend is a high-performance React 19 Single Page Application built with Vite 8, Tailwind CSS v4, Motion (Framer Motion) v13, Lucide React icons, and TanStack Table. It implements Apple iOS 26 / VisionOS spatial liquid glass aesthetics with full dark and light mode themes.

Currently, data loading in `Reliability.jsx` and `Finance.jsx` relies on basic fallback text/placeholders or empty states. No dedicated context menu component exists. This survey documents the existing UI architecture, styles, keyframes, components, and integration points for building:
1. **iOS-Style Skeleton Loading States (`SkeletonLoader.jsx`)**
2. **Glass Context Menu (`ContextMenu.jsx`)**

---

## 1. Package & Dependency Matrix

From `frontend/package.json`:

| Package | Version | Purpose | Usage / Import Pattern |
|---|---|---|---|
| `react` / `react-dom` | `^19.2.8` | React 19 runtime | `import React from 'react';` |
| `tailwindcss` | `^4.3.3` | Tailwind v4 engine | `@import "tailwindcss";` in `src/index.css` |
| `@tailwindcss/vite` | `^4.3.3` | Vite plugin for Tailwind v4 | Configured in `vite.config.js` |
| `motion` | `^13.1.1` | Framer Motion (v13 React) | `import { motion, AnimatePresence } from 'motion/react';` |
| `lucide-react` | `^1.31.0` | Apple/Modern icons | `import { Activity, Search, ... } from 'lucide-react';` |
| `react-router-dom` | `^7.18.2` | Client-side routing | `HashRouter`, `Routes`, `Route`, `NavLink`, `useLocation` |
| `@tanstack/react-table`| `^9.1.2` | Data table state engine | `useTable`, `createSortedRowModel`, etc. in `DataTable.jsx` |
| `recharts` | `^3.10.1` | Financial chart visualizer | Used in `EarningsChart.jsx` |
| `clsx` / `tailwind-merge`| `^2.1.1` / `^3.6.0` | Class composition | Utility class helpers |
| `vitest` | `^3.0.0` | Test runner | 23 test suites, 158 tests passing |

---

## 2. Theme Architecture & Color System

### 2.1 Theme Provider (`src/theme.jsx`)
- **State Management:** `ThemeContext` manages `'dark'` (default) or `'light'` mode.
- **Persistence:** Stored in `localStorage.getItem('upstream-theme')`.
- **DOM Injection:**
  - Injects CSS custom properties into `document.documentElement` (`:root`).
  - Toggles `.theme-dark` and `.theme-light` classes on `document.documentElement`.
  - Sets `document.body.style.backgroundColor`.

### 2.2 Core Color & Glass CSS Variables

| Variable | Dark Mode (`.theme-dark`) | Light Mode (`.theme-light`) | Notes |
|---|---|---|---|
| `--bg-base` | `#07090e` | `#f2f2f7` | Apple system background |
| `--card-bg` | `rgba(18, 20, 29, 0.65)` | `rgba(255, 255, 255, 0.55)` | Liquid glass base fill |
| `--card-border` | `rgba(255, 255, 255, 0.14)` | `rgba(255, 255, 255, 0.45)` | Subtle specular boundary |
| `--card-shadow` | `0 16px 40px -8px rgba(0, 0, 0, 0.65), 0 4px 12px 0 rgba(0, 0, 0, 0.4)` | `0 4px 16px -2px rgba(0, 0, 0, 0.04), 0 16px 36px -4px rgba(0, 0, 0, 0.08)` | Elevation shadow |
| `--card-highlight` | `inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.25), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.4)` | `inset 0 1px 1px 0 rgba(255, 255, 255, 0.6), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.02)` | Top edge specular bevel |
| `--nav-bg` | `rgba(12, 14, 22, 0.70)` | `rgba(255, 255, 255, 0.65)` | Sheet & topbar backdrop fill |
| `--text-title` / `--text-main` | `rgba(255, 255, 255, 0.95)` | `rgba(0, 0, 0, 0.88)` | Primary typography |
| `--text-sub` | `rgba(235, 235, 245, 0.65)` | `rgba(60, 60, 67, 0.65)` | Secondary typography |
| `--text-muted` | `rgba(235, 235, 245, 0.38)` | `rgba(60, 60, 67, 0.38)` | Muted / hint labels |
| `--accent` | `#0a84ff` (Apple Blue) | `#0071e3` | Active accents / focus rings |
| `--mesh-opacity` | `0.32` | `0.18` | Ambient background orbs |

---

## 3. Glass Styling, Borders, Shadows, and Animation Classes

### 3.1 `.ios-glass-card` (`src/index.css:166-215`)
```css
.ios-glass-card {
  background: var(--card-bg);
  backdrop-filter: blur(28px) saturate(190%) brightness(105%);
  -webkit-backdrop-filter: blur(28px) saturate(190%) brightness(105%);
  border: 1px solid var(--card-border);
  box-shadow: var(--card-shadow), var(--card-highlight);
  border-radius: 1.5rem;
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), 
              box-shadow 0.5s cubic-bezier(0.4, 0, 0.2, 1), 
              background 0.5s cubic-bezier(0.4, 0, 0.2, 1), 
              ...;
  will-change: transform, box-shadow;
}
```
**Used in:**
- `KpiCard.jsx` (Metric tiles)
- `DataTable.jsx` (TanStack grid wrapper)
- `LoginGate.jsx` (Authentication modal card)
- `PricingPage.jsx` (Market sections)
- `AutoPricing.jsx` (Control sections)
- `Finance.jsx` (Overview, Asset Inventory, Payouts)
- `Reliability.jsx` (Control Center, Model Inventory, History, Audit Stream)
- `Settings.jsx` (Config sections)

### 3.2 `.ios-sheet` (`src/index.css:748-770`)
```css
.ios-sheet {
  background: var(--nav-bg, rgba(255, 255, 255, 0.85));
  backdrop-filter: blur(40px) saturate(200%);
  -webkit-backdrop-filter: blur(40px) saturate(200%);
  border-radius: 20px;
  box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.2);
  border: 1px solid var(--card-border, rgba(0,0,0,0.1));
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}
.theme-dark .ios-sheet {
  background: var(--nav-bg, rgba(20, 20, 25, 0.85));
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.15));
  box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255, 0.1);
}
```
**Used in:**
- `CommandPalette.jsx`
- `ModelDetailDrawer.jsx`

### 3.3 Shimmer Keyframe Analysis
- Currently in `src/components/Skeleton.jsx:7`:
  `before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 dark:before:via-zinc-700/30 before:to-transparent`
- **Key finding:** `@keyframes shimmer` is NOT explicitly defined in `index.css` or `App.css`. Adding an explicit keyframe in `src/index.css` or `src/App.css`:
  ```css
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  .animate-shimmer {
    animation: shimmer 1.6s infinite cubic-bezier(0.4, 0, 0.6, 1);
  }
  ```
  ensures guaranteed cross-browser and theme shimmer sweep.

---

## 4. Framer Motion (Motion v13) Ecosystem

All animation components in this codebase import Motion from `'motion/react'`:
```javascript
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
```

### Established Spring Physics Standards:
1. **Modal / Sheet Spring:**
   `transition={{ type: 'spring', damping: 26, stiffness: 280 }}`
2. **Notification / Floating Toast Spring:**
   `transition={{ type: 'spring', stiffness: 400, damping: 25 }}`
3. **Sidebar Spring:**
   `transition={{ type: 'spring', damping: 25, stiffness: 250 }}`
4. **Context Menu Target Entrance Spec:**
   `initial={{ opacity: 0, scale: 0.8 }}`  
   `animate={{ opacity: 1, scale: 1 }}`  
   `exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.12 } }}`  
   `transition={{ type: 'spring', stiffness: 450, damping: 28 }}`

---

## 5. Existing Modal, Drawer, & Menu Patterns

1. **`ModelDetailDrawer.jsx`:**
   - Managed via React state (`selectedModel`).
   - Drag-to-dismiss gesture with `onDragEnd` and `isDrawerSwipeClose(info)`.
   - Backdrop overlay with `backdrop-blur-md` and `onClick={onClose}`.
   - Escape key event listener on `window`.

2. **`CommandPalette.jsx`:**
   - Global shortcut: `Cmd+K` / `Ctrl+K`.
   - Keyboard accessibility: ArrowUp, ArrowDown, Enter, Escape.
   - Fixed centered overlay, click-outside dismissal.

3. **`Toast.jsx`:**
   - React context provider `ToastProvider` / `useToast`.
   - `AnimatePresence` stack at `top-8 left-1/2 -translate-x-1/2`.

4. **Context Menu Status:**
   - No context menu currently exists.
   - Requirement: `ContextMenu.jsx` attached via `onContextMenu` or window-level handler intercepting right-clicks on `.ios-glass-card` elements.
   - Supports contextual actions, smart viewport boundary clamping (`x`, `y` recalculation to prevent menu going offscreen), Escape/click-outside dismissal, and keyboard accessibility.

---

## 6. Target Integration Surfaces: `Reliability.jsx` & `Finance.jsx`

### 6.1 `Reliability.jsx`
- **Data Fetching:** Combines `reliabilityApi.summary()`, `cycles()`, `events()`, `models()` in `recover()` callback, and SSE stream via `useReliabilityStream`.
- **Current Loading Behavior:** When `summary` is `null`, state evaluates fallback objects (`current = summary || {}`).
- **Integration Plan for Skeleton:**
  - Display `SkeletonPage` / `SkeletonKpiCard` / `SkeletonRow` while `loading` (e.g. before initial `recover()` resolves or when explicit `loading` flag is active).

### 6.2 `Finance.jsx`
- **Data Fetching:** Uses `useApi('/api/finance', 30000)` and `useApi('/api/payouts', 30000)`.
- **Current Loading Behavior:** Exposes `loading` boolean from `useApi`. While `loading === true`, `financeData` is null, causing KPI cards to render `'—'`.
- **Integration Plan for Skeleton:**
  - When `loading` is true, render `SkeletonKpiCard` for top metric grid, `SkeletonRow` for tables, and `SkeletonPage` layout blocks.

---

## 7. Architectural Recommendations for Implementation

1. **`SkeletonLoader.jsx` Architecture:**
   - Export named components:
     - `Skeleton` (atomic pulse/shimmer element with custom `w`, `h`, `rounded`, `className`)
     - `SkeletonKpiCard` (matches exact DOM layout and typography heights of `KpiCard.jsx`)
     - `SkeletonRow` (table row skeleton with column width props matching `Reliability` and `Finance` tables)
     - `SkeletonPage` (full page loading skeleton comprising header, 4 KPI cards, main grid panel, and table)
   - Ensure color classes support both light mode (`bg-slate-200/70`, `via-white/70`) and dark mode (`bg-zinc-800/60`, `via-zinc-700/40`).

2. **`ContextMenu.jsx` Architecture:**
   - Styled using `.ios-sheet` with `min-w-[180px]`, `rounded-2xl`, `p-1.5`, shadow, and backdrop blur.
   - Screen edge clamping: measure window `innerWidth` / `innerHeight` against menu `width` / `height` and offset position so menu stays fully inside viewport.
   - Micro-interactions: Framer motion `scale: 0.8 -> 1`, `opacity: 0 -> 1` with spring physics.
   - Menu items: `.ios-menu-item` hover styling, icons from `lucide-react`, keyboard navigation, divider lines.
   - Global or card-level right-click delegation for any `.ios-glass-card`.

---
