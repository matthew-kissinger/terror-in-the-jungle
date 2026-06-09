# VODA-3 — Watercraft and integration

> **SUPERSEDED — 2026-06-09 hydrology/water scorch.** Hydrology + all water
> (rendering, query/physics, swimming, authored basins) stripped to first
> principles on 2026-06-09; to be reworked in a future terrain/world-generator
> cycle that re-introduces a water level + real-time debug visualization.
> Watercraft code (Sampan, PBR, WatercraftPhysics, WatercraftPlayerAdapter) is
> kept DORMANT — boats no longer spawn — and returns when water is rebuilt; the
> buoyancy/sampler types were relocated to
> `src/systems/vehicle/WatercraftBuoyancyTypes.ts`. This memo is retained as
> history.

Status: superseded (was closed; watercraft dormant after the 2026-06-09 water strip)
Owning subsystem: environment / water
Opened: cycle-2026-05-04
Code-complete: cycle-voda-3-watercraft 2026-05-18 (owner playtest deferred under autonomous-loop)

## Latest evidence

6 PRs landed under `cycle-voda-3-watercraft` across R1/R2. R1: [#260](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/260) `2026-05-17T23:52:59Z` watercraft-physics-core (new `src/systems/vehicle/WatercraftPhysics.ts`, 620 LOC under ≤700 ceiling; generalizes `GroundVehiclePhysics` chassis-conform with water-surface conform via the VODA-2 buoyancy contract; state = position/velocity/angularVelocity/quaternion/enginePower + hull-sample-points; per-hull-sample buoyancy via `BuoyancyForce.applyAtPoint`; throttle drives forward force; rudder drives yaw; quadratic drag; river current force from VODA-2 flow contract; wave heave + pitch from per-sample y-variance; beach/bank docking via `ITerrainRuntime.getHeightAt` grounded-state transition), [#259](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/259) `2026-05-18T00:23:14Z` watercraft-physics-tests (behavior tests + stub→real swap at merge). R2: [#261](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/261) `2026-05-18T09:59:09Z` watercraft-physics-damping-fix (vertical drag + convergent flow coupling — closed 2 real defects flagged by R1 swap reviewer), [#262](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/262) `2026-05-18T09:59:43Z` sampan-integration (new `src/systems/vehicle/Sampan.ts` IVehicle impl + `WatercraftPlayerAdapter` + `SampanSpawn` + `OperationalRuntimeComposer.wireSampanRuntime` wire; 6m × 2m hull, low power, single seat, W/S throttle + A/D rudder + F enter/exit, third-person follow camera), [#264](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/264) `2026-05-18T13:10:05Z` pbr-integration (new `src/systems/vehicle/PBR.ts` IVehicle impl + PBR composer wire; 9.4m hull with twin water-jet drive, two M2HB twin mounts forward + aft, driver + two gunners + one passenger; reuses `WatercraftPlayerAdapter` for driver seat; M2HB twins via cycle #6 emplacement pattern parented to PBR hull; B1/B2/B3 fixes — world-space aim composition closes a latent local-only-forward bug in `M2HBEmplacement` + `EmplacementPlayerAdapter` + `NpcM2HBAdapter`; cycle-#6 ground-fixed emplacements unaffected via identity-quaternion no-op; first combat-reviewer CHANGES-REQUESTED → APPROVE after fix + post-rebase verification on `pbr-verify` worktree), [#263](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/263) `2026-05-18T13:29:26Z` voda-3-playtest-evidence (`docs/playtests/cycle-voda-3-watercraft.md` + capture script + PLAYTEST_PENDING row; deferred under autonomous-loop posture). Water sampler wiring for Sampan + PBR deferred as a follow-up (both currently land on dry terrain until `OperationalRuntimeComposer.wireSampanRuntime` + `wirePBRRuntime` get `setWaterSampler(waterSystem)` calls; requires plumbing waterSystem reference through the vehicle composer surface). combat120 p99 CI measurement_trust=warn across all cycle PR runs (GPU runner starvation; not a real regression — PR #260 test-only baseline shows the same numbers; cycle #13 baselines-refresh expedited). No fence change. No external physics library added. Owner walk-through deferred under autonomous-loop posture; full owner playtest sign-off blocks on [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md) row.

## Success criteria

- [x] Sampan and PBR (river patrol boat) rigged with player enter/exit (#262 + #264).
- [x] PBR M2HB twin mounts firable + gunnable from world-space-correct aim direction (#264 + B1/B2/B3 fixes).
- [x] Beach/bank docking via grounded-state transition (#260 — visible when boats sit on hull-bottom-on-terrain state).
- [ ] Bridge interactions verified in playtest (deferred to PLAYTEST_PENDING; A Shau may not have a bridge in driveable range).
- [ ] Owner playtest walk (mount Sampan, navigate A Shau river up + down, exit at bank; mount PBR, drive upstream against current, fire M2HB at riverbank target, swap seats; observe wave heave + rocking at idle) — deferred to PLAYTEST_PENDING.
