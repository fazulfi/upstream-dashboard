<!-- markdownlint-disable MD013 -->

# Ignored-Artifacts Evidence

**Task:** Phase 2 Task 7 / P5 (ignored-artifacts hygiene)
**Run date:** 2026-08-20
**Branch/HEAD:** `feat/phase2-production-hardening` @ `3fb44b4`
**Scope:** Read-only local Git and `.gitignore` inspection. No ignore rule was changed because no gap was found.

## Commands and actual outputs

### 1. Tracked environment/cache/artifact review

Command:

```bash
git ls-files | grep -iE '(^|/)(\.env|.*\.env$|__pycache__|node_modules|dist/|\.vercel|coverage|\.pytest_cache|\.venv|.*\.bak$)'
```

Actual output:

```text
(no output)
```

**Criterion:** PASS — zero tracked environment, cache, coverage, build, virtual-environment, or backup artifacts.

### 2. Working-tree status

Command:

```bash
git status --porcelain | head -20
```

Actual output:

```text
 M NEXT-PHASE-ROADMAP.md
 M frontend/package-lock.json
 M frontend/package.json
 M frontend/vitest.config.js
?? frontend/src/components/LoginGate.test.jsx
?? frontend/src/test/
?? login-red.txt
?? session-ses_ff6c.md
```

**Criterion:** PASS — the output contains no tracked env/cache/artifact path. The listed pre-existing working-tree changes are unrelated to the hygiene audit and were not modified.

### 3. Key `.gitignore` rule count

Command:

```bash
grep -cE '^\.env|^node_modules|^dist/|^__pycache__|^\.vercel' .gitignore
```

Actual output:

```text
6
```

**Criterion:** PASS — count is at least 5. The file also covers credentials, key/certificate extensions, Python virtual environments, logs, coverage, pytest cache, backups, and `.dashboard-password`.

## Referenced prior audit

`artifacts/next-phase/repo-cleanup-report.md` records the prior read-only audit result: no tracked `node_modules`, `.env`, `.venv`, cache, coverage, or `dist` files; local-only artifacts are ignored; and `.gitignore` covers environment, Node, Python, logs, test caches, and `.vercel/`. This fresh `git ls-files` check confirms that result.

## Disposition

- `login-red.txt`, `red-page-tests.txt`, and `task-3b-test-output.txt` are RED/scratch test evidence and must be deleted before the release commit.
- `session-ses_ff6c.md` is a pre-existing session export, is never committed, and remains untracked.
- `.sisyphus/` is local tooling and is never committed.

## Conclusion

No `.gitignore` gap was found, so `.gitignore` was not modified. The repository has no tracked environment/cache/artifact matches under the Task 7 criterion.

**C12 conclusion:** Record the hygiene audit as Phase 2 evidence. No ignore entries are needed. If a future fresh check finds a tracked artifact, stop and raise before adding rules.
