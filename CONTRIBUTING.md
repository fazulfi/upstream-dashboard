# Contributing

Thanks for contributing to the Upstream Dashboard — a SaaS operations console for an InferHub publisher.

## Project layout

```
backend/          Flask API (auth, reliability REST + SSE, finance ledger CLI)
frontend/         React + Vite dashboard (pages, components, hooks, lib, CSS)
scripts/          Daemon (auto_pricing.py), finance regen (gen_finance.py), tests
docs/             Architecture, data model, production lock, ops runbook, plans
artifacts/        Phase evidence reports (audit, review, verification)
.github/workflows/  CI (test + build; no CD)
```

## Local setup

Prerequisites: Node 18+ (frontend), Python 3.10+ (backend/daemon), PostgreSQL (finance + reliability), optional SSH to the VPS.

```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend (Python venv)
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt   # or however deps are managed
export DASHBOARD_PASSWORD='...' UPSTREAM_DB='...'   # local secrets
cd backend && python app.py

# Tests
cd frontend && npm test -- --run && npm run build
python -B -m unittest scripts.tests.test_self_undercut -v
cd backend && python -B -m pytest tests -q -p no:warnings
```

## Workflow

1. Create a feature branch from `main` (`git checkout -b feat/...` or `fix/...` or `docs/...`).
2. Make focused changes; keep PRs small and reviewable.
3. Run the test commands above (frontend + backend) and ensure the build passes.
4. Pre-commit checks:
   - `git diff --check` (no whitespace errors)
   - Secret scan: grep for any token/password/key before commit
   - No `as any` / `@ts-ignore` / `@ts-expect-error`
   - Never commit `.env`, `.env.local`, tokens, private keys, or DB URLs with passwords
5. Commit with a clear message (`feat(scope): ...`, `fix(scope): ...`, `docs(scope): ...`).
6. Push and open a PR to `main`. CI runs backend + frontend (no CD).
7. Wait for CI green + review, then merge.

## CI (no CD)
`.github/workflows/ci.yml` runs build + tests on PRs. Deployment is **manual**: Vercel for the frontend, SSH + systemd for the VPS backend/daemon. Do not add CD to CI.

## Production notes
- Never commit secrets. See `SECURITY.md`.
- Finance DB (`schema memory`) is the single source of truth; `ledger.json` is a synced mirror.
- See `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`, `docs/OPS-RUNBOOK.md`, `docs/PRODUCTION-LOCK.md`.
- See `NEXT-PHASE-ROADMAP.md` for planned Phase 2/3/4 direction.
