<!-- markdownlint-disable MD013 -->

# Upstream Dashboard

Production operations dashboard for an AI-model pricing publisher, with live reliability visibility, financial operations, and controlled manual or automated pricing.

[![CI](https://img.shields.io/github/actions/workflow/status/fazulfi/upstream-dashboard/ci.yml?branch=main&label=CI)](https://github.com/fazulfi/upstream-dashboard/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-Vitest%203%20%7C%20pytest-blue)](https://github.com/fazulfi/upstream-dashboard)
[![Coverage](https://img.shields.io/badge/coverage-frontend%2080%25%2B%20%7C%20backend%2080%25%2B-success)](https://github.com/fazulfi/upstream-dashboard/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Overview

Upstream Dashboard is the operations console for an InferHub publisher. It brings provider fleet health, market and orderbook data, earnings, P&L, settlements, usage, catalog operations, and auto-pricing controls into one authenticated interface.

PostgreSQL is the durable source of truth for financial records, configuration, pricing operations, and reliability history. The production frontend is hosted at [upstream-static.vercel.app](https://upstream-static.vercel.app). The backend is served through the production API hostname documented in the [operations runbook](docs/OPS-RUNBOOK.md).

## Features

- **Fleet operations:** Provider health, usage windows, rechecks, enablement, and upstream state.
- **Market operations:** Model catalog, provider-scoped orderbooks, price ladders, depth, minimums, maximums, spreads, and combos.
- **Pricing controls:** Manual ask management and an auto-pricing daemon with provider-scoped decisions, ARM/DISARM control, PID locking, and persisted audit history. Per-provider scope control (enable/disable auto-pricing per upstream from the dashboard) and per-provider global trigger bands, with per-model overrides. Supported providers include codebuddy, codebuddy-cn, cline-pass, commandcode, and opencode-go.
- **Financial operations:** Earnings, P&L, amortization, impairment, refunds, payouts, settlements, top-ups, and finance workbook regeneration.
- **Analytics:** Earnings trends, model and provider breakdowns, ranking, and range-based publisher analytics.
- **Reliability operations:** Cycle, event, model, heartbeat, freshness, and aggregate views with REST recovery and a live SSE stream.
- **Operational safety:** PostgreSQL persistence, bounded retention, explicit deployment gates, backup-before-deploy policy, and documented rollback procedures.

## Product Specifications

### Enterprise

- **Single-tenant deployment** on dedicated infrastructure (VPS + managed static hosting) with full control over the runtime environment.
- **Audit trail:** every pricing-control transition (ARM/DISARM) is persisted with operator, timestamp, and outcome; release evidence is captured per deployment.
- **Release governance:** CI-only pipeline (no CD), protected `main` branch, PR-based review, manual deploy approval, backup-before-deploy, signed evidence artifacts, and documented rollback procedure.
- **Credential hygiene:** session-token auth (no password in the client bundle), credential-history audit, ignored-artifact audit, and secrets referenced by name only.

### SaaS

- **Publisher-facing operations dashboard** served as a hosted web application (Vercel static + VPS backend), accessible via HTTPS with nginx TLS.
- **Live operations stream:** fetch-based SSE with cursor replay, bounded backoff, and REST recovery path — publishers see near-real-time cycle/event data without page reloads.
- **Session model:** password login issues a bearer session token (sessionStorage); centralized 401/403 handling returns users to login with an explicit message when a session expires.
- **Multi-domain product surface:** fleet, market, pricing, finance, analytics, reliability, and account/billing modules under one authenticated shell.

## Architecture

```text
React 19 + Vite frontend
        │ HTTPS /api/*
        ▼
Vercel static hosting ── rewrite ──> nginx TLS ──> Flask + waitress backend
                                                    │
                         ┌──────────────────────────┼──────────────────────────┐
                         ▼                          ▼                          ▼
                    PostgreSQL              InferHub API             Reliability REST + SSE
                         ▲                          ▲                          │
                         └──────────── auto-pricing daemon ─────────┘          │
                                      systemd user service                      ▼
                                                                  Dashboard live updates
```

- **Frontend:** React 19, Vite 8, React Router 7 with `HashRouter`, Recharts, and TanStack Table. It is deployed as a static Vercel project.
- **Backend:** Flask served by waitress on the VPS behind nginx TLS. It exposes authenticated REST APIs and the reliability stream.
- **Auto-pricing:** `scripts/auto_pricing.py` runs as `wwma-auto-pricing.service`, polls on the production 60-second interval, and records operations, API activity, state, and reliability events. The processed upstream set is configurable: PostgreSQL `pricing_config_upstream.auto_pricing_enabled` is the source of truth, synced to the daemon's JSON config file, with a dashboard toggle per provider (default scope: codebuddy, codebuddy-cn, cline-pass, commandcode, opencode-go).
- **Finance service:** `wwma-finance.service` and its timer regenerate finance outputs on the documented schedule.
- **Database:** PostgreSQL is the source of truth for finance, provider and model operations, pricing configuration, auto-pricing state, and reliability history.
- **Reliability transport:** The frontend uses fetch-based SSE so it can send a Bearer token. `Last-Event-ID` enables cursor replay; the REST endpoints remain the recovery and history path. See [SSE transport](docs/architecture/sse-transport.md).

Detailed contracts and production decisions are in [`docs/architecture/`](docs/architecture/), [`docs/PRODUCTION-LOCK.md`](docs/PRODUCTION-LOCK.md), and [`docs/OPS-RUNBOOK.md`](docs/OPS-RUNBOOK.md).

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, Vite 8, React Router 7 (`HashRouter`), Recharts, TanStack Table |
| Frontend quality | Oxlint, Vitest 3, jsdom, React Testing Library, jest-dom |
| Backend | Python, Flask, waitress, psycopg 3 |
| Data | PostgreSQL |
| Reliability | Fetch-based Server-Sent Events, Bearer authentication, cursor replay with `Last-Event-ID` |
| Runtime | nginx TLS, systemd user services, Vercel static hosting |
| Automation | GitHub Actions CI only; VPS and Vercel deployment are manual by design |

## Getting Started

### Prerequisites

- Node.js 20 for the frontend toolchain used by CI.
- Python 3.10 or newer for the backend and daemon.
- PostgreSQL for finance, pricing, and reliability data.

### Clone and install

```bash
git clone https://github.com/fazulfi/upstream-dashboard.git
cd upstream-dashboard

python -m venv .venv
# Activate .venv using the command for your shell.
pip install -r backend/requirements.txt

cd frontend
npm install
```

### Environment Variables

Copy `.env.example` to a protected runtime file and replace every `change-me` or placeholder value locally. Never commit `.env` files or real credentials.

| Variable | Scope | Required | Exposure |
|---|---|---|---|
| `VITE_API_URL` | frontend build/local | optional | public |
| `DASHBOARD_PASSWORD` | backend | yes | server-only |
| `UPSTREAM_DB` | backend/scripts | yes | server-only |
| `ALLOWED_ORIGINS` | backend | yes in production | server-only |
| `VERCEL_TOKEN` | deploy operator | deploy-only | secret |
| `INFERHUB_API_KEY` | backend/daemon | yes in production | server-only |
| `FOREX_KEY` | finance service | depending | server-only |

## Configure the local environment

The frontend reads its API base from `VITE_API_URL`. Create a local frontend environment file with a non-production API URL when needed:

```bash
cd frontend
printf 'VITE_API_URL=http://localhost:8124\n' > .env.local
```

Backend runtime configuration, including the database connection and dashboard authentication secret, must be supplied through environment variables or a protected local runtime file. Use variable names only; never commit secret values. See [`SECURITY.md`](SECURITY.md) and [`docs/OPS-RUNBOOK.md`](docs/OPS-RUNBOOK.md).

### Run locally

Start the backend from the repository root after activating the virtual environment:

```bash
python backend/app.py
```

In a second terminal, start the frontend:

```bash
cd frontend
npm run dev
```

The auto-pricing daemon can be exercised in a single-cycle dry run when its required local configuration is available:

```bash
python scripts/auto_pricing.py --once --dry-run
```

## Testing and CI

The frontend test suite uses Vitest 3 with jsdom, React Testing Library, and jest-dom. Page-level tests are included. Frontend coverage thresholds are 80% for statements, lines, and functions, and 70% for branches.

The backend uses pytest and pytest-cov. The pure logic coverage gate is at least 80%; the CI workflow also runs backend application tests and compilation checks. The auto-pricing unit test suite runs in CI as well.

Run the principal checks locally:

```bash
# Frontend
cd frontend
npm run lint
npm test -- --run
npm run build

# Backend and daemon
cd ..
python -B -m unittest scripts.tests.test_self_undercut -v
python -m compileall -q scripts/ backend/
cd backend
pytest --cov=logic --cov=app --cov-report=term-missing -q
pytest tests/test_logic.py --cov=logic --cov-report=term-missing --cov-fail-under=80 -q
```

The single workflow, [`.github/workflows/ci.yml`](.github/workflows/ci.yml), runs backend compilation, daemon tests, pytest and coverage, frontend Oxlint, frontend tests, and the Vite build. GitHub Actions is CI-only: it does not deploy.

## API Reference

The InferHub API contract is captured in [`docs/inferhub-openapi-spec.json`](docs/inferhub-openapi-spec.json). Quickstart after obtaining a session token:

```bash
curl -sS -H "Authorization: Bearer <session-token>" \
  "https://ops.budgezen.com/api/reliability/summary"
```

## Deployment

Deployment is manual by design under the production C3 constraint. **GitHub Actions = CI only (no CD). Frontend Vercel `upstream-static` deploy manual via token; backend VPS manual via SSH + systemd. Vercel auto-deploy pada main merge TIDAK digunakan sebagai mekanisme rilis; rilis = PR merged + CI green + manual promote.**

1. Open a reviewed pull request to `main` and wait for green CI and approval.
2. Take a database backup before backend, schema, daemon, or other production changes.
3. Pull the reviewed source on the VPS and restart the relevant systemd user services as documented in the [operations runbook](docs/OPS-RUNBOOK.md).
4. Deploy the frontend manually from `frontend/` to the existing `upstream-static` Vercel project.
5. Verify health, service uniqueness, heartbeat freshness, database freshness, ARM state, and the deployed frontend before re-arming pricing.

There is **no continuous deployment** in GitHub Actions. The production lock and rollback evidence are maintained in [`docs/PRODUCTION-LOCK.md`](docs/PRODUCTION-LOCK.md) and the [`artifacts/`](artifacts/) evidence directory. Do not treat a local green build as production evidence without the documented deployment and runtime checks.

## Release & Versioning

Releases follow Semantic Versioning (`MAJOR.MINOR.PATCH`). A release is promoted only after the reviewed PR is merged, CI is green, and the operator completes the manual frontend and backend deployment checks. Release notes and compatibility-impacting changes are recorded in [`CHANGELOG.md`](CHANGELOG.md) when that file is present; this repository does not create it automatically.

## Support & SLA

This is a single-tenant publisher operations dashboard with best-effort support from the repository owner, Faiz (fazulfi). There is no contractual uptime SLA in this repository. Production incidents follow the runbook: DISARM when pricing safety is uncertain, preserve evidence, restore service, and re-ARM only after verification.

## Data Retention & Backup

Database backups are retained for **14 days locally**; **30 days offsite only when the status marker is `offsite ok`** (check `/home/gamesim/.backup-offsite-status`). Take a fresh backup before every production deploy or restore. Reliability-event retention is documented separately in the operations runbook and does not promise backup recovery for that duration.

## Architecture Decision Records (ADR)

The decision index is [`docs/adr/`](docs/adr/):

- [ADR-001 — Rule engine finance](docs/adr/ADR-001-rule-engine-finance.md)
- [ADR-002 — Remove blocked pages](docs/adr/ADR-002-hapus-page-blocked.md)
- [ADR-003 — Manual deploy, no CD](docs/adr/ADR-003-deploy-manual-no-cd.md)

## CI Status Matrix

| Area | Runtime | Checks |
|---|---|---|
| Backend | Python 3.11 | `compileall`, unittest, pytest, coverage |
| Frontend | Node 20 | Oxlint, Vitest, production build |

## RACI

| Activity | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| Code review and CI | Contributor | Repository owner | Maintainers | Stakeholders |
| Production backend deploy | VPS operator | Repository owner | Operations | Stakeholders |
| Production frontend deploy | Vercel operator | Repository owner | Operations | Stakeholders |
| Incident response | On-call operator | Repository owner | Operations | Stakeholders |

## Security

- **Authentication:** `POST /api/login` exchanges the server-side dashboard password for a time-limited session token. API requests use `Authorization: Bearer <token>`.
- **Browser credential boundary:** The dashboard password must not be bundled into the frontend. Query-string authentication is not supported; the deprecated `X-Auth` path is retained only for documented compatibility use.
- **SSE security:** The reliability stream uses fetch-based SSE because native `EventSource` cannot send the required Authorization header. It sends the Bearer token in the header and uses `Last-Event-ID` for replay, never a token in the URL.
- **Session expiry:** Centralized handling of 401 and 403 responses for REST/API requests transitions the client to session-expiry handling. SSE 401/403 responses now escalate to that same session-expired flow rather than being treated as reconnectable network errors.
- **API and CORS boundaries:** API routes are explicitly protected and CORS uses an explicit origin allowlist; wildcard credentialed origins are not used.
- **Secret policy:** Production secrets are referenced by variable name only, kept server-side, and excluded by the repository's comprehensive `.gitignore`. The credential-history audit found no live credential values in git history (see `artifacts/phase2/audit/credential-history-evidence.md`).
- **Vulnerability reports:** Do not open a public issue for a security vulnerability. Follow the private reporting process in [`SECURITY.md`](SECURITY.md), including the affected component, reproduction steps, impact, severity, and suggested mitigation.

## Operations

### Backup and restore

[`scripts/backup_db.sh`](scripts/backup_db.sh) uses `pg_dump` through `UPSTREAM_DB`, compresses the dump with gzip, stores dated files, and removes local backups older than 14 days. It copies backups offsite with a 30-day remote retention policy only when the status marker is `offsite ok` (check `/home/gamesim/.backup-offsite-status`); an offsite upload failure does not fail the local backup. Always take a fresh backup before a restore or production change. Restore procedures are in [`docs/OPS-RUNBOOK.md`](docs/OPS-RUNBOOK.md).

Reliability retention is separate from backup retention: raw reliability events are retained for 30 days and UTC aggregates for 90 days. This does not promise 90 days of backup recovery.

### Monitoring and incident response

Use the public and local `/health` checks, systemd service status, journald logs, daemon process uniqueness, ARM state, reliability summary heartbeat, and database freshness checks described in the runbook. If pricing safety is uncertain, DISARM first, record the incident, diagnose, verify, and re-ARM only after the documented checks pass.

PostgreSQL remains the source of truth. The REST endpoints recover history and state when the live stream is unavailable. The reliability SSE client reconnects with bounded backoff from 1 second to a maximum of 30 seconds and replays missed events by cursor. The daemon continues its documented best-effort database behavior; persistence warnings remain visible to operators.

## Project Structure

```text
.
├── backend/                 Flask API, database schema, finance logic, and pytest tests
├── frontend/                React/Vite application, pages, hooks, and Vitest tests
├── scripts/                 Auto-pricing daemon, finance utilities, backups, and tests
├── deploy/                  systemd user service definitions
├── docs/
│   ├── architecture/        Architecture and transport contracts
│   ├── OPS-RUNBOOK.md        Deployment and operations runbook
│   └── PRODUCTION-LOCK.md    Production gates, evidence, and rollback reference
├── artifacts/               Phase evidence and verification reports
├── .github/workflows/        CI-only GitHub Actions workflow
├── SECURITY.md               Security policy and private vulnerability reporting
├── CONTRIBUTING.md           Contribution workflow and local development guidance
└── vercel.json               Static hosting and API rewrite configuration
```

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. Keep changes focused, run the frontend and backend checks, run `git diff --check`, and scan for secrets before committing. Production changes require review and green CI; deployment remains manual.

The repository currently provides [`SECURITY.md`](SECURITY.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md). No separate Code of Conduct or license file is present in the repository, so no such policy is linked here.

## License

This project is licensed under the [MIT License](LICENSE).
