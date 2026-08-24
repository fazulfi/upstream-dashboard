# Survey Report: Frontend Test Runner & Testing Strategy

**Agent**: Survey Explorer 2  
**Date**: 2026-08-23  
**Project**: iOS Loading States + Glass Context Menu  
**Working Directory**: `c:\Users\faizz\upstream-dashboard\frontend`  

---

## Executive Summary

The frontend application in `c:\Users\faizz\upstream-dashboard\frontend` is built with **Vite 8.2**, **React 19.2**, **Tailwind CSS 4.3**, and **Motion 13.1** (imported via `motion/react`).  
The test infrastructure uses **Vitest 3.2.7**, **jsdom 26.0.0**, and **@testing-library/react 16.3.2** with **@testing-library/jest-dom 7.0.1**.

All **23 test files (158 tests)** currently pass cleanly with `npx vitest run` and `npm test` (with v8 code coverage above all configured thresholds: lines 92.88% vs 80% threshold). `npm run build` completes in ~4.5 seconds with 0 errors.

This report documents the exact build and test configuration, test conventions, and provides actionable test patterns for:
1. **Glass Context Menu (`ContextMenu.jsx`)**: right-click event interception on `.ios-glass-card`, smart boundary positioning, click-outside/Escape dismissal, and keyboard accessibility.
2. **iOS Skeleton Loading States (`SkeletonLoader.jsx` & variants)**: shimmer keyframe animations, ARIA loading semantics, `useApi` / async loading lifecycle in `Reliability.jsx` and `Finance.jsx`, and dark/light theme switching.

---

## 1. Build and Test Configuration

### 1.1 `package.json` Scripts and Dependencies

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "oxlint",
    "test": "vitest run --coverage",
    "test:watch": "vitest",
    "preview": "vite preview"
  }
}
```

#### Key Dependencies & Versions:
- **React**: `^19.2.8` + `react-dom: ^19.2.8`
- **Animation**: `motion: ^13.1.1` (Note: Motion for React is imported from `'motion/react'`)
- **Icons**: `lucide-react: ^1.31.0`
- **CSS**: `@tailwindcss/vite: ^4.3.3`, `tailwindcss: ^4.3.3`, `tailwind-merge: ^3.6.0`
- **Test Runner**: `vitest: ^3.0.0` (executing v3.2.7)
- **Test DOM**: `jsdom: ^26.0.0`
- **Testing Library**: `@testing-library/react: ^16.3.2`, `@testing-library/jest-dom: ^7.0.1`
- **Coverage**: `@vitest/coverage-v8: ^3.0.0`

### 1.2 `vite.config.js` Analysis
- Configures `@vitejs/plugin-react` and `@tailwindcss/vite`.
- Configures dev server proxy for `/api` pointing to backend Flask at `http://127.0.0.1:8124`.

### 1.3 `vitest.config.js` Analysis
- **Environment**: `'jsdom'`
- **Globals**: `true` (`describe`, `it`, `expect`, `vi`, `beforeEach`, etc.)
- **Setup Files**: `['./src/test/setup.js']`
- **Test Match Pattern**: `src/**/*.test.{js,jsx}`
- **Coverage Configuration**:
  - Provider: `v8`
  - Reporters: `text`, `json-summary`
  - Thresholds: `lines: 80`, `functions: 80`, `branches: 70`, `statements: 80`
  - Included paths: `src/App.jsx`, `src/components/LoginGate.jsx`, `src/components/Layout.jsx`, `src/components/Sidebar.jsx`, `src/pages/Reliability.jsx`, `src/hooks/**/*.{js,jsx}`, `src/lib/**/*.{js,jsx}`
  - Excluded paths: `src/main.jsx`, `src/theme.jsx`

### 1.4 Global Test Setup (`src/test/setup.js`)
```javascript
import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

vi.stubGlobal('fetch', vi.fn())
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn()
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
```

---

## 2. Existing Test Suite Catalog & Patterns

The codebase currently contains **23 test files**:
- **Pages**: `App.test.jsx`, `pages/Finance.test.jsx`, `pages/Reliability.test.jsx`
- **Components**: `components/Badge.test.jsx`, `components/FinanceActions.test.jsx`, `components/FinanceStatus.test.jsx`, `components/KpiCard.test.jsx`, `components/KpiCard.adversarial.test.jsx`, `components/Layout.test.jsx`, `components/LoginFlow.test.jsx`, `components/LoginGate.test.jsx`, `components/ModelDetailDrawer.test.jsx`, `components/PricingMutations.test.jsx`, `components/PricingPage.test.jsx`, `components/Sidebar.test.jsx`, `components/Sparkline.test.jsx`, `components/StressAdversarial.test.jsx`
- **Hooks**: `hooks/useApi.test.jsx`, `hooks/useReliabilityStream.test.jsx`
- **Lib / Theme**: `lib/fmt.test.js`, `lib/reliabilityApi.test.js`, `lib/utils.test.js`, `theme.test.jsx`

### Established Conventions in the Codebase:
1. **Mocking APIs**:
   - For `reliabilityApi`: `vi.mock('../lib/reliabilityApi', () => ({ reliabilityApi: api, unwrap: (x) => x }))` with `const api = vi.hoisted(() => ({ ... }))`.
   - For `useApi`: `vi.mock('../hooks/useApi', () => ({ useApi: vi.fn(), apiFetch: vi.fn() }))`.
2. **Motion Animation Handling**:
   - `motion/react` components work seamlessly in Vitest jsdom without needing special stubs since `motion` gracefully handles the headless environment.
3. **Theme and CSS Verifications**:
   - `theme.test.jsx` tests `document.documentElement` class transitions (`theme-dark` vs `theme-light`), CSS custom property values (`--bg-base`, `--mesh-opacity`), and reads `index.css` via `node:fs` for animation/transition rule audits.

---

## 3. Testing Glass Context Menu (`ContextMenu.jsx`)

### 3.1 Requirements for Context Menu
- Intercepts right-click (`contextmenu` event) on elements with class `.ios-glass-card`.
- Styled with `.ios-sheet` liquid glass styling (already defined in `index.css:748` for dark/light modes).
- Framer Motion / Motion spring entrance animation: `initial={{ scale: 0.8, opacity: 0 }}` -> `animate={{ scale: 1, opacity: 1 }}`.
- Smart screen edge positioning: flips or clamps coordinates so menu remains within viewport (`window.innerWidth`, `window.innerHeight`).
- Dismissal triggers:
  - Left click outside the menu panel (`mousedown` / `click` on document/backdrop)
  - Keyboard Escape (`keydown` with `e.key === 'Escape'`)
  - Window resize or scroll
  - Selecting an action item

### 3.2 Vitest / RTL Testing Strategy & Sample Code

```javascript
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ContextMenu, { calculateMenuPosition } from '../components/ContextMenu';

describe('ContextMenu Component & Right-Click Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates smart screen edge position without overflowing viewport', () => {
    const windowSize = { width: 1024, height: 768 };
    const menuSize = { width: 200, height: 150 };

    // Standard middle click
    const normal = calculateMenuPosition(300, 200, menuSize, windowSize);
    expect(normal.x).toBe(300);
    expect(normal.y).toBe(200);

    // Click near right edge -> offset to left
    const nearRight = calculateMenuPosition(950, 200, menuSize, windowSize);
    expect(nearRight.x).toBeLessThanOrEqual(windowSize.width - menuSize.width);

    // Click near bottom edge -> offset upward
    const nearBottom = calculateMenuPosition(300, 720, menuSize, windowSize);
    expect(nearBottom.y).toBeLessThanOrEqual(windowSize.height - menuSize.height);
  });

  it('opens context menu on right-click on .ios-glass-card and prevents default browser contextmenu', () => {
    render(
      <div>
        <div className="ios-glass-card" data-testid="card-1">
          Glass Card 1
        </div>
        <ContextMenu />
      </div>
    );

    const card = screen.getByTestId('card-1');
    const preventDefault = vi.fn();
    
    // Dispatch right-click
    fireEvent.contextMenu(card, { clientX: 250, clientY: 180, preventDefault });
    
    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes on Escape key press', () => {
    const onClose = vi.fn();
    render(<ContextMenu isOpen={true} position={{ x: 100, y: 100 }} onClose={onClose} />);
    
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when clicking outside the menu panel', () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <ContextMenu isOpen={true} position={{ x: 100, y: 100 }} onClose={onClose} />
      </div>
    );

    fireEvent.mouseDown(screen.getByTestId('outside-area'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('executes item action and dismisses menu on item click', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    const items = [{ id: 'action-1', label: 'Action 1', onClick: onAction }];

    render(
      <ContextMenu isOpen={true} position={{ x: 100, y: 100 }} items={items} onClose={onClose} />
    );

    const itemBtn = screen.getByRole('menuitem', { name: 'Action 1' });
    fireEvent.click(itemBtn);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

---

## 4. Testing iOS Skeleton Loading States (`SkeletonLoader.jsx`) & Theme Switching

### 4.1 Requirements for Skeleton Loading
- Component: `SkeletonLoader.jsx` with variants:
  - `SkeletonKpiCard` (or `variant="kpi"`) — matching 4-column KPI grid cards
  - `SkeletonRow` (or `variant="row"`) — matching table row placeholders (e.g. models table in Reliability, asset rows in Finance)
  - `SkeletonPage` (or `variant="page"`) — full-page loading placeholder
- Keyframe Animation: shimmer effect keyframe defined in CSS (`@keyframes shimmer` / `animate-[shimmer_1.5s_infinite]`).
- Semantic Accessibility: `role="status"`, `aria-label="Loading..."`, `aria-busy="true"`.
- Support for Light and Dark modes: `bg-slate-200/80 dark:bg-zinc-800/60`, shimmer gradient with `before:via-white/60 dark:before:via-zinc-700/30`.
- Integrated into `Reliability.jsx` (during initial load or `recover()` execution) and `Finance.jsx` (when `useApi` has `loading: true`).

### 4.2 Vitest / RTL Testing Strategy & Sample Code

```javascript
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SkeletonLoader, {
  SkeletonKpiCard,
  SkeletonRow,
  SkeletonPage,
} from '../components/SkeletonLoader';
import { ThemeProvider } from '../theme';

describe('iOS SkeletonLoader Component Suite', () => {
  it('renders SkeletonKpiCard with accessibility status role and shimmer classes', () => {
    render(<SkeletonKpiCard />);
    const statusElement = screen.getByRole('status', { name: /loading/i });
    expect(statusElement).toBeInTheDocument();
    expect(statusElement).toHaveClass('ios-glass-card');
  });

  it('renders SkeletonRow with correct number of placeholder columns', () => {
    const { container } = render(<SkeletonRow columns={5} />);
    const skeletonElements = container.querySelectorAll('[aria-hidden="true"]');
    expect(skeletonElements.length).toBeGreaterThanOrEqual(5);
  });

  it('renders SkeletonPage containing header, KPI grid, and table skeletons', () => {
    render(<SkeletonPage />);
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders gracefully under both light and dark themes', () => {
    const { rerender } = render(
      <ThemeProvider>
        <SkeletonKpiCard />
      </ThemeProvider>
    );

    expect(document.documentElement).toHaveClass('theme-dark');
    const skeleton = screen.getByRole('status');
    expect(skeleton).toBeInTheDocument();

    // Toggle to light mode
    document.documentElement.className = 'theme-light';
    rerender(
      <ThemeProvider>
        <SkeletonKpiCard />
      </ThemeProvider>
    );
    expect(document.documentElement).toHaveClass('theme-light');
    expect(skeleton).toBeInTheDocument();
  });
});
```

### 4.3 Page Integration Testing Strategies

#### In `Reliability.test.jsx`:
```javascript
it('displays SkeletonLoader while fetching model snapshot', async () => {
  let resolveSummary;
  api.summary.mockReturnValue(new Promise((r) => { resolveSummary = r; }));
  api.cycles.mockReturnValue(new Promise(() => {}));
  api.events.mockReturnValue(new Promise(() => {}));
  api.models.mockReturnValue(new Promise(() => {}));

  render(<Reliability />);

  // Skeletons should be visible while promises are pending
  expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();

  // Resolve API data
  await act(async () => {
    resolveSummary(payload);
  });

  // Skeletons unmount and real content appears
  await waitFor(() => {
    expect(screen.queryByRole('status', { name: /loading/i })).not.toBeInTheDocument();
    expect(screen.getByText('Reliability & Operations')).toBeInTheDocument();
  });
});
```

#### In `Finance.test.jsx`:
```javascript
it('displays SkeletonLoader when useApi is in loading state', () => {
  api.useApi.mockReturnValue({
    data: null,
    loading: true,
    error: null,
    reload: vi.fn(),
  });

  render(
    <ToastProvider>
      <Finance />
    </ToastProvider>
  );

  // Skeletons are rendered during loading state
  expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  expect(screen.queryByText('$1,450.75')).not.toBeInTheDocument();
});
```

---

## 5. CSS & Styling Discovery & Recommendations

1. **Keyframe Shimmer Definition**:
   - `src/index.css` currently does NOT have `@keyframes shimmer` defined.
   - Recommended definition in `src/index.css`:
     ```css
     @keyframes shimmer {
       100% {
         transform: translateX(100%);
       }
     }
     ```
2. **Glass Context Menu Styling**:
   - `.ios-sheet` is already defined in `src/index.css:748-770` with backdrop blur, rounded corners (`20px`), subtle border, and custom shadows for both light (`--nav-bg: rgba(255,255,255,0.85)`) and dark modes (`rgba(20,20,25,0.85)`).
   - `.ios-glass-card` is defined in `src/index.css:166-215` with liquid glass styling, hover transforms, and dark/light mode shadow presets.

---

## 6. Verification Checklist for Implementation

- [ ] `SkeletonLoader.jsx` created with `SkeletonKpiCard`, `SkeletonRow`, `SkeletonPage` exports
- [ ] `@keyframes shimmer` added to `src/index.css`
- [ ] `ContextMenu.jsx` created with right-click event listener, positioning logic, click-outside/Escape dismissal
- [ ] `Reliability.jsx` and `Finance.jsx` integrated with skeleton loading states during pending fetch
- [ ] New unit and integration test files created:
  - `src/components/SkeletonLoader.test.jsx`
  - `src/components/ContextMenu.test.jsx`
  - Updates in `src/pages/Reliability.test.jsx` and `src/pages/Finance.test.jsx`
- [ ] `npm run build` exits with code 0
- [ ] `npx vitest run` passes all test suites
- [ ] `npm test` passes all coverage thresholds (lines >= 80%, functions >= 80%, branches >= 70%, statements >= 80%)
