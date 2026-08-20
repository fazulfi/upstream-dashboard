# Phase 2 Production Hardening Decision Log

**Status:** Decision record complete for planning (C1–C14 confirmed 2026-08-20). **Implementation authorization:** blocked pending separate approval. **Production authorization:** blocked.

This file is the authoritative Phase 2 decision record. Historical alternatives remain in `NEXT-PHASE-ROADMAP.md` and in the "Historical decision questions" section below as non-authoritative context. This record does not claim implementation, deployment, or production readiness.

## Evidence basis

- `NEXT-PHASE-ROADMAP.md` — authoritative 4-phase roadmap; Phase 2 scope items P1–P5.
- `docs/PRODUCTION-LOCK.md` — production inventory, release gate, phase evidence record.
- `docs/OPS-RUNBOOK.md` — operations runbook, deployment checklist, production facts.
- `artifacts/next-phase/production-evidence.md` — captured production state 2026-08-19 (608 cycles, 38 models, armed, fresh DB).
- `artifacts/next-phase/repo-cleanup-report.md` — read-only repo hygiene audit: no tracked env/cache/artifacts; `.gitignore` already covers env, node, python, logs, test caches, `.vercel/`.
- `artifacts/phase1/audit/*` — Phase 1 B0–B8 decisions, deployment evidence template, observation report.

## Current production baseline (verified during planning)

- 141 commits on `main` @ `234a8bd` (PR #13 `fix-ledger-kurs-idr-usd`). Local == VPS == origin clean.
- Frontend: React 19 + Vite 8 + React Router 7 (HashRouter), 18 routes, Vitest 3 (node env, no RTL/jsdom use yet), Oxlint. Tests: `src/**/*.test.{js,jsx}` — 5 files, unit/contract only; **0% page-level coverage** (no rendered LoginGate/Layout/Sidebar/App/Reliability tests).
- SSE: backend-owned fetch-based `GET /api/reliability/stream` (backend/app.py:2468); client `frontend/src/hooks/useReliabilityStream.js` with Bearer header, `Last-Event-ID` cursor replay, 1s→30s backoff, 401/403 → `auth-required`. No `docs/architecture/sse-transport.md` yet.
- Deploy: manual only; CI (`ci.yml`) = install/lint/vitest/build, **no CD**. VPS `root@82.25.62.204`, services as `gamesim`: `wwma-upstream-backend.service`, `wwma-auto-pricing.service`, `wwma-finance.service` + `.timer`. Backend Flask waitress `127.0.0.1:8124` behind nginx TLS :443 (`ops.budgezen.com`). Frontend Vercel `upstream-static.vercel.app`.
- Backup: `scripts/backup_db.sh` — pg_dump gzip → `/home/gamesim/shared-memory/inferhub-business/backups`, 14d retention, offsite S3 is3.cloudhost.id (rclone, 30d remote retention), gated on `/run/wwma/env`. **Restore rehearsal: not evidenced.**
- Credentials: **no active password value found in git history** (`git log -S '408Yim…'` = 0 hits); secret leak removed in commit `bdd22b9` ("remove secret leak", 2026-08-12); `DASHBOARD_PASSWORD` already rotated (old value 401). `.dashboard-password` ignored. No tracked `.env*` files.
- `git filter-repo` **not installed** on this machine.
- Finance: 67 assets (A-001..A-069), all IDR assets `kurs_idr_usd=17824.4344`, DB = source of truth, ledger.json = mirror. (Roadmap: reconciliation/rollback-evidence → Phase 3, not Phase 2.)

## Confirmed decisions

| ID | Decision |
|---|---|
| **C1, production freeze** | During Phase 2 planning, production remains unchanged: no code change, no VPS/Vercel deploy, no service restart, no pricing configuration change, no DB schema or production-data change, no arm/disarm change. No implementation work until the Phase 2 design is approved. |
| **C2, decision-log authority** | This table is the authoritative Phase 2 record. Historical roadmap wording and alternatives are non-authoritative. Phase 2 remains planning-only until this record and the implementation plan receive separate approval. Approval/status is a gate record, not production authorization. |
| **C3, deploy/release policy** | Deployment remains manual only; CI remains CI-only with no CD. A Phase 2 release requires green CI, approved PR, explicit manual deployment approval, backup before deploy, additive schema compatibility, systemd service sequencing, readiness/auth/SSE smoke checks, and rollback evidence — per Phase 1 B7. |
| **C4, SSE transport documentation** | The fetch-based SSE decision (Bearer header, cursor replay, no query tokens, no native EventSource) is documented in `docs/architecture/sse-transport.md` (new file) with rationale and the future migration path (cookie credentials or short-lived token flow). Documentation only — no runtime change. |
| **C5, page-test scope** | Phase 2 covers the **minimal critical paths** only: LoginGate (login success/failure, empty-password disabled, token stored, children revealed), centralized session-expiry handling, Reliability landing (loading/empty, REST failure, SSE auth-required, reconnect/error alert, ARM/DISARM success/failure), error states, and responsive navigation (mobile menu toggle, active route). No full 18-route smoke suite. |
| **C6, test stack** | Use **Vitest jsdom + React Testing Library + jest-dom matchers** as the smallest idiomatic extension. New dev deps: `@testing-library/react` and `@testing-library/jest-dom`, with the Vitest environment set to `jsdom` (global or per-file). No Playwright/Cypress/MSW in Phase 2. |
| **C7, session-expiry handling** | Add **centralized session-expiry handling** in the API layer: on 401/403 from a session-authenticated request, clear `upstream_session_token`, emit a session-expired event, and route to login with an explicit "session expired" message. Behavior must be covered by page-level tests (login/session-expiry path). |
| **C8, SSE transport doc timing** | **Documentation only** — create `docs/architecture/sse-transport.md` during Phase 2; no runtime change to the SSE implementation. |
| **C9, deployment evidence artifacts** | Phase 2 produces **one evidence artifact per release** following `artifacts/phase1/audit/deployment-evidence-template.md`: backup taken (file + checksum), additive schema check, systemd unit states, readiness/auth/SSE smoke results, source commit, operator signature. No continuous heartbeat window required beyond the release evidence. |
| **C10, restore rehearsal** | Phase 2 includes a **restore rehearsal on the VPS**: restore the latest backup to a scratch DB, verify row counts / asset count = 67, then drop the scratch DB. Evidence documented in the release evidence artifacts. |
| **C11, credential purge** | **Skip history rewrite** in Phase 2. Record the audit result (no active password value in history; leak removed in `bdd22b9`; active password already rotated; filter-repo not installed) as Phase 2 evidence. Revisit only if a live credential is ever found in history; any future rewrite is a separately approved repo-maintenance operation with no force-push in ordinary feature work. |
| **C12, ignored-artifacts audit** | Record the `repo-cleanup-report.md` audit result (no tracked env/cache/artifacts; `.gitignore` comprehensive) as Phase 2 evidence. Add ignore entries only if a fresh check finds a gap (none known at planning time). |
| **C13, completion gate** | **No new observation window** if the Phase 2 release does not change daemon/backend behavior. Completion = green CI + approved PR + manual deploy approval + rollback evidence + all Phase 2 evidence artifacts signed. If a release does change daemon/backend behavior, the Phase 1 24-hour signed observation gate re-applies. |
| **C14, staging** | **No separate staging environment.** CI, PR approval, manual deploy approval, and evidence artifacts are the required gates (same as Phase 1 B7). |

## Open-item resolutions (2026-08-20, owner-approved via question tool)

| ID | Resolution |
|---|---|
| **O1, session-expiry mechanism** | **CustomEvent + window listener.** API layer dispatches `window.dispatchEvent(new CustomEvent('session-expired'))` with the message in the payload; `LoginGate` listens via `useEffect` and shows an explicit "session expired" message. Smallest mechanism satisfying C7. |
| **O2, PR separation** | **One complete PR** for T2–T7 (docs + page tests + session-expiry + evidence tooling + rehearsal evidence + hygiene evidence) to `main`. Single CI run, single review, single approval cycle. |
| **O3, restore scratch path** | **Pre-flight first, then re-confirm.** T6 establishes the non-destructive scratch-DB path on the VPS, then stops for a fresh owner confirmation before any scratch DB is created or dropped. |

## Historical decision questions (non-authoritative)

### Question 1 — Page-test coverage scope (roadmap P2)

Current frontend page-level coverage is 0%. Phase 1 removed nothing; all 18 routes remain. Which critical paths must Phase 2 cover?

- **A:** Minimal — LoginGate, session-expiry, Reliability landing, error states, responsive nav only (roadmap default).
- **B:** A + Layout/Sidebar navigation + App routing + all 18 route renders smoke.
- **C:** Custom scope (state which pages).

### Question 2 — Test stack for page-level coverage

Vitest 3 + jsdom installed but unused (env is `node`). React Testing Library not installed.

- **A:** Vitest jsdom + React Testing Library + jest-dom matchers (smallest idiomatic extension). (Recommended)
- **B:** Vitest jsdom only, hand-rolled render/query helpers (zero new deps).
- **C:** Add Playwright for browser-level E2E on top of A (heavier; new runner in CI).
- **D:** Custom.

### Question 3 — Session-expiry handling (centralized 401/403)

Audit finding: normal `useApi` requests do not globally handle 401/403 — no token clearing, no redirect to login. Only the SSE hook self-handles 401/403 (`auth-required` status) without logging out.

- **A:** Add centralized session-expiry handling in the API layer: on 401/403 from a session-authenticated request, clear `upstream_session_token`, emit a session-expired event, and route to login with an explicit "session expired" message. Covered by tests. (Recommended)
- **B:** Document current behavior only; no code change in Phase 2 (defer to Phase 4).
- **C:** Custom.

### Question 4 — SSE transport doc timing (roadmap P1)

- **A:** Documentation only — create `docs/architecture/sse-transport.md` now, no runtime change. (Recommended)
- **B:** Doc + small client hardening if audit shows gaps (e.g. token-refresh hook on 401/403).
- **C:** Defer entirely.
- **D:** Custom.

### Question 5 — Deployment evidence artifacts (roadmap P3)

The deployment-evidence template exists (`artifacts/phase1/audit/deployment-evidence-template.md`). What must Phase 2 produce per release?

- **A:** One evidence artifact per deploy: backup taken (file + checksum), schema additive check, systemd unit states, readiness/auth/SSE smoke results, source commit, operator signature. (Recommended)
- **B:** A only + continuous heartbeat-freshness evidence (daemon heartbeat gaps, DB freshness) collected over the observation window.
- **C:** Custom.

### Question 6 — Restore rehearsal (backup/restore)

`backup_db.sh` exists (14d local + 30d S3) but **restore was never rehearsed**.

- **A:** Phase 2 includes a restore rehearsal on the VPS (restore latest backup to a scratch DB, verify row counts/asset count 67, drop scratch) with documented evidence. (Recommended)
- **B:** Rehearsal only in Phase 3 (with finance reconciliation).
- **C:** Custom.

### Question 7 — Credential history purge (roadmap P4)

Audit result: **no active password value in history**; leak was removed in `bdd22b9`; active password already rotated. `git filter-repo` is not installed. The purge is now defense-in-depth only.

- **A:** Skip history rewrite in Phase 2; record the audit result as evidence; revisit only if a live credential is ever found in history. (Recommended)
- **B:** Full purge: install git-filter-repo, rewrite history to scrub the removed secret, coordinate force-push + VPS re-clone (approved as a separate repo-maintenance operation; no force-push in ordinary feature work).
- **C:** Custom.

### Question 8 — Ignored-artifacts audit (roadmap P5)

`repo-cleanup-report.md` confirms: no tracked env/cache/artifacts; `.gitignore` already covers env, node, python, logs, test caches, `.vercel/`.

- **A:** Record the audit result as Phase 2 evidence; add any missing ignore entries only if the audit finds gaps (currently none known). No churn. (Recommended)
- **B:** Full re-audit pass with fresh `git ls-files` review and ignore-file hardening.
- **C:** Custom.

### Question 9 — Phase 2 completion gate

Phase 1 required a 24-hour signed observation gate. What does Phase 2 require before completion can be declared?

- **A:** No new observation window if no daemon/backend behavior changes; completion = green CI + approved PR + manual deploy + rollback evidence + all Phase 2 evidence artifacts signed. (Recommended)
- **B:** New 24-hour observation window after deploy regardless of change scope.
- **C:** Custom.

### Question 10 — Staging environment

- **A:** No separate staging environment; CI + PR approval + manual deploy approval + evidence artifacts are the required gates (same as Phase 1 B7). (Recommended)
- **B:** Add a staging/preview deploy.
- **C:** Custom.

## Scope locks

- Phase 2 remains hardening-focused: SSE transport documentation, frontend page-level test coverage, deployment evidence + rollback/restore evidence, credential-history audit, and ignored-artifacts audit as approved. Finance/Profitability (Phase 3) and Dashboard Control Plane (Phase 4) work is out of scope.
- All 18 existing frontend routes remain retained. No page is deleted unless the three mandatory evidence conditions are met (per Phase 1 §5.40).
- Preserve pricing semantics and the existing pricing contract. No new circuit breaker, no auto-kill, no new fallback store, no event bus.
- System architecture must remain minimal: reuse existing tables/auth/services; avoid new queues/workers/subsystems unless required by evidence. UI polish may expand independently.
- No force-push in ordinary feature work. History rewrite, if ever approved, is a separate repo-maintenance operation.

## Gate status

**Architecture gate:** BLOCKED — design not yet presented for approval; implementation remains unauthorized.

**Implementation gate:** BLOCKED — implementation remains unauthorized until this decision record and the implementation plan are separately approved.

**Production gate:** BLOCKED — no production change until design approval, implementation, green CI, approved PR, manual deployment approval, and evidence recording.
