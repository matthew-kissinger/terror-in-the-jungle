# AVIATSIYA-3 Helicopter Parity Audit

Status: AVIATSIYA-3 audit memo.
Date: 2026-05-07.

## Scope

This memo audits `HelicopterVehicleAdapter` against
`HelicopterPlayerAdapter` and the current fixed-wing player/session pattern.
It covers state-authority gaps and recommended consolidation only. It does not
change runtime code.

Inspected sources:

1. `src/systems/vehicle/VehicleSessionController.ts`.
2. `src/systems/vehicle/PlayerVehicleAdapter.ts`.
3. `src/systems/vehicle/HelicopterPlayerAdapter.ts`.
4. `src/systems/vehicle/FixedWingPlayerAdapter.ts`.
5. `src/systems/vehicle/HelicopterVehicleAdapter.ts`.
6. `src/systems/vehicle/FixedWingVehicleAdapter.ts`.
7. `src/systems/helicopter/HelicopterModel.ts`.
8. `src/systems/helicopter/HelicopterInteraction.ts`.
9. `src/systems/player/PlayerController.ts`.
10. Vehicle adapter and session tests under `src/systems/vehicle/`.

## Current Authority Map

1. `VehicleSessionController` owns player vehicle session state. It registers
   one `PlayerVehicleAdapter` per vehicle type, owns enter/exit symmetry,
   clears transient input on transitions, and writes `PlayerState`
   `isInHelicopter`, `helicopterId`, `isInFixedWing`, and `fixedWingId`.
2. `HelicopterPlayerAdapter` owns player helicopter control state:
   collective, cyclic pitch, cyclic roll, yaw, boost, auto-hover, altitude
   lock, active helicopter id, flight input mode, camera restore, helicopter
   HUD, vehicle UI context, and crosshair mode.
3. `FixedWingPlayerAdapter` owns player fixed-wing control state:
   throttle, mouse pitch, mouse roll, stability assist, orbit hold, pilot mode,
   active aircraft id, flight input mode, fixed-wing HUD, vehicle UI context,
   and `FixedWingModel.setPilotedAircraft`.
4. `HelicopterVehicleAdapter` is not the player-control peer of
   `HelicopterPlayerAdapter`. It is the `IVehicle` seat/occupant facade used by
   `VehicleManager`. It tracks seats and delegates position, quaternion,
   velocity, health, and destroyed state to `HelicopterModel`.
5. `FixedWingVehicleAdapter` follows the same `IVehicle` facade pattern for
   fixed-wing aircraft. It is closer to `HelicopterVehicleAdapter` than to
   `FixedWingPlayerAdapter`.
6. `HelicopterModel` owns helicopter physics, animation, audio, weapons,
   health, door gunners, terrain-aware exit placement, collision registration,
   and dynamic vehicle registration.
7. `FixedWingModel` owns fixed-wing aircraft physics, flight data, exit policy,
   emergency ejection placement, and active piloted-aircraft binding.

## Parity Findings

1. Player session authority is mostly unified. Both helicopter and fixed-wing
   entry now route through `PlayerController` into `VehicleSessionController`.
   Both player adapters implement `onEnter`, `onExit`, `getExitPlan`, `update`,
   and `resetControlState`.
2. Fixed-wing has the stronger typed exit-policy seam. `FixedWingPlayerAdapter`
   calls `FixedWingModel.getPlayerExitPlan(ctx.vehicleId, options)`, and the
   model can return normal exit, blocked exit, or emergency ejection.
3. Helicopter uses the same session mechanism but a weaker model contract.
   `HelicopterPlayerAdapter` casts `IHelicopterModel` to an optional
   `getPlayerExitPlan` provider because `IHelicopterModel` does not expose that
   method. This keeps the fenced interface unchanged but makes the exit seam
   easier to miss.
4. Helicopter exit placement exists in two places. `HelicopterModel`
   implements `getPlayerExitPlan`; `HelicopterInteraction.exitHelicopter`
   still computes a right-side terrain-snapped exit and calls
   `playerController.exitHelicopter(exitPosition)` as a legacy path.
5. Helicopter model exit is partially consolidated. `HelicopterModel.exitHelicopter`
   first requests `requestVehicleExit({ reason: 'helicopter-model' })` and
   falls back to `HelicopterInteraction.exitHelicopter` only if the controller
   lacks the session-aware method.
6. Destruction cleanup follows the session contract before fallback.
   `HelicopterModel.handleHelicopterDestroyed` requests forced vehicle exit
   and then falls back to the interaction path.
7. Fixed-wing active-control authority is more explicit than helicopter.
   `FixedWingPlayerAdapter.onEnter` calls `FixedWingModel.setPilotedAircraft`,
   and `onExit` clears it. Helicopter active-control authority is inferred by
   `HelicopterModel.updateHelicopterPhysics` polling `playerController`
   `isInHelicopter()` and `getHelicopterId()`.
8. Both adapters still use compatibility helpers for input and camera naming:
   `setFlightVehicleMode` falls back to older helicopter-only mode, and
   `getFlightMouseControlEnabled` falls back to
   `getHelicopterMouseControlEnabled`. This is acceptable compatibility, but it
   is not a final vocabulary.

## State-Authority Gaps

1. `IHelicopterModel` does not name `getPlayerExitPlan`, while the player
   adapter depends on it opportunistically. This is a contract gap, not an
   immediate runtime failure.
2. Helicopter exit placement has duplicate authorities:
   `HelicopterModel.getPlayerExitPlan` and
   `HelicopterInteraction.exitHelicopter`.
3. Helicopter active piloting state is inferred from `IPlayerController`; fixed
   wing uses explicit model binding. The helicopter pattern works, but it keeps
   model update behavior coupled to controller polling.
4. `HelicopterVehicleAdapter` and `HelicopterPlayerAdapter` share "adapter" in
   their names but serve different authority planes. Future changes can confuse
   seat occupancy, player control, and session transition ownership unless the
   distinction remains explicit.
5. Legacy `PlayerController.exitHelicopter(exitPosition)` remains callable and
   can bypass the richer `requestVehicleExit(options)` result surface when used
   directly.

## Recommended Consolidation

1. Do not merge `HelicopterVehicleAdapter` with `HelicopterPlayerAdapter`.
   Keep `HelicopterVehicleAdapter` as the `IVehicle` seat/occupant facade and
   `HelicopterPlayerAdapter` as the player control/session lifecycle adapter.
2. Make `HelicopterModel.getPlayerExitPlan` a named local contract for
   `HelicopterPlayerAdapter` before touching the fenced
   `src/types/SystemInterfaces.ts` boundary. A local narrow type avoids an
   interface-change PR until implementation proves the seam needs to be shared.
3. Retire duplicated exit placement from `HelicopterInteraction.exitHelicopter`
   after all callers can route through `requestVehicleExit`. The interaction
   system should request exit, suppress prompts, and clear UI; it should not
   own terrain-snapped placement once the model has `getPlayerExitPlan`.
4. Consider an explicit helicopter piloted binding only if a runtime bug proves
   controller polling is insufficient. The current poll-based model is not a
   release blocker by itself.
5. Keep fixed-wing and helicopter player adapters parallel at the lifecycle
   level: enter setup, exit cleanup, model exit plan, update controls, reset
   controls, HUD/vehicle UI context, and camera restoration.
6. Any future code change in this area must run adapter/session tests plus a
   human playtest for helicopter entry, exit, spool-down, pointer lock fallback,
   and touch/mobile exit feel.

## Proposed Follow-Up Order

1. Narrow contract cleanup: introduce a local `HelicopterExitPlanner` type in
   the player adapter or model module and remove the ad hoc cast.
2. Legacy exit cleanup: route `HelicopterInteraction.exitHelicopter` through
   `requestVehicleExit` and delete the duplicate terrain placement.
3. Parity test expansion: assert helicopter model exit uses the same planned
   position path as the player adapter and that direct legacy exit no longer
   bypasses the session result surface.
4. Human playtest: validate helicopter entry/exit, destroyed-helicopter forced
   exit, rotor spool-down, mobile action bar exit, and pointer lock fallback.

## Non-Claims

1. This audit does not validate helicopter feel.
2. This audit does not validate rotor visual parity.
3. This audit does not change or approve `src/types/SystemInterfaces.ts`.
4. This audit does not close AVIATSIYA-1 human playtest acceptance.
5. This audit does not prove production deployment state.
