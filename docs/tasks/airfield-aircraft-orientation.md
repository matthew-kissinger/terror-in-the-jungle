# airfield-aircraft-orientation: parked aircraft must face their taxi-route entry

**Slug:** `airfield-aircraft-orientation`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P1 — visible bug; planes cannot taxi to runway from current orientation.
**Playtest required:** YES.
**Estimated risk:** low — orientation math + per-template yaw audit.
**Budget:** ≤ 150 LOC.
**Files touched:**

- Investigate: `src/systems/world/AirfieldTemplates.ts` (parking spot `yaw` values vs taxi route `points[0]` vs runway start `heading`), the spawner that consumes them.
- Modify: either (a) compute parking yaw from taxi-route entry direction at spawn time (most robust), OR (b) audit + fix per-template yaw values.

## Symptoms (orchestrator playtest 2026-04-20)

User: "The planes are not even facing the direction to go onto the runway by way of taxi route."

Reading `AirfieldTemplates.ts:222-263` (main_airbase parkingSpots):
- A-1 Skyraider: `yaw: 0`, `taxiRouteId: 'a1_south_route'`, `runwayStartId: 'south_departure'`
- AC-47 Spooky: `yaw: 0`, `taxiRouteId: 'ac47_south_route'`, `runwayStartId: 'south_departure'`
- F-4 Phantom: `yaw: Math.PI`, `taxiRouteId: 'f4_north_route'`, `runwayStartId: 'north_departure'`

The yaw is set as a static value on the template. Whether it's correct depends on the geometry of the taxi route entry. If the spawner places the plane with `quaternion.setFromYaw(yaw)` and that yaw doesn't point at the first point of the taxi route, the plane has to do a yawing reverse to start its taxi.

## Required reading first

- `src/systems/world/AirfieldTemplates.ts` (full file). Look at the runwayStarts (lines 198-220) and taxiRoutes (lines 171-196) to see what direction the planes need to be facing.
- `src/systems/world/AirfieldLayoutGenerator.ts` — where parking spot yaw is consumed.
- The aircraft spawner — find via `Grep "parkingSpot" src/`.
- `src/systems/vehicle/NPCFixedWingPilot.ts` and `npcPilot/states.ts` — does the pilot start state assume a particular forward direction?

## Hypothesis

Replace static `yaw` on parking spots with computed yaw at spawn time:
```
const dx = taxiRoute.points[0].offsetAlongRunway - parkingSpot.offsetAlongRunway;
const dz = taxiRoute.points[0].offsetLateral - parkingSpot.offsetLateral;
const yaw = Math.atan2(dx, dz);  // or with proper Z-convention
```
Plane is placed facing the first point of its taxi route. Taxi-out works without a 180° reverse-and-pivot.

## Steps

1. Read all of "Required reading first."
2. `npm run dev`, observe each parked aircraft's facing relative to its taxi route entry.
3. Implement computed orientation at spawn time.
4. Remove the static `yaw` field from `AirfieldStructureEntry` / parking spot type if it's no longer needed (or leave it as an override default).
5. Verify each aircraft taxis cleanly from spawn position to its runway holding short without a reverse maneuver.

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/airfield-aircraft-orientation/`:

- `main-airbase-parked-aircraft.png` — top-down or oblique shot of all three parked aircraft showing their orientation relative to their taxi routes.
- `forward-strip-parked-aircraft.png` — same for forward strip.

## Exit criteria

- All parked aircraft face the first point of their taxi route at spawn time.
- NPC-pilot taxi states from spawn to holding-short complete without a U-turn.
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not redesign the taxi route shape.
- Do not change runway start / hold short positions.
- Do not address ground-physics or A-1 spawn (separate tasks).

## Hard stops

- Fence change → STOP.
- Computed yaw produces NaN for any template → STOP, add fallback.
- Pilot still can't taxi after orientation fix → escalate to `aircraft-ground-physics-tuning` (the issue is downstream, not orientation).
