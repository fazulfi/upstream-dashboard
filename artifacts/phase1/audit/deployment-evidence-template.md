# Phase 1 Manual Deployment Evidence Template

**Status:** UNSIGNED / BLOCKED. This is a blank evidence record, not deployment authorization.
**Scope:** manual release evidence only. CI remains CI-only. No CD is permitted.
**Target identities:**

- Repository: `fazulfi/upstream-dashboard`, branch `main`
- VPS: `faiz-prod` / `82.25.62.204`, user `gamesim`
- Backend: `wwma-upstream-backend.service`, `127.0.0.1:8124`, behind `ops.budgezen.com`
- Daemon: `wwma-auto-pricing.service`, exactly one process, systemd authoritative
- Frontend: Vercel project `upstream-static`, deployed from `frontend/`, public URL `https://upstream-static.vercel.app`
- Invalid target: Vercel project `dashboard` and any root-repository Vercel deployment

Do not fill this template with estimates, screenshots without command output, or claims based on source review. Commands below are evidence-capture commands for an approved operator. They have not been run as part of this read-only preparation.

## 1. Release identity and PR gate

- Reviewed source commit: `[SHA]`
- Branch and working-tree result: `[branch]`, `[clean/blocked]`
- PR URL: `[URL]`
- PR approval: `[reviewer, UTC timestamp, approved/not approved]`
- CI workflow URL and exact run: `[URL, run ID, commit SHA]`
- CI result: `[green/red/not run]`
- CI scope confirmed: `[tests, lint, build, no deployment]`
- Manual deployment approval: `[approver, UTC timestamp, approved/not approved]`
- Operator: `[name]`
- Evidence captured at: `[UTC timestamp]`

Evidence commands, to run only after approval:

```bash
git status --short
git rev-parse HEAD
git diff --check
```

**Abort criteria:** no approved PR, CI is not green for the exact SHA, the tree is dirty, the SHA is unknown, CI performed deployment, or manual deployment approval is absent. Do not deploy while implementation or production authorization remains blocked in `artifacts/phase1/audit/decision-log.md`.

## 2. Backup and rollback readiness

- Pre-change database backup ID/path: `[ID/path]`
- Backup UTC timestamp: `[timestamp]`
- Backup scope: `[database/schema/files]`
- Backup integrity result: `[verified/not verified]`
- Restore rehearsal or exact approved procedure: `[record/path]`
- Daemon rollback artifact and source SHA: `[path/SHA]`
- Backend rollback artifact and source SHA: `[path/SHA]`
- Vercel previous deployment ID and promotion procedure: `[ID/procedure]`
- Restore operator and signature: `[name/signature/UTC]`

Required rollback order if a confirmed rollback condition occurs: DISARM when pricing safety is uncertain, record the incident, stop the affected systemd service before manual recovery, restore the last known-good release or database backup, restart the authoritative unit, verify fresh heartbeat, DB, and state evidence, then re-arm only by explicit operator decision.

**Abort criteria:** no backup before schema/backend change, backup cannot be identified or restored, rollback artifact does not match a known-good SHA, Vercel previous deployment is unavailable, or recovery would require an untracked/manual `nohup` service.

## 3. VPS deployment record, manual only

- Pull source SHA: `[SHA]`
- VPS path: `[/home/gamesim/dashboard]`
- Schema result: `[additive/compatible/not verified/failed]`
- Backend unit result: `[active/inactive/not verified]`
- Daemon unit result: `[active/inactive/not verified]`
- Backend identity count: `[count]`
- Daemon identity count: `[count]`
- ARM file value and meaning: `[0 or 1, DISARM/ARM]`
- `/health` result: `[HTTP status, UTC timestamp]`
- Auth smoke result: `[pass/fail, no secret recorded]`
- Reliability REST/SSE smoke result: `[pass/fail, transport/cursor/recovery noted]`
- Operator signature: `[name/signature/UTC]`

Approved operator command evidence, to be captured on the VPS without exposing secrets:

```bash
cd /home/gamesim/dashboard && git rev-parse HEAD
systemctl --user -M gamesim@.host is-active wwma-upstream-backend.service
systemctl --user -M gamesim@.host is-active wwma-auto-pricing.service
pgrep -af '/home/gamesim/scripts/auto_pricing.py'
cat /home/gamesim/.hermes-suisui/logs/auto-pricing-arm
curl -sk -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8124/health
```

**Abort criteria:** source SHA does not match the reviewed SHA, either unit is not active, process count is not exactly one, ARM state is unknown, health/auth/SSE smoke fails, schema compatibility is unverified, or any duplicate service/process exists. Never deploy directly from an uncommitted tree.

## 4. Vercel deployment record, exact project only

- Project: `upstream-static`
- Working directory: `frontend/`
- Deployment ID/URL: `[ID/URL]`
- Deployed commit/source hash: `[SHA/hash]`
- Public URL: `https://upstream-static.vercel.app`
- HTTP status: `[status, UTC timestamp]`
- Correct route and current asset verified: `[route, asset/hash, pass/fail]`
- No password or secret bundled: `[evidence, pass/fail]`
- Operator signature: `[name/signature/UTC]`

**Abort criteria:** project is not `upstream-static`, deployment uses repository root instead of `frontend/`, source hash is unknown or mismatched, public route is not HTTP 200/current, API/auth behavior is broken, or secrets are present in the public bundle. The `dashboard` Vercel project is never valid production evidence.

## 5. Release decision

- PR gate: `[PASS/FAIL/UNKNOWN]`
- VPS gate: `[PASS/FAIL/UNKNOWN]`
- Vercel gate: `[PASS/FAIL/UNKNOWN]`
- Backup/rollback gate: `[PASS/FAIL/UNKNOWN]`
- Overall deployment evidence: **UNSIGNED / BLOCKED** until every field is supported by captured evidence.

## PR #2 verification update (2026-08-18)

- Feature branch: `feat/phase1-reliability`
- PR: https://github.com/fazulfi/upstream-dashboard/pull/2
- Backend CI: **PASS** on commit `d6d8a36`
- Frontend CI: **PASS** on commit `d6d8a36`
- Vercel preview status: **FAIL**, external project configuration error: framework is set to `services` but no services are declared. This is not production deployment evidence and must not be bypassed.
- PR review decision: **REVIEW_REQUIRED**; merge state **BLOCKED**.
- Production deployment: **NOT STARTED**; no VPS/Vercel production mutation performed.
- Approval gate: **BLOCKED**. The PR owner cannot approve their own pull request, and the repository currently has no other collaborator/reviewer available through GitHub API. No bypass or self-approval was attempted.
- Merge gate: **BLOCKED** despite backend/frontend CI passing because required review and the failing Vercel status remain unresolved.
- Release action: **STOP**. Do not SSH, merge, deploy, or start the 24-hour observation until an independent approval and required status resolution exist.
- Release authorization: **NOT GRANTED**
- Blocking reasons: `[list exact unresolved items]`
- Final approver signature and UTC timestamp: `[blank]`
