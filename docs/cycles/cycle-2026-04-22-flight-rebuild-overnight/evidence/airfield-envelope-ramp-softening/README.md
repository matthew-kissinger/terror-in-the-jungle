# airfield-envelope-ramp-softening probe

Heightmap-slice evidence for the Round 3 airfield envelope softening.

## What the probe does

For a representative airfield (`innerRadius = 238 m`, the us_airbase lateral
reach), the probe computes the stamped terrain height along a radial slice
through the envelope using the same `getFlattenInfluence` math that
`StampedHeightProvider` runs at sample time. The native terrain is modeled as
a 0.25 m/m linear slope - a steep A-Shau-style hillside - so the slice
captures worst-case cliff-softening behavior.

## Files

- `probe-before.json` - previous envelope constants (`outerRadius = innerRadius + 6`, `gradeStrength = 0.45`).
- `probe-after.json`  - Round 3 constants (`outerRadius = innerRadius + 12`, `gradeStrength = 0.65`).

Each JSON contains a `slice` array of `{ d, native, influence, final }` samples
and a `diagnostics` block summarizing the ramp width, the stamped height at
`innerRadius + 6`, and the slope reduction at `gradeRadius / 2`.

## Key deltas

| Metric                                    | Before  | After   |
|-------------------------------------------|---------|---------|
| Hard ramp width (m)                       | 6       | 12      |
| Stamped height at `innerRadius + 6` (m)   | 33.55   | 10.68   |
| Slope reduction at `gradeRadius / 2` (%)  | 22.5    | 32.5    |

The 3x reduction at the old hard-ramp edge and the ~1.4x stronger shoulder
blend confirm the intent: the "ring" around airfield perimeter props is now
graded, not a step.
