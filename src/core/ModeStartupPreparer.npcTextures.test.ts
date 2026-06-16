// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Alliance, Faction } from '../systems/combat/types';
import { GameMode } from '../config/gameModeTypes';

const mocks = vi.hoisted(() => ({
  startupMarks: [] as string[],
  yieldToRenderer: vi.fn(async () => undefined),
  configureHeightSource: vi.fn(async () => ({ kind: 'procedural' })),
  compileStartupTerrainFeatures: vi.fn(async () => ({
    compiledFeatures: {},
    preparedTerrainSource: { kind: 'procedural' },
  })),
  configureTerrainAndNavigation: vi.fn(async () => undefined),
  applyCompiledTerrainFeatures: vi.fn(async () => undefined),
  applyLaunchSelection: vi.fn(),
  restorePersistentWarState: vi.fn(),
  emit: vi.fn(),
  flush: vi.fn(),
}));

vi.mock('./StartupTelemetry', () => ({
  markStartup: (name: string) => {
    mocks.startupMarks.push(name);
  },
}));

vi.mock('./modeStartup/StartupYield', () => ({
  yieldToRenderer: mocks.yieldToRenderer,
}));

vi.mock('./modeStartup/HeightSourceStage', () => ({
  configureHeightSource: mocks.configureHeightSource,
}));

vi.mock('./modeStartup/TerrainFeatureCompileStage', () => ({
  compileStartupTerrainFeatures: mocks.compileStartupTerrainFeatures,
}));

vi.mock('./modeStartup/TerrainNavigationStage', () => ({
  configureTerrainAndNavigation: mocks.configureTerrainAndNavigation,
  applyCompiledTerrainFeatures: mocks.applyCompiledTerrainFeatures,
}));

vi.mock('./modeStartup/ScenarioWiringStage', () => ({
  applyLaunchSelection: mocks.applyLaunchSelection,
  restorePersistentWarState: mocks.restorePersistentWarState,
  normalizeLaunchSelection: (selection: unknown) => selection,
}));

vi.mock('./GameEventBus', () => ({
  GameEventBus: {
    emit: mocks.emit,
    flush: mocks.flush,
  },
}));

vi.mock('../config/gameModes', () => ({
  getGameModeConfig: (mode: GameMode) => ({
    id: mode,
    name: mode,
    worldSize: 1000,
    maxCombatants: 12,
  }),
}));

vi.mock('../config/gameModeDefinitions', () => ({
  getGameModeDefinition: (mode: GameMode) => ({ id: mode, name: mode }),
}));

import { prepareModeStartup } from './ModeStartupPreparer';

describe('ModeStartupPreparer NPC texture telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startupMarks.length = 0;
  });

  it('marks the deferred NPC texture span and batch yields before combatants spawn', async () => {
    const ensurePixelForgeNpcImpostorTexturesLoaded = vi.fn(
      async (
        onProgress: (loaded: number, total: number) => void,
        options: { batchSize?: number; afterBatch?: () => Promise<void> | void },
      ) => {
        expect(options.batchSize).toBe(4);
        onProgress(4, 28);
        await options.afterBatch?.();
        onProgress(8, 28);
        await options.afterBatch?.();
        onProgress(28, 28);
      },
    );
    const setGameMode = vi.fn();
    const engine = {
      systemManager: {
        assetLoader: {
          ensurePixelForgeNpcImpostorTexturesLoaded,
        },
        setGameMode,
      },
    };

    await prepareModeStartup(engine as any, {
      mode: GameMode.OPEN_FRONTIER,
      alliance: Alliance.BLUFOR,
      faction: Faction.US,
    });

    expect(ensurePixelForgeNpcImpostorTexturesLoaded).toHaveBeenCalledTimes(1);
    expect(mocks.startupMarks).toEqual(expect.arrayContaining([
      'engine-init.start-game.open_frontier.npc-textures.begin',
      'engine-init.start-game.open_frontier.npc-textures.batch-yield-1',
      'engine-init.start-game.open_frontier.npc-textures.batch-yield-2',
      'engine-init.start-game.open_frontier.npc-textures.stats.loaded-28',
      'engine-init.start-game.open_frontier.npc-textures.stats.total-28',
      'engine-init.start-game.open_frontier.npc-textures.stats.batch-size-4',
      'engine-init.start-game.open_frontier.npc-textures.stats.batch-yields-2',
      'engine-init.start-game.open_frontier.npc-textures.end',
      'engine-init.start-game.open_frontier.set-game-mode.begin',
    ]));
    expect(mocks.startupMarks.indexOf('engine-init.start-game.open_frontier.npc-textures.end'))
      .toBeLessThan(mocks.startupMarks.indexOf('engine-init.start-game.open_frontier.set-game-mode.begin'));
    expect(setGameMode).toHaveBeenCalledWith(GameMode.OPEN_FRONTIER, { createPlayerSquad: true });
  });
});
