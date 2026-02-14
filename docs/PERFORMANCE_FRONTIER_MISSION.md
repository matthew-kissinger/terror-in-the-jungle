# Performance Frontier Mission

Last updated: 2026-02-14
Mode: Active
Primary target: stable 120+ combatants with controlled frame tails and believable combat.

## Intent

This mission treats the current codebase as a baseline reference, not a final architecture.

Default stance:
- challenge CPU ownership of expensive simulation work
- prefer batched/field-based/asynchronous designs
- prioritize order-of-magnitude wins over local percentage gains

## Guardrails

Do:
- keep every experiment reversible behind clear flags
- measure before/after on the same scenario
- protect gameplay plausibility while scaling

Do not:
- ship optimization guesses without captures
- keep changes that only improve average FPS while tail latency worsens
- allow harness or telemetry overhead to poison measurements

## Mandatory Decomposition

Every frontier cycle must evaluate these blocks independently:
- AI decision making
- perception (LOS, awareness, threat)
- spatial queries
- movement/collision avoidance
- combat resolution
- render synchronization

Use this record format:

```text
Subsystem:
Current Method:
Computational Cost Type:
Replacement Candidate:
New Paradigm:
Expected Scaling Behavior:
Migration Difficulty:
How to Benchmark:
```

## Paradigm Defaults

CPU/data-oriented:
- SoA combat state
- fixed-tick worker simulation
- SAB + Atomics queues
- triple-buffered render/sim handoff

WASM:
- batch spatial query kernels
- influence/flow propagation
- steering/visibility approximations

GPU compute:
- visibility confidence fields
- influence/threat diffusion
- crowd steering fields
- batched projectile integration

Algorithmic substitutions:
- pairwise checks -> sampled fields
- precise frequent LOS -> probabilistic confidence + selective confirm
- per-frame full updates -> staggered fixed-tick updates

## Working End-State Hypothesis

- Main thread: rendering/input/UI orchestration only
- Simulation worker(s): authoritative fixed-step combat state
- Shared SoA state, versioned/triple-buffered
- GPU/WASM produce compact summaries consumed by sim
- Render FPS decoupled from simulation tick rate

## Frontier Loop

1. Capture baseline for active scenario.
2. Choose one subsystem and one replacement candidate.
3. Implement behind flag with rollback path.
4. Capture before/after.
5. Keep or revert using hard gates.
6. Log outcome in docs.

Constraint:
- only one non-independent frontier experiment in flight per branch.

## Keep/Revert Gates

Keep only if:
- tail latency improves materially (`p95/p99`, hitch ratios, max stall)
- no major behavior regressions (cover fairness, detection plausibility, freeze artifacts)
- harness overhead remains in control

Revert if:
- improvement is average-only while tail worsens
- behavior degrades materially
- measurement quality is contaminated

## Required Benchmarks

- Throughput: `npm run perf:capture:combat120`
- Long soak: `npm run perf:capture:frontier30m`

Use deep CDP only for diagnosis, not primary pass/fail.

## Metrics Priority

1. Tail stability: `p95/p99`, `hitch50`, `hitch100`, max frame stall
2. Simulation throughput: AI starvation, LOS/raycast denial, sim budget pressure
3. Plausibility: shot/hit validity, LOS fairness, no persistent freeze states
4. Measurement hygiene: harness overhead RTT/cadence/detail probe cost

## Next Frontier Tracks

F1. Worker-owned SoA combat core (legacy fallback retained)
F2. Visibility confidence field replacing frequent CPU LOS checks
F3. Single authoritative spatial ownership (remove duplicate sync paths)
F4. Flow-field steering replacing local pairwise steering
F5. Two-tier combat validation (coarse batch + selective narrowphase)

## Documentation Contract

After each experiment cycle:
- update `docs/ARCHITECTURE_RECOVERY_PLAN.md` with hypothesis, result, keep/revert, artifact paths
- update `docs/PROFILING_HARNESS.md` for any flag/scenario/overhead changes

If no measurable gain:
- document failed hypothesis and why
- do not carry dead-end complexity forward
