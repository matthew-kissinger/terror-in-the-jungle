import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Alliance, Faction } from '../systems/combat/types';
import { GameMode } from '../config/gameModeTypes';
import { normalizeLaunchSelection, configureHeightSource } from './ModeStartupPreparer';
import { resolveModeSpawnPosition } from './ModeSpawnPosition';
import { getGameModeDefinition } from '../config/gameModeDefinitions';
import { getHeightQueryCache, resetHeightQueryCache } from '../systems/terrain/HeightQueryCache';
import { BakedHeightProvider } from '../systems/terrain/BakedHeightProvider';

describe('ModeStartupPreparer', () => {
  beforeEach(() => {
    resetHeightQueryCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('normalizes string mode launches into a full launch selection', () => {
    const selection = normalizeLaunchSelection(GameMode.ZONE_CONTROL);

    expect(selection.mode).toBe(GameMode.ZONE_CONTROL);
    expect(selection.alliance).toBeDefined();
    expect(selection.faction).toBeDefined();
  });

  it('resolves alliance-specific fallback spawn positions', () => {
    const definition = getGameModeDefinition(GameMode.ZONE_CONTROL);

    const bluforSpawn = resolveModeSpawnPosition(definition, Alliance.BLUFOR);
    const opforSpawn = resolveModeSpawnPosition(definition, Alliance.OPFOR);

    expect(bluforSpawn.equals(opforSpawn)).toBe(false);
  });

  it('preserves an explicit valid launch selection', () => {
    const selection = normalizeLaunchSelection({
      mode: GameMode.AI_SANDBOX,
      alliance: Alliance.BLUFOR,
      faction: Faction.US,
    });

    expect(selection).toEqual({
      mode: GameMode.AI_SANDBOX,
      alliance: Alliance.BLUFOR,
      faction: Faction.US,
    });
  });

  it('returns a typed pre-baked terrain source and installs a baked provider without mutating config', async () => {
    const data = new Float32Array([1, 2, 3, 4]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => data.buffer,
    }));

    const config = {
      id: GameMode.TEAM_DEATHMATCH,
      worldSize: 3200,
      terrainSeed: 42,
      heightmapAsset: '/data/test-heightmap.f32',
    } as any;

    const result = await configureHeightSource({} as any, GameMode.TEAM_DEATHMATCH, config);
    const provider = getHeightQueryCache().getProvider();

    expect(result.kind).toBe('prebaked');
    expect(result.preparedHeightmap?.gridSize).toBe(2);
    expect(result.preparedHeightmap?.workerConfig.type).toBe('noise');
    expect(provider).toBeInstanceOf(BakedHeightProvider);
    expect((config as any).__prebakedHeightmap).toBeUndefined();
  });
});
