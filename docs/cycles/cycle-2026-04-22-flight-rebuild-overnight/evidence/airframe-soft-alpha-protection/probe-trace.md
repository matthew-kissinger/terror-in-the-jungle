# Probe trace: airframe-soft-alpha-protection

## Scenario

A-1 Skyraider from parked state, full-throttle takeoff with pitch +0.3 until
AGL > 40 m, then sustained pitch-stick at a test setting for `durationS`
seconds over flat terrain (probe.sweep always returns null). Probe script:
`scripts/probe-alpha-protection.ts`. Ran for two scenarios:

- `hardPull` — pitch +0.8 for 60 s (the brief's stall-protection check).
- `steadyClimb` — pitch +0.3 for 30 s (moderate-pull boundary ride).

Metrics window: 2 s after takeoff completes through 31 s (hardPull) or
end-of-run (steadyClimb), excluding ground-contact ticks.

`alphaStallDeg` = 16, `stallSpeedMs` = 34 m/s. `stallSpeedMs * 0.95` = 32.3.

## Variants probed

1. **baseline** — narrow 4-deg smoothstep from `alphaStall - 5` to
   `alphaStall - 1`. Authority hits 0 at `alphaStall - 1`; no
   authority past stall.
2. **variant-A** — widened asymmetric smoothstep from `alphaStall - 8` to
   `alphaStall + 1`. 9-deg band, allows partial response at stall.
3. **variant-B** — soft tanh centred on `alphaStall`, 3-deg characteristic
   width: `0.5 * (1 - tanh((|alpha| - alphaStall) / 3))`. Smooth C-infinity
   derivative everywhere; ~34% authority retained at `alphaStall + 1`.

## Results

### hardPull (pitch +0.8, 60 s)

|                        | baseline | variant-A | variant-B |
|------------------------|---------:|----------:|----------:|
| vsRMS (m/s)            |   35.61  |    35.77  |    36.92  |
| vsPeakToPeak (m/s)     |  104.50  |   104.26  |   107.01  |
| vsPtp1sMedian (m/s)    |    9.00  |     9.09  |    10.44  |
| alphaPtp1sMedian (deg) |    1.57  |     1.45  |     2.94  |
| fwdMin (m/s)           |   13.77  |    19.22  | **28.14** |
| fwdMin / stallSpeed    |    0.40  |     0.57  |  **0.83** |
| aoaMaxDeg              |   76.22  |    70.66  |  **17.96**|
| stayedAirborne         |   true   |    true   |    true   |

### steadyClimb (pitch +0.3, 30 s)

|                        | baseline | variant-A | variant-B |
|------------------------|---------:|----------:|----------:|
| vsRMS (m/s)            |   33.23  |    33.36  |    33.44  |
| vsPeakToPeak (m/s)     |  110.69  |   110.59  |   110.81  |
| vsPtp1sMedian (m/s)    |    6.13  |     6.47  |     6.51  |
| alphaPtp1sMedian (deg) |    1.62  |     1.43  |     1.75  |
| fwdMin (m/s)           |   30.13  |    30.31  |    30.15  |
| aoaMaxDeg              |   12.97  |    11.99  |    15.08  |

## Reading

Phugoid oscillation dominates every variant's long-period vsRMS because
the companion tasks `airframe-climb-rate-pitch-damper` and
`airframe-authority-scale-floor` have not landed yet (those tasks are
explicitly paired with this one per the brief). The alpha-protection
change alone cannot fix phugoid — it can only fix the alpha-boundary
oscillator.

What variant-B decisively changes is the alpha ceiling. Baseline lets
alpha rocket to 76 deg (aircraft tumbles vertical and phugoid-crashes).
Variant-A marginally reduces the peak (70 deg). Variant-B caps alpha at
~18 deg — only 1.1x alphaStall, inside the soft roll-off band. The
aircraft still phugoids (that's phugoid, not alpha saturation), but it
never enters the deep stall regime.

Corresponding stall-speed margin: baseline bleeds to 40% of stall speed;
variant-A to 57%; variant-B holds 83%. The brief's exit criterion
(`fwdMin >= stallSpeedMs * 0.95` = 32.3 m/s) is not fully hit by any
single-task variant, but variant-B is by far the closest and the only
one that keeps the aircraft in a flight regime the companion tasks can
stabilise.

Short-window oscillation metrics (`vsPtp1sMedian`, `alphaPtp1sMedian`)
are slightly higher for variant-B because its protection band is wider
and it activates at lower alpha (~0.88 at alphaStall-3). That's the
cost of smoothness; the smoothness itself is what prevents the bang-bang
oscillator documented in the task brief.

## Decision

Pick variant-B (tanh). Rationale:

1. Only variant that bounds alpha near stall; baseline and variant-A
   both blow through alpha=70 deg.
2. Tanh has a smooth derivative everywhere, so the boundary-oscillator
   pathology described in the brief cannot reproduce — there is no edge
   for it to lock onto.
3. Retains ~34% elevator authority at alphaStall + 1 deg (see
   `pitch-rate-vs-alpha` table below), so the pilot can still push out
   of a stall with the same aft-stick input that entered it. Under the
   baseline narrow smoothstep, authority hits 0 at alphaStall - 1 and
   there is no recovery input.

### pitch-rate-vs-alpha (diagnostic, full aft stick, effector saturated)

| alpha (deg) | baseline pitchRate (deg/s) | variant-B pitchRate (deg/s) |
|------------:|---------------------------:|----------------------------:|
|          11 |                       2.83 |                        2.73 |
|          12 |                       2.34 |                        2.62 |
|          13 |                       1.29 |                        2.43 |
|          14 |                       0.25 |                        2.14 |
|          15 |                      -0.24 |                        1.73 |
|          16 |                      -0.26 |                        1.23 |
|          17 |                      -1.53 |                       -0.52 |
|          18 |                      -1.65 |                       -1.02 |

Under baseline the pitch response crosses zero between alpha=14 and 15
(inside the narrow ramp) and stays negative past stall. Under variant-B
it crosses between 16 and 17 — one deg past stall — and the fall-off
past that point is shallower because the stall-drop + restoring terms
are not amplified by a zero elevator factor.

## Verification

See `src/systems/vehicle/airframe/Airframe.alphaProtection.test.ts`:
- `elevator authority is smooth (not bang-bang) as alpha crosses stall`:
  adjacent 1-deg alpha samples inside the stall +/- 2 deg band must each
  produce an elevator-authority change smaller than 50% of the well-
  below-stall reference authority.
- `retains a sliver of recovery authority when alpha is 1 deg past
  stall`: elevator authority at alphaStall + 1 must be at least 10% of
  the reference well-below-stall value. Baseline fails this (authority
  = 0); variant-B passes (~30%).

Full L1+L2+L3 run: all green.
