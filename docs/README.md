# Docs Index

Last updated: 2026-02-14

## Read Order

1. `PERFORMANCE_FRONTIER_MISSION.md`
2. `PROFILING_HARNESS.md`
3. `ARCHITECTURE_RECOVERY_PLAN.md`

## What Each Doc Is For

- `PERFORMANCE_FRONTIER_MISSION.md`
  - Defines current operating mode for large-scale performance exploration.
  - Sets experiment discipline, required decomposition, and keep/revert gates.

- `PROFILING_HARNESS.md`
  - Source of truth for capture commands, flags, output artifacts, and validation.
  - Includes observer-overhead rules and scenario semantics.

- `ARCHITECTURE_RECOVERY_PLAN.md`
  - Long-running experiment ledger and decision history.
  - Tracks what changed, why, and which paths were kept or reverted.

- `AUDIO_ASSETS_NEEDED.md`
  - Audio content backlog and production specifications.

## Operating Contract

- Do not tune blindly. Every substantial change must be measured.
- Keep experiments reversible and flaggable.
- Prefer objective metrics (`p95/p99`, hitch ratios, shot/hit validity, stall windows).
- Record outcomes in `ARCHITECTURE_RECOVERY_PLAN.md` and update harness docs when flags/scenarios change.

## Canonical Runtime Goal

- Maintain believable combat and objective flow with ~120+ combatants.
- Minimize tail spikes (rare long frames) before chasing average FPS gains.
- Keep deployed pages clean from harness-only instrumentation overhead.
