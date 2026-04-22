# heap-recovery-combat120-triage: root-cause the combat120 heap regression from cycle-2026-04-22-flight-rebuild-overnight

**Slug:** `heap-recovery-combat120-triage`
**Cycle:** `cycle-2026-04-22-heap-and-polish`
**Round:** 1
**Priority:** P0 — single most important unknown left in the tree after the prior cycle.
**Playtest required:** NO (probe/perf-verified).
**Estimated risk:** low — investigative. If a code fix lands, it must be narrow.
**Budget:** ≤400 LOC IF a targeted fix lands; no LOC cap on the memo.
**Files touched:**

- Create: `docs/rearch/HEAP_RECOVERY_COMBAT120_TRIAGE.md` (always).
- Optionally modify: whichever single subsystem the investigation fingers, IF the root cause is clear and the fix is small (e.g., a missing clear on a Set/Map, a leak in an event listener chain, a BVH or navmesh retained longer than needed). If the root cause is architectural, STOP with a memo only — do not carry a speculative fix past the cycle budget.

## Required reading first

- `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/perf-after-round3.json` — the post-cycle perf summary (this is the regression).
- `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/perf-after-round3-validation.json` — `overall: fail` driven by `heap_recovery_ratio`.
- `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/baseline/perf-baseline-combat120.json` — the Round-0 (pre-cycle) baseline.
- `perf-baselines.json` — repo-level baselines (`combat120` heap thresholds at `heapGrowthMb.pass = 22.88` / `warn = 42.88`; we are now at 53).
- The thirteen PRs merged in the prior cycle. Only a few are load-bearing for heap:
  - PR #122 `aircraft-building-collision` — `LOSAccelerator` gained `registerStaticObstacle` that adds entries to `chunkCache: Map`. Those entries carry `MeshBVH` instances. Per airfield this is ≤ ~20 buildings. Unclear whether entries are cleared between mode rebuilds.
  - PR #125 `airframe-ground-rolling-model` — new per-tick allocations inside `integrateGround`?
  - PR #128 `airframe-climb-rate-pitch-damper` — small addition to `integrateAir`; unlikely to leak.
  - PR #130 `airfield-prop-footprint-sampling` — perimeter structures now route through `resolveTerrainPlacement` (the 9-point footprint solver). This runs once per feature at spawn time, not per frame. But allocations inside the solver are hot when the airfield stamps multiple perimeter props.
  - PR #132 `airfield-envelope-ramp-softening` — changes envelope geometry. Nothing runtime-retained.
  - PR #133 `airfield-taxiway-widening` — same.
- Navmesh regen commit `614dc76` regenerated OF heightmaps (256KB × 5) and navmesh `.bin` files (110-150KB × 5). These are static assets loaded on mode boot; unchanged file count vs before the cycle.

## Diagnosis hypotheses (ranked)

1. **`LOSAccelerator.chunkCache` is not cleared on mode restart.** PR #122 added `registerStaticObstacle`. If the map is repopulated on every mode boot without clearing the previous boot's entries, the BVHs accumulate across restarts. `perf:capture:combat120` boots the mode once, so a single-boot run would not expose this — but its heap at steady state would be ~20 building BVHs permanently resident. At ~100KB per BVH that is only ~2MB. NOT the dominant explanation.
2. **NPC stall backtracking allocations.** The perf-after log showed frequent `[combat] NPC combatant_X stalled on terrain, backtracking to last good progress point` warnings and `AI budget exceeded` (4.07 starvations/sample vs 0 at baseline). Each backtrack may allocate a fresh path array. With 120 NPCs churning, this compounds. If the regenerated navmesh (`614dc76`) produced harder-to-solve regions near the new wider airfield shoulders, stall rate increased, driving steady allocation churn. **Most likely.**
3. **`AI budget starvation` triggers a retry or queue-backlog allocation.** Degraded updates may queue deferred work.
4. **Interpolated-pose change in PR #124 retains a snapshot object.** Less likely — the fix was a reference swap, not a new field.
5. **A worktree/tooling artifact.** If `npm run perf:capture:combat120` behaves differently on a session that has been orchestrating for hours, memory pressure may differ from a cold session. Executor should re-run a fresh baseline in a clean process to rule this out.

## Steps

1. Read all of "Required reading first."
2. **Reproduce the regression in a fresh shell.** Run `npm run perf:capture:combat120` from a clean process. If heap numbers are now normal (e.g., growth ≤ 25MB, recovery ≥ 0.5), the original capture was session-contaminated; document and STOP with a short memo attributing to tooling, no code fix needed.
3. If the regression reproduces, reproduce on the **pre-cycle commit** by checking out `88e3d35` (the cycle seed, before any Round 1 PR landed). Re-run perf capture. Confirm the pre-cycle heap was ≤ baseline.
4. Bisect through the 13 cycle PRs to find the first one that introduces the regression. Use git rebase-to-parents or direct checkouts:
   - `88e3d35` (pre-cycle) → run → record.
   - Halfway through the chain (e.g., after PR #126 at `b105eef`) → run → record.
   - Narrow to one PR.
5. Once the bisect fingers a single PR, read that PR's diff carefully and form a hypothesis. Test the hypothesis with a minimal edit:
   - If the hypothesis is a missing `.clear()` or a missing `unregisterStaticObstacle` call, land the fix.
   - If the hypothesis is architectural (e.g., "the whole navmesh is reloaded every tick now"), STOP and write a memo.
6. Deliverable (ALWAYS):
   - `docs/rearch/HEAP_RECOVERY_COMBAT120_TRIAGE.md` with: bisect table, suspected cause, supporting evidence (heap numbers per commit), recommended fix (or fix-landed note), and an estimated blast radius for any future fix cycle.
7. Deliverable (CONDITIONAL, if fix is small + high-confidence):
   - The fix, with a Vitest regression that would fail before the fix and pass after. Heap regressions are notoriously hard to write unit tests for; a plausible alternative is an assertion on the specific invariant (e.g., `expect(losAccelerator.chunkCache.size).toBeLessThanOrEqual(EXPECTED_MAX_AFTER_TEARDOWN)` after a synthetic mode rebuild).
8. Probe: final run of `npm run perf:capture:combat120`. If fix landed, heap_growth_mb should drop and heap_recovery_ratio should climb. Commit summary.json to `docs/cycles/cycle-2026-04-22-heap-and-polish/evidence/heap-recovery-combat120-triage/`.

## Exit criteria

Memo-only path:
- `docs/rearch/HEAP_RECOVERY_COMBAT120_TRIAGE.md` exists with: bisect table, identified suspect PR, root-cause hypothesis with supporting numbers, recommended next action.
- At least one post-cycle perf capture committed as evidence.
- `npm run lint`, `npm run test:run`, `npm run build` green (no code changes).

Fix-landed path (in addition to the above):
- The targeted fix lands.
- Regression test asserting the invariant.
- Fresh `npm run perf:capture:combat120` shows `heap_recovery_ratio` ≥ 0.5 (target: baseline 0.88).
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not re-tune any combat AI thresholds (budget, stall backtracking, AICoverFinding). If the investigation suggests tuning here, record it in the memo for a future combat cycle.
- Do not modify the regenerated navmesh / heightmap assets.
- Do not touch the perf-capture harness itself.

## Hard stops

- Bisect is inconclusive across three candidate PRs and time has run out → STOP with a memo, flag the three candidates as tied.
- Fence change → STOP.
- Fix requires cross-cutting refactor (>400 LOC) → STOP; write the memo, do not land the fix.

## Pairs with

None. Round 2 tasks do NOT block on this one; memo is sufficient to unblock them.
