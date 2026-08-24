# Handoff Report: Milestone 1 Layout.jsx Strategy Investigation

## 1. Observation
- `frontend/src/components/Layout.jsx` line 38 defines the outer layout container as:
  `<div className="layout min-h-screen text-[var(--text-body)] flex flex-col font-sans relative overflow-x-hidden transition-colors duration-500">`
  which lacks `lg:flex-row`.
- `frontend/src/components/Layout.jsx` line 114 defines the content wrapper as:
  `<div className="flex-1 flex flex-col lg:pl-64 min-w-0 transition-all duration-300">`
  which utilizes `lg:pl-64` padding offset for a fixed sidebar.
- `frontend/src/components/Sidebar.jsx` line 67 and 102 define backdrop and close button with `lg:hidden`.
- `frontend/src/components/Topbar.jsx` line 60 defines hamburger menu button with `lg:hidden`.
- Existing tests in `src/components/Layout.test.jsx` pass (4 tests, 0 failures).

## 2. Logic Chain
1. To achieve the iPad Split View layout on `>= 1024px` screens (`lg`), the outer container must switch from vertical stacking (`flex-col`) to horizontal split flex (`lg:flex-row`).
2. When the outer container is `flex flex-col lg:flex-row`, the persistent sidebar column acts as the first child taking `lg:w-64 lg:flex-shrink-0`.
3. In a flex row layout where the sidebar occupies 256px (`w-64`) of flow width, the main content container expands via `flex-1` (or `lg:flex-1`) and `min-w-0`.
4. Retaining `lg:pl-64` on the main container would produce a double-offset bug (512px total offset). Therefore, `lg:pl-64` must be removed from the main content container div in `Layout.jsx`.
5. Mobile overlay behavior (`< lg`) remains fully preserved because `sidebarOpen` state, `toggleSidebar`, Escape key dismiss, backdrop click, link navigation dismiss, and touch swipe gestures remain intact and active on `< lg`.

## 3. Caveats
- `Sidebar.jsx` uses Framer Motion `animate={{ x: isOpen ? 0 : '-100%' }}`. The Worker must ensure that `Sidebar.jsx` and `index.css` desktop rules (`transform: none !important` or `lg:translate-x-0`) prevent Framer Motion from hiding the sidebar when `isOpen` is `false` on desktop screens.
- `min-w-0` on the main content wrapper is required to avoid flex item blowout with wide tables or charts.

## 4. Conclusion
The implementation strategy for `Layout.jsx` is clear, scoped, and verified:
1. Update outer div class in `Layout.jsx` from `flex flex-col` to `flex flex-col lg:flex-row`.
2. Update main content div in `Layout.jsx` from `flex-1 flex flex-col lg:pl-64 min-w-0 transition-all duration-300` to `flex-1 flex flex-col min-w-0 transition-all duration-300`.
3. Preserve all existing state, handlers, ambient mesh layers, Topbar header, and CommandPalette integrations.

## 5. Verification Method
1. Run component unit tests:
   ```bash
   npx vitest run src/components/Layout.test.jsx
   npx vitest run src/components/Sidebar.test.jsx
   ```
2. Run build verification:
   ```bash
   npm run build
   ```
3. Inspect DOM layout in browser/jsdom at screen widths `< 1024px` (stacked + drawer overlay) and `>= 1024px` (split view flex row).
