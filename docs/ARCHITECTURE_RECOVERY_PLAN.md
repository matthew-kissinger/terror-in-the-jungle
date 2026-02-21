# Architecture Recovery Plan

Last updated: 2026-02-21
Scope: runtime architecture stabilization with performance and gameplay fidelity gates.

## Current Goal

- Deliver stable large-scale combat with consistent frame tails.
- Stabilize A Shau mode flow so it is testable and tactically coherent.

## Priority Board

| Priority | Workstream | Status | Notes |
|---|---|---|---|
| P0 | Harness integrity and measurement quality | IN_PROGRESS | Startup contamination and observer overhead still require careful run discipline. |
| P1 | Spatial ownership unification (F3) | IN_PROGRESS | Several consumers migrated; legacy secondary sync remains as fallback. |
| P2 | Heap growth triage in combat-heavy runs | IN_PROGRESS | New diagnostics added; source still mixed between transient waves and retained growth. |
| P3 | A Shau gameplay flow and contact reliability | IN_PROGRESS | Immediate contact improved; sustained close-contact remains inconsistent. |
| P4 | UI/HUD update budget discipline | TODO | Continue reducing avoidable per-frame UI churn. |
| P5 | Terrain/chunk lifecycle bounded work | TODO | Keep chunk generation/merge costs under frame budget at large map scale. |

## Keep Decisions (Recent)

- Keep: squared-distance and allocation reductions in spatial queries.
- Keep: AI target acquisition scratch-buffer reuse.
- Keep: heap validation expansion (`growth`, `peak`, `recovery`) in harness output.
- Keep: migration of selected systems to primary spatial provider path.

## Deferred Decisions

- Default flip of `spatialSecondarySync=0` is deferred pending cleaner matched A/B and longer soak confirmation.

## Open Risks

- High-intensity runs can still show heap growth warnings.
- A/B startup variance can hide small wins/losses.
- Remaining dual-path spatial consumers increase complexity and drift risk.

## Required Evidence For Major Changes

- One matched throughput pair (`combat120`) with comparable startup quality.
- One soak run (`frontier30m`) when change targets memory/stability.
- Behavior validation (shots/hits, objective flow, no freeze/teleport artifacts).

## Next Execution Slice

1. Finish spatial consumer migration and remove unnecessary secondary sync paths.
2. Isolate retained heap growth sources with focused captures and subsystem counters.
3. Complete A Shau contact-flow loop so player reaches and sustains skirmish pressure without harness warps.
4. Re-baseline and lock regression checks after each accepted change.

## Update Rule

Any accepted architecture change must update:
- this file (decision + risk impact), and
- `docs/PROFILING_HARNESS.md` if capture semantics changed.
