# Campaign: Craft Specialization

> **Date:** 2026-06-09 (scaffolded; not yet started)
> **Shape:** medium (3 sequenced cycles — manifest used despite ≤3 because the
> cycles are sequenced vertical slices with owner feel-walk barriers, not
> parallel)
> **Auto-advance:** yes between phases, EXCEPT each exit gate ends in an owner
> feel-walk — the orchestrator stages the build and halts for the walk before
> opening the next phase
> **Posture:** attended at phase boundaries (gunnery/sight feel is subjective;
> reticle correctness is verifiable but reticle *feel* is the owner's call)
> **Concurrency cap:** 5
> **Status:** Phase 1 `cycle-2026-06-09-ground-gunnery-craft` **COMPLETE
> 2026-06-09** (5/5: #362 #364 #366 #367 #369). Phase 2
> `cycle-2026-06-09-fixed-wing-craft` **COMPLETE 2026-06-10** (3/3: #370
> gunsight+ammo, #372 per-airframe ordnance incl. AC-47 broadside, #373
> camera fit + broadside view). Both exit feel-walks deferred to
> PLAYTEST_PENDING rows under the owner's 2026-06-09 `/goal`. Phase 3
> (helicopter) in flight. Running interleaved with the lighting-rig
> campaign (disjoint layers).

Source: 2026-06-09 owner direction — "all the HUD and crosshairs and cameras
and controllers and combat need to start being specialized by craft — none of
them even have good crosshairs for targeting or camera systems that fit that
or controls etc." A 2026-06-09 surface exploration produced the gap matrix.

## The finding (where the gap actually is)

Controls are mostly genuinely bespoke (heli and fixed-wing flight controls are
real), cameras are serviceable; the systematic gaps are **reticles, per-craft
weapon-state HUD, and aiming aids**:

- `src/ui/hud/CrosshairSystem.ts` knows exactly four modes (infantry +
  three helicopter variants); the pipper exists only for the AH-1 Cobra.
- **Tank gunner, M2HB, and all three fixed-wings aim with no sight at all**
  (crosshair hidden or infantry default). `TankGunnerAdapter` and
  `EmplacementPlayerAdapter` compute proper sight/barrel cameras — into which
  no reticle is drawn.
- `src/systems/vehicle/FixedWingModel.ts` gives A-1, F-4, and AC-47 one
  identical fixed forward hitscan (2.5° spread, hardcoded 600 rounds invisible
  to the player). The AC-47's signature broadside battery does not exist.
- Door-gun seats are not player-crewable; per-aircraft ordnance was the
  AVIATSIYA-5/6 deferral; NPC tank cannon is still unconstructed in prod
  (consultation-remediation follow-up).
- The seams for specialization already exist: the `CrosshairSystem` mode
  model, `IHUDSystem.setVehicleContext` descriptors, the camera provider
  slots, and `src/systems/vehicle/VehicleAdapterShared.ts` (extracted
  2026-06-09).

**Design constraint:** all new HUD/reticle work follows the Field Journal
design language ([FIELD_JOURNAL_UI.md](FIELD_JOURNAL_UI.md)) — no fallbacks,
no old-styling resurrection.

**Shape rule:** vertical slices per craft family — each cycle ships one
family's complete package (reticle + weapon HUD + camera fit + fire feel +
aiming aid), not horizontal layers across all craft. The shared reticle
framework ships inside the first slice with its first consumer.

## Campaign hard-stops (halt + surface to owner)

- Any `fence_change: yes` in an executor report (see Fence watch — one is
  plausibly required and owner-approved by design, but it still halts for the
  approval).
- >2 CI-red tasks in one round.
- `combat120` p99 regression >5% after any round.
- Worktree-isolation failure.
- `combat-reviewer` CHANGES-REQUESTED twice on the same task.
- Mobile-ui CI gate red (new HUD surfaces must pass the existing mobile gate).

## Phase 1 — `cycle-2026-06-09-ground-gunnery-craft`

**Why first:** ground gunnery is the deepest gap (two crewed weapons with
zero sight), the Phase-2-2026-06-09 wiring (cannon/M2HB fire on LMB) just
landed so the fire paths are fresh and verified, and the reticle framework's
first consumers live here.

**Task DAG:**

```
reticle-framework ──► tank-gunner-sight
                 └──► m2hb-gun-experience
npc-tank-cannon-wiring (root — makes tank combat two-way so the slice is
                        testable against live opposition)
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| reticle-framework | Extend the CrosshairSystem mode model into a per-craft reticle registry (Field-Journal-styled canvas reticles); add tank-gunner + emplacement-MG modes; route mode selection through the vehicle session (adapter onEnter/onExit → HUD), replacing today's hide-the-crosshair behavior. | `src/ui/hud/CrosshairSystem.ts`, `src/systems/vehicle/PlayerVehicleAdapterFactory.ts`, `src/systems/vehicle/VehicleSessionController.ts` | — | M; FENCE WATCH (setCrosshairMode lives on IGameRenderer) |
| tank-gunner-sight | M48 gunner sight: stadia/rangefinder reticle in the gunner camera, main-gun ammo + reload-state HUD panel (FJ language), turret-azimuth-vs-hull indicator, zoom step(s) on the existing computeGunnerSightCamera. | `src/systems/vehicle/TankGunnerAdapter.ts`, `src/ui/hud/` (new FJ panel), reticle registry | — | M |
| m2hb-gun-experience | M2HB emplacement: MG reticle, ammo/belt display, traverse-limit indication at the stops, barrel-camera fit pass (recoil/shake feel), tracer-walk verification. | `src/systems/vehicle/EmplacementPlayerAdapter.ts`, reticle registry, FJ panel | — | M |
| npc-tank-cannon-wiring | Construct TankCannonProjectileSystem for NPC tanks in prod (carried follow-up from consultation-remediation Phase 2): NPC M48s fire the cannon the player already can. | prod composition in `src/core/StartupPlayerRuntimeComposer.ts` + NPC fire path | combat | M |

**Exit gate:** owner feel-walk — board an M48, kill a target with the cannon
using the sight; crew the M2HB, walk tracers onto a target using the reticle;
take return cannon fire from an NPC tank. combat120 p99 flat.

## Phase 2 — `cycle-2026-06-09-fixed-wing-craft`

**Why second:** builds on the reticle framework; per-aircraft ordnance is the
largest single piece of deferred craft identity (AVIATSIYA-5/6) and the AC-47
broadside is the marquee item.

**Task DAG:**

```
fixedwing-gunsight ──► per-aircraft-ordnance
fixedwing-camera-fit (root)
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| fixedwing-gunsight | Reflector-style gunsight reticle per aircraft via the registry; visible ammo counter (kill the invisible hardcoded 600); gun convergence/boresight so the sight actually predicts the hitscan. | `src/systems/vehicle/FixedWingModel.ts`, reticle registry, `src/ui/hud/FixedWingHUD.ts` | — | M |
| per-aircraft-ordnance | Differentiate the three airframes: A-1 (guns + bomb/rocket loadout), F-4 (cannon + heavier ordnance), AC-47 (replace nose cannon with the broadside minigun battery + orbit-fire support). Per-airframe ammo/weapon-select HUD state. | `src/systems/vehicle/FixedWingModel.ts`, ordnance/weapon modules, `src/ui/hud/FixedWingHUD.ts` | combat (weapon/damage paths) | L — split per airframe if >400 net |
| fixedwing-camera-fit | Per-airframe camera tuning: cockpit/chase offsets, sight-line alignment with the gun solution, AC-47 broadside aiming view (look-down-left orbit view). | fixed-wing camera provider, `src/systems/vehicle/FixedWingModel.ts` | — | M |

**Exit gate:** owner feel-walk — strafe run in the A-1 using the sight; F-4
ordnance pass; AC-47 orbit with broadside fire on a zone. Each airframe feels
distinct. combat120 p99 flat.

## Phase 3 — `cycle-2026-06-09-helicopter-craft`

**Why third:** helicopters are the *least* broken family (bespoke controls,
HUD, and the only existing pipper) — this phase is upgrade + the door-gun
seat, not rescue.

**Task DAG:**

```
door-gun-seat ──► heli-hud-consolidation
gunship-reticle-upgrade (root)
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| door-gun-seat | Player-crewable UH-1 door-gun seat: seat-switch UX through the seat model (VehicleSessionController/seat binder), door-gun reticle via the registry, arc limits, ammo display. | `src/systems/helicopter/HelicopterWeaponSystem.ts`, seat/session modules, reticle registry | combat (door-gun fire path) | L |
| gunship-reticle-upgrade | AH-1 pipper upgrade: rocket-fall lead cue (CCIP-lite), per-weapon reticle states (rockets vs turret), ammo/weapon-select state surfaced in HelicopterHUD. | `src/ui/hud/CrosshairSystem.ts`, `src/ui/hud/HelicopterHUD.ts`, `src/systems/helicopter/HelicopterWeaponSystem.ts` | combat | M |
| heli-hud-consolidation | Per-variant HUD descriptors through setVehicleContext (transport vs gunship vs attack get the right panels, not a shared superset); retire any duck-typed variant checks in HelicopterHUD. | `src/ui/hud/HelicopterHUD.ts`, `src/types/SystemInterfaces.ts` only if unavoidable | — | M; FENCE WATCH (IHUDSystem) |

**Exit gate:** owner feel-walk — ride a UH-1, switch to the door gun, fire on
targets mid-flight; Cobra rocket run using the lead cue. combat120 p99 flat.

## When a phase opens (per `AGENT_ORCHESTRATION.md`)

Phase briefs are authored at each phase's open, NOT up front. At each open:
write briefs in `docs/tasks/`, populate the DAG in `AGENT_ORCHESTRATION.md`
"Current cycle", re-run `npx tsx scripts/cycle-validate.ts <slug>`. All three
cycle IDs pre-validated 2026-06-09 against the stoplist.

## Fence watch

Two named risks, both plausibly **required** rather than accidental:

- `reticle-framework` (Phase 1): `setCrosshairMode` lives on `IGameRenderer`
  (fenced). New modes may extend its type.
- `heli-hud-consolidation` (Phase 3): per-variant descriptors may extend
  `IHUDSystem.setVehicleContext` (fenced).

Either is an `[interface-change]` PR + the fence hard-stop fires for owner
approval. Budget one approval round into each of those phases.

## Adjacent follow-ups that may fold in (decide at phase open, not now)

- `rocket_run` IFF follow-up (SVYAZ-3 air-support call-in) — adjacent to
  Phase 2 ordnance work.
- Owner-display/resupply isBlufor sweep — adjacent to any HUD panel task.
- GPU surface grid lift to 1024 — NOT adjacent; stays in the backlog.

## Non-goals

- New vehicle types or new weapons beyond differentiating what exists.
- NPC crew AI for the door gun (player-crewable only this campaign; NPC door
  gunners are a future cycle).
- Infantry weapon/HUD changes (Field Journal infantry HUD is shipped and
  accepted scope).
- Lighting/material work — that is
  [CAMPAIGN_2026-06-09-lighting-rig.md](CAMPAIGN_2026-06-09-lighting-rig.md).
