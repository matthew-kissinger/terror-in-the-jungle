# Cycle: KONVEYER-11 Cover Spatial Grid (Compute)

Last verified: 2026-05-16

## Status

Queued at position #3 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
Closes `DEFEKT-3` (combat AI p99 from synchronous cover-search in
`AIStateEngage.initiateSquadSuppression`). Also benefits cycle #2
mobile-fix (drops the `Combat.AI` 46.86 ms steady-state bucket).

## Skip-confirm: yes

Campaign auto-advance is `yes`. Orchestrator dispatches R1 without
waiting.

## Concurrency cap: 3

R1 lands the CPU 8 m uniform grid first; R2 adds the compute follow-on.

## Objective

Replace the synchronous cover-search in
`AIStateEngage.initiateSquadSuppression()` with a spatial-grid query
so squad-suppression flips no longer block the AI tick.

The R1 ships a CPU 8 m uniform grid (Phase F R2 plan). The R2 wires
the WebGPU compute follow-on if the CPU shape proves the data flow.
The CPU-first staging is deliberate: it lets the compute version
adopt a known-correct contract without re-deriving the semantics.

Source memo:
[docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md](../rearch/POST_KONVEYER_MIGRATION_2026-05-13.md)
§"Cover spatial-grid".

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. [docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md](../rearch/POST_KONVEYER_MIGRATION_2026-05-13.md)
   — milestone memo's Phase F R2 section.
2. `src/systems/combat/ai/AIStateEngage.ts` — `initiateSquadSuppression`
   site.
3. `src/systems/combat/ai/CoverQueryService.ts` (if it exists) or
   the equivalent cover-search surface called from `AIStateEngage`.
4. `src/systems/combat/CombatantSystem.ts:284-326` — combat AI
   instrumentation; the 46.9 ms avg-EMA + 954 ms peak bucket from
   the mobile-startup memo.
5. [.claude/skills/webgpu-threejs-tsl/docs/compute-shaders.md](../../.claude/skills/webgpu-threejs-tsl/docs/compute-shaders.md)
   — TSL compute reference for R2.
6. [docs/CARRY_OVERS.md](../CARRY_OVERS.md) — DEFEKT-3 active row,
   opened cycle-2026-04-17, 8 cycles open, blocking Phase F.

## Critical Process Notes

1. **Cover-query latency must not regress past current.** The current
   bucket peaks at 954 ms; the floor is "any concrete improvement
   over the synchronous baseline." The grid pays its build cost up
   front so queries are O(1) average.
2. **Determinism must hold.** The cover-grid index lookup must
   produce the same target ordering as the synchronous scan given
   identical inputs (or differences must be explicitly documented
   as randomization-acceptable per `docs/TESTING.md`).
3. **No fenced-interface touches.** The cover-query consumer
   surface stays as it is; the grid is internal.
4. **`combat-reviewer` is the pre-merge gate.** All tasks touch
   `src/systems/combat/**`.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `cover-spatial-grid-cpu`, `engage-state-grid-consumer`, `cover-grid-behavior-tests` | 3 | CPU grid foundation + consumer wiring + tests. |
| 2 | `cover-spatial-grid-compute-proof` | 1 | Compute follow-on; runs ONLY if R1 ships clean wins. Otherwise skipped. |

## Task Scope

### cover-spatial-grid-cpu (R1)

Build the CPU 8 m uniform grid that indexes cover candidates by
chunk-aligned cell.

**Files touched:**
- New: `src/systems/combat/ai/CoverSpatialGrid.ts` (≤500 LOC).
- New: `src/systems/combat/ai/CoverSpatialGrid.test.ts` (behavior
  tests).

**Method:**
1. Author `CoverSpatialGrid` with `insert(coverId, position)`,
   `remove(coverId)`, `queryNearest(position, radius)`,
   `queryWithLOS(position, target, terrainRuntime)`.
2. 8 m cell size (matches the existing world-chunk grid for cache
   locality).
3. Rebuild semantics: incremental updates only; the grid is
   constructed once at scene-load and updated only when cover
   geometry changes.
4. Behavior tests cover: insertion, removal, range query, LOS-gated
   query, edge cases (out-of-bounds, empty grid).
5. Commit message: `feat(combat): CPU 8m uniform cover spatial grid (cover-spatial-grid-cpu)`.

**Acceptance:**
- Tests + build green.
- `combat-reviewer` APPROVE.
- New tests cover the public API.

**Reviewer gate: `combat-reviewer` required pre-merge.**

### engage-state-grid-consumer (R1)

Wire `AIStateEngage.initiateSquadSuppression` to use the spatial
grid instead of the synchronous scan.

**Files touched:**
- `src/systems/combat/ai/AIStateEngage.ts`.
- Possibly `src/systems/combat/CoverQueryService.ts` (if it exists)
  to delegate to the grid.

**Method:**
1. Replace the synchronous cover-search loop with
   `CoverSpatialGrid.queryWithLOS(...)`.
2. Keep the existing scoring function (visibility, distance,
   line-of-sight) — only the candidate-set generation changes.
3. Capture a `combat120` perf trace before + after. The
   `Combat.AI` avg-EMA should drop substantially; the peak should
   move from ~954 ms to single-digit ms.
4. Commit message: `perf(combat): use cover spatial grid in squad suppression (engage-state-grid-consumer)`.

**Acceptance:**
- Tests + build green.
- `combat-reviewer` APPROVE.
- `combat120` `Combat.AI` avg-EMA drops by ≥3x; peak drops by
  ≥10x.
- No determinism regression (squad-target ordering matches prior
  output for the same seeded scenario).

**Reviewer gate: `combat-reviewer` required pre-merge.**

### cover-grid-behavior-tests (R1)

Integration test: full squad-suppression flow through the new grid,
under a representative scenario.

**Files touched:**
- New: `src/integration/combat/cover-grid-suppression.test.ts`
  (L3 small-scenario test per `docs/TESTING.md`).

**Method:**
1. Spawn 12 NPCs in a known configuration. Trigger squad
   suppression. Assert cover targets selected match expected set.
2. Assert per-tick `Combat.AI` cost via `FrameTimingTracker` stays
   under a budget (set the budget at the post-fix expected value
   from `engage-state-grid-consumer` PR).
3. Commit message: `test(combat): cover-grid squad-suppression L3 scenario (cover-grid-behavior-tests)`.

**Acceptance:**
- Test + build green.
- `combat-reviewer` APPROVE.
- Test catches the regression if either `cover-spatial-grid-cpu` or
  `engage-state-grid-consumer` is reverted.

**Reviewer gate: `combat-reviewer` required pre-merge.**

### cover-spatial-grid-compute-proof (R2, conditional)

Wire a WebGPU compute version of the same grid query. Strict-WebGPU
path only; WebGL2-fallback continues using the CPU grid.

**Files touched:**
- New: `src/systems/combat/ai/CoverSpatialGridCompute.ts`.
- New: `src/systems/combat/ai/CoverSpatialGridCompute.test.ts`.
- `src/systems/combat/ai/AIStateEngage.ts` — route choice via
  `renderer.isWebGPUBackend` check.

**Method:**
1. Read `.claude/skills/webgpu-threejs-tsl/docs/compute-shaders.md`
   on TSL `Fn` / compute dispatch shape.
2. Author the compute version with the same `queryWithLOS(...)`
   semantics. Inputs: cover-position storage buffer + query origin
   uniform. Outputs: candidate-index storage buffer.
3. Behavior tests assert the compute version produces the same
   candidate ordering as the CPU version for a fixed seeded
   scenario.
4. Route choice in `AIStateEngage`: use compute on strict-WebGPU,
   fall back to CPU on WebGL2-fallback path (mobile).
5. Commit message: `perf(combat): WebGPU compute cover-grid (cover-spatial-grid-compute-proof)`.

**Acceptance:**
- Tests + build green.
- `combat-reviewer` APPROVE.
- Compute parity test passes (same ordering as CPU).
- Strict-WebGPU desktop `Combat.AI` bucket drops further (target:
  another ≥30% vs R1 CPU baseline).
- WebGL2-fallback path unchanged (mobile keeps the CPU grid; no
  regression).

**Skip condition:** if R1 `Combat.AI` improvements are already
within campaign hard-stop perf bounds and the owner judges R2 not
worth the surface area, skip R2 and close the cycle on R1 only.
The orchestrator marks R2 task `skipped` with cause in the cycle
close.

**Reviewer gate: `combat-reviewer` required pre-merge.**

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- Cover-query latency regresses past current synchronous-scan
  baseline (peak > 954 ms) → halt.
- Determinism regression: squad-target ordering changes
  unexpectedly → halt. (Documented intentional randomization is
  acceptable; unexplained drift is not.)
- `combat-reviewer` CHANGES-REQUESTED twice on same task → halt.

## Reviewer Policy

- `combat-reviewer` is a pre-merge gate for all tasks (all touch
  `src/systems/combat/**`).

## Acceptance Criteria (cycle close)

- All R1 task PRs merged.
- R2 PR merged OR explicitly skipped with cause.
- `combat120` `Combat.AI` avg-EMA: ≥3x drop.
- `combat120` `Combat.AI` peak: ≥10x drop (from ~954 ms baseline).
- Mobile-emulation steady-state `Combat.AI` bucket from cycle #2
  baseline drops proportionally.
- No fence change, no perf regression > 5% p99 on `combat120`.
- `DEFEKT-3` row in `docs/CARRY_OVERS.md` moves from Active to
  Closed with this cycle's close-commit SHA.

## Out of Scope

- Cover-asset placement changes (existing cover positions stay).
- Squad-AI logic changes beyond cover-query consumer wiring.
- Touching `src/systems/terrain/**` or `src/systems/navigation/**`.
- Fenced-interface touches.

## Carry-over impact

| Action | When | Active count |
|--------|------|--------------:|
| Close DEFEKT-3 | cycle close | 9 → 8 |

Net cycle delta: −1.
