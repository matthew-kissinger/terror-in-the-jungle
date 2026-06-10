# Backlog

This file is the compact Strategic Reserve index. **Active carry-overs and
unresolved items live in [docs/CARRY_OVERS.md](CARRY_OVERS.md)** (Phase 0
realignment, 2026-05-09). Active directives + current state live in
[docs/DIRECTIVES.md](DIRECTIVES.md). Historical cycle records live under
`docs/cycles/<cycle-id>/RESULT.md`.

Keep this file at or below 200 measured lines of evergreen index. Historical
recently-completed retrospectives are archived at
[docs/archive/BACKLOG_RECENTLY_COMPLETED_2026-06-08.md](archive/BACKLOG_RECENTLY_COMPLETED_2026-06-08.md).

## Current state
See [docs/DIRECTIVES.md](DIRECTIVES.md).

## Owner-gated cycles

Cycles queued but explicitly **not** auto-promoted. Each waits on the named
owner-gate before re-queuing. Live source-of-truth (was previously
duplicated inside campaign manifests; the manifests are archived).

| slug | gate | scope |
|---|---|---|
| `cycle-vekhikl-seat-swaps` | owner signs off on `cycle-vekhikl-player-boarding-wire` playtest evidence (deferred row in `docs/PLAYTEST_PENDING.md`) | pilot↔gunner seat swap on M48 + PBR |
| `cycle-vekhikl-5-fleet-expansion` | owner signs off on both `cycle-vehicle-wayfinding-and-prompts` and `cycle-vekhikl-player-boarding-wire` playtest evidence | M113 APC + M35 truck + T-54 tank (+ optional ZU-23-2 AA + LCM-8) |
| `cycle-sky-screen-space-quad` | `cycle-skylut-resolution-bump` shipped but owner playtest still shows visible artifacts | Hillaire-style screen-space sky rework |
| `cycle-stabilizat-1-baselines-refresh` | owner re-queues (removed from post-WebGPU campaign 2026-05-18) | STABILIZAT-1 / combat120 baseline refresh on a quiet machine |
| `cycle-hydrology-river-surface-fix` | obsolete — hydrology + all water stripped to first principles 2026-06-09 | old Wave-0 brief retained at `docs/tasks/hydrology-river-surface-fix.md`; hydrology + all water (rendering, query/physics, swimming, authored basins) stripped to first principles on 2026-06-09; to be reworked in a future terrain/world-generator cycle that re-introduces a water level + real-time debug visualization, so this surface-height brief no longer applies |

## Active Branch (task/mode-startup-terrain-spike)

Opened 2026-05-13 for the user-reported "click a game mode and it takes
forever" issue. The investigation found that Cloudflare/Recast/WASM cache
delivery was already correct; the stall was synchronous terrain surface baking
after mode select.

The branch moves mode-start terrain surface baking to the terrain worker pool,
uses transferable typed arrays for height/normal buffers, and batches mode
terrain configuration through `TerrainSystem.configureModeSurface(...)`.
Spike memo and evidence:
[docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md](rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md).

Merge-hardening left: Open Frontier and A Shau visual review of the coarse
source-delta cache used for the render-only visual margin; if rejected, promote
persistent/prebaked visual-surface artifacts or an IndexedDB/OPFS bake cache.

## Recently Completed (cycle-2026-06-09-lighting-acceptance)

Phase 4 — FINAL phase — of
[CAMPAIGN_2026-06-09-lighting-rig](CAMPAIGN_2026-06-09-lighting-rig.md);
campaign engineering CLOSED (owner prod acceptance row in PLAYTEST_PENDING).
2/2 merged: tod-coherence-gate #380 (standing `check:tod-coherence`
acceptance gate — tolerances as named constants in
`scripts/tod-coherence-gate.ts` (corr ≥0.92, rangeRatio [0.6,1.6], dawn
≤0.85), NPC-in-frame fixture that materializes a combatant via the public
`materializeAgent` API when the harness has none (npc row reads real impostor
pixels 8/8 TODs), deterministic median-of-9 anchor sorted by stable
world-position key — closes the Phase 3 anchor-variance finding; pre-deploy
checklist tier, NOT CI-blocking per the STABILIZAT-1 GPU-runner rationale)
and legacy-path-deletion #381 (rig DEFAULT ON; legacy paths deleted −405 LOC:
whole `AtmosphereLightingColor.ts` / `shapeDirectLightForRenderer`, legacy
scene-light + fog shaping, terrain night stabilizer + night-fill emissive,
billboard [0.40,0.78] clamp band, NPC scene scan; flag-gated selects
collapsed — the dead ALU both terrain reviews flagged is gone; one-release
runtime kill-switch `window.__lightingRig.enabled=false` reverts CPU scene
authority only — deleted in-shader paths do NOT return; flag removal next
cycle). Evidence: gate GREEN post-flip (foliage 0.953, npc 0.997, dawn 0.050,
midnight 0.016); combat120 p99 IMPROVED 38.80→33.60ms / peak 43.6→34.2ms
(same-machine same-session A/B); combat-reviewer APPROVE; terrain-nav
REQUEST-CHANGES resolved (its blocking claim was factually wrong —
`emissiveNode` defaults to null and `toBeDefined()` passes on null — but the
assertion WAS vacuous; now asserts the deletion). Advisory carry-over: GLB
rangeRatio 6.6× (direct-sun swing on vehicle bodies; promote to
`HARD_GATED_FAMILIES` later if wanted). Per-scenario gate coverage (5 presets
× 4 TODs) noted in the script header as a follow-up. HARNESS GOTCHA for the
record: combat120 captures CANNOT run from an agent worktree on Windows —
the Chromium profile under `<worktree>\artifacts\perf\<ts>\browser-profile`
exceeds MAX_PATH and every worker/dynamic-import fetch dies with ERR_FAILED
while the static page loads; run from a short path (junction works for the
capture but `vite build` cannot run through a junction — build from the real
path, capture with `--no-build`).
Briefs: `docs/tasks/archive/cycle-2026-06-09-lighting-acceptance/`.

## Recently Completed (cycle-2026-06-09-exposure-atmosphere-unify)

Phase 3 of [CAMPAIGN_2026-06-09-lighting-rig](CAMPAIGN_2026-06-09-lighting-rig.md).
1/1 merged: exposure-fog-presets-rig #379 (rig-path scene fog reads the single
rig fogColor authority — no dawn/dusk fog-line seam against the Hosek sky;
exposure policy RATIFIED as in-shader/scene-radiance, computed exactly once on
`LightingRigState.exposure` and read by both consumers, AGX stays
presentation-only at 1.0, regression-tested; scenario presets re-expressed as
bounded `rigTrim` multipliers — ashau warm, tdm dusk-warm, zc golden, of
dimmer, combat120 identity-BY-DESIGN for perf comparability). Merge evidence:
p3-on bands HOLD (foliage corr 0.989, rangeRatio 0.945; legacy p3-off
reproduces the 0.290 defect signature). Two findings flagged to Phase 4:
(1) the sweep's foliage anchor is streaming-order timing-dependent — one run
landed a shadowed dusk cluster and read corr 0.874 while a master control +
re-run read 0.996/0.989 on 3-decimal-identical renders; `tod-coherence-gate`
must make the anchor deterministic before tolerances become pass/fail.
(2) Trims are sub-rounding in the sweep's fog-dominated box averages (live
runtime probe: moonLight ratios match tint × intensity exactly) — visible on
direct-lit surfaces, invisible under haze, as designed. The branch was rebased
onto master mid-review (originally cut pre-#378, so its first A/B ran on the
old instrument — root cause of an apparent band failure that was actually
instrument drift).
Brief: `docs/tasks/archive/cycle-2026-06-09-exposure-atmosphere-unify/`.

## Recently Completed (cycle-2026-06-09-foliage-npc-lighting)

Phase 2 of [CAMPAIGN_2026-06-09-lighting-rig](CAMPAIGN_2026-06-09-lighting-rig.md).
2/2 merged: billboard-rig-migration #376 (foliage low-sun fade + hemi trim
tuned against real rig radiance; billboard scene.fog.color authority folded;
DISCOVERED the sweep's foliage/npc rows sampled bare terrain — fixed-box
fallback, terrain-vs-terrain metrics), npc-impostor-and-effects-rig #378
(combat-reviewer APPROVE-WITH-NOTES: sweep instrument fixed — regions now
anchor on real rendered pixels; **foliage band MET on the fixed instrument:
corr 1.000, rangeRatio 0.966** — the owner's "foliage maintains the same
lighting" defect is solved and honestly measured on the rig path; NPC
impostors consume the SAME shared constants by import with the scene-children
scan bypassed [second authority gone on the rig path]; full lit-surface
consumer sweep documented — effects are unlit-by-construction, GLB family
already rig-driven). NPC row remains unmeasurable at the fixture (no NPC in
frame) — Phase 4 `tod-coherence-gate` owns spawning one. Phase 4 checklist
additions from review: re-validate per-faction PIXEL_FORGE parity tuning
under the rig; NPC-in-frame visual check.
Briefs: `docs/tasks/archive/cycle-2026-06-09-foliage-npc-lighting/`.

## Recently Completed (cycle-2026-06-09-helicopter-craft)

Phase 3 (final) of [CAMPAIGN_2026-06-09-craft-specialization](CAMPAIGN_2026-06-09-craft-specialization.md)
— **campaign COMPLETE: 3 phases, 11 PRs, zero fence changes.** 3/3 merged:
door-gun-seat #374 (player-crewable UH1C door gun — pilot↔door_gun toggle on a
heli-mode F binding [the factory seat machinery is flight-gated], arc-clamped
aim, fire through the existing hitscan path, AI auto-fire suspended while the
player crews, `door_gun` reticle), gunship-reticle-upgrade #375 (Cobra
CCIP-lite rocket-fall cue from existing ballistics, per-weapon reticle
prominence, live weapon/ammo HUD; added the fence-clean GameRenderer
crosshair-passthrough seam), heli-hud-consolidation #377 (per-variant
HELI_VARIANT_DESCRIPTORS panel table retiring role duck-typing, door-side
gunner POV with leak-proof restore, traverse-stop reticle ticks wired for
door_gun + emplacement_mg). Follow-ups: gunship MANNED/AI crew badge needs a
fenced IHUDSystem method (deliberately dropped); door-gun belt panel reuses
the fenced weapon-status path. Owner feel-walk row in PLAYTEST_PENDING.
Briefs: `docs/tasks/archive/cycle-2026-06-09-helicopter-craft/`.

## Recently Completed (cycle-2026-06-09-fixed-wing-craft)

Phase 2 of [CAMPAIGN_2026-06-09-craft-specialization](CAMPAIGN_2026-06-09-craft-specialization.md).
3/3 merged, fence untouched: fixedwing-gunsight #370 (fence-clean `fixed_wing`
reflector reticle + visible ammo counter — the hidden hardcoded 600 is now a
named per-airframe magazine with HUD readout + LOW state), per-aircraft-ordnance
#372 (closes the AVIATSIYA-5/6 guns-identity deferral via the new data-driven
FixedWingArmament module: A-1 4x20mm wing cannons w/ paired convergence, F-4
nose rotary, AC-47 nose gun REMOVED for the signature 3x7.62 broadside firing
90° left; AI untouched by construction — no NPC gun path exists),
fixedwing-camera-fit #373 (per-airframe chase tuning, reticle-on-convergence
alignment proven by NDC projection tests, AC-47 RMB-toggled broadside gunner
view reusing the tank-sight restore guarantees). Follow-ups:
FixedWingDisplayInfo camera fields now unused (cleanup candidate); bombs/
rockets remain a future ordnance cycle; AI AC-47 orbit-fire is a follow-up if
AI ever flies it. Owner feel-walk row in PLAYTEST_PENDING.
Briefs: `docs/tasks/archive/cycle-2026-06-09-fixed-wing-craft/`.

## Recently Completed (cycle-2026-06-09-lighting-rig-spike)

Phase 0 of [CAMPAIGN_2026-06-09-lighting-rig](CAMPAIGN_2026-06-09-lighting-rig.md).
3/3 merged, fence untouched: lighting-audit-memo #363 (rig spec + 3-clamp
inventory + coherence band; found the capture tool is a 5th snapshot consumer,
BillboardBufferManager reads scene.fog.color directly, and
TerrainSystem.setAtmosphereLighting is a sixth shaping site),
tod-capture-harness #365 (8-TOD per-family luminance curves; baseline proves
the defect: foliage range ratio 0.459/0.290 vs terrain, GLB corr -0.77 to -0.83),
rig-prototype #368 (flag-gated LightingRig + terrain/billboard branches;
terrain-nav APPROVE-WITH-NOTES). A/B verdict: clamp bypass CONFIRMED (foliage
min 0.129→0.012, range ratio →1.564 in-band); foliage corr 0.533 vs ≥0.92 NOT
met — structural (terrain stacks legacy scene lights on rig terms), so Phase 1
re-scopes scene-light-unification as a co-requisite of terrain-rig-migration.
Recorded GO pending owner review (PLAYTEST_PENDING row). Reviewer follow-ups:
OFF-path dead ALU until Phase 4; terrain→environment binding coupling on the
Phase 4 deletion checklist; midnight rig-path darkness check at the owner A/B.
Briefs: `docs/tasks/archive/cycle-2026-06-09-lighting-rig-spike/`.

## Recently Completed (cycle-2026-06-09-ground-gunnery-craft)

Phase 1 of [CAMPAIGN_2026-06-09-craft-specialization](CAMPAIGN_2026-06-09-craft-specialization.md).
5/5 merged, fence untouched (CrosshairMode union widened in CrosshairSystem.ts
— additive, fence-clean by type-reference): reticle-framework #362 (tank_gunner
+ emplacement_mg modes routed through the adapter lifecycle), npc-tank-cannon-wiring
#364 (dormant TankAIGunnerRoute bound in prod — setTankGunnerRoute had ZERO prod
callers; combat-reviewer caught a real double-stepping regression → single-owner
CannonStepGate + scaled-dt beginFrame(deltaTime), NPC shells now respect
TimeScale), tank-gunner-sight #366 (stadia reticle, FJ TankGunnerPanel, RMB
2.8x zoom), m2hb-gun-experience #367 (MG reticle, belt counter, traverse cue,
visual recoil; M2HB weapon files untouched — getters existed),
tank-sight-prod-wiring #369 (orchestrator-inline: TankGunnerAdapter had zero
prod imports AND PlayerCamera never called any computeGunnerSightCamera — the
sight POV was unreachable for every adapter; new shared TankSightSurface +
optional sight pose/FOV on VehicleFollowCamera). Follow-ups: converge
TankGunnerAdapter onto TankSightSurface or retire it; in-flight cannon round
freezes on dismount (MVP caveat, pre-existing); NPC fire cadence still
wall-clock (documented bypass list). Owner feel-walk row in PLAYTEST_PENDING.
Briefs: `docs/tasks/archive/cycle-2026-06-09-ground-gunnery-craft/`.

## Recently Completed (cycle-2026-06-09-weapon-input-and-gate-hardening)

Phase 1 of [CAMPAIGN_2026-06-09-consultation-remediation](CAMPAIGN_2026-06-09-consultation-remediation.md).
4/4 merged, fence untouched: real-mouse-input #338 (real LMB state on PlayerInput;
dead duck-probes deleted from tank/M2HB/gunner adapters), frame-order-guard #337
(locks Vehicles-before-Player order + 'Other'-loop exclusion), budget-ratchet #339
(grandfather list is now a no-growth ratchet with measured snapshots),
ci-gate-consolidation #340 (lint:budget / check:fence / lint:docs / knip:ci now
blocking on PRs; dead perf-baselines.json refs removed; index.html in PR paths
filter). Follow-ups: knip:ci gates a documented subset (141-item export/type
backlog excluded; orphan files in package.json knip.ignore await Phase 5
deletion tasks); live tank-cannon/M2HB LMB smoke re-verifies at Phase 2 close
(composer wiring is Phase 2). Briefs:
`docs/tasks/archive/cycle-2026-06-09-weapon-input-and-gate-hardening/`.

## Recently Completed (cycle-2026-06-09-vehicle-occupancy-truth)

Phase 2 of [CAMPAIGN_2026-06-09-consultation-remediation](CAMPAIGN_2026-06-09-consultation-remediation.md).
5/5 merged, fence untouched: tank-interpolation #341 (M48 render-time interpolation —
high-refresh jitter class), vehicle-seat-lifecycle #342 (all enter/exit through the
IVehicle seat model via a VehicleSeatBinder on VehicleSessionController — kills seat
ghosts), tank-cannon-wiring #343 (player tank cannon + M2HB live on LMB; true
composition site is StartupPlayerRuntimeComposer, not OperationalRuntimeComposer;
combat-reviewer APPROVE-WITH-NOTES), vehicle-player-position-sync #344
(playerState.position tracks the chassis for ground/water/emplacement — streaming/AI/
zones/minimap truth), watercraft-camera #345 (follow-cam wired; boats dormant).
Live proof refreshed: land-vehicle-runtime-proof 11/11 PASS post-cycle. Owner walk
row in PLAYTEST_PENDING. Follow-ups (reviewer notes): Escape-exit bypasses the
factory detach hook (defended by mounted guards — candidate for Phase 5
dedup-vehicle-adapters), M2HB one-frame latch ordering vs SystemUpdater Combat/Player
blocks, in-flight cannon round freezes on dismount (stepper rides the adapter),
NPC tank cannon (TankCannonProjectileSystem) still unconstructed in prod.
Briefs: `docs/tasks/archive/cycle-2026-06-09-vehicle-occupancy-truth/`.

## Recently Completed (cycle-2026-06-09-combat-death-and-alliance)

Phase 3 of [CAMPAIGN_2026-06-09-consultation-remediation](CAMPAIGN_2026-06-09-consultation-remediation.md).
6/6 merged, all combat-reviewer gated (4 APPROVE, 2 APPROVE-WITH-NOTES), fence
untouched: zone-defenders-prune #346, fire-gate-ordering #347 (aborted shots no
longer eat fire-rate/bloom), faction-isally-sweep #348 (suppression/cluster/zone
owner checks on canonical alliance helpers), combat-death-unification #349
(CombatantDeathPipeline single owner; rifle-path promotion/empty-squad-delete was
the real bug; explosion via spatialGridManager.queryRadius), ai-timing-gate #350
(diagnostics behind isPerfDiagnosticsEnabled; per-tick allocs hoisted; LOD interval
params cached), combat-death-body-persistence #351 (R2 split: LODManager sole
body-despawn owner, racing SpawnManager sweep deleted, player-rifle squads + AI-
killed player-squad respawns rehomed through the pipeline).
**Exit gate PASS: combat120 p99 50.6→~31ms (-38%), avg 31→24ms vs Phase 2 close**
(`artifacts/perf/2026-06-09T20-50-12-389Z` → `2026-06-09T21-57-12-684Z`; same
non-quiet box, Combat-phase tail 13.2→9.8ms; p99 now under the 35ms STABILIZAT-1
target, formal close still needs the quiet-box capture + committed baseline).
Reviewer follow-ups (non-blocking): alive-but-no-longer-defending ids still hold
zoneDefenders slots until death (#346 note); owner-display/resupply sites still
raw `=== Faction.US` (ZoneRenderer, CompassZoneMarkers, OpenFrontierRespawnMapUtils,
AmmoSupplySystem/AmmoManager — sweep candidate); RespawnManager.queueRespawn lacks
a dedup guard (single-call contract — add comment or originalId dedup); watch
raycast-budget denial rate in playtest (blocked NPCs now re-poll the terrain gate).
Briefs: `docs/tasks/archive/cycle-2026-06-09-combat-death-and-alliance/`.

## Recently Completed (cycle-2026-06-09-terrain-fidelity-and-worker-safety)

Phase 4 of [CAMPAIGN_2026-06-09-consultation-remediation](CAMPAIGN_2026-06-09-consultation-remediation.md).
4/4 merged, all terrain-nav APPROVE-WITH-NOTES, fence untouched:
bvh-rebuild-double-buffer #352 (front/back MeshSlab; LOS reads a consistent
snapshot, never hybrid rows; ~87KB), terrain-worker-safety #353 (dispose/onerror
reject pendingTasks, 60s bake timeout, real task queue, demBufferCache evicted on
provider swap — 21MB/worker leak), gameplay-heightmap-resolution #354 (**the
stall-tail bet, premise CONFIRMED**: gameplay queries read the 512-wide GPU grid
at ~42m/sample; now a 1024 CPU-only grid baked from the source DEM —
steep-cell contour flips 0.74%→0.08% (~9x), mean |Δh| 1.12→0.34m, +3MB CPU,
0 GPU; DEM_COVERAGE_METERS=21136 verified correct, "drift" was a red herring),
navmesh-coverage-ashau #355 (full-map A Shau tiled prebake, 18.5MB
`public/data/navmesh/a_shau_valley.bin`, worker-offloaded tiled gen; perimeter
band beyond the old anchor window now paths instead of beelining).
**Mid-phase checkpoint:** combat120 post-heightmap-fix — avg 24.0→20.9ms, max
63.5→46.6ms, p99 flat (~32ms), and the terrain-stall warning storm is GONE
(0 stall recoveries vs 28-suppressed at Phase 2 close; maxStuckSec 0.3, 0 route
resets) → no further solver tuning dispatched; `combat-movement-stall-tail`
retirement assessed at campaign close.
Reviewer follow-ups (non-blocking): LOS near-field serves an N-frame-stale
consistent snapshot during rebuild (~150-300ms during fast traverse — note in
MOVEMENT_NAV_CHECKIN if rediscovered); future real-BVH wiring must
computeBoundsTree on the back slab pre-swap; add an end-to-end dispose/mode-
switch race test (primitives covered); a-shau navmesh .bin is immutable-cached
under a fixed filename — re-bakes need a cache-bust; add an L2 test for the
syncCpuHeightsToGpu round-trip; proposed split: lift the GPU surface grid to
1024 for CPU↔render coherence (max 18m visual mismatch on sharp ridges,
mean 0.86m — owner-walk item). NOTE: navmesh crowd was re-enabled 2026-05-18
(steered direction) — older "crowd disabled" notes are stale.
Briefs: `docs/tasks/archive/cycle-2026-06-09-terrain-fidelity-and-worker-safety/`.

## Recently Completed (cycle-2026-06-09-deploy-weight-reduction)

Phase 5 (FINAL) of [CAMPAIGN_2026-06-09-consultation-remediation](CAMPAIGN_2026-06-09-consultation-remediation.md)
— campaign COMPLETE, 25/25 tasks merged across 5 phases. This cycle: 6/6 merged,
fence untouched. settings-key-migration #356 ('pixelart-sandbox-settings' →
'terror-in-the-jungle-settings' with read-old/write-new shim; audit found no
other legacy keys), prune-prod-mockups #357 (build-only Vite plugin strips
public/mockups from dist + dist-perf; files stay in git as reference; ~769KB),
dedup-map-renderers #358 (shared `src/ui/map/MapProjection.ts`: north-up +
player-centered transforms + faction palette across the 4 canvas renderers;
deploy map inherits via OpenFrontierRespawnMapUtils), purge-water-remnants #359
(setUnderwater/underwater overrides/a-shau-rivers required-pin/2 dead textures
deleted; -195 LOC; capture scripts' 'underwater' shot kind now a no-op —
follow-up), delete-orphan-modules #360 (terrain-nav APPROVE; Konveyer compute
spike + generateChunk/'generate' branch deleted, -794 LOC; TankGunnerAdapter +
NpcM2HBAdapter verified LIVE and kept — consultation orphan list was a lead,
not a verdict; knip.ignore could NOT honestly shrink: every entry load-bearing),
dedup-vehicle-adapters #361 (free-function helpers in VehicleAdapterShared.ts;
-217 adapter LOC; zero test files touched — full suite as no-op proof).
**Exit gate PASS:** dist 110.2→109.4 MB, knip:ci clean, no mockup routes,
settings migration test-proven. Follow-ups: red-laterite.webp + sandy-beach.webp
binaries still in public/assets (owner decision); two capture scripts call the
removed setUnderwater inside browser closures (no-op, not type-coupled).
Briefs: `docs/tasks/archive/cycle-2026-06-09-deploy-weight-reduction/`.

## Recently Completed Archive

Detailed recently-completed cycle retrospectives moved to
[docs/archive/BACKLOG_RECENTLY_COMPLETED_2026-06-08.md](archive/BACKLOG_RECENTLY_COMPLETED_2026-06-08.md)
to keep this file focused on current owner-gated cycles, strategic reserve, and
known deferred risks. Treat the archive as historical evidence, not current
state.

## Strategic Reserve

Items below are acknowledged but not active directives unless the project
owner opens or reassigns them.

### KB-LOAD

- Accepted Pixel Forge vegetation candidate import and runtime proof.
- Dense vegetation ecology, bamboo and palm clustering, grass, ground cover,
  and disturbed trail edges.
- Pixel Forge building and vehicle replacement with foundation, collision, and
  pivot checks.
- GLB migration into the content-addressed asset manifest after terrain
  delivery is stable.

### KB-TERRAIN

- Far-canopy and distance-policy after evidence for Open Frontier and A Shau.
- A Shau route and NPC movement quality beyond representative-base connectivity.
- Terrain texture improvements.
- Road network generation with splines, intersections, and pathfinding.
- Additional DEM modes such as Ia Drang and Khe Sanh.

### KB-CULL

- Broad HLOD.
- Static-cluster policy.
- Vegetation culling.
- Parked-aircraft playtest coverage.
- Building and prop residency decisions after renderer-category evidence.

### KB-OPTIK / KB-EFFECTS

- Human-signed atmosphere and cloud readability.
- Vegetation normal-map and material parity follow-ups.
- Music, soundtrack, weapon sound variants, and impact/body/headshot sounds.
- Stress-scene grenade and explosion validation after combat120 trust returns.

### KB-STRATEGIE

- WebGPU, OffscreenCanvas worker render, WASM-SIMD, SharedArrayBuffer, and
  cross-origin isolation branches. Reopen only with project-owner direction.
- Multiplayer and networking.
- Destructible structures.
- Survival / roguelite mode.
- Campaign system.
- Theater-scale tiled DEM maps.

### Phase F Candidates

- E1: ECS evaluation remains deferred; bitECS measured about parity with the
  current Vector3-shaped runtime in the old spike.
- E2: GPU-driven rendering and WebGPU migration are now active on
  `exp/konveyer-webgpu-migration` (KONVEYER-0 through KONVEYER-10). The
  scene/material/materialization rearchitecture memo lives at
  `docs/rearch/WEBGPU_MIGRATION_MATERIALIZATION_TIERS_2026-05-12.md`; concrete
  instancing-capacity cliffs may still be fixed in place on `master` while
  the experimental branch matures.
- E3: Utility-AI combat layer expansion remains a design candidate; do not
  block present faction tuning on it.
- E4: Agent/player API unification needs a minimal movement/observation
  prototype before any full active-driver rewrite.
- E5: Deterministic sim and seeded replay need a `SimClock` / `SimRng` pilot
  before any broad pass.
- E6: Vehicle physics rebuild needs a flagged Skyraider `Airframe` prototype
  and human playtest before any full migration.

## Known Deferred Risks

1. Fixed-wing and helicopter feel are not human-signed-off.
2. Pointer-lock fallback is implemented but not usability-signed.
3. Airfield height authority is partially repaired, not fully unified.
4. NPC route-follow quality is not signed off.
5. Production freshness must be rechecked after every player-testing push.
6. Main production/perf chunks remain heavy.
7. `frontier30m` baseline remains stale until a quiet-machine soak.
8. Mixed UI paradigms remain architecture debt.
9. SystemManager and composer ceremony remain architecture debt.
10. Variable-delta physics remains architecture debt outside fixed-step vehicle
    systems.

## Historical Cycle Index

| Cycle | Record |
|---|---|
| cycle-mobile-webgl2-fallback-fix | `docs/tasks/archive/cycle-mobile-webgl2-fallback-fix/cycle-mobile-webgl2-fallback-fix.md` |
| cycle-sky-visual-restore | `docs/tasks/archive/cycle-sky-visual-restore/cycle-sky-visual-restore.md` |
| cycle-2026-05-10-zone-manager-decoupling | `docs/tasks/archive/cycle-2026-05-10-zone-manager-decoupling/cycle-2026-05-10-zone-manager-decoupling.md` |
| cycle-2026-05-09-doc-decomposition-and-wiring | `docs/tasks/archive/cycle-2026-05-09-doc-decomposition-and-wiring/cycle-2026-05-09-doc-decomposition-and-wiring.md` |
| cycle-2026-05-09-phase-0-foundation | `docs/tasks/archive/cycle-2026-05-09-phase-0-foundation/cycle-2026-05-09-phase-0-foundation.md` |
| cycle-2026-05-08-stabilizat-2-closeout | `docs/cycles/cycle-2026-05-08-stabilizat-2-closeout/RESULT.md` |
| cycle-2026-04-23-debug-cleanup | `docs/cycles/cycle-2026-04-23-debug-cleanup/RESULT.md` |
| cycle-2026-04-23-debug-and-test-modes | `docs/cycles/cycle-2026-04-23-debug-and-test-modes/RESULT.md` |
| cycle-2026-04-22-heap-and-polish | `docs/cycles/cycle-2026-04-22-heap-and-polish/RESULT.md` |
| cycle-2026-04-22-flight-rebuild-overnight | `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/RESULT.md` |
| cycle-2026-04-21-stabilization-reset | `docs/cycles/cycle-2026-04-21-stabilization-reset/RESULT.md` |
| cycle-2026-04-21-atmosphere-polish-and-fixes | `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/RESULT.md` |
| cycle-2026-04-20-atmosphere-foundation | `docs/cycles/cycle-2026-04-20-atmosphere-foundation/RESULT.md` |
| cycle-2026-04-18-harness-flight-combat | `docs/cycles/cycle-2026-04-18-harness-flight-combat/RESULT.md` |
| cycle-2026-04-18-rebuild-foundation | `docs/cycles/cycle-2026-04-18-rebuild-foundation/RESULT.md` |
| cycle-2026-04-17-drift-correction-run | `docs/cycles/cycle-2026-04-17-drift-correction-run/RESULT.md` |
| cycle-2026-04-06-vehicle-stack-foundation | `docs/cycles/cycle-2026-04-06-vehicle-stack-foundation/RESULT.md` |

## Research References

- `examples/prose-main/` remains a gitignored external-repo reference target for
  declarative runtime config and orchestration patterns.
- Write generalized findings to `docs/rearch/prose-research.md` before using
  them as implementation guidance.
