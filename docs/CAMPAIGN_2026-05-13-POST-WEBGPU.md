# Campaign: 2026-05-13 Post-WebGPU master merge

Last verified: 2026-05-13

Campaign manifest as of 2026-05-13, post-WebGPU master merge.

## Status

**ACTIVE.** Auto-advance: **PAUSED.** Cycle selection waits for owner
direction on which of the two vision tracks (experimental WebGPU
follow-ups vs. driveable land vehicles) takes the next slot. The
manifest catalogues both queues so `/orchestrate` can pick up either
without first re-deriving the queue.

## Predecessor

This manifest supersedes
[docs/archive/CAMPAIGN_2026-05-09.md](archive/CAMPAIGN_2026-05-09.md), which is flagged
historical at its first line. The 2026-05-09 manifest was the original
9-cycle stabilization-refactor plan; it was paused on 2026-05-11 when
the active run pivoted to KONVEYER-10 on the experimental branch and
remained paused through the KONVEYER campaign. The triggering event for
this new manifest is the master merge of
`exp/konveyer-webgpu-migration` via
[PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
on 2026-05-13T02:06:03Z (merge commit `1df141ca`), followed by the
fallback fix `4aec731e`.

The 2026-05-09 manifest is not deleted; it is retained as historical
reference for the 9-cycle plan that the 2026-05-12 vision pivot
superseded. Items from that manifest that remain relevant
(`STABILIZAT-1` baselines refresh, the combatant-renderer / movement
split cycles) get rolled forward as named entries below.

## Active vision direction

Two parallel first-class directions, confirmed by owner on 2026-05-12
and restated after master merge:

### A. Forward-leaning experimental WebGPU / browser-primitive tech

KONVEYER follow-ups now living on master:

- Compute spatial-grid (cover-query indexing; also closes DEFEKT-3
  surface).
- Indirect drawing + `BatchedMesh` for impostor pipelines.
- TSL ComputeNode particles where the existing CPU pipelines (tracers,
  impacts, explosions) earn the migration.
- Storage textures (atlas-write, GPU-driven LUT refresh) where the
  current `DataTexture` upload path becomes a bottleneck.
- GPU timestamps for per-pass attribution once
  `WebGPURenderer.getRenderInfo()` exposes timing surfaces.

Plus "best-fit classic primitives where they earn their keep" —
AudioWorklet for vehicle engine sim, OPFS for prebake cache,
SharedArrayBuffer-flavoured worker buffers, etc. (see
`docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` for the
leverage-ranked inventory.)

Rust → WASM is **spike-only as a first pass**, not a default. The
named first pilot candidate is the tank-cannon ballistic solver from
`docs/rearch/TANK_SYSTEMS_2026-05-13.md`.

### B. Driveable land vehicles

- **VEKHIKL-1** — M151 jeep drivable end to end. Hand-rolled chassis
  on `GroundVehiclePhysics.ts` + `GroundVehiclePlayerAdapter.ts`,
  Ackermann yaw, four-wheel terrain conform, slope-stall scaling.
- **Wheeled-vehicle MVP follow-ups** (cycle slugs TBD) — generalize
  the M151 chassis surface to support additional wheeled vehicles,
  cover the seat-swap / passenger flows.
- **VEKHIKL-3 / VEKHIKL-4** — tank chassis (skid-steer, turret,
  cannon, damage states), drivable + AI-gunner paths.

Both directions are first-class; neither is subordinated to the
stabilization-refactor backlog that the 2026-05-09 manifest tracked.

## Queued cycles

The following cycles are **listed in dependency order**, not scheduled.
`/orchestrate` selects the next one when the owner names the slot.

### `cycle-vekhikl-1-jeep-drivable`

Drive the M151 end-to-end on the new ground-vehicle physics surface.
New files: `src/systems/vehicle/GroundVehiclePhysics.ts`,
`src/systems/vehicle/GroundVehiclePlayerAdapter.ts`. Updated:
`src/systems/vehicle/GroundVehicle.ts` (config block;
`update(dt)` becomes a real loop).

- Unblocked by: `docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md`.
- Behavior-test plan inherited verbatim from the rearch memo.
- Hard stop: this cycle does **not** introduce an external physics
  library; the four-trigger Rapier-reevaluation gate
  (multi-vehicle collision / ragdoll / watercraft buoyancy /
  articulated trucks) is not fired by one MVP.

### `cycle-konveyer-11-spatial-grid-compute`

Cover spatial-grid for `AIStateEngage.initiateSquadSuppression()`.
Phase F R2 follow-up. First slice may be CPU 8 m uniform grid;
WebGPU compute is a follow-on once the CPU shape proves the
data flow.

- Closes DEFEKT-3 (combat AI p99) surface.
- Hard stop: cover-query latency must NOT regress past current.

### `cycle-konveyer-12-indirect-draw-gpu-culling`

`BatchedMesh` + indirect-args for impostor pipelines. Phase F R2/R3
overlap. Reduces per-frame draw-call count for distant combatant +
vegetation impostors.

- Unblocked by: KONVEYER-11 (the spatial grid is the upstream
  candidate-set source).

### `cycle-phase-f-r2-r4-on-master`

The rebased materialization-rearch follow-ups from the experimental
branch:

- Render-silhouette + render-cluster lanes (Phase F memo slices 4, 5).
- Squad-aggregated strategic sim (Phase F memo slice 3).
- Budget arbiter v2 (extending slice 5 v1).
- Multi-mode strict-WebGPU proof v2.

Cycle may split into two if budget arbiter v2 grows large.

### `cycle-stabilizat-1-baselines-refresh`

`perf-baselines.json` refresh on the new master baseline. The
experimental-branch policy block on baseline refresh lifts at master
merge; the actual refresh has not run yet. This cycle re-captures
combat120 + A Shau steady-pose p99 against the post-WebGPU master and
writes the new bar.

- Hard stop: any p99 regression past +5% from the pre-WebGPU master
  baseline triggers an investigation cycle ahead of refresh acceptance.

### `cycle-konveyer-large-file-splits`

Split `HosekWilkieSkyBackend.ts` (807 LOC) and `WaterSystem.ts`
(733 LOC) when their host features land. The natural split moments:

- `HosekWilkieSkyBackend.ts` → at the TSL fragment-shader sky port.
  Separates LUT generator from renderer-binding shim from cloud-deck
  integrator.
- `WaterSystem.ts` → at the VODA-1 water shader cycle. Separates
  hydrology-bake consumer surface from runtime sampling cache from
  future water-shader binding layer.

This cycle gets dispatched at the same time as the host-feature cycle,
not before. Both files are currently on the source-budget
grandfather list per merge-prep commit `95eefed8`.

### VODA / VEKHIKL backlog directives

These remain queued in `docs/BACKLOG.md` and are not yet promoted to
cycles. They will be promoted when the owner names them as the next
slot:

- **VODA-1** — water shader + visual acceptance. The hydrology
  contract is proved; the shader, intersections, flow visuals, and
  acceptance are not.
- **VODA-2** — buoyancy / swimming / wading consumer surface on top
  of `WaterSystem.sampleWaterInteraction`.
- **VODA-3** — watercraft (post-VODA-2, post-VEKHIKL-1).
- **VEKHIKL-3** — tank chassis + skid-steer locomotion.
- **VEKHIKL-4** — tank turret + cannon + damage states; ballistic
  solver crate is the named Rust → WASM pilot here.

## Hard stops

Restated for completeness; these auto-halt any cycle on this manifest
regardless of which slot is active:

- **Fenced-interface change** (`src/types/SystemInterfaces.ts`). Needs
  an explicit `[interface-change]` PR title and reviewer approval. The
  WebGPU migration deliberately did not require one (per
  KONVEYER_REVIEW_PACKET condition 6); subsequent cycles must respect
  the same gate.
- **Master force-push.** Never.
- **Perf regression > 5% p99 vs master baseline** once
  `cycle-stabilizat-1-baselines-refresh` has refreshed the baseline.
  Until then, the prior baseline plus the WebGPU-migration steady-pose
  proof in `KONVEYER_REVIEW_PACKET_2026-05-12.md` is the bar.
- **Carry-over count growth past the policy bound.** Active count was
  9 at master-merge gate (8 after the vision pivot park; +1 for
  konveyer-large-file-splits opened at merge-prep). Growth beyond
  policy bound triggers a backlog-prune cycle ahead of the next
  feature slot.
- **WebGL fallback accepted as new evidence.** The fallback is
  production-load-bearing now (commit `4aec731e`), but strict-WebGPU
  evidence remains the acceptance bar for renderer-architecture
  claims. Cycles that change renderer behavior must capture strict
  evidence, not fallback evidence.
- **Worktree isolation failure.** Per the AGENT_ORCHESTRATION
  protocol.
- **Twice-rejected reviewer.** Per the standard cycle protocol.

## Resuming

To dispatch the next cycle:

1. Owner names the slot (e.g., "VEKHIKL-1 next" or "KONVEYER-11 next").
2. Flip `Auto-advance: PAUSED` to `Auto-advance: yes` below the
   `Status` header above.
3. Run `/orchestrate` against this manifest. The orchestrator reads the
   selected cycle's brief from `docs/tasks/<slug>.md` and dispatches.

To pause mid-campaign: flip `Auto-advance: yes` back to
`Auto-advance: PAUSED`. The orchestrator finishes the in-flight cycle
and stops.

To skip a cycle that has been overtaken by events: mark its status
`skipped` in this file with a one-line cause. The orchestrator advances
past it.

## Reference

- [docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md](rearch/POST_KONVEYER_MIGRATION_2026-05-13.md)
  — milestone memo capping the KONVEYER campaign and naming the
  fast-follow surface this manifest schedules from.
- [docs/rearch/KONVEYER_REVIEW_PACKET_2026-05-12.md](rearch/KONVEYER_REVIEW_PACKET_2026-05-12.md)
  — predecessor reviewer-ready synthesis (now historical post-merge).
- [docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md](rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md)
  — unblocks `cycle-vekhikl-1-jeep-drivable`.
- [docs/rearch/TANK_SYSTEMS_2026-05-13.md](rearch/TANK_SYSTEMS_2026-05-13.md)
  — unblocks the future VEKHIKL-3/4 cycles.
- [docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md](rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md)
  — forward-looking primitive inventory; informs the experimental
  WebGPU / browser-tech direction.
- [docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md](rearch/ENGINE_TRAJECTORY_2026-04-23.md)
  — "keep the stack" stance with the 2026-05-13 ground-vehicle
  addendum.
- [docs/archive/CAMPAIGN_2026-05-09.md](archive/CAMPAIGN_2026-05-09.md) — historical
  predecessor manifest.
- [docs/state/CURRENT.md](state/CURRENT.md) — top-level current-truth
  snapshot; 2026-05-13 entry caps the KONVEYER campaign.
- [docs/BACKLOG.md](BACKLOG.md) — strategic-reserve index for
  directives that have not yet promoted to cycles.
- [docs/CARRY_OVERS.md](CARRY_OVERS.md) — active carry-over registry.
