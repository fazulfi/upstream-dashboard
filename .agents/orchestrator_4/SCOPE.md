# Scope: iOS 26 Liquid Glass Deformation + Haptic Spring Feedback

## Architecture & Code Layout
- HTML Entry Point: `frontend/index.html` (add hidden SVG filter `<filter id="liquid-lens">`)
- Global Styles: `frontend/src/index.css`
  - `.ios-btn-glass` and `::before` specular highlight shift on hover, `:active` SVG `filter: url(#liquid-lens)` and scale compression.
  - `.ios-glass-card` with `cubic-bezier(0.34, 1.56, 0.64, 1)` spring bounce, hover `scale(1.015)` lift + floating shadow, active `scale(0.97)` compression + shifted inset shadow.
- Component Integration: `frontend/src/components/KpiCard.jsx` (remove conflicting inline transitions)
- Test Suite: `frontend/src/theme.test.jsx` (and any new style assertions)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | SVG Filter Definition | `<filter id="liquid-lens">` with feTurbulence, feDisplacementMap, feSpecularLighting in `index.html` | M2 | Parent Spec & Survey |
| 2 | Liquid Glass Specular Highlight | `.ios-btn-glass::before` specular highlight gradient shifting on hover | M2 | ORIGINAL_REQUEST §2026-08-23T16:02:23Z |
| 3 | Liquid Glass Active Distortion | `.ios-btn-glass:active` CSS SVG `filter: url(#liquid-lens)` lensing/warp deformation | M2 | ORIGINAL_REQUEST §2026-08-23T16:02:23Z |
| 4 | Haptic Card Press & Inset Shift | `.ios-glass-card:active` compressing `scale(0.97)` + shifting inner highlight shadow | M2 | ORIGINAL_REQUEST §2026-08-23T16:02:23Z |
| 5 | Haptic Card Spring Bounce | Release spring transition with `cubic-bezier(0.34, 1.56, 0.64, 1)` | M2 | ORIGINAL_REQUEST §2026-08-23T16:02:23Z |
| 6 | Haptic Card Hover Floating Lift | `.ios-glass-card:hover` subtle `scale(1.015)` lift + lighter shadow | M2 | ORIGINAL_REQUEST §2026-08-23T16:02:23Z |
| 7 | Build & Vitest Verification | `npm run build` and `npx vitest run` passing cleanly | M3 | ORIGINAL_REQUEST §2026-08-23T16:02:23Z |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Survey & Technical Exploration | Codebase analysis of styles, SVG filters, cards, and buttons | none | DONE |
| 2 | Implementation of Liquid Glass & Spring Physics | Edit `index.html`, `src/index.css`, `src/components/KpiCard.jsx`, update tests | M1 | IN_PROGRESS |
| 3 | Testing, Review, Challenge & Audit | Vitest suite verification, multi-agent review, challenge, and forensic audit | M2 | PLANNED |
