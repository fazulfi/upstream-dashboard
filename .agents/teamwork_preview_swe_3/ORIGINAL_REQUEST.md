# Original User Request

## Initial Request — 2026-08-23T21:15:04+07:00

You are teamwork_preview_swe.
Your working directory is: c:\Users\faizz\upstream-dashboard\.agents\teamwork_preview_swe_3
The project workspace root is: c:\Users\faizz\upstream-dashboard\frontend (and repo root c:\Users\faizz\upstream-dashboard)
Original request is located at: c:\Users\faizz\upstream-dashboard\.agents\ORIGINAL_REQUEST.md

Task Details:
# Teamwork Project — Mobile Touch Gestures (Swipe-to-Close)

This is a single self-contained fix; keep it small and focused.

Working directory: c:\Users\faizz\upstream-dashboard\frontend
Integrity mode: development

Implement native mobile touch gestures (Swipe-to-Close) for the Sidebar and Floating Sheets in a React/Tailwind application to match iOS 26 behavior. The project already has `motion/react` (Framer Motion) installed — use ONLY that library.

## Requirements

### R1. ModelDetailDrawer Swipe-to-Close
The file `src/components/ModelDetailDrawer.jsx` already has a `motion.div` with `initial={{ y: '100%' }}`. Add `drag="y"`, `dragConstraints={{ top: 0, bottom: 0 }}`, `dragElastic={{ top: 0, bottom: 0.8 }}`, and `onDragEnd` that calls `onClose()` if `info.offset.y > 100 || info.velocity.y > 500`. Also ensure the drag handle div (`.ios-sheet-handle`) has `cursor: grab` styling.

### R2. Sidebar Swipe-to-Close  
The file `src/components/Sidebar.jsx` currently uses a CSS `<aside>` element. Convert it to use `motion.aside` from `motion/react` and add `drag="x"` with `dragConstraints={{ left: 0, right: 0 }}`, `dragElastic={{ left: 0.8, right: 0 }}`, and `onDragEnd` that calls `onClose()` if `info.offset.x < -80 || info.velocity.x < -300`. Only apply drag when `isOpen` is true.

## Acceptance Criteria
- [ ] `npm run build` completes successfully in the `frontend/` directory.
- [ ] `npx vitest run` passes all existing tests.
- [ ] `ModelDetailDrawer.jsx` has Framer Motion `drag="y"` on its sheet element.
- [ ] `Sidebar.jsx` uses `motion.aside` with `drag="x"` when open.

Execute the SWE Light workflow: spawn teamwork_preview_implementer, then reviewer rounds. Report back when complete.
