<!-- Release housekeeping record. Source: push/manual CI race audit, 2026-06-13. -->
# cycle-2026-06-13-ci-release-signal-housekeeping

Status: release-housekeeping checklist for the current `master` candidate.

Worktree:
`C:\Users\Mattm\X\games-3d\terror-in-the-jungle-fable-debug-proofs`.

## Goal Statement

Stabilize the release housekeeping and CI signal so `master` no longer shows
misleading cancelled push checks after a valid release. Audit the CI/deploy
workflow concurrency behavior, update the release wrapper and docs to avoid
duplicate push/manual CI races, implement the least risky fix with test/script
proof, then push to `master`, prove exact-HEAD CI is clean, deploy if required,
and pass `npm run check:live-release`.

## Root Cause

The failed signal was not a code-test failure. Push CI run `27482757183` and
manual CI run `27482761814` targeted the same commit
`441c2ff01d8b9aebdb943eaa1d8cb8e0211d12b1`. The manual run started while the
push run was still queued/running. `ci.yml` used one concurrency group for both:

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

That let the manual exact-HEAD proof cancel the push checks GitHub displays for
`master`, even though the follow-up manual run succeeded.

## Release Fix

- Scope CI concurrency by event and ref:
  `ci-${{ github.event_name }}-${{ github.ref }}`.
- Keep stale-run cancellation for repeated pushes and repeated manual runs.
- Teach `scripts/github-workflow-run.ts` to reuse exact-HEAD `ci.yml` runs
  before dispatching a manual duplicate:
  - active same-head run: watch it;
  - latest same-head success: accept it;
  - latest same-head terminal non-success: fail instead of masking it;
  - no same-head run after the wait window: dispatch manual CI.
- Keep `deploy.yml` behavior unchanged.

## No Gameplay Scope

This is housekeeping only. Do not change gameplay code, vegetation assets,
weapon pose, vehicle tuning, water, terrain, sky, renderer behavior, or Fable
reference decisions in this cycle.

## Validation Plan

- Focused unit proof:
  `npx vitest run scripts/github-workflow-run-utils.test.ts`
- Normal repo gate:
  `npm run validate:fast`
- Release proof after push:
  `npm run ci:manual` must reuse/watch exact-HEAD CI instead of starting a
  duplicate when push CI exists.
- GitHub Actions proof:
  latest `master` commit has no cancelled/failed CI run for the final head.
- Production proof:
  `npm run deploy:prod`, then `npm run check:live-release`.

## Acceptance Criteria

- `ci.yml` cannot let manual proof cancel push CI.
- `npm run ci:manual` prefers same-head CI reuse over duplicate dispatch.
- Docs describe the corrected release path.
- Local validation passes for the final tree.
- Final `master` head has clean CI signal.
- Production deploy and `check:live-release` pass for final head.
