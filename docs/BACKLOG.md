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
  `docs/rearch/KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md`; concrete
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
