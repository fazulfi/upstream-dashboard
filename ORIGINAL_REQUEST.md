# Original User Request

## 2026-08-23T10:17:34Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
Requested team: A small focused team

The user wants to fix the  iOS 26 Light Mode UI because the cards currently blend into the vibrant background and look flat. The goal is to make every card highly distinct and clearly separated from the background using strong 3D borders, deeper drop shadows, and clear glass layering, ensuring the boxes are undeniably visible.

This is a single self-contained fix; keep it small and focused.

Working directory: c:\Users\faizz\upstream-dashboard\frontend
Integrity mode: development

## Requirements

### R1. Aggressive Card Separation in Light Mode
Modify index.css (.ios-glass-card and .theme-light variables) to ensure cards never blend into the vibrant mesh background. The user explicitly stated: tiap card masih menyatu dengan background (every card still blends with the background). You must establish undeniable, highly visible boundaries for every box.

### R2. Deep 3D Float and Borders
Implement a combination of distinct borders (e.g., a solid or high-opacity stroke) and deep, dark drop shadows to make the cards float aggressively above the background. The current subtle shadows are failing to provide enough contrast against the light mesh.

### R3. Maintain Test Integrity
Do not break existing layout structures or React components. 

## Acceptance Criteria

### Verification
- [ ] 
pm run build completes successfully.
- [ ] 
px vitest run passes all 65 existing tests (no component logic broken).
- [ ] Light Mode cards feature a mathematically distinct drop shadow (e.g., opacity > 0.1) and a visible border that guarantees separation from the background mesh.
