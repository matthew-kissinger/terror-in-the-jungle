import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameMode, type GameModeConfig } from '../config/gameModeTypes';
import type { PreparedTerrainSource } from '../systems/terrain/PreparedTerrainSource';
import { resetHeightQueryCache } from '../systems/terrain/HeightQueryCache';

const startupMarks = vi.hoisted(() => [] as string[]);

vi.mock('./StartupTelemetry', () => ({
  markStartup: (name: string) => {
    startupMarks.push(name);
  },
}));

import { compileStartupTerrainFeatures } from './ModeStartupPreparer';

function baseConfig(overrides: Partial<GameModeConfig> = {}): GameModeConfig {
  return {
    id: GameMode.OPEN_FRONTIER,
    name: 'Test Mode',
    description: 'test',
    worldSize: 1000,
    chunkRenderDistance: 4,
    maxTickets: 100,
    matchDuration: 60,
    deathPenalty: 1,
    playerCanSpawnAtZones: true,
    respawnTime: 5,
    spawnProtectionDuration: 2,
    maxCombatants: 20,
    squadSize: { min: 4, max: 6 },
    reinforcementInterval: 30,
    zones: [],
    captureRadius: 25,
    captureSpeed: 5,
    minimapScale: 400,
    viewDistance: 200,
    ...overrides,
  };
}

describe('ModeStartupPreparer telemetry', () => {
  beforeEach(() => {
    resetHeightQueryCache();
    startupMarks.length = 0;
  });

  it('attributes terrain feature compilation even when no stamps are present', () => {
    const result = compileStartupTerrainFeatures(baseConfig(), { kind: 'procedural' });

    expect(result.compiledFeatures.stamps).toHaveLength(0);
    expect(startupMarks).toEqual(expect.arrayContaining([
      'engine-init.start-game.open_frontier.terrain-features.compile.features.begin',
      'engine-init.start-game.open_frontier.terrain-features.compile.features.end',
      'engine-init.start-game.open_frontier.terrain-features.compile.stats.stamps-0',
      'engine-init.start-game.open_frontier.terrain-features.compile.stats.surface-patches-0',
      'engine-init.start-game.open_frontier.terrain-features.compile.stats.exclusion-zones-0',
      'engine-init.start-game.open_frontier.terrain-features.compile.stats.flow-paths-0',
      'engine-init.start-game.open_frontier.terrain-features.compile.stamps.none',
    ]));
  });

  it('attributes stamped-provider install and prepared-heightmap rebake', () => {
    const prepared: PreparedTerrainSource = {
      kind: 'procedural',
      preparedHeightmap: {
        data: new Float32Array(16),
        gridSize: 4,
        workerConfig: { type: 'noise', seed: 1 },
      },
    };

    const result = compileStartupTerrainFeatures(
      baseConfig({
        features: [{
          id: 'helipad_main',
          kind: 'helipad',
          position: new THREE.Vector3(10, 0, 20),
          terrain: {
            flatten: true,
            flatRadius: 8,
            blendRadius: 13,
          },
        }],
      }),
      prepared,
    );

    expect(result.compiledFeatures.stamps.length).toBeGreaterThan(0);
    expect(startupMarks).toEqual(expect.arrayContaining([
      'engine-init.start-game.open_frontier.terrain-features.compile.stamped-provider.begin',
      'engine-init.start-game.open_frontier.terrain-features.compile.stamped-provider.end',
      'engine-init.start-game.open_frontier.terrain-features.compile.heightmap-rebake.begin',
      'engine-init.start-game.open_frontier.terrain-features.compile.heightmap-rebake.end',
      'engine-init.start-game.open_frontier.terrain-features.compile.stats.heightmap-grid-4',
    ]));
  });
});
