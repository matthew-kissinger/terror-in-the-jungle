# ci-gate-consolidation

`check:fence`, `lint:budget`, `lint:docs`, and `knip` are local-only today, so
the fence/budget/dead-code rules the orchestration framework depends on are
unenforced on PRs — Phases 2-5 of this campaign do large mechanical work that
must not be able to violate them silently. CI also references the removed
`perf-baselines.json` and skips `index.html` changes in the PR paths filter.
(Campaign: `docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 1.)

## Files touched

- `.github/workflows/ci.yml`
- `.github/workflows/artifact-prune.yml`
- `package.json` (only if a script alias is needed for CI)

## Scope

1. Add `lint:budget`, `check:fence`, `lint:docs`, and `knip` as blocking CI
   jobs/steps. Each gate must be GREEN on current master before it blocks: if
   `lint:docs` or `knip` has pre-existing failures, fix them in-scope or gate
   a documented passing subset — do not merge a red gate, do not silently
   skip one.
2. Remove dead `perf-baselines.json` references (ci.yml:286 area,
   artifact-prune.yml) and state the perf gating story explicitly in a comment
   (raw-metrics non-gating until STABILIZAT-1 re-establishes a baseline).
3. Add `index.html` to the PR paths filter so index changes run CI.

## Non-goals

- Re-establishing perf baselines or making perf:compare gating (STABILIZAT-1).
- Fixing the full repo-wide broken-doc-ref backlog (DEFEKT-2 owns that; only
  whatever the chosen `lint:docs` gate needs to be green).
- Touching the deploy workflow (deploy stays manual).

## Acceptance

- [ ] A PR touching a fenced interface without `[interface-change]`, or
      growing a grandfathered file, would fail CI (verify gates run + are
      `required`-equivalent blocking, not advisory).
- [ ] No `perf-baselines.json` reference remains in `.github/workflows/`.
- [ ] CI green on this PR itself with all four gates active.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Dependencies

- Depends on: `budget-ratchet` (lint:budget must pass before it can block).
