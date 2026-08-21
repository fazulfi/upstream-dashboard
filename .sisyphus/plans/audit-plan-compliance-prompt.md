# Plan-Compliance Audit — Phase 5 Auto-Pricing Scope (K-001..K-016)

You are auditing the Phase 5 implementation in the git working tree (UNCOMMITTED changes on main, baseline 761b744) against the authoritative plan. Do NOT modify any files — read-only audit.

## Source of truth (read these first)
1. `.sisyphus/plans/phase5-decision-log.md` — user decisions K-001..K-016 (authoritative).
2. `.sisyphus/plans/phase5-implementation.md` — technical implementation plan.

## Files to audit (working-tree state)
- `backend/db_schema.py` — Phase 5 section: ADD COLUMN auto_pricing_enabled BOOLEAN NOT NULL DEFAULT TRUE + seed 6 non-scope upstreams FALSE (ON CONFLICT DO NOTHING, insert-only, never reverts manual toggles).
- `backend/app.py` — `_load_pricing_merged` (L1769) exposes auto_pricing_enabled per global; `PUT /api/auto-pricing/scope` (L2743) upsert pricing_config_upstream.auto_pricing_enabled with guard (admin, Idempotency-Key, audit entity pricing_config_upstream, action scope-update), validates upstream against cached catalog slugs (400 unknown upstream), calls _sync_ap_config_file; `_sync_ap_config_file` (L2786) writes key "upstreams" = enabled list atomically.
- `scripts/auto_pricing.py` — load_config 3-tuple (configs, globals_map, upstreams); _load_config_db returns (out, globals_map, None-if-zero-rows | set-of-enabled); None -> fallback DEFAULT_UPSTREAMS (5), set() -> respected even empty (fail-closed, disable-all honored); run_cycle scope = set(upstreams) filtered by catalog.
- `frontend/src/pages/AutoPricing.jsx` — scope toggle per upstream in "Trigger global & scope per provider" panel (L206-227), checked = cfg.auto_pricing_enabled !== false, onChange PUT /api/auto-pricing/scope. NOTE: panel renders ONLY upstreams present in globalsData.globals which comes from orderbook-derived globals_cfg (USER DECISION 2026-08-21: toggle intentionally bound to orderbook).
- Tests: `backend/tests/test_pricing_global_orderbook.py` (scope guard/entity/validation/merged-exposure), `scripts/tests/test_self_undercut.py` (load_config None/set()/from-rows), `frontend/src/components/PricingMutations.test.jsx` (toggleScope PUT).

## Verify (checklist — report PASS/FAIL each with evidence)
1. K-002/K-016: DEFAULT_UPSTREAMS == exactly {"codebuddy","cline-pass","codebuddy-cn","commandcode","opencode-go"} and seed list == the 6 non-scope (claude-code, codex, qwencloud-alibaba, siliconflow, xiaomi-mimo, z-ai).
2. K-011/K-013: _sync_ap_config_file writes "upstreams" key; load_config fallback chain DB -> file -> default 5; all callers of load_config use 3-tuple (grep).
3. K-014: dashboard toggle wired (PUT scope, reload globals).
4. K-016 fail-closed: disable-all honored (empty set scope), fresh-install fallback works (None).
5. Endpoint guards: admin role, Idempotency-Key, audit entity/action, validation (upstream required, enabled strict bool, unknown upstream 400 when catalog cached).
6. Run-away risks: does seed ever revert manual toggles? (must be no)
7. Tests: do the new tests actually assert the behaviors above? Any test that encodes WRONG behavior?
8. Docs consistency: README.md, docs/auto-pricing.md, docs/PRODUCTION-LOCK.md — any statement contradicting implemented behavior (e.g. lock references bundle index-D0HqFdo3.js from PR #30 baseline 761b744; scope default 5; toggle in Auto Pricing)?

## Output format
Bottom line: PASS or FAIL with confidence (HIGH/MEDIUM/LOW).
Then findings numbered, each with: severity (CRITICAL/MAJOR/MINOR/NITPICK), file:line, description, why it matters, suggested fix.
Then blocking_issues: list only CRITICAL and MAJOR ids (empty if none).
Keep the whole report under 700 words. Be precise — cite exact file:line for every claim.
