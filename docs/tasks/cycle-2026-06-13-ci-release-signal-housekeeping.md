<!-- Release housekeeping record. Source: push/manual CI race audit, 2026-06-13. -->
# cycle-2026-06-13-ci-release-signal-housekeeping

Status: release-housekeeping proof record. Re-run only if the CI/release signal
regresses.

Worktree:
`C:\Users\Mattm\X\games-3d\terror-in-the-jungle-fable-debug-proofs`.

## Goal Statement

Stabilize the repo housekeeping and CI release signal so `master` no longer
shows misleading cancelled push checks after a valid release. Audit the
CI/deploy workflow concurrency behavior, update the release wrapper and docs to
avoid duplicate push/manual CI races, implement the least risky fix with
test/script proof, then push to `master`, prove exact-HEAD CI is clean, deploy
production, and pass `npm run check:live-release`.

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
- Add a root `esbuild@0.28.1` npm override so the separate Dependabot
  security-update run for `esbuild` stops failing on the repo's sibling
  `file:../game-field-kits` dependencies. The remaining `npm audit` findings
  after the override are moderate transitive issues under
  `wrangler`/`miniflare`/`ws`/`brace-expansion`, not the failed dynamic
  `esbuild` update.

## No Gameplay Scope

This is housekeeping only. Do not change gameplay code, vegetation assets,
weapon pose, vehicle tuning, water, terrain, sky, renderer behavior, or Fable
reference decisions in this cycle.

## Validation Plan

- Focused unit proof:
  `npx vitest run scripts/github-workflow-run-utils.test.ts`
- Dependency proof:
  `npm ls esbuild` must resolve `esbuild@0.28.1` through the override.
- Normal repo gate:
  `npm run validate:fast`
- Release proof after push:
  `npm run ci:manual` must reuse/watch exact-HEAD CI instead of starting a
  duplicate when push CI exists.
- GitHub Actions proof:
  latest `master` commit has no cancelled/failed CI run for the final head.
- Production proof:
  `npm run deploy:prod`, then `npm run check:live-release`.

## Current Proof

- Latest CI-fix head:
  `68798b85d137c4fa50ae7f0de3f30f4113648af3`.
- Push CI: PASS,
  `https://github.com/matthew-kissinger/terror-in-the-jungle/actions/runs/27483500090`.
- Deploy: PASS,
  `https://github.com/matthew-kissinger/terror-in-the-jungle/actions/runs/27483575632`.
- Live release proof: PASS,
  `artifacts/perf/2026-06-14T00-41-05-810Z/projekt-143-live-release-proof/release-proof.json`.

## Acceptance Criteria

- `ci.yml` cannot let manual proof cancel push CI.
- `npm run ci:manual` prefers same-head CI reuse over duplicate dispatch.
- Docs describe the corrected release path.
- Local validation passes for the final tree.
- Final `master` head has clean CI signal.
- Production deploy and `check:live-release` pass for final head.
