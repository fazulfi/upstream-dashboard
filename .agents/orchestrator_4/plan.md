# Execution Plan: iOS Loading States + Glass Context Menu

## Objective
Implement two native iOS 26 interaction patterns for the Upstream Dashboard:
1. **iOS-Style Skeleton Loading States**:
   - `SkeletonLoader.jsx` with shimmer animation / keyframe
   - Variants: `SkeletonKpiCard`, `SkeletonRow`, `SkeletonPage` (and base primitives)
   - Integration into `Reliability.jsx` and `Finance.jsx` when `useApi` is loading
   - Light and dark mode support conforming to iOS glass aesthetic
2. **Glass Context Menu**:
   - `ContextMenu.jsx` triggered on right-click on any `.ios-glass-card` element
   - Styled as `.ios-sheet` glass panel
   - Contextual actions
   - Framer Motion spring entrance animation (`scale: 0.8 -> 1`, opacity, spring physics)
   - Click outside & Escape key dismissal
   - Smart screen edge positioning (viewport boundary detection / auto flip/clamp)
3. **Verification & Hardening**:
   - Vitest unit & integration test suite passing
   - `npm run build` passing
   - Forensic integrity audit passing

## Milestone Decomposition
- **Survey Phase**: Map existing frontend directory structure, style system (Tailwind / CSS modules / global CSS / Framer Motion / Lucide icons), `Reliability.jsx`, `Finance.jsx`, `useApi.js`, existing context menus, cards, and test runner configurations.
- **Milestone 1**: Implement `SkeletonLoader.jsx` (and variants) & integrate into `Reliability.jsx` and `Finance.jsx`.
- **Milestone 2**: Implement `ContextMenu.jsx`, context menu provider/hook or global event listener for `.ios-glass-card`, smart positioning, spring animation, and keyboard/click dismissal.
- **Milestone 3**: Test suite additions, build execution, challenger stress-tests, reviewer approval, and forensic integrity audit.
