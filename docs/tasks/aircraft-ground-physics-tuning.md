# aircraft-ground-physics-tuning: fix takeoff porpoising / bouncing on ground-clamp oscillation

**Slug:** `aircraft-ground-physics-tuning` *(file kept; the original "tune throttle/lift/friction" hypothesis was wrong — see "Recon-corrected diagnosis" below)*
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P0 — depends on `airfield-terrain-flattening` (need a real flat runway to test against without runway-bump confound).
**Playtest required:** YES.
**Estimated risk:** medium — physics oscillation in airborne integration; previous tuning passes worked around the symptom (hill-launch) without fixing root cause.
**Budget:** ≤ 250 LOC.
**Files touched:**

- Investigate + modify: `src/systems/vehicle/airframe/Airframe.ts` (specifically the post-liftoff fallback at lines 522-540 and the `LIFTOFF_WEIGHT_RATIO` / `postLiftoffGraceTicks` / `liftoffClearanceM` constants at lines 35, 408, and configs.ts:60).
- Possibly modify: `src/systems/vehicle/airframe/configs.ts` (per-aircraft `liftoffClearanceM` / lift coefficients if the airborne fix exposes secondary tuning needs).

Do NOT touch: `NPCFixedWingPilot.ts` ground-roll throttle behavior — recon confirmed throttle reaches 1.0 fine; the bug is downstream in airborne integration.

## Recon-corrected diagnosis (2026-04-20)

User playtest 2026-04-20: aircraft "almost like bouncing in the air" during takeoff; takeoff requires excessive speed; control feel after liftoff is poor.

Aircraft archaeology agent confirmed the root cause is **ground-clamp oscillation in the post-liftoff grace period**, NOT throttle/lift/friction tuning. Sequence:

1. **Line 378 (integrateGround)**: during ground roll, `position.y = groundHeight + gearClearanceM` forces the aircraft to exact ground height every frame.
2. **Line 395 (liftoff condition)**: when conditions met (`LIFTOFF_WEIGHT_RATIO = 0.25` is permissive), aircraft transitions airborne with a small upward impulse: `velocity.addScaledVector(up, Math.max(3.0, newFwd * 0.08))`.
3. **Lines 426+ (integrateAir)**: aircraft integrates normally with gravity, aero, thrust.
4. **Lines 522-540 (post-liftoff fallback)**: if airborne but altitude AGL ≤ `0.2 + 0.08 = 0.28m` and `velocity.y ≤ 0` and `postLiftoffGraceTicks` (60 frames = 1 second) have expired → `position.y` snaps back to ground, **zeroing vertical velocity**.
5. **The cycle**: aircraft generates positive lift → climbs 0.2-0.3m → grace expires → aero momentarily can't sustain climb → fallback fires → velocity.y zeroed → repeat. Visible as porpoising. Hill-launch works because you start above the threshold.

The "needs excessive speed" symptom is the same bug viewed from the player's seat: the aircraft can't *sustain* climb until it's high enough that the fallback no longer fires, which requires comfortable lift authority, which requires speed margin over Vr.

Control-feel-after-liftoff is likely a perceptual artifact of the porpoising — once the vertical oscillation is removed, perceived pitch response should also improve. **Re-evaluate control feel after the bounce fix lands**, don't pre-tune.

## Required reading first

- `src/systems/vehicle/airframe/Airframe.ts` end-to-end. Focus on:
  - `LIFTOFF_WEIGHT_RATIO` (line 35) and `postLiftoffGraceTicks` (line 408).
  - The post-liftoff fallback at lines 522-540 — this is the bug.
  - Liftoff transition + impulse at lines 395-402.
  - `integrateAir` / `integrateGround` boundary.
- `src/systems/vehicle/airframe/configs.ts` — `liftoffClearanceM: 0.2` (line 60); per-aircraft mass + lift coefficients (`cl0`, `clMax`).
- `src/systems/vehicle/airframe/terrainProbe.ts` — terrain height sampling for the wheels (relevant to the fallback's "altitude AGL" calc).
- Existing tests: `Airframe.test.ts`, `NPCFixedWingPilot.test.ts`, `NPCFixedWingPilot.integration.test.ts`.

## Fix candidates (cheapest first; pick one or compose)

1. **Raise `liftoffClearanceM` from 0.2 → 0.5** (configs.ts:60). Fallback only fires for true ground contact, not for transient sub-half-meter dips.
2. **Require sustained `velocity.y ≤ 0` for N consecutive ticks** before re-clamping (currently fires the moment `vy ≤ 0` and grace expires). N = 5-10 ticks gives the airframe time to recover lift.
3. **Lower `LIFTOFF_WEIGHT_RATIO` from 0.25 → 0.15** so liftoff doesn't trigger until lift authority is more comfortable; aircraft stays grounded a bit longer but enters airborne with margin.
4. **Boost the liftoff impulse** at line 400 from `Math.max(3.0, newFwd * 0.08)` to `Math.max(4.5, newFwd * 0.12)` so the aircraft enters airborne with more vertical clearance.

Option 1 alone may resolve it. Verify with Logger trace before adding more.

## Steps

1. Wait for `airfield-terrain-flattening` to merge (need flat runway to remove confound).
2. Read all of "Required reading first."
3. Add Logger trace in `Airframe.ts` post-liftoff fallback path that logs altitude AGL, `velocity.y`, ticks since liftoff, whether fallback fired this frame.
4. Boot dev, observe an A-1 NPC takeoff (the ferry mission auto-launches at boot — see `aircraft-a1-spawn-regression`); identify the bounce pattern in the trace.
5. Apply fix candidate 1 (raise `liftoffClearanceM`). Re-test. If still bouncing, layer in candidate 2.
6. Verify all three aircraft (A-1, AC-47, F-4) take off cleanly from a flat runway. AC-47 may need manual flight or a test fixture.
7. **Re-evaluate control feel after liftoff** — if it still feels bad after bounce is fixed, file a follow-up `aircraft-control-feel-tuning` brief; don't pre-tune in this PR.
8. Re-run `Airframe.test.ts`, `NPCFixedWingPilot.test.ts`, `NPCFixedWingPilot.integration.test.ts`.

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/aircraft-ground-physics-tuning/`:

- `a1-takeoff-sequence.png` — composite or single mid-takeoff shot of the A-1 lifting off the FLAT runway (not a hillside) with no visible bounce; positive vertical trajectory.
- `f4-takeoff-sequence.png` — same for F-4 (manual or NPC if added).
- `before-after-altitude-trace.png` — optional but useful: a strip-chart of altitude AGL over time, before-fix (sawtooth bouncing) vs after-fix (smooth climb).

## Exit criteria

- A-1 Skyraider with `npcAutoFlight.kind === 'ferry'` takes off from the main_airbase flat runway and reaches ferry waypoint without porpoising.
- All three aircraft can take off from a flat runway without bouncing.
- Cruise behavior unchanged — no regression in level flight or NPC navigation.
- `Airframe.test.ts`, `NPCFixedWingPilot.test.ts`, `NPCFixedWingPilot.integration.test.ts` pass; add a regression test asserting altitude AGL increases monotonically (with smoothing tolerance) for the first N seconds post-liftoff.
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not change cruise tuning unless proven necessary.
- Do not redesign the airframe state machine.
- Do not add new aircraft.
- Do not address ground turning / taxi steering (separate concern).
- Do not pre-tune control feel — re-evaluate after bounce is fixed; if still bad, file a follow-up.

## Hard stops

- Fence change → STOP.
- Fix requires regenerating navmesh → STOP.
- Tuning that fixes takeoff breaks cruise → STOP, find a different lever.
- `airfield-terrain-flattening` hasn't landed → block this task; the bumpy-runway confound makes physics tuning untestable.
- Bounce persists after both candidates 1 and 2 → STOP, escalate; root cause may be deeper than the fallback (e.g. terrain probe oscillation).
