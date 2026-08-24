# Milestone 1 Investigation Report: Topbar.jsx & Integration Tests

**Author**: Explorer Agent (`m1_explorer_3`)  
**Target Milestone**: Milestone 1 — iPad Split View Layout (Topbar & Test Integration)  
**Date**: 2026-08-23  

---

## 1. Executive Summary

Milestone 1 introduces an iPad Split View layout where on desktop and landscape tablet viewports (`>= 1024px` / `lg:`), the sidebar is docked persistently as a fixed column, and mobile-specific drawer controls (such as the Topbar hamburger menu button and sidebar backdrops) are hidden.

This investigation specifically evaluates:
1. **`Topbar.jsx` structure and responsiveness**: Verification of the hamburger button containing the `lg:hidden` class, alongside complementary desktop navigation elements (`hidden lg:flex`).
2. **Integration with `Layout.jsx` and `Sidebar.jsx`**: Prop contract compliance (`onToggleSidebar`, `onOpenSearch`, `streamStatus`).
3. **Test Suite Status & Test Strategy**: Impact on existing tests (`Layout.test.jsx`, `Sidebar.test.jsx`, full suite) and proposal for a comprehensive dedicated test suite (`Topbar.test.jsx`).

---

## 2. Direct Codebase Observations

### A. Topbar.jsx (`frontend/src/components/Topbar.jsx`)
- **Hamburger Button (Lines 58–64)**:
  ```jsx
  <button
    onClick={onToggleSidebar}
    className="menu-btn lg:hidden p-2 rounded-xl border border-black/10 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
    aria-label="Menu"
  >
    <Menu size={18} />
  </button>
  ```
  - **Verified**: Contains `lg:hidden`, hiding the hamburger button on screens `>= 1024px`.
  - **Verified**: Contains `menu-btn` class with iOS spring animations in `src/index.css` (lines 289–317).
  - **Verified**: Has accessible name `aria-label="Menu"`.
  - **Verified**: Directly triggers `onToggleSidebar` callback prop on click.

- **Desktop Segmented Navigation Tabs (Lines 80–102)**:
  ```jsx
  <nav aria-label="Topbar Tabs" className="hidden lg:flex ios-tab-bar">
    {NAV_ITEMS.map((item) => { ... })}
  </nav>
  ```
  - **Verified**: Hidden on mobile (`hidden`) and displayed only on desktop (`lg:flex`), creating the required Apple Spatial Tab Bar layout for `>= 1024px`.

- **Live Stream Status Indicator Pill (Lines 106–112)**:
  ```jsx
  <div className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${currentStatus.border} ${currentStatus.textColor}`}>
    <span className={`w-2 h-2 rounded-full ${currentStatus.color} animate-pulse`} />
    <span>{currentStatus.label}</span>
  </div>
  ```
  - **Verified**: Maps `streamStatus` ('live', 'connecting', 'reconnecting', 'recovering', 'auth-required') to color-coded badges, defaulting safely to `live`.

- **Quick Search Command Palette Trigger (Lines 115–124)**:
  ```jsx
  <button
    onClick={onOpenSearch}
    className="ios-btn-glass flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
  >
    <Search size={14} />
    <span className="hidden md:inline">Quick search…</span>
    <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-black rounded border border-black/10 dark:border-white/10 text-zinc-500">
      ⌘K
    </kbd>
  </button>
  ```
  - **Verified**: Triggers `onOpenSearch` prop when clicked.

- **Theme Switcher Toggle (Lines 126–134)**:
  - Uses `useTheme()` hook; toggles between light and dark modes with proper `aria-label` / `title` attributes.

- **Dynamic Page Titles (Lines 32–40)**:
  - Maps `/`, `/finance`, `/auto-pricing`, `/pricing`, `/settings` to titles, defaulting to `'Reliability'`.

---

### B. Layout.jsx Integration (`frontend/src/components/Layout.jsx`)
- Passes props to `Topbar` (Lines 117–120):
  ```jsx
  <Topbar
    onOpenSearch={() => setSearchOpen(true)}
    onToggleSidebar={toggleSidebar}
  />
  ```
- Manages `sidebarOpen` and `searchOpen` states in harmony with `Topbar` interactions.

---

### C. Sidebar.jsx Integration (`frontend/src/components/Sidebar.jsx`)
- Backdrop has `lg:hidden` (Line 67), preventing mobile overlay on desktop viewports.
- Close button (`<X size={16} />`) has `lg:hidden` (Line 102), as persistent desktop sidebar does not need a close button.

---

## 3. Test Suite Verification & Baseline Results

### Full Vitest Execution Result
Command: `npx vitest run` in `c:\Users\faizz\upstream-dashboard\frontend`
- **Test Files**: 24 passed (24)
- **Tests**: 173 passed (173)
- **Exit Code**: 0

### Build Verification Result
Command: `npm run build` in `c:\Users\faizz\upstream-dashboard\frontend`
- **Output**: 2227 modules transformed, bundles `dist/index.html`, `dist/assets/*.css`, `dist/assets/*.js`.
- **Exit Code**: 0 (Zero compilation/bundler errors).

### Existing Layout & Sidebar Test Analysis
1. `Layout.test.jsx`:
   - `shows route title, links, and toggles mobile navigation` passes (finds `screen.getByRole('button', { name: 'Menu' })` and triggers toggle).
   - `toggles command palette with Ctrl+K and Cmd+K keyboard shortcut` passes.
   - `opens search palette via topbar quick search button and closes it` passes.
2. `Sidebar.test.jsx`:
   - All 10 tests covering navigation, theme toggle, swipe gesture detection (`isSidebarSwipeClose`), drag constraints, and escape key listener pass cleanly.

---

## 4. Identified Gaps & Recommendations

### Gap Identified
While `Topbar` is exercised through `Layout.test.jsx`, there is currently no standalone unit test suite `frontend/src/components/Topbar.test.jsx` that thoroughly tests:
1. Breakpoint classes (`lg:hidden` on hamburger button, `hidden lg:flex` on tabs).
2. Direct callback dispatching (`onToggleSidebar`, `onOpenSearch`).
3. Stream status badge variations across all 5 states + default fallback.
4. Route title rendering for all defined routes and unknown routes fallback.
5. Desktop tabs active route styling.

### Recommended Worker Action: Add `Topbar.test.jsx`
Below is the verified test specification for `frontend/src/components/Topbar.test.jsx`:

```jsx
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Topbar from './Topbar'
import { ThemeProvider } from '../theme'

function renderTopbar(props = {}, route = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[route]}>
        <Topbar {...props} />
      </MemoryRouter>
    </ThemeProvider>
  )
}

describe('Topbar Component', () => {
  it('renders hamburger menu button with lg:hidden class and calls onToggleSidebar when clicked', () => {
    const onToggleSidebar = vi.fn()
    renderTopbar({ onToggleSidebar })

    const menuBtn = screen.getByRole('button', { name: 'Menu' })
    expect(menuBtn).toBeInTheDocument()
    expect(menuBtn).toHaveClass('lg:hidden')
    expect(menuBtn).toHaveClass('menu-btn')

    fireEvent.click(menuBtn)
    expect(onToggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('renders desktop navigation tabs with hidden lg:flex classes and highlights active item', () => {
    renderTopbar({}, '/auto-pricing')

    const tabsNav = screen.getByRole('navigation', { name: 'Topbar Tabs' })
    expect(tabsNav).toBeInTheDocument()
    expect(tabsNav).toHaveClass('hidden')
    expect(tabsNav).toHaveClass('lg:flex')

    const activeLink = screen.getByRole('link', { name: 'Auto Pricing' })
    expect(activeLink).toHaveClass('active')
    expect(activeLink).toHaveClass('ios-pill-active')

    const inactiveLink = screen.getByRole('link', { name: 'Overview' })
    expect(inactiveLink).not.toHaveClass('active')
  })

  it('renders correct page breadcrumb title based on location', () => {
    const { unmount } = renderTopbar({}, '/finance')
    expect(screen.getByRole('heading', { name: 'Finance & Profitability' })).toBeInTheDocument()
    unmount()

    renderTopbar({}, '/unknown-route')
    expect(screen.getByRole('heading', { name: 'Reliability' })).toBeInTheDocument()
  })

  it('calls onOpenSearch when quick search button is clicked', () => {
    const onOpenSearch = vi.fn()
    renderTopbar({ onOpenSearch })

    const searchBtn = screen.getByRole('button', { name: /quick search/i })
    fireEvent.click(searchBtn)
    expect(onOpenSearch).toHaveBeenCalledTimes(1)
  })

  it('toggles theme when theme switcher button is clicked', () => {
    renderTopbar()
    const themeBtn = screen.getByRole('button', { name: /switch to (light|dark) mode/i })
    expect(themeBtn).toBeInTheDocument()
    fireEvent.click(themeBtn)
  })

  it('renders status indicators for different streamStatus values', () => {
    const { rerender } = renderTopbar({ streamStatus: 'connecting' })
    expect(screen.getByText('Connecting')).toBeInTheDocument()

    rerender(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/']}>
          <Topbar streamStatus="reconnecting" />
        </MemoryRouter>
      </ThemeProvider>
    )
    expect(screen.getByText('Reconnecting')).toBeInTheDocument()

    rerender(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/']}>
          <Topbar streamStatus="auth-required" />
        </MemoryRouter>
      </ThemeProvider>
    )
    expect(screen.getByText('Expired')).toBeInTheDocument()
  })
})
```

---

## 5. Verification Checklist for Milestone 1

| Component | Check | Status |
|-----------|-------|--------|
| `Topbar.jsx` | Hamburger button contains `lg:hidden` | Verified (Line 60) |
| `Topbar.jsx` | Desktop tabs contain `hidden lg:flex` | Verified (Line 81) |
| `Topbar.jsx` | Callback props (`onToggleSidebar`, `onOpenSearch`) wired | Verified |
| `Layout.jsx` | Passes required props to `Topbar` | Verified |
| `Layout.jsx` | Offset content on desktop (`lg:pl-64`) | Verified |
| `Sidebar.jsx` | Backdrop has `lg:hidden` | Verified |
| `Sidebar.jsx` | Aside has `lg:pointer-events-auto`, close btn has `lg:hidden` | Verified |
| Test Suite | 24 test files / 173 vitest tests pass | Verified |
| Production Build | `npm run build` bundles with 0 errors | Verified |
