# Docs Index

Last updated: 2026-03-06

## Read Order

1. `CODEBASE_BLOCKS.md` - **Start here.** Hub index for the block map: all systems, wiring, tick graph, singletons, vocabulary.
2. `blocks/` - Per-domain sub-docs (core, combat, terrain, strategy, player, weapons, vehicle, world, ui, support).
3. `GAME_MODES_EXECUTION_PLAN.md` - Canonical execution plan for game modes, deploy/loadout flow, command UX, tactical vs strategic map policy, and faction generalization.
4. `ACTIVE_GAME_MODES_HANDOFF.md` - Current phase status, validated state, and exact resume points for another agent.
5. `ROADMAP.md` - Master vision document. Aspirational and broader than the active game-mode execution plan.
6. `ARCHITECTURE_RECOVERY_PLAN.md` - Runtime stability and performance.
7. `PROFILING_HARNESS.md` - Perf capture commands, flags, artifacts.

## Block Map (Primary Reference)

- `CODEBASE_BLOCKS.md` - Hub: coupling heatmap, tick graph, singletons, lifecycle, vocabulary.
- `blocks/core.md` - Engine shell, boot sequence, tick dispatch, user lifecycle E2E.
- `blocks/combat.md` - CombatantSystem, AI, spatial, squads, LOD (5ms budget).
- `blocks/terrain.md` - Terrain runtime, terrain queries, height authority, biomes, vegetation, DEM.
- `blocks/strategy.md` - War sim, materialization, strategic director (A Shau only).
- `blocks/player.md` - Movement, weapons, health, respawn, controls.
- `blocks/weapons.md` - Grenades, mortar, sandbag, ammo, GunplayCore.
- `blocks/vehicle.md` - Helicopters, per-aircraft config, helipads.
- `blocks/world.md` - Zones, tickets, game modes, billboards.
- `blocks/ui.md` - HUD (30 widgets), layout, touch controls, minimap, map, compass.
- `blocks/support.md` - Audio, effects, environment, input, assets, debug, config.

## Active Docs

- `GAME_MODES_EXECUTION_PLAN.md`
  - Canonical execution plan for making the current mode set feel like real products. Covers mode runtime architecture, deploy/loadout flow, command UX, map intel policy, team generalization, and death presentation cleanup.
- `ACTIVE_GAME_MODES_HANDOFF.md`
  - Live handoff note for the current execution track. Lists completed phases, validated state, remaining gaps, and the recommended next implementation entry points.
- `ROADMAP.md`
  - Master roadmap: 10-phase plan from asset overhaul through full Vietnam simulation engine. Aspirational and now aligned with the active execution plan where overlap exists.
- `ASSET_MANIFEST.md`
  - Comprehensive asset generation queue for Pixel Forge agent. 80+ assets with prompts, tri budgets, mesh part naming, scale specs. 4 priority sprints.
- `SQUAD_COMMAND_REARCHITECT.md`
  - Squad command system analysis and redesign plan. Documents current bugs (dead code, race conditions, split input paths) and target architecture for scale-aware command interface.
- `PROFILING_HARNESS.md`
  - Source of truth for perf capture commands, flags, artifacts, and validation semantics.
- `ARCHITECTURE_RECOVERY_PLAN.md`
  - Current architecture risk register and prioritized implementation board.
- `TERRAIN_REWRITE_MASTER_PLAN.md`
  - Canonical terrain rewrite control document. This is the only terrain execution plan. Latest validated state includes fully clean preview-smoke evidence under `artifacts/terrain-smoke/2026-03-04T00-54-47-243Z`.
- `TERRAIN_RESEARCH.md`
  - Industry research: CDLOD vs geoclipmaps vs GPU tessellation vs CBT, CPU/GPU height consistency patterns, WebGPU terrain options, virtual texturing, streaming, and pivot options for our architecture. Reference only - no code changes proposed.
- `ASHAU_VALLEY_IMPLEMENTATION_PLAN.md`
  - A Shau mode stabilization plan and validation checklist.
- `AUDIO_ASSETS_NEEDED.md`
  - Audio backlog/spec used by `src/systems/audio`.
- `AGENT_TESTING.md`
  - Agent validation workflows, including `test:frontier` for fast gameplay-critical validation and `deadcode` (`knip`) for cleanup passes.
- `../data/vietnam/DATA_PIPELINE.md`
  - Real-terrain data status and integration pipeline for Vietnam maps.

## Partially Superseded

These docs predate the block map and overlap with specific sub-docs. Kept for reference but prefer the block map for current state.

- `FRONTEND_ARCHITECTURE_INVENTORY.md` - Overlaps with `blocks/ui.md`.
- `FRONTEND_REARCHITECTURE_BACKLOG.md` - Phase board (3 phases done). Overlaps with `blocks/ui.md`.
- `UI_STANDARDIZATION_GUIDE.md` - Standards still valid; component inventory overlaps with `blocks/ui.md`.
- `CODEBASE_MAP.mmd` - Original Mermaid diagram, superseded by `CODEBASE_BLOCKS.md` + `blocks/`.

## Archive

- `archive/` - Retired docs. Informational only, not part of active execution.
- `archive/UI_ENGINE_PLAN.md` - UI engine rewrite plan (Phases 0-7 complete).

## Documentation Rules

- Keep active docs concise and current.
- Prefer status boards and acceptance criteria over long chronological logs.
- Do not preserve debate trails or superseded execution plans in active terrain docs. Delete them once their conclusions are absorbed into the canonical plan.
- Any perf-sensitive change must update:
  - `PROFILING_HARNESS.md` if capture behavior/flags changed
  - `ARCHITECTURE_RECOVERY_PLAN.md` with decision and evidence path
- Any new asset need must update `ASSET_MANIFEST.md`.
- Any command/control change must update `SQUAD_COMMAND_REARCHITECT.md`.
- Any game-mode, deploy/loadout, respawn-flow, map-intel, or death-presentation change must update `GAME_MODES_EXECUTION_PLAN.md`.
- Any system addition/removal/rewiring must update the relevant `blocks/*.md` sub-doc.
