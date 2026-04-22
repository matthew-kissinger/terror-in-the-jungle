# a1-altitude-hold-elevator-clamp: per-aircraft elevator clamp for altitude-hold PD

**Slug:** `a1-altitude-hold-elevator-clamp`
**Cycle:** `cycle-2026-04-22-heap-and-polish`
**Round:** 2
**Priority:** P1 — closes the A-1 Skyraider altitude-hold recapture regression PR #126 shipped (175m → 463m at cruise throttle). The brief for PR #126 explicitly forbade gain retuning; this task is the correct follow-up.
**Playtest required:** NO (probe-verified).
**Estimated risk:** low — widens an existing clamp per-aircraft. Failure mode is less stable altitude hold for the tuned aircraft; easily reverted.
**Budget:** ≤150 LOC.
**Files touched:**

- Modify: `src/systems/vehicle/airframe/Airframe.ts:345-349` (the elevator clamp inside the altitude-hold PD).
- Modify: `src/systems/vehicle/FixedWingConfigs.ts` (add per-aircraft `altitudeHoldElevatorClamp` with a sane default).

## Required reading first

- `src/systems/vehicle/airframe/Airframe.ts:328-351` (the altitude-hold PD as unified in PR #126 — `altErr`, `vs`, pitch-rate damping; the `clampScalar(..., -0.15, 0.15)` at line 347-348).
- `src/systems/vehicle/FixedWingConfigs.ts:156` (A-1 Skyraider), `:217` (F-4 Phantom), `:287` (AC-47 Spooky) — the three aircraft configs.
- `docs/tasks/archive/cycle-2026-04-22-flight-rebuild-overnight/airframe-altitude-hold-unification.md` — PR #126 brief. The "Surprises" section in the executor's report documents the A-1 regression in detail.
- `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airframe-altitude-hold-unification/after.json` — before/after probe captures. Look at the A-1 recapture scenario.

## Diagnosis

PR #126 unified altitude-hold onto the Airframe PD (strong gains: `-altErr*0.015 - vs*0.06 - pitchRate*0.05`). Before the PD writes elevator, it clamps to `±0.15`. The clamp value was tuned for the B1 integration cruise (50 m/s, throttle 0.55) and works for F-4 and AC-47 — but the A-1 Skyraider has a higher thrust-to-weight at cruise throttle and saturates the clamp before the PD can overcome the climb-wedge energy from a pitch-up pulse.

Evidence from the post-cycle probe: A-1 recapture-after-pitch-release peak deviation regressed 175m → 463m; F-4 and AC-47 improved. This is clamp saturation, not gain instability.

## Fix

Make the clamp per-aircraft:

1. Add `altitudeHoldElevatorClamp?: number` to `FixedWingAirframeConfig` (or equivalent — check the exact config shape in `FixedWingConfigs.ts`).
2. Set defaults:
   - F-4 Phantom: `0.15` (current behavior, no change).
   - AC-47 Spooky: `0.15` (current behavior).
   - A-1 Skyraider: start at `0.30`; if probe shows residual saturation at `0.30`, try `0.35`. Cap at `0.40` (above that, the PD risks bang-bang oscillation under disturbance).
3. In `Airframe.ts:347-348`, replace the literal `-0.15, 0.15` with `-clamp, clamp` reading from config, with a fallback `clamp = 0.15` if the config field is undefined.

## Steps

1. Read all of "Required reading first."
2. Add a one-shot probe script: spawn A-1 at cruise altitude/speed (match the after.json scenario shape from the prior cycle), pitch up by +0.8 stick for 2s, release, measure peak altitude deviation over the next 30s. Run at `0.15` (baseline confirm), `0.25`, `0.30`, `0.35`, `0.40`. Pick the smallest clamp that keeps peak deviation < 50m.
3. Apply the change:
   - Config: add field with A-1 set to the winning value, F-4 and AC-47 left at 0.15.
   - Airframe: read from config with default.
4. Re-run the probe on F-4 and AC-47 at the same scenario — confirm no regression (cruise-hold steady-state still within ±5m over 60s hands-off).
5. Add a Vitest regression: "A-1 altitude-hold recapture-after-pitch-release peak deviation is below 100m at cruise throttle" (tighter than the clamp's design budget but within its capability).
6. Probe before/after JSON to `docs/cycles/cycle-2026-04-22-heap-and-polish/evidence/a1-altitude-hold-elevator-clamp/`.

## Exit criteria

- A-1 Skyraider recapture-after-pitch-release peak deviation < 100m at cruise throttle (probe-verified).
- F-4 Phantom steady-state altitude-hold deviation < ±5m over 60s hands-off (no regression).
- AC-47 Spooky steady-state altitude-hold deviation < ±5m over 60s hands-off (no regression).
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Probe evidence committed.

## Non-goals

- Do not retune the PD gains (`-altErr*0.015 - vs*0.06 - pitchRate*0.05`). The clamp change alone should close the gap.
- Do not modify `buildCommand.ts` or any other altitude-hold consumer outside `Airframe.ts`.
- Do not expand the F-4 or AC-47 clamp from 0.15 unless the probe shows they would benefit without cruise regression; if so, record in the report for future consideration but leave defaults unchanged in this task.

## Hard stops

- Probe shows A-1 still regresses at `0.40` clamp → STOP, memo the finding; the gain tuning that was out-of-scope for PR #126 is the real fix, and this task punts to the next cycle.
- Widened clamp introduces visible oscillation in cruise hold for A-1 (hands-off, 60s) → STOP, narrow the value, re-probe.
- Fence change (SystemInterfaces) → STOP. Adding a field to `FixedWingConfigs` does NOT require a SystemInterfaces edit; if the executor finds otherwise, something is wrong — reconsider the config shape.

## Pairs with

`helicopter-interpolated-pose` (both in Round 2, disjoint files).
