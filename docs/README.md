# Docs Index

Last updated: 2026-03-10

## Read Order

1. `CODEBASE_BLOCKS.md` - **Start here.** Hub index for the block map: all systems, wiring, tick graph, singletons, vocabulary.
2. `blocks/` - Per-domain sub-docs (core, combat, terrain, strategy, player, weapons, vehicle, world, ui, support).
3. `ROADMAP.md` - Master vision document. Aspirational 10-phase plan.
4. `ARCHITECTURE_RECOVERY_PLAN.md` - Runtime stability and performance decisions.
5. `PROFILING_HARNESS.md` - Perf capture commands, flags, artifacts.
6. `PERF_FRONTIER.md` - Bottleneck analysis and phase framework.
7. `DEPLOYMENT_VALIDATION.md` - Pre-push gate and manual verification checklist.
8. `PLAN_STATE.md` - Wave tracker, feature completeness, known architecture debt.
9. `NEXT_WORK.md` - Active checklist (work top-down).

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

## Reference Docs

- `ASSET_MANIFEST.md` - All asset backlogs (GLB generation queue, audio needs, build-now priorities).
- `UI_ICON_MANIFEST.md` - Icon registry reference (50 pixel-art PNGs).
- `TERRAIN_RESEARCH.md` - Industry research (CDLOD, geoclipmaps, WebGPU terrain). Reference only.
- `AGENT_TESTING.md` - Agent validation workflows and perf baselines.
- `../data/vietnam/DATA_PIPELINE.md` - Real-terrain data status and integration pipeline.

## Archive

- `archive/` - Retired docs. See `archive/README.md` for index.

## Documentation Rules

- Keep active docs concise and current.
- Prefer status boards and acceptance criteria over long chronological logs.
- Any perf-sensitive change must update `PROFILING_HARNESS.md` (if capture flags changed) and `ARCHITECTURE_RECOVERY_PLAN.md` (with decision and evidence).
- Any new asset need must update `ASSET_MANIFEST.md`.
- Any system addition/removal/rewiring must update the relevant `blocks/*.md` sub-doc.
