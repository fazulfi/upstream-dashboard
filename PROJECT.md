# Project: iOS 26 Light Mode Spatial UI Overhaul

## Architecture
- **Framework**: React 19 + Vite 6 + Tailwind CSS v4 (`@tailwindcss/vite`, `@import "tailwindcss"`).
- **Theme System**: Dual-layer theme architecture — CSS variables in `src/index.css` (`.theme-light`, `.theme-dark`, `.ios-glass-card`, `.ios-glass-nav`) combined with JavaScript theme context in `src/theme.jsx` (`THEMES` dictionary, `ThemeContext`).
- **Spatial UI Layer**:
  - Base canvas: Tinted foundation (`#eef2f7`) in `src/index.css` and `src/theme.jsx`.
  - Ambient dynamic mesh: 4 multi-spectral atmospheric gradient orbs in `src/Layout.jsx` and `src/LoginGate.jsx` with light mode opacity `--mesh-opacity: 0.50` and Gaussian blur (`blur-[130px]` / `blur-[140px]`).
  - Spatial 3D Glass Cards: Translucent white crystalline glass (`rgba(255, 255, 255, 0.76)`), specular inner bevel highlight (`inset 0 1.5px 1px 0 rgba(255, 255, 255, 1), inset 0 0 0 1px rgba(255, 255, 255, 0.6)`), multi-tier elevation shadows (`0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -4px rgba(15,23,42,0.08), 0 20px 40px -12px rgba(15,23,42,0.06)`), and heavy backdrop blur (`backdrop-filter: blur(28px) saturate(190%)`).
  - Inner Bento Trays & Nested Panels: Frosted glass sub-containers with subtle inner shadows and borders.
  - High Contrast Typography & Badges: WCAG 2.1 AA compliant text tokens (`--text-sub: #52525b`, `--text-muted: #64748b`, high-contrast badge text `text-emerald-700`, `text-amber-800`, `text-rose-700`, `text-sky-700`, `text-zinc-700`).

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | Dynamic Vibrant Canvas & Mesh System | Lively atmospheric gradient mesh background for Light Mode (`--mesh-opacity: 0.50`, vibrant 4 orbs) | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 2 | Core CSS Variable & Theme Token Alignment | Updated `.theme-light` variables in `src/index.css` and `src/theme.jsx` for 3D glass, borders, shadows, text | M1 | ORIGINAL_REQUEST §R1, §R2 | DONE |
| 3 | 3D Spatial Glass Card Architecture | Specular top inner highlights, multi-layer drop shadows, perimeter borders, and backdrop blur in `.ios-glass-card` | M1 | ORIGINAL_REQUEST §R2 | DONE |
| 4 | Component & Page Card Upgrades | Upgrade all cards, widgets, KPI tiles, tables, panels, Bento rows across all pages (`Finance`, `Reliability`, `AutoPricing`, `Settings`, `PricingPage`, `KpiCard`, `DataTable`) | M2 | ORIGINAL_REQUEST §R2 | DONE |
| 5 | Navigation & Overlay Spatial Glass | Upgrade `Topbar.jsx`, `Sidebar.jsx`, `CommandPalette.jsx`, `ModelDetailDrawer.jsx`, `Toast.jsx`, `LoginGate.jsx` with iOS 26 glass aesthetic | M2 | ORIGINAL_REQUEST §R2 | DONE |
| 6 | WCAG 2.1 AA Contrast Compliance | Ensure all text, muted labels, KPI numbers, badges, and chart legends maintain strict ≥4.5:1 contrast against light glass | M3 | ORIGINAL_REQUEST §R3 | DONE |
| 7 | Impeccable Anti-Pattern Elimination | Run `npx impeccable detect frontend/src` and eliminate all design/contrast anti-patterns (0 issues) | M3 | ORIGINAL_REQUEST Acceptance Criteria | DONE |
| 8 | Full Vitest Test Suite Verification | Verify all 15 test files and 65 tests in `frontend/` pass with 100% success (zero regressions) | M4 | ORIGINAL_REQUEST Acceptance Criteria | DONE |
| 9 | Production Build Verification | Verify `npm run build` completes cleanly with exit code 0 | M4 | ORIGINAL_REQUEST Acceptance Criteria | DONE |
| 10 | Adversarial Review & Forensic Audit | Independent review by 2 reviewers, empirical challenge by 2 challengers, and integrity audit by forensic auditor | M4 | Orchestration Governance | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Global Theme & Dynamic Background System | `src/index.css`, `src/theme.jsx`, `src/components/Layout.jsx` | none | DONE |
| M2 | 3D Spatial Glass & Component Styling | All cards, widgets, tables, panels, navigation, modals in `src/components/` and `src/pages/` | M1 | DONE |
| M3 | Legibility & WCAG Contrast Hardening | Text contrast, `Badge.jsx`, charts, inputs, `npx impeccable detect` zero-defect gate | M2 | DONE |
| M4 | Verification, Adversarial Hardening & Audit | `npm run build`, `npx vitest run` (65/65), adversarial reviews, forensic integrity audit | M3 | DONE |

## Code Layout
- `frontend/src/index.css`: Global CSS custom properties, utility classes, `.ios-glass-card`, `.theme-light`, `.theme-dark`, mesh animation rules.
- `frontend/src/theme.jsx`: JavaScript theme definitions (`THEMES.light`, `THEMES.dark`) and runtime injection.
- `frontend/src/components/Layout.jsx`: Ambient background mesh orbs and top-level spatial container.
- `frontend/src/components/`: Core reusable components (`KpiCard.jsx`, `DataTable.jsx`, `Badge.jsx`, `Topbar.jsx`, `Sidebar.jsx`, `SlideToConfirm.jsx`, `CommandPalette.jsx`, `Toast.jsx`, `ModelDetailDrawer.jsx`, `Skeleton.jsx`, `Sparkline.jsx`, `FinanceStatus.jsx`).
- `frontend/src/pages/`: Feature hubs (`Finance.jsx`, `Reliability.jsx`, `AutoPricing.jsx`, `Settings.jsx`, `PricingPage.jsx`, `LoginGate.jsx`).
