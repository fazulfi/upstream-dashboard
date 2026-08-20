# Post-MVP Phase 2 — Production Hardening Plan

> **Status: DRAFT — planning-only.** Awaiting owner design approval. No implementation work begins until this design is approved.
> **Production lock:** No production changes are permitted while this document is being prepared.
> **Authoritative decision log:** `artifacts/phase2/audit/decision-log.md` — C1–C14 confirmed 2026-08-20.
> **Gate status:** Architecture and production gates BLOCKED. This status is an implementation-gate record, not production authorization.
> **Design principle:** UI may be polished and expressive; system architecture must remain minimal, direct, and non-over-engineered.

## 1. Program Context

Post-MVP is implemented in four phases merged into one integrated production system:

1. **Phase 1 — Reliability** ✅ IMPLEMENTED & COMPLETE
2. **Phase 2 — Production Hardening** ← this plan
3. **Phase 3 — Finance & Profitability**
4. **Phase 4 — Dashboard Control Plane**

Phase 2 hardens the production surface that Phase 1 delivered: it documents the SSE transport decision, adds page-level frontend tests for critical paths (login/session-expiry/landing/error/nav), centralizes session-expiry handling, produces deployment evidence artifacts, rehearses database restore, and records credential/ignore hygiene audits as evidence.

## 2. Production Freeze

The current production system must remain unchanged during brainstorming and planning:

- No production code changes.
- No VPS or Vercel deployment.
- No service restart.
- No pricing configuration changes.
- No database schema or production-data changes.
- No production feature flags or arm/disarm changes.
- No implementation work until the Phase 2 design is approved.

## 3. Confirmed Decisions

The authoritative record is `artifacts/phase2/audit/decision-log.md`. Summary:

| ID | Decision |
|---|---|
| **C1** | Production freeze during planning (see §2). |
| **C2** | Decision log is authoritative; roadmap alternatives are non-authoritative. |
| **C3** | Deploy manual only; CI stays CI-only (no CD); release = green CI + approved PR + manual deploy approval + backup + additive schema + smoke checks + rollback evidence. |
| **C4/C8** | SSE transport decision documented in `docs/architecture/sse-transport.md` — **doc only, no runtime change**. |
| **C5** | Page-test scope: minimal critical paths (LoginGate, session-expiry, Reliability landing, error states, responsive nav). |
| **C6** | Test stack: Vitest jsdom + React Testing Library + jest-dom. |
| **C7** | Centralized session-expiry in the API layer: 401/403 → clear `upstream_session_token` → session-expired event → login with explicit message. Tested. |
| **C9** | One deployment evidence artifact per release (backup+checksum, schema additive check, systemd states, readiness/auth/SSE smoke, commit, operator signature). |
| **C10** | Restore rehearsal on VPS: latest backup → scratch DB → verify the owner-approved live baseline of 68 assets (A-001..A-070) and the operational tables that exist → drop scratch. Reliability-table presence is not claimed; backend `/api/reliability/*` behavior is proven by live smoke at deploy (T8c). Evidence documented. |
| **C11** | Skip credential history rewrite; record audit result as evidence (no active password in history; leak removed in `bdd22b9`; password rotated). |
| **C12** | Record ignored-artifacts audit result as evidence (`.gitignore` comprehensive; no tracked env/cache). |
| **C13** | No new observation window if release does not change daemon/backend behavior (Phase 2 is frontend+docs+evidence only → no window). |
| **C14** | No separate staging environment. |

## 4. Current Production Baseline

Verified during planning (decision log §"Current production baseline"):

- `main` @ `234a8bd` (141 commits), local == VPS == origin clean.
- Frontend: React 19 + Vite 8 + React Router 7 (HashRouter), 18 routes, Vitest 3 (env `node`), 5 unit/contract test files, **0% page-level coverage**.
- SSE: fetch-based, Bearer header, `Last-Event-ID` cursor replay, 1s→30s backoff, 401/403 → `auth-required` (hook `useReliabilityStream.js`); backend route `backend/app.py:2468`.
- Deploy: manual; CI `ci.yml` = install/lint/vitest/build (no CD). VPS `faiz-prod-01`, services as `gamesim` (`wwma-upstream-backend`, `wwma-auto-pricing`, `wwma-finance` + `.timer`); nginx :443 → waitress `127.0.0.1:8124` (`ops.budgezen.com`); Vercel `upstream-static.vercel.app`.
- Backup: `scripts/backup_db.sh` (14d local + 30d S3); **restore never rehearsed**.
- Credentials: no active password value in history; leak removed `bdd22b9`; password rotated; `filter-repo` not installed; no tracked `.env*`.
- Finance: 68 live-baseline assets (A-001..A-070), owner-approved for T6; DB = source of truth (Phase 3 concern).

## 5. Phase 2 Scope

| Area | Deliverable | Decisions |
|---|---|---|
| **P1** | `docs/architecture/sse-transport.md` | C4, C8 |
| **P2** | Page-level frontend tests (LoginGate, session-expiry, Reliability landing, error states, responsive nav) | C5, C6 |
| **P2b** | Centralized session-expiry handling in API layer | C7 |
| **P3** | Deployment evidence artifacts + restore rehearsal | C9, C10 |
| **P4** | Credential-history audit evidence (no purge) | C11 |
| **P5** | Ignored-artifacts audit evidence | C12 |

**No backend/daemon/DB-schema change in Phase 2.** Deliverables are frontend code + documentation + evidence tooling + a VPS restore rehearsal.

## 6. Open Items (all resolved 2026-08-20, owner-approved)

1. **Session-expiry event mechanism** — **RESOLVED: CustomEvent + window listener.** API layer dispatches `window.dispatchEvent(new CustomEvent('session-expired'))`; `LoginGate` listens via `useEffect` and shows an explicit "session expired" message carried in the event payload. Smallest mechanism that satisfies C7 (owner choice A).
2. **PR separation** — **RESOLVED: single complete PR.** All T2–T7 (docs + page tests + session-expiry + evidence tooling + rehearsal evidence + hygiene evidence) go in one PR to `main`; CI runs the whole suite at once; one review + one approval cycle (owner choice A).
3. **Restore-rehearsal scratch path** — **RESOLVED: pre-flight first, then re-confirm.** T6 Step 1 establishes the non-destructive scratch-DB path on the VPS, then **stops for a fresh owner confirmation** before any scratch DB is created or dropped (owner choice C).

## 7. Design Approval Gate

No implementation plan, code change, database migration, deploy, or production configuration change begins until:

1. All C1–C14 decisions are confirmed (done).
2. The complete Phase 2 design is presented to the user (this document + design summary).
3. The user approves the design.
4. A detailed implementation plan is written (`2026-08-20-post-mvp-phase-2-production-hardening-implementation.md`) and reviewed.
5. A final pre-implementation checklist confirms production remains unchanged.

**Status: steps 1–2 complete; all §6 open items resolved (2026-08-20). Awaiting step 3 (owner design approval).**
