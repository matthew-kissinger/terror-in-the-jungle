# Performance Frontier Mission

Last updated: 2026-02-14
Status: Active operating mode for autonomous agent iterations.
Target: Stable 120+ simultaneous combatants with controlled frame tails.

## Mission Override

This mode replaces incremental optimization as default behavior.

Rules:
- Treat current architecture as reference implementation, not destination.
- Search for order-of-magnitude gains.
- Prefer paradigm replacement over local tuning.
- Do not stop at "optimize this function"; ask "should this run on CPU at all?"

Non-goals:
- Constant tweaking only.
- Additional local caches without paradigm change.
- Per-object micro-optimization in the same update model.

## Problem Decomposition (Mandatory)

Evaluate these blocks independently every cycle:
- AI decision making
- Perception (LOS, awareness, threat)
- Spatial queries
- Movement and collision avoidance
- Combat resolution
- Rendering synchronization

For each block, produce this template:

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

## Preferred Paradigms (Default Candidates)

CPU / Data:
- Structure-of-Arrays layouts.
- Worker job graph with fixed simulation tick.
- SharedArrayBuffer + Atomics queues.
- Triple-buffered state handoff (sim write, render read, transfer).

WASM:
- Rust/C++ kernels for batch spatial queries, influence propagation, steering, LOS approximations.
- SIMD-enabled WASM where branch reduction is possible.

GPU Compute (WebGPU):
- Visibility confidence fields.
- Influence/threat diffusion.
- Crowd steering fields.
- Projectile integration batches.

Algorithmic Substitution:
- Pairwise checks -> sampled fields.
- Precise per-agent LOS -> probabilistic visibility confidence.
- Per-frame full updates -> fixed-tick asynchronous simulation.
- Query-heavy nearest-target logic -> cell-level top-k candidate lists.

## Architectural End-State Hypothesis

Working target architecture:
- Main thread: render/input/UI only.
- Simulation worker(s): authoritative combat simulation at fixed 20-30Hz.
- SoA combat state in SAB, triple-buffered exchange.
- GPU compute generates fields; CPU/worker consumes compact summaries.
- Deterministic simulation island independent of render FPS.

## Autonomy Loop (Unsupervised)

Each cycle must execute:
1. Baseline capture for the active frontier scenario.
2. Select one subsystem and one paradigm replacement experiment.
3. Implement behind a feature flag with rollback path.
4. Capture before/after with same scenario and seeds.
5. Decide keep/revert using strict gates.
6. Append results to docs and experiment ledger.

Hard requirement:
- Only one frontier experiment can be "in flight" per branch unless they are independent and benchmarked separately.

## Experiment Gate (Keep / Revert)

Keep only if:
- Tail latency improves materially (p95/p99 frame or sim tick).
- No major gameplay fairness regressions (cover, detection plausibility, freeze artifacts).
- Harness overhead remains controlled.

Revert if:
- Improvement is only average FPS while tails worsen.
- Behavior quality degrades in obvious player-facing ways.
- Instrumentation overhead contaminates measurements.

## Required Scenarios

Use these as standard frontier benchmarks:
- Combat throughput: `npm run perf:capture:combat120`
- Long soak: `npm run perf:capture:frontier30m`

Optional deep investigation:
- Add `--deep-cdp` only for diagnosis, not for final pass/fail.

## Metrics Priority (In Order)

1. Tail stability: `p95/p99`, `hitch50`, `hitch100`, max stall.
2. Simulation throughput: AI budget starvation, perception denial, sim tick duration.
3. Plausibility: hit validation, LOS fairness, no persistent freeze states.
4. Overhead hygiene: harness probe RTT, sample cadence, detail probe interval.

## Frontier Backlog (Next 5)

F1. Worker-owned SoA combat core:
- Migrate combatant state to packed arrays in a simulation worker.
- Keep existing OOP system as fallback (`legacy` mode).

F2. Replace CPU LOS with visibility confidence field:
- GPU or WASM field pass.
- CPU agent logic consumes sampled confidence + occasional confirm checks.

F3. Replace dual spatial ownership:
- Single authoritative uniform hashed grid.
- Remove duplicate octree/grid synchronization path.

F4. Flow-field steering:
- Replace local pairwise steering with field gradient sampling.

F5. Two-tier combat validation:
- Batch coarse ballistic/hit checks for all combatants.
- Reserve expensive narrowphase for player-near or high-importance events.

## Documentation Protocol

After every cycle update:
- `docs/ARCHITECTURE_RECOVERY_PLAN.md`:
  - short cycle summary
  - keep/revert decision
  - evidence artifact paths
- `docs/PROFILING_HARNESS.md`:
  - any new harness flags/scenarios
  - overhead notes

If no measurable gain:
- Document failed hypothesis and why it is invalid.
- Do not carry dead-end changes forward.

