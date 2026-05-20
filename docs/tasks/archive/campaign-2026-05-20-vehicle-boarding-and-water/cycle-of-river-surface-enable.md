# Cycle: Open Frontier river surface enable (hydrology rendering parity with A Shau)

Last verified: 2026-05-20 (queued at insertion; pre-dispatch)

## Status

Queued at **position #2** in
[docs/CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md](../CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md).
Independent of cycles #1 and #3 — runs in parallel.

Opens and closes a new ID `VODA-OF-1` in CARRY_OVERS.md.

## Skip-confirm: no

Owner playtest required: load Open Frontier, find the procedural-river
segment + the Sampan / PBR spawn locations, confirm the boats sit on a
visible water surface (not dirt). Deferred to PLAYTEST_PENDING under
autonomous-loop posture; merge gated on CI green + Playwright capture
pair (pre/post river surface visible).

## Concurrency cap: 3

R1 ships three independent landings: config flip + hydrology run on OF,
sampan/PBR spawn snap-to-water resolver, and the Playwright capture
pair. R2 ships the playtest evidence + close memo.

## Objective

Cycle 2026-05-19 visual-and-wayfinding `ashau-water-enable` (PR #277)
rendered the hydrology river surface in A Shau Valley by flipping
`waterEnabled: true` + `globalWaterPlaneEnabled: false`. Open Frontier
was intentionally left at default (sea-level global plane only) because
the cycle scope was A Shau-specific.

**The gap**: Open Frontier has a Sampan + PBR spawn at fixed positions
inside the procedural-river segment (see `SampanSpawn.ts:111-116`,
`PBRSpawn.ts:167-172`). The boats spawn over the procedural river
geometry, but with no visible water shader render, the player sees them
sitting on dry ground. The hydrology river network is baked at terrain
prebake time and is already queryable in OF (it's how the buoyancy
contract works in the OF spawn snap path), but no visible surface is
drawn.

This cycle enables the rendered hydrology river surface on Open Frontier
(`waterEnabled: true`), matches the resolver pattern used by A Shau so
the Sampan + PBR snap to the actual river water-line at spawn time, and
captures pre/post Playwright shots to prove the boats now sit on water.

A nuance to respect: Open Frontier's terrain valley floor sits at roughly
sea level (the seed-42 noise terrain centers near y=0). Unlike A Shau
(valley floor ~580 m, so its `globalWaterPlaneEnabled: false` was the
right call), OF actually benefits from BOTH a global sea-level plane
AND the procedural-river surface — the lake-ish global plane handles
distant terrain shores; the procedural-river adds visible flow + foam
in the channels. **Default: keep `globalWaterPlaneEnabled` at its
inherited default (`waterEnabled` → true) and confirm both render
without z-fighting at the river-mouth seams.**

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. **The A Shau analog (PR #277 + supporting work):**
   - `src/config/AShauValleyConfig.ts:148-160` — the
     `waterEnabled: true` + `globalWaterPlaneEnabled: false` block and
     its rationale comment (valley floor ~580 m → sea-level plane
     invisible).
   - The 2026-05-19 cycle archive
     `docs/tasks/archive/campaign-2026-05-19-visual-and-wayfinding/cycle-ashau-edge-and-flow-tuning.md`
     — full A Shau water enable brief.
2. **The current OF config (the file this cycle edits):**
   - `src/config/OpenFrontierConfig.ts:48-57` — current `hydrology`
     block (preload + biome classification). No `waterEnabled` field
     today → inherits `true` (default).
   - `src/config/gameModeTypes.ts:295-324` — water flag schema +
     default semantics.
3. **WaterSystem rendering decision:**
   - `src/core/SystemManager.ts:200-215` — where `waterEnabled` +
     `globalWaterPlaneEnabled` are read at system init and dispatched
     to the WaterSystem.
4. **Hydrology rendering pipeline:**
   - `src/systems/environment/water/HydrologyRiverSurface.ts` (the
     river mesh; landed in cycle-voda-1).
   - `src/systems/environment/water/HydrologyRiverGeometry.ts` (river
     geometry build).
   - `src/systems/environment/water/HydrologyRiverFlowPatch.ts`
     (UV-scrolled flow shader patch from cycle-voda-1).
5. **Boat spawn snap pattern (A Shau side):**
   - `src/core/OperationalRuntimeComposer.ts:381-417` — `wireSampanRuntime`
     with `snapSampanToTerrain` resolver. The A Shau version snaps
     to terrain; the OF version should snap to **water surface Y**
     once the OF river renders.
6. **Sampan / PBR OF spawn coords (already in source):**
   - `src/systems/vehicle/SampanSpawn.ts:111-116` — OF Sampan at
     `(-200, 0, 100)` with yaw `π/2`.
   - `src/systems/vehicle/PBRSpawn.ts:167-172` — OF PBR at
     `(-880, 0, -760)` with yaw `π/2`.
7. **Hydrology bake artifacts (already generated for OF):**
   - `public/data/hydrology/open_frontier-42/` — the seed-42 hydrology
     manifest + channel masks. The bake is current; this cycle does
     NOT need a new prebake run.

## Critical Process Notes

1. **No prebake regen.** OF hydrology bake artifacts exist at seed 42
   (`public/data/hydrology/open_frontier-42/`); the cycle's first task
   is to read them, not regenerate them.
2. **No A Shau touches.** A Shau already has the river surface; this
   cycle is OF-only. Any change under `src/config/AShauValleyConfig.ts`
   → halt.
3. **No new WaterSystem code path.** The render pipeline shipped in
   cycle-voda-1. Flipping the config flag is sufficient. If the
   executor reports the OF river renders broken (missing channel
   network), root-cause in the bake, not in the renderer.
4. **No fence change.** WaterSystem and IVehicle interfaces stay as-is.
5. **Z-fighting at river-mouth seam is a known concern.** OF has a
   global sea-level plane (default-on) AND will now have a
   procedural-river ribbon. At river-mouth points (where the river
   meets the global plane), both surfaces co-exist. **Expected
   behavior**: the procedural-river is a few cm above the global plane
   to avoid z-fight; the river masks the global plane via depth-write
   ordering already implemented in cycle-voda-1. If you see actual
   z-fighting in the captures → halt and root-cause.
6. **Sampan + PBR spawn snap** must use the WaterSurfaceSampler
   sampler-API for the water-line Y, not raw terrain Y. The A Shau
   sampler-path code lives in
   `src/systems/environment/water/WaterSurfaceSampler.ts`; the OF
   composer side currently does NOT use it. This cycle wires that.
7. **Backwards compat:** the change must NOT regress A Shau visuals,
   TDM, ZC, or the AI sandbox modes. Run the full `npm test` matrix
   before merging each PR.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `of-water-config-flip`, `of-water-spawn-snap-resolver`, `of-water-capture-pair` | 3 | Three independent landings. |
| 2 | `of-water-playtest-evidence` | 1 | Single playtest PR. |

## Task Scope

### of-water-config-flip (R1)

Enable hydrology river surface rendering on Open Frontier.

**Files touched:**
- `src/config/OpenFrontierConfig.ts` — add `waterEnabled: true` (or
  confirm the default is already firing the river render; the bug may
  be that `hydrology.preload: true` is set but the renderer pipeline
  is gated on something else).
- `src/config/OpenFrontierConfig.test.ts` (new sibling test if
  none exists) — assert the water-enabled fields read what the
  WaterSystem expects.

**Method:**
1. Add an explicit `waterEnabled: true` line at the same position as
   A Shau's, with a comment explaining "Renders hydrology river
   surface AND global sea-level plane. The seed-42 noise terrain
   centers near y=0 so the global plane is visible on shore terrain,
   and the procedural-river ribbon overlays it in the river channel."
2. Leave `globalWaterPlaneEnabled` at the inherited default (`true`).
   Confirm via the `SystemManager.ts:200-215` read path.
3. Confirm via a behavior test that `waterEnabled: true` →
   `globalWaterPlaneEnabled: true` → both surfaces dispatched to
   WaterSystem.
4. Commit message: `feat(water): enable Open Frontier hydrology river surface (of-water-config-flip)`.

**Acceptance:**
- Lint + tests + build green.
- The OF mode loads with WaterSystem rendering both the global plane
  AND the hydrology river ribbon.
- No A Shau regression.
- No fence change.

### of-water-spawn-snap-resolver (R1)

Snap OF Sampan + PBR to the water surface at spawn time.

**Files touched:**
- `src/core/OperationalRuntimeComposer.ts` — extend
  `snapSampanToTerrain` and `snapPBRToTerrain` to consult the
  WaterSurfaceSampler when the active mode is OPEN_FRONTIER (or
  A_SHAU_VALLEY where the river is enabled).
- New / extended `src/systems/environment/water/WaterSurfaceSampler.ts`
  helper if the snap-query is not already public surface.
- `src/core/OperationalRuntimeComposer.test.ts` — extend.

**Method:**
1. Detect: if the active scenario has `waterEnabled: true`, run the
   water-surface snap. Otherwise fall back to terrain snap.
2. Use `WaterSurfaceSampler.sample(x, z)` returning `{ waterY, hasWater }`.
3. If `hasWater`, snap the boat's Y to `waterY + freeboard`. Else
   fall back to terrain.
4. Mirror the existing A Shau snap path. Do NOT duplicate the snap
   logic between sampan + PBR — extract a shared
   `snapWatercraftToSurface` helper.
5. **Behavior test:** mock WaterSurfaceSampler returning a water Y
   at the OF spawn coord → the spawn position lands at water-Y.
   Returning `hasWater: false` → falls back to terrain.
6. Commit message: `feat(vehicle): snap OF Sampan + PBR to water surface at spawn (of-water-spawn-snap-resolver)`.

**Acceptance:**
- Lint + tests + build green.
- Behavior test covers `hasWater: true` and `hasWater: false` branches.
- A Shau snap path stays byte-identical (regression-locked by an
  existing A Shau composer test).
- No fence change.

### of-water-capture-pair (R1)

Playwright pre/post capture pair proving the OF river surface is
visible after the flip.

**Files touched:**
- `scripts/capture-of-river-surface-shots.ts` — new (mirror
  `scripts/capture-ashau-edge-and-flow-shots.ts` shape).
- New screenshots committed under
  `artifacts/cycle-of-river-surface-enable/playtest-evidence/`.

**Method:**
1. Capture pre-bump on master tip `67969e60` (before this cycle):
   `of-sampan-spawn-pre.png`, `of-pbr-spawn-pre.png`,
   `of-river-segment-pre.png`. Per-cycle convention is to commit pre
   captures during R1 of the same PR.
2. Capture post-bump on cycle head:
   `of-sampan-spawn-post.png`, `of-pbr-spawn-post.png`,
   `of-river-segment-post.png`.
3. Each post-shot must show: visible water surface under both boats,
   visible river ribbon in the channel, no z-fighting at the river
   shoreline.
4. Capture-script options: `--pair-tag=pre` / `--pair-tag=post`,
   `--scenario=openfrontier`.
5. Commit message: `chore(water): OF river surface pre/post Playwright capture pair (of-water-capture-pair)`.

**Acceptance:**
- 6 PNGs committed (3 pre, 3 post).
- `summary-of-water.json` written with capture metadata +
  `riverSurface.visible` boolean per shot.
- No fence change.

### of-water-playtest-evidence (R2, merge gate)

Playtest doc + PLAYTEST_PENDING row + close memo.

**Files touched:**
- `docs/playtests/cycle-of-river-surface-enable.md` — new memo.
- Append to `docs/PLAYTEST_PENDING.md`.

**Method:**
1. Memo lists the deferred owner walk: load OF, navigate to the
   Sampan spawn at `(-200, 100)`, navigate to the PBR spawn at
   `(-880, -760)`, walk the river segment between them. Confirm:
   - Boats sit on water, not dirt.
   - River ribbon is visible + flows.
   - No z-fight at shorelines.
   - Global plane still renders on distant shore terrain.
2. Append row to PLAYTEST_PENDING with the capture set link.
3. Commit message: `docs(water): OF river surface playtest evidence (of-water-playtest-evidence) (playtest-deferred)`.

**Acceptance:**
- Playtest memo + PLAYTEST_PENDING row landed.
- Capture set referenced.
- No fence change.

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- The config flip lands but the river surface does NOT render in the
  post capture → halt; root-cause in WaterSystem dispatch (likely a
  conditional gate beyond `waterEnabled` that the cycle missed).
- Z-fighting visible at the river shoreline in the post capture →
  halt; root-cause in the depth-write order between global plane and
  river ribbon.
- A Shau regression — any A Shau visual capture differs from cycle
  2026-05-19 baseline → halt.

## Reviewer Policy

- **No mandatory `combat-reviewer`** — no combat AI touches.
- **`terrain-nav-reviewer` mandatory** on the config flip PR
  (`of-water-config-flip`) because the WaterSystem render path is
  adjacent to terrain.
- Orchestrator reviews for: no fence leak, no A Shau visual
  regression, capture-script writes both pre + post.

## Acceptance Criteria (cycle close)

**Rendering:**
- Open Frontier renders the hydrology river ribbon at all OF mode
  loads.
- Global sea-level plane continues to render in OF (overlapping
  shore-area surface).
- A Shau visuals unchanged.

**Spawning:**
- Sampan at `(-200, 100)` sits on the water surface.
- PBR at `(-880, -760)` sits on the water surface.

**Tests:**
- Behavior tests cover both branches of the snap resolver.
- A Shau composer test unchanged.

**Playtest evidence:**
- 6 Playwright captures committed (3 pre, 3 post).

**Other:**
- All R1 + R2 task PRs merged.
- Owner playtest sign-off recorded (deferred under autonomous-loop).
- No fence change.
- `VODA-OF-1` opened + closed in CARRY_OVERS.md.

## Out of Scope

- A Shau visual changes.
- TDM / ZC / AI sandbox water flags.
- New WaterSystem features (only flip OF config; render pipeline is
  unchanged).
- Hydrology prebake regen.
- Touching `src/systems/combat/**`, `src/systems/navigation/**`.
- Fence touches.

## Open Questions (owner-default decisions pre-baked)

1. **`globalWaterPlaneEnabled` on OF — true or false?** **Default:
   true (inherited).** OF terrain centers near y=0 so a sea-level
   plane is visible. A Shau opted out because its valley floor is at
   580 m. If owner reports the global plane looks wrong on OF, the
   one-line flip is `globalWaterPlaneEnabled: false`.
2. **Other modes (TDM, ZC, AI sandbox) — get the river too?**
   **Default: no.** Those scenarios use procedural/dummy terrains
   that don't have hydrology channels baked. Out of scope.
3. **Sampan / PBR initial Y — water surface or +freeboard?** **Default:
   water-surface Y + freeboard.** Mirror the A Shau path. The
   buoyancy contract handles the rest via VODA-2's `BuoyancyForce`.

## Carry-over impact

- New ID: `VODA-OF-1`. Cycle-open ID.
- No hold-list additions.

Net cycle delta on active carry-over count: 0.
