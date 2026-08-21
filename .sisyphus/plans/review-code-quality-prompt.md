CODE QUALITY REVIEW for Phase 5 auto-pricing scope change.

Read these files in repo root C:/Users/faizz/upstream-dashboard:
- backend/app.py: PUT /api/auto-pricing/scope endpoint (near line 2743), _sync_ap_config_file, _load_pricing_merged
- backend/db_schema.py: Phase 5 section (lines 365-380)
- scripts/auto_pricing.py: DEFAULT_UPSTREAMS (line 46), _load_config_db (145-171), load_config (174-200), run_cycle scope (925-930)
- frontend/src/pages/AutoPricing.jsx: toggleScope handler and the scope panel
- backend/tests/test_pricing_global_orderbook.py: the 3 new tests
- frontend/src/components/PricingMutations.test.jsx: the toggle test
- scripts/tests/test_self_undercut.py: the 2 new load_config tests

Evaluate these dimensions:
1. Correctness: does the 3-tuple unpacking work in all callers? Any missed caller that still unpacks 2 values?
2. Pattern consistency: does the scope endpoint follow the same structure as PUT /api/auto-pricing/config and PUT /api/pricing/global (guard_mutation, Idempotency-Key, _sync_ap_config_file)?
3. Naming and readability of toggleScope, DEFAULT_UPSTREAMS, auto_pricing_enabled.
4. Error handling: validation of upstream and enabled; MutationGuardError path.
5. Performance: does the daemon run extra DB queries per cycle? Acceptable?
6. Testing quality: are the new tests meaningful? Do they cover the guard action, boolean validation, merged exposure, daemon fallback?
7. Edge cases: empty scope set, unknown upstream, toggle race, concurrent cycles.

Output format:
verdict PASS or FAIL
confidence HIGH MEDIUM LOW
summary (1-3 sentences)
findings list with severity CRITICAL MAJOR MINOR NITPICK, each with file and line and suggestion
blocking_issues (CRITICAL and MAJOR only, or empty if PASS)
