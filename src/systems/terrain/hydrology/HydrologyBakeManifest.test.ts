import { describe, expect, it } from 'vitest';
import {
  HYDROLOGY_BAKE_MANIFEST_PATH,
  loadHydrologyBakeForMode,
  loadHydrologyBakeManifest,
  parseHydrologyBakeArtifact,
  parseHydrologyBakeManifest,
  resolveHydrologyAssetUrl,
  selectHydrologyBakeEntry,
  type HydrologyBakeManifest,
  type HydrologyFetch,
} from './HydrologyBakeManifest';
import {
  HYDROLOGY_BAKE_ARTIFACT_VERSION,
  type HydrologyBakeArtifact,
} from './HydrologyBake';

const MANIFEST: HydrologyBakeManifest = {
  schemaVersion: 1,
  generator: 'test',
  entries: [
    {
      modeId: 'a_shau_valley',
      source: 'dem',
      seed: null,
      signature: 'ashau-sig',
      hydrologyAsset: '/data/hydrology/a_shau_valley-hydrology.json',
      worldSize: 21136,
      sampleGridSize: 257,
      sampleWorldInsetPercent: 4,
      sampleSpacingMeters: 79.26,
      depressionHandling: 'epsilon-fill',
      wetCandidateAccumulationQuantile: 0.92,
      channelCandidateAccumulationQuantile: 0.98,
      wetCandidateSlopeMaxDegrees: 16,
      wetCandidateElevationMaxMeters: 980,
      currentHydrologyBiomeIds: ['riverbank', 'swamp'],
    },
    {
      modeId: 'open_frontier',
      source: 'procedural-noise',
      seed: 42,
      signature: 'frontier-42-sig',
      hydrologyAsset: 'open_frontier-42-hydrology.json',
      worldSize: 3200,
      sampleGridSize: 257,
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

const ARTIFACT: HydrologyBakeArtifact = {
  schemaVersion: HYDROLOGY_BAKE_ARTIFACT_VERSION,
  width: 2,
  height: 2,
  cellSizeMeters: 10,
  depressionHandling: 'epsilon-fill',
  transform: {
    originX: -10,
    originZ: -10,
    cellSizeMeters: 10,
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

describe('HydrologyBakeManifest', () => {
  it('parses a hydrology manifest and selects unseeded DEM bakes by mode', () => {
    const manifest = parseHydrologyBakeManifest(MANIFEST);
    const entry = selectHydrologyBakeEntry(manifest, { modeId: 'a_shau_valley' });

    expect(entry?.signature).toBe('ashau-sig');
    expect(entry?.seed).toBeNull();
  });

  it('requires an explicit seed for seeded procedural bakes unless fallback is allowed', () => {
    const manifest = parseHydrologyBakeManifest(MANIFEST);

    expect(selectHydrologyBakeEntry(manifest, { modeId: 'open_frontier' })).toBeUndefined();
    expect(selectHydrologyBakeEntry(manifest, {
      modeId: 'open_frontier',
      seed: 42,
    })?.signature).toBe('frontier-42-sig');
    expect(selectHydrologyBakeEntry(manifest, {
      modeId: 'open_frontier',
      allowSeededFallback: true,
    })?.signature).toBe('frontier-42-sig');
  });

  it('loads manifest and artifact JSON with injected fetch', async () => {
    const fetcher = createJsonFetch({
      [HYDROLOGY_BAKE_MANIFEST_PATH]: MANIFEST,
      '/data/hydrology/open_frontier-42-hydrology.json': ARTIFACT,
    });

    const loaded = await loadHydrologyBakeForMode({
      modeId: 'open_frontier',
      seed: 42,
      fetchImpl: fetcher.fetch,
    });

    expect(loaded?.entry.signature).toBe('frontier-42-sig');
    expect(loaded?.artifact.masks.wetCandidateCells).toEqual([3]);
    expect(fetcher.calls).toEqual([
      HYDROLOGY_BAKE_MANIFEST_PATH,
      '/data/hydrology/open_frontier-42-hydrology.json',
    ]);
  });

  it('resolves relative artifact URLs from the manifest location', () => {
    expect(resolveHydrologyAssetUrl('open_frontier-42-hydrology.json', '/data/hydrology/bake-manifest.json'))
      .toBe('/data/hydrology/open_frontier-42-hydrology.json');
    expect(resolveHydrologyAssetUrl('open_frontier-42-hydrology.json', 'https://example.test/data/hydrology/bake-manifest.json'))
      .toBe('https://example.test/data/hydrology/open_frontier-42-hydrology.json');
    expect(resolveHydrologyAssetUrl('/data/hydrology/a.json', '/data/hydrology/bake-manifest.json'))
      .toBe('/data/hydrology/a.json');
  });

  it('rejects failed fetches and unsupported schemas', async () => {
    const missing = createJsonFetch({});
    await expect(loadHydrologyBakeManifest({ fetchImpl: missing.fetch }))
      .rejects.toThrow(/Failed to fetch hydrology bake asset/);

    expect(() => parseHydrologyBakeManifest({ ...MANIFEST, schemaVersion: 2 }))
      .toThrow(/Unsupported hydrology bake manifest schema version/);
    expect(() => parseHydrologyBakeArtifact({
      ...ARTIFACT,
      masks: {
        wetCandidateCells: [99],
        channelCandidateCells: [],
      },
    })).toThrow(/out of range/);
  });
});

function createJsonFetch(responses: Record<string, unknown>): { fetch: HydrologyFetch; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url) => {
      calls.push(url);
      if (!(url in responses)) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({}),
        };
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => responses[url],
      };
    },
  };
}
