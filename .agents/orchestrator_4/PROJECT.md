# Project: iOS Loading States + Glass Context Menu

## Architecture
The Upstream Dashboard frontend is built on React 19, Motion (Framer Motion `motion/react`), Tailwind CSS v4, and Lucide React icons, styled with an iOS 26 glassmorphism aesthetic.
This project implements two core native iOS interaction patterns:
1. **iOS-Style Skeleton Loading States**:
   - `src/components/SkeletonLoader.jsx`: Base shimmer loader + specialized variants (`SkeletonKpiCard`, `SkeletonRow`, `SkeletonPage`).
   - Animated shimmer effect via `@keyframes shimmer` defined in `src/index.css` with subtle translucent gradients compatible with light and dark mode.
   - Integration into `src/pages/Reliability.jsx` and `src/pages/Finance.jsx` (and child components) to seamlessly display skeleton loading states while `useApi` / api fetching is in progress.
2. **Glass Context Menu**:
   - `src/components/ContextMenu.jsx`: Global or contextual right-click handler attached to `.ios-glass-card` elements.
   - `.ios-sheet` glass panel styling with `.ios-menu-item` action items.
   - Framer Motion spring animation: `initial={{ scale: 0.8, opacity: 0 }}` -> `animate={{ scale: 1, opacity: 1 }}`.
   - Smart edge positioning with viewport boundary clamping (`calculateMenuPosition`).
   - Dismissal on click outside, Escape key press, or menu item selection.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Shimmer Keyframe & CSS Classes | Add `@keyframes shimmer`, `.animate-shimmer`, `.ios-menu-item` in `src/index.css` supporting light & dark modes | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Base SkeletonLoader & Variants | Create `src/components/SkeletonLoader.jsx` exporting `SkeletonLoader`, `SkeletonKpiCard`, `SkeletonRow`, `SkeletonPage` | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Skeletons in Reliability.jsx | Replace empty/spinner states in `Reliability.jsx` with `SkeletonPage` / `SkeletonKpiCard` / `SkeletonRow` when loading | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Skeletons in Finance.jsx | Replace loading state in `Finance.jsx` with `SkeletonPage` / `SkeletonKpiCard` / `SkeletonRow` when `useApi` is loading | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Glass ContextMenu Component | Create `src/components/ContextMenu.jsx` with `.ios-sheet` styling, contextual actions ("View Details", "Copy Model ID", "Dismiss"), and `.ios-menu-item` styling | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Motion Spring & Smart Positioning | Framer Motion `scale: 0.8 -> 1` spring entrance and collision detection to clamp position within viewport | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Global / Glass Card Trigger & Dismissal | Right-click event listener on `.ios-glass-card`, click outside, and Escape key dismissal | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Unit & Integration Test Suite | Comprehensive Vitest tests for SkeletonLoader, ContextMenu, Reliability & Finance loading states | M3 | Acceptance Criteria |
| 9 | Build & Adversarial Hardening | Verify `npm run build` cleanly passes and run adversarial edge-case verifications | M3 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Skeleton Loading States | Features 1, 2, 3, 4: `index.css`, `SkeletonLoader.jsx`, `Reliability.jsx`, `Finance.jsx` | none | PLANNED |
| 2 | Glass Context Menu | Features 5, 6, 7: `ContextMenu.jsx`, integration in `App.jsx` / layout, styling | none | PLANNED |
| 3 | Verification, Hardening & Audit | Features 8, 9: Vitest test suites, build validation, Reviewers, Challengers, Forensic Auditor | M1, M2 | PLANNED |

## Interface Contracts
### `SkeletonLoader.jsx` Component API
- `SkeletonLoader`: Props `{ className, width, height, rounded, variant }`
- `SkeletonKpiCard`: Props `{ count = 4, className }`
- `SkeletonRow`: Props `{ count = 5, columns = 4, className }`
- `SkeletonPage`: Props `{ variant = 'default', className }` (renders header, KPI grid, and table/chart skeleton)

### `ContextMenu.jsx` Component API
- Internal / Global State: `{ isOpen, position: { x, y }, targetData, closeMenu }`
- Trigger: Listens to `contextmenu` events on elements matching or containing `.ios-glass-card`.
- Positioning: Clamps `x` and `y` against `window.innerWidth` and `window.innerHeight` with margin offset (e.g. 16px).
- Actions: Callback handlers for menu items (`onSelect`, `onClose`).

## Code Layout
- `src/index.css`: `@keyframes shimmer`, `.ios-menu-item`, light & dark theme styling
- `src/components/SkeletonLoader.jsx`: SkeletonLoader and exported variants
- `src/components/ContextMenu.jsx`: Glass Context Menu component and hook / trigger provider
- `src/pages/Reliability.jsx`: Integrated skeleton loader on loading state
- `src/pages/Finance.jsx`: Integrated skeleton loader on loading state
- `src/App.jsx`: ContextMenu provider / global instance mount point
- `src/__tests__/SkeletonLoader.test.jsx`: Unit and component tests for SkeletonLoader
- `src/__tests__/ContextMenu.test.jsx`: Unit and interaction tests for ContextMenu
