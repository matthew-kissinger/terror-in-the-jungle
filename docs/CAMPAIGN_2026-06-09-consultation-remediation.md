# Campaign: Consultation Remediation

> **Date:** 2026-06-09
> **Shape:** large (5 sequenced cycles)
> **Auto-advance:** yes
> **Posture:** attended (NOT autonomous-loop — these cycles touch combat/terrain/vehicle
> hot paths; owner wants eyes on perf deltas between phases)
> **Concurrency cap:** 5
> **Status:** Phase 3 open (`cycle-2026-06-09-combat-death-and-alliance`)
>
> **Progress:** ✅ 1 weapon-input-and-gate-hardening (4/4: #337 #338 #339 #340) ·
> ✅ 2 vehicle-occupancy-truth (5/5: #341 #342 #343 #344 #345, live proof 11/11 PASS,
> closed 2026-06-09) · ▶ 3 combat-death-and-alliance ·
> ⬜ 4 terrain-fidelity-and-worker-safety · ⬜ 5 deploy-weight-reduction

Source: 2026-06-09 full-codebase consultation review. Each phase is one cycle.
**Phase barriers are hard:** a phase's exit gate (CI green + reviewer APPROVE on all
merged tasks + the named acceptance) must pass before the next cycle's R1 dispatch.

## Campaign hard-stops (halt + surface to owner)

- Any `fence_change: yes` in an executor report.
- >2 CI-red tasks in one round.
- `combat120` p99 regression >5% after any round.
- Worktree-isolation failure.
- `combat-reviewer` or `terrain-nav-reviewer` CHANGES-REQUESTED twice on the same task.

## Phase 1 — `cycle-2026-06-09-weapon-input-and-gate-hardening`

**Why first:** the enforcement gates must exist before Phases 2-4 do large mechanical
work, or that work violates the fence/budget rules silently (today `check:fence`,
`lint:budget`, `knip` are local-only). The user-observable anchor is the dead weapon
bindings. `real-mouse-input` is a hard prerequisite for Phase 2's `tank-cannon-wiring`.

**Task DAG:**

```
budget-ratchet ──► ci-gate-consolidation
real-mouse-input        (root)  ── unblocks Phase 2 tank-cannon-wiring
frame-order-guard       (root)
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| real-mouse-input | Real mouse-button state in PlayerInput/InputManager; delete duck-typed `isMouseButtonPressed`/`getMouseButton` probes in TankPlayerAdapter/EmplacementPlayerAdapter/TankGunnerAdapter (probe methods never exist in prod). | `src/systems/input/InputManager.ts`, `src/systems/player/PlayerInput.ts`, 3 adapters' `readFireInput` | — | M; may touch fence (IPlayerController) → surface |
| frame-order-guard | Test asserting vehicle-phase systems (helicopterModel/vehicleManager/fixedWingModel) are unreachable via SystemUpdater's 'Other' loop; assert SYSTEM_UPDATE_SCHEDULE order matches the imperative order in updateSystems. | `src/core/SystemUpdater.ts`, `SystemUpdateSchedule.ts`, new test | — | S |
| budget-ratchet | "No growth past grandfathered snapshot" rule in lint-source-budget.ts; refresh stale annotations (e.g. CombatantRenderer "219 methods" → 78). | `scripts/lint-source-budget.ts` | — | S |
| ci-gate-consolidation | Make `lint:budget`, `check:fence`, `lint:docs`, `knip` blocking CI jobs; remove dead perf-baselines.json references (ci.yml:286, artifact-prune.yml) and decide perf gating story explicitly; add `index.html` to PR paths filter. | `.github/workflows/ci.yml`, `artifact-prune.yml` | — | M |

**Exit gate:** tank cannon + player M2HB fire on LMB in a smoke run; CI green with the
four new gates active; frame-order-guard test passes.

> Orchestrator note (2026-06-09 scaffold): the cannon/M2HB *composer wiring* lands in
> Phase 2 (`tank-cannon-wiring`), so the live smoke clause may be unsatisfiable at
> Phase 1 close. If the smoke run shows fire intent reaching the adapters (L3 test
> green) but the cannon system is still unwired, treat that clause as satisfied for
> the barrier and re-verify the full live smoke at Phase 2's exit gate. Do not halt
> the campaign on this clause alone — halt only on the CI-gate or frame-order clauses.

## Phase 2 — `cycle-2026-06-09-vehicle-occupancy-truth`

**Why second:** needs `real-mouse-input` from Phase 1. Owner-visible correctness bugs
(player frozen while driving, seat ghosts, tank jitter) that a playtest surfaces
immediately. Doing them before the Phase 5 adapter dedup means the dedup refactors
stable code.

**Task DAG:**

```
vehicle-seat-lifecycle ──► vehicle-player-position-sync ──► watercraft-camera
   (serialized: shared VehicleSessionController, then shared WatercraftPlayerAdapter)
tank-cannon-wiring      (root; cross-phase dep on real-mouse-input — satisfied by barrier)
tank-interpolation      (root)
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| vehicle-seat-lifecycle | Route ALL enter/exit through the seat model: handleEscape/requestVehicleExit must release IVehicle seats; HelicopterInteraction.tryEnterHelicopter must call HelicopterVehicleAdapter.enterVehicle(). Kills the seat-ghost / getPilotId()===null desync. | PlayerController.ts, HelicopterInteraction.ts, PlayerVehicleAdapterFactory.ts, VehicleSessionController.ts | — | M |
| vehicle-player-position-sync | Sync playerState.position to chassis for ground/water/emplacement sessions (heli/fixed-wing already do). Fixes streaming, AI targeting, zone capture, minimap seeing the player parked at boarding spot. | per-adapter update() or central in VehicleSessionController.update | — | S |
| watercraft-camera | Wire setVehicleFollowCamera in WatercraftPlayerAdapter.onEnter/onExit (computeThirdPersonCamera currently unreachable). | WatercraftPlayerAdapter.ts | — | S |
| tank-cannon-wiring | Wire setCannonSystem + M2HBEmplacement.attachPlayerAdapter in the operational composer (zero prod callers today). | composer wiring file, TankPlayerAdapter.ts, M2HBEmplacement.ts | — | S |
| tank-interpolation | Add getInterpolatedState() to TrackedVehiclePhysics; use in Tank.update (currently renders raw fixed-step pose — same jitter class as the fixed heli bug). | TrackedVehiclePhysics.ts, Tank.ts | — | S |

Note: vehicle-seat-lifecycle and vehicle-player-position-sync both touch
VehicleSessionController (different methods) — declared sequential to avoid worktree
merge pain. watercraft-camera follows position-sync (same file).

**Exit gate:** drive a jeep 500m+ and confirm chunk streaming follows the player (not
the boarding spot); board→exit→re-board lands in the same seat; M48 visually smooth
at 120Hz.

## Phase 3 — `cycle-2026-06-09-combat-death-and-alliance`

**Why third:** independent of vehicles; touches `src/systems/combat/**` so every task
gates on combat-reviewer pre-merge. The death-pipeline unification is the keystone —
do it before any future combat work compounds the three-way race.

**Task DAG:** all roots; ai-timing-gate shares CombatantLODManager with
combat-death-unification — **serialize their merges** (second rebases).

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| combat-death-unification | One handleCombatantDeath(target, attacker, cause) owned by one module; route rifle (CombatantDamage) + explosion (CombatantSystemDamage) through it; add leader promotion / empty-squad deletion; explosion damage uses spatialGridManager.queryRadius not O(N); decide body-persistence once (kill the three racing cleanup owners). | CombatantDamage.ts, CombatantSystemDamage.ts, CombatantLODManager.ts, CombatantSpawnManager.ts | combat | L — split into death-core + explosion-route if >400 net |
| faction-isally-sweep | Replace raw faction-equality with isAlly in CombatantSuppression.trackNearMisses, ClusterManager spacing/cluster, ZoneCaptureLogic owner checks. | CombatantSuppression.ts, ClusterManager.ts, ZoneCaptureLogic.ts | combat | S |
| zone-defenders-prune | Sweep dead/removed defenders from AIStatePatrol.zoneDefenders Sets (permanent starvation today). | AIStatePatrol.ts | combat | S |
| fire-gate-ordering | Move gunCore.registerShot() after the terrain-blocked / raycast-budget gates in tryFireWeapon (aborted shots eat fire-rate + bloom today). | CombatantCombat.ts | combat | S |
| ai-timing-gate | Gate withAiMethodTiming + per-update {...methodMs} spread behind the perf-diagnostics flag; hoist per-tick lambdas in CombatantAI.updateAI; cache estimateGPUTier/isMobileGPU/getWorldSize out of computeDynamicIntervalMsFromDistanceSq. | CombatantAI.ts, CombatantLODManager.ts | combat | M |

**Exit gate:** combat120 perf-capture shows p95/p99 flat or improved vs Phase 2 close
(target: measurable improvement from ai-timing-gate); combat-reviewer APPROVE on all
five.

## Phase 4 — `cycle-2026-06-09-terrain-fidelity-and-worker-safety`

**Why fourth:** the heightmap-resolution bet is the highest-uncertainty work; doing it
after combat is stable means the stall tail can be re-measured against a quiet
baseline. Touches `src/systems/terrain/**` + `navigation/**` → terrain-nav-reviewer
gates.

**Task DAG:**

```
gameplay-heightmap-resolution ──► navmesh-coverage-ashau
terrain-worker-safety     (root)
bvh-rebuild-double-buffer (root)
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| gameplay-heightmap-resolution | Lift or tile MAX_HEIGHTMAP_GRID_SIZE/computeTerrainSurfaceGridSize so A Shau gameplay queries aren't ~42m/sample off a 9m DEM (smoothed grid → C0-discontinuous slope → contour oscillation = the combat-movement-stall-tail root). Verify DEM_COVERAGE_METERS=21136 vs 2304×9=20736 drift. | TerrainSurfaceRuntime.ts, TerrainSystem.ts (syncCpuHeightsToGpu) | terrain-nav | L — consider spike→impl split |
| terrain-worker-safety | TerrainWorkerPool.dispose rejects pendingTasks; worker.onerror rejects the pending task; bake timeout (mirror navmesh worker's 60s); fix getAvailableWorker busy/undefined fallback; evict demBufferCache on setHeightProvider (per-worker 21MB retention leak). | TerrainWorkerPool.ts, terrain.worker.ts | terrain-nav | M |
| bvh-rebuild-double-buffer | Double-buffer TerrainRaycastRuntime.positionBuffer so LOS/raycast can't read hybrid old/new triangles mid-rebuild. | TerrainRaycastRuntime.ts | terrain-nav | M |
| navmesh-coverage-ashau | Offload tiled navmesh gen to the worker (exists, unused for tiled); prebake A Shau; remove anchor-window-only coverage gap forcing beeline on steep DEM. | NavmeshSystem.ts, scripts/prebake-navmesh.ts | terrain-nav | L |

**Mid-phase gate (orchestrator action, not a task):** after
gameplay-heightmap-resolution merges, run perf-capture combat120 + spawn perf-analyst,
and re-evaluate whether `combat-movement-stall-tail` is retired before dispatching
further solver tuning. This is the campaign's "stop polishing the solver if the input
signal was the defect" checkpoint.

**Exit gate:** NPC stuck-on-slope rate measurably down in a scripted A Shau scenario;
no startup wedge under a dispose/mode-switch race; terrain-nav-reviewer APPROVE.

## Phase 5 — `cycle-2026-06-09-deploy-weight-reduction`

**Why last:** mostly deletion in disjoint areas — lowest risk, highest signal/effort,
and the adapter/map dedup refactors must follow Phases 2 & 4 (don't refactor code
you're about to change). These are the large retired-code-deletion kind allowed past
the 400-net-diff rule.

**Task DAG:** all roots; dedup-vehicle-adapters cross-phase-depends on Phase 2,
satisfied by barrier.

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| prune-prod-mockups | Remove public/mockups/01..10 from the prod build/deploy (Field Journal won; dead public routes + deploy weight). | public/mockups/, build config | — | S (deletion) |
| purge-water-remnants | Delete unreachable underwater path: WeatherSystem.setUnderwater + branch, AtmosphereSystem underwater overrides + FogTintIntentReceiver member, R2 a-shau-rivers.json required:true pin, unreferenced water-era textures, stale WaterSystem comments. | WeatherSystem.ts, WeatherAtmosphere.ts, AtmosphereSystem.ts, cloudflare-assets.ts, AssetLoader.ts | — | M (deletion) |
| delete-orphan-modules | Delete src/rendering/ Konveyer spike, TankGunnerAdapter.ts, TerrainWorkerPool.generateChunk + worker 'generate' branch, unwired scripts; confirm via knip. | listed orphans | — | M (deletion) |
| settings-key-migration | Migrate SettingsManager localStorage key 'pixelart-sandbox-settings' → current name with a read-old/write-new shim (don't silently reset users). | SettingsManager.ts | — | S |
| dedup-vehicle-adapters | Extract BaseVehicleAdapter / shared helpers (flight-bookkeeping clear, angle save/restore, HUD context, WASD axis read) across the 6 adapters (~300 deletable lines). | 6 *PlayerAdapter.ts + new base | — | M |
| dedup-map-renderers | Shared worldToMap(x,z) + VehicleMarker + marker-icon module; collapse the 4 canvas renderers' duplicated transform/zone/faction logic. | MinimapRenderer.ts, FullMapSystem.ts, OpenFrontierRespawnMapRenderer.ts, CommandTacticalMap.ts + new shared | — | M |

**Exit gate:** dist/ size measurably down; knip clean; no mockup routes in prod; user
settings survive the key migration.

## When a phase opens (per `AGENT_ORCHESTRATION.md`)

Phases 2-5 briefs are authored at each phase's open, NOT up front. At each open:
write the task brief(s) in `docs/tasks/<slug>.md` (≤80 LOC, `_TEMPLATE.md` — fill
`## Acceptance` with a repro-first L3 test where a bug is fixed, per `docs/TESTING.md`,
and `## Non-goals` from the consultation findings), populate the DAG in
`AGENT_ORCHESTRATION.md` "Current cycle", and validate the slug with
`npx tsx scripts/cycle-validate.ts <slug>`. All five cycle slugs pre-validated
2026-06-09 against the banned-keyword stoplist.

## Fence watch

`real-mouse-input` (Phase 1) is the one task likely to touch
`src/types/SystemInterfaces.ts` (IPlayerController). If it does, that's an
`[interface-change]` PR + the campaign's fence-change hard-stop fires **by design** —
surface to owner, do not auto-merge.

## Non-goals

- New gameplay features, modes, or content.
- Water/hydrology rework (deferred to a future terrain/world-gen cycle per the
  2026-06-09 scorch).
- Solver tuning beyond the Phase 4 mid-phase checkpoint's verdict.
