# Tank systems architecture

Last verified: 2026-05-13

Branch: `exp/konveyer-webgpu-migration`. Sibling to
[GROUND_VEHICLE_PHYSICS_2026-05-13.md](GROUND_VEHICLE_PHYSICS_2026-05-13.md)
(the wheeled-chassis foundation) and to
[ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md)
(addendum 2026-05-13 extends its "no external physics lib" stance to
ground vehicles, which subsumes tanks). Parallel
`docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` covers the
AudioWorklet / Rust-WASM ballistic-solver candidates cross-referenced below.

**TL;DR.** Tanks are a sibling of the wheeled-chassis MVP, not a
subclass. Reuse the chassis-conform pattern and fixed-1/60 s
integration loop from `GROUND_VEHICLE_PHYSICS_2026-05-13.md`
(§"Integration", §"Ground constraint"); substitute Ackermann with
skid-steer (independent L + R track speed, blended from W/S/A/D). Add
three primitives: a turret rig with capped yaw + barrel pitch slew, a
gunner seat that reuses the helicopter seat-swap pattern and routes
NPC gunner fire through the existing `CombatantAI` target-acquisition
pipeline, and a ballistic main-cannon projectile
(`TankCannonProjectile`) with gravity-only arc, arming distance, and
damage-type resolution. Damage runs as HP bands with three visual
transitions and a separate tracks-blown state that immobilizes
locomotion while leaving turret + cannon functional. No external
physics library; no fence change. The memo names the state shape,
integration surface (`Tank.ts`, `TrackedVehiclePhysics.ts`,
`TankTurret.ts`, `TankCannonProjectile.ts`, `TankPlayerAdapter.ts`,
`TankGunnerAdapter.ts`), the behavior-test plan, and the
owner-decision list a future VEKHIKL-4 cycle consumes.

## State of play

Nothing tank-specific exists today. `src/systems/vehicle/IVehicle.ts:4`
declares `VehicleCategory` including `'ground'`, and `IVehicle.ts:5`
already declares `SeatRole = 'pilot' | 'gunner' | 'passenger'` — the
gunner seat does not require a fence change. `GroundVehicle.ts:17` is
the M151 stub the wheeled MVP builds out; tanks land as separate
`Tank.ts` (or `TrackedVehicle.ts`) implementing `IVehicle` with
category `'ground'`, **not** as a subclass.

The helicopter has a multi-occupant pattern tanks mirror: pilot via
`HelicopterPlayerAdapter.ts:49`, crew-served weapons via
`src/systems/helicopter/HelicopterDoorGunner.ts:35`. No first-class
"player gunner switches from pilot seat" hotkey yet, but
`IVehicle.getSeats()` and `enterVehicle(_, 'gunner')` already exist —
tanks ship the first player-gunner-seat usage.

No turret abstraction exists. No ballistic-projectile class exists in
a vehicle context — the closest is `MortarBallistics.ts:22`
(gravity-only arc, `GRAVITY = -9.8`, ground collision at line 52).
`CombatantBallistics.ts` is rifle-scale hitscan, not arced. Tank
cannon shells need slower rate, higher mass, longer travel time,
arming distance, and damage-type resolution the mortar model does not
carry — the mortar trajectory loop is a template, not the answer. No
external physics library is bundled
(`GROUND_VEHICLE_PHYSICS_2026-05-13.md` §"Decision"); tanks fall
inside the same gate.

## Locomotion: skid-steer

The single biggest delta from the wheeled chassis. Where the wheeled
vehicle's yaw rate is kinematic from one steering angle
(`omega_y = v_forward / wheelbase * tan(steerAngle)`,
`GROUND_VEHICLE_PHYSICS_2026-05-13.md` §"Steering"), the tank has
**two independent track speeds** producing forward motion + yaw as a
coupled function:

```
throttleAxis  = W - S                              // [-1, +1]
turnAxis      = D - A                              // [-1, +1]
leftTrackCmd  = clamp(throttleAxis - turnAxis, -1, 1)
rightTrackCmd = clamp(throttleAxis + turnAxis, -1, 1)
```

Per-track commands feed `leftTrackSpeed` / `rightTrackSpeed` through
the `inputSmoothRate` lerp pattern at
`HelicopterPhysics.smoothControlInputs:151`. Chassis-frame velocities
follow standard differential-drive kinematics:

```
v_forward = (leftTrackSpeed + rightTrackSpeed) * 0.5 * maxTrackSpeed
omega_y   = (rightTrackSpeed - leftTrackSpeed) * maxTrackSpeed
            / trackSeparation
```

`trackSeparation` is the lateral distance between track centerlines
(M48 ~ 2.92 m; T-55 ~ 2.64 m). At `throttle=0, turn=+1` both tracks
counter-rotate, `v_forward = 0`, pure yaw — pivot-in-place wheeled
vehicles cannot do. At `throttle=+1, turn=+1` both tracks are
forward (one faster), producing a gentle arc.

**No steering-wheel angle.** Where the wheeled vehicle's `steerAngle`
lives in state, tanks have `leftTrackSpeed` / `rightTrackSpeed`. The
integration loop from `GROUND_VEHICLE_PHYSICS_2026-05-13.md`
§"Integration" steps 1-9 is unchanged; only the yaw-rate substep
changes.

**Higher max slope** (lower ground pressure per unit area):
`maxClimbSlope_tank ~ 0.61 rad (~35 deg)` vs. wheeled's `0.54 rad
(~31 deg)`. Slope-stall path from
`GROUND_VEHICLE_PHYSICS_2026-05-13.md` §"Slope handling" unchanged
in shape; only the constant differs.

**Track ground-clearance: more sample points.** Wheeled samples four
wheels (`GROUND_VEHICLE_PHYSICS_2026-05-13.md` §"Ground constraint");
tanks sample **eight points per side** (16 total) along the track
length, averaged the same way — smooths body pitch over rough terrain
("jeep bucks over a ridge" vs "tank rolls over it"). One
`getNormalAt` at chassis center still drives roll; per-track-segment
normals are articulated-track and out of scope.

Cosmetic-only: track dust + scrape sounds and `AudioWorklet`-based
engine-pitch modulation (parallel
`BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` memo) thread through
`getEngineAudioParams()`. Not architectural.

## Turret rig

Independent of chassis pose. Two new angular state variables:

```
TurretState {
  yawAngle: number,    // turret azimuth relative to chassis, radians
  pitchAngle: number,  // barrel elevation relative to turret, radians
  yawCmd: number,      // raw input, [-1, +1]
  pitchCmd: number,    // raw input, [-1, +1]
}
```

Rotation rates capped. Starting values: turret slew `~24 deg/sec` (M48
hydraulic), barrel elevation `~6 deg/sec`. Cap as input smoothing into
rate, then integrate:

```
yawAngle   += yawCmd   * maxYawRate   * dt; yawAngle = wrapAngle(...)
pitchAngle += pitchCmd * maxPitchRate * dt
pitchAngle = clamp(pitchAngle, minBarrelPitch, maxBarrelPitch)
```

Pitch clamps to historical envelopes (M48: `-9 deg` to `+19 deg`).
Yaw is unclamped (full 360). The pitch envelope is mechanical (barrel
hits deck / breech hits roof); asserted in the slew-cap test.

Visual rig: turret is a Three.js node parented to the chassis
`Object3D`; barrel parented to the turret. Two
`Quaternion.setFromAxisAngle` per frame, scratch-quaternion pattern at
`HelicopterPhysics.ts:300`. No new GLTF utility required if the GLBs
ship with named `turret` / `barrel` child nodes (owner asset decision
— see §"Decision points").

**Stabilizer (v2, not v1).** Real M48s had a primitive pitch
stabilizer (~±10 deg envelope); T-55 did not. v1 ships none — the
barrel sways over rough ground with the chassis, which is era-correct
and the trajectory test runs on flat ground where it doesn't matter.
v2 adds a `stabilized: boolean` config flag and an inverse-pitch
correction inside `maxStabilizerCorrection`.

**Co-axial machine gun.** Mounted on the turret yaw axis (turns with
the gun) and slaved to main-cannon pitch (the coax barrel is parallel
to the cannon). Reuses rifle-class weapon code under a different
muzzle origin + fire-rate config; muzzle world position is the turret
node's world transform plus a small local offset. Coax fire is
hitscan (matches `CombatantBallistics`), **not** ballistic — rate +
range fit hitscan's envelope. `TracerPool` reused unchanged.

## Gunner seat + multi-occupant control

**Driver controls the chassis** via input context `'ground'` — the
context the wheeled-vehicle adapter introduces as a non-fence union
extension at `src/systems/input/InputContextManager.ts:1`. Tanks
consume it; they do not add anything to driver-side input.

**Gunner controls the turret + main cannon + coax MG** via a new
input context `'tank_gunner'`. Mappings: Mouse X/Y → `yawCmd` /
`pitchCmd` (smoothed + slew-capped); LMB → main-cannon fire (one shot
per click; reload consumes time per §"Ballistic main cannon"); RMB →
coax full-auto; `R` → manual reload abort.

**Seat-swap hotkey.** `T` (or owner-bound) swaps driver ↔ gunner.
During swap, per-track speeds decay to zero through `velocityDamping`
and turret slew rates clamp to zero. Routes through
`IVehicle.enterVehicle` / `exitVehicle` (`IVehicle.ts:23-24`) with a
`preferredRole` argument; `VehicleSessionController` handles
role-based seat selection. Player-side seat-swap is **new** with the
tank slice (helicopter door gunner is NPC-only today) — flag for the
VEKHIKL-4 brief.

**NPC gunner.** When the gunner seat is occupied by an NPC, fire
decisions route through `CombatantAI.ts:60` — specifically the
target-acquisition pipeline (`AITargeting`, line 69, used by
`AIStateEngage` at line 65) — but the projectile spawn point and
ballistic model are the cannon's (`TankCannonProjectile`), not the
rifle's. Pattern mirrors `HelicopterDoorGunner.fireAtTarget`
(line 91). Aim error scales with movement speed + target range;
reuse the soldier-aim accuracy model with a separate
`tankGunnerAccuracy` config block so tank crews are not literally
soldier-accurate at 800 m. Starting envelope: 80% of soldier accuracy
at 100 m, 40% at 500 m, near-miss-only beyond 1000 m. Tunable in the
spike.

## Ballistic main cannon

The other meaningful delta from the wheeled MVP, which has no weapon
(`canFirePrimary = false`).

**Slow rate of fire.** One shot every 6-10 sec depending on ammo type.
HE / HEAT: 8 sec (loader fetch, slot, slam breech). AP sub-caliber:
5 sec. v1 ships a fixed reload per ammo type; reload-skill modeling
deferred.

**Ballistic projectile.** Gravity-accelerated arc. New class
`TankCannonProjectile`, per-instance lifetime until impact or
off-map. Per-shot state: `id, position, velocity, damageType: 'HEAT'
| 'APHE' | 'HE', mass (kg: HEAT ~13, APHE ~18, HE ~22),
distanceTraveled, armedAtRange (copy of damage-type's minRangeToArm),
fuseRemaining (self-destruct anti-orphan)`.

Integration: explicit Euler with gravity-only force (no drag in v1 —
A Shau engagement ranges make drag a tuning detail). Step matches
`MortarBallistics.computeTrajectory:52`:
`vel.y += GRAVITY * dt; pos += vel * dt`. Ground impact uses
`terrain.getHeightAt` per shot per frame (`ITerrainRuntime` fenced at
`src/types/SystemInterfaces.ts:219` — no fence change).

**Arming distance.** HEAT / APHE piezo fuses arm after a minimum
range from the muzzle (~20 m HEAT, ~50 m APHE — prevents detonation
on gunner sneeze). Inside `minRangeToArm` the projectile
**deflects/bounces** rather than detonates. HE has no arming distance.

**Damage types.**

- **APHE** — kinetic penetration vs. target armor (v1 armor is a
  scalar HP pool, no facing) plus post-penetration HE.
  Range-dependent: `pen = basePen * exp(-rangeFalloffCoef * range)`.
- **HEAT** — shaped charge, range-independent. Flat damage vs.
  armored targets; smaller infantry radius.
- **HE** — large radius, low penetration; bounces off any armor.

Projectile carries type; on impact, `applyDamage` dispatches:
HEAT → `{ type: 'shaped',  amount: HEAT_DAMAGE }`,
APHE → `{ type: 'kinetic', amount: aphePenAt(range) }`,
HE → `radialBlast(hitPos, HE_RADIUS, HE_FALLOFF)`.

**v1 ships HEAT only.** Single damage type keeps the test surface
small (one trajectory + one impact path; no range-dependent
penetration math; no per-target armor; no radial blast). APHE + HE
in v2. Owner decision — see §"Decision points".

**Tracer trail.** Wider, brighter, ~1.5 s persistence so the arc
remains visible the full flight. Separate `TankTracerPool` (~16
slots) so cannon shells don't fight rifle tracers for pool slots.

## Damage states

The historical reality "tracks blown becomes immobile turret" is
worth modeling separately from HP.

**HP bands.** Tank `health` is `[0, 1]` like `IVehicle.getHealthPercent()`.
Three thresholds:

- **HP < 70%.** Spawn dent decals (cosmetic; v1 static decal-mesh at
  fixed positions; v2 WebGPU storage-texture deformation per
  §"Decision points").
- **HP < 30%.** Spawn engine-deck smoke emitter (reuse the helicopter
  engine-damage emitter if one exists; otherwise new
  `TankSmokeEmitter` against the existing particle pool).
- **HP <= 0%.** Catastrophic kill. Turret detach (cosmetic — turret
  node reparents to scene, falls under gravity using the cannon
  shell's integrator, ~3 sec lifetime, no bounce). Chassis on fire.
  Occupants ejected — player gunner `onExit` fires with
  `exitMode = 'emergency_eject'` per `PlayerVehicleAdapter.ts:8`.

**Tracks-blown** (independent of HP). Hit classification: project hit
point to chassis-local; if `|local.x| > trackSeparation * 0.4` and
`local.y < hullTopY`, count as a track hit. A per-track damage
threshold (separate from HP) flips `blown = true`. A tank can be
`health = 0.95` and still immobilized.

When `blown` flips: matching `leftTrackSpeed` / `rightTrackSpeed`
pins to 0 (driver input accepted but ignored); turret + cannon + coax
remain functional; track-texture animation halts on the blown side
with a static damage decal at the track.

Both tracks blown = pillbox. The tactical reason to model this:
"immobile-but-firing tank" changes NPC engagement (don't flee a tank
that can't follow; do flee one that can). Named here so VEKHIKL-4
wires the NPC reaction without inventing a new state.

Damage application reuses the existing combatant damage adapter
pattern. Flag, don't redesign: `Tank.applyDamage(amount, hitLocation,
damageType)` on `Tank.ts`; routing flows through the same damage-event
bus the rifle / RPG / mortar already use.

## Integration surface

### New files

- **`src/systems/vehicle/Tank.ts`** (or `TrackedVehicle.ts`).
  Implements `IVehicle` with `category = 'ground'`. **Sibling, not
  subclass of `GroundVehicle.ts`**. Constructs `TrackedVehiclePhysics`
  + `TankTurret` internally. Owns `health` + per-track `blown` state.
  Seats: driver + gunner v1; loader + commander as passenger seats
  with no functional binding (mirrors `DEFAULT_M151_SEATS` at
  `GroundVehicle.ts:6`). ~250-350 lines.

- **`src/systems/vehicle/TrackedVehiclePhysics.ts`.** Mirrors
  `GroundVehiclePhysics.ts` (being authored next cycle per
  VEKHIKL-1) with skid-steer substitution per §"Locomotion".
  `FixedStepRunner` at 1/60 s. State: chassis pose + velocity +
  per-track smoothed speeds + `isGrounded` + averaged ground height
  (16 samples). Forces: per-track drive, rolling drag, air drag
  (negligible; kept for parity), brake, gravity. ~350-450 lines.

- **`src/systems/vehicle/TankTurret.ts`.** Per-tank turret state +
  yaw / pitch integration + slew-rate cap + coax MG mount transform.
  Owns turret + barrel `Object3D` references (extracted from GLB
  once, cached). Exposes `getMuzzleWorldTransform()`. ~150-200 lines.

- **`src/systems/vehicle/TankCannonProjectile.ts`.** Ballistic
  projectile per §"Ballistic main cannon". Pool-managed (~16 slots).
  **Grep first** — `grep -rn "class.*BallisticProjectile" src/` is
  empty as of this memo; fresh class expected. ~250-300 lines.

- **`src/systems/vehicle/TankPlayerAdapter.ts`** (driver).
  `vehicleType = 'tank'`, `inputContext = 'ground'`. W/S/A/D to
  throttle/turn, Space brake, T seat-swap. ~200-250 lines.

- **`src/systems/vehicle/TankGunnerAdapter.ts`** (gunner).
  `vehicleType = 'tank_gunner'`, `inputContext = 'tank_gunner'` (new
  union value at `src/systems/input/InputContextManager.ts:1`). Mouse
  to `yawCmd` / `pitchCmd`, LMB main cannon, RMB coax, T seat-swap.
  ~200-250 lines.

- **`TrackedVehiclePhysics.test.ts`, `TankTurret.test.ts`, `TankCannonProjectile.test.ts`.** Behavior tests per §"Test plan".

### Modified files

- **`src/systems/vehicle/VehicleSessionController.ts:19`** —
  `registerAdapter(new TankPlayerAdapter(...))` +
  `registerAdapter(new TankGunnerAdapter(...))`.
- **`src/systems/input/InputContextManager.ts:1`** — add
  `'tank_gunner'` to the `InputContext` union. Type-union extension,
  not a fenced interface change.

### Unchanged

- **`IVehicle.ts`** — accepts `'ground'`, declares `'gunner'`. No
  fence change.
- **`ITerrainRuntime`** (fenced, `src/types/SystemInterfaces.ts:219`)
  — all queries already exist. No fence change.
- **`NPCVehicleController.ts`** — generic passenger / gunner boarding.
  NPC drivers for tanks are an owner-decision §"Decision points"; if
  they ship, they consume the same `TrackedVehiclePhysics.setControls`
  API the player adapter uses, mirroring `NPCFixedWingPilot.ts`
  consuming `Airframe`.
- **`CombatantAI.ts`** — NPC gunner fire control routes through
  existing `AITargeting` (`CombatantAI.ts:69`). No orchestrator
  change. A new thin `TankGunnerAI` wrapper (if landed) calls the
  target-acquisition path and posts `Tank.fireCannonAt(target)` —
  pattern mirrors `HelicopterDoorGunner.fireAtTarget:91`.

## Test plan

Behavior tests only, per [docs/TESTING.md](../TESTING.md). Mirror
`HelicopterPhysics.test.ts` and the wheeled-vehicle plan from
`GROUND_VEHICLE_PHYSICS_2026-05-13.md` §"Test plan". L2 (one system
+ mocked `ITerrainRuntime`).

1. **Skid-steer pivot rate vs analytical truth.** Engine active,
   `throttle = 0, turn = 1.0`, flat terrain, 120 frames at `dt =
   1/60`. Mean yaw rate over last 60 frames: assert
   `omega_y ≈ maxTrackSpeed / trackSeparation` within ~10 percent.
   `v_forward < epsilon` (neutral turn). Closed-form differential-
   drive kinematics applies; re-tuning constants doesn't flip the
   test, changing the model does.

2. **Coupled throttle + turn produces forward + yaw.** `throttle =
   1.0, turn = 0.5`. Both `v_forward > 0` and `omega_y > 0`, with the
   analytical ratio
   `omega_y / v_forward ≈ (rightTrack - leftTrack) / ((rightTrack +
   leftTrack) * 0.5 * trackSeparation)` within ~15 percent. Asserts
   the coupling shape, not tuning constants.

3. **Slope refusal at >maxClimbSlope_tank.** Mocked `getSlopeAt →
   0.61 + 0.1` (above 35-deg tank max); tilted normal; height ramps
   along chassis-forward. `throttle = 1.0`, 300 frames. Forward
   speed along ascent `<= 0` over the last 60 frames. **Cross-vehicle
   parity:** at slope = 0.55 rad (above wheeled 0.54, below tank
   0.61) the tank ascends (`v_forward > 0`); the wheeled jeep stalls.
   The constant difference matters, not a copy-paste mistake.

4. **Turret slew rate cap.** `yawCmd = 1.0` for one frame, then 0.
   Delta yawAngle `< maxYawRate * dt + epsilon`. Same for `pitchCmd`.
   Pitch clamps: drive `pitchCmd = +1` for 1000 frames, assert
   `pitchAngle == maxBarrelPitch` within epsilon; same in reverse for
   `-1` and `minBarrelPitch`.

5. **Cannon-shell trajectory vs analytical parabola.** Spawn a
   `TankCannonProjectile` at known position + velocity (zero barrel
   pitch, muzzle velocity 1500 m/s along chassis-forward). No drag.
   200 frames. Trajectory matches `y(t) = y0 + v0_y * t + 0.5 *
   GRAVITY * t^2` and `x(t) = x0 + v0_x * t` within ~0.5% absolute
   on a 100 m flight. Confirms integration loop, not tuning.

6. **Damage band transitions.** Start `health = 1.0`. Apply 31%
   damage; assert `health == 0.69` and a dent decal handle exists.
   Apply 40% more; `health == 0.29` and smoke emitter exists. Apply
   30% more; `health == 0.0` and turret-detach fired (turret node
   reparented away, occupant `onExit` called with
   `exitMode = 'emergency_eject'`). Three checks, one test.

7. **Tracks-blown: locomotion ignored, turret functional.** Both
   tracks `blown = true`. Driver `throttle = 1.0, turn = 0` for 60
   frames. Assert `v_forward == 0, omega_y == 0`. In the same fixture
   call `tank.turret.setYawCmd(1.0)` for 60 frames; assert
   `turret.yawAngle` advanced by `maxYawRate * 1.0 sec` within
   epsilon. Turret slews while chassis is immobilized — the tactical
   key behavior.

Each test < 100 ms. Total L2 cost < 1 s, inside the
[docs/TESTING.md](../TESTING.md) L2 budget. No L3 / L4 for the spike;
player-adapter + render + HUD round-trip via the VEKHIKL-4 brief's
manual `?vekhikl=tank` smoke test.

## Decision points

Owner decisions, not memo-decided. The VEKHIKL-4 cycle should not
open without these confirmed.

- **Era and asset deck.** Recommendation: **M48 Patton (US) and T-55
  (NVA)**. Era-correct for A Shau Valley 1968. Asset acquisition is
  not committed by this memo — owner confirms before cycle opens. A
  different era shifts only config constants (`maxTrackSpeed`,
  `slewRate`, `armorHP`); locomotion + turret + cannon model is
  unchanged.

- **HEAT-only v1 vs full damage-type matrix.** Recommendation: **HEAT
  only in v1.** Single damage type, single ammo loadout, single
  impact path. Smallest test surface that still delivers the tactical
  feel. APHE + HE land in v2 when armor-faceting + blast-radius
  systems exist.

- **NPC tank crews in VEKHIKL-4 or deferred.** Recommendation: **NPC
  gunner in scope, NPC driver deferred.** Gunner reuses
  `CombatantAI` target acquisition + the door-gunner pattern. Driver
  needs tracked-vehicle pathfinding (the infantry-tuned navmesh per
  `docs/MOVEMENT_NAV_CHECKIN.md` does not apply directly) and is its
  own slice.

- **Turret stabilizer in v1 or v2.** Recommendation: **no stabilizer
  in v1.** Era-correct for T-55, slightly off for M48; flat-ground
  trajectory tests don't exercise it; "barrel sways with chassis" is
  part of the period feel. v2 slice.

- **Track-mark decals on terrain.** WebGPU storage-texture deformation
  is the candidate per `GROUND_VEHICLE_PHYSICS_2026-05-13.md`
  §"Open questions". Tanks amplify the need (more pronounced marks
  than wheels). v1: no terrain decals. v2: shared terrain-decal
  storage texture for wheels + tracks, gated on the WebGPU rollout
  per `KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md`.

## Open questions / deferred

- **Engine pitch / sound.** Out of scope for architecture. Reference
  `AudioWorklet` as a candidate in the parallel
  `BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` memo. The
  `getEngineAudioParams()` hook on `TrackedVehiclePhysics` ships in
  v1 (free; values computed during integration); driving the audio
  side is the player-adapter slice's responsibility.

- **Multiplayer crew coordination.** Two players (driver + gunner) —
  not in scope. Single-player only. The seat-swap pattern in §"Gunner
  seat" is single-player driver/gunner pivot, not multi-client.

- **Armor faceting / weak-spot modeling.** v2 only. v1 treats armor
  as a scalar HP pool. Side / rear / turret-ring / ammo-rack-cookoff
  modeling is the difference between a tank game and a tactical
  shooter with tanks in it; the owner has confirmed direction B
  (Vision B, CLAUDE.md §"Current focus") as "tanks in a tactical
  shooter", so facing-armor is a "if and when" decision.

- **Articulated track segments.** Real-world track-link physics
  (independent road wheels, drive sprocket + idler + return rollers)
  is its own simulation. v1 is a rigid chassis with track-length
  terrain sampling; per-segment suspension is one layer deeper.
  Deferred to v3 (post-MVP feel pass).

- **NPC driver path execution.** Out of scope per §"Decision points".
  When NPC tank drivers land, they consume
  `TrackedVehiclePhysics.setControls(...)` from a path-following PD
  controller mirroring `npcPilot/pdControllers.ts`. No physics-layer
  change required.

- **Vehicle-vehicle collision** (tank-on-tank, tank-on-jeep,
  tank-on-tree). Deferred to the Rapier gate per
  `GROUND_VEHICLE_PHYSICS_2026-05-13.md` §"Deferred Rapier evaluation
  gate" trigger (i). A tank flattening a parked jeep is the canonical
  bench case; if the cycle proves out as committed scope, the gate
  fires.

## References

Source files cited:

- `src/systems/vehicle/IVehicle.ts:4` — `VehicleCategory` includes
  `'ground'`; line 5 — `SeatRole` includes `'gunner'`; line 23 —
  `enterVehicle(occupantId, preferredRole?)`.
- `src/systems/vehicle/GroundVehicle.ts:6` — `DEFAULT_M151_SEATS`;
  line 17 — class.
- `src/systems/vehicle/PlayerVehicleAdapter.ts:58` — adapter
  contract; line 8 — `VehicleExitMode`.
- `src/systems/vehicle/HelicopterPlayerAdapter.ts:49` — adapter
  template.
- `src/systems/vehicle/VehicleSessionController.ts:19` —
  `registerAdapter`.
- `src/systems/helicopter/HelicopterPhysics.ts:49` — physics class;
  line 50 — `FIXED_STEP_SECONDS = 1/60`; line 151 —
  `smoothControlInputs`; line 300 — scratch-quaternion.
- `src/systems/helicopter/HelicopterDoorGunner.ts:35` — NPC gunner
  template; line 91 — `fireAtTarget`.
- `src/systems/weapons/MortarBallistics.ts:22` — ballistic class;
  line 52 — gravity-integrated trajectory loop; line 23 —
  `GRAVITY = -9.8`.
- `src/systems/combat/CombatantAI.ts:60` — AI orchestrator; line 69
  — `AITargeting`; line 65 — `AIStateEngage`.
- `src/systems/input/InputContextManager.ts:1` — `InputContext`
  union (extend with `'tank_gunner'`).
- `src/types/SystemInterfaces.ts:219` — `ITerrainRuntime` (fenced;
  no change).

Related docs:

- [GROUND_VEHICLE_PHYSICS_2026-05-13.md](GROUND_VEHICLE_PHYSICS_2026-05-13.md)
  — chassis foundation; sibling memo this one builds on.
- [ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md)
  — "no external physics lib" stance (§2.1, §6); 2026-05-13 addendum
  extends to ground; tanks fall inside that scope.
- [KONVEYER_PRIMITIVE_SPIKES_2026-05-12.md](KONVEYER_PRIMITIVE_SPIKES_2026-05-12.md)
  — house-style reference.
- [KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md](KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md)
  — house-style; v2 track-mark-decal cross-ref gates on WebGPU
  rollout.
- `BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` (parallel; queued) —
  AudioWorklet engine-pitch + Rust-WASM ballistic-solver cross-refs.
- [docs/TESTING.md](../TESTING.md) — behavior-test contract; L2
  budget; forbidden assertion patterns.
- [docs/INTERFACE_FENCE.md](../INTERFACE_FENCE.md) — fenced surface
  rules; **no fence change required by this memo.**
