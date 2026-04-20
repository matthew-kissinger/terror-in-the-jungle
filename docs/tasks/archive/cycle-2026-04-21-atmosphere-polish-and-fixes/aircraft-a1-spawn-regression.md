# aircraft-a1-spawn-regression: keep an A-1 Skyraider parked at main_airbase for the player

**Slug:** `aircraft-a1-spawn-regression` *(file kept; the original "missing aircraft regression" hypothesis was wrong — see "Recon-corrected diagnosis" below)*
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P1 — narrow scope; orthogonal to ground physics.
**Playtest required:** YES (boolean: is the A-1 parked when the player walks up).
**Estimated risk:** low.
**Budget:** ≤ 100 LOC.
**Files touched:**

- Modify: `src/systems/world/AirfieldTemplates.ts:222-242` (A-1 parking spot — remove `npcAutoFlight` field OR add a second parked-and-claimable A-1 spot).

## Recon-corrected diagnosis (2026-04-20)

User playtest 2026-04-20 (post-recon): "oh it seems there was a plane that actually takes off at the start maybe that is where it went. and now i can actually fly i stand corrected. the plane that takes off at the start is not me flying it i just saw it take off in the sky."

The A-1 is **NOT missing**. It spawns correctly. `AirfieldTemplates.ts:222-242` defines it with `npcAutoFlight: { kind: 'ferry', waypoint: -1500m, altitude: 220m, airspeed: 65 m/s }`. The NPC pilot state machine (`NPCFixedWingPilot.ts:84-121`) walks COLD → STARTUP → TAKEOFF → CLIMB → NAVIGATE → RTB → LANDING and ferries the A-1 off the airfield within the first few seconds of world boot. By the time the player reaches the airfield, the A-1 is already a speck in the sky.

So the original brief's spawn-pipeline hypothesis tree (asset load failure / pilot-init early return / clearance-radius collision / recent plumbing change) is **all moot**. The data flow is working as designed.

The actual user need: the A-1 should be **available to the player at the airfield** so they can fly it themselves.

## Fix options (pick one)

**Option A — disable A-1 ferry mission (simplest).** Remove the `npcAutoFlight` field from `AirfieldTemplates.ts:222-242`. A-1 spawns parked, doesn't auto-launch, player can walk up and claim it. Loses the visual "plane departing at world start" gameplay, but that wasn't anyone's design intent — it was an integration test of the NPC pilot.

**Option B — add a second parked A-1 spot.** Keep the existing ferry-A-1 (it demonstrates NPC pilot AI is alive). Add a second parking spot for a stationary A-1 that players can claim. Requires adding a parking-spot entry + an extra slot in the airfield layout. More invasive, larger diff.

**Recommend Option A for v1.** The ferry-takeoff visual is nice-to-have; player access to the A-1 is what the user asked for. Option B can be a follow-up if the missing visual matters.

## Required reading first

- `src/systems/world/AirfieldTemplates.ts:222-263` — main_airbase parkingSpots block. Note the AC-47 and F-4 don't have `npcAutoFlight` — they spawn parked. A-1 is the outlier.
- `src/systems/world/AirfieldLayoutGenerator.ts:166-176` — how `npcAutoFlight` flows from template to placement.
- `src/systems/world/WorldFeatureSystem.ts:171-173` and `:311-350` — where `attachNPCFlight()` is called.
- `src/systems/vehicle/NPCFixedWingPilot.ts:84-121` — pilot state machine for context.
- Existing test (if any): `AirfieldTemplates.test.ts` or `AirfieldLayoutGenerator.test.ts`.

## Steps (Option A path)

1. Read `AirfieldTemplates.ts:222-242`.
2. Delete the `npcAutoFlight: { kind: 'ferry', ... }` field from the A-1 parking spot entry.
3. Boot `npm run dev`, generate main_airbase. Confirm A-1 visible parked at its spot, AC-47 + F-4 still visible (no regression).
4. Confirm no console errors.
5. Add a regression test (extend `AirfieldTemplates.test.ts` if it exists, otherwise create a small one) that asserts main_airbase has exactly one A-1, AC-47, and F-4 parking spot AND none of them have `npcAutoFlight` set (so no auto-departure on boot).

## Screenshot evidence (required for merge)

Commit PNG to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/aircraft-a1-spawn-regression/`:

- `main-airbase-with-a1-parked.png` — A-1, AC-47, and F-4 all visible parked at main_airbase, captured ~10 seconds after world boot (long enough that any auto-launch would have triggered).

## Exit criteria

- A-1 Skyraider visible parked at main_airbase 10+ seconds after world boot on every world-gen seed.
- AC-47 and F-4 still visible parked (no regression on the other two).
- Player can claim and fly the A-1 (manual smoke).
- Regression test pinning "main_airbase has parked A-1, AC-47, F-4 with no `npcAutoFlight`."
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not redesign the NPC pilot state machine or ferry mission concept (it can come back as a sortie spawned from a different airfield/template later).
- Do not change A-1 template config beyond removing `npcAutoFlight`.
- Do not address whether the A-1 takes off cleanly — that's `aircraft-takeoff-bounce-fix` (`aircraft-ground-physics-tuning`).
- Do not redesign the spawn pipeline.

## Hard stops

- Fence change → STOP.
- Removing `npcAutoFlight` breaks `attachNPCFlight()` callers (e.g. unconditional access to a now-undefined field) → fix the access pattern, do not restore the field.
- A-1 still missing after the field is removed → STOP, escalate (would indicate a deeper init-order issue).
