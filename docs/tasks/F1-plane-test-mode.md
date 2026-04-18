# Task F1: Isolated plane test mode + integration test harness

**Phase:** F (prereq for the E6 rebuild landing in prod)
**Depends on:** nothing
**Blocks:** E6 prototype validation, any future fixed-wing behavior work
**Playtest required:** yes (the deliverable IS a playtest harness)
**Estimated risk:** low (new surface, doesn't touch existing flight code)
**Files touched:** new `src/dev/flightTestMode.ts`, new `src/dev/flightTestScene.ts`, new `src/systems/vehicle/__tests__/fixedWing.integration.test.ts`, tiny change to `src/bootstrap.ts` or entry to register the dev hotkey/URL param

## Problem

Every attempt to fix the fixed-wing plane has failed because the engine has too much
noise to debug flight behavior in — 3000 AI combatants, streaming CDLOD terrain,
objective zones, squad logic, HUD overlays, LOD re-parenting. A regression in flight
behavior can come from any of those. Agents keep editing `FixedWingPhysics.ts`,
running tests that pass, then failing in-game, because nothing actually exercises the
full input → physics → render path at L3.

There is also no integration test for the plane. Unit tests of the elevator → pitch
math pass while the feature is broken. This is why edits have been ineffective.

## Goal

Two deliverables that together let a human or an agent validate flight behavior
deterministically:

1. **An isolated test scene** reachable by URL param (`?mode=flight-test`) or dev
   hotkey, containing: a flat 1km × 1km ground plane at `y=0`, a skybox, one
   spawnable fixed-wing aircraft (Skyraider), a follow camera, and an on-screen debug
   overlay showing airspeed, altitude AGL, pitch, roll, elevator/aileron command,
   throttle, weight-on-wheels, flight phase. No AI, no combat, no LOD, no objectives,
   no terrain streaming, no HUD.
2. **An L3 integration test** (Vitest) that boots a headless minimal harness, drives
   the input → physics → render path, and asserts observable flight outcomes.

The scene is for humans to feel the controls. The integration test is for agents (and
CI) to catch regressions before landing.

## Required reading first

- `docs/tasks/E6-vehicle-physics-rebuild.md` — the rebuild this harness validates.
- `docs/TESTING.md` — four-layer contract. This task produces an L3 integration test,
  not an L2 or L4.
- `docs/INTERFACE_FENCE.md` — the test scene must NOT modify fenced interfaces.
- `src/bootstrap.ts` — find the hook for conditional dev modes.
- `src/systems/SystemUpdater.ts` — confirm the current update order
  (input-before-vehicles vs vehicles-before-input) to bake into the harness.
- `examples/flight-references/README.md` — study the canonical update order and
  terrain-sampling patterns BEFORE designing the harness.

## Scene requirements

- URL param OR hotkey entry. Prefer URL (`?mode=flight-test`) for repeatability.
- Flat terrain: one `PlaneGeometry` at `y=0`, 1km × 1km, single static collision
  surface. No CDLOD, no chunk streaming, no heightmap.
- One plane spawned at `position=(0, 1.5, 0)` (wheels touching), aligned along `+z`.
- Camera: chase-cam copy of the existing `PlayerCamera.updateFixedWingCamera` logic.
  Not a new camera system.
- Debug overlay: top-left monospace text panel. Update every frame. Must show at
  minimum:
  - `airspeed` (m/s, forward component)
  - `altitude AGL` (m)
  - `pitch` (deg)
  - `roll` (deg)
  - `elevator_cmd`, `aileron_cmd`, `throttle` (normalized)
  - `wheels_on_ground` (bool)
  - `flight_phase` (string from the physics state machine)
- On-screen control legend showing the exact keys bound.
- Reset key (`R`) to respawn the plane at origin.
- Nothing else. No weapons, no enemies, no minimap, no objective HUD.

## Integration test requirements

New file `src/systems/vehicle/__tests__/fixedWing.integration.test.ts` (or similar).
Scenarios as separate `it()` blocks:

1. **Takeoff from flat ground.** Spawn at `(0, 1.5, 0)`. Apply `throttle=1,
   pitch=+0.3` for 8 simulated seconds (fixed-timestep). Assert final
   `altitude > 20m` and `airspeed > vrSpeed`. This is the headline test — the one
   that's been failing for months in practice.
2. **Level flight holds altitude.** Spawn at `(0, 200, 0)` with airborne state,
   airspeed=50m/s, neutral stick. Run 5 simulated seconds. Assert
   `|altitude - 200| < 5m`.
3. **Nose-down dive accelerates.** Spawn airborne at 100m, apply `pitch=-0.5`. Run
   3s. Assert `airspeed` strictly increases.
4. **Full pitch-up from cruise doesn't stall immediately.** Spawn airborne at
   cruise, apply `pitch=+1.0` for 2s. Assert `airspeed > stallSpeed` at 1s mark
   (stall is expected later, but not immediately).
5. **Cliff scenario.** Spawn with wheels on a terrain step: ground at `y=50` for
   `x<0`, ground at `y=0` for `x>=0`, plane at `(1, 50.5, 0)` with `forward=+x`,
   `airspeed=40m/s` (just below Vr). Apply `throttle=1, pitch=0` for 4s. Assert
   the plane doesn't lose more than 30m of altitude — i.e., it glides or recovers,
   doesn't plummet. (This is the "drives off cliff and dies" bug.)

Tests must run headlessly — no real DOM, no real canvas. Use the same harness
approach as existing L3 tests in `src/` (find one and mirror its setup).

Tests must drive the REAL `FixedWingPhysics` → `FixedWingModel` →
`FixedWingPlayerAdapter` path, not mock any of them. If that path depends on
terrain, the test provides a flat-terrain stub that satisfies the interface.

## Success criteria for the current plane

Run the integration test against the current flight code. Expect:

- Test 1 (takeoff) to **fail**. This confirms the bug and gives us a regression
  target.
- Tests 2–4 may or may not pass. Document which.
- Test 5 (cliff) to **fail**. Also a regression target.

Do NOT fix the plane in this task. The deliverable is the harness. Fixes happen in
E6 or later.

## Non-goals

- Do not rewrite `FixedWingPhysics.ts` or any of the four flight files.
- Do not change `SystemUpdater` order in this task (even though it's wrong) — that's
  an E6 deliverable. Here we just measure.
- Do not add a helicopter test mode. One vehicle at a time.
- Do not wire the test scene into the main-menu UI. Hidden dev entry only.
- Do not commit the `examples/` clones (already gitignored).

## Exit criteria

- URL `?mode=flight-test` loads the isolated scene with debug overlay.
- Running it locally, a human can spawn the plane, apply throttle, and directly
  observe takeoff behavior without other game systems interfering.
- `npm run test:run` executes the new integration test file. Tests 1 and 5 are
  expected to fail (documenting the bug), but the test file itself runs without
  harness errors.
- Results documented in PR description: which tests pass, which fail, what the
  debug overlay shows during manual takeoff.
- `npm run lint` and `npm run build` green.

## Why this before E6

E6 says "Run an isolated scenario: spawn at altitude, apply stick, observe." It
doesn't specify *where*. Without this harness, E6's prototype validates in a vacuum
and we're back to whack-a-mole. Land this first. Then E6's prototype runs inside
this harness. Then the rebuild lands with confidence.
