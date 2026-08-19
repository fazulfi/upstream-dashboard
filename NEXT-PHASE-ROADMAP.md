# Next-Phase Roadmap

**Repository:** `fazulfi/upstream-dashboard`  
**Baseline:** `main` @ `613d204`  
**Status:** Phase 1 Reliability is complete, deployed, and verified. This roadmap is planning guidance; it does not authorize deployment or production changes.

## Current state

- Production topology is Vercel `upstream-static.vercel.app` → `ops.budgezen.com` nginx TLS :443 → Flask/Waitress on `127.0.0.1:8124`.
- User-scoped systemd units are authoritative: `wwma-upstream-backend.service`, `wwma-auto-pricing.service`, and the finance service/timer.
- Phase 1 reliability provides durable cycle/event/aggregate records, authenticated REST, fetch-based authenticated SSE, ARM/DISARM audit, PID admission control without auto-kill, best-effort DB persistence, and 30-day raw / 90-day aggregate retention.
- PostgreSQL remains the durable operational and finance store. The finance asset inventory is currently represented as 60 assets in the production evidence; preserve that data and verify counts before finance changes.
- CI is CI-only (no CD) and covers backend compilation/tests/coverage plus frontend lint/tests/build.

## Phase 2 — Production Hardening

**Goal:** Reduce operational risk without changing the pricing algorithm or introducing unnecessary infrastructure.

Priorities:

1. Turn the fetch-based SSE decision into an explicit, maintained architecture note: native `EventSource` cannot send the current `Authorization` header; any future migration requires cookie credentials or a carefully designed short-lived token flow with logging/redaction review.
2. Add missing frontend page-level test coverage. Current page coverage is 0%; hook and library tests exist but do not cover the routed dashboard surfaces.
3. Define and automate deployment evidence, rollback checks, backup/restore rehearsal, service uniqueness, heartbeat freshness, and SSE reconnect/recovery checks.
4. Purge the historical credential exposure from Git history with `git filter-repo` only as a separately approved repository-maintenance operation. Rotate/revoke any affected credential first; do not force-push as part of ordinary feature work.
5. Continue auditing ignored local artifacts and ensure generated files, Vercel metadata, coverage output, caches, and environment files remain untracked.

## Phase 3 — Finance & Profitability

**Goal:** Make profitability reporting trustworthy, explainable, and operationally useful.

Priorities:

1. Simplify the finance dual-source-of-truth risk: document and converge the authoritative path for asset inventory, ledger inputs, generated workbook output, and derived P&L views.
2. Preserve the current 60-asset inventory while adding reconciliation checks between database records, finance generation scripts, and displayed dashboard totals.
3. Define explicit period, currency, exchange-rate, refund, impairment, payout, amortization, and rounding rules with fixture-backed tests.
4. Add reconciliation/variance reporting and restore-tested backup evidence before treating finance metrics as decision-grade.
5. Keep finance mutations auditable and ensure generated artifacts are outputs, not competing inputs.

## Phase 4 — Dashboard Control Plane

**Goal:** Safely expose operational controls and decision support in the dashboard.

Priorities:

1. Build on the existing reliability landing page and authenticated API rather than adding a second control path.
2. Add explicit read-only fleet, pricing, finance, and health summaries before enabling higher-risk controls.
3. Gate mutation controls with authorization, idempotency, audit records, clear operator feedback, and rollback/disarm procedures.
4. Add page-level tests for all critical workflows, especially pricing controls, finance actions, login/session expiry, error states, and responsive navigation.
5. Keep production deployment manual and CI-only until an independently approved CD design exists.

## Known tech debt and blockers

- SSE transport is intentionally fetch-based because bearer headers are required; native `EventSource` remains an architectural alternative, not a drop-in replacement.
- Historical credential material remains in Git history; purge is deferred and requires credential rotation plus coordinated history rewrite.
- Finance has a dual-source-of-truth simplification/reconciliation task; do not delete asset data or generated finance paths until this is resolved.
- Frontend page-test coverage is currently 0%, despite existing hook/lib/component tests.
- The repository contains historical audit, review, and planning reports with overlapping conclusions. They are retained as evidence unless provenance and replacement are established.
- Local ignored caches and environments exist (`.venv-test`, `__pycache__`, pytest caches, coverage, frontend `node_modules`, `dist`, `.vercel`, and `frontend/.env.local`); they are not tracked and should remain local.

## Suggested execution order

1. Phase 2 evidence/test hardening and credential-history decision.
2. Finance source-of-truth/reconciliation design, with data-preservation checks.
3. Critical dashboard control-plane workflows and page coverage.
4. Re-run production lock and release evidence after each approved production change.
