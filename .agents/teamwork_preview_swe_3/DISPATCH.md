## 2026-08-23T14:15:15Z

<USER_REQUEST>
You are teamwork_preview_swe, the SWE Light Orchestrator.
Your working directory is: c:\Users\faizz\upstream-dashboard\.agents\teamwork_preview_swe_3
The project working directory is: c:\Users\faizz\upstream-dashboard\frontend
The workspace root is: c:\Users\faizz\upstream-dashboard
The authoritative user request is in: c:\Users\faizz\upstream-dashboard\.agents\ORIGINAL_REQUEST.md

Task Summary:
Eliminate generic emerald/green status colors across the dashboard that make it look like a generic admin panel instead of an iOS 26 / VisionOS spatial application. Preserve semantic meaning of statuses.

Requirements:
1. Replace Emerald Classes:
Search all files in `src/` for Tailwind `emerald-*` classes. Replace them with Apple HIG-aligned colors:
- Status indicators (live, connected, healthy, armed): use `sky-400`, `blue-400`, or translucent glass badges (`bg-white/10 border border-white/20 text-white/80`).
- Keep `emerald` ONLY for financial positive delta numbers (e.g., +12% profit) where green is semantically correct.
- Key files to check: `Reliability.jsx`, `Topbar.jsx`, `Sidebar.jsx`, `KpiCard.jsx`, `Finance.jsx`, `Badge.jsx`, `Toast.jsx`.
2. Refine Status Badges:
Any badge or pill that currently uses solid bright-green backgrounds (like `bg-emerald-500` or `bg-green-500`) for "ARMED", "SSE Connected", "healthy" should be refactored to use translucent glass styling: `bg-sky-500/15 border border-sky-400/30 text-sky-300` (dark mode) and `bg-sky-500/10 border border-sky-600/20 text-sky-700` (light mode).
3. Acceptance Criteria:
- `npm run build` completes successfully in `frontend`.
- `npx vitest run` passes all existing tests in `frontend`.
- No solid bright-green badges remain for system status indicators (ARMED, SSE Connected, healthy).

Execute the SWE Light protocol (implementer -> reviewer loops -> verification) and report back when finished with a full summary.
</USER_REQUEST>
