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
import { ASHAU_DEM_ASSET_ID, resetGameAssetManifestForTests } from './GameAssetManifest';

const HYDROLOGY_MANIFEST = {
  schemaVersion: 1,
  generator: 'test',
  entries: [
    {
      modeId: 'open_frontier',
      source: 'procedural-noise',
      seed: 42,
      signature: 'hydrology-test-frontier-42',
      hydrologyAsset: '/data/hydrology/open_frontier-42-hydrology.json',
      worldSize: 3200,
      sampleGridSize: 2,
      sampleWorldInsetPercent: 4,
      sampleSpacingMeters: 12,
      depressionHandling: 'epsilon-fill',
      wetCandidateAccumulationQuantile: 0.92,
      channelCandidateAccumulationQuantile: 0.98,
      wetCandidateSlopeMaxDegrees: 16,
      wetCandidateElevationMaxMeters: 35,
      currentHydrologyBiomeIds: ['riverbank'],
    },
  ],
};

const HYDROLOGY_ARTIFACT = {
  schemaVersion: 1,
  width: 2,
  height: 2,
  cellSizeMeters: 12,
  depressionHandling: 'epsilon-fill',
  transform: {
    originX: -12,
    originZ: -12,
    cellSizeMeters: 12,
  },
  thresholds: {
    accumulationP90Cells: 1,
    accumulationP95Cells: 2,
    accumulationP98Cells: 3,
    accumulationP99Cells: 4,
  },
  masks: {
    wetCandidateCells: [3],
    channelCandidateCells: [3],
  },
  channelPolylines: [],
};

describe('ModeStartupPreparer', () => {
  beforeEach(() => {
    resetHeightQueryCache();
    resetGameAssetManifestForTests();
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

  it('resolves a DEM asset id through the production asset manifest before fetching terrain', async () => {
    const width = 4;
    const height = 4;
    const data = new Float32Array(width * height).map((_, i) => 200 + i);
    const assetUrl = 'https://assets.example.test/terrain/a-shau/test-hash.f32';
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/asset-manifest.json') {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            version: 1,
            generatedAt: '2026-04-22T00:00:00.000Z',
            gitSha: 'test',
            assetBaseUrl: 'https://assets.example.test',
            assets: {
              [ASHAU_DEM_ASSET_ID]: {
                id: ASHAU_DEM_ASSET_ID,
                url: assetUrl,
                key: 'terrain/a-shau/test-hash.f32',
                sha256: 'test-hash',
                size: data.byteLength,
                contentType: 'application/octet-stream',
                cacheControl: 'public, max-age=31536000, immutable',
                required: true,
              },
            },
          }),
        };
      }
      if (url === assetUrl) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/octet-stream' },
          arrayBuffer: async () => data.buffer,
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const config = {
      id: GameMode.A_SHAU_VALLEY,
      worldSize: 40,
      heightSource: {
        type: 'dem',
        assetId: ASHAU_DEM_ASSET_ID,
        path: '/data/vietnam/big-map/test.f32',
        width,
        height,
        metersPerPixel: 10,
      },
    } as any;

    await configureHeightSource({} as any, GameMode.A_SHAU_VALLEY, config);

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/asset-manifest.json', assetUrl]);
    expect(getHeightQueryCache().getProvider()).toBeInstanceOf(DEMHeightProvider);
  });

  it('rejects an HTML fallback response so the DEM branch cannot continue with fallback terrain', async () => {
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

    await expect(configureHeightSource({} as any, GameMode.A_SHAU_VALLEY, config))
      .rejects.toThrow(/Required DEM terrain unavailable/);
    const provider = getHeightQueryCache().getProvider();

    // Should not have installed a DEM provider built from the HTML payload.
    expect(provider).not.toBeInstanceOf(DEMHeightProvider);
    // And the caller should have logged a failure so invalid terrain is attributable.
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('rejects a DEM payload whose size does not match the declared grid without replacing the provider', async () => {
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

    await expect(configureHeightSource({} as any, GameMode.A_SHAU_VALLEY, config))
      .rejects.toThrow(/Required DEM terrain unavailable/);
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

  it('does not fetch hydrology caches unless the preload gate is enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await configureHeightSource({} as any, GameMode.OPEN_FRONTIER, {
      id: GameMode.OPEN_FRONTIER,
      worldSize: 3200,
      terrainSeed: 42,
    } as any);

    expect(result.kind).toBe('procedural');
    expect(result.hydrologyBake).toBeNull();
    expect(fetchMock.mock.calls.map(call => call[0])).not.toContain('/data/hydrology/bake-manifest.json');
  });

  it('preloads a seeded hydrology bake behind the explicit feature gate', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/data/heightmaps/open_frontier-42.f32') {
        return {
          ok: false,
          status: 404,
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }
      if (url === '/data/hydrology/bake-manifest.json') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => HYDROLOGY_MANIFEST,
        };
      }
      if (url === '/data/hydrology/open_frontier-42-hydrology.json') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => HYDROLOGY_ARTIFACT,
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await configureHeightSource({} as any, GameMode.OPEN_FRONTIER, {
      id: GameMode.OPEN_FRONTIER,
      worldSize: 3200,
      terrainSeed: 42,
      hydrology: {
        preload: true,
        manifestUrl: '/data/hydrology/bake-manifest.json',
      },
    } as any);

    expect(result.kind).toBe('procedural');
    expect(result.hydrologyBake?.entry.signature).toBe('hydrology-test-frontier-42');
    expect(result.hydrologyBake?.artifact.masks.wetCandidateCells).toEqual([3]);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      '/data/heightmaps/open_frontier-42.f32',
      '/data/hydrology/bake-manifest.json',
      '/data/hydrology/open_frontier-42-hydrology.json',
    ]);
  });

  it('preloads hydrology when the biome-classification candidate gate is enabled', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/data/heightmaps/open_frontier-42.f32') {
        return {
          ok: false,
          status: 404,
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }
      if (url === '/data/hydrology/bake-manifest.json') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => HYDROLOGY_MANIFEST,
        };
      }
      if (url === '/data/hydrology/open_frontier-42-hydrology.json') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => HYDROLOGY_ARTIFACT,
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await configureHeightSource({} as any, GameMode.OPEN_FRONTIER, {
      id: GameMode.OPEN_FRONTIER,
      worldSize: 3200,
      terrainSeed: 42,
      hydrology: {
        biomeClassification: { enabled: true },
      },
    } as any);

    expect(result.hydrologyBake?.entry.signature).toBe('hydrology-test-frontier-42');
    expect(fetchMock.mock.calls.map(call => call[0])).toContain('/data/hydrology/bake-manifest.json');
  });

  it('keeps optional hydrology preload failure from blocking terrain startup', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/data/heightmaps/open_frontier-42.f32') {
        return {
          ok: false,
          status: 404,
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }
      if (url === '/data/hydrology/bake-manifest.json') {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({}),
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await configureHeightSource({} as any, GameMode.OPEN_FRONTIER, {
      id: GameMode.OPEN_FRONTIER,
      worldSize: 3200,
      terrainSeed: 42,
      hydrology: {
        preload: true,
        biomeClassification: { enabled: true },
      },
    } as any);

    expect(result.kind).toBe('procedural');
    expect(result.hydrologyBake).toBeNull();
    expect(fetchMock.mock.calls.map(call => call[0])).toContain('/data/hydrology/bake-manifest.json');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
