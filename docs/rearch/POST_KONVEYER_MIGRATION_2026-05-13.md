# Post-KONVEYER migration milestone

Last verified: 2026-05-13

Branch context: `master` (post-merge). This memo replaces the
"do-not-merge" gate that governed
`docs/rearch/KONVEYER_REVIEW_PACKET_2026-05-12.md` while the migration
lived on `exp/konveyer-webgpu-migration`. It documents what landed at the
master merge, what is queued as fast-follow, and what still needs proof on
production hardware variety. Predecessor packet:
[KONVEYER_REVIEW_PACKET_2026-05-12.md](KONVEYER_REVIEW_PACKET_2026-05-12.md).

## TL;DR

The KONVEYER WebGPU/TSL migration campaign closed when
`exp/konveyer-webgpu-migration` merged into `master` via
[PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
on 2026-05-13T02:06:03Z (merge commit `1df141ca`). Master is now the
WebGPU + TSL renderer branch by default, with automatic WebGL2 fallback
for environments that fail the WebGPU adapter probe. Strict mode
(`?renderer=webgpu-strict`) remains the acceptance bar for KONVEYER-style
evidence; production startup without the flag falls back gracefully on
browsers without WebGPU support. The campaign delivered a WebGPU renderer
surface, a working materialization-tier arbiter (Phase F R1), and a
documentation realignment that names two parallel first-class directions
for the project: experimental WebGPU/browser-primitive tech and driveable
land vehicles.

What still needs proof: native WebGPU on real Windows, Safari macOS / iOS,
Firefox 147+, and the mobile fallback path. CI verified the WebGL2
fallback path on the Linux runner; native WebGPU runs are an
owner-spot-check item post-deploy.

## What landed

### Renderer migration (KONVEYER-0..9)

- **WebGPURenderer + TSL surface**: Three.js r184 `WebGPURenderer` from
  `three/webgpu`. TSL node materials cover vegetation impostors, NPC
  impostors, terrain CDLOD, LUT-driven Hosek-Wilkie atmosphere, and water.
  Strict-mode startup resolves WebGPU on RTX 3070 across all five game
  modes (Open Frontier, Zone Control, Team Deathmatch, combat120 /
  ai_sandbox, A Shau Valley) with zero console / page errors. Production
  render blockers (`ShaderMaterial`, `RawShaderMaterial`,
  `onBeforeCompile`, `WebGLRenderTarget`, `EffectComposer`) are zero on
  the active runtime path.
- **Automatic WebGL2 fallback** (commit `4aec731e`,
  `fix(renderer): gate WebGL-fallback rejection on strict mode only`).
  Before this fix the renderer rejected any WebGL2 resolution as a
  KONVEYER-evidence violation; production startup on Chrome <113,
  Firefox <147, Safari <26, or any headless runner without GPU would have
  crashed. The fix gates the rejection on strict mode so the production
  default path falls back silently while reviewer evidence still requires
  the strict flag.
- **Terrain ground-tone acceptance** (KONVEYER-9): CDLOD placement,
  bounded sky/fog lighting, sRGB albedo policy, Open Frontier + A Shau
  ground tone all proved in
  `artifacts/perf/2026-05-11T02-00-18-828Z/projekt-143-terrain-visual-review/visual-review.json`.

### Phase F materialization rearch (R1)

Three R1 commits landed on the experimental branch and merged with the
rest of the campaign:

- **Combat sub-attribution** (`5432a316`,
  `feat(konveyer): combat sub-attribution`). `World.Combat` now reports
  per-system child timings through `performanceTelemetry.beginSystem` /
  `endSystem`. The slice-10 system-timings probe identified Combat as the
  second-largest CPU contributor after Atmosphere; sub-attribution turns
  the "Combat 1.5-3.2 ms" bar into actionable lane-level inputs for the
  R2 cover-spatial-grid slice.
- **Materialization lane rename** (`bad935c2`,
  `refactor(konveyer): rename lodLevel->simLane, add renderLane`). Wide
  refactor across `CombatantLODManager`, telemetry, tests:
  `Combatant.lodLevel` becomes `Combatant.simLane`, and a separate
  `renderLane` field gets introduced. No behavior change; the rename is
  the surface that budget arbiter v2 writes to in R3-R4. Phase F memo
  slice 1.
- **Idempotent `setCloudCoverage` / sky-refresh gate** (`7e8433b4`,
  `fix(konveyer): gate sky-texture refresh on 2 s cadence regardless of
  cause`, building on slice 15 `1b31379c`,
  `feat(konveyer): idempotent setCloudCoverage cuts sky refresh 14-35x`).
  `WeatherAtmosphere.update()` was firing the sky-texture refresh ~16x
  per second despite the 2 s `SKY_TEXTURE_REFRESH_SECONDS` knob, because
  the cloud-coverage setter unconditionally marked the texture dirty
  every frame. The fix early-returns from `setCloudCoverage` when the
  clamped value is unchanged and adds an enforcing gate at the refresh
  call site. A Shau worst-case SkyTexture EMA dropped from 5.96 ms to
  0.52 ms (about 11x). All five modes now hold total Atmosphere CPU cost
  under 1 ms per frame.

### Documentation vision-alignment (6 PRs)

The 2026-05-12 owner-confirmed vision split (experimental WebGPU +
driveable land vehicles as parallel first-class directions) landed
across six PRs ahead of the master merge:

- `d41069d5` — historical/status headers on superseded strategic docs.
- `9e3ea821` — `docs/ROADMAP.md` + `AGENTS.md` aligned to the
  two-vision split.
- `da8f85ee` — `CLAUDE.md` "Current focus" amended; two non-vision
  AVIATSIYA carry-overs parked.
- `fd5a2581` — `docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md` +
  `ENGINE_TRAJECTORY_2026-04-23.md` addendum.
- `fb35f28f` — `docs/rearch/TANK_SYSTEMS_2026-05-13.md`.
- `f5879ea8` — `docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md`.

### Three new rearch memos + one amended memo

- **`GROUND_VEHICLE_PHYSICS_2026-05-13.md`** — names the state shape,
  force list, integration loop, integration surface (new
  `GroundVehiclePhysics.ts` + `GroundVehiclePlayerAdapter.ts`, config
  block on `GroundVehicle.ts`), and behavior-test plan that the queued
  VEKHIKL-1 jeep spike consumes verbatim. Recommendation: hand-rolled
  MVP mirroring `HelicopterPhysics.ts` (fixed-1/60 s, four wheel
  conform, Ackermann yaw, slope-stall scaling). No external physics
  library.
- **`TANK_SYSTEMS_2026-05-13.md`** — tanks are a sibling of the
  wheeled-chassis MVP, not a subclass. Substitutes Ackermann with
  skid-steer; adds turret rig, gunner seat reusing the helicopter
  seat-swap pattern, and a ballistic main-cannon projectile
  (`TankCannonProjectile`) with gravity-only arc, arming distance, and
  damage-type resolution. Damage as HP bands with three visual
  transitions plus a separate tracks-blown immobilization state.
- **`BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md`** — forward-looking
  inventory of browser primitives the project could fold into the
  runtime. Leverage-ranked recommendation table with 18 rows; NOW
  items are all WebGPU-compute (covered by KONVEYER follow-ups), NEXT
  items are AudioWorklet for vehicle engine sim, OPFS for prebake
  cache, one pilot Rust→WASM crate (ballistic solver), and
  SharedArrayBuffer-flavoured worker buffers. Key finding: COOP/COEP
  are already enabled at the Cloudflare edge (`public/_headers:7-8`),
  so `crossOriginIsolated === true` and SAB are reachable today.
- **`ENGINE_TRAJECTORY_2026-04-23.md` addendum (2026-05-13)** — extends
  the original "no external physics lib" stance from helicopter +
  fixed-wing to ground vehicles, with an explicit four-trigger
  Rapier-reevaluation gate (multi-vehicle collision, ragdoll,
  watercraft buoyancy, articulated trucks). At the gate the ~600 KB
  gzipped `@dimforge/rapier3d-compat` bundle gets reconsidered.

## What is queued as fast-follow on master

Each item is independently shippable and respects the active hard
stops (fenced-interface gate, no perf regression past p99 33 ms on the
A Shau steady-pose bar, etc.).

### Phase F R2-R4

R2-R4 are the rebased materialization-rearch follow-ups from the
experimental branch. The R1 set landed at master merge; the R2-R4 set
queued behind it.

- **Cover spatial-grid** (`cycle-konveyer-11`): builds a CPU 8 m
  uniform spatial grid (or a WebGPU compute grid; ordering TBD) that
  the cover-query service indexes, replacing the linear cover scan in
  `AIStateEngage.initiateSquadSuppression()`. Closes DEFEKT-3 (combat
  AI p99) surface.
- **Render-silhouette + render-cluster lanes** (Phase F memo slices 4,
  5): adds a low-cost billboard tier between impostor and culled, and a
  per-squad single-billboard tier beyond silhouette range. Lets A Shau
  read as visibly populated from flight-altitude cameras without
  per-actor draws.
- **Squad-aggregated strategic sim** (Phase F memo slice 3): the CULLED
  lane currently ticks each entity independently every 8 s. The
  rearch moves to a `sim-strategic` lane that ticks per-squad bulk move
  via `SquadManager` + `WarSimulator`, scaling O(squads) not O(entities).
- **Budget arbiter v2** (extending slice 5 v1): a single function that
  consumes per-frame inputs (camera frustum, active-zone list,
  heap/frame budget, sorted candidates) and assigns one `simLane` +
  one `renderLane` per combatant with explicit budget accounting.
  Required before the silhouette and cluster lanes can compose without
  re-implementing per-system caps.
- **Multi-mode strict-WebGPU proof v2** (review packet condition): the
  R1 proof packet from `KONVEYER_REVIEW_PACKET_2026-05-12.md` gets
  re-captured on the master baseline after R2-R4 land, against the
  A Shau p99 31.0 ms ceiling.

### File-split debt

Two files grew during the KONVEYER campaign and are temporarily on the
source-budget grandfather list per merge-prep commit `95eefed8`:

- **`HosekWilkieSkyBackend.ts`** (807 LOC). Slated for split alongside
  the TSL fragment-shader sky port: separating the LUT generator from
  the renderer-binding shim from the cloud-deck integrator. The port
  itself is queued behind R2-R4 because the slice 12-15 work already
  cut the sky cost out of the hot path; the file split is a
  maintainability item, not a perf item.
- **`WaterSystem.ts`** (733 LOC). Slated for split alongside the VODA-1
  water shader work: separating the hydrology-bake consumer surface
  from the runtime sampling cache from the future water-shader binding
  layer.

### STABILIZAT-1 baselines refresh

`perf-baselines.json` was policy-blocked on the experimental branch;
the block lifts at master merge. The actual refresh has not run yet.
Queued as its own cycle so the new master baseline becomes the
falsifiable bar future PRs measure against.

### VEKHIKL-1 jeep spike

Unblocked by `GROUND_VEHICLE_PHYSICS_2026-05-13.md`. M151 drivable end
to end on the new `GroundVehiclePhysics.ts` +
`GroundVehiclePlayerAdapter.ts` surface. Behavior-test plan inherited
verbatim from the rearch memo.

### Other backlog directives

These are listed in `docs/BACKLOG.md` and the new campaign manifest
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md);
queued, not scheduled, pending owner direction:

- **VODA-1 / VODA-2 / VODA-3** — water shader, intersections,
  buoyancy/swimming/wading, eventual watercraft.
- **VEKHIKL-3 / VEKHIKL-4** — tank chassis, turret, cannon (drivable +
  AI-gunner).
- **KONVEYER-11** — compute spatial-grid as the WebGPU-compute
  follow-up to the CPU-grid fast-follow above.
- **KONVEYER-12** — `BatchedMesh` + indirect drawing for impostor
  pipelines.

## What still needs proof on production hardware variety

This is the honest gap. The migration shipped on the strength of
strict-WebGPU evidence captured on a single RTX 3070 development
workstation plus a Linux CI runner. Other hardware-and-browser
combinations have not yet been validated post-merge.

- **Verified PASS via CI (Linux runner)**: GitHub Actions Ubuntu 24.04
  + Chromium + swiftshader (no GPU). The WebGL2 fallback path was
  exercised by the PR #192 smoke re-run at `4aec731e`. CI checks at
  decision time: lint PASS, test PASS, build PASS, perf PASS, smoke
  PASS (5 of 6). mobile-ui was still in progress at merge time and is
  informational rather than required per
  `gh api repos/.../branches/master/protection` (no protection rules
  set).
- **NOT yet verified on real hardware**:
  - Chrome 113+ on Windows + dedicated GPU (the native-WebGPU happy
    path; only the RTX 3070 development workstation has run this).
  - Safari on macOS Sequoia (WebGPU shipped in Safari 18.2 / macOS
    15.2; behavior in front of real users not yet checked).
  - Safari on iOS 18+ (mobile Safari WebGPU; behavior not yet
    checked).
  - Firefox 147+ (Firefox WebGPU; behavior not yet checked).
  - Android Chrome mobile (fallback path; behavior not yet checked).
  - Safari iOS 17 (fallback path; behavior not yet checked).

The mobile-ui CI check, which was still running at merge time,
provides additional automated coverage of the mobile fallback path
specifically. The owner spot-check post-deploy at
`https://terror-in-the-jungle.pages.dev` is the validation step.

If a regression surfaces on any of these targets, the fix path is:

1. Reproduce in a local browser matching the target.
2. If it is a WebGPU-only bug, add the affected browser version to the
   strict-mode rejection list so production users get the fallback
   instead of a crash.
3. If it is a fallback bug, fix the WebGL2 path directly — the
   fallback is now production-load-bearing.

## Open decisions carried forward from the session

The 2026-05-13 master-merge run surfaced three owner-input items the
follow-up cycles need a directional read on:

1. **Rust→WASM pilot crate**. Owner direction: "spikes for now." The
   `BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` recommendation is one
   pilot, not a wholesale rewrite. The named first candidate is the
   tank-cannon ballistic solver in `TANK_SYSTEMS_2026-05-13.md` (small
   hot numeric kernel, deterministic, gravity-only arc with arming
   distance and damage-type resolution). It is the right shape for a
   Rust crate: well-bounded inputs, well-bounded outputs, no DOM
   interaction. Cycle ordering: spike lands as its own cycle ahead of
   VEKHIKL-4 (tank cycle) so the cycle has a working solver to consume.
2. **Mobile-as-target audience**. The mobile-ui CI matrix is heavy for
   a game whose primary input mode is keyboard + mouse. Three
   directional options have been named:
   - **A. Trim to two representative devices** (e.g., one Android
     Chrome, one iOS Safari) and accept that the rest is best-effort.
   - **B. Keep the full matrix** and accept the CI cost.
   - **C. Make mobile-ui advisory** rather than required, with a
     periodic full-matrix smoke (weekly?) instead of per-PR.
   - No decision yet. Defer to owner.
3. **File-split timing**. `HosekWilkieSkyBackend.ts` and
   `WaterSystem.ts` are on the grandfather list. The natural split
   moment for each is when its host feature lands (TSL fragment-shader
   sky port; VODA-1 water shader). Splitting earlier risks churning
   the same files twice; splitting later risks the grandfather list
   growing past its policy bound. Recommendation: split when the host
   feature cycle dispatches, not before.

## Cross-references

- [KONVEYER_REVIEW_PACKET_2026-05-12.md](KONVEYER_REVIEW_PACKET_2026-05-12.md)
  — the predecessor packet; documents the "do not merge" gate that this
  memo closes.
- [KONVEYER_PRIMITIVE_SPIKES_2026-05-12.md](KONVEYER_PRIMITIVE_SPIKES_2026-05-12.md)
  — research spike on better compute primitives for the expensive
  systems (SkyTexture, Combat, World) identified by slices 10-11.
- [GROUND_VEHICLE_PHYSICS_2026-05-13.md](GROUND_VEHICLE_PHYSICS_2026-05-13.md)
  — wheeled-chassis foundation; unblocks VEKHIKL-1.
- [TANK_SYSTEMS_2026-05-13.md](TANK_SYSTEMS_2026-05-13.md) —
  tracked-vehicle sibling; unblocks VEKHIKL-3/4.
- [BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md](BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md)
  — forward-looking primitive inventory.
- [ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md)
  — "keep the stack" stance with the 2026-05-13 ground-vehicle addendum.
- [docs/state/CURRENT.md](../state/CURRENT.md) — top-level current-truth
  snapshot; 2026-05-13 entry caps the KONVEYER campaign.
- [docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md)
  — active campaign manifest replacing the historical 2026-05-09
  manifest.
