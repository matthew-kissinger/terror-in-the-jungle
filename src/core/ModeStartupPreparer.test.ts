import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Alliance, Faction } from '../systems/combat/types';
import { GameMode } from '../config/gameModeTypes';
import { normalizeLaunchSelection, configureHeightSource } from './ModeStartupPreparer';
import { resolveModeSpawnPosition } from './ModeSpawnPosition';
import { getGameModeDefinition } from '../config/gameModeDefinitions';
import { getHeightQueryCache, resetHeightQueryCache } from '../systems/terrain/HeightQueryCache';
import { BakedHeightProvider } from '../systems/terrain/BakedHeightProvider';
import { DEMHeightProvider } from '../systems/terrain/DEMHeightProvider';
import { NoiseHeightProvider } from '../systems/terrain/NoiseHeightProvider';

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

  it('installs a DEM provider when the configured DEM payload matches the declared grid', async () => {
    const width = 4;
    const height = 4;
    const data = new Float32Array(width * height).map((_, i) => 100 + i);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/octet-stream' },
      arrayBuffer: async () => data.buffer,
    }));

    const config = {
      id: GameMode.A_SHAU_VALLEY,
      worldSize: 40,
      heightSource: {
        type: 'dem',
        path: '/data/vietnam/big-map/test.f32',
        width,
        height,
        metersPerPixel: 10,
      },
    } as any;

    const result = await configureHeightSource({} as any, GameMode.A_SHAU_VALLEY, config);
    const provider = getHeightQueryCache().getProvider();

    expect(result.kind).toBe('dem');
    expect(provider).toBeInstanceOf(DEMHeightProvider);
    // Provider should report a non-zero height at the DEM center, proving the
    // buffer actually fed the DEM sampler rather than silently falling back.
    expect(provider.getHeightAt(0, 0)).toBeGreaterThan(0);
  });

  it('rejects an HTML fallback response so the DEM branch does not install a procedural noise provider', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const htmlBody = new TextEncoder().encode('<!doctype html><html>...</html>').buffer;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html; charset=utf-8' },
      arrayBuffer: async () => htmlBody,
    }));

    const config = {
      id: GameMode.A_SHAU_VALLEY,
      worldSize: 40,
      heightSource: {
        type: 'dem',
        path: '/data/vietnam/big-map/missing.f32',
        width: 4,
        height: 4,
        metersPerPixel: 10,
      },
    } as any;

    const result = await configureHeightSource({} as any, GameMode.A_SHAU_VALLEY, config);
    const provider = getHeightQueryCache().getProvider();

    expect(result.kind).toBe('dem');
    // Should not have installed a DEM provider built from the HTML payload.
    expect(provider).not.toBeInstanceOf(DEMHeightProvider);
    // And the caller should have logged a failure so flat terrain is attributable.
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('rejects a DEM payload whose size does not match the declared grid', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Valid Float32 buffer, but smaller than a 4x4 grid expects (64 bytes).
    const tooSmall = new Float32Array(2).buffer;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/octet-stream' },
      arrayBuffer: async () => tooSmall,
    }));

    // Pre-seed a provider we can assert stayed untouched.
    const baseline = new NoiseHeightProvider(99);
    getHeightQueryCache().setProvider(baseline);

    const config = {
      id: GameMode.A_SHAU_VALLEY,
      worldSize: 40,
      heightSource: {
        type: 'dem',
        path: '/data/vietnam/big-map/truncated.f32',
        width: 4,
        height: 4,
        metersPerPixel: 10,
      },
    } as any;

    await configureHeightSource({} as any, GameMode.A_SHAU_VALLEY, config);
    expect(getHeightQueryCache().getProvider()).toBe(baseline);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
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
