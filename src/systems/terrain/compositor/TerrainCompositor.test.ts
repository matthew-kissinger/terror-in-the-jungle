import { describe, expect, it } from 'vitest';
import { NoiseHeightProvider } from '../NoiseHeightProvider';
import { StampedHeightProvider } from '../StampedHeightProvider';
import { compileTerrainFeatures } from '../TerrainFeatureCompiler';
import { compileHydrologyTerrainFeatures } from '../hydrology/HydrologyTerrainFeatures';
import { createHeightProviderFromConfig } from '../HeightProviderFactory';
import type {
  CompiledTerrainFeatureSet,
  TerrainStampConfig,
} from '../TerrainFeatureTypes';
import type { HydrologyBakeArtifact } from '../hydrology/HydrologyBake';
import type { IHeightProvider } from '../IHeightProvider';
import type { GameModeConfig } from '../../../config/gameModeTypes';
import { OPEN_FRONTIER_CONFIG } from '../../../config/OpenFrontierConfig';
import { A_SHAU_VALLEY_CONFIG } from '../../../config/AShauValleyConfig';
import { composeTerrain } from './TerrainCompositor';

/**
 * Behavior-identical contract test for R1.1 of cycle-terrain-compositor.
 *
 * The compositor is a NO-OP wrapper around the legacy concat-and-sort that
 * previously lived inline in ModeStartupPreparer.compileStartupTerrainFeatures.
 * The "baseline" path below replicates that legacy logic. Each scenario then
 * asserts that the compositor output matches the baseline byte-for-byte at
 * 64 deterministic world coordinates plus across the full stamp list.
 *
 * If a future change touches the compositor in a way that diverges from
 * legacy NO-OP semantics, these tests will fail with a clear delta. R1.2 / R2.x
 * tasks should update or replace this test only when intentionally changing
 * behavior.
 */

interface ComposedBaseline {
  stamps: TerrainStampConfig[];
  vegetationExclusionZones: { x: number; z: number; radius: number; sourceId?: string }[];
  composedProvider: IHeightProvider;
}

/**
 * Replicates the pre-compositor logic from ModeStartupPreparer:
 * concat features + hydrology stamps, sort by priority, wrap in
 * StampedHeightProvider if there are stamps.
 */
function legacyComposeForBaseline(
  baseProvider: IHeightProvider,
  features: CompiledTerrainFeatureSet,
  hydrologyStamps: TerrainStampConfig[],
  hydrologyZones: { x: number; z: number; radius: number; sourceId?: string }[],
): ComposedBaseline {
  const stamps = [...features.stamps, ...hydrologyStamps];
  stamps.sort((a, b) => a.priority - b.priority);
  const vegetationExclusionZones = [
    ...features.vegetationExclusionZones,
    ...hydrologyZones,
  ];
  const composedProvider = stamps.length > 0
    ? new StampedHeightProvider(baseProvider, stamps)
    : baseProvider;
  return { stamps, vegetationExclusionZones, composedProvider };
}

/** 64 deterministic world coordinates spanning a square around the origin. */
function deterministicCoords64(extent: number): Array<{ x: number; z: number }> {
  const coords: Array<{ x: number; z: number }> = [];
  const side = 8; // 8x8 = 64 samples
  for (let ix = 0; ix < side; ix++) {
    for (let iz = 0; iz < side; iz++) {
      // Span [-extent/2, +extent/2] inclusive of edges
      const x = -extent / 2 + (ix / (side - 1)) * extent;
      const z = -extent / 2 + (iz / (side - 1)) * extent;
      coords.push({ x, z });
    }
  }
  return coords;
}

/** Mulberry32 PRNG — deterministic worker-parity sample selection. */
function makeMulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function next(): number {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSyntheticHydrologyArtifact(): HydrologyBakeArtifact {
  return {
    schemaVersion: 1,
    width: 4,
    height: 4,
    cellSizeMeters: 50,
    depressionHandling: 'epsilon-fill',
    transform: { originX: 0, originZ: 0, cellSizeMeters: 50 },
    thresholds: {
      accumulationP90Cells: 10,
      accumulationP95Cells: 20,
      accumulationP98Cells: 40,
      accumulationP99Cells: 80,
    },
    masks: { wetCandidateCells: [1, 2, 5, 6], channelCandidateCells: [5, 6] },
    channelPolylines: [
      {
        headCell: 0,
        outletCell: 3,
        lengthCells: 4,
        lengthMeters: 200,
        maxAccumulationCells: 320,
        points: [
          { cell: 0, x: -200, z: -100, elevationMeters: 18, accumulationCells: 64 },
          { cell: 1, x: -100, z: -50, elevationMeters: 16, accumulationCells: 128 },
          { cell: 2, x: 50, z: 20, elevationMeters: 14, accumulationCells: 224 },
          { cell: 3, x: 200, z: 100, elevationMeters: 12, accumulationCells: 320 },
        ],
      },
    ],
  };
}

function buildScenario(
  config: GameModeConfig,
  hydrologyArtifact: HydrologyBakeArtifact | null,
): {
  baseProvider: IHeightProvider;
  features: CompiledTerrainFeatureSet;
  hydrologyResult: ReturnType<typeof compileHydrologyTerrainFeatures>;
  hydrologyArtifact: HydrologyBakeArtifact | null;
} {
  const seed = typeof config.terrainSeed === 'number' ? config.terrainSeed : 42;
  const baseProvider: IHeightProvider = new NoiseHeightProvider(seed);
  const features = compileTerrainFeatures(config, (x, z) => baseProvider.getHeightAt(x, z));
  const hydrologyResult = compileHydrologyTerrainFeatures(hydrologyArtifact);
  return { baseProvider, features, hydrologyResult, hydrologyArtifact };
}

describe('composeTerrain (R1.1 NO-OP behavior parity)', () => {
  describe('Open Frontier (seed 42)', () => {
    const { baseProvider, features, hydrologyResult, hydrologyArtifact } = buildScenario(
      OPEN_FRONTIER_CONFIG,
      makeSyntheticHydrologyArtifact(),
    );

    const baseline = legacyComposeForBaseline(
      baseProvider,
      features,
      hydrologyResult.stamps,
      hydrologyResult.vegetationExclusionZones,
    );

    const composed = composeTerrain({
      baseProvider,
      features,
      hydrology: hydrologyResult,
      hydrologyArtifact,
    });

    it('produces a stamp list identical to the legacy concat-and-sort', () => {
      expect(composed.stamps.length).toBe(baseline.stamps.length);
      expect(composed.stamps.length).toBeGreaterThan(0);
      expect(composed.stamps).toEqual(baseline.stamps);
    });

    it('sorts stamps ascending by priority', () => {
      for (let i = 1; i < composed.stamps.length; i++) {
        expect(composed.stamps[i].priority).toBeGreaterThanOrEqual(composed.stamps[i - 1].priority);
      }
    });

    it('passes vegetation exclusion zones through (features ∪ hydrology)', () => {
      expect(composed.vegetationExclusionZones).toEqual(baseline.vegetationExclusionZones);
    });

    it('returns the input hydrology artifact unchanged (Pass C is R2.2)', () => {
      expect(composed.waterSurfaceArtifact).toBe(hydrologyArtifact);
    });

    it('returns an empty conflicts list (Pass B detection is R1.2)', () => {
      expect(composed.conflicts).toEqual([]);
    });

    it('matches the baseline height-provider at 64 deterministic world coords', () => {
      const samples = deterministicCoords64(2000);
      for (const { x, z } of samples) {
        const expected = baseline.composedProvider.getHeightAt(x, z);
        const actual = composed.composedProvider.getHeightAt(x, z);
        // Strict equality — same provider class, same stamps, same base; no FP drift expected.
        expect(actual).toBe(expected);
      }
    });
  });

  describe('A Shau Valley (procedural noise fallback for offline tests)', () => {
    // The A Shau DEM is gitignored (data/vietnam/DATA_PIPELINE.md). For unit
    // tests we exercise the feature-compile + composition path against a
    // procedural base; what we care about is byte-identity vs the legacy
    // concat-and-sort, which is base-agnostic.
    const aShauFixtureConfig: GameModeConfig = { ...A_SHAU_VALLEY_CONFIG };
    const { baseProvider, features, hydrologyResult, hydrologyArtifact } = buildScenario(
      aShauFixtureConfig,
      null, // A Shau hydrology bake is also gitignored / lazy-loaded; null mirrors no-hydrology startup.
    );

    const baseline = legacyComposeForBaseline(
      baseProvider,
      features,
      hydrologyResult.stamps,
      hydrologyResult.vegetationExclusionZones,
    );

    const composed = composeTerrain({
      baseProvider,
      features,
      hydrology: hydrologyResult,
      hydrologyArtifact,
    });

    it('produces a stamp list identical to the legacy concat-and-sort', () => {
      expect(composed.stamps).toEqual(baseline.stamps);
    });

    it('matches the baseline height-provider at 64 deterministic world coords', () => {
      const samples = deterministicCoords64(4000);
      for (const { x, z } of samples) {
        expect(composed.composedProvider.getHeightAt(x, z)).toBe(
          baseline.composedProvider.getHeightAt(x, z),
        );
      }
    });

    it('returns null waterSurfaceArtifact when none was supplied', () => {
      expect(composed.waterSurfaceArtifact).toBeNull();
    });
  });

  describe('worker parity', () => {
    // The compositor's StampedHeightProvider must serialize through
    // getWorkerConfig() in a way that re-creates a provider yielding the
    // same heights — this catches regressions where main-thread wires the
    // compositor but worker side does not. We use OF (seed 42) + synthetic
    // hydrology so we exercise stamped composition.
    const { baseProvider, features, hydrologyResult, hydrologyArtifact } = buildScenario(
      OPEN_FRONTIER_CONFIG,
      makeSyntheticHydrologyArtifact(),
    );

    const composed = composeTerrain({
      baseProvider,
      features,
      hydrology: hydrologyResult,
      hydrologyArtifact,
    });

    // Worker side rebuilds the provider from getWorkerConfig().
    const workerSideProvider = createHeightProviderFromConfig(
      composed.composedProvider.getWorkerConfig(),
    );

    it('worker-side height sample matches main-thread sample at 16 deterministic coords', () => {
      const rand = makeMulberry32(0xC0FFEE);
      const span = 1800; // OF half-extent-ish; spans most of the stamp influence area
      for (let i = 0; i < 16; i++) {
        const x = (rand() - 0.5) * span;
        const z = (rand() - 0.5) * span;
        const main = composed.composedProvider.getHeightAt(x, z);
        const worker = workerSideProvider.getHeightAt(x, z);
        // Re-creation through HeightProviderConfig is exact for noise + stamped paths.
        expect(worker).toBe(main);
      }
    });
  });
});
