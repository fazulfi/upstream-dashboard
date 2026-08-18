# QA Review — Phase 1 Reliability

**Verdict: FAIL for release gate; local verification PASS**

## Paths reviewed
- Backend tests: `backend/tests/`, including `test_reliability_api.py` and `test_db_schema.py`.
- Daemon tests: `scripts/tests/test_self_undercut.py`.
- Frontend tests: `frontend/src/**/*.test.jsx`.
- Build/lint configuration: `frontend/package.json`, `.github/workflows/ci.yml`.

## Executed evidence
- `python -B -m pytest backend/tests -q -p no:warnings` — exit 0; 64 passed.
- `python -B -m pytest backend/tests/test_reliability_api.py backend/tests/test_db_schema.py -v -p no:warnings` — exit 0; 10 passed.
- First daemon command without configuration failed during import with `RuntimeError: UPSTREAM_DB must be configured`; the shell pipeline masked the displayed status. This is an environment prerequisite, not a passing test result.
- Re-run with non-production test DSN: `UPSTREAM_DB=postgresql://test:test@127.0.0.1:5432/test python -B -m unittest scripts.tests.test_self_undercut -v` — exit 0; 53 passed.
- `cd frontend && npm test -- --run` — exit 0; Vitest passed.
- `cd frontend && npm run build` — exit 0; Vite build passed, warning about a >500 kB chunk.
- `git diff --check HEAD` — exit 0.

## QA gaps and blockers
- No browser smoke test was executed for login, responsive layout, keyboard navigation, ARM/DISARM, SSE reconnect, stale-state display, or session expiry.
- No live backend/PostgreSQL/SSE integration or deployment smoke test was executed.
- No CI run exists for the current uncommitted tree; local results are not CI evidence.
- No 24-hour observation, signed telemetry, production browser evidence, or rollback rehearsal exists.
- Coverage output shows the new reliability page at 0% in the standard Vitest run; this is a test-coverage gap even though the suite exits 0.

## Conclusion
Automated local tests and build are green, but QA completion is FAIL because required browser, deployment, CI, and 24-hour evidence is absent. No production readiness claim is made.