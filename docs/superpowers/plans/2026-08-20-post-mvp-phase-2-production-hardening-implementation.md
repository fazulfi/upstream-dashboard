# Post-MVP Phase 2 Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax.
>
> **Status: DRAFT — awaiting owner design approval (docs/superpowers/plans/2026-08-20-post-mvp-phase-2-production-hardening.md §7). No implementation step below is authorized until that approval is given.**

**Goal:** Harden the Phase 1 production surface: document the fetch-based SSE transport decision, add page-level frontend tests for critical paths (login, session-expiry, reliability landing, error states, responsive nav), centralize session-expiry handling in the API layer, produce deployment evidence artifacts, rehearse database restore on the VPS, and record credential/ignore hygiene audits as evidence.

**Architecture:** Frontend-only code changes + documentation + evidence tooling. The Flask backend, auto-pricing daemon, PostgreSQL schema, and pricing contract are **not modified**. New dev deps: `@testing-library/react`, `@testing-library/jest-dom`. Vitest environment moves to `jsdom` for component tests. Session-expiry is centralized in the existing `useApi.jsx` API layer via a `session-expired` CustomEvent; `LoginGate` reacts by clearing `upstream_session_token` and showing an explicit "session expired" message.

**Tech Stack:** React 19, Vite 8, React Router 7 (HashRouter), Vitest 3 + jsdom, React Testing Library, jest-dom, Oxlint, GitHub Actions CI (unchanged jobs, tests now include page-level render tests).

## Global Constraints

- Authoritative decisions: `artifacts/phase2/audit/decision-log.md` (C1–C14).
- **Production freeze** until design approval; then deploy only via CI + approved PR + manual deploy approval.
- **No backend, daemon, DB-schema, or pricing-contract change in Phase 2.** Scope = frontend code + docs + evidence tooling + VPS restore rehearsal.
- Deploy remains manual; CI stays CI-only (no CD).
- All 18 existing routes remain retained. No page is deleted.
- No new observation window (C13): this release does not change daemon/backend behavior.
- No force-push; no history rewrite (C11); secrets referenced by name only.
- UI may be polished; system architecture remains minimal. `docs/architecture/sse-transport.md` is documentation only (C8).

---

## Task 1: Freeze baseline and verify audit state

**Files:**
- Read: `docs/PRODUCTION-LOCK.md`, `docs/OPS-RUNBOOK.md`, `artifacts/phase2/audit/decision-log.md`, `frontend/package.json`, `frontend/vitest.config.js`, `frontend/src/hooks/useApi.jsx`, `frontend/src/components/LoginGate.jsx`, `.github/workflows/ci.yml`

- [ ] **Step 1: Verify baseline**

```bash
git status --short
git rev-parse HEAD origin/main
cd backend && python -B -m pytest tests -q -p no:warnings
cd ../frontend && npm test -- --run && npm run build
```

Expected: clean baseline (or documented pre-existing changes); all tests pass; build exits 0.

- [ ] **Step 2: Confirm audit evidence**

Confirm the P4/P5 audit results recorded in the decision log (no active password in history; `.gitignore` comprehensive; no tracked env/cache). If the live check contradicts the log, stop and raise.

- [ ] **Step 3: Commit baseline-only normalization (planning-only, no deploy)**

Commit planning artifacts (`artifacts/phase2/*`, `docs/superpowers/plans/2026-08-20-*`) on a feature branch. Do not deploy.

---

## Task 2: P1 — SSE transport documentation

**Files:**
- Create: `docs/architecture/sse-transport.md`

- [ ] **Step 1: Write the transport document**

Document (no runtime change):
- Why fetch-based SSE is used: native `EventSource` cannot send an `Authorization` header; query-token auth is prohibited (Phase 1 B5).
- Wire contract: `GET /api/reliability/stream`, `Accept: text/event-stream`, `Authorization: Bearer <session-token>`, optional `Last-Event-ID` cursor replay, bounded 1s→30s backoff, keepalive comments, cleanup on disconnect.
- Data flow: PostgreSQL is the durable source of truth; REST history (`/api/reliability/cycles|events|models|summary`) is the recovery path; in-process subscribers notify only.
- Client implementation pointer: `frontend/src/hooks/useReliabilityStream.js`; backend route pointer: `backend/app.py:2468`.
- Security notes: 401/403 → `auth-required`; secrets never in query strings; explicit origin allowlisting; no wildcard credentialed CORS.
- Future migration path: cookie-based credentials or short-lived token flow, with logging/redaction review.

- [ ] **Step 2: Cross-check against the live implementation**

Verify every claim in the doc against `useReliabilityStream.js` and the backend route (read-only). Correct the doc if the implementation differs.

- [ ] **Step 3: Lint/fix Markdown**

Run `npx markdownlint-cli2 docs/architecture/sse-transport.md` (if installed; otherwise `npx markdownlint-cli2@latest`) — **expected: 0 errors**. Fix any violations. Acceptance: the doc renders cleanly and every technical claim cross-checks against `frontend/src/hooks/useReliabilityStream.js` and the backend route (Step 2). Pass criteria: (a) no markdownlint errors; (b) a line-by-line read shows each claim (Bearer header, `Last-Event-ID`, backoff bounds, keepalive comments, 401/403 → `auth-required`, cursor key name) matches the implementation; (c) no secret values appear in the doc.

---

## Task 3: P2 — Page-level frontend test coverage

**Files:**
- Modify: `frontend/package.json` (dev deps), `frontend/vitest.config.js` (jsdom environment + setup file)
- Create: `frontend/src/test/setup.js`, `frontend/src/test/testUtils.jsx`
- Create/modify tests: `frontend/src/components/LoginGate.test.jsx`, `frontend/src/hooks/useApi.test.jsx` (extend), `frontend/src/components/Layout.test.jsx`, `frontend/src/components/Sidebar.test.jsx`, `frontend/src/pages/Reliability.test.jsx` (extend to render), `frontend/src/App.test.jsx`
- Test helper mocks: API fixtures for `/api/data`, `/api/login`, `/api/reliability/*`

- [ ] **Step 1: Add dev dependencies and jsdom environment**

```bash
cd frontend && npm install -D @testing-library/react @testing-library/jest-dom
```

Update `vitest.config.js`: `environment: 'jsdom'` (global) or per-file `// @vitest-environment jsdom`; add `setupFiles` registering jest-dom matchers and a `sessionStorage`/`fetch` reset.

- [ ] **Step 2: Write RED tests for LoginGate**

Cover: no token renders login form; empty password disables submit; successful login stores token (sessionStorage `upstream_session_token`) and reveals children; failed login renders the alert; session-expired event clears token and shows "session expired" message.

- [ ] **Step 3: Write RED tests for Reliability landing**

Mock `fetch` for `/api/reliability/summary|cycles|events|models` (REST recovery) and the SSE stream. Cover: loading/empty state; REST failure shows error; SSE `auth-required`; reconnect/error alert; ARM/DISARM success and failure (audit result surfaced).

- [ ] **Step 4: Write RED tests for Layout/Sidebar responsive nav**

Cover: route title; navigation links render; mobile menu button toggles `.sidebar.open`; active route state. (`Layout` always calls `useApi('/api/data', 15000)` — fixture it.)

- [ ] **Step 5: Write RED tests for App routing + session expiry**

Cover: protected landing (`/` → Reliability) renders after login; unauthenticated redirects to login; session-expired route returns to login with explicit message; render-error fallback.

- [ ] **Step 6: Extend useApi tests**

Cover: session token header injection; login request body; HTTP error state; abort behavior; centralized 401/403 handling (token cleared, `session-expired` event dispatched, no duplicate handling for the login endpoint itself).

- [ ] **Step 7: Run GREEN — full frontend suite**

```bash
cd frontend && npm test -- --run && npm run lint && npm run build
```

All new tests pass; existing unit tests still pass; coverage report includes the new page-level files.

---

## Task 4: P2b — Centralized session-expiry handling

**Files:**
- Modify: `frontend/src/hooks/useApi.jsx` (and/or `frontend/src/lib/` fetch wrapper), `frontend/src/components/LoginGate.jsx`
- Tests: covered in Task 3 (Step 2, 6)

- [ ] **Step 1: Add centralized 401/403 handling**

In the API layer's fetch path: if a request used the session bearer token and the response is 401 or 403, clear `upstream_session_token`, dispatch `window.dispatchEvent(new CustomEvent('session-expired'))`, and rethrow so callers keep their error states. The `/api/login` endpoint itself is excluded (its own 401 is a bad-password result, not expiry).

- [ ] **Step 2: Handle the session-expired event in LoginGate**

`LoginGate` listens for `session-expired`, shows an explicit "session expired" message, and returns to the login form. Preserve safe navigation context (current hash) where possible.

- [ ] **Step 3: Verify no stale-state display**

A disconnected/expired session must never silently present stale reliability data as current. Confirm the Reliability landing reflects `auth-required` and login is re-shown.

---

## Task 5: P3a — Deployment evidence tooling

**Files:**
- Read: `artifacts/phase1/audit/deployment-evidence-template.md`
- Create: `artifacts/phase2/deploy/` evidence template/tooling (scripts or checklist) following the Phase 1 template
- Possibly modify: `scripts/backup_db.sh` (only if a gap is found — e.g. checksum output; otherwise no change)

- [ ] **Step 1: Define the Phase 2 evidence artifact**

One artifact per release, following the Phase 1 template: backup taken (file path + sha256), schema additive check (no destructive DDL), systemd unit states (backend, auto-pricing, finance), readiness/auth/SSE smoke results, source commit (local == origin), operator signature.

- [ ] **Step 2: Add evidence-capture tooling**

Create `artifacts/phase2/deploy/capture-evidence.sh` (or a documented command list if a script is not viable). The capture must run with no secret input (auth via existing session where needed) and output `artifacts/phase2/deploy/evidence-<UTC-timestamp>.md` with exactly these generated fields:
- `timestamp` (UTC), `source_commit` (local HEAD + origin/main), `backup_file` + `backup_sha256` (from backup_db.sh output),
- `schema_additive_check` (git diff of `backend/db_schema.py` = empty, or non-destructive-only),
- `systemd_states` (backend/auto-pricing/finance: active, enabled, single PID for daemon),
- `smoke_results` (frontend 200, backend /health 200, login, reliability summary, SSE live),
- `operator_signature` (name + date).

Backup checksum: confirm `backup_db.sh` prints the file path, then add `sha256sum` output to the script only if missing (otherwise document the command). Expected dry-run output (local): a completed `evidence-<UTC-timestamp>.md` with all fields populated; any missing field fails the dry run.

- [ ] **Step 3: Dry-run evidence capture locally**

Run the capture locally against reachable endpoints (`https://ops.budgezen.com/health`, `https://upstream-static.vercel.app/`) and record the resulting artifact structure. Do not modify production.

---

## Task 6: P3b — Restore rehearsal on VPS

**Files:**
- Read: `scripts/backup_db.sh`, `docs/OPS-RUNBOOK.md` (backup section)
- VPS actions (manual, approved): scratch DB restore rehearsal
- Create: `artifacts/phase2/deploy/restore-rehearsal-evidence.md`

- [ ] **Step 1: Pre-flight — establish scratch-DB path (owner-confirmed gate, O3)**

On the VPS, confirm a non-destructive way to create a scratch database (e.g. `sudo -u postgres createdb upstream_restore_rehearsal` or a CREATEDB role for the app user). Record the working path. **STOP and obtain fresh owner confirmation before any scratch DB is created or dropped** (owner decision O3: pre-flight first, then re-confirm). If no admin path exists, stop and raise before proceeding.

- [ ] **Step 2: Take a fresh backup**

Run `scripts/backup_db.sh` on the VPS (or confirm the latest backup is fresh) and record file + sha256.

- [ ] **Step 3: Restore to scratch DB**

`zcat <backup>.sql.gz | psql <scratch-dsn>`; verify schema loads and no errors.

- [ ] **Step 4: Verify row counts and asset inventory**

Query the scratch DB: verify the owner-approved live baseline of **68 assets** (A-001..A-070), plus the operational tables that exist (`auto_pricing_ops` = 61532, `auto_pricing_api_log` = 29681, `budgets` = 92). `reliability_*` tables were not found in any of the three databases (`postgres`, `csa_paper`, or `upstream`) via `psql`; do not claim they were verified. Backend `/api/reliability/*` behavior will be proven by live smoke at deploy (T8c). Compare against production counts (read-only). The 68-asset live-baseline target was owner-approved on 2026-08-20 via question-tool option B, “Rehearsal ke baseline live (68 assets)”, superseding the C10 67-asset target.

- [ ] **Step 5: Drop scratch DB + record evidence**

Drop the scratch DB. Write `restore-rehearsal-evidence.md` with timestamps, commands, verification results, and operator signature. Confirm production DB untouched.

---

## Task 7: P4/P5 — Hygiene evidence recording

**Files:**
- Create: `artifacts/phase2/audit/credential-history-evidence.md`, `artifacts/phase2/audit/ignored-artifacts-evidence.md`

- [ ] **Step 1: Credential-history evidence**

Run (masked, read-only):

```bash
git log --oneline --all -S '<rotated-password-prefix>' -- .   # expected: 0 hits
git log --oneline --all -- '*.env*'                             # expected: 0 hits
git ls-files | grep -iE '\.env|\.pem|\.key|\.crt|credentials'   # expected: 0 hits (or only .env.example)
git show --stat bdd22b9 | head -30                              # confirm "remove secret leak" touched .gitignore + backend/app.py
git filter-repo --version 2>&1 | head -1                         # expected: "not a git command" (not installed)
```

Record: leak removed in `bdd22b9`; `DASHBOARD_PASSWORD` rotated (old value 401); `.dashboard-password` ignored. Conclusion: C11 — no purge in Phase 2; revisit only if a live credential appears in history. **Pass criteria:** the password-value search returns 0 hits; all other commands produce the expected outputs above. Fail = any live credential value found → stop and escalate.

- [ ] **Step 2: Ignored-artifacts evidence**

Run (read-only):

```bash
git ls-files | grep -iE '(^|/)(\.env|.*\.env$|__pycache__|node_modules|dist/|\.vercel|coverage|\.pytest_cache|\.venv|.*\.bak$)'  # expected: 0 hits
git status --porcelain | head -20                                 # expected: no tracked env/cache/artifacts
grep -cE '^\.env|^node_modules|^dist/|^__pycache__|^\.vercel' .gitignore   # expected: >=5 (key rules present)
```

Record: `repo-cleanup-report.md` audit result; fresh `git ls-files` check confirms no tracked env/cache/artifacts; `.gitignore` covers env, node, python, logs, test caches, `.vercel/`. Add ignore entries only if a gap is found. **Pass criteria:** all three commands produce the expected outputs. Fail = tracked artifact found → stop and raise before adding ignore entries.

- [ ] **Step 3: Reference both in the plan's completion evidence**

---

## Task 8: Release — CI, PR, manual deploy, evidence

**Files:**
- Modify: none beyond Tasks 2–7 outputs

- [ ] **Step 1: Green CI**

Push the feature branch; GitHub Actions CI must pass (lint, vitest incl. new page tests, build).

- [ ] **Step 2: PR + approval**

Open **one complete PR** covering Tasks 2–7 (owner decision O2: single PR, one review + one approval cycle). Await review and approval. No force-push.

- [ ] **Step 3: Manual deployment approval**

Explicit manual deployment approval before touching production (per C3).

- [ ] **Step 4: Backup before deploy**

Run `scripts/backup_db.sh`; record file + sha256 in the evidence artifact.

- [ ] **Step 5: Deploy frontend (Vercel) + evidence capture**

Deploy the approved frontend build to Vercel (`upstream-static`). Capture the Phase 2 evidence artifact (Task 5) with timestamps and signature. No backend/daemon restart needed (no backend change).

- [ ] **Step 6: Smoke checks**

Verify: `https://upstream-static.vercel.app/` 200; login works; reliability landing loads; SSE connects (`live`); mobile nav toggle works; session-expiry path (expire token → login with message). Record results in the evidence artifact.

- [ ] **Step 7: Commit evidence + completion record**

Commit evidence artifacts on the feature branch; merge to `main`; update `docs/PRODUCTION-LOCK.md` with the new `main` commit. Phase 2 complete per C13 (no observation window — no daemon/backend behavior change).

---

## Evidence requirements (task not complete without these)

- **Frontend tests:** all page-level tests pass; `npm test -- --run`, `npm run lint`, `npm run build` all exit 0.
- **SSE doc:** `docs/architecture/sse-transport.md` matches the live implementation (read-only cross-check).
- **Restore rehearsal:** `restore-rehearsal-evidence.md` with 67-asset verification and scratch DB dropped.
- **Deploy evidence:** one signed artifact per release (Task 5 structure).
- **Hygiene evidence:** `credential-history-evidence.md` + `ignored-artifacts-evidence.md` recorded.
- **Production lock:** `docs/PRODUCTION-LOCK.md` updated to the merged `main` commit.
