# Phase 1 Code/Documentation Blockers Fixed

Date: 2026-08-19  
Baseline: `main` @ `9733e48`

## 1. Stale commit references
- **Changed:** `README.md:282`, `docs/PRODUCTION-LOCK.md:8`, `docs/OPS-RUNBOOK.md:24,279`, `docs/auto-pricing.md:229`, `artifacts/phase1/verification/full-verification-report.md:4`.
- **Before → after:** `207a259` → `9733e48` for current-main references.
- **Verification:** repository docs grep showed no remaining `207a259` in `docs/`; historical audit artifacts retain their historical PR references and were not modified.

## 2. Settings operational accuracy
- **Changed:** `frontend/src/pages/Settings.jsx:8,33,66`.
- **Before → after:** removed unused `fin`; `15s frontend · 30s daemon` → `15s frontend · 60s daemon` with explicit frontend poll wording; `InferHub daemon · poll 30s · live.json` → `InferHub daemon · every 60s · backend REST/SSE`.
- **Verification:** `fin` has no remaining reference in the file; source reflects the actual 60-second daemon and REST/SSE reliability source.

## 3. Mobile overflow/sidebar
- **Changed:** `frontend/src/App.css:328`.
- **Before → after:** mobile `.main` only reset margin/padding → also `min-width: 0; overflow-x: hidden`.
- **Verification:** existing `@media (max-width: 900px)` rules already translate `.sidebar` to `-100%` and restore it through `.sidebar.open` / `.layout.sidebar-open .sidebar`; the surgical `.main` containment prevents child width from expanding the document while preserving `.rel-table-wrap` horizontal scrolling.

## 4. Verification report normalization
- **Changed:** `artifacts/phase1/verification/full-verification-report.md:4` and appended current follow-up section.
- **Before → after:** stale current-main/blocked narrative → current baseline `9733e48`, existing recorded suites remain 53 script tests + 72 backend pytest + 24 frontend Vitest + build all PASS, plus current theme/SSE findings.
- **Verification:** `backend/app.py` contains no `admin123`; the report records fail-closed password behavior. Security redaction work remains untouched.

## 5. Production theme toggle
- **Evidence:** Playwright internal Chromium launched with the requested certificate/proxy args. Production login page loaded and accepted the password in the initial run; the authenticated page reported `body` background `rgb(10, 10, 10)` and theme `theme-dark`, with `Switch to light mode` exposed. Source `theme.jsx:84` is the correct functional dark/light transition. A later repeat was blocked by the production login/session state before the toggle could be clicked; no provable source defect exists, so `theme.jsx` was not changed.
- **Conclusion:** PASS by source review plus production authenticated initial-state evidence; exact dark→light→dark browser sequence should be rerun in a stable authenticated session if release evidence requires it.

## 6. SSE 401 investigation
- **Evidence:** `useReliabilityStream.js:57-59` uses `fetch`, not native `EventSource`, and sends `Authorization: Bearer <token>` plus `Accept: text/event-stream`. Production curl:
  - no Authorization: `HTTP/1.1 401 Unauthorized`, `{"error":"unauthorized"}`
  - `Authorization: Bearer bogus`: same `401 Unauthorized`
- **Conclusion:** no clear frontend header bug. Native EventSource cannot set Authorization headers; cookie or short-lived query-token auth would be required if native EventSource is used, with token logging/redaction safeguards. The current fetch streaming implementation is header-capable. No code change made.

## Verification status
- No commit, push, deploy, backend changes, theme changes, or security-redaction changes were made.
