# aircraft-simulation-culling: skip airframe.step() for unpiloted, off-screen aircraft

**Slug:** `aircraft-simulation-culling`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P2 — perf opportunity from playtest observation; no functional bug.
**Playtest required:** YES (verify no behavioral regression — aircraft don't pop into wrong state when they re-enter view).
**Estimated risk:** low — narrow gating change in the simulation loop with hysteresis.
**Budget:** ≤ 150 LOC.
**Files touched:**

- Modify: `src/systems/vehicle/FixedWingModel.ts` (lines 243-351 — add a simulation-cull check to `shouldSimulate`).
- Possibly modify: `src/systems/vehicle/AirVehicleVisibility.ts` (export the cull-distance calc so the simulation gate can use it).

Do NOT touch: airframe physics; NPC pilot logic; render path (`AirVehicleVisibility` already culls rendering at ~450m).

## Why this task exists

User playtest 2026-04-20: "we are having issues with aircraft and performance as we do not need to be rendering them if we cant see them. I dont think we need an lod mesh either."

Recon (2026-04-20) confirmed:
- `AirVehicleVisibility.ts:29` already does **rendering** cull: `camera.position.distanceToSquared(vehiclePosition) <= maxDistanceSq` → sets `group.visible`.
- Cull distance derived from `camera.far`, fog distance, airborne boost; default ~450m, hysteresis 1.12× to prevent flicker.
- BUT: `FixedWingModel.ts:243-351` decides `shouldSimulate` independently of visibility:
  ```
  shouldSimulate = piloted || hasNPCPilot || airborne || speed > 0.5
  ```
  Then `airframe.step(...)` runs at line 312-319 regardless of camera distance.
- Visibility is computed *after* the step (lines 334-342) — rendering is culled but **physics already ran**.

The user explicitly does NOT want an LOD mesh; they want an outright simulation cull when the aircraft is far + off-screen + idle.

## Quantified impact (from recon)

- Typical airfield scenario: 3 parking aircraft (A-1, AC-47, F-4); one or two NPC-piloted (ferry/sortie); rest player-flyable. **All three step every frame** even if 2km away off-screen.
- Per-aircraft step cost: terrain sample (`getTerrainSampleCached`), `computeAero`, swept collision (`terrain.sweep`), quaternion update.
- Conservative estimate: ~0.3-0.5ms per off-screen aircraft per frame on RTX 3070.
- 3-5 aircraft scenario: ~1-2ms savings if all off-screen.
- 10+ aircraft scenario: 5-10ms savings.

Combat120 is the binding perf scenario, and it has no aircraft active, so this won't shift combat120 baselines. But it builds the headroom for future combined-arms scenarios.

## Required reading first

- `src/systems/vehicle/FixedWingModel.ts:243-351` (the simulation loop).
- `src/systems/vehicle/AirVehicleVisibility.ts` end-to-end (~50 LOC).
- The NPC pilot's expectations: does `NPCFixedWingPilot.update()` (called at FixedWingModel.ts:280) tolerate skipped frames? **Critical:** if a ferry-mission A-1 gets culled mid-flight while off-screen, does it pop back in at a wrong waypoint when the player turns around?

## Target behavior

`shouldSimulate` becomes:

```
piloted                              → true   (always)
hasNPCPilot && airborne              → true   (NPC mid-mission must continue)
hasNPCPilot && !airborne && parked   → false if camera > simCullDistance + hysteresis
                                     → true otherwise
unpiloted && parked                  → false if camera > simCullDistance + hysteresis
                                     → true otherwise
unpiloted && airborne                → false if camera > simCullDistance + hysteresis
                                     → true otherwise (very low expected occurrence)
```

Hysteresis: same 1.12× pattern `AirVehicleVisibility` uses to prevent flicker. When entering cull range, immediately stop simulating; when exiting, resume on the next frame.

**Critical:** parked aircraft skipped from simulation should still get their position/orientation cached so when sim resumes, the airframe state is valid (not stale by minutes). Easiest: when transitioning from `simulating → culled`, snapshot `position`, `quaternion`, `velocity = 0`. When transitioning back, restore.

For airborne NPC aircraft: do NOT cull simulation by default in v1 (mid-mission state is fragile). Reserve airborne-NPC simulation cull for a follow-up task that requires explicit testing.

## Steps

1. Read all of "Required reading first."
2. Confirm the cull-distance calc in `AirVehicleVisibility` and the camera-position source. Export a pure helper if needed.
3. In `FixedWingModel.ts`, gate `shouldSimulate` by camera distance + state (parked vs airborne), with hysteresis. Default to "simulate" for all airborne NPC aircraft in v1 (be conservative).
4. Add Logger trace at the cull transition for debugging.
5. Manual verify in `npm run dev`:
   - Walk away from airfield; aircraft should freeze at their parking spots once distance > cull threshold.
   - Walk back; aircraft resume normal simulation.
   - Spawn a NPC-piloted A-1 ferry; walk away while it's airborne; turn around — A-1 should still be at its expected waypoint (airborne NPC simulation continues by default).
6. `npm run perf:capture:combat120` — confirm no regression (no aircraft active, should be a no-op).

## Screenshot / capture evidence (required for merge)

Commit to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/aircraft-simulation-culling/`:

- `aircraft-frozen-far.png` — top-down or oblique view from 1km away; aircraft frame-counter overlay (or temp Logger trace) showing they are not stepping.
- `aircraft-resumed-near.png` — same shot from <300m showing they resume.

## Exit criteria

- Parked unpiloted + parked NPC-piloted aircraft skip `airframe.step()` when camera distance > sim cull + hysteresis.
- Airborne NPC-piloted aircraft continue simulating regardless of distance (v1 conservatism).
- Player-piloted aircraft always simulate.
- Hysteresis prevents flicker on cull boundary.
- No behavioral regression: aircraft positions / orientations are valid when sim resumes.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- `combat120` perf smoke unchanged (combat120 has no aircraft).
- Add a unit test asserting `shouldSimulate` returns false for an unpiloted parked aircraft beyond cull distance, true within.

## Non-goals

- Do not implement an LOD mesh — user explicitly doesn't want one.
- Do not cull airborne NPC aircraft (deferred to follow-up).
- Do not change rendering cull (already exists in `AirVehicleVisibility`).
- Do not change `NPCFixedWingPilot` step logic.
- Do not introduce a generic "vehicle simulation cull" abstraction; just gate `FixedWingModel`.

## Hard stops

- Fence change → STOP.
- Culling causes aircraft to teleport / pop into wrong state on resume → STOP, fix state-snapshot logic.
- combat120 regresses → STOP (shouldn't happen, but verify).
- NPC pilot integration tests fail → STOP, check assumption that culled-then-resumed state is valid.
