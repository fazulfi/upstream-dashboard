# Plan: iOS 26 / VisionOS Unified Glass Mode Overhaul

## Goal
Unify Light Mode and Dark Mode across the dashboard to perfectly match the "iOS 26" / VisionOS aesthetic:
1. **R1. VisionOS Unified Glass Material**:
   - Light Mode (`.theme-light`): Highly transparent light frost (`--card-bg: rgba(255, 255, 255, 0.15)`) with heavy blur (`blur(60px) saturate(180%)`).
   - Dark Mode (`.theme-dark`): Dark frost (`--card-bg: rgba(30, 30, 30, 0.45)`) with the same heavy blur.
   - Signature specular inner highlight (`inset 0 1px 1px 0 rgba(255, 255, 255, 0.25)`) and deep outer shadow.
2. **R2. Typography & Nested Elements**:
   - Light Mode text: dark (`#1c1c1e`); Dark Mode text: white (`#ffffff`).
   - Nested elements (search bars, inner KPI cards, buttons) use flat translucent overlays (`rgba(0,0,0, 0.05)` in Light Mode, `rgba(255,255,255, 0.1)` in Dark Mode) without second `backdrop-filter`.
3. **R3. Ambient Mesh Softening**:
   - Soften ambient mesh gradient in `Layout.jsx` or `index.css` so it glows dynamically without overpowering cards.
4. **Verification & Quality**:
   - `npm run build` succeeds cleanly.
   - `npx vitest run` passes all 65 tests.
   - Full review, adversarial challenge, and forensic audit gate pass.

## Execution Steps

### Step 0: Survey & Technical Exploration (Parallel Explorers)
- Spawn 3 Explorers (`explorer_1`, `explorer_2`, `explorer_3`) to analyze:
  1. CSS tokens, `.ios-glass-card`, `.theme-light`, `.theme-dark` in `frontend/src/index.css` and `frontend/src/theme.jsx`.
  2. Ambient mesh configuration in `frontend/src/components/Layout.jsx` and `LoginGate.jsx`.
  3. Nested components, inputs, buttons, tables, drawers, palette to identify any nested `backdrop-filter` or conflicting styles.
  4. Test suite status in `frontend/` and potential impact on tests.

### Step 1: Synthesize Findings & Dispatch Worker
- Worker updates `frontend/src/index.css`, `frontend/src/theme.jsx`, `frontend/src/components/Layout.jsx`, and any components requiring nested overlay adjustments.
- Worker executes `npm run build` and `npx vitest run`.

### Step 2: Independent Review (2 Reviewers)
- Spawn 2 Reviewers to independently evaluate:
  - Visual styling, glass translucency, specular highlight, dark drop shadow.
  - WCAG contrast adherence (dark text in light mode, white text in dark mode).
  - No double `backdrop-filter` on nested elements.
  - Test suite passing (65/65) and clean production build.

### Step 3: Adversarial Challenge (2 Challengers)
- Spawn 2 Challengers to probe edge cases:
  - Theme switching stress, nested component hierarchy visual clarity.
  - Negative/edge cases, layout regressions.

### Step 4: Forensic Audit (1 Auditor)
- Spawn Forensic Auditor (`teamwork_preview_auditor`) to verify zero cheating, genuine implementation, and clean integrity.

### Step 5: Gate Check & Delivery
- Verify all pass criteria.
- Update `PROJECT.md`, `progress.md`, write `handoff.md`, and report completion.
