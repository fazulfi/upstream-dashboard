# Review Phase 3 Plan: Apple iOS 26 / VisionOS UI/UX Verification

## Objectives
1. Perform an independent, adversarial audit of all Apple iOS 26 / VisionOS UI/UX requirements:
   - **3D Spring Physics**: cubic-bezier curves (`cubic-bezier(0.16, 1, 0.3, 1)` and `cubic-bezier(0.34, 1.56, 0.64, 1)`), hover/active scales on cards, primary/secondary/danger buttons, pills, navigation links, and badges.
   - **Authentic Apple Typography**: System SF Pro text stack (`-apple-system`, `BlinkMacSystemFont`, `SF Pro Display`, `SF Pro Text`, `SF Pro Rounded`), subpixel antialiasing smoothing, and tight letter-spacing tracking (`-0.015em` / `-0.025em`).
   - **Translucent Vibrant Text Materials**: `.text-vibrant-*` system with rgba values (`rgba(235, 235, 245, 0.65)` for dark, `rgba(60, 60, 67, 0.65)` for light) across stylesheets and `theme.jsx`.
2. Inspect and fix any gaps or inconsistencies:
   - Ensure `Badge.jsx` incorporates `ios-badge` and `badge` classes.
   - Ensure interactive modal lists (e.g. `CommandPalette.jsx`) have `ios-menu-item` spring transitions.
   - Ensure buttons across `Settings.jsx`, `Finance.jsx`, `ModelDetailDrawer.jsx`, `DataTable.jsx`, and `PricingPage.jsx` utilize standard iOS spring classes (`ios-btn-primary`, `ios-btn-secondary`, `ios-btn-danger`, `ios-icon-btn`).
   - Ensure `THEMES` in `theme.jsx` includes runtime mapping for vibrant text variables.
   - Remove any corrupted or syntax-violating CSS trailing text in `index.css`.
3. Validate build (`npm run build`) and test suite (`npx vitest run`).
4. Maintain `progress.md`, `plan.md`, and `BRIEFING.md` in `.agents/reviewer_3`.
5. Send structured final review report via `send_message`.

## Execution Steps
- [x] Phase 1: Derive requirements independently and inspect codebase.
- [x] Phase 2: Identify edge cases, missing spring physics classes, and unsynchronized variables.
- [x] Phase 3: Apply targeted precision refinements to components and theme constants.
- [x] Phase 4: Run full production build and test suites to verify 0 regressions.
- [x] Phase 5: Update documentation and deliver structured review report.
