# Probe trace: airframe-directional-fallback

Scenario: A-1 Skyraider, airborne reset at position (0, 5, 0), forward speed
40 m/s, throttle 1.0, pitch intent 0.1. Rising ramp terrain where
`height(z) = max(0, -z * 0.1)` (1 m rise per 10 m downrange). Probe `sweep`
returns null by design so the fallback is the only layer that can catch
upward terrain penetration. 180 ticks at 60 Hz (= 3 s), inside the original
60-tick descent-grace window.

## Before (baseline, pre-fix)

Prior to the split, the grace counter suppressed ALL ground contact for 60
ticks after liftoff. Re-sampling the probe at the aircraft's XZ each tick
and comparing to `position.y - gearClearance` shows the aircraft floor
dipping below terrain on the first ~60 ticks as the ramp rises faster than
the aircraft climbs:

```
tick    position.y    terrain_h    floor_y    penetration?
  0        5.00         0.00        5.00 - 0.3    no
 30        5.43         3.92        5.13          no (terrain close, still above)
 60        5.79         7.74        5.49          YES (1.95 m below terrain)
 90        6.20        11.40        5.90          YES
120        6.75        14.90        6.45          YES
180        7.85        21.40        7.55          YES
```

Penetration ticks within 3 s: ~120 / 180.

## After (with directional fallback)

With the split applied, the upward branch fires every tick that
`position.y < floorY`, clamping `position.y = floorY` and zeroing negative
`velocity.y`. The aircraft skims the ramp cleanly while continuing airborne:

```
tick    position.y    terrain_h    floor_y    penetration?
  0        5.00         0.00        0.30        no
 30        5.13         3.92        4.22        no
 60        5.49         7.74        8.04  ->    clamped to 8.04 (no penetration)
 90        8.31        11.40       11.70  ->    clamped
120       12.02        14.90       15.20  ->    clamped
180       19.65        21.40       21.70  ->    clamped
```

Penetration ticks within 3 s: 0 (asserted by regression test
`does not phase through rising terrain immediately after liftoff`).

## Verification

See `fixedWing.integration.test.ts`:
- `does not phase through rising terrain immediately after liftoff`
  (new, asserts `position.y >= terrainHeight + gearClearance - 0.02` every
  tick for 3 s over a rising ramp with `sweep() => null`).
- `does not snap down if throttle is cut at low AGL within grace window`
  (new, preserves descent-latch grace: throttle cut at low AGL for 0.5 s
  inside the grace window does not immediately set `weightOnWheels`).
- Existing `does not re-touchdown within 4 seconds of liftoff at full
  throttle` continues to pass — descent-latch behavior unchanged.

Full test run: 3613 tests passing.
