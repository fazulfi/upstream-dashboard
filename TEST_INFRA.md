# E2E Test Infra: iPad Split View + Enhanced Spotlight Search

## Test Philosophy
- Requirement-driven, opaque-box & unit-level verification.
- Testing Model: 4-Tier Model (Feature Coverage, Boundary & Corner Cases, Cross-Feature Interactions, Real-World Scenarios).

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|--------|:------:|:------:|:------:|:------:|
| 1 | iPad Split View Layout (Layout.jsx) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | Topbar Hamburger Hide (Topbar.jsx) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 3 | Sidebar Docking & Backdrop Hide (Sidebar.jsx) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 4 | CommandPalette Categorization | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 5 | CommandPalette Row Enhancements & Badges | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 6 | CommandPalette Framer Motion Staggered Animation | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 7 | CommandPalette Keyboard Navigation | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 8 | CommandPalette Empty State | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test runner: Vitest (`npx vitest run`)
- Environment: JSDOM with React Testing Library (`@testing-library/react`, `@testing-library/user-event`)
- Test suites:
  - `src/components/Layout.test.jsx`
  - `src/components/Sidebar.test.jsx`
  - `src/components/Topbar.test.jsx`
  - `src/components/CommandPalette.test.jsx`
