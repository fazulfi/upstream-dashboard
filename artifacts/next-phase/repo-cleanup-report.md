# Repository Cleanup Report

**Repository:** `C:\Users\faizz\upstream-dashboard`  
**Baseline:** `main` @ `613d204`  
**Scope:** Read-only audit plus documentation normalization and next-phase planning. No production deployment, branch manipulation, history rewrite, backend logic change, daemon logic change, test deletion, or secret deletion was performed.

## Working-tree evidence

### Before

The initial audit reported a clean working tree (`git status --short` produced no tracked/untracked changes). The repository was on `main` at `613d204`.

### After

The final status is included at the end of this report. Expected changes from this task are the roadmap, this report, and documentation commit-reference normalization.

## Files cleaned/removed

None. This was intentional: no candidate met the evidence threshold for safe deletion, and the request prohibited deleting uncertain or production-critical material.

## Files flagged for possible deletion

| File/path | Reason | Confidence | Action |
|---|---|---:|---|
| `app-old-v1/app.py` | Legacy application snapshot; not referenced by current README, CI, deploy units, or current backend path. Could be archived outside the runtime tree after provenance review. | Medium | Retained; do not delete until historical/rollback value is confirmed. |
| `artifacts/phase1/audit/deployment-evidence-template.md` | Explicitly a blank evidence-capture template, not runtime code. Could move to a documentation/templates area or retain as the Phase 1 evidence form. | Low/medium | Retained because it documents the production gate. |
| `artifacts/phase1/audit/baseline-report.md` | Historical baseline report overlaps with later Phase 1 audits and contains pre-implementation findings. | Low | Retained as historical evidence. |
| `artifacts/phase1/audit/architecture-gate-report.md` | Historical architecture gate with overlapping decision material. | Low | Retained because it records approval/blocker history. |
| `backend/audit/inferhub_audit.py` and `backend/audit/inferhub_audit2.py` | Audit scripts appear investigative rather than part of CI/runtime; execution/reference was not established. | Medium | Retained pending owner confirmation and provenance review. |
| `backend/audit/riset-*.md`, `backend/audit/PLAN-*.md` | Exploratory research/planning material; potentially superseded, but may explain current pricing decisions. | Low | Retained; do not delete without mapping conclusions to current docs. |

Ignored local artifacts were **not** deletion candidates in the repository: `.coverage`, `.pytest_cache/`, `.venv-test/`, Python `__pycache__/`, `frontend/node_modules/`, `frontend/dist/`, `frontend/coverage/`, `frontend/.vercel/`, and `frontend/.env.local` are ignored and local-only. No tracked `node_modules`, `.env`, `.venv`, cache, coverage, or dist files were found.

## Dead-code and hygiene findings

- No production-critical file was removed.
- Existing audits identify some historically unused/low-use frontend surfaces, but current production-lock criteria explicitly say no MVP page satisfies all removal conditions. Test files were preserved.
- The repo contains historical reports with duplicated/overlapping Phase 1 conclusions. This is documentation debt, not sufficient evidence for deletion.
- `frontend/README.md` remains the generated Vite template and is not an accurate product guide; it was not rewritten because the requested normalization targeted the root README and production docs.
- No root `AGENTS.md`, `CLAUDE.md`, or `opencode*` project config was found. `.git/opencode` is Git metadata and was not touched.
- Leftover local branches were observed (`feat/phase1-reliability`, `fix`, `hotfix-reliability-summary`, `vercel-root-config-fix`), but were not touched per instruction.

## .gitignore state

`.gitignore` covers:

- secrets and environment files: `.env`, `.env.*` with `.env.example` exception, credentials, key/certificate extensions;
- Node artifacts: `node_modules/`, `dist/`, `.vite/`;
- Python artifacts: `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, egg metadata;
- runtime/log/cache/test artifacts: logs, coverage, `.pytest_cache/`, `.coverage`, `.venv-test/`, `.vercel/`;
- editor/OS files and temporary files.

Audit evidence showed these local artifacts are ignored and no matching files are tracked. `frontend/.env.local` exists locally and is ignored; its contents were not read.

## README and docs normalization

- Root `README.md` now identifies `main` as `613d204` in the release-flow section.
- `docs/PRODUCTION-LOCK.md` now identifies current `main` as `613d204`.
- `docs/OPS-RUNBOOK.md` now identifies `main` as `613d204` in its production facts and deployment checklist.
- The documented topology is consistent: nginx TLS `:443` proxies to Flask/Waitress `127.0.0.1:8124`.
- Unit names are consistent with tracked deploy files: `wwma-upstream-backend.service`, `wwma-auto-pricing.service`, `wwma-finance.service`, and `wwma-finance.timer`.
- Finance source-of-truth risk remains a roadmap item. The report does not assert an unverified schema-memory implementation detail; production evidence records an inventory of 60 assets, which must be preserved and reconciled before finance changes.
- Historical report references to older commits were not rewritten because they are evidence records, not current-state claims.

## CI status

`.github/workflows/ci.yml` is CI-only; it contains no deploy, Vercel, SSH, or systemd release step. It covers:

- backend dependency installation, compilation, script compilation, daemon unit tests, pytest/coverage, and the pure-logic coverage gate;
- frontend `npm ci` fallback, Oxlint, Vitest coverage tests, and Vite build.

This audit did not deploy or alter CI. Runtime CI execution was not claimed from source inspection alone.

## Next-phase roadmap summary

Created `NEXT-PHASE-ROADMAP.md` at repository root. It records:

1. current Phase 1 Reliability state at `613d204`;
2. Phase 2 Production Hardening: SSE architecture note, page-test coverage, deployment evidence, backup/restore, and Git-history credential purge decision;
3. Phase 3 Finance & Profitability: simplify dual sources of truth, preserve/reconcile 60 assets, define accounting rules, and strengthen restore/reconciliation evidence;
4. Phase 4 Dashboard Control Plane: authenticated read-only summaries, audited/idempotent mutation controls, workflow coverage, and continued CI-only/manual deployment;
5. known blockers including 0% page-test coverage, historical credential material, finance reconciliation debt, and overlapping historical reports.

## Created roadmap content

See `NEXT-PHASE-ROADMAP.md` in full. It is intentionally a planning document and does not authorize production operations.

## Verification notes

- No backend/app.py or scripts/auto_pricing.py logic was modified.
- No production-critical or test file was deleted.
- No deploy command was run.
- No remote branch or Git history was changed.

## Final `git status --short`

```text
 M README.md
 M docs/OPS-RUNBOOK.md
 M docs/PRODUCTION-LOCK.md
?? NEXT-PHASE-ROADMAP.md
?? artifacts/next-phase/
```
