# Handoff Report — Layout, Sidebar, and Topbar Specification Mining for iPad Split View

## 1. Observation
- Inspected `frontend/src/components/Layout.jsx`:
  - Outer container: `<div className="layout min-h-screen text-[var(--text-body)] flex flex-col font-sans relative overflow-x-hidden transition-colors duration-500">` (line 38)
  - Sidebar mounting: `<Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />` (line 111)
  - Main content column: `<div className="flex-1 flex flex-col lg:pl-64 min-w-0 transition-all duration-300">` (line 114)
  - Keyboard listener: captures `(e.metaKey || e.ctrlKey) && e.key === 'k'` to toggle `searchOpen` (lines 19-25)
- Inspected `frontend/src/components/Sidebar.jsx`:
  - Backdrop: `<motion.div ... className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden cursor-pointer" />` (line 67)
  - Aside container: `<motion.aside className="sidebar ios-sidebar fixed top-0 bottom-0 left-0 z-50 lg:z-30 w-64 flex flex-col touch-pan-y ... animate={{ x: isOpen ? 0 : '-100%' }}" />` (lines 72-78)
  - Header close button: `<button ... className="... lg:hidden" aria-label="Close menu"><X size={16} /></button>` (lines 100-106)
  - Swipe helper: `export function isSidebarSwipeClose(info)` with thresholds `(info?.offset?.x ?? 0) < -80 || (info?.velocity?.x ?? 0) < -300` (lines 29-31)
- Inspected `frontend/src/components/Topbar.jsx`:
  - Hamburger toggle button: `<button onClick={onToggleSidebar} className="menu-btn lg:hidden ... aria-label="Menu"><Menu size={18} /></button>` (lines 58-64)
  - Segmented desktop tabs: `<nav aria-label="Topbar Tabs" className="hidden lg:flex ios-tab-bar">` (line 81)
- Inspected `frontend/src/index.css`:
  - Lines 859-873: `@media (min-width: 1024px) { .ios-sidebar, .sidebar { transform: none !important; position: fixed !important; top: 0; bottom: 0; left: 0; width: 16rem !important; pointer-events: auto !important; visibility: visible !important; z-index: 30; } }`
- Verified Test Suite & Build:
  - `npm run build` exits 0 (dist generated cleanly in 15.42s).
  - Vitest test suite runs 18 test files (including `Layout.test.jsx`, `Sidebar.test.jsx`, `App.test.jsx`, `StressAdversarial.test.jsx`), all passing.

## 2. Logic Chain
1. **Responsive Split View Requirement**: Apple iPad Split View and desktop displays (viewport width >= 1024px / Tailwind `lg`) require a persistent side-by-side two-column presentation where the sidebar occupies a fixed width (`w-64` / `16rem`) and the main workspace flexibly fills the remaining viewport (`flex-1`).
2. **Mobile Drawer Requirement**: Mobile and compact tablet viewports (< 1024px) require an off-canvas drawer that slides over content from `-100%` to `0%` upon clicking the Topbar hamburger button, with an interactive backdrop blur overlay (`bg-black/70`), swipe-to-close touch gestures, and Escape key dismissal.
3. **Component Interaction & State**:
   - On `< lg`: `sidebarOpen` state in `Layout.jsx` drives drawer visibility. Clicking hamburger toggles state; clicking backdrop/close button/nav item or swiping left dismisses the drawer.
   - On `>= lg`: Sidebar is persistently visible via CSS and `lg:pointer-events-auto`. The mobile backdrop, hamburger button, and close `X` button are cleanly suppressed via `lg:hidden`.
4. **Layout Flex Direction**: Setting `lg:flex-row` on `Layout.jsx`'s outer container establishes the master horizontal flex context on desktop/iPad landscape while retaining `flex-col` on mobile.

## 3. Caveats
- No code was modified during this survey (Spec Miner role is read-only).
- Framer Motion inline style `transform: translateX(-100%)` on desktop is currently overridden by CSS `@media (min-width: 1024px) { .ios-sidebar { transform: none !important; } }`. Any refactoring to pure Tailwind classes without `!important` should ensure inline motion styles do not hide the sidebar when `isOpen === false` on desktop.

## 4. Conclusion
The Layout, Sidebar, and Topbar components are fully mapped and characterized. All responsive classes, state mechanics, transitions, gesture boundaries, and test impacts have been documented in `report.md`. The design is ready for implementation or subsequent worker stages.

## 5. Verification Method
1. Inspect report: `view_file` on `c:\Users\faizz\upstream-dashboard\.agents\survey_layout_1\report.md`.
2. Inspect layout source: `view_file` on `c:\Users\faizz\upstream-dashboard\frontend\src\components\Layout.jsx`, `Sidebar.jsx`, `Topbar.jsx`.
3. Run test suite:
   ```bash
   cd frontend
   npx vitest run
   ```
4. Run production build:
   ```bash
   cd frontend
   npm run build
   ```
