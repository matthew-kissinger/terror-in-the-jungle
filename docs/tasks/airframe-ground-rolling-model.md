# airframe-ground-rolling-model: continuous wheel-load ratio replaces discrete liftoff gate

**Slug:** `airframe-ground-rolling-model`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Round:** 1
**Priority:** P0 - the "sticky takeoff" root fix. Replaces the discrete liftoff gate with a continuous wheel-load model.
**Playtest required:** NO (probe-verified).
**Estimated risk:** high - structural change to the most-tuned subsystem in the flight model. Every prior cycle tuned constants around the existing gate; this brief changes the architecture.
**Budget:** <=400 LOC net.
**Files touched:**

- Modify: `src/systems/vehicle/airframe/Airframe.ts` (`integrateGround` at 376-488, the liftoff transition block at 442-474, and the landed `syncGroundContactAtCurrentPosition` at 338-340 + 490-495).
- Optionally modify: `src/systems/vehicle/airframe/configs.ts` only if a per-aircraft tuning scalar is newly required; default behaviour should be correct without config changes.

Do NOT touch: `integrateAir`, the post-liftoff fallback (`airframe-directional-fallback` owns that), or `buildCommand.ts` (`airframe-altitude-hold-unification` owns that).

## Required reading first

- `src/systems/vehicle/airframe/Airframe.ts:376-488` (`integrateGround`).
- `src/systems/vehicle/airframe/Airframe.ts:442-474` (liftoff gate).
- `src/systems/vehicle/airframe/Airframe.ts:338-340` and `:490-495` (landed `syncGroundContactAtCurrentPosition` from commit `8c6b8ca`).
- External reference: [brihernandez/ArcadeJetFlightExample (README)](https://github.com/brihernandez/ArcadeJetFlightExample) - canonical arcade ground-friction taper.
- [FSX ground friction thread](https://forums.flightsimulator.com/t/please-fix-the-ground-physics-friction-inertia-etc/455009) - the exact stickiness symptom in a different engine.
- Prior task brief: `docs/tasks/archive/cycle-2026-04-21-atmosphere-polish-and-fixes/aircraft-ground-physics-tuning.md`.

## Diagnosis

- Liftoff is a discrete boolean: either `weightOnWheels` is true (pitch has zero effect on trajectory; only `groundPitch` lerps a visual target) or false (airborne). Below Vr, no matter what the pilot inputs, trajectory is locked to the ground. Prior cycles tuned `LIFTOFF_WEIGHT_RATIO` (0.6 -> 0.4 -> 0.25) and `rotationReady` threshold (0.9 -> 0.85) but the gate architecture is unchanged.
- Ground friction (`rollingResistance`, `lateralFriction`) is constant until the gate flips; then zero. This produces the "suddenly flies" feel.
- `syncGroundContactAtCurrentPosition` (landed in `8c6b8ca`, `Airframe.ts:339` + `:490-495`) re-samples terrain at the post-integrate XZ and re-snaps Y. On uneven runways this is a second per-tick clamp whose contribution to rollout jitter needs to be measured, not assumed.

## Fix (three sub-changes, composed)

1. **Continuous wheel-load ratio.** Introduce `wheelLoad = clamp((Vr - forwardSpeed) / Vr, 0, 1)`. Thrust, lateral friction, and pitch authority all multiply by the ratio: pitch authority scales with `(1 - wheelLoad)`, friction scales with `wheelLoad`. At 0.85*Vr you get 15% air authority, not 0%. The player feels the nose taking bite as speed builds.
2. **Ground-friction taper.** Same ratio. Friction coefficient multiplied by `wheelLoad`. At Vr, friction is zero.
3. **Evaluate `syncGroundContactAtCurrentPosition` via probe.** Add a probe assertion "rollout vertical position between t=1s and t=3s is monotonic-or-stationary" (Y never drops more than `gearClearanceM` within a consecutive 50 ms window). If the assertion fails with the sync present, either remove the sync (delete lines 338-340 and 490-495), guard it (only re-snap when the post-move terrain-normal difference is under a slope threshold), or reduce its authority (50% blend toward the re-sampled Y rather than a hard snap). Whichever option passes the probe wins.

## Steps

1. Read all of "Required reading first."
2. Confirm probe baseline from Round 0 exists (`docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/baseline/probe-before.json`); if not, fail early with a `blocked` report.
3. Implement the continuous `wheelLoad` ratio. Apply to pitch authority first. Probe A-1 takeoff; confirm pitch authority is nonzero at `forwardSpeed = 0.85 * Vr`.
4. Apply `wheelLoad` to friction. Probe A-1 again; confirm acceleration curve on rollout has no sudden step at the gate.
5. Preserve the liftoff vertical-impulse nudge (`velocity.addScaledVector(up, Math.max(4.5, newFwd * 0.12))` at line 464-466) - it rides on top of the new model and still prevents ground-scrape at the moment of rotation.
6. Evaluate the `syncGroundContactAtCurrentPosition` question. Use the probe's per-tick `altitudeAGL` trace.
7. Add Vitest regressions:
   - "pitch input at 0.85*Vr produces nonzero vertical acceleration" (was zero under the old gate).
   - "lateral friction is zero at `forwardSpeed = Vr`" (was nonzero in the frame before the gate flip under the old model).
   - "rollout vertical position between t=1s and t=3s does not drop more than `gearClearanceM` in any 50 ms window."
8. Write probe before / after JSON to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airframe-ground-rolling-model/`.

## Exit criteria

- A-1, F-4, AC-47 each take off from main_airbase with progressive pitch authority below Vr and no sudden gate transition in the probe altitude trace.
- Rollout vertical position monotonic-or-stationary (no sync double-clamp jitter) per the probe assertion above.
- `combat120` perf p99 within 5% of baseline.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Probe before / after JSON committed.

## Non-goals

- Do not pre-tune control feel after liftoff (that is what `airframe-directional-fallback` plus the natural feel of the continuous model delivers; re-evaluate during morning review, file follow-up if needed).
- Do not change `integrateAir`.
- Do not change per-aircraft lift coefficients.
- Do not reintroduce any discrete `weightOnWheels` check in the force path (the flag can remain as state metadata; force equations must use `wheelLoad`).

## Hard stops

- Pitch authority change breaks cruise feel or altitude-hold probe stability -> STOP.
- Removing / guarding the sync causes a visible rollout descent-below-terrain artifact in the probe -> STOP; keep the sync and guard more conservatively.
- Fence change -> STOP.

## Pairs with

`airframe-directional-fallback` (both touch Airframe.ts; coordinate rebase). `airframe-altitude-hold-unification` (both touch Airframe.ts but disjoint sections).
