# Docs Index

Last updated: 2026-02-21

## Read Order

1. `PERFORMANCE_FRONTIER_MISSION.md`
2. `PROFILING_HARNESS.md`
3. `ARCHITECTURE_RECOVERY_PLAN.md`
4. `ASHAU_VALLEY_IMPLEMENTATION_PLAN.md`

## Active Docs

- `PERFORMANCE_FRONTIER_MISSION.md`
  - Optimization operating model, keep/revert gates, and current frontier track.
- `PROFILING_HARNESS.md`
  - Source of truth for perf capture commands, flags, artifacts, and validation semantics.
- `ARCHITECTURE_RECOVERY_PLAN.md`
  - Current architecture risk register and prioritized implementation board.
- `ASHAU_VALLEY_IMPLEMENTATION_PLAN.md`
  - A Shau mode stabilization plan and validation checklist.
- `AUDIO_ASSETS_NEEDED.md`
  - Audio backlog/spec used by `src/systems/audio`.
- `../data/vietnam/DATA_PIPELINE.md`
  - Real-terrain data status and integration pipeline for Vietnam maps.

## Archive Policy

- `docs/archive/` contains retired analyses and old task snapshots.
- Archived docs are informational only and not part of active execution.
- When an active doc is replaced, summarize the replacement and move old content to git history (not long-lived duplicate files).

## Documentation Rules

- Keep active docs concise and current.
- Prefer status boards and acceptance criteria over long chronological logs.
- Any perf-sensitive change must update:
  - `PROFILING_HARNESS.md` if capture behavior/flags changed
  - `ARCHITECTURE_RECOVERY_PLAN.md` with decision and evidence path
