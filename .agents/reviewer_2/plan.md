# Review Round 2 Plan — Apple iOS 26 / VisionOS Design System Verification

## Objective
Adversarially audit, break, and verify the Apple iOS 26 / VisionOS UI/UX design paradigm upgrade in the rontend application (src/index.css, components, and pages):
1. **3D Spring Physics** for interactions across all buttons, glass cards, pills, menu items, tabs, badges, table rows, and interactive elements.
2. **Authentic Apple Typography** (SF Pro text stack, antialiased smoothing, tight tracking, monospace stacks).
3. **Translucent Vibrant Text Materials** (.text-vibrant-secondary and full material hierarchy for light/dark modes).
4. Full validation with 
pm run build and 
px vitest run with zero test regressions or warnings.

## Verification Checklist
- [x] Run full test suite (
px vitest run): 15 suites, 65 tests passing.
- [x] Run production build (
pm run build): Vite build clean in < 1.6s.
- [x] Audit src/index.css for typography @theme, vibrant text classes, spring physics cubic-bezier curves, hover/active scale states, Apple focus rings, and reduced motion accessibility.
- [x] Audit src/theme.jsx for light/dark theme variable synchronization with vibrant material rgba values.
- [x] Audit src/components/LoginGate.jsx and eliminate unhandled JSDOM window.scrollTo warnings by refactoring to native GPU-composited CSS transitions.
- [x] Test coverage across all pages (Reliability, Finance, AutoPricing, Settings, PricingPage).
