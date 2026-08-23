# Original User Request

## 2026-08-23T09:54:02Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: [none — teamwork routes from the description]

The user wants to completely overhaul the frontend Light Mode UI to match the exact aesthetic of "iOS 26" (highly futuristic, glassy, distinct boxes/cards). The current Light Mode looks too flat and faded, so the team must research iOS 26 design trends and implement a stunning, high-contrast, deeply glassy light mode.

Working directory: c:\Users\faizz\upstream-dashboard\frontend
Integrity mode: development

## Requirements

### R1. Implement "iOS 26" Spatial UI Light Mode
Completely overhaul the Light Mode styling in `index.css` and relevant components to match a highly futuristic, VisionOS-style spatial UI. The background should be a vibrant, dynamic mesh or gradient that feels alive, rather than a flat gray.

### R2. Deep 3D Glass & Card Separation
Cards must NOT blend into the background. Use deep 3D glass effects, heavy backdrop filters (`backdrop-filter: blur()`), specular inner highlights (e.g., `inset 0 1px 1px rgba(255,255,255,1)`), and overlapping drop shadows to create distinct layers. The user specifically complained that "kotak-kotaknya tidak kelihatan" (the boxes were invisible), so extreme care must be taken to ensure cards pop out from the background with clear 3D separation.

### R3. Maintain Legibility
Ensure all text, icons, and KPI numbers maintain strict WCAG contrast ratios against the glassy surfaces. Text must not wash out against the vibrant background.

## Acceptance Criteria

### Verification
- [ ] `npm run build` completes successfully in the `frontend/` directory.
- [ ] `npx vitest run` passes all 65 existing tests (no React component logic or test IDs are broken by the styling changes).
- [ ] `npx impeccable detect frontend/src` reports 0 contrast anti-patterns.
- [ ] Cards visibly feature a drop shadow and an inner border/highlight that separates them from the background.
