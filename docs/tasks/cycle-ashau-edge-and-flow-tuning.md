# Cycle: A Shau Edge & Flow Tuning (CDLOD Stage-D3 DEM edge taper + slope-aware route stamping)

Last verified: 2026-05-19 (queued at insertion; pre-dispatch)

## Status

Queued at **position #2** in
[docs/CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md](../CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md).
Independent of cycles #1 and #3 in the same campaign — runs in parallel.

Closes Stage **D3** of the CDLOD seam plan (D1+D2 landed in
`cycle-2026-05-09-cdlod-edge-morph`; D3 was explicitly deferred per
the cycle archive at
`docs/tasks/archive/cycle-2026-05-09-cdlod-edge-morph/cdlod-edge-morph.md`
and is the source of the user-reported "tall vertical fins" at A
Shau's map edge).

Opens and closes a new ID `KB-DEM-EDGE-TAPER` in-cycle (zero-cycle
visual carry-over) and adds a documented tuning entry for route
stamping under `docs/CARRY_OVERS.md` if the slope guard reveals
broader systemic issues with route-baking on real-DEM scenarios.

## Skip-confirm: no

Owner playtest required: A Shau north-edge flyover screenshot
showing the edge taper land smoothly, plus A Shau valley-road
screenshot showing the route stamping no longer trenches steep
slopes. Both deferred to PLAYTEST_PENDING under autonomous-loop
posture; merge gated on CI green + `terrain-nav-reviewer` APPROVE
+ Playwright captures.

## Concurrency cap: 3

R1 ships the DEM edge taper + the route-stamp slope guard +
A Shau `waterEnabled` flip in parallel — they touch independent
modules. R2 ships the playtest evidence.

## Objective

Fix two A Shau Valley visual issues that the user reported on
2026-05-19 after a helicopter flyover of the live build (SHA
`fc398f12`):

1. **Tall vertical "fins" / spikes at the DEM map edge.** Root
   cause: `DEMHeightProvider.sample()` (lines `112–114`) clamps
   sample coords to `[0, gridWidth - 1.001]` — outside the 21.1 km
   DEM box, the heightmap repeats the boundary pixel. When that
   boundary pixel sits on a ridge, the visual-margin quadtree
   inflation (`TerrainRenderRuntime.ts:67–73`) extrudes the
   boundary value outward as a vertical wall. Stage **D3** in the
   cycle-2026-05-09-cdlod-edge-morph plan was to taper outside-DEM
   samples back to a baseline; D3 was deferred pending visual
   review of D1+D2. The owner now reports D1+D2 are clean inside
   the box, and the edge artifacts are exclusively the missing-D3
   case.
2. **"Trench / skinny-trail" cuts through terrain.** Route stamps
   from `TerrainFlowCompiler.appendRouteFlow` mutate the heightmap
   at bake time (`routeStamping: 'full'`,
   `routeTerrainWidthScale: 0.38` per
   `src/config/AShauValleyConfig.ts:113–129`). On steep slopes the
   flatten kernel cuts visible canals into the hillside. The
   behavior is intentional (gives NPC navigation a flat surface)
   but the parameters were tuned on the Open Frontier 16 km
   noise-terrain, not the A Shau real-DEM where slopes are much
   steeper.

Bonus scope (small, related, batches well):
3. **A Shau "sampan on dry land" bug.** The watercraft spawn in A
   Shau (`SampanSpawn.ts:97`, position `(60, 0, 80)`) sits in a
   "low-lying area where hydrology bake reports wet cells", but
   A Shau has `waterEnabled: false` at
   `src/config/AShauValleyConfig.ts:147`. The hydrology river
   surface is built but not rendered, so the boat sits on dirt.
   Flip `waterEnabled: true` for A Shau — render only the hydrology
   river mesh, not the global 2000 m water plane (which would not
   make sense at A Shau valley altitudes). If the global plane is
   coupled to the flag, decouple it with a new
   `globalWaterPlaneEnabled` config field defaulting to the
   existing behavior.

Source authority for scope:
- This brief (root cause analysis from the 2026-05-19 owner playtest
  report).
- `docs/tasks/archive/cycle-2026-05-09-cdlod-edge-morph/cdlod-edge-morph.md`
  Stage D3 section (deferred work; this cycle closes it).
- `docs/tasks/archive/cycle-2026-05-08-perception-and-stuck/terrain-cdlod-seam.md`
  lines 39, 87–88 (D3 deferral note).
- `MEMORY.md` carry-over note "Stage D3 DEM edge padding gated on
  visual review of D1+D2 at A Shau north ridgeline".

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. `src/systems/terrain/DEMHeightProvider.ts` (entire file). Lines
   `112–114` are the clamp site. Replace clamp with taper-down
   when sample coords fall outside `[0, width-1]`.
2. `src/systems/terrain/TerrainRenderRuntime.ts` lines `67–73` —
   the visual-margin quadtree inflation. The taper must cover the
   visible-margin radius, not just the in-DEM range. Read to
   understand how far past the DEM the visible quadtree extends.
3. `src/systems/terrain/TerrainFlowCompiler.ts` lines `39–79`
   (`appendRouteFlow`); `src/systems/terrain/TerrainFeatureCompiler.ts`
   lines `49–72` (the stamp pipeline). These are the route-bake
   path.
4. `src/config/AShauValleyConfig.ts`:
   - Lines `83–93`: DEM dimensions (2304×2304 px, 9 m/px,
     21136 m). The taper outer radius must extend past the
     `cameraFar` (which A Shau sets to ~4000 m), so the visible
     quadtree never samples a pixel that hasn't been tapered.
   - Lines `113–129`: route flow config. Tunable parameters live
     here.
   - Line `147`: `waterEnabled: false`. The flip site.
5. `src/systems/environment/WaterSystem.ts` lines `58–276` and
   `src/core/SystemManager.ts` lines `200–208` — the per-mode
   water enable/disable wiring. Understand whether `waterEnabled`
   gates both the global plane AND the hydrology river surface,
   or whether they're already decoupled. If coupled, decouple via
   the new flag.
6. `src/systems/vehicle/SampanSpawn.ts` lines `97–120` — A Shau
   spawn coordinates; the executor must confirm the post-flip
   spawn point lands on the hydrology river surface, not on the
   global water plane.
7. `src/systems/terrain/CDLODQuadtree.ts` lines `190–198`
   (AABB-distance morph metric; landed in D1) and
   `src/systems/terrain/CDLODRenderer.ts` lines `13–87` (skirts;
   landed in D2) — read for context. **Do not modify these.**
8. `docs/CARRY_OVERS.md` — confirm `KB-DEM-EDGE-TAPER` opens at
   cycle launch and closes at cycle close. Document the route-stamp
   slope guard's effect on the carry-over registry (no new active
   row expected).

## Critical Process Notes

1. **Three independent surfaces.** DEM edge taper touches only
   `DEMHeightProvider.ts` (+ tests). Slope-aware route stamping
   touches `TerrainFlowCompiler.ts` + `AShauValleyConfig.ts` (+
   tests). Water flip touches `AShauValleyConfig.ts` +
   `WaterSystem.ts` + `SystemManager.ts` (+ a sibling test for the
   decoupled global-plane flag). All three R1 PRs run in parallel.
2. **No fence change.** `src/types/SystemInterfaces.ts` is not
   touched. If an executor proposes one, halt — the proposed work
   is off-scope.
3. **Determinism preserved.** Both the taper and the slope guard
   must produce byte-identical heightmaps across runs with the same
   DEM seed. The slope guard's slope-sample must use a deterministic
   neighbor lookup (no `Math.random`).
4. **Mobile path stays clean.** The DEM edge taper runs CPU-side
   during terrain bake — confirm the bake budget headroom holds.
   The route-stamp guard adds a slope check per stamp call; small.
5. **`terrain-nav-reviewer` mandatory** on all three R1 PRs (terrain
   surface integrity + nav route integrity).
6. **No regressions to D1 or D2.** The taper must not pollute the
   in-DEM region. Add a regression test that samples the DEM at
   coords inside the box and asserts byte-identical values to the
   pre-taper sampler. Same for the route stamp guard — when slope
   is below the guard threshold, stamps must behave byte-identical
   to today.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `dem-edge-taper`, `route-stamp-slope-guard`, `ashau-water-enable` | 3 | Three independent landings. Each is small (≤ 300 LOC + tests). |
| 2 | `ashau-edge-and-flow-playtest-evidence` | 1 | Single playtest PR after R1 lands. |

## Task Scope

### dem-edge-taper (R1)

Replace the boundary-clamp in `DEMHeightProvider.sample()` with a
smooth taper that ramps the heightmap down to a documented baseline
over a configurable outside-DEM radius.

**Files touched:**
- `src/systems/terrain/DEMHeightProvider.ts` (lines `112–114` plus
  any new constants — `DEM_EDGE_TAPER_RADIUS_M`, `DEM_EDGE_BASELINE_M`).
- New sibling test
  `src/systems/terrain/DEMHeightProvider.taper.test.ts`.
- `src/config/AShauValleyConfig.ts` if the taper needs per-scenario
  config (e.g., outer radius scales with `cameraFar`).

**Method:**
1. Define constants in `DEMHeightProvider.ts`:
   - `DEM_EDGE_TAPER_RADIUS_M` — distance over which the taper
     ramps from boundary value to baseline. Default: `1500 m`
     (covers A Shau's `cameraFar = 4000 m` with the existing visual
     margin).
   - `DEM_EDGE_BASELINE_M` — the floor elevation the taper ramps
     to. Default: `0 m` (sea level). For A Shau (valley floor
     ~580 m), `0 m` produces a long downhill slope into the
     distance — visually clean and correct since the player can't
     navigate there.
2. In `sample(x, z)`, replace the clamp:
   ```ts
   const gxf = (x - minX) * invStepX;
   const gzf = (z - minZ) * invStepZ;
   const outsideX = Math.max(0, Math.max(-gxf, gxf - (gridWidth - 1)));
   const outsideZ = Math.max(0, Math.max(-gzf, gzf - (gridHeight - 1)));
   const outsideDist = Math.hypot(outsideX * stepX, outsideZ * stepZ);
   if (outsideDist === 0) {
     // existing in-DEM path, byte-identical
   }
   // taper: ramp toward baseline over DEM_EDGE_TAPER_RADIUS_M
   const t = clamp01(outsideDist / DEM_EDGE_TAPER_RADIUS_M);
   const boundarySample = sampleClamped(...);
   return lerp(boundarySample, DEM_EDGE_BASELINE_M, smoothstep(t));
   ```
   `smoothstep` produces a C1-continuous ramp; the boundary value
   continues without a kink at `gridWidth - 1`.
3. The taper function must be a pure function of inputs — no
   per-call allocation. Reuse the existing in-DEM path's
   bilinear sample as `sampleClamped()`.
4. **Regression test:** sample 64 points inside the DEM box; assert
   byte-identical values to a snapshot taken pre-change.
5. **Behavior test:** sample at `boundary - epsilon`,
   `boundary + epsilon`, `boundary + radius`, `boundary + 2*radius`;
   assert (a) C0 continuity at boundary, (b) monotonic descent to
   baseline, (c) saturation at baseline past `radius`.
6. **Visual test:** add a Playwright shot of A Shau north-edge
   flyover from the playtest task; manual visual diff confirms no
   vertical fins.
7. Commit message: `feat(terrain): DEM edge taper replaces boundary clamp (dem-edge-taper)`.

**Acceptance:**
- Lint + tests + build green.
- Regression test passes byte-identical for in-DEM samples.
- Behavior tests pass for the four boundary cases.
- `terrain-nav-reviewer` APPROVE.
- No perf regression in terrain bake (the taper adds ≤ 2 ops per
  outside-DEM sample; in-DEM path unchanged).

### route-stamp-slope-guard (R1)

Make `TerrainFlowCompiler.appendRouteFlow` slope-aware: flatten
stamps run as today below a slope threshold; above the threshold
the stamp blends toward a drape (follows terrain) instead of
flattening. Trenches stop appearing on hillsides.

**Files touched:**
- `src/systems/terrain/TerrainFlowCompiler.ts` (lines `39–79`,
  `appendRouteFlow`).
- `src/systems/terrain/TerrainFeatureCompiler.ts` lines `49–72` if
  the stamp signature needs a new `slopeGuardDegrees` field.
- `src/config/AShauValleyConfig.ts` lines `113–129` (route flow
  config — add `slopeGuardDegrees`, `slopeGuardSoftnessDegrees`,
  `routeBlendOnSteepSlope`).
- `src/config/OpenFrontierConfig.ts` if a default value should
  apply there too (Open Frontier is gentler so the guard rarely
  triggers; default off OR `slopeGuardDegrees: 30` is safe).
- New sibling test for `appendRouteFlow` slope-guard behavior.

**Method:**
1. Add config fields with defaults:
   - `slopeGuardDegrees` — slope above which the stamp transitions
     to drape. Default for A Shau: **15°**. Open Frontier inherits
     the absent-default (no guard).
   - `slopeGuardSoftnessDegrees` — softness band on either side of
     the threshold. Default: **5°** (so the transition runs from
     10° to 20° smoothly).
   - `routeBlendOnSteepSlope` — final blend factor toward drape
     past the soft band. Default: **0.0** (full drape, no flatten).
2. In `appendRouteFlow`, for each stamp call:
   - Sample terrain slope at the stamp center (use existing height
     bilinear gradient or a small 4-tap differential).
   - Compute `t = smoothstep(slopeGuardDegrees - softness/2,
     slopeGuardDegrees + softness/2, sampledSlopeDegrees)`.
   - Set the stamp's flatten strength to
     `lerp(originalFlattenStrength, routeBlendOnSteepSlope, t)`.
3. Below threshold (gentle ground), behavior is byte-identical to
   today.
4. Above threshold (steep hillside), the stamp falls toward zero
   flatten — no trench.
5. **Regression test:** stamp on a flat patch; assert byte-identical
   to today.
6. **Behavior test:** stamp on a 30° slope; assert the resulting
   heightmap difference is ≤ 10% of the today-case difference.
7. **Determinism test:** run the stamp twice with same seed; assert
   byte-identical output.
8. Commit message: `feat(terrain): slope-aware route stamping (route-stamp-slope-guard)`.

**Acceptance:**
- Lint + tests + build green.
- Regression test (flat patch) byte-identical.
- Behavior test (30° slope) shows ≤ 10% flatten depth vs today.
- `terrain-nav-reviewer` APPROVE — and specifically confirm
  navigation still completes a path across the once-flattened
  corridor (NPC nav doesn't strictly require flatten; the path is
  still walkable on a 30° slope with the `SlopeStuckDetector` from
  cycle #11).
- No perf regression (the slope sample is a 4-tap differential,
  off the hot path — it runs once per route compile).

### ashau-water-enable (R1)

Flip A Shau Valley to render the hydrology river surface (so the
Sampan spawn isn't on dry dirt). Decouple the global water plane
(2000 m flat plane at Y=0) from `waterEnabled` if currently
coupled — A Shau valley floor is at ~580 m elevation so a global
sea-level plane would be invisible and wasted.

**Files touched:**
- `src/config/AShauValleyConfig.ts` (line `147`: `waterEnabled: true`;
  add `globalWaterPlaneEnabled: false` if decoupling is needed).
- `src/systems/environment/WaterSystem.ts` and
  `src/core/SystemManager.ts` lines `200–208` — check the wiring;
  if `waterEnabled` already gates the river surface separately
  from the global plane, no change needed. If coupled, add the
  new `globalWaterPlaneEnabled` field and route it through.
- `src/systems/vehicle/SampanSpawn.ts` line `97` — confirm the
  A Shau spawn position lands inside a baked hydrology channel;
  if not, nudge the spawn to the nearest channel center using the
  existing `findSuitableZonePosition` style helper.
- Sibling test for the decoupled flag if it exists.

**Method:**
1. Read `WaterSystem` to confirm river vs global plane wiring.
2. Flip `waterEnabled: true` in `AShauValleyConfig.ts`.
3. If global plane and river surface are coupled, introduce
   `globalWaterPlaneEnabled: boolean` (defaults to `waterEnabled`
   for back-compat) and gate the global plane creation on it.
   Set `globalWaterPlaneEnabled: false` in A Shau.
4. Re-verify A Shau Sampan spawn coords land on a wet hydrology cell.
   If `findSuitableZonePosition`'s `Math.random` non-determinism is
   involved (per the cycle-2026-05-08 reviewer note), use a
   seeded RNG or move the spawn to a fixed pre-validated channel
   center.
5. Commit message: `feat(water): A Shau river surface + decoupled global plane (ashau-water-enable)`.

**Acceptance:**
- Lint + tests + build green.
- A Shau loads with hydrology river mesh rendering at the bake
  channels; no global plane visible.
- Sampan spawn lands on the river (visible in capture).
- No regression on Open Frontier water (both river + global plane
  render as today).
- `terrain-nav-reviewer` APPROVE (touches a config edge that the
  reviewer guards even though no nav code changed).

### ashau-edge-and-flow-playtest-evidence (R2, merge gate)

Playwright captures + owner-walkthrough doc.

**Files touched:**
- New: `docs/playtests/cycle-ashau-edge-and-flow-tuning.md`.
- Extend an existing capture script or add a new one
  `scripts/capture-ashau-edge-and-flow-shots.ts`.
- Append to `docs/PLAYTEST_PENDING.md`.

**Method:**
1. Capture pairs (pre on `master` baseline `be953420` + post on
   cycle close):
   - A Shau north-edge flyover (altitude 1500 m, heading north
     toward DEM boundary). Pre: vertical fins. Post: smooth taper.
   - A Shau valley-road wide shot showing route stamps. Pre:
     visible trench across slope. Post: drape follows terrain.
   - A Shau Sampan spawn close-up. Pre: boat on dirt. Post: boat
     on river.
2. Mobile-emulation probe on A Shau (Pixel 5 + iPhone 12) to
   confirm bake-budget headroom holds (cycle #12 baselines 29.02
   / 28.88 avgFps; ±10% gate).
3. Document the route-stamp tuning values used and any follow-up
   tuning notes from the executor.
4. Commit message: `docs(ashau): edge taper + flow tuning playtest evidence (ashau-edge-and-flow-playtest-evidence) (playtest-deferred)`.

**Acceptance:**
- Lint + tests + build green.
- 6 captures committed (3 pairs).
- Mobile probes inside 10% gate.
- Playtest doc + PLAYTEST_PENDING row landed.

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected `terrain-nav-reviewer` → halt.

Cycle-specific:
- DEM edge taper produces non-zero diff at any in-DEM sample →
  halt; back out (means the boundary path picked up a regression).
- Slope guard alters output on flat-patch regression test → halt;
  back out.
- A Shau navmesh bake fails or NPC pathing along the once-flattened
  corridor regresses (NPC stuck-rate up > 50% on a smoke run) →
  halt; raise the slope guard threshold or revert the route-stamp
  change.
- Terrain bake budget exceeds existing headroom by > 20% → halt;
  the taper or slope guard is on the wrong path.
- Carry-over count grows → halt (Phase 0 rule).

## Reviewer Policy

- **`terrain-nav-reviewer` mandatory** on all three R1 PRs.
- **`combat-reviewer` not required** — no combat surface touched.
- Orchestrator reviews for: surface integrity, perf budget, no
  fence leak.

## Acceptance Criteria (cycle close)

**DEM edge taper:**
- In-DEM regression: byte-identical to today.
- Outside-DEM samples ramp C1-smoothly to baseline over
  `DEM_EDGE_TAPER_RADIUS_M`.
- Playwright capture of A Shau north-edge flyover shows no
  vertical fins.

**Route-stamp slope guard:**
- Flat-patch regression: byte-identical to today.
- 30° slope behavior test shows ≤ 10% flatten depth.
- Playwright capture of A Shau valley road shows no trench across
  hillside.
- NPC nav across the once-flattened corridor still completes
  (smoke test).

**A Shau water surface:**
- A Shau renders hydrology river without a global plane.
- Sampan spawn lands on the river.

**Other:**
- All R1 PRs merged with `terrain-nav-reviewer` APPROVE.
- Owner playtest sign-off recorded (deferred under autonomous-loop).
- No fence change.
- `KB-DEM-EDGE-TAPER` opened + closed in CARRY_OVERS.md.
- Stage **D3** marked closed in the cycle-2026-05-09-cdlod-edge-morph
  history log (one-line cross-reference appended to that archive
  brief's footer).

## Out of Scope

- New CDLOD stages beyond D3 (no D4 in plan).
- Heightmap streaming changes (separate concern).
- Hydrology bake changes (this cycle consumes existing bake, does
  not re-bake).
- Global water shader changes (cycle #5 closed VODA-1; further
  shader work is a separate cycle).
- Per-scenario fog tuning (cycle #1 of this campaign handles the
  sky-side fog issue).
- Vehicle HUD prompts / minimap markers (cycle #3 of this campaign).
- Touching `src/systems/combat/**`.
- Refactoring `DEMHeightProvider.ts` or `TerrainFlowCompiler.ts`
  beyond the diff this cycle needs.

## Open Questions (owner-default decisions pre-baked)

1. **DEM edge baseline elevation: 0 m, A Shau valley floor (~580 m),
   or a per-scenario configurable value?** **Default: 0 m sea level.**
   Visually clean for A Shau (long downhill into distance, looks
   correct for a valley descending to sea); player can't reach it
   so no gameplay impact. If owner prefers the taper land flat at
   valley floor, set `DEM_EDGE_BASELINE_M` per scenario.
2. **Slope guard threshold: 15° or steeper?** **Default: 15°.**
   Below 15° the corridor flatten still helps NPC nav (no trench
   risk on gentle ground). Above 15° real-DEM hillsides start to
   show visible cuts. The 5° softness band handles intermediate
   slopes.
3. **A Shau global water plane: keep coupled or decouple via new
   flag?** **Default: decouple.** A Shau valley floor at ~580 m
   makes a sea-level plane invisible and wasted; explicit decouple
   makes the configuration legible.
4. **Open Frontier slope guard: enable with default 30° or leave
   off?** **Default: enable at 30°.** Open Frontier is gentle; the
   guard almost never triggers, but defending the invariant on
   both scenarios is cheap.

## Carry-over impact

- New ID: `KB-DEM-EDGE-TAPER`. Cycle-open ID — opens at cycle
  launch, closes at cycle close. Closes Stage D3 of the
  cycle-2026-05-09-cdlod-edge-morph plan.
- **`KB-STARTUP-1`** stays active (terrain surface bake hardening) —
  this cycle's bake-budget headroom check is a partial probe but
  not the production-hardening pass that KB-STARTUP-1 represents.

Net cycle delta on active carry-over count: 0.
