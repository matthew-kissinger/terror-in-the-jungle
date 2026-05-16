# Campaign: 2026-05-13 Post-WebGPU master merge

Last verified: 2026-05-16

Campaign manifest as of 2026-05-13, post-WebGPU master merge.

## Status

**ACTIVE.** Auto-advance: **PAUSED.** The
`cycle-2026-05-16-mobile-webgpu-and-sky-recovery` investigation cycle
closed on 2026-05-16 with the R2 alignment memo at
[docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md).
That memo names two follow-up fix cycles, both queued at the top of
the queue below: `cycle-sky-visual-restore` (small, visual, leads) and
`cycle-mobile-webgl2-fallback-fix` (larger, real-device-validation
merge gate). Owner picks ordering at next `/orchestrate` dispatch.
After those two finish, the vision-track choice (experimental WebGPU
follow-ups vs. driveable land vehicles) resumes.

Current branch overlay: `task/mode-startup-terrain-spike` addresses a
user-visible mode-startup stall discovered after the WebGPU merge. It is a
targeted branch, not a replacement for either vision track. The branch should
either merge as a startup hardening slice or leave behind `KB-STARTUP-1` with
its visual-review and persistent-cache follow-up criteria intact. It is
explicitly OUT OF SCOPE for the
`cycle-2026-05-16-mobile-webgpu-and-sky-recovery` investigation cycle.

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

### `cycle-2026-05-16-mobile-webgpu-and-sky-recovery` (closed 2026-05-16)

Closed. Five R1 investigation memos merged
([#203](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/203),
[#204](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/204),
[#205](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/205),
[#206](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/206),
[#207](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/207))
under `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/`. R2
alignment memo at
[docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md)
synthesised the findings and named two fix cycles, both queued below:
`cycle-sky-visual-restore` and `cycle-mobile-webgl2-fallback-fix`.

Carry-over delta: opened `KB-MOBILE-WEBGPU` + `KB-SKY-BLAND` at launch
(9 → 11); closed both at cycle end with promotion-to-fix-cycle
resolution (11 → 9). Net cycle delta: 0.

### `cycle-sky-visual-restore` (queued, owner picks ordering)

Restore the pre-merge sky visual fidelity (saturated horizon, visible
sun pearl, deep noon blue) without re-introducing the per-fragment
Preetham shader on the full dome.

- **Closes:** `KB-SKY-BLAND`.
- **Files touched (expected):**
  `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`
  primarily; possibly `src/systems/environment/AtmosphereSystem.ts`
  for the sun-disc sprite integration.
- **Round structure (proposed):** single round, 2-3 tasks:
  - `sky-dome-tonemap-and-lut-resolution` — set `toneMapped: false` on
    the dome `MeshBasicMaterial`; bump `SKY_TEXTURE_WIDTH/HEIGHT` to
    ≥256×128; measure refresh cost via existing
    `getRefreshStatsForDebug`.
  - `sky-hdr-bake-restore` — stop clamping radiance to `[0,1]` at
    bake time; upload as `HalfFloatType` (or encoded exposure curve
    that preserves sun spike).
  - `sky-sun-disc-restore` — add additive HDR sun-disc sprite (or
    composite at downstream stage) so the pearl returns.
- **Acceptance:** owner-playtest sign-off against paired pre/post
  screenshots in
  [docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/](rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/);
  no perf regression > 5% p99 on `combat120`.
- **Out of scope:** re-introducing per-cloud highlight/shadow math;
  re-introducing the `CloudLayer` plane; switching to a real
  Hosek-Wilkie coefficient pipeline.

### `cycle-mobile-webgl2-fallback-fix` (queued, owner picks ordering)

Restore mobile playability on the WebGL2-fallback path of
`WebGPURenderer`. Lead with the terrain TSL early-out (biggest
per-fragment lever), then the mobile-specific knobs, then validate on
real devices.

- **Closes:** `KB-MOBILE-WEBGPU`.
- **Files touched (expected):**
  `src/systems/terrain/TerrainMaterial.ts` primarily (terrain TSL
  early-outs); `src/utils/DeviceDetector.ts` (mobile pixel-ratio cap);
  `src/core/LiveEntryActivator.ts` (mobile-skip prewarm);
  `src/systems/environment/AtmosphereSystem.ts` +
  `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`
  (mobile-gated sky cadence); `src/core/SystemInitializer.ts`
  (asset/audio defer); `src/systems/debug/FrameTimingTracker.ts`
  (`RenderMain` / `RenderOverlay` telemetry-gap fix); plus new
  `scripts/perf-tsl-shader-cost.ts` and a real-device validation
  harness.
- **Round structure (proposed):** 2-3 rounds, 6-8 tasks:
  - R1 (foundation): `terrain-tsl-biome-early-out`,
    `terrain-tsl-triplanar-gate`, `render-bucket-telemetry-fix`.
  - R2 (mobile knobs): `mobile-pixel-ratio-cap`,
    `mobile-skip-npc-prewarm`, `mobile-sky-cadence-gate`,
    `asset-audio-defer`.
  - R3 (validation): `tsl-shader-cost-probe`,
    `real-device-validation-harness`. Real-device sign-off on Android
    Chrome + iOS Safari is the merge gate.
- **Acceptance:**
  - Steady-state `avgFps` ≥ 20 fps on the Pixel 5 emulation profile
    (up from 4.42 fps; directional target per the alignment memo's
    perf-taint caveat).
  - Steady-state `avgFps` ≥ 30 fps on a real Android Chrome device
    (mid-tier 2022+).
  - Owner-playtest "playable" sign-off on a real iOS Safari device.
  - No regression on desktop `combat120` perf baseline (>5% p99 is a
    hard stop per this manifest).
  - `RenderMain` / `RenderOverlay` buckets populated in
    `systemBreakdown` on both desktop and mobile.
- **Sequencing dependency on `cycle-konveyer-11-spatial-grid-compute`:**
  optional. Closing `DEFEKT-3` removes the steady-state #1 bucket
  (`Combat.AI`) independently. The mobile fix cycle's acceptance is
  formulated such that running `cycle-konveyer-11` alongside
  accelerates the playable-fps gate but is not strictly required.
- **Hard stops (cycle-specific):**
  - Any TSL early-out rewrite that regresses the strict-WebGPU path on
    desktop. Strict-WebGPU evidence remains the renderer-architecture
    acceptance bar.
  - Real-device-validation infeasible. Cycle must produce real-device
    evidence; emulation-only is not acceptable as merge evidence (it
    is acceptable as scoping evidence).
- **Out of scope:** rolling back the WebGPU + TSL migration;
  re-introducing the classic `THREE.WebGLRenderer` as the production
  renderer (the explicit `?renderer=webgl` escape hatch remains).

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

### `cycle-mode-startup-terrain-bake-hardening`

Production hardening for `task/mode-startup-terrain-spike` if the branch is
not merged directly. The branch already proves the primary issue: cache headers
and Recast WASM delivery were correct, while terrain surface baking blocked the
mode-click path. This cycle owns the merge-quality finish:

- Keep terrain surface baking off the main thread through module workers and
  transferable height/normal buffers.
- Preserve the batched `TerrainSystem.configureModeSurface(...)` contract.
- Visually review Open Frontier and A Shau finite-edge views before accepting
  the coarse source-delta cache used for the render-only visual margin.
- If that approximation fails visual review, replace it with persistent or
  prebaked visual-surface artifacts, or an IndexedDB/OPFS runtime bake cache.

Evidence memo:
`docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md`.

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
- **Carry-over count growth past the policy bound.** Active count is
  back to **9** after the `cycle-2026-05-16-mobile-webgpu-and-sky-recovery`
  investigation cycle closed on 2026-05-16 with promotion-to-fix-cycle
  resolution on `KB-MOBILE-WEBGPU` and `KB-SKY-BLAND` (was 11 mid-cycle,
  9 at cycle start, 9 after `KB-STARTUP-1` from the mode-startup spike,
  8 after the KONVEYER-10 master merge). Net cycle delta: 0. Growth
  beyond the policy bound (12) triggers a backlog-prune cycle ahead of
  the next feature slot.
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
