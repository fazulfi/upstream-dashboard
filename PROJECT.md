# Project: iOS 26 / VisionOS Unified Glass Mode Overhaul

## Architecture
- **Framework**: React 19 + Vite 6 + Tailwind CSS v4 (`@tailwindcss/vite`, `@import "tailwindcss"`).
- **Theme System**: Dual-layer theme architecture — CSS variables in `src/index.css` (`.theme-light`, `.theme-dark`, `.ios-glass-card`, `.ios-glass-nav`) combined with JavaScript theme context in `src/theme.jsx` (`THEMES` dictionary, `ThemeContext`).
- **VisionOS Spatial UI Layer**:
  - Base canvas: Tinted foundation (`#eef2f7` in Light Mode, `#09090b` in Dark Mode).
  - Ambient dynamic mesh: Softened atmospheric gradient mesh in `src/components/Layout.jsx` and `src/components/LoginGate.jsx` with light mode opacity `--mesh-opacity: 0.20`, dark mode opacity `--mesh-opacity: 0.16`, and Gaussian blur (`blur-[140px]` / `blur-[150px]`) in an isolated GPU container.
  - Spatial VisionOS Glass Cards:
    - Light Mode: `--card-bg: rgba(255, 255, 255, 0.15)`, `backdrop-filter: blur(60px) saturate(180%)`, specular inner highlight `inset 0 1px 1px 0 rgba(255, 255, 255, 0.25)`, drop shadow `0 16px 36px -8px rgba(15, 23, 42, 0.10), 0 4px 12px -2px rgba(15, 23, 42, 0.05)`.
    - Dark Mode: `--card-bg: rgba(30, 30, 30, 0.45)`, `backdrop-filter: blur(60px) saturate(180%)`, specular inner highlight `inset 0 1px 1px 0 rgba(255, 255, 255, 0.25)`, drop shadow `0 16px 40px -10px rgba(0, 0, 0, 0.6), 0 4px 16px -2px rgba(0, 0, 0, 0.4)`.
  - Nested Elements & Controls: Flat translucent overlays (`bg-black/5 dark:bg-white/5` or `var(--input-bg)`), strictly zero second-layer `backdrop-filter` or `backdrop-blur-*` on nested children.
  - High Contrast Typography: WCAG 2.1 AA and AAA compliant text tokens (`--text-main: #1c1c1e` in Light Mode, `#ffffff` in Dark Mode, `--text-sub: #52525b`, `--text-muted: #64748b`).

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | VisionOS Unified Glass Material | Authentic translucent glass (`rgba(255,255,255,0.15)` light, `rgba(30,30,30,0.45)` dark) with `blur(60px) saturate(180%)`, specular highlights, and drop shadows in `index.css` & `theme.jsx` | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 2 | Typography & Contrast Token Alignment | Dark text (`#1c1c1e`) in Light Mode and white text (`#ffffff`) in Dark Mode with synchronized tokens in `index.css` & `theme.jsx` (contrast > 13:1) | M1 | ORIGINAL_REQUEST §R2 | DONE |
| 3 | Ambient Mesh Softening & Isolation | Soften ambient mesh in `Layout.jsx` and `LoginGate.jsx` with `--mesh-opacity: 0.20`/`0.16` and isolated container | M1 | ORIGINAL_REQUEST §R3 | DONE |
| 4 | Elimination of Nested Backdrop Blurs | Remove all 7 nested `backdrop-blur-xl` rules on `thead` and `nav` elements across `Topbar.jsx`, `Finance.jsx`, `Reliability.jsx`, `AutoPricing.jsx`, `PricingPage.jsx` | M2 | ORIGINAL_REQUEST §R2 | DONE |
| 5 | Flat Translucent Overlays on Nested Elements | Convert high-opacity `bg-white/80` nested cards/inputs/buttons in `Finance.jsx`, `AutoPricing.jsx`, `Settings.jsx`, `PricingPage.jsx`, `DataTable.jsx`, `ModelDetailDrawer.jsx` to flat translucent overlays | M2 | ORIGINAL_REQUEST §R2 | DONE |
| 6 | Vitest Test Suite Verification (65/65) | Verify all 15 test files and 65 tests in `frontend/` pass with 100% success (zero regressions) | M3 | ORIGINAL_REQUEST Acceptance Criteria | DONE |
| 7 | Production Build Verification | Verify `npm run build` completes cleanly with exit code 0 | M3 | ORIGINAL_REQUEST Acceptance Criteria | DONE |
| 8 | Independent Review, Adversarial Challenge & Forensic Audit | Verification by 2 Reviewers, 2 Challengers, and Forensic Auditor (all passed / clean) | M3 | Orchestration Governance | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | VisionOS Theme, Global CSS & Ambient Mesh | `src/index.css`, `src/theme.jsx`, `src/components/Layout.jsx`, `src/components/LoginGate.jsx` | none | DONE |
| M2 | Nested Overlays & Double-Blur Removal | `src/components/Topbar.jsx`, `src/components/ModelDetailDrawer.jsx`, `src/components/DataTable.jsx`, `src/pages/Finance.jsx`, `src/pages/AutoPricing.jsx`, `src/pages/Reliability.jsx`, `src/pages/Settings.jsx`, `src/components/PricingPage.jsx` | M1 | DONE |
| M3 | Verification, Adversarial Hardening & Forensic Audit | `npm run build`, `npx vitest run` (65/65), 2 Reviewers (APPROVE), 2 Challengers (APPROVE), Forensic Integrity Audit (CLEAN) | M1, M2 | DONE |

## Code Layout
- `frontend/src/index.css`: Global CSS custom properties, utility classes, `.ios-glass-card`, `.theme-light`, `.theme-dark`, mesh variables.
- `frontend/src/theme.jsx`: JavaScript theme definitions (`THEMES.light`, `THEMES.dark`) and runtime injection.
- `frontend/src/components/Layout.jsx`: Ambient background mesh container and layout shell.
- `frontend/src/components/LoginGate.jsx`: Login gate with ambient background mesh container.
- `frontend/src/components/`: Reusable components (`Topbar.jsx`, `Sidebar.jsx`, `DataTable.jsx`, `ModelDetailDrawer.jsx`, `CommandPalette.jsx`, `PricingPage.jsx`, `Badge.jsx`, `Toast.jsx`).
- `frontend/src/pages/`: Page views (`Finance.jsx`, `Reliability.jsx`, `AutoPricing.jsx`, `Settings.jsx`).
