# Task: performance-telemetry-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-15-telemetry-warsim-navmesh-split` (R1)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/debug/PerformanceTelemetry.ts` (995 LOC) into 4 helpers.

## Files touched

- New: `src/systems/debug/perf/FrameMetricsCollector.ts` — per-frame timing, sample buffer (≤300 LOC)
- New: `src/systems/debug/perf/EmaBudgeter.ts` — EMA smoothing + budget overrun warnings (≤300 LOC)
- New: `src/systems/debug/perf/UserTimingMarkers.ts` — performance.mark / measure wrapping (≤300 LOC)
- New: `src/systems/debug/perf/TelemetryReporter.ts` — UI / harness reporting interface (≤300 LOC)
- Each + `*.test.ts`
- Modified: `PerformanceTelemetry.ts` — orchestrator ≤300 LOC; the global `performanceTelemetry` singleton export still works
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template. The global `performanceTelemetry` singleton's behavior must
be preserved — every callsite under `src/` that calls `performanceTelemetry.X`
continues to work without changes.

## Reviewer: none required
## Playtest required: no (telemetry-only)

## Branch + PR

- Branch: `task/performance-telemetry-split`
- Commit: `refactor(debug): split PerformanceTelemetry into 4 helpers (performance-telemetry-split)`
