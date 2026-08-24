# Adversarial Review Plan - Reviewer 1 (Round 1)

## 1. Independent Requirements Derivation
- **3D Spring Physics**: Verify fluid physics transitions (`cubic-bezier(0.16, 1, 0.3, 1)` and `cubic-bezier(0.34, 1.56, 0.64, 1)`), hover lift/scale, and tactile active press compression on `.ios-glass-card`, `.ios-btn-primary`, `.ios-btn-secondary`, `.btn-primary`, `.btn-secondary`, `.sidebar nav a`, `.ios-glass-nav nav a`, `.ios-menu-item`, and `.ios-pill-active`.
- **Authentic Apple Typography**: Enforce SF Pro font stack across CSS base and Tailwind v4 `@theme`, subpixel antialiasing (`-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale`), and tight letter-spacing (`-0.015em` body, `-0.025em` headings).
- **Translucent Vibrant Text Materials**: Support `.text-vibrant-secondary`, `.text-vibrant-primary`, `.text-vibrant-tertiary`, and `.text-vibrant-quaternary` with appropriate RGBA variables for light (`rgba(60, 60, 67, ...)`) and dark (`rgba(235, 235, 245, ...)`) modes.
- **Accessibility & Motion Preference**: Support Apple focus-visible rings (`outline: 2px solid #0a84ff`) and `@media (prefers-reduced-motion: reduce)`.
- **Verification**: Run `npm run build` and `npx vitest run` in `frontend` (all 15 test suites and 65 tests passing).

## 2. Attack & Quality Review
- [x] Check for conflicting inline Framer Motion hover handlers vs CSS 3D spring physics in `KpiCard.jsx`.
- [x] Check for redundant/conflicting color utility classes (e.g. `text-[var(--text-sub)] text-vibrant-secondary`).
- [x] Check if Tailwind v4 font theme incorporates the SF Pro stack.
- [x] Check if generic `.btn-primary` and `.btn-secondary` inherit iOS 3D spring physics.
- [x] Check reduced motion handling and focus rings.

## 3. Verification & Sign-off
- [x] Execute Vite production build (`npm run build`).
- [x] Execute Vitest automated tests (`npx vitest run`).
- [x] Maintain `plan.md`, `progress.md`, and `BRIEFING.md`.
- [x] Report final structured review back via `send_message`.
