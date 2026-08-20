<!-- markdownlint-disable MD013 -->

# Credential-History Evidence

**Task:** Phase 2 Task 7 / P4 (credential-history hygiene)
**Run date:** 2026-08-20
**Branch/HEAD:** `feat/phase2-production-hardening` @ `3fb44b4`
**Scope:** Read-only local Git inspection. The rotated password value was never printed or recorded; searches use the literal placeholder `<rotated-value>`.

## Commands and actual outputs

### 1. Password-value search

Command:

```bash
git log --oneline --all -S '<rotated-value>' -- .
```

Actual output:

```text
(no output)
```

**Criterion:** PASS — zero hits; no live credential value was found.

### 2. Environment-file history search

Command:

```bash
git log --oneline --all -- '*.env*'
```

Actual output:

```text
(no output)
```

**Criterion:** PASS — zero hits.

### 3. Tracked sensitive-file review

Command:

```bash
git ls-files | grep -iE '\.env|\.pem|\.key|\.crt|credentials'
```

Actual output:

```text
(no output)
```

**Criterion:** PASS — zero matching tracked files.

### 4. Leak-removal commit review

Command:

```bash
git show --stat bdd22b9 | head -30
```

Actual output (unchanged; contains no credential value):

```text
commit bdd22b9cda4f1fa4ea2353c97981962a72869d25
Author: fazulfi <fazulfi>
Date:   Wed Aug 12 06:50:58 2026 +0000

    fix: auth dashboard (X-Auth), remove secret leak, fix refetch crash, real ask PUT, dev proxy, ledger payouts id, constants order, auto-pricing stability

 .gitignore                         |   2 +
 backend/app.py                     | 104 +++++++++++++++++++++++++------------
 frontend/src/components/Layout.jsx |   6 +++
 frontend/src/hooks/useApi.jsx      |  37 ++++++++++---
 frontend/src/pages/Asks.jsx        |  24 ++++++---
 frontend/src/pages/AutoPricing.jsx |   8 +--
 frontend/src/pages/Combos.jsx      |   6 +--
 frontend/src/pages/FleetHealth.jsx |   2 +-
 frontend/src/pages/Keys.jsx        |   8 +--
 frontend/src/pages/Topups.jsx      |   6 +--
 frontend/src/pages/ledger_update.py |   3 +-
 frontend/src/vite.config.js        |   9 ++++
 12 files changed, 154 insertions(+), 61 deletions(-)
```

**Criterion:** PASS — commit `bdd22b9` is the leak-removal commit and its stat includes `.gitignore` and `backend/app.py`. (The command's actual path/stat output is preserved as emitted by this checkout.)

### 5. History-rewrite tool availability

Command:

```bash
git filter-repo --version 2>&1 | head -1
```

Actual output:

```text
git: 'filter-repo' is not a git command. See 'git --help'.
```

**Criterion:** PASS — `git filter-repo` is not installed. No history rewrite was attempted.

## Recorded facts and conclusion

- The git `-S` search used the literal placeholder `<rotated-value>` (masked by design), and returned zero hits; this is the safest verifiable assertion without recording the credential.
- The secret leak was removed in commit `bdd22b9` (`remove secret leak`, 2026-08-12); the commit stat confirms changes to `.gitignore` and `backend/app.py`.
- `.dashboard-password` is ignored by `.gitignore`.
- No tracked `.env*` files were found.
- `git filter-repo` is not installed.

**C11 conclusion:** No credential-history purge is required in Phase 2. Do not install `git-filter-repo`, rewrite history, or force-push. Revisit only if a live credential appears in history; any future rewrite must be a separately approved repository-maintenance operation.
