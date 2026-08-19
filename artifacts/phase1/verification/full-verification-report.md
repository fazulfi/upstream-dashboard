# Phase 1 Verification Report (Task I)

**Repo:** `C:\Users\faizz\upstream-dashboard`
**Branch:** `main` @ `207a259` (Merge pull request #6 from fazulfi/feat/ui-ux-styling)
**Date:** 2026-08-19
**Mode:** Read-only verification. No files modified, no deploy, no commit.
**Python interpreter:** `.venv-test/Scripts/python.exe` (Python 3.14.3). System `python` (C:\Python314) is on PATH; `python3` not present. `scripts/auto_pricing.py`, `backend/app.py` require `UPSTREAM_DB` env; the backend test `conftest.py` sets a harmless dummy DSN, and check 1 was run with an identical harmless dummy DSN injected via env (module import gate only; tests use mocks and contact no DB).

---

## 1. Backend script unit tests — `test_self_undercut`

**Command:**
```
UPSTREAM_DB="postgresql://nope:nope@127.0.0.1:1/nox" .venv-test/Scripts/python.exe -B -m unittest scripts.tests.test_self_undercut -v
```

**Result: PASS** (53 tests, all OK, exit 0).

**Command output (verbatim, abbreviated to last lines + one representative sample):**
```
test_arm_flag_requires_canonical_boolean (scripts.tests.test_self_undercut.TestDaemonReliability.test_arm_flag_requires_canonical_boolean) ... ok
test_delayed_data_is_independent (scripts.tests.test_self_undercut.TestDaemonReliability.test_delayed_data_is_independent) ... ok
test_failed_heartbeat_write_is_not_healthy (scripts.tests.test_self_undercut.TestDaemonReliability.test_failed_heartbeat_write_is_not_healthy) ... ok
test_ids_are_uuid4 (scripts.tests.test_self_undercut.TestDaemonReliability.test_ids_are_uuid4) ... ok
test_pid_lock_refuses_live_and_takes_over_dead (scripts.tests.test_self_undercut.TestDaemonReliability.test_pid_lock_refuses_live_and_takes_over_dead) ... ok
test_utc_bucket_boundaries_and_retention_window (scripts.tests.test_self_undercut.TestDaemonReliability.test_utc_bucket_boundaries_and_retention_window) ... ok
test_db_execute_returns_false_when_psycopg_missing (scripts.tests.test_self_undercut.TestDbHelpers.test_db_execute_returns_false_when_psycopg_missing) ... ok
... (45 more "ok" lines, TestDecideTriggerAreaCorrectedContract / GLMCorrectedContract / OfficialBasis / GetPositionsSelfUndercut / ProviderScopedLevels / ProviderScopedPositions / TestRunCycleRegression) ...
test_in_area_no_valid_ref_resumes_without_crash (scripts.tests.test_self_undercut.TestRunCycleRegression.test_in_area_no_valid_ref_resumes_without_crash) ... ok
test_no_levels_only_our_slugs_no_resume (scripts.tests.test_self_undercut.TestRunCycleRegression.test_no_levels_only_our_slugs_no_resume) ... ok
test_resume_preserves_genuine_orderbook_competitor_price (scripts.tests.test_self_undercut.TestRunCycleRegression.test_resume_preserves_genuine_orderbook_competitor_price) ... ok

----------------------------------------------------------------------
Ran 53 tests in 91.156s

OK
EXIT: 0
```

**Note on initial failure without env:** Running the exact command without `UPSTREAM_DB` set fails at import time (module raises `RuntimeError: UPSTREAM_DB must be configured` at `scripts/auto_pricing.py:139`). This is a hard module-import gate, not a test failure. Setting a harmless dummy DSN is required to import the module; the tests themselves mock all network/DB side effects. This mirrors `backend/tests/conftest.py:18` which does the same for the backend suite.

---

## 2. Python byte-compile of key modules

**Command:**
```
.venv-test/Scripts/python.exe -B -m py_compile scripts/auto_pricing.py backend/app.py backend/db_schema.py
```

**Result: PASS** (no output, exit 0).

**Command output:**
```
EXIT: 0
```
No traceback emitted — all three modules parse cleanly.

---

## 3. Recursive compile-all of `scripts/` and `backend/`

**Command:**
```
.venv-test/Scripts/python.exe -B -m compileall -q scripts/ backend/
```

**Result: PASS** (quiet mode, exit 0).

**Command output:**
```
EXIT: 0
```
No compile errors across both package trees.

---

## 4. Backend pytest suite

**Command:**
```
../.venv-test/Scripts/python.exe -B -m pytest tests -q -p no:warnings
```
(workdir: `backend/`)

**Result: PASS** (72 tests collected, all passed, exit 0).

**Command output (verbatim):**
```
........................................................................ [100%]
EXIT: 0
```

---

## 5. Frontend vitest suite

**Command:**
```
CI=true npm test -- --run
```
(workdir: `frontend/`)

**Result: PASS** (5 test files, 24 tests, all passed, exit 0).

**Command output (verbatim):**
```
> frontend@0.0.0 test
> vitest run --coverage --run

 RUN  v3.2.7 C:/Users/faizz/upstream-dashboard/frontend
      Coverage enabled with v8

 ✓ src/pages/Topups.test.jsx (5 tests) 13ms
 ✓ src/lib/fmt.test.js (10 tests) 50ms
 ✓ src/hooks/useReliabilityStream.test.jsx (3 tests) 8ms
 ✓ src/hooks/useApi.test.jsx (4 tests) 51ms
 ✓ src/pages/Reliability.test.jsx (2 tests) 9ms

 Test Files  5 passed (5)
      Tests  24 passed (24)
   Start at 11:01:50
   Duration 1.50s (transform 333ms, setup 0ms, collect 617ms, tests 131ms, environment 4ms, prepare 1.46s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |    4.22 |    61.79 |   21.81 |    4.22 |
 src               |       0 |        0 |        0 |       0 |
  App.jsx          |       0 |        0 |        0 |       0 | 1-70
 src/components    |       0 |    11.11 |   11.11 |       0 |
  Badge.jsx        |       0 |        0 |        0 |       0 | 1-10
  DataTable.jsx    |       0 |        0 |        0 |       0 | 1-118
  ...ingsChart.jsx |       0 |        0 |        0 |       0 | 1-68
  KpiCard.jsx      |       0 |        0 |        0 |       0 | 1-25
  Layout.jsx       |       0 |        0 |        0 |       0 | 1-57
  LoginGate.jsx    |       0 |        0 |        0 |       0 | 1-57
  Sidebar.jsx      |       0 |        0 |        0 |       0 | 1-69
  Skeleton.jsx     |       0 |        0 |        0 |       0 | 1-25
  Sparkline.jsx    |       0 |      100 |     100 |       0 | 6-35
 src/hooks         |   26.73 |    86.66 |   35.71 |   26.73 |
  useApi.jsx       |   28.28 |      100 |      40 |   28.28 | ...7,52-59,66-110
  ...lityStream.js |      25 |       75 |      25 |      25 | 25-32,35-95
 src/lib           |   81.42 |    90.32 |   46.15 |   81.42 |
  fmt.js           |     100 |    95.65 |     100 |     100 | 33
  ...abilityApi.js |   59.37 |       75 |   22.22 |   59.37 | 4-10,13-16,24-25
 src/pages         |       0 |        0 |       0 |       0 |
  Analytics.jsx    |       0 |        0 |       0 |       0 | 1-105
  Asks.jsx         |       0 |        0 |       0 |       0 | 1-169
  AutoPricing.jsx  |       0 |        0 |       0 |       0 | 1-216
  Budgets.jsx      |       0 |        0 |       0 |       0 | 1-114
  Catalog.jsx      |       0 |        0 |       0 |       0 | 1-91
  Combos.jsx       |       0 |        0 |       0 |       0 | 1-95
  Dashboard.jsx    |       0 |        0 |       0 |       0 | 1-127
  Earnings.jsx     |       0 |        0 |       0 |       0 | 1-165
  FleetHealth.jsx  |       0 |        0 |       0 |       0 | 1-107
  Keys.jsx         |       0 |        0 |       0 |       0 | 1-111
  Market.jsx       |       0 |        0 |       0 |       0 | 1-96
  Pnl.jsx          |       0 |        0 |       0 |       0 | 1-148
  Reliability.jsx  |       0 |        0 |       0 |       0 | 1-57
  Settings.jsx     |       0 |        0 |       0 |       0 | 1-71
  Settlements.jsx  |       0 |        0 |       0 |       0 | 1-48
  Topups.jsx       |       0 |        0 |       0 |       0 | 1-106
  Upstreams.jsx    |       0 |        0 |       0 |       0 | 1-67
  Usage.jsx        |       0 |        0 |       0 |       0 | 1-141
-------------------|---------|----------|---------|---------|-------------------
EXIT: 0
```

Note: `npm test` maps to `vitest run --coverage` (per `frontend/package.json`); the appended `-- --run` results in `vitest run --coverage --run`. The low overall statement coverage is expected — tests target select modules (`fmt`, `Topups`, `Reliability`, `useApi`, `useReliabilityStream`), not the full app. All tests pass.

---

## 6. Frontend production build

**Command:**
```
CI=true npm run build
```
(workdir: `frontend/`)

**Result: PASS** (build succeeded, exit 0).

**Command output (verbatim):**
```
> frontend@0.0.0 build
> vite build

vite v8.2.1 building client environment for production...
transforming...✓ 2508 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.90 kB │ gzip:   0.48 kB
dist/assets/index-C0sB5Irf.css   27.20 kB │ gzip:   4.91 kB
dist/assets/index-D0ehz_e5.js   755.30 kB │ gzip: 218.53 kB

✓ built in 1.22s
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeLimitWarning.reg
EXIT: 0
```
The chunk-size warning is a performance suggestion, not a build failure.

---

## 7. Secret scan (staged + committed code)

**Method:** `git grep` over tracked files (`git ls-files` = 147 files) for: private-key blocks, real `sk-` secrets, hardcoded `password=`/`api_key=`, and `.env`/env-driven references.

**Result: PASS** — no real secrets found in tracked source. All matches are benign (code identifiers, DB column names, format-string placeholders, or documentation).

**Command output (verbatim, key excerpts):**

Private key blocks — none:
```
$ git grep -n -I -E 'BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE)'
(no matches)
```

Real `sk-` secrets (≥20 chars) — none:
```
$ git grep -n -I -o -E 'sk-[A-Za-z0-9]{20,}'
(no matches)
```

Hardcoded password/API-key assignments — none (grep excluded test password + doc DSN):
```
$ git grep -n -I -E 'password\s*=\s*["'"'"'][^"'"'"']{6,}["'"'"']|api_key\s*=\s*["'"'"'][^"'"'"']{6,}["'"'"']'
(no matches)
```

All flag-pattern matches reviewed (each is benign):
- `backend/app.py` — `api_keys`/`load_api_key` are function names; `INSERT INTO api_keys (... key_prefix, ... secret ...)` is a DB schema/column reference (the `secret` value is env-loaded, never returned by the API). `DASHBOARD_PASSWORD = os.environ.get("DASHBOARD_PASSWORD")` at `app.py:35` is **fail-closed**: it raises `RuntimeError("DASHBOARD_PASSWORD must be configured with at least 12 characters")` (`app.py:36-37`). There is **no** `admin123` fallback (a previously documented finding has been remediated). `INFERHUB_API_KEY` read from env (`app.py:518-519`).
- `scripts/fin_ops.py:29` and `scripts/recon_finance.py:20` — `DB_DSN = os.environ.get("UPSTREAM_DB", "postgresql://gamesim:upstream_local@127.0.0.1:5432/upstream")`. This is a **local-dev fallback DSN** containing a default password (`upstream_local`) for a localhost dev database. It is a benign local credential (value published in README as the documented local dev DSN), not a production secret; noted for awareness but not a real live secret.
- `scripts/fin_ops.py:56`, `scripts/gen_finance.py:109` — `"https://api.forexrateapi.com/v1/latest?api_key=%s" % key` — `key` comes from `FOREX_KEY` env or `~/.hermes-suisui/.env` (verified at `scripts/fin_ops.py:36-53`, `gen_finance.py:30`); it is a format placeholder, not a literal.
- `frontend/src/hooks/useReliabilityStream.js:49` — `getSessionToken()` reads the runtime session token from storage; no literal.
- `frontend/package-lock.json`, `favicon.svg`, `vite.svg` — benign (npm registry URLs, SVG path data).
- `.gitignore` excludes `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`, `*.crt`, `credentials`, `.vercel/`. `frontend/.env.local` exists locally but is git-ignored; its contents were not read.

**Verdict:** No live secrets, private keys, or hardcoded production credentials exist in tracked source. Secrets are env-driven and fail-closed.

---

## 8. Route/import audit — `frontend/src/App.jsx`

**Result: PASS** — all 18 routes present (17 + Reliability landing at `/`), all imports resolve.

**Routes found in `App.jsx` (`Routes` block, lines 31-50) vs required list:**

| Required route | App.jsx entry | Present |
|---|---|---|
| Reliability landing `'/'` | `<Route path="/" element={<Reliability />} />` | ✅ |
| Dashboard | `<Route path="/dashboard" ...>` | ✅ |
| Earnings | `<Route path="/earnings" ...>` | ✅ |
| Upstreams | `<Route path="/upstreams" ...>` | ✅ |
| Market | `<Route path="/market" ...>` | ✅ |
| Asks | `<Route path="/asks" ...>` | ✅ |
| Auto-Pricing | `<Route path="/auto-pricing" ...>` | ✅ |
| Fleet-Health | `<Route path="/fleet-health" ...>` | ✅ |
| Catalog | `<Route path="/catalog" ...>` | ✅ |
| Budgets | `<Route path="/budgets" ...>` | ✅ |
| Combos | `<Route path="/combos" ...>` | ✅ |
| Analytics | `<Route path="/analytics" ...>` | ✅ |
| Pnl | `<Route path="/pnl" ...>` | ✅ |
| Settlements | `<Route path="/settlements" ...>` | ✅ |
| Usage | `<Route path="/usage" ...>` | ✅ |
| Keys | `<Route path="/keys" ...>` | ✅ |
| Topups | `<Route path="/topups" ...>` | ✅ |
| Settings | `<Route path="/settings" ...>` | ✅ |

All 18 routes present (17 + Reliability landing).

**Import audit:** `App.jsx` imports: `./theme`, `./components/Layout`, `./components/LoginGate`, and all 17 page modules (`pages/{Dashboard,Reliability,Earnings,Upstreams,Pnl,Settlements,Settings,Analytics,Keys,Topups,Market,Catalog,Usage,Asks,FleetHealth,AutoPricing,Budgets,Combos}`). File-resolution check confirmed every import target exists on disk:

```
OK ./theme
OK ./components/Layout
OK ./components/LoginGate
OK ./pages/Dashboard
OK ./pages/Reliability
OK ./pages/Earnings
OK ./pages/Upstreams
OK ./pages/Pnl
OK ./pages/Settlements
OK ./pages/Settings
OK ./pages/Analytics
OK ./pages/Keys
OK ./pages/Topups
OK ./pages/Market
OK ./pages/Catalog
OK ./pages/Usage
OK ./pages/Asks
OK ./pages/FleetHealth
OK ./pages/AutoPricing
OK ./pages/Budgets
OK ./pages/Combos
```
(no `MISSING` lines). Directory listing confirms all 20 page files, 9 components, 2 lib modules, and 2 hooks exist. `react-router-dom` (HashRouter/Routes/Route) is declared in `frontend/package.json` dependencies and the production build (check 6) transformed 2508 modules successfully — further confirming no unresolved imports.

---

## Summary

| # | Check | Result |
|---|---|---|
| 1 | `test_self_undercut` (53 tests) | **PASS** |
| 2 | `py_compile` key modules | **PASS** |
| 3 | `compileall` scripts/ backend/ | **PASS** |
| 4 | Backend pytest (72 tests) | **PASS** |
| 5 | Frontend vitest (24 tests) | **PASS** |
| 6 | Frontend `vite build` | **PASS** (chunk-size warning, non-fatal) |
| 7 | Secret scan | **PASS** (no real secrets; local-dev DSN fallback noted) |
| 8 | Route/import audit (18 routes) | **PASS** |

**Overall: 8/8 PASS.**
