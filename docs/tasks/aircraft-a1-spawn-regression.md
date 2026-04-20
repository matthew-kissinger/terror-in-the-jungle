# aircraft-a1-spawn-regression: A-1 Skyraider missing from main airbase runway

**Slug:** `aircraft-a1-spawn-regression`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P1 — narrow scope, surgical fix; orthogonal to ground physics.
**Playtest required:** YES (boolean: is the A-1 visible).
**Estimated risk:** low.
**Budget:** ≤ 100 LOC.
**Files touched:**

- Investigate: `src/systems/world/AirfieldTemplates.ts:222-242` (A-1 entry), the spawner that walks `parkingSpots` (find via `Grep "parkingSpot" src/`), `src/systems/world/AirfieldLayoutGenerator.ts`.
- Modify: whichever step in the spawn pipeline silently skips the A-1.

## Symptoms (orchestrator playtest 2026-04-20)

User: "I do not see the one with the single propeller now on the runway just the spooky and the jet."

The A-1 (single-prop Skyraider) is defined at `AirfieldTemplates.ts:222-242` with `npcAutoFlight: { kind: 'ferry', ... }`. The AC-47 (two-prop gunship) and F-4 (jet) are also defined and visible. So the data is there; the bug is in the spawn pipeline gating the A-1 specifically out.

This is ORTHOGONAL to `aircraft-ground-physics-tuning`. The A-1 spawn problem can be fixed independently — once it spawns, it will or won't take off based on physics tuning, but at least it'll be visible.

## Required reading first

- `src/systems/world/AirfieldTemplates.ts` (parking spot for A-1 at lines 222-242).
- `src/systems/world/AirfieldLayoutGenerator.ts` — placer.
- The aircraft spawner — search via `Grep "parkingSpot" src/`, `Grep "AircraftModels" src/`.
- `src/systems/vehicle/NPCFixedWingPilot.ts` and `npcPilot/states.ts` — does the spawn require valid pilot state? Could be that pilot init fails for the A-1's auto-flight config, leaving the A-1 unspawned.
- Console log in `npm run dev` when generating main_airbase — look for messages mentioning "A1" / "Skyraider" / "stand_a1".

## Hypothesis (cheapest first)

1. Asset load fails silently for `AircraftModels.A1_SKYRAIDER`. Check console for asset errors.
2. The spawner has an early-return when `npcAutoFlight` is present and pilot can't be created — and the A-1 is the ONLY parking spot with `npcAutoFlight` in the main airfield, so it's the only one that hits the failing branch.
3. The runway start `south_departure` referenced by both A-1 (`taxiRouteId: 'a1_south_route'`) and AC-47 (`taxiRouteId: 'ac47_south_route'`) has a clearance conflict — placer keeps AC-47 (placed first) and rejects A-1 (placed second). Look at `clearanceRadius` (A-1: 22, AC-47: 30); their `offsetLateral` is the same (96), `offsetAlongRunway` differs (-82 vs 0). Distance ≈ 82m, larger than the sum of clearance radii (52m), should not conflict. But verify the actual conflict-detection math.
4. Some recent cycle's plumbing change touched the spawn pipeline. Check `git log --oneline src/systems/world/` for the last 5-10 commits.

## Steps

1. `npm run dev`, generate main_airbase, observe runway. Confirm A-1 absent.
2. Open browser console; look for errors mentioning A-1 / Skyraider / stand_a1 / asset load failures.
3. Add a Logger trace in the spawner at every early-return that mentions which parking spot was skipped + why.
4. Identify the failing branch.
5. Fix: asset registration if model load fails; pilot-init handling if auto-flight init fails; clearance math if false-positive conflict.

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/aircraft-a1-spawn-regression/`:

- `main-airbase-with-a1.png` — A-1, AC-47, and F-4 all visible at main_airbase.

## Exit criteria

- A-1 Skyraider visible at main_airbase parking on every world-gen seed.
- AC-47 and F-4 still visible (no regression on the other two).
- No console errors about A-1 asset / spawn failure.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Add a regression test (if there's an existing `AirfieldTemplates.test.ts` or `AirfieldLayoutGenerator.test.ts`, extend it to assert all three template parking spots get spawned).

## Non-goals

- Do not address whether the A-1 takes off (separate `aircraft-ground-physics-tuning` task).
- Do not change A-1 template config (yaw, taxi route, etc.).
- Do not redesign the spawn pipeline.

## Hard stops

- Fence change → STOP.
- Fix requires changing aircraft model assets → STOP, file separate task.
- A-1 still missing after the trace identifies a fix → STOP, may indicate a deeper init-order issue with the new atmosphere wiring; surface for re-scoping.
