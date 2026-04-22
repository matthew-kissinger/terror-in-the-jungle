# world-overlay-debugger-ci-fix: rebase PR #145 and fix the terrainChunkOverlay CI-only test failure

**Slug:** `world-overlay-debugger-ci-fix`
**Cycle:** `cycle-2026-04-23-debug-cleanup`
**Round:** 1
**Priority:** P1 — unblocks the six world-overlay visualizations (navmesh, LOS rays, squad influence, LOD tier, aircraft contact, terrain chunks) that already passed review and local tests in the prior cycle but were blocked on a CI-only failure.
**Playtest required:** NO.
**Estimated risk:** medium — CI-only test failures are the ones most likely to require deeper investigation. Scoped hard stop at ≤50 LOC keeps the cycle from sliding.
**Budget:** ≤50 LOC of test/accessor delta on top of the existing PR #145 branch (+ whatever rebase requires).
**Files touched:**

- Rebase: `task/world-overlay-debugger` on current `master` (post-cycle-2026-04-23 close commit `36a9334` or newer).
- Modify (primary target): `src/ui/debug/worldOverlays/terrainChunkOverlay.test.ts` — the test that failed in CI.
- Possibly modify: `src/systems/terrain/TerrainRenderRuntime.ts` — the `getActiveTilesForDebug()` accessor added by PR #145. Only if the root cause is an accessor contract mismatch, not a test-stub mismatch.
- Do NOT modify the six overlay files, the registry, or the control panel unless the fix genuinely requires it. Those landed clean; don't rewrite them.

## Required reading first

- The failing PR: [PR #145](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/145) — full diff. Executor's self-report: 3710 tests green locally, CI failure in `terrainChunkOverlay.test.ts`.
- The CI log: https://github.com/matthew-kissinger/terror-in-the-jungle/actions/runs/24793219742/job/72556059656 — full failure output. The extracted assertion was `expected +0 to be 24` at `terrainChunkOverlay > renders four line segments per active CDLOD tile`.
- `src/systems/terrain/TerrainRenderRuntime.ts` — the accessor added in PR #145 (+14 LOC). Grep for `getActiveTilesForDebug` to find it.
- `src/systems/terrain/TerrainSystem.ts` — the +5 LOC pass-through accessor.
- `src/ui/debug/worldOverlays/terrainChunkOverlay.ts` — consumer of the accessor; renders 4 line segments per active tile.

## Diagnosis (hypothesis, verify before acting)

The test expected `24` line segments (4 per tile × 6 active tiles the mock was seeded with) but got `0`. Local passed, CI failed. Candidate root causes, ordered by likelihood:

1. **Mock/stub initialization race in CI.** The test stubs `TerrainRenderRuntime` to return 6 tiles, but in CI's test runner ordering the overlay's `mount()` is called before the stub is populated — so the overlay renders 0 segments. Local order may be lucky. Fix: make the stub synchronous or call `update()` after mount with the stubbed iterable already present.
2. **Missing explicit mock for `getActiveTilesForDebug()`.** The accessor is new; local tests may pick up the real `TerrainRenderRuntime` via a re-export chain and its fallback returns something non-empty, while CI's stricter module-resolution returns `undefined` or empty. Fix: explicitly mock the accessor in the test's `beforeEach`.
3. **Iterable vs array shape mismatch.** If the accessor returns `IterableIterator<Tile>` and the overlay consumes it via `[...tiles]`, a second iteration (if any) yields empty. Fix: return an array, or make the overlay consume via a single iteration.
4. **Timing / frame-tick dependency.** The overlay may update on `update(dt)` rather than `mount()`; the test may not tick. Fix: invoke `overlay.update(16)` explicitly in the test.

The fix is likely < 10 LOC in the test file. Do NOT preemptively rewrite the accessor — first confirm the mock path with a local `npm ci --prefer-offline && npm run test:run -- --reporter=verbose src/ui/debug/worldOverlays/terrainChunkOverlay.test.ts` to reproduce. If local can't reproduce, run the test in isolation (`vitest run --no-file-parallelism src/ui/debug/worldOverlays/terrainChunkOverlay.test.ts`) — that often surfaces CI-only ordering bugs.

## Steps

1. Read "Required reading first."
2. Check out the existing branch: `git fetch origin && git checkout task/world-overlay-debugger` (or recreate from `origin/task/world-overlay-debugger`).
3. Rebase on current master: `git rebase origin/master`. Resolve any conflicts cleanly (shouldn't be many — master since the PR's last push has only the docs close commit).
4. Reproduce the failure locally using one of the isolation strategies in "Diagnosis" above.
5. Apply the smallest fix that makes the test pass both in isolation and in the full suite.
6. `npm run lint`, `npm run test:run`, `npm run build` — full suite green.
7. Force-push: `git push --force-with-lease origin task/world-overlay-debugger`.
8. Watch CI; if test still red, STOP and file a report describing the specific failure and what you tried. Do NOT force-push a second guess.

## Exit criteria

- PR #145 CI all green (lint, test, build, perf, smoke, mobile-ui).
- Rebase clean; diff-vs-master shows only the overlay registry + 6 overlays + the 4 narrow accessors (≤20 LOC each) + the CI-fix delta.
- Merged via `gh pr merge 145 --rebase`.
- No change in functionality — this is a CI-fix, not a feature rework.

## Non-goals

- Do not rewrite the 6 overlay files.
- Do not add new overlays.
- Do not widen any of the 4 additive accessors beyond their current ≤20 LOC budget.
- Do not change the `Shift+\` master toggle or the N/L/I/T/C/X individual hotkeys.

## Hard stops

- Fence change → STOP.
- Fix requires >50 LOC in aggregate (test + accessor) → STOP, file a finding, leave PR #145 open for a future dedicated cycle. The two-task cycle degrades to one task (preserve-drawing-buffer-dev-gate) with no cycle-level failure.
- Rebase produces semantic conflicts beyond line-level (e.g., the world-overlay registry now has to negotiate with a newer DebugHudRegistry shape) → STOP, file a finding, escalate.
- Second CI run still red after the fix push → STOP, do NOT iterate. File a report describing the specific failure mode. A second guess risks masking the real issue.

## Report back

```
task_id: world-overlay-debugger-ci-fix
branch: task/world-overlay-debugger  (rebased + ci-fix commit)
pr_url: https://github.com/matthew-kissinger/terror-in-the-jungle/pull/145
rebase_result: CLEAN | RESOLVED_MANUALLY
ci_fix_root_cause: <one-line diagnosis>
ci_fix_delta_loc: <N lines>
verification:
  - npm run lint: PASS
  - npm run test:run: PASS (X tests, Y ms)
  - npm run build: PASS
  - CI rerun: all checks PASS
playtest_required: no
surprises: <one line or "none">
fence_change: no
```

## Pairs with

- `preserve-drawing-buffer-dev-gate` (same cycle; both disjoint single-file tweaks; parallel-safe).
