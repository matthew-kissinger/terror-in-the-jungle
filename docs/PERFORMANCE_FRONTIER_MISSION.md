# Performance Frontier Mission

Last updated: 2026-02-21
Mode: Active
Primary target: stable 120+ combatants with improved `p95/p99` and controlled hitch tails.

## Current Frontier Track

- Track: `F3` (single authoritative spatial ownership).
- Status: partial migration complete; legacy secondary sync still exists as fallback path.
- Current decision: keep `spatialSecondarySync=0` as an experimental candidate, but do not flip default until longer clean A/B + soak confirms heap behavior and stability.

## Intent

- Optimize for tail stability, not only average FPS.
- Keep combat plausibility while scaling.
- Reject complexity that is not backed by capture evidence.

## Non-Negotiable Rules

- Every substantial optimization change must be reversible.
- Measure before/after in the same scenario.
- Keep behavior-valid runs only.
- Do not accept changes that improve average frame time while worsening tail outliers.

## Keep/Revert Gates

Keep only if all are true:
- Material tail improvement (`p95`, `p99`, hitch ratios, max stall trend)
- No major gameplay regressions (targeting fairness, movement plausibility, objective flow)
- No harness contamination invalidating the run

Revert if any are true:
- Average improves but tail degrades
- Behavior gets materially worse
- Measurement quality is compromised

## Required Benchmarks

- Throughput: `npm run perf:capture:combat120`
- Long soak: `npm run perf:capture:frontier30m`
- A Shau spot-check: `npm run perf:capture:ashau:short`

## Active Risks

- Heap growth waves still appear in some high-intensity runs.
- Startup contamination can make A/B comparisons noisy.
- Spatial ownership remains split for some consumers.

## Next Frontier Tracks

- `F3`: complete migration to one authoritative spatial provider
- `F4`: movement/steering simplification for large-N stability
- `F5`: coarse-to-fine combat validation to cap worst-case cost

## Documentation Contract

After each experiment cycle:
- record decision + evidence in `docs/ARCHITECTURE_RECOVERY_PLAN.md`
- update flags/scenario semantics in `docs/PROFILING_HARNESS.md`
- remove dead-end experiments instead of carrying dormant complexity
