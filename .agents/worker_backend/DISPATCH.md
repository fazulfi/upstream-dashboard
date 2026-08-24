## 2026-08-23T17:29:17Z

You are a Worker subagent for the Backend & API layer (Milestone M1).
Your working directory is: c:\Users\faizz\upstream-dashboard\.agents\worker_backend
Authoritative user request: c:\Users\faizz\upstream-dashboard\.agents\ORIGINAL_REQUEST.md
Master plan: c:\Users\faizz\upstream-dashboard\.agents\orchestrator_5\plan.md
Backend analysis: c:\Users\faizz\upstream-dashboard\.agents\explorer_backend\analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task & scope ownership:
You EXCLUSIVELY own:
- `backend/app.py`
- `frontend/src/hooks/useApi.jsx`

Do NOT touch any frontend page or component files (`Analytics.jsx`, `Logs.jsx`, `Sidebar.jsx`, etc.) as they are owned by Worker 2.

Instructions:
1. Read the analysis report `c:\Users\faizz\upstream-dashboard\.agents\explorer_backend\analysis.md`.
2. Update `backend/app.py`:
   - Add/update routes:
     - `GET /api/usage/breakdown` (and retain alias `/api/breakdown`)
     - `GET /api/usage/cache-stats`
     - `GET /api/usage/logs` (support query params: `range`, `page`, `pageSize`, `model`, `status`, `sort`, `dir`)
     - `GET /api/usage/logs-models` (and alias `/api/usage/logs/models`)
   - Ensure all routes forward query parameters properly to `inferhub_get(...)`.
   - Provide structured, robust fallback responses when `inferhub_get(...)` returns `None` (upstream offline/dev mode) to ensure the backend NEVER returns 500. Preserve `error: "unavailable"` in fallback objects where expected by tests while returning empty rows arrays and zero totals.
3. Update `frontend/src/hooks/useApi.jsx`:
   - Add `'/api/usage'` to `FOCUSED_API_PREFIXES`.
   - Add `'/api/breakdown'` to `MANUAL_ASK_PATHS`.
   - Ensure `isApiEnabled(path)` strips query parameters before matching (`path.split('?')[0]`).
4. Run backend tests if available (`pytest backend/tests` using run_command).
5. Document all changes in `c:\Users\faizz\upstream-dashboard\.agents\worker_backend\changes.md` and handoff report in `c:\Users\faizz\upstream-dashboard\.agents\worker_backend\handoff.md`.
6. Send a message to parent upon completion.
