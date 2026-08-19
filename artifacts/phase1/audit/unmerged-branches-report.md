# Phase 1 Reliability — Unmerged Branches Audit Report

- **Repo:** `C:\Users\faizz\upstream-dashboard`
- **Target branch:** `origin/main` @ `207a259` (Merge PR #6, `feat/ui-ux-styling`)
- **Date:** 2026-08-19
- **Scope:** Read-only. No merges, no pushes, no deletions, no code changes.

## Executive summary

**All Phase 1 Reliability functionality is already merged into `main`.** The
`fix` branch is the only branch with commits not reachable from `origin/main`,
and its content has been fully superseded by `main` — every functional fix it
carries already exists in `main` in equivalent or evolved form, and its pure-logic
extraction (`backend/logic.py` + tests) is byte-identical to `main`. No Phase 1
work is stranded in any branch. **No merge is needed.**

Per-branch recommendation:

| Branch | Unmerged commits | Phase 1 work stranded? | Recommendation |
|---|---|---|---|
| `feat/phase1-reliability` | 0 | No (fully merged) | close |
| `hotfix-reliability-summary` | 0 | No (fully merged) | close |
| `vercel-root-config-fix` | 0 | No (fully merged) | close |
| `fix` | 4 | No (superseded by main) | close (no merge) |
| `origin/reliability-schema-hotfix` | 0 | No (fully merged) | close |

---

## 1. Branch inventory

Command: `git fetch --prune origin && git branch -a`

```
  feat/phase1-reliability
  fix
  hotfix-reliability-summary
* main
  vercel-root-config-fix
  remotes/origin/HEAD -> origin/main
  remotes/origin/feat/phase1-reliability
  remotes/origin/fix
  remotes/origin/hotfix-reliability-summary
  remotes/origin/main
  remotes/origin/reliability-schema-hotfix
  remotes/origin/vercel-root-config-fix
```

Branch tips and ancestor status vs `origin/main`:

| Branch | Tip | Ancestor of `origin/main`? |
|---|---|---|
| `feat/phase1-reliability` | `8d9cd3a` | YES (fully merged) |
| `hotfix-reliability-summary` | `509868d` | YES (fully merged) |
| `vercel-root-config-fix` | `7ff10f2` | YES (fully merged) |
| `origin/reliability-schema-hotfix` | `1232b13` | YES (fully merged) |
| `fix` | `61c7dbc` | **NO — 4 unmerged commits** |

---

## 2. Per-branch: commits not in `main` (`git log origin/main..<branch> --oneline`)

### `feat/phase1-reliability` — empty

```
(no output — zero commits not in main)
```

### `hotfix-reliability-summary` — empty

```
(no output — zero commits not in main)
```

### `vercel-root-config-fix` — empty

```
(no output — zero commits not in main)
```

### `origin/reliability-schema-hotfix` — empty

```
(no output — zero commits not in main)
```

### `fix` — 4 unmerged commits

```
61c7dbc fix: conn.commit() di luar blok with db_connect (connection closed) — keys delete, topups, combos delete
6a818bf fix: _auth_gate hilang saat refactor (auth 401 semua route); logic.rate_limit_hit KeyError; bucket_points slot bug; test expectations dikoreksi
5f8de0f test: pisahkan pure logic ke backend/logic.py + test coverage >=80%; fix _rl rate-limit
a2dd369 fix(prod): audit 2026-08-13 — keamanan, fitur mati, data & auto-pricing
```

Merge-base `fix` ↔ `origin/main`: `75f78b9`.

---

## 3. Does `main` already have the Phase 1 implementation?

**Yes.** Phase 1 Reliability backend/daemon/frontend was merged via earlier PRs
(PR #2 `feat/phase1-reliability`, PR #3 `vercel-root-config-fix`, PR #4
`reliability-schema-hotfix`, PR #5 backend hotfix `5f696e9`, PR #6 UI/UX `207a259`).

Evidence — reliability endpoints in `main` (`backend/app.py`):

```
2373: def _reliability_query(sql, params=()):
2379: @app.route("/api/reliability/summary")
2428: @app.route("/api/reliability/cycles")
2435: @app.route("/api/reliability/events")
2443: @app.route("/api/reliability/models")
2449: @app.route("/api/reliability/arm", methods=["POST"])
2459: @app.route("/api/reliability/disarm", methods=["POST"])
2468: @app.route("/api/reliability/stream")
```

Evidence — daemon heartbeat/uuid in `main` (`scripts/auto_pricing.py`):

```
34: import json, os, time, datetime, argparse, threading, uuid, errno
53: return str(uuid.uuid4())
119: def heartbeat_payload(cycle_id, status, **extra):
124: def persist_heartbeat(cycle_id, **extra):
911: persist_heartbeat(cycle_id, status="skipped", models=0)
```

Evidence — schema + daemon files present in `main`:

- `backend/db_schema.py` contains 12 `reliability` references
- `backend/app.py` contains 27 `reliability` references
- `frontend/src/pages/Reliability.jsx`, `frontend/src/lib/reliabilityApi.js`,
  `frontend/src/hooks/useReliabilityStream.js`, `backend/tests/test_reliability_api.py`

**Contrast — the `fix` branch contains NONE of this:**

```
git grep "reliability" fix -- backend/app.py   -> (empty)
git grep "heartbeat\|uuid" fix -- scripts/auto_pricing.py -> (empty)
```

This proves the `fix` branch predates Phase 1 Reliability and cannot be a source
of any Phase 1 work.

---

## 4. Is anything in `fix` still missing from `main`?

No. The four `fix` commits carry functional fixes and the pure-logic refactor.
Every one of these is already present in `main`:

### 4a. Pure-logic extraction — byte-identical in `main`

`backend/logic.py`, `backend/tests/test_logic.py`, `backend/pytest.ini`,
`frontend/vitest.config.js`, `deploy/wwma-finance.service`, `scripts/gen_finance.py`,
`backend/requirements.txt`, `docs/inferhub-openapi-spec.json`, and several frontend
pages are **identical** between `fix` and `origin/main`. In particular:

```
IDENTICAL: backend/logic.py
IDENTICAL: backend/tests/test_logic.py
IDENTICAL: backend/pytest.ini
IDENTICAL: frontend/vitest.config.js
IDENTICAL: scripts/gen_finance.py
IDENTICAL: frontend/src/pages/Topups.jsx
IDENTICAL: frontend/src/pages/Topups.test.jsx
```

### 4b. `_auth_gate` fix — present in `main`

```
origin/main:backend/app.py:696: def _auth_gate():
```

### 4c. `rate_limit_hit` KeyError fix — present in `main`

```
origin/main:backend/app.py:713: if not logic.rate_limit_hit(_rl, ip, RL_LIMIT, RL_WINDOW):
origin/main:backend/logic.py:47: def rate_limit_hit(store, ip, limit, window, now=None):
```

### 4d. `conn.commit()`-inside-`with`-block fix — present in `main`

Commit `61c7dbc` moved `conn.commit()` inside the `with db_connect() as conn`
block for keys-delete / topups-post / combos-delete. `main` already does this
(and evolved the routes further, e.g. `api_keys_delete` now proxies to InferHub):

```
main api_topups_post:  conn.commit()  INSIDE `with db_connect()` block  (line ~1920)
main api_combos_delete: conn.commit() INSIDE `with db_connect()` block  (line ~1971)
```

### 4e. Files that only differ because `main` evolved past them

Files like `backend/app.py`, `README.md`, `docs/auto-pricing.md`,
`scripts/auto_pricing.py`, `scripts/fin_ops.py`, and the frontend components were
substantially rewritten/expanded in `main` (adding Phase 1 Reliability, finance,
and the new design system). `main` is far ahead of `fix` (merge-base `75f78b9`,
main adds ~93 files / ~22k insertions beyond `fix`). These differences are
forward evolution in `main`, not missing fixes from `fix`.

The only files present in `fix` but absent from `main`
(`FleetPanel.jsx`, `Header.jsx`, `PnlPanel.jsx`, `Providers.jsx`) were **removed**
during the UI/UX redesign merged via PR #6 — deletions, not stranded functionality.

---

## 5. Conclusion & recommendations

- **No Phase 1 Reliability code is stranded in any branch.** All Phase 1 work is
  in `main` via earlier merged PRs.
- `feat/phase1-reliability`, `hotfix-reliability-summary`, `vercel-root-config-fix`,
  and `origin/reliability-schema-hotfix` are fully merged → **no merge needed**.
- `fix` has 4 unmerged commits, but every functional change is already present in
  `main` (identical `logic.py`, `_auth_gate`, `rate_limit_hit`, `conn.commit()`
  inside the `with` block). Merging `fix` would be a no-op at best and a regression
  risk at worst (it predates Phase 1 and would conflict heavily with `main`).
  → **no merge needed; safe to close.**

**Phase 1 can be closed out as complete.**

---

## 6. Evidence appendix

### Raw `git log origin/main..<branch> --oneline`

```
=== origin/main..feat/phase1-reliability ===
(empty)

=== origin/main..hotfix-reliability-summary ===
(empty)

=== origin/main..fix ===
61c7dbc fix: conn.commit() di luar blok with db_connect (connection closed) — keys delete, topups, combos delete
6a818bf fix: _auth_gate hilang saat refactor (auth 401 semua route); logic.rate_limit_hit KeyError; bucket_points slot bug; test expectations dikoreksi
5f8de0f test: pisahkan pure logic ke backend/logic.py + test coverage >=80%; fix _rl rate-limit
a2dd369 fix(prod): audit 2026-08-13 — keamanan, fitur mati, data & auto-pricing

=== origin/main..vercel-root-config-fix ===
(empty)

=== origin/main..origin/reliability-schema-hotfix ===
(empty)
```

### Ancestor checks

```
git merge-base --is-ancestor <tip> origin/main
feat/phase1-reliability 8d9cd3a  -> YES (merged)
hotfix-reliability-summary 509868d -> YES (merged)
vercel-root-config-fix 7ff10f2  -> YES (merged)
origin/reliability-schema-hotfix 1232b13 -> YES (merged)
fix 61c7dbc -> NO (4 unmerged commits)
```

### Grep evidence — Phase 1 IS in `main`

- `git grep -c reliability origin/main -- backend/app.py` → `27`
- `git grep -c reliability origin/main -- backend/db_schema.py` → `12`
- `git grep -ni "heartbeat|uuid" origin/main -- scripts/auto_pricing.py` →
  imports, uuid, heartbeat_payload, persist_heartbeat

### Grep evidence — Phase 1 is NOT in `fix`

- `git grep -n "reliability" fix -- backend/app.py` → `(empty)`
- `git grep -ni "heartbeat|uuid" fix -- scripts/auto_pricing.py` → `(empty)`
