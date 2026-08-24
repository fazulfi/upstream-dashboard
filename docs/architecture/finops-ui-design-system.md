# Architecture Note: FinOps UI Design System & Component Spec

**Authoritative Documentation for Upstream Dashboard Web Surface (v2.0)**

---

## 1. Design Philosophy & Aesthetic Benchmarks

The Upstream Dashboard user interface is built as a high-density, low-latency **FinOps & Autonomous Pricing Control Plane**. Its visual language draws directly from the **Linear, Vercel Geist, and Stripe** engineering dashboards:

1. **Information Density with Clear Visual Hierarchy**:
   - Primary metrics use high-contrast monospace numbers (`font-mono tracking-tight`).
   - Labels and descriptors use uppercase compact micro-typography (`text-[10px] uppercase font-mono tracking-wider text-zinc-400`).
2. **Layering & Depth via Hairline Borders**:
   - Separation is achieved through hairline borders (`border border-zinc-800/80` or `border border-zinc-800 bg-zinc-900/40`) rather than heavy drop shadows.
   - Dual-theme token system (Dark default `#09090b` and Crisp Light `#fafafa`).
3. **Micro-Interactions & Motion Physics**:
   - Layout transitions and modals are orchestrated with declarative spring physics (`motion/react`).
   - Active indicators and live SSE connection status pulse continuously to give immediate visual feedback.

---

## 2. Core Primitives & Specifications

### A. Command Palette (`Ctrl+K` / `⌘K`)
- **Location**: `frontend/src/components/CommandPalette.jsx`
- **Functionality**: Global keyboard shortcut opening a floating search modal. Operators can instantly search and jump between all 5 dashboard modules, toggle light/dark modes, and trigger cache reloads without reaching for the mouse.

### B. Production Safety Guards (`SlideToConfirm`)
- **Location**: `frontend/src/components/SlideToConfirm.jsx`
- **Functionality**: Protects high-risk operations (such as Arming/Disarming the autonomous pricing daemon) with an explicit drag-to-confirm slider and confirmation modal. Prevents accidental clicks from mutating live prices on InferHub.

### C. Sonner-Style Toast Notification Manager
- **Location**: `frontend/src/components/Toast.jsx`
- **Functionality**: Lightweight, spring-animated toast alerts that slide up from the bottom right with success, error, or warning indicators. Automatically dismisses after 4 seconds.

### D. Data Table with TanStack Table v9
- **Location**: `frontend/src/components/DataTable.jsx`
- **Functionality**: High-performance tabular data grid supporting instant client-side filtering, column sorting, pagination controls, and density toggles (`compact` vs `comfortable`).

---

## 3. Information Architecture & Navigation

The navigation shell (`Sidebar.jsx` & `Topbar.jsx`) exposes 5 core functional modules:

```text
┌──────────────────────────────────────────────────────────────┐
│ Upstream App Shell                                           │
├───────────────┬──────────────────────────────────────────────┤
│ Operations    │ 1. Reliability Room (/)                      │
│               │ 2. Finance & P&L Hub (/finance)              │
├───────────────┼──────────────────────────────────────────────┤
│ Pricing       │ 3. Auto-Pricing (/auto-pricing)              │
│               │ 4. Manual & Orderbook (/pricing)             │
├───────────────┼──────────────────────────────────────────────┤
│ Platform      │ 5. Settings & Audit (/settings)              │
└───────────────┴──────────────────────────────────────────────┘
```

---

## 4. Test Coverage & Quality Verification

All components, page views, and interactive transitions are fully tested using **Vitest 3** with jsdom and React Testing Library:
- `npm test` runs 15 test suites with 65+ assertions.
- Continuous Integration (`.github/workflows/ci.yml`) enforces 100% test passage before code merge.
