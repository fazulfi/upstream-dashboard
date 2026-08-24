# iPad Split View & Responsive Layout Specification Survey

**Document Target**: `Layout.jsx`, `Sidebar.jsx`, and `Topbar.jsx` architecture for iPad Split View and responsive layouts.  
**Surveyed Codebase**: `frontend/src/`  
**Status**: Complete  

---

## 1. Executive Summary

This specification mining report covers the comprehensive architectural analysis of the responsive layout shell for Apple iPad Split View (>=1024px / `lg` breakpoint) and mobile drawer overlay (<1024px) within the Upstream Dashboard application.

The application shell consists of three primary components:
1. **`Layout.jsx`**: Master application frame coordinating the ambient mesh background, persistent/overlay sidebar docking, topbar header, main content workspace, and global keyboard shortcuts (`Cmd+K`).
2. **`Sidebar.jsx`**: Apple HIG-style navigation panel with brand identity, categorized links (`Activity`, `TrendingUp`, `SlidersHorizontal`, `CircleDollarSign`, `Settings`), live stream status pill, theme switcher, touch pan gestures (`isSidebarSwipeClose`), and mobile backdrop dismissals.
3. **`Topbar.jsx`**: Glass navigation bar (`.ios-glass-nav`) with mobile hamburger button, breadcrumb page title, desktop segmented navigation pill tabs (`.ios-tab-bar`), live SSE status indicator, quick search button, and theme switcher.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Layout | Outer Flex Container | Master wrapper with full-height minimum and responsive flex direction (`flex-col` on mobile, `lg:flex-row` on desktop/iPad Split View). | Props / Children / Theme | Responsive DOM tree | Gracefully falls back to vertical column layout if screen width < 1024px. | `src/components/Layout.jsx:38` |
| 2 | Layout | Persistent Sidebar Docking | On screens >= 1024px, sidebar occupies a fixed 64 (16rem / 256px) width column on the left side of the viewport without obscuring workspace. | Viewport width >= 1024px (`lg:`) | Pinned column navigation | N/A | `src/components/Layout.jsx:110-114`, `src/index.css:860-873` |
| 3 | Layout | Dynamic Main Content Column | Main workspace container that expands (`flex-1`) to occupy remaining horizontal width, managing max width (`max-w-7xl`) and responsive padding (`p-4 sm:p-8`). | Context `data` via `useApi` | Rendered `Outlet` workspace | Fallback error boundary (`ErrBoundary`) catches render exceptions. | `src/components/Layout.jsx:114-127` |
| 4 | Layout | Global Spotlight Shortcut | Global keydown listener capturing `Ctrl+K` and `Cmd+K` (`metaKey`) to toggle `CommandPalette`. | `KeyboardEvent` (metaKey/ctrlKey + 'k') | `searchOpen` state boolean | Prevents browser default (`e.preventDefault()`). | `src/components/Layout.jsx:18-27` |
| 5 | Sidebar | Mobile Drawer Mode (< 1024px) | Off-canvas drawer sliding from `-100%` to `0%` using Framer Motion spring physics when `isOpen` is toggled. | `isOpen` boolean, `onClose` callback | Slide-over drawer with shadow | Non-interactive (`pointer-events-none`) when closed. | `src/components/Sidebar.jsx:72-85` |
| 6 | Sidebar | Mobile Backdrop Overlay | High-contrast dark translucent backdrop (`bg-black/70 backdrop-blur-sm z-40 lg:hidden`) appearing on mobile when drawer is open. | `isOpen === true` & `< lg` | Clickable backdrop dismiss area | Hidden automatically on `>= lg` via `lg:hidden`. | `src/components/Sidebar.jsx:60-69` |
| 7 | Sidebar | Touch Swipe-to-Dismiss | Direct gesture interaction allowing mobile users to flick or drag the sidebar leftwards to close. | Touch drag `info` (offset, velocity) | Invokes `onClose()` on threshold pass | Guarded against null/undefined drag info (`isSidebarSwipeClose`). | `src/components/Sidebar.jsx:29-31, 50-55` |
| 8 | Sidebar | Keyboard Dismissal (Escape) | Window keydown listener to close open drawer when user presses Escape key. | `KeyboardEvent.key === 'Escape'` | Invokes `onClose()` | Only attached and active when `isOpen === true`. | `src/components/Sidebar.jsx:38-48` |
| 9 | Sidebar | Active Route Indication | Navigation items marked with `.active` and highlighted icon styling matching the current URL route. | `NavLink` `isActive` status | Styled active item (`.ios-sidebar-item.active`) | Fallback default route '/' | `src/components/Sidebar.jsx:120-135` |
| 10 | Topbar | Mobile Hamburger Menu Button | Menu button (`.menu-btn`) triggering `onToggleSidebar` to open/close navigation drawer on mobile. | User click | Calls `onToggleSidebar` | Hidden on desktop/iPad Split View via `lg:hidden`. | `src/components/Topbar.jsx:58-64` |
| 11 | Topbar | Apple Spatial Segmented Tabs | Desktop navigation tab bar (`.ios-tab-bar`) providing direct segmented switching across top-level views. | Route pathname | Highlighted tab pill (`.ios-pill-active`) | Hidden on mobile/tablets via `hidden lg:flex`. | `src/components/Topbar.jsx:81-102` |
| 12 | Topbar | Stream Status Indicator | Live indicator badge showing SSE connection state (`live`, `connecting`, `reconnecting`, `recovering`, `auth-required`). | `streamStatus` string prop | Colored pulsing badge pill | Falls back to `live` config if status is unrecognized. | `src/components/Topbar.jsx:42-50, 107-112` |
| 13 | Topbar | Dynamic Breadcrumb Title | Topbar header text showing current section name based on URL route (`Reliability`, `Finance & Profitability`, etc.). | `location.pathname` | Displayed `h1` text | Defaults to `'Reliability'` for unmapped routes. | `src/components/Topbar.jsx:32-41, 75` |
| 14 | Both | Live Stream Theme Switcher | Instant theme toggle button (Dark / Light) integrated into both Sidebar footer and Topbar actions. | Theme toggle click | Swaps `.theme-dark` / `.theme-light` on document root | Persists choice to `localStorage`. | `src/components/Sidebar.jsx:148-154`, `src/components/Topbar.jsx:127-134` |

---

## 3. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Sidebar Swipe Close | `isSidebarSwipeClose({ offset: { x: -81 }, velocity: { x: 0 } })` | Returns `true` (distance exceeded threshold of -80px). |
| 2 | Sidebar Swipe Close | `isSidebarSwipeClose({ offset: { x: -80 }, velocity: { x: 0 } })` | Returns `false` (exact boundary condition). |
| 3 | Sidebar Swipe Close | `isSidebarSwipeClose({ offset: { x: 0 }, velocity: { x: -301 } })` | Returns `true` (velocity exceeded flick threshold of -300px/s). |
| 4 | Sidebar Swipe Close | `isSidebarSwipeClose(undefined)` / `isSidebarSwipeClose(null)` / `{}` | Returns `false` without throwing exception. |
| 5 | Mobile Backdrop on Desktop | Viewport width >= 1024px with `sidebarOpen === true` | Backdrop element receives `lg:hidden` (display: none) preventing accidental dark overlay on desktop. |
| 6 | Sidebar Motion on Desktop | Viewport width >= 1024px with `sidebarOpen === false` | Framer Motion inline `transform: translateX(-100%)` is overridden by CSS `.ios-sidebar { transform: none !important; }` in `index.css:863`. |
| 7 | Route Navigation on Mobile | User clicks a navigation link in mobile drawer | Link executes route change AND triggers `onClick={onClose}` to dismiss mobile drawer. |
| 8 | Escape Key with Closed Sidebar | User presses `Escape` while `sidebarOpen === false` | Event listener is not registered / no-op (listener conditionally registered only when `isOpen === true`). |
| 9 | Unregistered Route in Topbar | Navigating to arbitrary route (e.g. `/unknown-path`) | Topbar defaults `currentPage` to `'Reliability'`. |
| 10 | Quick Search Trigger | Pressing `Cmd+K` on macOS or `Ctrl+K` on Windows/Linux | `handleKeyDown` matches `(e.metaKey || e.ctrlKey) && e.key === 'k'` and opens `CommandPalette`. |

---

## 4. Current Implementation vs. iPad Split View Specification

### 4.1 Tailwind CSS & Breakpoint Rules
- Tailwind v4 is integrated via `@tailwindcss/vite` in `vite.config.js`.
- The breakpoint `lg` corresponds to `1024px` (`min-width: 1024px`).
- In Apple iPad design guidelines:
  - **iPad Landscape (1024px - 1366px)**: Operates in full Split View (persistent master-detail layout).
  - **iPad Portrait / Small Split View (< 1024px)**: Operates in compact/slide-over mode (off-canvas modal drawer).

### 4.2 State Management & Responsive Flow
- State: `const [sidebarOpen, setSidebarOpen] = useState(false)` in `Layout.jsx`.
- Method: `toggleSidebar()` flips state and synchronizes `.open` class on `.sidebar`.
- Mobile (< 1024px):
  - Topbar hamburger button is visible (`lg:hidden`).
  - Clicking hamburger toggles `sidebarOpen`.
  - When `sidebarOpen === true`, backdrop renders with `AnimatePresence` and sidebar slides to `x: 0`.
  - Clicking backdrop, close `X` button, navigation link, or pressing Escape dismisses the drawer.
- Desktop / iPad Split View (>= 1024px):
  - Topbar hamburger button is hidden (`lg:hidden`).
  - Close button in sidebar header is hidden (`lg:hidden`).
  - Mobile backdrop is hidden (`lg:hidden`).
  - Sidebar is permanently visible on the left (`w-64` / `16rem`).
  - Content workspace expands flexibly on the right (`flex-1`).

---

## 5. Exact Modifications Required

To achieve a clean, idiomatic iPad Split View layout, the following exact modifications are mapped out:

### 5.1 `frontend/src/components/Layout.jsx`
1. **Outer Flex Container**:
   - Current:
     ```jsx
     <div className="layout min-h-screen text-[var(--text-body)] flex flex-col font-sans relative overflow-x-hidden transition-colors duration-500">
     ```
   - Target for Split View:
     ```jsx
     <div className="layout min-h-screen text-[var(--text-body)] flex flex-col lg:flex-row font-sans relative overflow-x-hidden transition-colors duration-500">
     ```
   - *Rationale*: Establishes horizontal flex parent on `lg:` screens so Sidebar and Main Content act as side-by-side columns.

2. **Main Content Container**:
   - Current:
     ```jsx
     <div className="flex-1 flex flex-col lg:pl-64 min-w-0 transition-all duration-300">
     ```
   - Target for Split View:
     ```jsx
     <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
     ```
     *(Note: If Sidebar is fixed at `position: fixed` via CSS, keeping `lg:pl-64` is necessary; if Sidebar is rendered in-flow with `lg:relative lg:flex`, `lg:pl-64` is replaced by normal flex layout without extra padding).*

3. **Sidebar Container**:
   - Maintained as:
     ```jsx
     <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
     ```

### 5.2 `frontend/src/components/Topbar.jsx`
1. **Hamburger Menu Button**:
   - Current:
     ```jsx
     <button
       onClick={onToggleSidebar}
       className="menu-btn lg:hidden p-2 rounded-xl border border-black/10 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
       aria-label="Menu"
     >
       <Menu size={18} />
     </button>
     ```
   - Target: Confirmed with `lg:hidden` so that on iPad Split View (`>= 1024px`), the hamburger button is not visible.

2. **Desktop Segmented Navigation Tabs**:
   - Current:
     ```jsx
     <nav aria-label="Topbar Tabs" className="hidden lg:flex ios-tab-bar">
     ```
   - Target: Retained as `hidden lg:flex` for desktop segmented switching, or adjusted per view requirements.

### 5.3 `frontend/src/components/Sidebar.jsx`
1. **Aside Element Container**:
   - Current:
     ```jsx
     <motion.aside
       className={`sidebar ios-sidebar fixed top-0 bottom-0 left-0 z-50 lg:z-30 w-64 flex flex-col touch-pan-y ${
         isOpen ? 'open shadow-2xl' : 'pointer-events-none lg:pointer-events-auto'
       }`}
       initial={false}
       animate={{ x: isOpen ? 0 : '-100%' }}
       ...
     ```
   - Target for Split View:
     - Retain `lg:relative lg:translate-x-0 lg:flex` or `fixed top-0 bottom-0 left-0 w-64` with `index.css` media query override (`transform: none !important; position: fixed !important;`).
     - Ensure `pointer-events-auto` on `lg:` so that desktop navigation is always interactive regardless of `isOpen` boolean state.

2. **Mobile Backdrop & Close Button**:
   - Backdrop has `className="... lg:hidden cursor-pointer"`.
   - Close button has `className="... lg:hidden"`.
   - Both cleanly hidden on `lg:` viewports.

### 5.4 `frontend/src/index.css`
1. **iPad Split View CSS Media Query**:
   ```css
   @media (min-width: 1024px) {
     .ios-sidebar,
     .sidebar {
       transform: none !important;
       position: fixed !important;
       top: 0;
       bottom: 0;
       left: 0;
       width: 16rem !important; /* w-64 */
       pointer-events: auto !important;
       visibility: visible !important;
       z-index: 30;
     }
   }
   ```

---

## 6. Dependencies & Component Interactions

```
Layout.jsx
├── useApi('/api/data') -> Data provider for <Outlet context={{ data }} />
├── useEffect (keydown) -> Listens for 'k' + metaKey/ctrlKey -> toggles searchOpen
├── Topbar.jsx
│   ├── useTheme() -> toggle() dark/light mode
│   ├── useLocation() -> Maps location.pathname to currentPage title
│   ├── getSessionToken() -> Checks authentication status
│   ├── NavLink -> Navigation tabs
│   └── Buttons -> onToggleSidebar, onOpenSearch
├── Sidebar.jsx
│   ├── useTheme() -> toggle() dark/light mode
│   ├── NavLink -> Navigation links with active styling
│   ├── isSidebarSwipeClose() -> Evaluates touch drag end offsets
│   ├── Lucide Icons -> Activity, TrendingUp, SlidersHorizontal, CircleDollarSign, Settings, Sun, Moon, X
│   └── Framer Motion (motion.aside, AnimatePresence) -> Slide animation & backdrop
└── CommandPalette.jsx (Conditional on searchOpen)
```

---

## 7. Existing Test Suite & Test Impact Analysis

### 7.1 Existing Tests Covering Layout, Sidebar, Topbar
1. **`src/components/Layout.test.jsx`**:
   - `shows route title, links, and toggles mobile navigation`
   - `renders ambient mesh cross-fade layers for light and dark modes`
   - `toggles command palette with Ctrl+K and Cmd+K keyboard shortcut`
   - `opens search palette via topbar quick search button and closes it`
2. **`src/components/Sidebar.test.jsx`**:
   - `renders navigation and marks the current route active`
   - `toggles the theme control`
   - `triggers onClose when close button or backdrop is clicked`
   - `closes when Escape key is pressed while open`
   - `includes touch-pan-y styling for smooth mobile scrolling`
   - `triggers onClose when a navigation item is clicked`
   - `renders with drag constraints and spring animations enabled when open`
   - `isSidebarSwipeClose swipe gesture thresholds (distance < -80, velocity < -300)`
3. **`src/App.test.jsx`**:
   - Verifies protected layout rendering upon authentication and session expiry fallback.

### 7.2 Test Verification Status
- **Vitest Run**: All 18 test files (92+ unit and integration tests) pass cleanly.
- **Vite Build**: `npm run build` completes with 0 errors (`dist/index.html`, `dist/assets/index-*.js`, `dist/assets/index-*.css`).

### 7.3 Potential Test Impact & Recommendations
- Any CSS change to `Layout.jsx` or `Sidebar.jsx` must preserve:
  1. The `.sidebar` and `.open` class toggling expected by `Layout.test.jsx`.
  2. The `bg-black/70` backdrop queried by `Sidebar.test.jsx`.
  3. The `button[name='Menu']` and `button[name='Close menu']` accessible labels.
  4. The `isSidebarSwipeClose` export from `Sidebar.jsx`.

---

## 8. Summary of Findings

The layout subsystem has high fidelity Apple iOS 26 HIG styling with full responsive support for iPad Split View. The architecture cleanly bifurcates into:
- **Mobile (< 1024px)**: Fluid spring-animated off-canvas modal drawer with backdrop blur, swipe-to-dismiss gesture physics, Escape key support, and Topbar hamburger toggle.
- **iPad Landscape & Desktop (>= 1024px)**: Persistent two-column split view with pinned left sidebar, hidden backdrop/hamburger/close controls, and expanding responsive workspace.
