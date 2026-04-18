# npc-fixed-wing-pilot-ai: wire NPC fixed-wing pilots into live flight

**Slug:** `npc-fixed-wing-pilot-ai`
**Cycle:** `cycle-2026-04-18-harness-flight-combat`
**Depends on:** `b1-flight-cutover` (consume `Airframe` directly; no point wiring against the shim hours before it's deleted)
**Blocks (in this cycle):** nothing
**Playtest required:** yes (observable: A1 Skyraider NPC takes off, flies to a waypoint over enemy territory, returns, lands without crashing)
**Estimated risk:** medium — new subsystem, touches SystemUpdater wiring. State machine is the safe part; the PD-control tuning at each state transition is where real bugs will hide.
**Files touched:** new `src/systems/vehicle/NPCFixedWingPilot.ts` + test. Modify `src/systems/airsupport/NPCFlightController.ts` (adopt the new pilot), `src/core/SystemUpdater.ts` (registration), `src/core/SystemRegistry.ts` (if a new top-level system is needed), at least one game-mode config to spawn a flyable aircraft with an NPC pilot. Possible modification to `src/systems/vehicle/FixedWingModel.ts` if a piloted-by-NPC path needs exposing, but prefer adding the NPC as a pilot source that outputs `FixedWingPilotIntent` so `FixedWingModel.setFixedWingPilotIntent()` stays the seam.

## Why this task exists

The Airframe primitive (2026-04-18) is player-piloted today. The `BACKLOG.md` P1 line "Wire NPC pilot AI into SystemUpdater for live NPC flight" has been open since the fixed-wing rebuild. Research during cycle setup surfaced what exists and what's missing:

**What exists:**
- `src/systems/vehicle/NPCPilotAI.ts` (257 LOC) — FSM-based pilot mission planner with states `idle`, `takeoff`, `fly_to`, `orbit`, `attack_run`, `rtb`, `landing`. But it's written in **helicopter nomenclature** (collective, cyclicPitch, yaw outputs), not fixed-wing stick.
- `src/systems/airsupport/NPCFlightController.ts` (99 LOC) — bridges `NPCPilotAI` + `FixedWingPhysics` for **air-support-only** transient missions (e.g. AC-47 gunship orbit). Not a general NPC pilot path.
- `FixedWingModel.setFixedWingPilotIntent()` — the input seam. Accepts `FixedWingPilotIntent` from any source (currently player adapter, potentially NPC).
- `FixedWingControlLaw.buildFixedWingPilotCommand()` — intent → command translator. Source-agnostic.
- `SystemUpdater.ts` already has an `AirSupport` subsystem slot (line 152-160) and a `Vehicles` slot (line 85-91). NPC fixed-wing pilots plug cleanly into either, depending on design.

**What's missing:**
- A fixed-wing-native pilot that outputs `FixedWingPilotIntent` (pitch / roll / yaw / throttle / brake) with proper stick semantics, not helicopter controls.
- Decoupling from the "air-support transient mission" framing: we need a generic NPC pilot that owns a long-lived aircraft, runs a full sortie, and participates in the combat sim.
- A game-mode scenario that spawns at least one flyable NPC aircraft for playtest.

## Required reading first

- `src/systems/vehicle/airframe/Airframe.ts` + `airframe/types.ts` — after `b1-flight-cutover` merges, this is the primitive the NPC talks to. Understand `AirframeState` observations (airspeed, altitude, AGL, heading, pitch, roll, AOA, stall, WOW) that the NPC reads to close its control loops.
- `src/systems/vehicle/FixedWingControlLaw.ts` — `FixedWingPilotIntent` shape, `buildFixedWingPilotCommand()`. Stay source-agnostic.
- `src/systems/vehicle/FixedWingPlayerAdapter.ts` — reference for intent construction from a control source. Don't copy input state; copy the intent-building discipline.
- `src/systems/vehicle/NPCPilotAI.ts` — existing FSM. Decide: extend it to produce fixed-wing intents (dual-mode, fork the class), or leave it for helicopter and author a parallel fixed-wing pilot. **Prefer authoring a parallel `NPCFixedWingPilot`** — the control outputs are different enough that dual-mode will get messy fast, and helicopter NPC pilot has its own future.
- `src/systems/airsupport/NPCFlightController.ts` — the only existing fixed-wing NPC consumer. After this task, it should consume the new `NPCFixedWingPilot` instead of `NPCPilotAI` directly.
- `src/core/SystemUpdater.ts` — `trackSystemUpdate` pattern, existing `AirSupport` and `Vehicles` slots.
- `src/core/SystemRegistry.ts` — how top-level systems are registered.
- `docs/TESTING.md` — behavior tests, not implementation mirrors.
- `docs/INTERFACE_FENCE.md`.

### External reference

- **FlightGear AI flight plans** — declarative waypoint lists `{name, lat, lon, alt, ktas, on-ground, gear-down, flaps-down}`. Portable shape for an NPC pilot's `Mission` type: https://wiki.flightgear.org/AI_Scenarios
- **FlightGear `fox2.nas` / `missile.nas`** — per-agent state machine with explicit state enum + proportional pursuit; matches the shape below: https://github.com/FGMEMBERS/F-15/blob/master/Nasal/fox2.nas
- **Behavior tree survey (Colledanchise + Ögren, 2022)** — context for why pure-FSM is fine for flight envelope: https://www.sciencedirect.com/science/article/pii/S0921889022000513

## Target state — state diagram

Every flyable NPC aircraft holds a `NPCFixedWingPilot` with an explicit state enum. Transitions are event- or observation-driven. Each state owns an `onEnter()`, a per-tick `update(dt, airframeState, mission)` that returns `FixedWingPilotIntent`, and one or more exit guards.

```
COLD
  └─(engineStartCommanded)─→ TAXI
TAXI
  └─(atRunwayThreshold && alignedWithRunway)─→ TAKEOFF_ROLL
TAKEOFF_ROLL
  └─(forwardAirspeed >= vrSpeed)─→ CLIMB
CLIMB
  └─(altitudeAGL >= cruiseAltTarget - 10)─→ CRUISE_TO_WP
CRUISE_TO_WP
  ├─(atWaypoint && mission.kind==='attack')─→ ATTACK_SETUP
  └─(atWaypoint && mission.kind==='orbit')─→ ORBIT
ATTACK_SETUP
  └─(onRunIn && alignedWithTarget)─→ ATTACK_RUN
ATTACK_RUN
  └─(ordnanceReleased OR altitudeAGL <= minAttackAlt)─→ BREAKAWAY
BREAKAWAY
  └─(safeAltAndDistance)─→ REATTACK_DECISION
REATTACK_DECISION
  ├─(utility('reattack') > threshold)─→ ATTACK_SETUP
  └─(bingoFuel OR bingoAmmo OR mission.complete)─→ RTB
ORBIT
  └─(missionDurationElapsed OR mission.complete)─→ RTB
RTB
  └─(atInitialApproachFix)─→ APPROACH
APPROACH
  └─(onFinal && gearDown && throttleCut)─→ LANDING
LANDING
  └─(weightOnWheels && forwardAirspeed < 5)─→ COLD

Any state
  ├─(airframe.destroyed)─→ DEAD
  └─(damage > bailoutThreshold)─→ DEAD (future: pilot ejects, parachute)
```

`REATTACK_DECISION` is intentionally the single utility-scored branch in v1 — keeps scope tight while establishing the pattern for future faction-doctrine layering (different faction pilots score reattack differently; see `utility-ai-doctrine-expansion` for precedent).

## Architecture

```
src/systems/vehicle/
  NPCFixedWingPilot.ts           # the pilot class (state machine + control laws)
  npcPilot/
    states.ts                    # state enum + per-state update() implementations
    pdControllers.ts             # altitude / heading / airspeed PD loops
    mission.ts                   # Mission type (FlightGear-style waypoint list)
    types.ts                     # FixedWingNPCConfig, PilotState, PilotInputs
  __tests__/
    NPCFixedWingPilot.test.ts    # state-transition behavior tests
    npcPilot/pdControllers.test.ts
```

### Mission shape (declarative, FlightGear-inspired)

```ts
export interface Mission {
  kind: 'ferry' | 'attack' | 'orbit' | 'patrol';
  waypoints: Waypoint[];
  target?: { position: THREE.Vector3; minAttackAltM: number };
  bingo: { fuelFraction: number; ammoFraction: number };
  homeAirfield: { runwayStart: THREE.Vector3; runwayHeading: number };
}

export interface Waypoint {
  position: THREE.Vector3;
  altitudeAGLm: number;
  airspeedMs: number;
  arrivalKind: 'flyby' | 'orbit' | 'attack';
}
```

## Steps

1. After `b1-flight-cutover` merges, scaffold `src/systems/vehicle/NPCFixedWingPilot.ts` and `npcPilot/`.
2. Author PD controllers (`altitudeHold`, `headingHold`, `airspeedHold`) that produce `FixedWingPilotIntent` components. Test against scripted observations (L2 single-system tests).
3. Implement the state machine. Each state's `update()` reads `AirframeState` + `Mission` and returns an intent. Transitions are guard functions evaluated each tick. Test transitions with scripted state sequences, not live engine (L2 behavior tests per `docs/TESTING.md`).
4. Port the handful of methods in `NPCPilotAI` that remain useful (mission-waypoint following heuristics) — **do not import `NPCPilotAI` at runtime**. Copy the logic; the nomenclatures are too different.
5. Update `NPCFlightController.ts` to instantiate `NPCFixedWingPilot` instead of `NPCPilotAI` for fixed-wing aircraft. The helicopter path (if any) stays on `NPCPilotAI`.
6. Register the pilot subsystem in `SystemUpdater`. Two shapes to choose from:
   - **Option A (preferred):** extend the existing `Vehicles` slot so `FixedWingModel.update()` calls into pilots it owns. Pilots are held as child state on piloted aircraft. Per-frame dispatch flows naturally.
   - **Option B:** a new top-level `NPCFixedWingPilotSystem` in `SystemRegistry` with its own `trackSystemUpdate` slot. More isolated but adds ceremony.

   Default to A unless the executor's reading of `SystemUpdater` reveals a reason otherwise.
7. Spawn at least one flyable NPC aircraft in a game mode (prefer `open_frontier` or `ai_sandbox` — big maps where flight is visible). Use the airfield-layout stand pattern; add an `npcPilot: Mission` field on pre-placed aircraft.
8. Playtest: watch the NPC A1 Skyraider do `COLD → TAKEOFF_ROLL → CLIMB → CRUISE_TO_WP → RTB → LANDING` without augering in. Video or a screenshot trace of `airframe.state` over the sortie is the evidence artifact.
9. `npm run lint`, `npm run test:run`, `npm run build` green.

## Exit criteria

- `src/systems/vehicle/NPCFixedWingPilot.ts` exists with a full state machine and PD controllers.
- Behavior tests cover: COLD→TAXI→TAKEOFF_ROLL→CLIMB→CRUISE transitions; altitude/heading/airspeed hold stability under scripted observation noise; BREAKAWAY triggers at min-attack altitude; bingo-fuel triggers RTB.
- At least one game-mode spawns an NPC aircraft with a mission; on boot it taxis, takes off, flies to a waypoint, and returns to land within its fuel budget.
- HUD, weapons, and targeting are unchanged (input source separation was already clean per research).
- No player-flight regression: existing `FixedWingPlayerAdapter` path behaves identically.
- `NPCFlightController.ts` for the air-support case still works (orbit / attack-run missions from AirSupportManager don't regress).
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- No utility-AI layer across pilot states beyond the single `REATTACK_DECISION` score. Faction-doctrine differentiation is the `utility-ai-doctrine-expansion` task's surface, not this one.
- No multiplayer / networked pilot prediction.
- No missile / guided weapon pilot reactions (defensive maneuvers, chaff/flare). Future task.
- No pilot ejection / parachute — state machine has a DEAD absorbing state; ejection simulation is future.
- No rewrite of `NPCPilotAI` for helicopters — it stays as-is.
- No change to `FixedWingPlayerAdapter`. The player path is orthogonal.
- No new aircraft types in `FixedWingConfigs` — use existing configs (A1 Skyraider, AC-47, F-4).

## Hard stops

- The NPC aircraft augurs in consistently on takeoff — STOP. PD tuning is wrong; that's an executor investigation, not a "ship and iterate" situation.
- Fence change to `src/types/SystemInterfaces.ts` — STOP.
- Diff exceeds ~900 LOC net — STOP, propose tighter brief. State machine + PD + registration + one scenario should fit in ~600 LOC; bigger means scope drift into tactics / utility / weapons.
- Executor discovers that `SystemUpdater` needs an architectural change (not just a new registration) to host this — STOP. That's a fence-adjacent change and needs a separate brief.
- Playtest NPC aircraft crashes into terrain that should be avoidable (waypoints above ground) — STOP. Terrain sampling at altitude is table stakes; a bug here means the integration is broken.
