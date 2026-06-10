// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { GameLaunchSelection, GameMode, GameModeDefinition } from '../config/gameModeTypes';
import { getGameModeConfig } from '../config/gameModes';
import { getGameModeDefinition } from '../config/gameModeDefinitions';
import type { GameEngine } from './GameEngine';
import { GameEventBus } from './GameEventBus';
import { markStartup } from './StartupTelemetry';
import { yieldToRenderer } from './modeStartup/StartupYield';
import {
  compileStartupTerrainFeatures,
} from './modeStartup/TerrainFeatureCompileStage';
import { configureHeightSource } from './modeStartup/HeightSourceStage';
import {
  applyCompiledTerrainFeatures,
  configureTerrainAndNavigation,
} from './modeStartup/TerrainNavigationStage';
import {
  applyLaunchSelection,
  restorePersistentWarState,
} from './modeStartup/ScenarioWiringStage';

/**
 * ModeStartupPreparer — thin public facade over the engine-init / mode-startup
 * pipeline. The cohesive stages it orchestrates live in sibling modules under
 * `./modeStartup/` (split out 2026-05-31, cycle phase4-godfiles, mirroring the
 * WaterSystem -> water/ precedent):
 *
 *   - HeightSourceStage            — DEM / pre-baked / procedural height source.
 *   - TerrainFeatureCompileStage   — compile + compose terrain features.
 *   - TerrainNavigationStage       — terrain surface + navmesh wiring.
 *   - ScenarioWiringStage          — faction labels, launch selection, war state.
 *   - StartupYield                 — repaint yield helper.
 *
 * The public surface (`prepareModeStartup`, `normalizeLaunchSelection`,
 * `configureHeightSource`, `compileStartupTerrainFeatures`) is preserved
 * exactly so importers (`GameEngineInit`, tests) need no changes.
 */

// Re-export the public surface so existing importers keep resolving the same
// names from this module path.
export { compileStartupTerrainFeatures } from './modeStartup/TerrainFeatureCompileStage';
export type { CompiledStartupTerrainFeatures } from './modeStartup/TerrainFeatureCompileStage';
export { configureHeightSource } from './modeStartup/HeightSourceStage';
export { normalizeLaunchSelection } from './modeStartup/ScenarioWiringStage';

interface PreparedModeStartup {
  mode: GameMode;
  launchSelection: GameLaunchSelection;
  definition: GameModeDefinition;
  config: ReturnType<typeof getGameModeConfig>;
}

export async function prepareModeStartup(
  engine: GameEngine,
  launchSelection: GameLaunchSelection
): Promise<PreparedModeStartup> {
  const mode = launchSelection.mode;
  // Don't force landscape - let user choose orientation.
  // Fullscreen is requested on START tap; layout works in any orientation.

  const definition = getGameModeDefinition(mode);
  const config = { ...getGameModeConfig(mode) };

  const emitProgress = (phase: string, progress: number, label: string): void => {
    GameEventBus.emit('mode_load_progress', { phase, progress, label });
    GameEventBus.flush();
  };

  emitProgress('terrain', 0, 'Loading terrain...');
  const preparedTerrainSource = await configureHeightSource(engine, mode, config);
  emitProgress('terrain', 1, 'Terrain loaded');
  await yieldToRenderer();

  emitProgress('features', 0, 'Compiling features...');
  markStartup(`engine-init.start-game.${mode}.terrain-features.compile.begin`);
  const startupTerrain = await compileStartupTerrainFeatures(config, preparedTerrainSource);
  markStartup(`engine-init.start-game.${mode}.terrain-features.compile.end`);
  emitProgress('features', 1, 'Features compiled');
  await yieldToRenderer();

  emitProgress('world', 0, 'Preparing world...');
  emitProgress('navmesh', 0, 'Loading navigation...');
  await configureTerrainAndNavigation(
    engine,
    config,
    startupTerrain.preparedTerrainSource,
    emitProgress,
  );
  emitProgress('world', 1, 'World ready');
  emitProgress('navmesh', 1, 'Navigation ready');
  await yieldToRenderer();

  emitProgress('vegetation', 0, 'Applying terrain features...');
  markStartup(`engine-init.start-game.${mode}.terrain-features.apply.begin`);
  await applyCompiledTerrainFeatures(engine, startupTerrain.compiledFeatures, emitProgress);
  markStartup(`engine-init.start-game.${mode}.terrain-features.apply.end`);
  emitProgress('vegetation', 1, 'Terrain features ready');
  await yieldToRenderer();

  emitProgress('spawning', 0, 'Spawning combatants...');
  markStartup(`engine-init.start-game.${mode}.set-game-mode.begin`);
  engine.systemManager.setGameMode(mode, { createPlayerSquad: mode !== GameMode.AI_SANDBOX });
  markStartup(`engine-init.start-game.${mode}.set-game-mode.end`);
  applyLaunchSelection(engine, definition, launchSelection);
  emitProgress('spawning', 1, 'Combatants spawned');
  await yieldToRenderer();

  emitProgress('finalize', 0, 'Finalizing...');
  restorePersistentWarState(engine, mode, config);
  emitProgress('finalize', 1, 'Ready');

  return {
    mode,
    launchSelection,
    definition,
    config,
  };
}
