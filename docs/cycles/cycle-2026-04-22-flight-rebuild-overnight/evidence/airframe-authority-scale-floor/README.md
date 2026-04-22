# airframe-authority-scale-floor evidence

- `authority-scale-curve.json` — before/after sample grid of `authorityScale(qNorm)` with `qNorm = dynamicPressure / qRef`.

## Summary of change

Before: `authorityScale = clamp(qNorm, 0.15, 2.2)`
After:  `authorityScale = min(floor + smoothstep(qNorm, 0.10, 0.30) * (qNorm - floor), 2.2)` with `floor = 0.30`.

## What to look at in the JSON

Compare the `keyPoints` sections of `before` and `after`:

- The `after` curve never drops below `0.30` (floor is higher than the old 0.15), so low-q aircraft have slightly more residual authority than before.
- At `qNorm = 0.30` both curves meet at `0.30`. This is the blend exit: above 0.30 the two curves are identical.
- At `qNorm >= 2.2` both curves clamp at `2.2` (high-side clamp preserved).
- In `[0.10, 0.30]` the old curve is pinned at `0.15` or flat then jumps linearly at the clamp edge; the new curve dips smoothly from `0.30` → `(floor blend)` → back to `0.30` with a continuous first derivative (no clamp-edge discontinuity).

The regression test in `src/systems/vehicle/airframe/Airframe.authorityScale.test.ts` pins the observable consequence: pitch-rate response vs. airspeed across the blend region has no spike (bounded finite-difference slope), and high-speed handling is unchanged.
