# Milestone 1 Investigation Report: iPad Split View Layout (`Layout.jsx`)

**Explorer**: `m1_explorer_1`  
**Date**: 2026-08-23  
**Target Component**: `frontend/src/components/Layout.jsx`  
**Related Components**: `frontend/src/components/Sidebar.jsx`, `frontend/src/components/Topbar.jsx`, `frontend/src/index.css`  
**Status**: COMPLETE & VERIFIED

---

## 1. Executive Summary

Milestone 1 implements the Apple iPad Split View layout system, transitioning the dashboard from a mobile-first stacked/overlay layout on smaller screens (`< 1024px`) to a persistent multi-column split view layout on iPad landscape and desktop displays (`>= 1024px` / `lg:` breakpoint).

This investigation analyzed `Layout.jsx`, its relationship with `Sidebar.jsx`, `Topbar.jsx`, `index.css`, and existing Vitest test suites. Concrete implementation recommendations and exact code modifications are documented below for the implementation Worker.

---

## 2. Codebase Observations

### 2.1 Current `Layout.jsx` Architecture
- **Location**: `frontend/src/components/Layout.jsx` (134 lines)
- **Outer Container (Line 38)**:
  ```jsx
  <div className="layout min-h-screen text-[var(--text-body)] flex flex-col font-sans relative overflow-x-hidden transition-colors duration-500">
  ```
  *Observation*: Outer container is currently strictly `flex flex-col` without responsive flex direction classes (`lg:flex-row`).
- **Ambient Mesh Layers (Lines 40-108)**:
  ```jsx
  <div
    aria-hidden="true"
    className="ambient-mesh-container fixed inset-0 overflow-hidden pointer-events-none z-0"
    style={{ opacity: 'var(--mesh-opacity, 0.32)' }}
  >
  ```
  *Observation*: Positioned as `fixed inset-0 pointer-events-none z-0`. Because it uses fixed viewport positioning, changing outer layout flex directions will not distort or displace the ambient mesh refraction backgrounds.
- **Sidebar Placement (Line 111)**:
  ```jsx
  {/* Mobile Drawer & Desktop Persistent Sidebar */}
  <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
  ```
  *Observation*: Directly rendered as a child of the outer layout container.
- **Main App Content Column (Line 114)**:
  ```jsx
  {/* Main App Content Column (Offset right on desktop for persistent w-64 sidebar) */}
  <div className="flex-1 flex flex-col lg:pl-64 min-w-0 transition-all duration-300">
  ```
  *Observation*: Uses `lg:pl-64` left-padding offset designed for fixed-positioned sidebars.

### 2.2 Connected Component States & CSS
- **`Sidebar.jsx` (Lines 59-85)**:
  - Mobile Backdrop: Has `className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden cursor-pointer"`.
  - Mobile Close Button: Has `className="... lg:hidden"`.
  - Aside Element: Has `className="sidebar ios-sidebar fixed top-0 bottom-0 left-0 z-50 lg:z-30 w-64 flex flex-col touch-pan-y ..."`.
- **`Topbar.jsx` (Line 60)**:
  - Hamburger Button: Has `className="menu-btn lg:hidden ..."` for mobile opening.
- **`index.css` (Lines 893-907)**:
  - Contains media query `@media (min-width: 1024px) { .ios-sidebar, .sidebar { transform: none !important; position: fixed !important; ... } }`.

---

## 3. Detailed Component Analysis & Strategy

### 3.1 Outer Layout Div: `lg:flex lg:flex-row`
- **Requirement**: Update outer container to adopt `lg:flex lg:flex-row`.
- **Target Class**:
  `className="layout min-h-screen text-[var(--text-body)] flex flex-col lg:flex-row font-sans relative overflow-x-hidden transition-colors duration-500"`
- **Mechanism**:
  - `< 1024px` (`default`): `flex-col` keeps layout vertically stacked, allowing main content to take 100% viewport width while sidebar acts as an off-canvas drawer.
  - `>= 1024px` (`lg:`): `lg:flex-row` initiates the horizontal split view, laying out the persistent sidebar on the left and the main content workspace on the right.

### 3.2 Sidebar Container: `lg:w-64 lg:flex-shrink-0`
- **Requirement**: Persistent 256px wide left column that never shrinks.
- **Mechanism**:
  - In a flex row layout, children without `flex-shrink-0` may shrink below their intended width when space is constrained.
  - Adding `lg:w-64 lg:flex-shrink-0` ensures the sidebar maintains an exact 256px width at all times on desktop and iPad split views.

### 3.3 Main Content: `lg:flex-1` and Expansion
- **Requirement**: Main content fills all remaining horizontal space without overflow.
- **Target Class**:
  `className="flex-1 flex flex-col min-w-0 transition-all duration-300"` (or `className="flex-1 lg:flex-1 flex flex-col min-w-0 transition-all duration-300"`)
- **CRITICAL IMPLEMENTATION NOTE (Padding Offset Removal)**:
  - Current `Layout.jsx` contains `lg:pl-64` on the main container div.
  - In a flexbox split view where the sidebar is in the flex flow (`w-64`), **`lg:pl-64` MUST be removed**. Retaining `lg:pl-64` alongside a docked flex column would produce a 512px double offset.
  - `min-w-0` is vital to prevent flex child overflow caused by wide data tables and KPI cards.

### 3.4 Mobile Overlay Preservation
- **State Management**:
  - `sidebarOpen` state (`useState(false)`) and `toggleSidebar` function in `Layout.jsx` remain identical.
  - Key handlers, backdrop dismissals, swipe thresholds, and Escape key handling are fully preserved.
- **Responsive Visibility**:
  - Hamburger toggle button in Topbar remains `lg:hidden`.
  - Mobile backdrop remains `lg:hidden`.
  - Sidebar close button remains `lg:hidden`.
  - All existing mobile interaction tests continue to pass without regression.

---

## 4. Concrete Recommendations for Worker

### Recommended Code Change for `frontend/src/components/Layout.jsx`

```diff
--- a/frontend/src/components/Layout.jsx
+++ b/frontend/src/components/Layout.jsx
@@ -35,7 +35,7 @@ export default function Layout() {
   };

   return (
-    <div className="layout min-h-screen text-[var(--text-body)] flex flex-col font-sans relative overflow-x-hidden transition-colors duration-500">
+    <div className="layout min-h-screen text-[var(--text-body)] flex flex-col lg:flex-row font-sans relative overflow-x-hidden transition-colors duration-500">
       {/* ── Apple iOS 26 Spatial Ambient Mesh Gradient Refraction Wallpaper (700ms Cross-fade) ── */}
       <div
         aria-hidden="true"
@@ -111,7 +111,7 @@ export default function Layout() {
       <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

       {/* Main App Content Column (Offset right on desktop for persistent w-64 sidebar) */}
-      <div className="flex-1 flex flex-col lg:pl-64 min-w-0 transition-all duration-300">
+      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
         {/* Topbar Header */}
         <div className="sticky top-0 z-40">
           <Topbar
```

### Recommendation for `frontend/src/components/Sidebar.jsx` (Coordinated Alignment)
Ensure `Sidebar.jsx`'s `motion.aside` includes `lg:relative lg:translate-x-0 lg:flex lg:w-64 lg:flex-shrink-0 lg:h-screen lg:sticky lg:top-0` or aligns with `index.css` desktop styles to guarantee seamless split view docking.

---

## 5. Verification Plan

1. **Unit Test Execution**:
   ```bash
   npx vitest run src/components/Layout.test.jsx
   npx vitest run src/components/Sidebar.test.jsx
   ```
2. **Full Test Suite & Build Verification**:
   ```bash
   npx vitest run
   npm run build
   ```
3. **Responsive Visual Checks**:
   - Mobile (< 1024px): Hamburger menu opens/closes sidebar drawer with dark blur backdrop.
   - Desktop/iPad (>= 1024px): Persistent 256px sidebar docked left, topbar and main content fill remaining width seamlessly.
