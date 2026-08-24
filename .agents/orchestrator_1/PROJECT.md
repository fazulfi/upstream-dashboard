# Project: iOS Loading States + Glass Context Menu

## Architecture
The application is an iOS 26-styled Upstream Dashboard built with React 18, React Router, Framer Motion, and Tailwind CSS.
- **Loading State Paradigm**: Transition from static fallbacks/spinners to Apple HIG Shimmer Skeletons (`SkeletonCard` for KPI grids, `SkeletonBlock` for data tables).
- **Context Interaction Paradigm**: Native desktop/iPad feel via Glass Context Menu (`ContextMenu.jsx`) attached to data rows with blurred backdrop (`blur(40px)`), spring physics, and smart boundary positioning.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Skeleton Loading Integration (Reliability) | Import `{ SkeletonBlock, SkeletonCard }`, replace KPI loading with `SkeletonCard`, wrap model inventory table with `<SkeletonBlock loading={!summary} rows={5}>` | M1 | ORIGINAL_REQUEST.md + Dispatch Clarification |
| 2 | Skeleton Loading Integration (Finance) | Import `{ SkeletonBlock, SkeletonCard }`, replace KPI loading with `SkeletonCard`, wrap tables with `<SkeletonBlock loading={loading} rows={5}>` | M1 | ORIGINAL_REQUEST.md + Dispatch Clarification |
| 3 | Glass Context Menu Component | Create `src/components/ContextMenu.jsx` with `blur(40px)`, items (View Details, Copy Model ID, Dismiss), spring entrance, smart positioning, escape/outside close | M1 | ORIGINAL_REQUEST.md + Dispatch Clarification |
| 4 | Context Menu Integration in Reliability | Wire `onContextMenu` on model table rows in `Reliability.jsx` to open `ContextMenu`, bind actions to model drawer and clipboard | M1 | ORIGINAL_REQUEST.md + Dispatch Clarification |
| 5 | Context Menu Unit Tests | Create `src/components/ContextMenu.test.jsx` testing rendering, click outside, Escape key, item actions, clipboard copy | M1 | Vitest Spec |
| 6 | Full Build & Test Verification | Ensure `npm run build` and `npx vitest run` pass 100% with no regressions across all 25+ suites | M1 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | iOS Loading States & Glass Context Menu | Skeleton integration in Reliability & Finance, ContextMenu creation & wiring, unit tests, full build & vitest verification | Survey complete | IN_PROGRESS |

## Interface Contracts
### ContextMenu (`src/components/ContextMenu.jsx`)
```typescript
interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  onClose: () => void;
  model?: {
    model_id: string;
    name?: string;
    status?: string;
    [key: string]: any;
  } | null;
  onViewDetails?: (model: any) => void;
}
```

### Skeleton (`src/components/Skeleton.jsx`)
```typescript
export function Skeleton({ w, h, className, style });
export function SkeletonCard({ className });
export function SkeletonBlock({ children, loading, rows, skeleton });
```

## Code Layout
- `src/components/Skeleton.jsx` — Existing shimmer primitives (`Skeleton`, `SkeletonCard`, `SkeletonBlock`)
- `src/components/ContextMenu.jsx` — Floating glass context menu component
- `src/components/ContextMenu.test.jsx` — ContextMenu unit tests
- `src/pages/Reliability.jsx` — Reliability monitoring page with SkeletonCard, SkeletonBlock, and ContextMenu integration
- `src/pages/Finance.jsx` — Financial overview page with SkeletonCard and SkeletonBlock integration
- `src/index.css` — iOS 26 glass and button styling
