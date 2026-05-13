# Ground-vehicle physics architecture

Last verified: 2026-05-13

Branch: `exp/konveyer-webgpu-migration`. Companion to
[ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md)
(addendum 2026-05-13 extends its "no external physics lib" stance to
ground vehicles) and to the queued
[docs/tasks/vekhikl-1-jeep-spike.md](../tasks/vekhikl-1-jeep-spike.md)
task brief (this memo unblocks it). Parallel
`docs/rearch/TANK_SYSTEMS_2026-05-13.md` covers tracked vehicles.

**TL;DR.** Drive the M151 jeep MVP on a hand-rolled chassis model
mirroring `HelicopterPhysics.ts`: fixed-1/60s integration, four wheel
sample points conformed to `ITerrainRuntime` height + normal,
Ackermann yaw, drive/brake/drag forces, slope-stall scaling. No
external physics library. Defer Rapier evaluation to a named gate
(multi-vehicle collision, ragdoll, watercraft buoyancy, or
articulated trucks); at the gate the ~600 KB gzipped bundle of
`@dimforge/rapier3d-compat` is justified by leverage the hand-rolled
model cannot match. This memo names the state shape, force list,
integration loop, integration surface (new `GroundVehiclePhysics.ts`
+ `GroundVehiclePlayerAdapter.ts`, config block on
`GroundVehicle.ts`), and the behavior-test plan that VEKHIKL-1
consumes verbatim.

## State of play

`src/systems/vehicle/IVehicle.ts:4` declares `VehicleCategory =
'helicopter' | 'fixed_wing' | 'ground' | 'watercraft'`, so `'ground'`
is already first-class. `src/systems/vehicle/GroundVehicle.ts:17` is
an M151 stub: implements `IVehicle`, hard-codes four seats
(`DEFAULT_M151_SEATS`, lines 6-11), exposes seat / position /
quaternion / velocity getters, and ships an empty `update(_dt)` at
line 91. No driving model, no terrain conform, no behavior tests.

The simulation template is
`src/systems/helicopter/HelicopterPhysics.ts:49` — a 438-line
fixed-step rigid-body sim with `position` / `velocity` /
`angularVelocity` / `quaternion` / `engineRPM` / `isGrounded` /
`groundHeight` state (lines 23-31), input smoothing
(`smoothControlInputs`, line 151), per-step force accumulation
(`calculateForces`, line 206), explicit Euler integration (line
293), exponential damping (line 308), and ground-collision clamp
(line 313). Fixed step `1 / 60` (line 50) is driven by
`FixedStepRunner`. The test pattern at
`src/systems/helicopter/HelicopterPhysics.test.ts` is behavior-only:
"applies gravity when airborne with zero collective" (line 35),
"bounce on hard landing" (line 176), "rotates when yaw is applied"
(line 135).

Terrain queries already live on the fenced `ITerrainRuntime`
(`src/types/SystemInterfaces.ts:219`): `getHeightAt` (line 220),
`getEffectiveHeightAt` (221), `getSlopeAt` (222), `getNormalAt`
(223), `getPlayableWorldSize` (225). No fence change required by
this work.

No external physics library is bundled. A `package.json` grep for
`rapier`, `cannon`, `jolt`, `ammo.js`, `physijs` returns empty;
`HelicopterPhysics` is hand-rolled per
[ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md)
§2.1. The M151 GLB exists at
`public/models/vehicles/ground/m151-jeep.glb` per the VEKHIKL-1
brief.

## Decision: hand-rolled MVP vs. Rapier

### Recommendation

**Hand-rolled MVP, mirroring `HelicopterPhysics.ts`.** Three reasons:

1. [ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md)
   §2.1 + §6 already locks in the "no external physics lib" stance
   for helicopter and fixed-wing; the controlling clause ("Do NOT
   rewrite `Airframe` on Rapier ... only reconsider if multi-vehicle
   parity ... becomes a concrete blocker") fires at multi-vehicle
   parity, not at one MVP. Extending to ground at this scale does
   not break the stance.

2. The dependency graph on `exp/konveyer-webgpu-migration` is
   intentionally tight while the WebGPU migration probes the
   renderer. Bundling Rapier adds a WASM module, init-ordering work
   inside `bootstrap.ts`, and a second physics timeline competing
   with `HelicopterPhysics`. Non-zero risk for zero marginal MVP
   value.

3. The wheeled-vehicle MVP is small: chassis pose + linear velocity
   + yaw-dominant angular velocity + driver inputs. Forces: drive +
   rolling drag + air drag + brake + gravity. Ground constraint:
   four `getHeightAt` + one `getNormalAt`. Steering: Ackermann
   yaw rate (`omega = v * tan(steer) / wheelbase`). No broadphase,
   no constraint solver, no contact manifold. Rapier's leverage
   starts at multi-chassis collision, articulated joints (towed
   trailers), or ragdoll coupling. At a single jeep on terrain
   Rapier's solver graph is empty.

### Deferred Rapier evaluation gate

Not "Rapier now or never". Re-evaluate when any of these lands as
committed-cycle scope:

- **(i) Multi-vehicle collision interactions.** Two jeeps ramming;
  an APC pushing a stalled jeep; tank flattening a parked jeep.
  Hand-rolled vehicle-vehicle response is a known cost trap
  (broadphase + manifold + restitution + friction cone).
- **(ii) Ragdoll for ejected occupants.** Body-flop on terrain after
  a flipped jeep. Multi-body articulated chains are a second
  physics engine in disguise.
- **(iii) Watercraft buoyancy (VODA-3).** The strategic VODA
  watercraft line. Buoyancy is a pressure integral over a submerged
  hull; Rapier ships a buoyancy plugin reusing the same rigid-body
  shape.
- **(iv) Multi-axle articulated trucks.** A 5-ton + fuel trailer;
  self-propelled gun + ammunition trailer. Hinge / slider
  constraints between chassis. Worst-effort-per-leverage curve.

Bundle pre-check: `@dimforge/rapier3d-compat` is ~600 KB gzipped;
no bundle-size SLO in this project's Cloudflare audit
(`artifacts/live-audit-2026-05-09/...`) gates this. Bundle cost is
**not** the reason to defer — leverage is. The gate triggers on
**any one** of (i)-(iv); re-evaluation produces a follow-up memo,
not automatic adoption.

## Hand-rolled MVP architecture

### State shape

Mirror `HelicopterState` (`HelicopterPhysics.ts:23`):

```
GroundVehicleState {
  position: THREE.Vector3,        // world-space chassis origin
  quaternion: THREE.Quaternion,   // chassis orientation
  velocity: THREE.Vector3,        // linear, world-space
  angularVelocity: THREE.Vector3, // yaw-dominant for v1
  engineRPM: number,              // 0-1 for audio/HUD
  isGrounded: boolean,            // any wheel in contact
  groundHeight: number,           // averaged from four wheel samples
}

GroundVehicleControls {
  throttle: number,    // [-1, +1] (negative = reverse)
  steerAngle: number,  // [-maxSteer, +maxSteer] radians
  brake: number,       // [0, 1]
  handbrake: boolean,  // rear-axle longitudinal lock
}
```

`throttle` is bidirectional rather than `collective`'s [0, 1].
`handbrake` is the boolean analog to `autoHover` (`HelicopterControls`,
line 14-21). Input smoothing follows the helicopter pattern at
`HelicopterPhysics.ts:151`: per-frame lerp toward raw input at
`inputSmoothRate * dt`. Steering gets the same smoothing so keyboard
taps don't snap-yaw.

### Integration

**Fixed step at 1/60 s** inside `update(deltaTime)`, identical to
`HelicopterPhysics.update` (line 95) and `FIXED_STEP_SECONDS` (line
50). Reuse `FixedStepRunner` so step accounting is consistent across
vehicles. Per fixed step:

1. Snapshot previous state (mirrors `previousState`, line 73).
2. Smooth control inputs.
3. Sample terrain at four wheel positions.
4. Update engine RPM (cosmetic; not load-bearing in v1).
5. Compute forces; integrate linear velocity (explicit Euler).
6. Compute Ackermann yaw rate; integrate orientation.
7. Conform body to terrain normal (pitch + roll).
8. Apply damping.
9. Enforce world-boundary clamp (mirror `enforceWorldBoundary`,
   line 344).

### Forces per step

Accumulate in chassis-local frame where natural; transform to world
via the chassis quaternion before adding to velocity.

- **Drive.** `F_drive = throttle * engineTorque / (gearRatio *
  wheelRadius)`, along chassis-forward. Single gear in v1; multi-gear
  and clutch deferred.
- **Rolling drag.** Linear: `F_roll = -rollingCoef * speed`, along
  velocity. Models tire scrub; prevents perpetual coasting.
- **Air drag.** Quadratic: `F_air = -airDragCoef * speed^2`, along
  velocity. Caps top speed when drive balances drag.
- **Brake.** `F_brake = -brake * maxBrake`, along velocity when
  `speed > epsilon`. Handbrake adds a rear-axle lock at full
  magnitude (differential feel is v2).
- **Gravity.** `(0, -9.81 * mass, 0)`. Always present.

Acceleration `a = F_total / mass`; explicit Euler `v += a * dt`.
Same pattern as `HelicopterPhysics.ts:255`.

### Ground constraint

The load-bearing distinguishing feature versus helicopter. For each
of the four wheel sample points (FL, FR, RL, RR), in chassis-local
coords transformed to world via the chassis pose:

```
h_i = terrain.getHeightAt(wx_i, wz_i)
body.position.y = avg(h_i) + chassisHeightAboveAxle
```

v1 snaps the chassis to ground every step — no suspension travel,
no spring oscillation. Cosmetic axle-relative chassis sag is
deferred (see Open questions).

Body pitch and roll come from one normal sample at the chassis
center:

```
n = terrain.getNormalAt(cx, cz)
```

Compose the conform quaternion via
`THREE.Quaternion.setFromUnitVectors(localUp, n)` with the yaw
quaternion. Yaw stays from the integrated `angularVelocity.y`; only
pitch + roll slave to terrain. Mirror the `_axis` / `_deltaQ` scratch
pattern at `HelicopterPhysics.ts:300`.

Edge cases:

- Wheel sample outside the playable extent: clamp to
  `terrain.getPlayableWorldSize()` (mirrors the helicopter
  convention).
- Terrain not ready at a sample: treat as `isGrounded = false`;
  preserve last frame's pose. Mirrors the `groundHeight` init at
  `HelicopterPhysics.ts:71`.

### Steering: Ackermann approximation

Yaw rate is kinematic, not torqued in:

```
omega_y = (v_forward / wheelbase) * tan(steerAngle)
```

`v_forward` is the chassis-forward component of velocity (positive
forward, negative reverse — reverse correctly inverts steering
response). Integrate into yaw quaternion using the axis-angle
pattern at `HelicopterPhysics.ts:299-305`, restricted to world Y.

**Speed-sensitive authority.** At very low speed full lock is fine;
above ~20 m/s full lock snaps the chassis around in an arcade-reject
way. Scale `steerAngle`:

```
steerAuthority = clamp(
  1 - (forward_speed - lowSpeedCutoff)
      / (highSpeedCutoff - lowSpeedCutoff),
  0.3, 1)
```

Starting values: `lowSpeedCutoff ~ 5 m/s`, `highSpeedCutoff ~ 25
m/s`. Tuning belongs with the spike playtest, not this memo. The
behavior test runs below `lowSpeedCutoff` so authority is 1.0 and
the closed-form Ackermann formula applies.

### Slope handling

If `terrain.getSlopeAt(cx, cz) > maxClimbSlope`:

```
slopeFactor = clamp(1 - slope / maxClimbSlope, 0, 1)
F_drive_effective = F_drive * slopeFactor
```

At `slope == maxClimbSlope` drive force goes to zero. Gravity keeps
acting; sustained over-`maxClimbSlope` ascent rolls the vehicle
backward. This produces the "stalled at the wall" feel without a
separate handler. M151 historical spec is roughly 60 percent grade
(~31 deg) as a starting value; exact tuning lives with the spike.

### Collision (v1)

**Terrain only.** Vehicle-vehicle, vehicle-static-obstacle (trees,
sandbags, structures), and bullet-vehicle collision are deferred.
The chassis penetrates trees as a known MVP visual artifact —
matches the VEKHIKL-1 brief's "spike, not full integration" framing.
Vehicle-terrain collision *is* the conform step (Y is set, not
integrated). Unlike helicopter (which bounces in
`enforceGroundCollision`, line 313), ground vehicles conform.

## Integration surface

### New files

- **`src/systems/vehicle/GroundVehiclePhysics.ts`.** Mirrors
  `HelicopterPhysics.ts` shape: class with `update(dt, terrain)`,
  `setControls(Partial<GroundVehicleControls>)`,
  `setEngineActive(boolean)`,
  `getState(): Readonly<GroundVehicleState>`,
  `getInterpolatedState()`, `getControls()`, `resetToStable(pos)`,
  `getGroundSpeed()` (renamed from `getAirspeed`), `getHeading()`,
  `getEngineAudioParams()`. `FixedStepRunner` and pooled scratch
  vectors at module scope per helicopter convention. Estimated
  350-450 lines.

- **`src/systems/vehicle/GroundVehiclePlayerAdapter.ts`.** Mirrors
  `HelicopterPlayerAdapter.ts` (line 47). Implements
  `PlayerVehicleAdapter` (`PlayerVehicleAdapter.ts:58`).
  `vehicleType = 'ground'`. `inputContext = 'ground'` — the
  `'ground'` value must exist in `InputContextManager`'s
  `InputContext` union; verify before the spike and add as a
  non-fence union extension if missing. `onEnter` snapshots player
  position, sets HUD to a `kind: 'ground'` `VehicleUIContext` with
  capabilities `{canExit, canOpenMap}` and `canFirePrimary = false`
  in v1. `onExit` restores. `update(ctx)` maps `input.forward/back`
  → `throttle`, `input.left/right` → `steerAngle`, `input.brake` →
  `brake`, `input.handbrake` → `handbrake`, then calls
  `groundPhysics.setControls(...)`. Estimated 200-300 lines.

- **`src/systems/vehicle/GroundVehiclePhysics.test.ts`.** Behavior
  tests; see Test plan.

### Modified files

- **`src/systems/vehicle/GroundVehicle.ts`.** Add a config block:

  ```
  GroundVehicleConfig {
    mass: number,            // kg, M151 ~ 1120
    wheelbase: number,       // m, M151 ~ 2.06
    trackWidth: number,      // m, M151 ~ 1.42
    engineTorque: number,    // N*m at reference RPM
    gearRatio: number,       // single gear v1
    wheelRadius: number,     // m, M151 ~ 0.39
    maxSteer: number,        // rad, ~ 0.6 (35 deg)
    maxBrake: number,        // N, ~ stop in <2s
    maxClimbSlope: number,   // rad, M151 ~ 0.54 (31 deg)
    rollingCoef: number,     // tunable
    airDragCoef: number,     // tunable
    velocityDamping: number, // 0.96 starting
    angularDamping: number,  // 0.85 starting
    inputSmoothRate: number, // 8.0 starting
  }
  ```

  Construct a `GroundVehiclePhysics` internally; route the current
  empty `update(_dt)` (line 91) through `groundPhysics.update(dt,
  terrain)` and write the result back to `this.object.position` /
  `this.object.quaternion` / `this.velocity`. Seat layout at lines
  6-11 stays; per-vehicle seat configs are a separate slice.

- **Adapter registration site (`VehicleManager.ts` or equivalent).**
  Register `GroundVehiclePlayerAdapter` so the
  `PlayerVehicleController`-equivalent path finds it for category
  `'ground'`. The pattern is
  `VehicleSessionController.registerAdapter(adapter)`
  (`VehicleSessionController.ts:19`).

### Unchanged

- **`IVehicle.ts`** — already accepts `'ground'`. No fence change.
- **`NPCVehicleController.ts`** — passenger boarding works
  generically against `IVehicle.enterVehicle` / `exitVehicle`. NPC
  drivers for ground vehicles are out of scope (VEKHIKL-1
  Non-goals).
- **`ITerrainRuntime`** (fenced, `SystemInterfaces.ts:219`) — all
  needed queries already exist. No `[interface-change]` PR.

## Test plan

Behavior tests only, per [docs/TESTING.md](../TESTING.md). Mirror
the style of `HelicopterPhysics.test.ts` and
`Airframe.groundRolling.test.ts`. Tests live in
`GroundVehiclePhysics.test.ts` at L2 (one system + mocked
`ITerrainRuntime`).

1. **Static equilibrium on flat ground.** Mocked-flat terrain
   (`getHeightAt → 0`, `getNormalAt → (0,1,0)`). Step 60 frames at
   `dt = 1/60`, zero controls, engine inactive. Assert `|velocity|
   < epsilon`, `|angularVelocity| < epsilon`, `position.y ==
   axleOffset`. The system does not drift at rest.

2. **Acceleration to expected top speed.** Engine active, `throttle
   = 1.0`, flat terrain, 600 frames. Assert forward speed is
   monotonically non-decreasing for ~3 s and plateaus within
   tolerance of the analytical top speed (`sqrt(F_drive /
   airDragCoef)` once rolling resistance is small). Asserts the
   plateau, not intermediate values — retuning drag or torque
   doesn't break the test.

3. **Ackermann yaw rate vs analytical ground truth.** Engine
   active, `throttle = 0.5`, `steerAngle = 0.3` rad, flat terrain.
   60 frames; measure mean yaw rate over the last 30. Assert
   `omega_y_measured ≈ (v_forward / wheelbase) * tan(0.3)` within
   ~10 percent. Speed is below the steering-authority cutoff so the
   closed form applies. Re-tuning Ackermann doesn't flip this test;
   changing the model (e.g. adding a slip term) does — correct
   sensitivity.

4. **Slope refusal at >maxClimbSlope.** Mock `getSlopeAt → maxClimbSlope
   + 0.1` at chassis position; `getNormalAt` returns the corresponding
   tilted normal; `getHeightAt` ramps along chassis-forward. Engine
   active, `throttle = 1.0`, no brake, 300 frames. Assert forward
   speed along ascent direction is `<= 0` for the last 60 frames
   (the vehicle stalls; may roll backward). Vehicle does not climb
   a wall on full throttle.

5. **Monotonic body-Y on flat ground (no porpoise).** Flat terrain,
   `throttle = 1.0`, 600 frames. Sample `position.y` every frame;
   assert max deviation from `axleOffset` is below ~0.05 m. The
   conform step does not introduce vertical oscillation.

Each test <100 ms. Total L2 cost <1 s, inside the TESTING.md L2
budget (`whole layer < 30 s`). No L3 / L4 tests for the MVP;
terrain integration, player adapter wiring, and player input round
trip are exercised by the VEKHIKL-1 spike's manual `?vehkikl=1`
smoke test per the brief's verification list.

## Open questions / decisions deferred

- **Suspension travel.** MVP snaps the chassis to averaged terrain
  height every frame. Visual axle-relative chassis sag during
  cornering / hard braking — the cosmetic spring that makes a jeep
  feel like a jeep — is deferred. Recommendation: ship a
  decorative-only Y offset in the spike if it fits the 300 LOC
  `JeepPhysics` budget VEKHIKL-1 sets; otherwise defer to a "feel"
  cycle.

- **Wheel slip / drift.** No lateral-tire-slip in v1. Hard cornering
  produces the kinematic Ackermann yaw rate, not a slip-augmented
  one. Drifting, oversteer, understeer, mud-vs-road grip variation
  are flagged for a later slice. The hook is a `lateralGrip(surface,
  slip)` function returning a lateral-force scale; v1 stubs to 1.

- **Tracks vs wheels (tanks).** Skid steering, neutral turn,
  ground-pressure model, per-track drive — different enough to
  warrant a separate primitive. The parallel
  `docs/rearch/TANK_SYSTEMS_2026-05-13.md` covers it. Tanks do not
  inherit from `GroundVehiclePhysics`; they're a sibling class
  targeting the same `IVehicle` surface.

- **Damage states.** Impact velocity → HP loss, engine-disable,
  tire-burst, chassis-disable — out of scope for MVP. The hook on
  `GroundVehicle.ts`: `applyImpact(impulse: THREE.Vector3, location:
  'engine' | 'wheel' | 'chassis')`, no-op in v1 aside from `health`
  accounting on `getHealthPercent()` (which currently returns 1.0
  or 0). A future "vehicle damage" cycle owns the full model.

- **Audio mixer hooks.** Engine RPM, surface scrub (gravel vs grass
  vs water), impact triggers — in scope for the spike playtest but
  not load-bearing for physics. `getEngineAudioParams()` ships in
  v1 (free; value is already computed during integration); driving
  the audio side is the player-adapter slice's responsibility.

- **NPC driver AI.** Out of scope for VEKHIKL-1 and this memo. When
  NPC ground drivers land they consume the same
  `GroundVehiclePhysics.setControls(...)` API the player adapter
  does, mirroring `NPCFixedWingPilot.ts` / `npcPilot/*`. No
  physics-layer change required.

## References

Source files cited:

- `src/systems/vehicle/IVehicle.ts` — `VehicleCategory` at line 4;
  `IVehicle` contract at line 16.
- `src/systems/vehicle/GroundVehicle.ts` — M151 stub; seats lines
  6-11; empty `update` line 91.
- `src/systems/vehicle/HelicopterPlayerAdapter.ts` — adapter
  template; class at line 47.
- `src/systems/vehicle/PlayerVehicleAdapter.ts` — adapter contract
  at line 58.
- `src/systems/vehicle/VehicleSessionController.ts` —
  `registerAdapter` at line 19.
- `src/systems/helicopter/HelicopterPhysics.ts` — simulation
  template; class line 49, state lines 23-31, fixed step line 50,
  forces line 206, integration line 293, ground collision line
  313.
- `src/systems/helicopter/HelicopterPhysics.test.ts` — behavior
  test pattern; gravity line 35, bounce line 176, yaw line 135.
- `src/types/SystemInterfaces.ts` — `ITerrainRuntime` at line 219
  (height, normal, slope, playable size at lines 220-225).
- `src/utils/FixedStepRunner.ts` — fixed-step driver reused by
  `HelicopterPhysics`.

Related docs:

- [docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md)
  — "no external physics lib" stance (§2.1, §6); addendum
  2026-05-13 extends to ground.
- [docs/rearch/KONVEYER_PRIMITIVE_SPIKES_2026-05-12.md](KONVEYER_PRIMITIVE_SPIKES_2026-05-12.md)
  — house-style reference.
- [docs/rearch/KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md](KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md)
  — house-style reference.
- [docs/tasks/vekhikl-1-jeep-spike.md](../tasks/vekhikl-1-jeep-spike.md)
  — task brief unblocked by this memo.
- `docs/rearch/TANK_SYSTEMS_2026-05-13.md` — parallel sibling memo
  for tracked vehicles.
- [docs/TESTING.md](../TESTING.md) — behavior-test contract; L2
  budget; forbidden assertion patterns.
- [docs/INTERFACE_FENCE.md](../INTERFACE_FENCE.md) — fenced surface
  rules; no fence change required.
