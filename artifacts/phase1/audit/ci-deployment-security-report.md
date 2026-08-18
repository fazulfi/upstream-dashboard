# Phase 1 Audit — CI, Git, Deployment, and Secret Exposure

**Repository:** `C:\Users\faizz\upstream-dashboard`
**Audit scope:** CI/CD behavior, package/test configuration, deploy units/scripts, git state/history, Vercel/VPS references, secret exposure risk, and backup/rollback constraints.
**Audit date:** 2026-08-18
**Access constraints honored:** no edits to application/configuration files, no push/commit/deploy, no SSH or production access.

## Executive summary

- **CI is CI-only; no CD was found.** `.github/workflows/ci.yml` runs backend compile/unit/pytest/coverage gates and frontend lint/test/build. It contains no deploy action, Vercel CLI invocation, SSH, VPS command, environment publishing, or release trigger.
- **The local branch is not a clean release candidate.** `main` tracks `origin/main` at `37e93c5`, but the working tree has staged/unstaged modifications and untracked audit/plan artifacts. The Phase 1 production-lock gate requiring a clean tree is therefore not met.
- **Deployment is manual and split across Vercel and VPS.** README and `docs/PRODUCTION-LOCK.md` identify Vercel project `upstream-static` for `frontend/`, and user-scoped systemd units on `/home/gamesim` for backend, auto-pricing, and finance. No deployment automation is present in CI.
- **Backup exists but scheduling and restore proof are incomplete in repository evidence.** `scripts/backup_db.sh` implements local PostgreSQL dumps with 14-day retention and optional S3-compatible offsite copy with 30-day retention. README describes cron/timer usage, but no backup systemd unit/timer is tracked; `PRODUCTION-LOCK.md` requires backup presence and tested/recorded restore paths.
- **No live secret value was printed by this audit.** Secret-pattern scanning found test fixtures and documentation/default DSN material. The highest-priority tracked risk is a non-secret fallback PostgreSQL DSN containing a real-looking username/password pair (`gamesim` / `upstream_local`) in source defaults; it should be treated as disclosed configuration and removed or replaced with fail-closed env handling. Documentation also includes placeholder secret assignments and operational secret paths, but no observed live token/key value.

## 1. CI and test/package configuration

### Workflow evidence: `.github/workflows/ci.yml`

| Area | Evidence | Assessment |
|---|---|---|
| Triggers | `push` to `main`/`fix`; pull requests to `main` | Appropriate branch/PR coverage; no release/deploy trigger. |
| Backend runtime | `ubuntu-latest`, Python 3.11, `pip install -r requirements.txt pytest pytest-cov` | Reproducibility is limited because `backend/requirements.txt` uses lower-bounded, unpinned dependencies. |
| Backend checks | `compileall`, scripts unit test, pytest coverage report, pure-logic `--cov-fail-under=80` | Compile, unit, integration/smoke, and logic coverage gate are represented. General pytest coverage is reported but not itself fail-under gated. |
| Frontend runtime | `ubuntu-latest`, Node 20 | Explicit runtime. |
| Frontend install | `npm ci || npm install --no-audit --no-fund` | CI can silently fall back from lockfile-enforced `npm ci` to a non-lockfile install. This weakens dependency reproducibility and should be release-controlled. |
| Frontend checks | `npm run lint`, `npm test -- --run`, `npm run build` | Lint, Vitest coverage script, and production build are covered. |
| CD indicators | None: no `vercel`, `ssh`, `scp`, `rsync`, `systemctl`, deployment action, or production environment use | **Confirmed: no CD in this workflow.** |

`frontend/package.json` defines `build: vite build`, `lint: oxlint`, and `test: vitest run --coverage`. `backend/requirements.txt` contains Flask, CORS, psycopg, waitress, pytest, and pytest-cov with minimum versions only. The repository documents the same CI scope in README: tests/lint/build, without CD.

## 2. Git state, history, and release constraints

### Observed repository state

- Current branch: `main`; upstream: `origin/main`.
- `main` and `origin/main` both point to `37e93c5` (`feat: lock REV13 production persistence and operations`), based on the local refs inspected.
- `fix` and `origin/fix` both point to `61c7dbc` (`fix: conn.commit() di luar blok with db_connect...`).
- No tags were listed; repository has 108 commits.
- Remote URL: `https://github.com/fazulfi/upstream-dashboard.git`.
- Working tree status:
  - `AM docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability.md` (staged addition plus working-tree modification).
  - `?? artifacts/`.
  - `?? docs/superpowers/plans/2026-08-17-post-mvp-phase-1-reliability-implementation.md`.

The tracked production-lock gate in `docs/PRODUCTION-LOCK.md` requires `git diff --check`, secret scan, CI success for the pushed commit, and a clean working tree. Current status fails the clean-tree condition. The audit report itself is being written under the already-untracked `artifacts/` tree and is intentionally not committed by this task.

Recent history includes commits for CI tightening and duplicate-workflow removal (`0d39464`), Vercel/local `.env` ignore handling (`148fbe5`), and the REV13 production persistence/operations lock (`37e93c5`). History inspection did not show a release tag or automated deployment commit.

## 3. Deployment units and release mechanics

### VPS/systemd

Tracked units under `deploy/`:

- `wwma-upstream-backend.service`: user-scoped backend, port 8124, restart always, reads optional `/home/gamesim/.hermes-suisui/backend.env`, executes `/home/gamesim/dashboard/backend/app.py` from `/home/gamesim/dashboard/backend`.
- `wwma-auto-pricing.service`: user-scoped auto-pricing daemon, interval 60, restart always, executes `/home/gamesim/scripts/auto_pricing.py`.
- `wwma-finance.service`: oneshot finance workbook generator; comments state `FOREX_KEY` must come from environment or a protected fallback file, not a unit hardcode.
- `wwma-finance.timer`: daily 03:30 timer, persistent, randomized delay up to 120 seconds.

The units contain no literal production password/API key. However, the auto-pricing and finance units rely on runtime filesystem/env conventions, and the backend `EnvironmentFile` is optional (`-` prefix), so missing runtime configuration can be a deployment-time failure or unsafe fallback depending on application behavior. The auto-pricing unit's `WantedBy=multi-user.target` is notable for a user-scoped unit; repository comments explicitly warn not to set `User/Group`, while `PRODUCTION-LOCK.md` prescribes `systemctl --user` operation.

### Vercel

README and `docs/PRODUCTION-LOCK.md` identify the production frontend as Vercel project `upstream-static`, deployed manually from `frontend/` with `vercel --prod`. The docs explicitly state that separate `dashboard`/old `frontend` Vercel projects are not production targets. No Vercel project metadata is tracked (`.vercel/` is ignored), and no CI deployment step exists; deployment identity/source-hash evidence must therefore be captured manually at release time.

### Documented release flow

README specifies: `fix` branch → commit/push → PR to `main` → green CI → merge → manually pull on VPS/restart systemd units and run `vercel --prod`. This audit did not execute any of those production operations.

## 4. Backup and rollback mechanisms

### Implemented/documented

- `scripts/backup_db.sh` uses `pg_dump` piped to gzip, writes timestamped `inferhub-*.sql.gz` files, defaults to local `/home/gamesim/shared-memory/inferhub-business/backups`, and deletes local files older than 14 days.
- Optional offsite copy uses `rclone` and `/run/wwma/env`, targeting an S3-compatible endpoint defaulting to `https://is3.cloudhost.id`; remote retention is implemented as 30 days. Upload failure is explicitly non-fatal to the local backup.
- README documents manual `pg_dump` and suggests daily cron/timer scheduling.
- `docs/PRODUCTION-LOCK.md` requires rollback paths for daemon restore/restart, backend restore/restart, database restore, and Vercel previous-deployment promotion.

### Gaps/constraints

- No backup systemd service/timer is present under tracked `deploy/`; scheduling is described, not represented as a versioned deploy unit.
- The script has a fallback DSN containing a password-like value. Even if intended only for local auth, this is unsafe source material and can cause accidental non-production use.
- Restore commands, backup integrity checks, encryption, and a tested restore transcript are not present in the inspected repository evidence.
- Vercel rollback is documented as “previous deployment promotion,” but no command/evidence capture is tracked.
- Production lock requires a backup before schema/backend changes and a latest backup present; this audit cannot confirm live backup freshness without production access.

## 5. Secret-scan and exposure findings (values redacted)

The scan searched tracked/source-like files for password, secret, API-key, token, private-key, and credential-bearing DSN patterns. **No secret values are included in this report.** Findings:

### High priority: tracked default database credentials

- `backend/app.py`, `backend/full_sync.py`, `backend/ledger_update.py`, `scripts/auto_pricing.py`, `scripts/fin_ops.py`, and `scripts/recon_finance.py` contain a fallback PostgreSQL DSN with username `gamesim` and password-like literal `upstream_local` (redacted here).
- This is a credential exposure risk and an unsafe fail-open configuration pattern. Runtime production env should be required; source should not embed a password-bearing fallback.

### Medium priority: secret-handling/documentation risks

- README and operational docs show shell examples assigning dashboard password, database DSN, and foreign-exchange/API key values. Values are placeholders, but copying secrets into shell history/process environments remains a documented operational risk.
- `scripts/backup_db.sh` sources `/run/wwma/env` for offsite credentials and references `/root/.config/rclone/rclone.conf`; permissions and ownership are outside this repo and must be verified on the VPS separately.
- `wwma-finance.service` documents a fallback `~/.hermes-suisui/.env` for `FOREX_KEY`; this path must remain protected and must not be copied into the repository.

### Low/no finding in inspected tracked files

- `.gitignore` excludes `.env`, `.env.*` except `.env.example`, private-key/certificate extensions, credentials, `.vercel/`, coverage, caches, and logs.
- Frontend auth code documents session-token login and explicitly warns not to set `VITE_DASHBOARD_PASSWORD`; no live frontend password value was observed.
- Test fixtures contain synthetic values such as `test-pass` and `nope:nope`; these are not production secrets but should remain clearly test-scoped.
- No private-key block or recognizable live GitHub/OpenAI-style token was printed or observed by the redacted scan.

**Important limitation:** pattern scans cannot prove absence of secrets in binary files, deleted history, GitHub/Vercel settings, ignored files, or production hosts. A separate history scan should be run in a controlled environment if required; this task did not print secret-bearing history content.

## 6. Phase 1 decision and release blockers

**Decision: NOT READY / Phase 1 audit gate incomplete.**

Release blockers:

1. Working tree is not clean; current changes are not a committed/pushed release source.
2. Password-bearing default PostgreSQL DSNs are tracked in source.
3. Backup scheduling is not represented by a tracked deploy unit, and backup freshness/restore integrity are unverified locally.
4. Rollback procedures for services, database, and Vercel are requirements but lack tested evidence in the inspected files.
5. CI dependency installation is not fully reproducible because backend requirements are lower-bounded and frontend install falls back from `npm ci`.
6. Production deployment/source hash, active service uniqueness, `/health`, public frontend status, ARM state, and latest database backup cannot be confirmed without prohibited production access.

Recommended next release-safe actions (not performed): remove credential-bearing source defaults and fail closed; pin dependencies/require lockfile-based installs; add a versioned backup timer/service or explicitly record the external scheduler; document and test restore/rollback procedures; then obtain CI and production-lock evidence for the exact committed hash.

## 7. Verification evidence

All commands were read-only/non-mutating and were run from `C:\Users\faizz\upstream-dashboard` unless noted. Secret-bearing output was not copied into this report.

| Command/tool | Exit/result | Evidence |
|---|---:|---|
| `read` | success | `.github/workflows/ci.yml` (51 lines); `frontend/package.json`; `backend/requirements.txt`; deploy units; `scripts/backup_db.sh`; `.gitignore`; `docs/PRODUCTION-LOCK.md`. |
| `git status --porcelain=v1 -b` | 0 | `main...origin/main`; modified/staged plan and untracked `artifacts/` plus implementation plan. |
| `git log --oneline -10` | 0 | Recent commits including `37e93c5`, `148fbe5`, `0d39464`. |
| `git branch -avv` | 0 | `main` tracks `origin/main`; `fix` tracks `origin/fix`; refs match locally. |
| `git tag -l` | 0, no tag output | No release tags listed. |
| `git rev-list --count HEAD` | 0 | 108 commits. |
| `git remote -v` / remote config read | 0 | GitHub origin is `https://github.com/fazulfi/upstream-dashboard.git`. |
| `git ls-files \| wc -l` | 0 | 106 tracked files. |
| `grep` redacted secret-pattern scan | matches found; no values retained | Synthetic tests, docs/env names, and tracked fallback DSNs identified above; output was truncated and not reproduced. |
| `grep` deployment/config references | matches found; no secret values retained | Vercel/VPS/systemd/backup references in README and production-lock docs. |

No build, test, deploy, SSH, push, commit, or production command was executed as part of this audit.
