# Fixed-Wing Flight Issues

## Status
Resolved and superseded by the fixed-wing control-law + runtime-probe pass.

## Context

This note documents the original stall/root-cause work that unblocked the later fixed-wing reset. The current codebase now layers a phase-aware control law, explicit operation states, airfield runway helpers, and deterministic browser probes on top of these physics fixes.

## Issue 1: Cannot complete takeoff - stalls before liftoff

**Resolved.** Root cause was a control authority discontinuity: `stepGrounded()` capped pitch at `rotationPitchLimitDeg` (12 deg), but `stepAirborne()` applied raw elevator with no limit. Full elevator (2.3 power) overwhelmed stability forces (0.65 at stall AoA), driving equilibrium AoA to 42.8 deg - the 15 deg stall angle was hit in 3 frames.

**Fix:** Alpha protection system in `stepAirborne()` attenuates nose-up elevator as AoA approaches stall via smoothstep from `(alphaStallDeg - 5)` to `(alphaStallDeg - 1)`. Equilibrium AoA with full elevator now settles at ~12.7 deg, safely below stall. Always active (not tied to stabilityAssist toggle). Nose-down authority unaffected.

## Issue 2: Rolls inverted and nose-dives when going airborne off terrain

**Resolved.** Terrain separation path (going over a hill) transitioned to airborne without the upward velocity boost that normal liftoff provides, and had no speed gate.

**Fix:** Two changes to the terrain separation block in `simulateStep()`:
1. **Speed gate:** If speed < stallSpeed and separation < 3m, snap back to ground instead of entering airborne. Prevents false flight at taxi speeds over terrain bumps.
2. **Velocity boost:** When entering airborne via terrain separation at flyable speed, apply the same upward velocity kick as normal liftoff: `max(1.5, speed * 0.04)` m/s. Combined with alpha protection (Issue 1), prevents nosedive from AoA overshoot.

## Implementation notes
- Alpha protection: `FixedWingPhysics.ts` `stepAirborne()`, before `pitchAccel` computation
- Terrain separation: `FixedWingPhysics.ts` `simulateStep()`, `airborneBySeparation` block
- Tests: `FixedWingPhysics.test.ts` - "alpha protection prevents stall during aggressive rotation", "takes off cleanly with full pitch input", "stalls from speed loss"
- Current verification path: `scripts/fixed-wing-runtime-probe.ts` plus the fixed-wing control-law / model / interaction tests
