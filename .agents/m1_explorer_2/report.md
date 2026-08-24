# Milestone 1: Technical Investigation & Strategy for Sidebar.jsx

## Executive Summary
This report analyzes the iPad Split View layout implementation for `frontend/src/components/Sidebar.jsx` (Milestone 1, Features 4, 6, and 7), detailing how the sidebar transitions from an off-canvas drawer on mobile screens (`< 1024px`) to a persistent docked column in a flex split view on desktop screens (`>= 1024px` / `lg:`).

---

## 1. Current State of `Sidebar.jsx`

### Component Structure
- **Root Element**: `<motion.aside>` managed by Framer Motion (`motion/react`).
- **Backdrop Element**: `<motion.div>` wrapped in `<AnimatePresence>`, rendered conditionally when `isOpen === true`.
- **Close Button**: `<button onClick={onClose} className="... lg:hidden" aria-label="Close menu">` inside the brand header.
- **Navigation Links**: `<NavLink onClick={onClose} className="... ios-sidebar-item ...">` for primary navigation.
- **Theme Switcher**: Bottom pinned bar with live indicator and light/dark theme toggle.
- **Gesture Physics**: `drag="x"`, `dragConstraints`, `dragElastic`, `onDragEnd` using `isSidebarSwipeClose` distance (`< -80px`) and flick velocity (`< -300px/s`) thresholds.
- **Keyboard Listener**: `useEffect` listening for `Escape` key to call `onClose()`.

### Code Reference (`src/components/Sidebar.jsx`)
```jsx
// Lines 59-70: Backdrop
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden cursor-pointer"
    />
  )}
</AnimatePresence>

// Lines 72-85: Sidebar Container
<motion.aside
  className={`sidebar ios-sidebar fixed top-0 bottom-0 left-0 z-50 lg:z-30 w-64 flex flex-col touch-pan-y ${
    isOpen ? 'open shadow-2xl' : 'pointer-events-none lg:pointer-events-auto'
  }`}
  initial={false}
  animate={{ x: isOpen ? 0 : '-100%' }}
  transition={{ type: 'spring', damping: 25, stiffness: 250 }}
  drag={isOpen ? 'x' : false}
  dragConstraints={{ left: 0, right: 0 }}
  dragElastic={{ left: 0.8, right: 0 }}
  dragSnapToOrigin={true}
  dragDirectionLock={true}
  onDragEnd={handleDragEnd}
>
```

---

## 2. Requirement Analysis & Technical Considerations

### R1. Desktop Docking (`>= 1024px` / `lg:`)
- **Requirement**: Dock persistently as a `w-64` column (`lg:relative lg:translate-x-0 lg:flex lg:flex-shrink-0`), always visible regardless of `isOpen`.
- **Framer Motion Inline Styles Precedence**:
  - In `Sidebar.jsx`, `<motion.aside animate={{ x: isOpen ? 0 : '-100%' }}>` applies inline CSS `style="transform: translateX(-100%)"` when `isOpen === false`.
  - On desktop, `isOpen` defaults to `false`. Without CSS override, the sidebar would be translated `-100%` off-screen despite Tailwind utility classes.
  - In `frontend/src/index.css` (lines 894–907), the `@media (min-width: 1024px)` block applies `transform: none !important;` and `pointer-events: auto !important;`. This correctly guarantees that desktop split view docking is never overridden by Framer Motion's closed-state inline translation.
- **Class Update**:
  - Add `lg:relative lg:translate-x-0 lg:flex` and `lg:shadow-none` to `className`.
  - Full class expression:
    ```jsx
    className={`sidebar ios-sidebar fixed top-0 bottom-0 left-0 z-50 lg:relative lg:translate-x-0 lg:flex lg:z-30 w-64 flex flex-col touch-pan-y ${
      isOpen ? 'open shadow-2xl lg:shadow-none' : 'pointer-events-none lg:pointer-events-auto'
    }`}
    ```

### R2. Mobile Backdrop Visibility (`lg:hidden`)
- **Requirement**: Mobile backdrop must be hidden/removed on `lg:` screens.
- **Verification**:
  - In `Sidebar.jsx` line 67, the backdrop already has `lg:hidden`:
    `className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden cursor-pointer"`
  - When `isOpen === true` on `lg:` screens (e.g. if opened before resizing or programmatically), `lg:hidden` ensures `display: none;`, preventing any dark overlay or interaction blocking on desktop.

### R3. Mobile Drawer Behavior (`< 1024px`) Preservation
- **Swipe-to-dismiss**: Controlled by `drag={isOpen ? 'x' : false}` and `isSidebarSwipeClose` threshold checking (`offset.x < -80` or `velocity.x < -300`). Fully preserved.
- **Escape Key Dismissal**: `useEffect` on `[isOpen, onClose]` listens for `Escape` and dispatches `onClose()`. Fully preserved.
- **Mobile Header Close Button**: `<button onClick={onClose} ... className="... lg:hidden" aria-label="Close menu">` closes the drawer and stays hidden on desktop. Fully preserved.
- **Navigation Click**: Clicking `<NavLink onClick={onClose} ...>` navigates and dismisses the mobile drawer. On desktop, closing `isOpen` does not hide the sidebar due to `lg:translate-x-0` and `transform: none !important;`.

### R4. Interplay with `Layout.jsx` and `index.css`
- When `Layout.jsx` implements outer container `lg:flex lg:flex-row`:
  - `Sidebar` acts as the first flex column (`w-64 flex-shrink-0 lg:relative lg:flex`).
  - Main workspace container in `Layout.jsx` becomes `flex-1 flex flex-col min-w-0` (and `lg:pl-64` can be removed because the sidebar is in-flow).
- In `src/index.css`:
  - Review lines 894-907: ensure `position: fixed !important;` does not conflict with `lg:relative` if `Layout.jsx` transitions to pure in-flow flex layout.

---

## 3. Concrete Recommendations for Worker

### Recommended Changes in `frontend/src/components/Sidebar.jsx`
1. Update `<motion.aside>` `className` at line 73:
```jsx
// BEFORE (Line 73-75):
<motion.aside
  className={`sidebar ios-sidebar fixed top-0 bottom-0 left-0 z-50 lg:z-30 w-64 flex flex-col touch-pan-y ${
    isOpen ? 'open shadow-2xl' : 'pointer-events-none lg:pointer-events-auto'
  }`}

// AFTER:
<motion.aside
  className={`sidebar ios-sidebar fixed top-0 bottom-0 left-0 z-50 lg:relative lg:translate-x-0 lg:flex lg:z-30 w-64 flex flex-col touch-pan-y ${
    isOpen ? 'open shadow-2xl lg:shadow-none' : 'pointer-events-none lg:pointer-events-auto'
  }`}
```

2. Confirm backdrop retains `lg:hidden` (Line 67):
```jsx
className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden cursor-pointer"
```

3. Confirm mobile close button retains `lg:hidden` (Line 102):
```jsx
className="ios-icon-btn p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer lg:hidden"
```

---

## 4. Verification & Testing

### Existing Tests
- All 24 test files (173 tests) in Vitest currently pass (`npx vitest run`).
- `Sidebar.test.jsx` verifies:
  - Navigation links and active route markers.
  - Theme switcher toggle.
  - Close button and backdrop clicks triggering `onClose`.
  - Escape key handling.
  - Touch-pan-y mobile styling and open class.
  - Swipe threshold calculations in `isSidebarSwipeClose`.

### Recommended Additional Tests (Milestone 3)
1. **Desktop Class Assertions**: Verify `aside` element has `lg:relative`, `lg:translate-x-0`, and `lg:flex`.
2. **Backdrop Class Assertions**: Verify backdrop element has `lg:hidden`.
3. **Mobile Close Button Assertions**: Verify mobile close button has `lg:hidden`.
4. **Layout Integration Test**: Verify desktop layout structure renders Sidebar and Main content in flex-row alignment without layout shift.
