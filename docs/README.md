# Docs Index

Last updated: 2026-02-22

## Read Order

1. `ROADMAP.md` - Start here. Master plan with vision, phases, and sequencing.
2. `ASSET_MANIFEST.md` - Asset generation queue for Pixel Forge agent.
3. `SQUAD_COMMAND_REARCHITECT.md` - Squad/RTS command layer redesign.
4. `ARCHITECTURE_RECOVERY_PLAN.md` - Runtime stability and performance.
5. `PERFORMANCE_FRONTIER_MISSION.md` - Optimization operating model.

## Active Docs

- `ROADMAP.md`
  - Master roadmap: 10-phase plan from asset overhaul through full Vietnam simulation engine. DRAFT status, awaiting alignment.
- `ASSET_MANIFEST.md`
  - Comprehensive asset generation queue for Pixel Forge agent. 80+ assets with prompts, tri budgets, mesh part naming, scale specs. 4 priority sprints.
- `SQUAD_COMMAND_REARCHITECT.md`
  - Squad command system analysis and redesign plan. Documents current bugs (dead code, race conditions, split input paths) and target architecture for scale-aware command interface.
- `FRONTEND_ARCHITECTURE_INVENTORY.md`
  - Frontend ownership map for HUD/input/responsive/render paths with conflict register.
- `FRONTEND_REARCHITECTURE_BACKLOG.md`
  - Frontend phased refactor board with acceptance criteria, device matrix, and release gates.
- `UI_STANDARDIZATION_GUIDE.md`
  - Practical standards for CSS cleanup, design consistency, and component-library usage boundaries.
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
- `UI_ENGINE_PLAN.md`
  - UI engine rewrite plan (Phases 0-7 complete).
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
- Any new asset need must update `ASSET_MANIFEST.md`.
- Any command/control change must update `SQUAD_COMMAND_REARCHITECT.md`.
