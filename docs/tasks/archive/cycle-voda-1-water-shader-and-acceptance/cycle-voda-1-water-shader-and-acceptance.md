# Cycle: VODA-1 Water Shader + Visual Acceptance

Last verified: 2026-05-16

## Status

Queued at position #5 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
Closes `VODA-1`. Blocks `cycle-voda-2-buoyancy-swimming-wading` (the
visual surface must be accepted before player-state consumers wire
in). Co-dispatches the `WaterSystem.ts` half of
`cycle-konveyer-large-file-splits` per the campaign manifest's hold
list.

## Skip-confirm: no

Owner playtest is the merge gate (visual acceptance is the
load-bearing acceptance bar; auto-merge on CI green is not
sufficient).

## Concurrency cap: 4

R1 ships shader + intersections; R2 ships flow visuals + owner
acceptance + the WaterSystem split.

## Objective

Ship the production water shader, terrain-water intersections, river
flow visuals, and owner acceptance. The query API
(`WaterSystem.sampleWaterInteraction`) and hydrology pipeline are
proven; what's missing is the visual layer.

Per `docs/DIRECTIVES.md` VODA-1 success criteria:
- `evidence:atmosphere` regenerates with water visible and zero
  browser errors.
- Open Frontier `terrain_water_exposure_review` overexposure flags
  resolved.

Source memo: `docs/tasks/archive/cycle-2026-05-11-konveyer-water-hydrology/cycle-2026-05-11-konveyer-water-hydrology.md`
(the predecessor scope-setting cycle) plus the audit at
`artifacts/perf/2026-05-11T21-33-05-844Z/projekt-143-water-system-audit/water-system-audit.json`.

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. [docs/DIRECTIVES.md](../DIRECTIVES.md) VODA-1 row.
2. [docs/tasks/archive/cycle-2026-05-11-konveyer-water-hydrology/cycle-2026-05-11-konveyer-water-hydrology.md](archive/cycle-2026-05-11-konveyer-water-hydrology/cycle-2026-05-11-konveyer-water-hydrology.md)
   — predecessor cycle.
3. `src/systems/environment/WaterSystem.ts` (733 LOC, grandfathered)
   — primary file; the cycle splits it.
4. `src/systems/environment/WaterSystem.test.ts` (11 tests) — the
   contract tests that must continue passing.
5. `src/systems/terrain/hydrology/HydrologyBake.ts` (653 LOC) —
   producer of the data the water system consumes.
6. `dist/data/hydrology/{a_shau_valley,open_frontier-42}-hydrology.json`
   — shipped artifacts.
7. [docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/webgl-fallback-pipeline-diff.md](../rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/webgl-fallback-pipeline-diff.md)
   item 8 — confirms the post-merge water material (no reflection
   RT) is a mobile win that the shader must not regress.
8. [.claude/skills/webgpu-threejs-tsl/SKILL.md](../../.claude/skills/webgpu-threejs-tsl/SKILL.md)
   — TSL skill (the shader may go TSL if the cost picture says so).

## Critical Process Notes

1. **Mobile floor: keep the no-RT win.** The post-KONVEYER water
   already dropped the 512×512 reflection RT (per
   `webgl-fallback-pipeline-diff.md` item 8). Any new shader work
   must preserve that win — no per-frame reflection render targets.
2. **Owner playtest is the merge gate.** Visual acceptance is
   load-bearing here. Two locations on Open Frontier and two on A
   Shau, plus underwater POV.
3. **WaterSystem.ts split lands in this cycle.** Co-dispatched as
   the third R2 task. Splits into: hydrology-bake consumer surface,
   runtime sampling cache, water-shader binding layer. Each ≤300
   LOC. The grandfather list entry in
   `scripts/lint-source-budget.ts` drops for this file at cycle
   close.
4. **No fence change.** `ISkyRuntime` interaction (sun-direction)
   stays as is.
5. **Hydrology renderer touches `src/systems/terrain/**`** — invokes
   `terrain-nav-reviewer` for those task PRs.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `water-surface-shader`, `terrain-water-intersection-mask` | 2 | Shader + intersection sit on the same surface; both write to material setup paths. |
| 2 | `hydrology-river-flow-visuals`, `water-system-file-split`, `voda-1-playtest-evidence` | 3 | Flow visuals + split + playtest. Independent. |

## Task Scope

### water-surface-shader (R1)

Ship the production water-surface shader for the global water plane
and the hydrology river meshes.

**Files touched:**
- `src/systems/environment/WaterSystem.ts` — material setup
  (currently `MeshStandardMaterial` at `:165-176`).
- Possibly new: `src/systems/environment/water/WaterShader.ts` (or
  `WaterMaterial.ts`) extracted as part of the file split (or
  defer extraction to `water-system-file-split` task).

**Method:**
1. Replace the current `MeshStandardMaterial` with a tuned material
   (either `MeshStandardMaterial` with custom `onBeforeCompile` or
   a `MeshBasicNodeMaterial` TSL graph — decide based on the cost
   picture, document the decision).
2. Visual targets:
   - Surface ripple from the existing `waternormals.jpg` texture,
     animated via the time uniform.
   - Sun-direction reflection (already wired via
     `setAtmosphereSystem`).
   - Underwater fog tint (existing `wasUnderwater` flag drives the
     overlay; the shader handles surface side).
   - Depth-faded transparency at shorelines (use vertex Y
     gradient).
3. Mobile floor: no `WebGLRenderTarget` reflection pass. The
   `?renderer=webgl` escape hatch must keep working at the existing
   perf.
4. Commit message: `feat(water): production water surface shader (water-surface-shader)`.

**Acceptance:**
- `npm run lint`, `npm run test:run`, `npm run build` all green.
- 11 existing `WaterSystem.test.ts` tests continue passing.
- Visual diff in PR description against pre-cycle Open Frontier +
  A Shau noon screenshots.
- No new perf regression.

### terrain-water-intersection-mask (R1)

Ship the terrain-water intersection mask so terrain-water boundaries
read cleanly (no z-fight, no harsh polygon edge).

**Files touched:**
- `src/systems/environment/WaterSystem.ts` (intersection mask
  binding).
- `src/systems/terrain/TerrainMaterial.ts` — wetness mask consumer
  (likely already partly wired via the existing `hydrologyMaskTexture`).

**Method:**
1. Confirm the current wetness/hydrology mask path in
   `TerrainMaterial.ts` produces the intended "wet sand" look near
   water.
2. Add the terrain-side per-fragment water-edge soft-blend (depth
   gradient toward water surface y).
3. Add the water-side per-fragment terrain-edge foam line (use the
   inverse depth gradient).
4. Commit message: `feat(water): terrain-water intersection mask + foam line (terrain-water-intersection-mask)`.

**Acceptance:**
- Tests + build green.
- `terrain-nav-reviewer` APPROVE.
- Open Frontier shoreline + A Shau river bank read cleanly in
  visual diff.

**Reviewer gate: `terrain-nav-reviewer` required pre-merge.**

### hydrology-river-flow-visuals (R2)

Add visible flow along hydrology channels (riverbed UV scroll +
flow-direction-aligned normal sampling).

**Files touched:**
- `src/systems/environment/WaterSystem.ts` — river-mesh material
  (currently `MeshStandardMaterial` with bank → shallow → deep
  color blend).
- Possibly new: `src/systems/environment/water/HydrologyRiverShader.ts`
  if split warrants.

**Method:**
1. Per hydrology channel segment, compute flow direction from
   segment start → end.
2. Sample the normal map with UV scrolled in flow direction
   (`time * flowSpeed`).
3. Add a subtle foam contribution where the channel narrows or
   passes over depth changes.
4. Commit message: `feat(water): hydrology river flow visuals (hydrology-river-flow-visuals)`.

**Acceptance:**
- Tests + build green.
- A Shau river visibly flows in dev preview.
- No perf regression (river-mesh material is a small subset of
  rendered surface).

### water-system-file-split (R2)

Split `WaterSystem.ts` (733 LOC) into the three natural pieces
per the campaign manifest's split rationale.

**Files touched:**
- `src/systems/environment/WaterSystem.ts` — slim to ~300 LOC
  orchestrator.
- New: `src/systems/environment/water/HydrologyRiverSurface.ts` —
  hydrology-bake consumer surface (channel mesh generation, query
  segment population).
- New: `src/systems/environment/water/WaterSurfaceSampler.ts` —
  runtime sampling cache (`sampleWaterInteraction` impl).
- New: `src/systems/environment/water/WaterSurfaceBinding.ts` —
  shader/material binding layer.
- New sibling tests for each.
- `scripts/lint-source-budget.ts` — drop `WaterSystem.ts` from the
  grandfather list.

**Method:**
1. Move methods following the split contract above. Public API on
   `WaterSystem` stays unchanged.
2. Existing `WaterSystem.test.ts` continues passing without test
   modifications.
3. Each new file ≤300 LOC.
4. Drop the grandfather entry; verify `lint-source-budget` passes.
5. Commit message: `refactor(water): split WaterSystem.ts into 3 modules (water-system-file-split)`.

**Acceptance:**
- Tests + build green.
- All 11 existing tests still pass without modification.
- Each new file ≤300 LOC, ≤50 public methods (per Phase 0 rule).
- Grandfather entry removed.

### voda-1-playtest-evidence (R2, merge gate)

Owner visual acceptance.

**Files touched:**
- New: `docs/playtests/cycle-voda-1-water-shader-and-acceptance.md`.

**Method:**
1. Owner walks shoreline on Open Frontier at noon, sunset, dawn.
2. Owner walks shoreline on A Shau (valley river crossing).
3. Owner stands at riverside on A Shau and confirms visible flow.
4. Owner steps underwater (POV + overlay).
5. Owner regenerates `npm run evidence:atmosphere` and confirms
   "water visible + zero browser errors."
6. Owner confirms Open Frontier
   `terrain_water_exposure_review` flag resolved.
7. Commit message: `docs(playtest): VODA-1 visual acceptance (voda-1-playtest-evidence)`.

**Acceptance:**
- All owner sign-offs recorded.
- `evidence:atmosphere` produces clean artifact (linked in PR).
- `terrain_water_exposure_review` no longer flags overexposure.

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- Any task adds a `WebGLRenderTarget` reflection pass to water →
  halt (regresses the mobile no-RT win).
- Owner playtest rejects visual twice → halt.
- `evidence:atmosphere` browser-errors-during-regeneration after
  the cycle → halt.

## Reviewer Policy

- `terrain-nav-reviewer` is a pre-merge gate for
  `terrain-water-intersection-mask` (touches `src/systems/terrain/**`).
- Orchestrator reviews other PRs for acceptance + visual evidence.

## Acceptance Criteria (cycle close)

- All R1 + R2 task PRs merged.
- Owner playtest sign-off recorded.
- `evidence:atmosphere` regenerates with water visible + zero
  browser errors.
- Open Frontier `terrain_water_exposure_review` overexposure flag
  resolved.
- A Shau river visibly flows.
- `WaterSystem.ts` split: ≤300 LOC, grandfather entry removed.
- No perf regression > 5% p99 on `combat120` (water cost goes up
  modestly; budget pre-allocated).
- `VODA-1` directive in `docs/DIRECTIVES.md` moves to Closed with
  this cycle's close-commit SHA.

## Out of Scope

- Buoyancy / swimming / wading — VODA-2 (cycle #7).
- Watercraft — VODA-3 (cycle #10).
- Touching `src/systems/combat/**`,
  `src/systems/navigation/**`.
- Hydrology pipeline changes (the data is correct; visual is the
  problem).
- Fenced-interface touches.

## Carry-over impact

VODA-1 lives in `docs/DIRECTIVES.md`, not in the carry-over
registry. Closing it doesn't touch the active count, but does drop
`konveyer-large-file-splits` from 9 → 8 active when the WaterSystem
half of the split lands (the HosekWilkieSkyBackend half stays).

Active count: 9 → 8 at cycle close.
Net cycle delta: −1.
