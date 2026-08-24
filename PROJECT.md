# Project: iPad Split View + Enhanced Spotlight Search

## Architecture
The application is a React single-page dashboard (`upstream-dashboard/frontend`) utilizing React Router, Framer Motion, and Tailwind CSS v4.
- **Layout Shell**: `src/components/Layout.jsx` establishes the outer container (`lg:flex lg:flex-row`), ambient mesh backgrounds, and hosts the persistent/overlay sidebar and content area.
- **Sidebar**: `src/components/Sidebar.jsx` provides navigation links with Apple HIG styling, docked persistently as a `w-64` column on `>= 1024px` (`lg:relative lg:translate-x-0 lg:flex`) and operating as an off-canvas drawer on `< 1024px`.
- **Topbar**: `src/components/Topbar.jsx` renders the glass navigation bar, breadcrumb title, desktop segmented tabs, SSE status badge, search trigger button, and theme switcher, hiding the hamburger button on `lg:` (`lg:hidden`).
- **Command Palette (Spotlight Search)**: `src/components/CommandPalette.jsx` provides a modal search with categorized sections (`Pages`, `Actions`, `Models`), leading Lucide squircle icons, keyboard shortcut badges, Framer Motion staggered entrance animations (`initial={{ opacity: 0, y: 6 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ delay: index * 0.03, duration: 0.2 }}`), continuous 1D arrow key navigation with wrap-around, and centered glass empty state.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Outer Flex Container | Add `lg:flex lg:flex-row` to outer layout div in Layout.jsx | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Persistent Sidebar Column | Fixed left column `lg:w-64 lg:flex-shrink-0` in Layout.jsx | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Expanding Main Content | Main content `lg:flex-1` expanding to fill remaining width in Layout.jsx | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Unchanged Mobile Overlay | Backdrop, hamburger, and `isOpen` state preserved for `< lg` screens | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Hide Hamburger on Desktop | Add `lg:hidden` to hamburger menu button in Topbar.jsx | M1 | ORIGINAL_REQUEST §R1 |
| 6 | Sidebar Split View Docking | `lg:relative lg:translate-x-0 lg:flex` on Sidebar.jsx for `>= lg` | M1 | ORIGINAL_REQUEST §R1 |
| 7 | Remove Mobile Backdrop on Desktop | Remove/hide mobile backdrop on `lg:` screens in Sidebar.jsx | M1 | ORIGINAL_REQUEST §R1 |
| 8 | Categorized Search Results | Group results into "Pages", "Actions", "Models" with glass section header (`text-[11px] font-semibold uppercase tracking-wider text-zinc-400 px-3 py-1.5`) | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Row Enhancements | Leading Lucide icon, label text, and keyboard shortcut badge (`↵`, `⌘K`) | M2 | ORIGINAL_REQUEST §R2 |
| 10 | Staggered Entrance Animation | Framer motion `initial={{ opacity: 0, y: 6 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ delay: index * 0.03, duration: 0.2 }}` | M2 | ORIGINAL_REQUEST §R2 |
| 11 | Keyboard Navigation | `ArrowUp`/`ArrowDown` highlighting with wrap-around and Enter to navigate/execute | M2 | ORIGINAL_REQUEST §R2 |
| 12 | Centered Glass Empty State | Glass container with muted icon + "No results for \"query\"" text when search returns empty | M2 | ORIGINAL_REQUEST §R2 |
| 13 | Comprehensive Test Coverage | Unit, boundary, cross-feature, and scenario tests in Vitest covering all shell components | M3 | Survey & Test Infra |
| 14 | Production Build Verification | Ensure `npm run build` bundles with 0 errors | M3 | ORIGINAL_REQUEST Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | iPad Split View Layout | Layout.jsx, Sidebar.jsx, Topbar.jsx | none | IN_PROGRESS |
| M2 | Enhanced Spotlight / Command Palette | CommandPalette.jsx | none | PLANNED |
| M3 | Test Verification & E2E Validation | Topbar.test.jsx, Layout.test.jsx, CommandPalette.test.jsx, Sidebar.test.jsx, build & vitest | M1, M2 | PLANNED |

## Interface Contracts
### Layout.jsx ↔ Sidebar.jsx
- `Sidebar` receives props: `isOpen: boolean`, `onClose: () => void`.
- When `isOpen` is true on mobile (<1024px), sidebar slides in; on desktop (>=1024px), sidebar is always visible via `lg:relative lg:translate-x-0 lg:flex` and backdrop has `lg:hidden`.

### Layout.jsx ↔ Topbar.jsx
- `Topbar` receives props: `onToggleSidebar: () => void`, `onOpenSearch: () => void`, `streamStatus: string`.
- Hamburger button has `lg:hidden` class.

### Layout.jsx ↔ CommandPalette.jsx
- `CommandPalette` receives props: `isOpen: boolean`, `onClose: () => void`.
- Global keydown listener captures `(e.metaKey || e.ctrlKey) && e.key === 'k'`.

## Code Layout
- `frontend/src/components/Layout.jsx` — Layout shell container
- `frontend/src/components/Sidebar.jsx` — Navigation sidebar
- `frontend/src/components/Topbar.jsx` — Top header navigation bar
- `frontend/src/components/CommandPalette.jsx` — Spotlight search modal
- `frontend/src/components/*.test.jsx` — Component unit & integration tests
