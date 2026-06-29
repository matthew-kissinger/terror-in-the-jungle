# Carry-Overs Registry

Single source of truth for "what's still hanging." Every cycle must close at
least one carry-over OR ship a user-observable feature; the carry-over count
strictly decreases or holds. If a cycle ends with a higher count than it
started, the cycle is `INCOMPLETE` per the rule in
[docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md).

## Rules

1. **Append-only when opening.** Every carry-over gets an entry the cycle it
   first appears.
2. **Move to "Closed" when closed.** Do not delete. The closed list is the
   shrinking-progress audit trail.
3. **No more than 12 active.** If active count hits 12, no new cycle can open
   without closing one first.
4. **Cycles-open count auto-increments at cycle close.** A carry-over open
   ≥3 cycles is a yellow flag; ≥5 is a red flag and must surface in the next
   cycle's plan.
5. **Carry-overs track only items spanning ≥2 cycles** (framework recovery
   Pass 2 R2.2, 2026-05-20). A gap opened and closed inside a single cycle
   goes in the PR description as a user-observable gap line, NOT as a
   CARRY_OVERS entry. Enforced by `scripts/cycle-validate.ts <slug> --close`.
   Existing zero-cycle entries already in `Closed` (KB-SKY-LUT-BANDING,
   KB-DEM-EDGE-TAPER, VEKHIKL-UX-1, VEKHIKL-UX-2, VODA-OF-1,
   VEKHIKL-LAYOUT-1) are historical record and are NOT retroactively
   flagged; the rule applies only to new entries.

## Active

| ID | Title | Opened | Cycles open | Owning subsystem | Blocking? | Notes |
|----|-------|--------|------------:|------------------|-----------|-------|
| STABILIZAT-1 | combat120 baseline refresh blocked (measurement trust WARN) | cycle-2026-04-21-stabilization-reset | 25 | perf-harness | yes (blocks all baseline updates) | Refresh on a quiet machine after Phase 0 lint installs; pair with the artifact-prune CI. **Cycle #10 perf-analyst noted CI runs at measurement_trust=warn (GPU runner starvation; WebGL CONTEXT_LOST + WebGPU→WebGL2 fallback mid-capture); absolute p99 numbers untrustworthy until refresh. Expedite cycle #13.** **2026-06-01: the combat-side p99 lever — NPC convergence terrain-stall cost + oscillation — shipped via `task/combat-convergence-stall-fix` (contour re-score cache, serve-stale-on-throttle, hold dispersal, opt-in stagger); frame-time certification is what the quiet-machine refresh still owes. See [docs/state/perf-trust.md](state/perf-trust.md) 2026-06-01 update.** **2026-06-02: `perf-baselines.json` was removed from the repo; with no tracked baseline `perf:compare` prints raw latest-capture metrics and does not gate (the CI perf step is advisory). "Refresh" now means re-establishing a baseline via `perf:update-baseline` if/when the owner re-queues — this item stays open as the frame-time-certification gap, not a file-refresh task.** |
| AVIATSIYA-1 / DEFEKT-5 | Helicopter rotor + close-NPC + explosion human visual review pending | cycle-2026-04-23-debug-cleanup | 24 | aviation / combat | no | Resolves via human playtest gate (Phase 0 rule 20). |
| KB-LOAD residual | Pixel Forge candidate import (vegetation) deferred behind owner visual acceptance | cycle-2026-05-08-stabilizat-2-closeout | 22 | assets | no | Strategic Reserve. Reopen only with explicit "go". |
| KB-STARTUP-1 | Mode-start terrain surface bake production hardening | 2026-05-13 mode-startup spike | 18 | terrain / engine-init / perf-harness | yes (branch merge) | `task/mode-startup-terrain-spike` proves the stall is terrain CPU bake, not Recast/WASM cache. Needs Open Frontier + A Shau visual review of the coarse visual-margin source-delta cache before production acceptance. |
| cloudflare-stabilization-followups | Web Analytics token provisioned but not verified live | cycle-2026-05-10-zone-manager-decoupling | 20 | release / cloudflare | no | Code-side subfindings are fixed and deployed in the 2026-05-10 release-stewardship pass: PostCSS resolves to 8.5.14, `_headers` has HSTS/CSP/Permissions-Policy, `robots.txt` + meta description exist, and unused preload hints are removed. Remaining action is the Pages dashboard Web Analytics toggle + live beacon verification; Cloudflare API access in this session returned authentication error 10000. |

## Parked

Items intentionally de-prioritized but not closed. They remain owed work;
they just do not count against the ≤12 active rule while parked. To reactivate,
move the row back into the Active table and reset its `Cycles open` counter to
the cycle that re-opens it.

| ID | Title | Parked | Origin | Reason | Reactivate when |
|----|-------|--------|--------|--------|-----------------|
| AVIATSIYA-2 | AC-47 low-pitch takeoff single-bounce | 2026-05-12 vision-pivot park | cycle-2026-04-21-stabilization-reset (7 cycles open at park) | Helicopter / fixed-wing polish. Not vision-critical under the 2026-05-12 directions (WebGPU experimental + driveable land vehicles). Anchor at `Airframe` ground rolling. | Phase 4 F5 close-out resumes, or a fixed-wing-feature cycle opens. |
| AVIATSIYA-3 | Helicopter parity audit: HelicopterVehicleAdapter vs HelicopterPlayerAdapter | 2026-05-12 vision-pivot park | cycle-2026-04-22-heap-and-polish (7 cycles open at park) | Audit memo exists at `docs/rearch/helicopter-parity-audit.md`; work is documented, not actioned. Not vision-critical under the 2026-05-12 directions. | Phase 4 F5 close-out resumes, or the helicopter-adapter cluster is touched again. |

History log:

- 2026-06-28 — budget-ratchet admission (sks-rifle-wiring, Phase 4 Field
  Readiness): `src/systems/player/weapon/WeaponRigManager.ts` crossed the 700-LOC
  base limit (699→735 / 29 methods) and is admitted to the grandfather list.
  Cause: the SKS semi-auto runtime weapon type (+36 LOC) on top of the marksman
  DMR added the same cycle — the manager now wires nine weapons' rig load + spec
  + switching. Split target: extract the per-weapon spec/core/rig registry out of
  the manager (recorded in the entry's `round`/`reason`). Orchestrator-sanctioned
  admission per the budget policy; within-cycle growth, **no new carry-over** —
  the split-debt lives in `scripts/lint-source-budget.ts` like the other
  grandfathered god-modules. Carry-overs 5→5.

- 2026-06-28 — budget-ratchet re-base (route-corridor-exclusion, Phase 3 Field
  Readiness): `src/systems/terrain/TerrainFeatureCompiler.ts` snapshot raised
  764→767 LOC — the +3 LOC route veg-exclusion join block (the one-line merge of
  route corridors into the `vegetationExclusionZones` stream + a 2-line comment).
  Within-cycle growth, not a new carry-over; split target unchanged.

- 2026-06-28 — budget-ratchet re-base (seat-and-fire-cues): two
  already-grandfathered files grew minimally to surface multi-crew seat/fire
  cues. `src/systems/vehicle/FixedWingModel.ts` snapshot raised 1166→1191 LOC /
  51→52 methods — the airborne-gate feedback signal adds one consume-on-read
  getter (`consumeGroundedFireBlocked`) plus the grounded-trigger record branch
  and a structural HUD-sink poll, so the silent ground fire no-op now flashes an
  "Airborne to fire" hint. `src/ui/hud/HUDSystem.ts` snapshot raised 788→809 LOC
  / 85→86 methods — one HUD delegation method (`flashFixedWingAirborneHint`,
  mirror of the existing ammo delegation) plus seat-hint derivation wired into
  the existing `setVehicleContext`; the seat-cue logic itself lives in
  HudControlHints so only one method is added. Within-cycle growth, not a new
  carry-over; both split targets unchanged.

- 2026-06-15/16 — budget-ratchet stabilization re-base
  (dropped-frame-perf-harness): the dropped-frame harness/perf recovery branch
  intentionally grew several already-grandfathered orchestration, combat,
  terrain, renderer, and HUD files while adding telemetry, runtime proof
  surfaces, and targeted fixes. `src/core/GameEngineLoop.ts` and
  `src/systems/combat/CombatantCombat.ts` crossed the base LOC limit during
  that same stabilization window and are admitted to the grandfather list with
  split targets. This is an orchestrator re-base to get the branch green for
  deployment, not a closure of the underlying split debt; future work should
  extract helpers instead of raising these snapshots again.

- 2026-06-10 — budget-ratchet re-base (ashau-load-freeze):
  `src/systems/navigation/NavmeshSystem.ts` snapshot raised 808→833 LOC —
  pre-baked navmesh loads now route through the new time-sliced
  `PrebakedTiledNavmeshImporter` (fetch + tile-batched import extracted there)
  with per-phase startup marks and a loading-bar progress hook.
  `src/systems/terrain/TerrainSystem.ts` snapshot raised 898→904 LOC /
  69→75 methods — six `markStartup` statements bracketing the
  `propagateTerrainSourceChanges` phases; this instrumentation attributed the
  ~47s A Shau mode-load freeze to the stamped-provider gameplay-grid bake
  (fixed the same day by `StampSpatialIndex`; the methods delta is the
  heuristic miscounting those statement lines, not new methods). Within-cycle
  growth, not a new carry-over; both split targets unchanged. Related:
  KB-STARTUP-1's "stall is terrain CPU bake" finding is now root-caused to
  the per-sample all-stamps loop and fixed (47.2s→68ms main-thread,
  15.7s→95ms worker, measured via startup telemetry on the built bundle).

- 2026-06-09 — budget-ratchet re-base (per-aircraft-ordnance,
  cycle-2026-06-09-fixed-wing-craft): `src/systems/vehicle/FixedWingModel.ts`
  snapshot raised 1155→1163 LOC / 48→51 methods. Per-airframe ordnance
  (A-1 wing cannons, F-4 nose rotary, AC-47 broadside) — the bulk weapon table
  was EXTRACTED to the new sibling `src/systems/vehicle/FixedWingArmament.ts`
  (net new module, not in-file growth); the in-file delta is the per-airframe
  config plumbing + the new `getWeaponName` getter. Within-cycle growth, not a
  new carry-over; R4 split target unchanged.
- 2026-06-09 — budget-grandfather note (orchestrator): `src/core/StartupPlayerRuntimeComposer.ts`
  admitted to the lint-source-budget grandfather list at 739 LOC. The prod
  composition point absorbed the seated-weapon lifecycle (tank cannon + M2HB),
  the m2hb HUD panel host, and the NPC tank-gunner wire + single-owner
  stepping gate inside the 2026-06-09 cycle window. Not a carry-over entry
  (within-cycle growth); factor into a composition split when it next grows.
- 2026-05-12 — vision-pivot park: AVIATSIYA-2 and AVIATSIYA-3 moved Active → Parked
  to free slots in the active-list budget for the WebGPU (KONVEYER-11 successor
  IDs) and driveable-land-vehicle (VEKHIKL-3 successor IDs) directions confirmed
  by the owner on 2026-05-12. No status change for the two items themselves.
- 2026-05-12 — master-merge close: KONVEYER-10 moved Active → Closed via
  [PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
  (commit `1df141ca`), which folded the `exp/konveyer-webgpu-migration` branch
  into `master`. Active count: 9 → 8.
- 2026-05-16 — `cycle-2026-05-16-mobile-webgpu-and-sky-recovery` launch:
  KB-MOBILE-WEBGPU and KB-SKY-BLAND opened from the owner's 2026-05-15
  post-WebGPU-merge playtest observations (mobile unplayable, sky bland).
  Both opened by the investigation cycle's launch PR; both close at cycle
  end with "promoted to fix cycle <fix-slug>" resolution. Active count
  9 → 11 → 9 (net 0).
- 2026-05-16 — `cycle-2026-05-16-mobile-webgpu-and-sky-recovery` close:
  KB-MOBILE-WEBGPU and KB-SKY-BLAND moved Active → Closed via the R2
  alignment memo at
  [docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md).
  Fix work tracked under `cycle-sky-visual-restore` (KB-SKY-BLAND) and
  `cycle-mobile-webgl2-fallback-fix` (KB-MOBILE-WEBGPU); both queued in
  [docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](archive/CAMPAIGN_2026-05-13-POST-WEBGPU.md).
  Active count: 11 → 9 (back to cycle-start level; net cycle delta 0).
- 2026-05-13 — mode-startup spike: KB-STARTUP-1 opened from the user-reported
  "mode selection takes forever" issue. `task/mode-startup-terrain-spike`
  moved terrain surface baking off the mode-click main-thread path and proved
  the cache/Recast path was not the blocker. Active count: 8 → 9.
- 2026-05-16 — `cycle-sky-visual-restore` close (autonomous-loop posture):
  shipped the KB-SKY-BLAND fix as 3 R1 PRs (#208, #210, #209). KB-SKY-BLAND
  Closed entry updated above with merge SHAs and screenshot evidence path.
  Owner playtest deferred to [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md);
  merge gated on CI green + orchestrator memo APPROVE per posture rule.
  No active carry-over churn (KB-SKY-BLAND already in Closed at cycle start).
  Active count: 9 → 9 (no change).
- 2026-05-16 — `cycle-mobile-webgl2-fallback-fix` close (autonomous-loop posture):
  shipped the KB-MOBILE-WEBGPU fix as 9 PRs across 3 rounds. KB-MOBILE-WEBGPU
  Closed entry updated above with all 9 merge SHAs + harness script + close-
  validation memo path. Real-device walk-through deferred to
  [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md) (3rd active deferral row).
  Active count: 9 → 9 (no change; KB-MOBILE-WEBGPU was already in Closed
  from the prior investigation cycle).
  Out-of-band ci(mobile-ui) matrix fan-out commit `47c42216` also landed
  during the cycle, root-cause-fixing the 30-minute mobile-ui CI timeout
  flake (BACKLOG retro nit closed: 4 devices were running sequentially
  at ~12 min each = 48 min total against a 30-min ceiling; matrix fans
  to 4 parallel jobs at ~3-10 min wall time each).
- 2026-05-16 — `cycle-konveyer-11-spatial-grid-compute` close (autonomous-loop posture):
  shipped DEFEKT-3 fix as 3 R1 PRs (#220 `9a02714a` CoverSpatialGrid foundation,
  #221 `a5b5bcd6` AIStateEngage consumer, #222 `8d12ede5` integration test).
  R2 GPU-compute prototype skipped — R1 wins meet acceptance bars
  (`Combat.AI` peak dropped from ~954ms documented baseline to zero >100ms
  hitches over 5939 frames; combat_budget_dominance dropped to 0% from prior
  spike pattern; p99 +3.0% vs baseline, under 5% hard-stop). DEFEKT-3 moved
  Active → Closed. Active count: 9 → 8.
- 2026-05-16 — `cycle-vekhikl-1-jeep-drivable` close (autonomous-loop posture):
  shipped VEKHIKL-1 code-complete as 5 PRs across 2 rounds. R1: #223
  GroundVehiclePhysics (hand-rolled fixed-step rigid-body sim per
  GROUND_VEHICLE_PHYSICS memo; FixedStepRunner; four wheel samples
  conformed to ITerrainRuntime; Ackermann steering kinematics; explicit
  Euler with exponential damping), #224 GroundVehiclePhysics tests
  (post stub→real swap, 7 behavior tests against real impl). R2: #226
  GroundVehiclePlayerAdapter (W/S throttle, A/D steer, Space brake, F
  enter/exit, third-person follow), #227 M151 integration (existing
  motor_pool prefab spawn points satisfy "visible on both modes"; the
  documented no-op VehicleManager.update was fanned out to vehicle.update
  to actually step ground vehicles), #225 playtest evidence + capture
  script + PLAYTEST_PENDING row. VEKHIKL-1 in DIRECTIVES.md moved Open →
  code-complete (full `done` promotion blocks on owner walk-through
  deferred to PLAYTEST_PENDING). No carry-over delta (VEKHIKL-1 lives in
  DIRECTIVES.md, not CARRY_OVERS Active). Active count: 8 → 8.
- 2026-05-17 — `cycle-vekhikl-2-stationary-weapons` close (autonomous-loop posture):
  shipped VEKHIKL-2 code-complete as 6 PRs across 3 rounds (one R2 iteration
  after combat-reviewer CHANGES-REQUESTED → APPROVE). R1: #233 `0096d825`
  Emplacement IVehicle surface, #234 `917d83df` EmplacementPlayerAdapter.
  R2: #235 `c9725b76` playtest-evidence (docs + capture script +
  PLAYTEST_PENDING row, deferred under autonomous-loop posture), #237
  `0732beaa` m2hb-weapon-integration, #236 `afa90775` emplacement-npc-gunner
  (mount via orderBoard + cached emplacement scan after reviewer note).
  R3: #238 `78c9c55a` system bootstrap wiring (M2HBEmplacementSystem
  registration + scenario spawns at Open Frontier US base + A Shau NVA
  bunker overlook). VEKHIKL-2 in DIRECTIVES.md moved Open → code-complete
  (full `done` promotion blocks on owner walk-through deferred to
  PLAYTEST_PENDING). No fence change (VehicleCategory extension stayed
  inside the IVehicle module per INTERFACE_FENCE.md). No carry-over delta
  (VEKHIKL-2 lives in DIRECTIVES.md, not CARRY_OVERS Active). Active count:
  8 → 8.

  Cycle #13 `cycle-sun-and-atmosphere-overhaul` queued in
  [docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](archive/CAMPAIGN_2026-05-13-POST-WEBGPU.md)
  at position #12 (inserted between cycle #11 defekt-4 and the renumbered
  cycle #13 baselines-refresh) per
  [docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md](rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md)
  recommendation (sun-and-atmosphere visual + perf cost lands BEFORE
  baseline refresh so the +0.5-1ms p99 sky cost becomes the new normal).
  Cycle #13 absorbs the HosekWilkieSkyBackend half of `konveyer-large-file-splits`
  (notes column in the Active table updated to reflect cycle #13 closure
  condition). `Cycles open` for `konveyer-large-file-splits` bumped 1 → 2.
- 2026-05-16 — `cycle-voda-1-water-shader-and-acceptance` close (autonomous-loop posture):
  shipped VODA-1 code-complete as 5 PRs across 2 rounds + the WaterSystem
  half of `konveyer-large-file-splits`. R1: #228 terrain-water intersection
  mask + foam line (opt-in, default-off binding; pre-VODA-1 visuals byte-
  identical when unbound; terrain-nav-reviewer APPROVE), #229 production
  water surface shader (`MeshStandardMaterial` + `onBeforeCompile` chosen
  over TSL node material to preserve `?renderer=webgl` escape hatch and
  avoid the mobile node-material cost regression; composed with #228's
  foam patch into single `installWaterMaterialPatches()` at rebase time).
  R2: #231 hydrology river flow visuals (per-vertex `aFlowDir`/`aFoamMask`
  attributes + `installHydrologyRiverFlowPatch` shader patch; foam mask
  composes narrownessFoam at flowFactor<0.6 + slopeFoam at 5% rise/run),
  #232 WaterSystem.ts split (1125 → 300 LOC orchestrator + 5 modules:
  HydrologyRiverSurface 144, HydrologyRiverGeometry 222, HydrologyRiverFlowPatch
  178, WaterSurfaceBinding 299, WaterSurfaceSampler 146 — all ≤300 LOC;
  the 5-file outcome from the 3-file plan was forced by integrating #231's
  flow-patch logic at rebase time; grandfather entry removed from
  `scripts/lint-source-budget.ts`; 11 existing WaterSystem.test.ts pass
  byte-identical; +17 new sibling tests across the 3 originally-planned
  modules), #230 playtest evidence + capture script + PLAYTEST_PENDING row.
  No `WebGLRenderTarget` reflection pass added anywhere (mobile no-RT win
  preserved). VODA-1 in DIRECTIVES.md moved Open → code-complete (full
  `done` promotion blocks on owner walk-through deferred to PLAYTEST_PENDING).
  `konveyer-large-file-splits` water half closed; sky half remains active
  pending TSL fragment-shader sky port. Active count: 8 → 8 (no churn —
  carry-over notes column updated, sky still active).
- 2026-05-17 — `cycle-voda-2-buoyancy-swimming-wading` close (autonomous-loop posture):
  shipped VODA-2 code-complete as 7 PRs across 2 rounds. R1: [#239](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/239)
  `89365f4c` buoyancy-physics (new BuoyancyForce module under
  src/systems/environment/water [stripped 2026-06-09, rework pending]
  + sibling test; `applyBuoyancyForce(body, dt, waterSystem)` reads
  `sampleWaterInteraction(body.position)` and applies upward force
  proportional to `buoyancyScalar × volume × g` with denser-medium
  damping; behavior tests cover neutral float, sink, surface, dampened
  oscillation), [#240](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/240)
  `98ffeabc` npc-wade-behavior (CombatantMovement speed scales with
  `1 - immersion01 × 0.6` in shallow water; nav cost up-weight verified
  on water tiles; combat-reviewer APPROVE), [#241](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/241)
  `83415458` player-swim-and-breath (PlayerMovement branches on
  `sampleWaterInteraction(playerPos).submerged` → swim mode with WASD +
  Space up + Ctrl down + depth-proportional drag; PlayerHealthSystem
  breath timer at head position, gasp + damage past 45 s; new
  PlayerSwimState module; HUD breath gauge). R2: [#242](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/242)
  `2496b4e1` water-sampler-composer-wiring (activates the dormant R1
  consumers by wiring the NPC water sampler adapter through the system
  composer), [#245](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/245)
  `163ecb73` river-flow-gameplay-current (extends BuoyancyForce with
  horizontal flow force from hydrology channel direction × magnitude ×
  body drag; visible swim-perpendicular drift in A Shau river per playtest
  capture), [#244](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/244)
  `0b24a19f` wade-foot-splash-visuals (new WadeSplashEffect module under
  src/systems/effects [stripped 2026-06-09, rework pending]
  triggered on footstep when `immersion01 ∈ [0.1, 0.5]`; reuses existing
  impact-effects pool, no perf regression), [#243](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/243)
  `47e394c2` voda-2-playtest-evidence (`docs/playtests/cycle-voda-2-buoyancy-swimming-wading.md`
  + capture script + PLAYTEST_PENDING row, deferred under autonomous-loop
  posture). VODA-2 in DIRECTIVES.md moved Open → code-complete (full
  `done` promotion blocks on owner walk-through deferred to
  PLAYTEST_PENDING per autonomous-loop posture). No fence change
  (`sampleWaterInteraction` contract consumed, not modified). No
  carry-over delta (VODA-2 lives in DIRECTIVES.md, not CARRY_OVERS
  Active). Active count: 8 → 8.
- 2026-05-17 — `cycle-vekhikl-3-tank-chassis` close (autonomous-loop posture):
  shipped VEKHIKL-3 chassis half code-complete as 5 PRs across 2 rounds.
  R1: [#246](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/246)
  `6ab6ade5` tracked-vehicle-physics-core (new
  `src/systems/vehicle/TrackedVehiclePhysics.ts` per
  `docs/rearch/TANK_SYSTEMS_2026-05-13.md`; skid-steer kinematics
  with W/S throttle + A/D turn → independent L/R track speeds via
  `smoothControlInputs` lerp; four-corner ground conform through
  `ITerrainRuntime`; tracks-blown state zeroes forward velocity
  contribution; fixed 1/60 s step via `FixedStepRunner`; reuses the
  `GroundVehiclePhysics` integration loop shape with skid-steer
  substituted for Ackermann),
  [#247](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/247)
  `23410433` tracked-vehicle-physics-tests (7 L2 behavior tests:
  pure forward throttle → forward motion + zero yaw, pure turn
  axis → in-place pivot, throttle+turn combined, chassis tilt on
  slope per-corner ground sample, tracks-blown immobilization,
  slope-stall scaling, input smoothing → no instantaneous jump).
  R2: [#249](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/249)
  `bc4ec779` vekhikl-3-playtest-evidence (`docs/playtests/cycle-vekhikl-3-tank-chassis.md`
  + capture script + PLAYTEST_PENDING row, deferred under
  autonomous-loop posture),
  [#250](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/250)
  `a08b878a` m48-tank-integration (new `src/systems/vehicle/Tank.ts`
  IVehicle impl + `m48-config.ts` chassis dims/mass/track speed cap;
  `VehicleManager` registration; M48 spawns on Open Frontier US base
  + A Shau valley road; `update(dt)` delegates to
  `TrackedVehiclePhysics.step()`),
  [#248](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/248)
  `a11c1ddf` tank-player-adapter (new
  `src/systems/vehicle/TankPlayerAdapter.ts` mirroring
  `GroundVehiclePlayerAdapter` with skid-steer input model: W/S
  throttle, A/D turn — NOT steer angle, F enter/exit, player seat =
  `'pilot'`, external orbit-tank third-person camera for the
  chassis-only slice; turret first-person comes in cycle #9; stub
  was swapped to the real Tank instance in the merge commit
  `a11c1ddf`). VEKHIKL-3 in DIRECTIVES.md moved Open →
  code-complete-partial (chassis half complete; turret + cannon
  awaits cycle #9 `cycle-vekhikl-4-tank-turret-and-cannon` for full
  close). Owner playtest deferred to
  [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md) under
  autonomous-loop posture. No fence change (`VehicleCategory` /
  `SeatRole` extensions stayed inside the IVehicle module per
  INTERFACE_FENCE.md). No external physics library added (per
  ENGINE_TRAJECTORY addendum + TANK_SYSTEMS §"Decision"). No
  carry-over delta (VEKHIKL-3 lives in DIRECTIVES.md, not
  CARRY_OVERS Active). Active count: 8 → 8.
- 2026-05-17 — `cycle-vekhikl-4-tank-turret-and-cannon` close (autonomous-loop posture):
  8 PRs shipped (#251 #252 #253 #254 #255 #256 #257 #258). VEKHIKL-3 + VEKHIKL-4 closed
  in `docs/DIRECTIVES.md`. Net active-list delta 0 (carry-overs unchanged at 8). Owner
  walk-through deferred to `docs/PLAYTEST_PENDING.md`. Rust→WASM pilot result documented
  as KEEP-INCONCLUSIVE (1.79x speedup, 8.92 KB gz — under both gates so kept per brief
  rule). Kill-attribution gap from prior cycle closed via shared CombatantSystemDamage
  handler routing.
- 2026-05-18 — `cycle-voda-3-watercraft` close (autonomous-loop posture):
  6 PRs shipped (#259 #260 #261 #262 #263 #264). VODA-3 closed in docs/DIRECTIVES.md.
  Net active-list delta 0 (carry-overs unchanged at 8). Owner walk-through deferred
  to docs/PLAYTEST_PENDING.md. Sampan + PBR watercraft both drivable; PBR M2HB twin
  mounts fire with world-space-correct aim (fixed a latent local-only-forward bug
  in M2HBEmplacement + EmplacementPlayerAdapter + NpcM2HBAdapter — cycle-#6
  ground-fixed emplacements unchanged via identity-quaternion no-op). Water sampler
  wiring deferred to a follow-up. Perf CI measurement_trust=warn (GPU runner
  starvation) — not a regression; cycle #13 baselines-refresh expedited.
- 2026-05-18 — `cycle-defekt-4-npc-route-quality` close (autonomous-loop posture):
  shipped DEFEKT-4 closure as 3 PRs across R1/R2. R1:
  [#265](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/265)
  `df84a870` npc-slope-stuck-recovery (new `SlopeStuckDetector.ts` +
  `evaluateSlopeStuckRecovery` helper in `CombatantMovement.ts`;
  `SLOPE_STALL_TIME_MS=1500` triggers a recovery state that yields to
  gravity slide downhill via `SLOPE_SLIDE_STRENGTH=8.0` until on
  walkable slope, then re-acquires pathing; behavior tests cover
  steep-slope transition within budget),
  [#266](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/266)
  `aac0e519` navmesh-crowd-reenable (re-enabled Recast crowd surface
  as layered direction-only consumer via `applyAgentSteeredDirection`;
  `MAX_CROWD_AGENTS=64`; high-LOD gated; original disable was a
  structural unregister-every-tick at commit `7487b693`, not a flag;
  scenario test catches regression if disable is re-applied; perf
  inside the ≤2 ms additional per nav step budget). R2:
  [#267](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/267)
  `4f505661` terrain-solver-stall-fix (wall-clock accumulator on
  `(contourActivated && lowProgress)` crossing
  `NPC_CONTOUR_STALL_REROUTE_MS=1200`; high-LOD only; backtrack-
  suppressed via `movementBacktrackPoint` (not intent); drops cached
  navmesh path so next tick re-queries; helper
  `evaluateTerrainStallReroute` in `CombatantMovement.ts`; new
  optional field `Combatant.movementContourStallMs`; behavior test
  verifies A Shau valley traversal without stop-and-go). All three
  PRs received `terrain-nav-reviewer` APPROVE pre-merge. DEFEKT-4
  moved Active → Closed. Active count: 8 → 7.
- 2026-05-20 — `campaign-2026-05-19-visual-and-wayfinding` close
  (autonomous-loop posture, parallel campaign): three parallel
  cycles closed in one campaign-close commit. 11 PRs merged. Three
  zero-cycle carry-overs opened+closed in-cycle (KB-SKY-LUT-BANDING
  by cycle-skylut-resolution-bump; KB-DEM-EDGE-TAPER by
  cycle-ashau-edge-and-flow-tuning; VEKHIKL-UX-1 by
  cycle-vehicle-wayfinding-and-prompts). Cycle 2 also closed Stage
  D3 of cycle-2026-05-09-cdlod-edge-morph (the deferred DEM edge
  taper). All `terrain-nav-reviewer` passes APPROVE or
  APPROVE-WITH-NOTES (one CHANGES-REQUESTED on PR #275's first pass
  for missing worker-side parity, re-dispatch APPROVE). Net active
  count delta: 0 (active list unchanged at 6). Owner playtests
  deferred across all three cycles per posture rule, rows appended
  to [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md). Hold-list
  promotion (`cycle-vekhikl-5-fleet-expansion`,
  `cycle-sky-screen-space-quad`) remains owner-gated on the
  deferred playtests; not auto-promoted at this close.
- 2026-05-20 — `campaign-2026-05-20-vehicle-boarding-and-water` queue
  (autonomous-loop posture, parallel campaign, pre-dispatch). Three
  parallel cycles queued from a 2026-05-20 owner walk + codebase
  audit. None of the per-category player adapters
  (`GroundVehiclePlayerAdapter`, `TankPlayerAdapter`,
  `WatercraftPlayerAdapter`, `EmplacementPlayerAdapter`) are
  constructed by production code, and no
  `VehicleSessionController.enterVehicle('ground' | 'tank' |
  'watercraft' | 'emplacement', _, _)` call exists — only the
  helicopter + fixed_wing categories have working boarding glue,
  even though five drivable vehicle types ship in master. Cycle #1
  `cycle-vekhikl-player-boarding-wire` wires the missing glue
  (opens+closes VEKHIKL-UX-2). Cycle #2
  `cycle-of-river-surface-enable` flips OF `waterEnabled: true` +
  adds water-surface spawn snap for Sampan + PBR; the 2026-05-20 water
  polish pass later supersedes the global-plane assumption and makes
  hydrology river surfaces the accepted OF/A Shau water path
  (opens+closes VODA-OF-1). Cycle #3
  `cycle-motor-pool-reflow-and-tank-dedup` reflows
  `motor_pool_heavy` placements and relocates the OF M48 scenario
  spawn into the motor pool while removing the duplicate dressing
  M48 (opens+closes VEKHIKL-LAYOUT-1). Each ID is zero-cycle. Net
  projected delta at campaign close: 0 (active list stays at 6).
  Hold-list additions: `cycle-vekhikl-seat-swaps` (M48 + PBR pilot↔
  gunner swap; gated on the boarding cycle's playtest evidence).
  Campaign closes only after production deploy completes — explicit
  owner ask "make sure water is proper in production as well".
- 2026-05-20 — `campaign-2026-05-20-vehicle-boarding-and-water` close
  (autonomous-loop posture, parallel campaign). All three cycles
  closed in one campaign-close commit. **15 PRs merged across the
  three cycles** (cycle #1 boarding: 8 PRs; cycle #2 OF water: 4 PRs;
  cycle #3 motor pool: 3 PRs). Three zero-cycle carry-overs
  opened+closed in-campaign (VEKHIKL-UX-2, VODA-OF-1,
  VEKHIKL-LAYOUT-1). Production deploy gate fired against master tip
  `e99be58e` via `gh workflow run deploy.yml --ref master` (deploy
  run `26182116715` → success). Mid-campaign hard-stop in cycle #1
  R1 (3 of 5 executors terminated at ≥90k tokens) handled via
  tighter-prompt re-dispatch + split of the largest task into a
  factory module + handler/composer wire. Intermittent sandbox blocked
  git commit/push from 3 worktrees — orchestrator-side push from the
  main session unblocked each (flagged in
  [docs/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md](archive/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md)
  as a ~30% incidence framework gap). Owner playtests deferred under
  autonomous-loop posture; rows in
  [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md) for all three
  cycles. Hold-list intact: `cycle-vekhikl-seat-swaps`,
  `cycle-vekhikl-5-fleet-expansion`, `cycle-sky-screen-space-quad`,
  `cycle-stabilizat-1-baselines-refresh` remain owner-gated. Active
  count: 6 → 6 (zero net change).

## Closed

(Entries get appended here as carry-overs close. Format: `<ID> | <title> | closed in <cycle-id> | resolution one-liner`.)

- worldbuilder-invulnerable-wiring | `PlayerHealthSystem.takeDamage` early-return when WorldBuilder `invulnerable` flag active | closed in cycle-2026-05-09-doc-decomposition-and-wiring | wired in `src/systems/player/PlayerHealthSystem.ts` behind `import.meta.env.DEV`; behavior test in `PlayerHealthSystem.test.ts`.
- worldbuilder-infinite-ammo-wiring | `AmmoManager` / `WeaponShotExecutor` skip decrement when `infiniteAmmo` flag active | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `AmmoManager.consumeRound()` returns true without decrement when flag active; new `AmmoManager.test.ts` covers the no-op.
- worldbuilder-noclip-wiring | `PlayerMovement` skip terrain collision + gravity when `noClip` flag active | closed in cycle-2026-05-09-doc-decomposition-and-wiring | gated gravity / sandbag / terrain-block / ground-snap / world-boundary in `PlayerMovement.simulateMovementStep`; behavior tests in `PlayerMovement.test.ts`.
- worldbuilder-postprocess-wiring | `PostProcessingManager.setEnabled` consumed by WorldBuilder `postProcessEnabled` flag | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `PostProcessingManager.beginFrame/endFrame` consult `getWorldBuilderState()`; tests recordingrenderer assertions.
- worldbuilder-tod-wiring | AtmosphereSystem honors WorldBuilder `forceTimeOfDay` (-1 = follow live) | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `AtmosphereSystem.update` snaps `simulationTimeSeconds` to `forceTimeOfDay * dayLengthSeconds` when in [0,1] and the active preset has a `todCycle`.
- worldbuilder-ambient-audio-wiring | AudioManager consumes WorldBuilder `ambientAudioEnabled` flag | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `AudioManager.update` calls `ambientManager.setVolume(0)` on flag-flip-down and `setVolume(1)` on flip-up; idempotent across steady ticks.
- artifact-prune-baseline-pin-fix | `artifact-prune` baseline-pin matching accepts both bare perf-baseline directory names and `artifacts/perf/` paths | closed in release-stewardship-2026-05-10 | fixed by `a9ebfbe` with source update in `scripts/artifact-prune.ts`.
- worldbuilder-oneshotkills-wiring | `oneShotKills` WorldBuilder flag wired into NPC/projectile combat damage | closed in release-stewardship-2026-05-10 | fixed by `a9ebfbe` in `CombatantCombat` and `CombatantSystemDamage`, with behavior tests.
- perf-doc-script-paths-drift | perf docs and asset acceptance references updated from retired `scripts/projekt-143-*` paths to retained commands/archive paths | closed in release-stewardship-2026-05-10 | fixed by `a9ebfbe` across `docs/perf/*` and `docs/ASSET_ACCEPTANCE_STANDARD.md`.
- KONVEYER-10 | Rest-of-scene WebGPU parity and frame-budget attribution after K0-K9 branch-review completion | closed in 2026-05-12 master-merge (PR #192) | `exp/konveyer-webgpu-migration` merged into `master` via [PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192) (commit `1df141ca`); WebGPU + TSL becomes the default production renderer with WebGL2 fallback. R2-R4 follow-on materialization work queued as separate cycles on master.
- KB-MOBILE-WEBGPU | Mobile is unplayable post-WebGPU-merge; was playable on WebGL pre-merge | closed in cycle-2026-05-16-mobile-webgpu-and-sky-recovery (investigation) + fix shipped in cycle-mobile-webgl2-fallback-fix | Investigation pinned root cause to TSL-fragment-cost regression on WebGPURenderer's WebGL2 backend. **Fix landed via 9 PRs across 3 rounds in `cycle-mobile-webgl2-fallback-fix`**: R1 [#213](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/213) `6e7a8879` terrain-tsl-biome-early-out + [#211](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/211) `9e1ccab5` terrain-tsl-triplanar-gate + [#212](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/212) `0b3b749d` render-bucket-telemetry-fix; R2 [#215](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/215) `99044966` mobile-pixel-ratio-cap + [#214](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/214) `ca725369` mobile-skip-npc-prewarm + [#216](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/216) `706ad344` mobile-sky-cadence-gate + [#217](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/217) `83fb9fb0` asset-audio-defer; R3 [#218](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/218) `ff87e635` tsl-shader-cost-probe + [#219](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/219) `a81d8cda` real-device-validation-harness. Plus the out-of-band CI fix [`47c42216`](https://github.com/matthew-kissinger/terror-in-the-jungle/commit/47c42216) matrix-fan-out mobile-ui job (root-cause-fixed the 30-min timeout flake; wall time 30+ min → 3-10 min per device parallel). Asset-audio-defer measured `modeClickToPlayableMs` 19,341ms → 11,349ms (−7,992ms). Real-device walk-through deferred to [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md) under autonomous-loop posture; harness script `scripts/real-device-validation.ts` ready for owner-attach run; close-validation memo at [docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/cycle-close-validation.md](rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/cycle-close-validation.md). Alignment memo: [docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md).
- KB-SKY-BLAND | Sky / clouds look bland on master post-WebGPU-merge | closed in cycle-2026-05-16-mobile-webgpu-and-sky-recovery (investigation) + fix shipped in cycle-sky-visual-restore | Investigation complete; root cause is visual-fidelity loss (not perf): 128×64 CPU-baked `DataTexture` replaced per-fragment Preetham `ShaderMaterial`, HDR clamped to [0,1] at bake time, missing `toneMapped: false` routes dome through ACES, sun-disc normalised to peak 1.0 kills HDR pearl. **Fix landed via three R1 PRs in `cycle-sky-visual-restore`**: [#208](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/208) `2118177f` (toneMapped:false + 256×128 LUT), [#210](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/210) `3455fa96` (HalfFloatType HDR LUT + drop [0,1] clamp + ceiling 8→64), [#209](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/209) `9e1ce7c7` (additive HDR sun-disc sprite). Owner walk-through deferred under autonomous-loop posture; Playwright smoke screenshots under `artifacts/cycle-sky-visual-restore/playtest-evidence/` (5 PNGs: dome-noon, hdr-{webgpu,webgl}, sun-disc-{noon,nadir}); deferral tracked in [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md). Alignment memo: [docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md).
- DEFEKT-3 | Combat AI p99 — synchronous cover search in `AIStateEngage.initiateSquadSuppression` | closed in cycle-konveyer-11-spatial-grid-compute | **R1 spatial grid landed via 3 PRs**: [#220](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/220) `9a02714a` (CoverSpatialGrid 282 LOC + 277 LOC tests, 8m cells, deterministic order, queryNearest + queryWithLOS), [#221](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/221) `a5b5bcd6` (AIStateEngage routes flank-cover scan through structural `CoverGridQuery` interface; preserves 2-search cap + reuse; adds `engage.suppression.initiate.coverGridQuery` Phase F sub-marker + `suppressionFlankCoverGridHits/Misses` telemetry), [#222](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/222) `8d12ede5` (L3 integration test `src/integration/combat/cover-grid-suppression.test.ts`, perf budget p99 ≤ 5ms with ~190x margin vs ~954ms baseline). Post-merge `combat120` capture at `8d12ede5`: avg_frame 15.54ms (PASS), peak_p99 34.40ms (+3.0% vs baseline 33.4ms, under 5% hard-stop), **combat_budget_dominance 0% (Combat never topped 16.67ms vs pre-R1 954ms peak)**, **hitch_100ms_percent 0% in 5939 frames (vs documented 954ms baseline)**. R2 GPU-compute prototype skipped per brief's skip condition — R1 wins meet ≥3x avg drop + ≥10x peak drop bars. Artifact: `artifacts/perf/2026-05-16T19-32-35-293Z/`.
- DEFEKT-4 | NPC route-follow quality not signed off (slope-stuck, navmesh crowd disabled, terrain solver stalls) | closed in cycle-defekt-4-npc-route-quality | **3 PRs across R1/R2, all `terrain-nav-reviewer` APPROVE pre-merge**: R1 [#265](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/265) `df84a870` npc-slope-stuck-recovery (new `SlopeStuckDetector.ts` + `evaluateSlopeStuckRecovery` in `CombatantMovement.ts`; `SLOPE_STALL_TIME_MS=1500` triggers recovery via `SLOPE_SLIDE_STRENGTH=8.0` gravity slide downhill until on walkable slope, then re-acquires pathing target; behavior test verifies steep-slope recovery transition within budget), [#266](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/266) `aac0e519` navmesh-crowd-reenable (re-enabled Recast crowd as layered direction-only consumer via `applyAgentSteeredDirection`; `MAX_CROWD_AGENTS=64`; high-LOD gated; original disable was structural unregister-every-tick at commit `7487b693`, not a flag; perf inside ≤2 ms additional per nav step budget). R2 [#267](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/267) `4f505661` terrain-solver-stall-fix (wall-clock accumulator on `(contourActivated && lowProgress)` crossing `NPC_CONTOUR_STALL_REROUTE_MS=1200`; high-LOD only; backtrack-suppressed via `movementBacktrackPoint` not intent; drops cached navmesh path so next tick re-queries; helper `evaluateTerrainStallReroute` in `CombatantMovement.ts`; new optional `Combatant.movementContourStallMs` field; A Shau valley traversal without stop-and-go verified by behavior test). Active count: 8 → 7. No fence change.
- VEKHIKL-UX-2 | Player F-key boarding never wired — all five drivable vehicles (M151, M48, Sampan, PBR, M2HB) unenterable despite 2026-05-19 wayfinding cycle shipping the "Press F to board" HUD prompt | opened+closed in cycle-vekhikl-player-boarding-wire (zero-cycle) | **8 PRs across R1 (with split) + R2**: [#288](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/288) ground-adapter wire (M151), [#289](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/289) tank-adapter wire (M48 pilot seat), [#293](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/293) input-router with mortar fallback (retry; original cycle #1 R1 task #3 terminated mid-thought; "no-vehicle-in-6m → onMortarFire" path is the load-bearing fallback), [#296](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/296) watercraft + emplacement wire (Sampan + PBR + M2HB), [#297](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/297) factory-module-only (split A retry; split out of the original controller-factory task to fit executor context budget), [#298](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/298) handler + composer wire (split B retry), [#299](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/299) SystemUpdater wire (proximity checker registration for live game loop), [#300](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/300) L3 cross-category integration test (7/7 assertions, real factory + proximity checker + session controller against all 5 categories, zero stubs at unit-under-test layer) + playtest evidence (`docs/playtests/cycle-vekhikl-player-boarding-wire.md` + 15-shot capture script + PLAYTEST_PENDING row). Mortar fire stays on F via the fallback router (regression sentinel). Pilot seat only — M48 + PBR gunner swaps deferred to `cycle-vekhikl-seat-swaps` hold list. Cycle #1 R1 mid-cycle hard-stop (3 of 5 executors terminated at ≥90k tokens) handled via tighter-prompt re-dispatch + task split; flagged in [docs/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md](archive/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md). Active count: 6 → 6 (zero-cycle).
- VODA-OF-1 | Open Frontier hydrology river surface not rendered (`waterEnabled: false` on `OpenFrontierConfig`); OF Sampan + PBR sit on dry terrain | opened+closed in cycle-of-river-surface-enable (zero-cycle) | **4 PRs across R1 + R2**: [#286](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/286) `of-water-config-flip` flipped `waterEnabled: true` on `OpenFrontierConfig.ts` (mandatory `terrain-nav-reviewer` APPROVE; the old global sea-level plane assumption is superseded by the 2026-05-20 water polish pass, which makes hydrology river surfaces the accepted OF/A Shau water path and leaves the global plane opt-in only), [#291](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/291) `of-water-spawn-snap-resolver` snapped OF Sampan + PBR spawns to the water-surface Y at scenario load (handles Sampan + PBR independently because watercraft physics expects the hull to start on the surface, not 0 m above), [#292](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/292) `of-water-capture-pair` Playwright pre/post capture (post-captures stale at write time — captured before #286/#291 merged so `riverSurface.visible: false` in post snapshots; regeneration flagged as deferred-playtest follow-up gate), [#294](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/294) `of-water-playtest-evidence` (memo + PLAYTEST_PENDING row noting the post-capture regen gate). Active count: 6 → 6 (zero-cycle).
- VEKHIKL-LAYOUT-1 | OF motor pool clutter + OF M48 duplicate (real Tank IVehicle spawned at West FOB while dressing M48 mesh sat at the motor pool — two M48 silhouettes; vehicles overlapped < 1 m with no yaw spread) | opened+closed in cycle-motor-pool-reflow-and-tank-dedup (zero-cycle) | **3 PRs across R1 + R2**: [#287](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/287) `of-tank-relocate-to-motor-pool` moved the real M48 Tank IVehicle scenario spawn from West FOB `(-1025, 0, -760)` to the motor pool bay `(183, 0, -1173)`; removed the dressing M48 mesh from the prefab (one M48 silhouette OF-wide), [#290](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/290) `motor-pool-heavy-reflow` reflowed the four ground vehicles into staggered bays (z ∈ [8, 18], yaw 72° spread π × 0.3 → 0.7, ≥1.5 m bounding-box clearance) — **user-approved scope expansion**: the OF reflow's M48 bay sat outside A Shau's 34 m footprint, so the shared `motor_pool_heavy` prefab was split into `motor_pool_heavy_of` + `motor_pool_heavy_ashau` with side-effect updates in `gameModeTypes.ts` + `scripts/check-terrain-visual.ts` for the new prefab IDs (A Shau half preserves the cycle-vekhikl-3-shipped layout byte-for-byte), [#295](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/295) `motor-pool-and-tank-dedup-playtest-evidence` (5-shot capture script with `--pair-tag=<pre|post>` flag, memo + PLAYTEST_PENDING row). Cycle-retro item: prefab-ID additions ripple to `gameModeTypes.ts` + `scripts/check-terrain-visual.ts` in any future prefab-split cycle. Active count: 6 → 6 (zero-cycle).
- weapons-cluster-zonemanager-migration | Finish the IZoneQuery migration for the 5 remaining concrete ZoneManager imports in the weapons/player cluster (FirstPersonWeapon, WeaponAmmo, AmmoManager, AmmoSupplySystem, PlayerHealthSystem) | closed 2026-06-04 (autonomous backlog run, commit `2141c5db`) | all 5 now consume the fenced `IZoneQuery` interface instead of the concrete ZoneManager; AmmoManager's lone `getZoneAtPosition` call switched to the existing `getZoneAt` IZoneQuery alias (delegates identically, behavior-preserving); +16/-14, SystemInterfaces.ts untouched, full gate green. Closes the last weapons ZoneManager-decoupling carry-over from cycle-2026-05-10.

## Reading the table

- **Cycles open** = number of cycles this item has appeared in the active list,
  including the cycle it was opened.
- **Blocking?** = does this gate the canonical 3,000-NPC vision sentence
  becoming truthful, or block a release? `yes` items must be addressed before
  a cycle can claim "stabilized."
- **Owning subsystem** = the subsystem dir in `src/systems/` that owns the fix.

## Update protocol

- The orchestrator updates `Cycles open` at end-of-cycle ritual (see
  `docs/AGENT_ORCHESTRATION.md`). Programmatic helper:
  `npx tsx scripts/cycle-validate.ts --increment-carryovers`.
- A PR that closes a carry-over must reference its ID in the PR description
  and move the row to the Closed table in the same PR.
- Do not edit this file's `Last verified` line manually; the
  `cycle-validate.ts` increment step refreshes it.
