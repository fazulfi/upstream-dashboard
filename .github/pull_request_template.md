## Summary
<!-- What does this PR do and why? One or two sentences. -->

## Motivation
<!-- Link to issue(s), or describe the problem solved. -->

## Changes
<!-- Bullet list of what changed. -->

## Test plan
<!-- How did you verify? Commands run + results. -->
- [ ] `python -B -m unittest scripts.tests.test_self_undercut -v`
- [ ] `cd backend && python -B -m pytest tests -q -p no:warnings`
- [ ] `cd frontend && npm test -- --run`
- [ ] `cd frontend && npm run build`

## Deployment notes
<!-- Manual deploy steps (this repo has CI without CD). Vercel frontend + VPS backend/daemon. -->

## Checklist
- [ ] `git diff --check` clean
- [ ] Secret scan clean (no tokens/passwords/keys)
- [ ] No `as any` / `@ts-ignore` / `@ts-expect-error`
- [ ] No test files deleted to make suite pass
- [ ] Docs updated (README / PRODUCTION-LOCK / OPS-RUNBOOK / ARCHITECTURE / DATA-MODEL) if behavior changed
- [ ] CI green (backend + frontend) before merge
