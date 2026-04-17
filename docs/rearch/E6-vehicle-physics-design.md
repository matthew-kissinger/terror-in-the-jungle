# E6 — Vehicle physics rebuild: design proposal

Branch: `spike/E6-vehicle-physics-rebuild`
Date: 2026-04-16
Author: E6 spike executor
Status: Design doc for the unified fixed-wing architecture. Paired with
`E6-vehicle-physics-evaluation.md` (decision memo).

## 1. Current-system audit

### 1.1 Files and responsibilities

| File | Lines | Owns |
|------|------:|------|
| `FixedWingPhysics.ts` | 720 | Force model, aerodynamics, ground/air integration, phase machine, effector lerp, ground stabilization, liftoff gate, world boundary clamp, snapshot construction. |
| `FixedWingControlLaw.ts` | 283 | Intent→Command translation. Two hidden modes (`assisted`, `direct_stick`). Orbit command generator embedded as a third path (`orbitActive`). |
| `FixedWingPlayerAdapter.ts` | 461 | Raw input (keys, touch, gamepad, mouse) → intent. Owns `fixedWingStabilityAssist`, `fixedWingOrbitHold`, `fixedWingPilotMode`, mouse recenter rate, flight-mode selection. Enters/exits the vehicle, sets HUD, recalls camera angles, manages pointer lock. |
| `FixedWingConfigs.ts` | 338 | Per-aircraft physics config + per-aircraft operation (taxi speeds, orbit params, playerFlow). Pilot profile table (`trainer` / `fast_jet` / `gunship`) holding *feel* tuning. |
| `FixedWingModel.ts` | 678 | Orchestrates the above for all aircraft instances. Holds terrain sample cache, piloted-aircraft id, intent plumbing from adapter to physics. |
| `FixedWingOperations.ts` | 122 | Operation-state derivation, exit gating, orbit anchor from heading. |

### 1.2 Cross-file invariants and hidden modes

Invariants that are currently implicit and would break silently if any one
file drifted:

1. **Sign flip on `rollCommand`.** `FixedWingControlLaw.buildFixedWingPilotCommand`
   returns `rollCommand = -mergedRollInput * tuning.rollScale` in raw tier, but
   `+` in assist tier. Reason buried in code comment: Euler Z extraction flips
   sign relative to local-axis roll. Physics doesn't know about the flip; if
   you swap the comment with a "cleanup" that normalizes to `+`, the aircraft
   banks the wrong way in one tier.
2. **Ground-attitude lock in `stepGrounded`.** Roll and yaw are zeroed on the
   ground via `setGroundAttitude`. Yaw-input on the ground becomes a *steering
   torque* on the forward vector, not a rotation of the quaternion. Any caller
   that reads `quaternion` during ground roll sees "wings level regardless of
   rudder" — a second reality that's not named anywhere.
3. **Three thrust gates.** `staticThrustFloor` (airborne only, at 0.3), `steerAuthority` smoothstep on the ground (0.5..24 m/s), and `rotationReady` (0.9 × Vr). Each gate was added at a different time to kill a different bug. No single document explains why they coexist.
4. **Two separate liftoff paths.** `simulateStep` has an "airborne-by-separation" early promotion (line 355, when terrain height drops below the aircraft mid-frame). `stepGrounded` has a second, full-stack liftoff at line 455 keyed on lift ratio ≥ 0.4 AND rotation-ready. Both write `weightOnWheels = false` and add a vertical velocity bump. The bump formulas differ slightly (`Math.max(1.5, speed * 0.04)` both places — same, but they *could* drift).
5. **`groundStabilizationTicks`.** Magic number (3) that prevents false airborne transitions "during the first few ticks after creation or resetToGround()." Gate is `weightOnWheels && separation < 2.0`. If any reset path forgets to set this back to 3, the first frame after reset can see the aircraft spontaneously airborne on a height-map mismatch.
6. **Pilot profile vs physics tuning.** "How responsive does this aircraft feel" is split. Physics authorities (`elevatorPower`, `aileronPower`, `rudderPower`, `maxPitchRate`) live in `FixedWingPhysicsConfig`. Feel parameters (`pitchScale`, `autoLevelStrength`, `maxAssistBankDeg`) live in `PILOT_TUNING` keyed by `pilotProfile` string. To retune a Skyraider from "trainer" to "fast_jet" feel, you change *one* field in `FIXED_WING_CONFIGS.A1_SKYRAIDER.pilotProfile`, which flips an entirely different tuning table. This coupling is invisible without reading three files.
7. **Phase machine vs control phase vs operation state.** Three phase concepts exist simultaneously:
   - `FixedWingFlightPhase` (physics, 6 values: `parked | ground_roll | rotation | airborne | stall | landing_rollout`).
   - `FixedWingControlPhase` (derived, 7 values: `taxi | takeoff_roll | rotation | initial_climb | flight | approach | landing_rollout`).
   - `FixedWingOperationState` (derived, 11 values: adds `stopped`, `lineup`, `cruise`, `orbit_hold`).
   Each one has different gates. A bug where the HUD shows `cruise` while the physics reports `stall` is possible because they're computed from different snapshots at slightly different times.
8. **Hidden mode: `pilotMode`.** `FixedWingPilotAdapter.updateFixedWingControls` sets `fixedWingPilotMode = mouseControlEnabled ? 'direct_stick' : 'assisted'` every frame. This mode is bundled into `FixedWingPilotIntent` and branched on in `buildFixedWingPilotCommand`. There is no UI that exposes "pilot mode" — it's a side effect of the mouse-lock toggle. Both modes bank the aircraft; one mixes the mouse stick into the intent, the other doesn't. A player who toggles mouse lock mid-maneuver sees a behavior change with no on-screen cause.
9. **Hidden mode: orbit hold.** `fixedWingOrbitHold` lives on the adapter but the command builder observes it through the intent. Orbit-hold is fenced to gunships (`playerFlow === 'gunship_orbit'`), but the gate is not applied symmetrically: once the flag is on, the command builder overrides player stick regardless of profile. If a code change registered the intent on a non-gunship flow, the player would lose pitch/roll control with no error surfaced.

### 1.3 Cross-vehicle state bleed (Claim B)

**Verified leaks between helicopter and fixed-wing adapters:**

1. **`PlayerCamera.flightMouseControlEnabled`** is shared state. Default
   `true`. `HelicopterPlayerAdapter.onExit` does not reset it. If the player
   toggles mouse-lock off in a helicopter, then enters a fixed-wing, the
   fixed-wing adapter reads `false` via `getFlightMouseControlEnabled()` and
   sets `pilotMode = 'assisted'`. The stick mixes differently than a fresh
   plane entry. This is a real difference in flight behavior depending on
   prior session state.
2. **`PlayerCamera.infantryYaw/infantryPitch` cache.** Both adapters call
   `saveInfantryAngles()` on enter and `restoreInfantryAngles()` on exit.
   Fixed-wing→helicopter→exit→fixed-wing sequences can stack saves if any
   path fails to restore. `HelicopterPlayerAdapter.onExit` uses optional
   chaining (`ctx.cameraController?.restoreInfantryAngles()`), so a missing
   camera silently skips restore. Next entry spawns with stale infantry
   angles.
3. **`PlayerInput.flightVehicleMode`** is set by both adapters. Currently
   symmetric (both clear to `'none'` on exit), but `setInHelicopter(false)`
   is also called in `setFlightVehicleInputState` as a legacy path. Two
   writers to the same state, one at a lower abstraction — exactly the
   surface that will break the next time someone touches input.
4. **Pointer lock.** Both adapters call `ctx.input.relockPointer()` on
   enter. Neither explicitly releases on exit. The pointer stays locked
   when returning to infantry, which is usually correct for gameplay but
   the exit contract is unstated.

**Claim B verdict:** the adapters *are* leaking state. None of the leaks
are currently catastrophic, but the system is one refactor away from
producing mysterious "plane behaves weird after helicopter" reports.

### 1.4 Arrow-key input flow (Claim A)

Traced `arrowup` from `KeyboardEvent` to the elevator surface:

1. `PlayerInput.onKeyDown` records the code.
2. `FixedWingPlayerAdapter.updateFixedWingControls` (line 293) calls
   `input.isKeyPressed('arrowup')` and sets `pitchIntent = 1.0` if pressed.
3. `composePilotIntent` bundles `pitchIntent` into `FixedWingPilotIntent.pitchIntent`.
4. `FixedWingModel.update` passes the intent through `buildFixedWingPilotCommand`,
   which — in assisted tier — runs the PD: `errorTerm = (targetPitchDeg - snapshot.pitchDeg) / 14`.
5. Command's `pitchCommand` is written via `phys.setCommand`.
6. `FixedWingPhysics.updateEffectorState` lerps `elevator` toward `pitchCommand`
   at `controlResponse * dt` (~4.4/s for Skyraider).
7. `stepGrounded` uses `elevator` to derive `targetPitch` with a smoothstep
   gate: `preRotationAuthority = smoothstep(forwardSpeed, 0.3 * vrSpeed, 0.9 * vrSpeed)`.
   At zero speed, authority = 0.
8. `groundPitch` lerps toward `targetPitch * 4° * authority` at 3.6/s.

**Claim A verdict:** the signal *does* reach the physics layer. The
"arrow keys feel unresponsive" report is the *smoothstep gate at step 7*.
At zero speed the visible pitch is zero; at 0.3 × Vr (~12 m/s for
Skyraider) it's still close to zero; only above ~0.6 × Vr does a pilot
see the full 4° pre-rotation. On the ground accelerating from a stop,
that's 3–5 seconds of "press arrow-up, see nothing happen."

This is a **perception problem**, not a wiring bug. The sim was tuned for
realism — pre-rotation should be small — but the player expectation is
arcade. The rebuild should collapse the gate: act on stick immediately,
clamp the *maximum* displayed pitch not the *rate* at which it appears.

### 1.5 Collision model

`FixedWingPhysics.simulateStep` consumes a single `FixedWingTerrainSample`
at the aircraft's current `(x, z)`. `stepAirborne` applies velocity for
the full fixed-step, compares `position.y` to `groundHeight +
gearClearance + buffer`, and only enters ground-contact if `velocity.y <=
0`. This is deliberate — it lets a climbing aircraft avoid spurious
ground contacts — but it means an aircraft whose `(x, z)` moves from "low
terrain" to "high terrain" in one step sees no intermediate sample. At
80 m/s and 1/60s step, that's 1.33 m of travel per step; at 1/120s,
0.66 m. Ridges rising faster than the aircraft climbs become passable.

This is a bug-class, not a single bug. Any swept-collision replacement
benefits from reuse of `ITerrainRuntime.raycastTerrain`, which already
exists on the fence.

### 1.6 Diagram — current system

```
 Keyboard ─┐                             ┌─ HUD
 Touch    ─┤                             ├─ Camera
 Gamepad  ─┤                             │
 Mouse    ─┤                             ↓
           ↓
  FixedWingPlayerAdapter              FixedWingModel.update
  (throttle state, mouse recenter,     (terrain cache, pilot intent plumbing,
   pilotMode toggle, orbit toggle,      NPC dummy commands, render visibility,
   HUD writes, camera writes,           animation)
   input-context writes, pointer lock)
           ↓
  FixedWingPilotIntent
           ↓
  buildFixedWingPilotCommand        ← PILOT_TUNING (trainer/fast_jet/gunship)
  (orbit branch, direct_stick branch,
   assist PD branch, stall branch)
           ↓
  FixedWingCommand
           ↓
  FixedWingPhysics.setCommand
           ↓
  FixedWingPhysics.simulateStep
  ┌────────────────────────────┐
  │ effector lerp              │    ← FixedWingPhysicsConfig (per-aircraft)
  │ ground-stabilization tick  │
  │ airborne-by-separation     │
  │ stepGrounded OR stepAirborne
  │ (ground attitude lock,      │
  │  liftoff gate, stepAirborne │
  │  aerodynamics, alpha guard, │
  │  touchdown snap-to)         │
  │ world boundary              │
  └────────────────────────────┘
           ↓
  snapshot (read by HUD, camera, control-law, operation-state)
```

## 2. Proposed unified architecture

### 2.1 Shape

```
 Inputs (keys, touch, gamepad, mouse, NPC)
           ↓
 ┌─ InputSource(s) ────────────┐
 │ Each source produces        │
 │ AirframeIntent independently│
 └─────────────────────────────┘
           ↓
 AirframeIntent (pitch, roll, yaw, throttle, brake, tier, orbit?)
           ↓
 ┌─ Airframe.step(intent, terrain, dt) ─┐
 │  1. sample terrain                   │
 │  2. buildCommand(intent, state, cfg) │    cfg: AirframeConfig
 │  3. smooth effectors                 │    (one file per aircraft)
 │  4. integrate ground OR air          │
 │  5. swept collision clamp            │
 │  6. snapshot                         │
 └──────────────────────────────────────┘
           ↓
 AirframeState (position, quat, velocity, effectors, phase, derived)
           ↓
 HUD, Camera, Animation, Audio (all read-only consumers)
```

### 2.2 Concrete types (from spike prototype)

All defined in `spike/E6-airframe/airframe.ts`:

- `AirframeConfig`: single typed object, one file per aircraft. Sections
  `mass`, `engine`, `aero`, `authority`, `stability`, `ground`, `feel`.
  Merges `FixedWingPhysicsConfig` + `PILOT_TUNING[profile]` + relevant
  subset of `FixedWingOperationInfo`. No cross-file lookup to tune a plane.
- `AirframeIntent`: unitless player input. Includes `tier: 'raw' | 'assist'`
  as an explicit field, not a derived boolean. `orbit?` is a structured
  option, not a separate mode.
- `AirframeCommand`: what the sim acts on this tick. Opaque to input
  diversity (one command path; no branching on input source).
- `AirframeState`: authoritative snapshot. One phase enum
  (`parked | taxi | takeoff_roll | rotation | climb | cruise | stall | approach | rollout`).
- `AirframeTerrainProbe`: the sim asks the world two things — `sample(x, z)`
  for instantaneous height/normal, and `sweep(from, to)` for swept collision.
  Production port plugs into `ITerrainRuntime.raycastTerrain` with no
  fence changes.
- `Airframe` class: owns position, orientation, velocity, effector state,
  internal phase, and a fixed-step accumulator. Single `.step(intent,
  terrain, dt)` entrypoint. No `setCommand` / `setControls` / `resetToGround`
  / `resetAirborne` drift — reset helpers exist for parking and air-spawn,
  they go through the same state machine.

### 2.3 What disappears

- `FixedWingControlLaw` as a standalone file. `buildCommand` is a ~60-line
  pure function living beside `Airframe`.
- `FixedWingPlayerAdapter.fixedWingPilotMode` as a stateful field. Tier is
  decided per-frame by the input builder.
- The three overlapping phase enums collapse into one.
- `groundStabilizationTicks`. Replaced by: starting in `parked` phase with
  weight on wheels; any transition out of `parked` requires an explicit
  liftoff or airspawn trigger, not a height-map inequality.
- `airborne-by-separation` early promotion. Physics no longer promotes
  itself mid-frame from height changes. Swept collision is the only path
  that flips `weightOnWheels`.

## 3. Swept collision design

### 3.1 Primitive

```
interface AirframeTerrainProbe {
  sample(x: number, z: number): { height: number; normal?: Vector3 };
  sweep(from: Vector3, to: Vector3):
    | { hit: true; point: Vector3; normal: Vector3 }
    | null;
}
```

### 3.2 Integration call site

Once per `stepOnce`, after integrating position:

```
const from = prevPos;
const to = this.pos;
const hit = terrain.sweep(from, to);
if (hit) {
  this.pos.copy(hit.point);
  this.pos.y += this.cfg.ground.gearClearanceM;
  if (this.vel.y < 0) this.vel.y = 0;
  this.weightOnWheels = true;
  this.phase = this.vel.length() > 3 ? 'rollout' : 'parked';
  // zero angular rates on hard touchdown
}
```

### 3.3 Production implementation (sketch, not full code)

- `FixedWingModel` constructs an `AirframeTerrainProbe` that binds to the
  `ITerrainRuntime` it already holds:
  - `sample(x, z)` → `{ height: terrain.getHeightAt(x, z), normal: terrain.getNormalAt(x, z, out) }`.
  - `sweep(from, to)` → `terrain.raycastTerrain(from, to.clone().sub(from).normalize(), from.distanceTo(to))`.
- Thick-ray variant (optional, tracked as follow-up): cast a short fan of
  rays offset by gear width to catch wingtip contact on banked approach.
  Not in the first prototype.

### 3.4 What this fixes

- Climb-into-terrain pass-through.
- Frame-rate dependence of ground contact at very high speeds
  (F-4 at 200 m/s / 60 Hz = 3.33 m per step, enough to skip across
  a 2-metre-wide ridge top).
- The need for `velocity.y <= 0` as a skip condition. Swept collision is
  unconditional; if the segment intersects terrain, we touch down.

## 4. Control-law tiers (raw vs assist, no hidden modes)

### 4.1 `raw`

```
command.elevator = intent.pitch * cfg.feel.rawPitchScale
command.aileron  = intent.roll  * cfg.feel.rawRollScale
command.rudder   = intent.yaw   * cfg.feel.rawYawScale
```

No autolevel, no gravity compensation, no turn coordination. Player stick
drives the surfaces. Higher skill ceiling, higher crash rate. This is the
"direct_stick" of the current system, renamed and promoted to a first-class
tier.

### 4.2 `assist`

Stick sets *attitude targets*; a PD controller drives toward them.

```
target_bank = intent.roll * cfg.feel.assistMaxBankDeg
target_pitch = intent.pitch * cfg.feel.assistMaxPitchDeg
command.aileron = P*(rollDeg - target_bank) - D*rollRateDeg
command.elevator = P*(target_pitch - pitchDeg) - D*pitchRateDeg
```

When stick is centered, autolevel decays `rollDeg` toward 0.
Turn coordination adds `-(rollDeg/40) * coordYawScale` to rudder.

Stall protection is shared: any tier forces nose-down and attenuates
roll at high AoA. The *protection* lives in the sim (alpha limiter) not
the command builder — player can't override physics.

### 4.3 Orbit hold

Not a third tier. It's an alternate input source: when `intent.orbit` is
set (non-null), the command builder generates a geometry-following command
from the orbit params, ignoring stick. The sim is oblivious. Toggled by
pilot via gunship HUD; gated to gunship role at the input-builder layer,
not inside the command builder, so the control law has no branch on
aircraft role.

### 4.4 Tier selection

UI-exposed. `raw` is binary keypress toggle or mouse-lock-on. `assist` is
the default. A small indicator in the HUD shows which tier is active.
The toggle has ONE owner — no second writer in the adapter recomputing
it every frame.

## 5. Per-aircraft config schema — Skyraider

```ts
export const SKYRAIDER_AIRFRAME: AirframeConfig = {
  id: 'A1_SKYRAIDER',
  mass: { kg: 8200, wingAreaM2: 37.2 },
  engine: { maxThrustN: 50000, throttleResponsePerSec: 1.6, staticThrustFloor: 0.3 },
  aero: {
    stallSpeedMs: 38, vrSpeedMs: 42, v2SpeedMs: 50, maxSpeedMs: 120,
    cl0: 0.28, clAlpha: 4.4, clMax: 1.6,
    alphaStallDeg: 15, cd0: 0.032, inducedDragK: 0.06,
    sideForceCoefficient: 1.2, trimAlphaDeg: 4.0,
  },
  authority: {
    elevator: 2.3, aileron: 3.2, rudder: 1.0,
    maxPitchRate: 1.15, maxRollRate: 1.7, maxYawRate: 0.8,
    controlResponsePerSec: 4.4,
  },
  stability: { pitch: 2.2, rollLevel: 0.9, yaw: 1.9,
               pitchDamp: 1.5, rollDamp: 2.5, yawDamp: 1.3 },
  ground: {
    gearClearanceM: 0.5, liftoffClearanceM: 0.2,
    steeringRadPerSec: 0.6, lateralFriction: 7.4,
    rollingResistance: 0.014, brakeDecelMs2: 14,
    maxGroundPitchDeg: 6, // higher than current 4°; arcade-feel bias
  },
  feel: {
    rawPitchScale: 0.85, rawRollScale: 0.75, rawYawScale: 0.45,
    assistPitchP: 0.07, assistPitchD: 0.004,
    assistRollP: 0.04, assistRollD: 0.008,
    assistMaxBankDeg: 45, assistMaxPitchDeg: 25,
    coordYawScale: 0.15, autoLevelStrength: 0.8,
  },
};
```

One file. Grouped by concern. Adding a new aircraft is `cp skyraider.ts
f4.ts && edit constants`. No parallel `PILOT_TUNING` table to keep in
sync. No `operation` split between feel and geometry — `operation` that
matters to the sim is absorbed; operation-state labels for HUD live in a
separate tiny derivation (unchanged from today).

## 6. Prototype measurements

Run: `npx tsx spike/E6-airframe/scenario.ts`

```
── Scenario 1: arrow-up pitch feedback during ground roll ──
  After 1 frame (v=0.0 m/s): pitch=5.10°
  After 0.5s hold (v=0.0 m/s): pitch=5.10°
  ✓ Immediate pitch response is visible to the pilot.

── Scenario 2: climb into rising terrain ──
  (diagnostic trace) aircraft flying +X at 80 m/s, ridge at x=200, 60% grade.
  Clamped at x=501.2, y=180.8 after 6.0s.
  ✓ Swept collision clamped the trajectory.

── Scenario 3: roll pulse and recover ──
  [raw]    peak rollDeg after 1s stick = -74.5°; time to <3° after release = not level in 10s
  [assist] peak rollDeg after 1s stick =  57.7°; time to <3° after release = 1.22s

── Microbench: 10 000 fixed ticks ──
  10 000 ticks: ~12 ms total, ~1.2 µs/tick
```

Reading the numbers:

- **Feel (Scenario 1):** unified arcade-feel ground pitch is immediate at
  5° in the prototype. The current production path shows 0° until forward
  speed crosses ~0.3 × Vr. Claim A's "unresponsive" complaint is
  reproducible in the current system and fixed in the prototype by
  deleting the smoothstep gate.
- **Collision (Scenario 2):** the swept check correctly clamps an
  aircraft that would otherwise pass through a ridge. Current production
  path point-samples at the endpoint only and would miss.
- **Feel (Scenario 3):** assist tier recovers wings-level in 1.2 s; raw
  tier leaves the aircraft inverted with no recovery — as expected. Two
  distinct feels, no hidden middle ground.
- **Frame time:** 1.2 µs/tick at 120 Hz. At 50 aircraft, that is
  ~60 µs/frame (~0.4 % of a 16 ms budget). Not a performance concern.

Caveats on the prototype:

- `pitchRateDeg` / `rollRateDeg` in the PD loop are stubbed to 0. A
  production port would track rates across snapshots or expose them
  directly from the sim. The D term matters most during aggressive
  maneuvering; in the spike the P term alone still converges to wings-level.
- Ground-roll integration uses a simplified forward projection. The
  production port keeps the current ground-attitude quaternion math.
- Stall severity, ground-effect lift boost, and alpha protection are
  preserved in spirit but simplified in the spike. They port in verbatim.

## 7. Migration path

Constraints:

- Don't break the helicopter-flyable game.
- Don't break the NPC fixed-wing simulation (parked aircraft at airfields).
- Don't ship a half-rebuilt state if the playtest says "no".

### 7.1 Phase 1 — land scaffolding behind a flag

- Add `Airframe` class, `AirframeConfig`, `buildCommand`, types.
- Feature flag `useUnifiedAirframe` default `false`.
- `FixedWingModel.createAircraftAtSpot` branches on the flag: new path
  constructs `Airframe`, old path constructs `FixedWingPhysics`.
- Skyraider migrates first. F-4 and AC-47 keep the legacy path.
- Tests: L2 Airframe tests in isolation (ground roll, liftoff, climb,
  stall, recovery, swept collision). L3 scenario: one piloted Skyraider
  in a real scene, both paths enabled, compare frame-level state.

### 7.2 Phase 2 — shadow-run

- While flag is `false`, allow optional shadow construction: the legacy
  path runs, and in parallel a ghost `Airframe` consumes the same intent.
  Log divergence (position, attitude, phase) each frame.
- Shadow run in the perf harness for combat120 and openfrontier captures
  — does the new sim cost more than the old per-frame? (Expected: no,
  based on spike.)

### 7.3 Phase 3 — playtest the flag

- Build with flag enabled. Run `docs/PLAYTEST_CHECKLIST.md` augmented
  with:
  - Arrow-up on the ground gives visible pitch within 1 frame.
  - Climbing into Hill 861 or the ridge north-east of A Shau does NOT
    pass through terrain.
  - Toggling mouse lock does NOT change the handling model. Only the
    tier toggle (new binding) does.
  - Entering a plane after flying a helicopter feels identical to
    entering fresh. (Claim B.)
- Two pilots, two sessions each, minimum.

### 7.4 Phase 4 — flip

- Flag on by default. Legacy path behind `FIXED_WING_LEGACY` debug flag
  only, no runtime users.
- F-4 and AC-47 migrate to `Airframe` in follow-on PRs.
- One release with both paths live; following release removes legacy.

### 7.5 Phase 5 — delete

- Remove `FixedWingPhysics`, `FixedWingControlLaw`, the split pieces of
  `FixedWingPlayerAdapter` (keep only enter/exit + HUD wiring), and
  `PILOT_TUNING` from `FixedWingControlLaw`. `FixedWingConfigs` becomes
  `AirframeConfigs` — one config per aircraft.
- Expected deletion: ~1200 lines across four files. Expected addition:
  ~500 lines of `Airframe` + config files + input builder.

## 8. Impact on helicopters and future ground vehicles

The `Airframe` primitive is deliberately *not* a helicopter. Helicopter
physics has different force composition (collective, cyclic, tail rotor),
different phase machine, different stability requirements. The
architectural idea that generalizes is not the class — it's the
discipline:

- One sim class. One intent type. One command type. One config.
- Input → intent → command → sim step → state → consumers.
- No hidden modes in the translation layer.
- Swept collision as a primitive the sim queries from the world.

If we do the fixed-wing rebuild well, a future helicopter rebuild follows
the same playbook. `Rotorcraft` class with its own `RotorcraftConfig`.
Same input-builder pattern. Same `TerrainProbe`. Ground vehicles: same
idea, `Groundcraft`. Shared code is the primitives (TerrainProbe,
intent/command/state pattern), not a base class.

An earlier temptation is a `Vehicle` abstract class — don't. Aircraft
state transitions are dominated by aerodynamics, ground vehicles by
traction, helicopters by blade thrust. A base class ends up as an empty
contract with every subclass overriding every method.

## 9. Open questions for Batch F

1. Who owns `flightMouseControlEnabled`? Proposal: move to a shared
   `FlightAssistService` singleton with explicit enter/exit lifecycle,
   reset on vehicle-state transitions by default. Sidesteps the bleed.
2. Does `Airframe` hold its own fixed-step accumulator, or does
   `FixedStepRunner` remain the shared utility? Proposal: keep
   `FixedStepRunner`, inject, same as today.
3. Should `AirframeIntent.orbit` travel *through* the intent, or be a
   separate `AirframePolicy` input? Proposal: keep in intent for spike
   simplicity; revisit if gunship gets richer autopilot modes.
4. Fence impact: none for the sim surface. `ITerrainRuntime` already
   has `raycastTerrain`. If the tier toggle gets exposed through the
   HUD system, `IHUDSystem` may need one new method. Not a fence
   change if it's additive and optional.
