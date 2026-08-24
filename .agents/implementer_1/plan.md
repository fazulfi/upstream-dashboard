# Implementation Plan: Apple iOS 26 / VisionOS UI/UX Upgrade

## Objective
Upgrade the frontend UI/UX to authentic Apple iOS 26 and VisionOS design paradigms:
1. **3D Spring Physics**: Add authentic cubic-bezier spring transitions, hover/active scale interactions, and tactile depths to `.ios-glass-card`, `.ios-btn-primary`, `.ios-btn-secondary`, and menu/nav items.
2. **Authentic Apple Typography**: Enforce Apple SF Pro font stack, antialiased subpixel smoothing, tight tracking on body and headings, and crisp tabular numbers.
3. **Translucent Vibrant Text Materials**: Define `.text-vibrant-secondary` and material tiers (`.text-vibrant-primary`, `.text-vibrant-tertiary`, `.text-vibrant-quaternary`) with exact rgba translucency values for both dark and light modes.
4. **Verification**: Run `npm run build` and `npx vitest run` to ensure flawless rendering and 100% test pass rate.

## Task Breakdown
- [x] Task 1: Refactor and enhance `src/index.css` with 3D Spring Physics curves, authentic SF Pro typography stack, and translucent vibrant text material classes/custom properties.
- [x] Task 2: Review and enhance relevant components (`Sidebar.jsx`, `Topbar.jsx`, `KpiCard.jsx`, etc.) to leverage translucent vibrant text and spring physics.
- [x] Task 3: Execute `npm run build` to verify production assets compile cleanly.
- [x] Task 4: Execute `npx vitest run` across all test suites to confirm full test suite green.
- [x] Task 5: Document progress and briefing, and submit completion report.
