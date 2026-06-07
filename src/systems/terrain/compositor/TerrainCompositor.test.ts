// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
 * Behavior tests for the compositor with R2.1 policy resolution wired in.
 *
 * R1.1's strict byte-identity test was deliberately retired here - the
 * resolver mutates `fixedTargetHeight` on `sample_post_compose` stamps
 * (the airfield envelope, by design), so the legacy concat-and-sort path
 * is no longer a reference oracle for height values. The tests below
 * instead pin the structural shape of the stamp list (count, kinds,
 * priorities, ordering) plus behavioral expectations (resolver returns
 * conflicts, deterministic across calls).
 */

/** 64 deterministic world coordinates spanning a square around the origin. */
function deterministicCoords64(extent: number): Array<{ x: number; z: number }> {
  const coords: Array<{ x: number; z: number }> = [];
  const side = 8;
  for (let ix = 0; ix < side; ix++) {
    for (let iz = 0; iz < side; iz++) {
      const x = -extent / 2 + (ix / (side - 1)) * extent;
      const z = -extent / 2 + (iz / (side - 1)) * extent;
      coords.push({ x, z });
    }
  }
  return coords;
}

/** Mulberry32 PRNG - deterministic worker-parity sample selection. */
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

function makeFlatHeightProvider(height: number): IHeightProvider {
  return {
    getHeightAt: () => height,
    getWorkerConfig: () => ({ type: 'noise', seed: 0 }),
  };
}

function makeEmptyFeatures(): CompiledTerrainFeatureSet {
  return {
    stamps: [],
    surfacePatches: [],
    vegetationExclusionZones: [],
    flowPaths: [],
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

/**
 * Stamp shape descriptor - what we pin on snapshots. Excludes
 * `fixedTargetHeight` so the resolver's intentional `sample_post_compose`
 * mutations don't break the regression sentinel.
 */
function stampShape(stamp: TerrainStampConfig): Record<string, unknown> {
  const common = {
    kind: stamp.kind,
    priority: stamp.priority,
    obstructionPolicy: stamp.obstructionPolicy ?? null,
    targetHeightStrategy: stamp.targetHeightStrategy ?? null,
  };
  if (stamp.kind === 'flatten_circle') {
    return {
      ...common,
      centerX: stamp.centerX,
      centerZ: stamp.centerZ,
      innerRadius: stamp.innerRadius,
      outerRadius: stamp.outerRadius,
      gradeRadius: stamp.gradeRadius,
    };
  }
  return {
    ...common,
    startX: stamp.startX,
    startZ: stamp.startZ,
    endX: stamp.endX,
    endZ: stamp.endZ,
    innerRadius: stamp.innerRadius,
    outerRadius: stamp.outerRadius,
    gradeRadius: stamp.gradeRadius,
  };
}

describe('composeTerrain (R2.1 - resolver wired in)', () => {
  describe('Open Frontier (seed 42)', () => {
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

    it('produces a non-empty priority-sorted stamp list', () => {
      expect(composed.stamps.length).toBeGreaterThan(0);
      for (let i = 1; i < composed.stamps.length; i++) {
        expect(composed.stamps[i].priority).toBeGreaterThanOrEqual(
          composed.stamps[i - 1].priority,
        );
      }
    });

    it('stamp shape (geometry + policy annotations) matches the priority-sorted concat', () => {
      // Structural regression sentinel. Excludes `fixedTargetHeight` so that
      // the resolver's `sample_post_compose` rewrites don't trip the test.
      const legacyShapes = [...features.stamps, ...hydrologyResult.stamps]
        .sort((a, b) => a.priority - b.priority)
        .map(stampShape);
      const composedShapes = composed.stamps.map(stampShape);
      expect(composedShapes).toEqual(legacyShapes);
    });

    it('passes vegetation exclusion zones through (features union hydrology)', () => {
      const expectedZones = [
        ...features.vegetationExclusionZones,
        ...hydrologyResult.vegetationExclusionZones,
      ];
      expect(composed.vegetationExclusionZones).toEqual(expectedZones);
    });

    it('returns a non-empty conflicts list (>= 1 hydrology intersect airfield envelope expected)', () => {
      expect(composed.conflicts.length).toBeGreaterThan(0);
    });

    it('returns the input hydrology artifact unchanged (Pass C is R2.2)', () => {
      expect(composed.waterSurfaceArtifact).toBe(hydrologyArtifact);
    });

    it('composed provider returns finite heights at all 64 deterministic sample coords', () => {
      const samples = deterministicCoords64(2000);
      for (const { x, z } of samples) {
        const h = composed.composedProvider.getHeightAt(x, z);
        expect(Number.isFinite(h)).toBe(true);
      }
    });

    it('Main Airfield interior reads as flat (max - min < 0.5 m over an 8x8 sample grid)', () => {
      // R2.1 acceptance: OF airfield height inside its rect inner radius must
      // be flat to within 0.5 m. The airfield centre is (365, 0, -1335) and
      // the smallest authored rect inner radius is ~33 m; sampling a 20 m
      // half-extent grid keeps every sample inside the flat zone.
      const center = { x: 365, z: -1335 };
      const halfExtent = 20;
      const side = 8;
      let minHeight = Number.POSITIVE_INFINITY;
      let maxHeight = Number.NEGATIVE_INFINITY;
      for (let ix = 0; ix < side; ix++) {
        for (let iz = 0; iz < side; iz++) {
          const x = center.x - halfExtent + (ix / (side - 1)) * (halfExtent * 2);
          const z = center.z - halfExtent + (iz / (side - 1)) * (halfExtent * 2);
          const h = composed.composedProvider.getHeightAt(x, z);
          if (h < minHeight) minHeight = h;
          if (h > maxHeight) maxHeight = h;
        }
      }
      expect(maxHeight - minHeight).toBeLessThan(0.5);
    });

    it('is deterministic across two identical compose calls (same stamps, same conflicts, same heights)', () => {
      const composedAgain = composeTerrain({
        baseProvider,
        features,
        hydrology: hydrologyResult,
        hydrologyArtifact,
      });
      expect(composedAgain.stamps.length).toBe(composed.stamps.length);
      for (let i = 0; i < composed.stamps.length; i++) {
        expect(composedAgain.stamps[i].fixedTargetHeight)
          .toBe(composed.stamps[i].fixedTargetHeight);
      }
      expect(composedAgain.conflicts.length).toBe(composed.conflicts.length);
      for (let i = 0; i < composed.conflicts.length; i++) {
        expect(composedAgain.conflicts[i].resolution).toBe(composed.conflicts[i].resolution);
      }
      const samples = deterministicCoords64(2000);
      for (const { x, z } of samples) {
        expect(composedAgain.composedProvider.getHeightAt(x, z))
          .toBe(composed.composedProvider.getHeightAt(x, z));
      }
    });
  });

  describe('A Shau Valley (procedural noise fallback for offline tests)', () => {
    // The A Shau DEM is gitignored (data/vietnam/DATA_PIPELINE.md). For unit
    // tests we exercise the feature-compile + composition path against a
    // procedural base; what we care about is structural identity of the
    // stamp list (the resolver may mutate envelope targets but never adds /
    // removes / reorders stamps).
    const aShauFixtureConfig: GameModeConfig = { ...A_SHAU_VALLEY_CONFIG };
    const { baseProvider, features, hydrologyResult, hydrologyArtifact } = buildScenario(
      aShauFixtureConfig,
      null,
    );

    const composed = composeTerrain({
      baseProvider,
      features,
      hydrology: hydrologyResult,
      hydrologyArtifact,
    });

    it('stamp shape (geometry + policy annotations) is byte-identical to the priority-sorted concat', () => {
      // A Shau regression sentinel from the R2.1 acceptance - stamp shapes
      // (kind, geometry, policy fields, priority) must not drift. Target
      // heights may shift for `sample_post_compose` stamps, which is fine.
      const legacyShapes = [...features.stamps, ...hydrologyResult.stamps]
        .sort((a, b) => a.priority - b.priority)
        .map(stampShape);
      const composedShapes = composed.stamps.map(stampShape);
      expect(composedShapes).toEqual(legacyShapes);
    });

    it('composed provider returns finite heights at 64 deterministic world coords', () => {
      const samples = deterministicCoords64(4000);
      for (const { x, z } of samples) {
        expect(Number.isFinite(composed.composedProvider.getHeightAt(x, z))).toBe(true);
      }
    });

    it('returns null waterSurfaceArtifact when none was supplied', () => {
      expect(composed.waterSurfaceArtifact).toBeNull();
    });
  });

  describe('worker parity', () => {
    // The compositor's StampedHeightProvider must serialize through
    // getWorkerConfig() in a way that re-creates a provider yielding the
    // same heights - this catches regressions where main-thread wires the
    // compositor but worker side does not.
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

    const workerSideProvider = createHeightProviderFromConfig(
      composed.composedProvider.getWorkerConfig(),
    );

    it('worker-side height sample matches main-thread sample at 16 deterministic coords', () => {
      const rand = makeMulberry32(0xC0FFEE);
      const span = 1800;
      for (let i = 0; i < 16; i++) {
        const x = (rand() - 0.5) * span;
        const z = (rand() - 0.5) * span;
        const main = composed.composedProvider.getHeightAt(x, z);
        const worker = workerSideProvider.getHeightAt(x, z);
        expect(worker).toBe(main);
      }
    });
  });

  describe('hydrology water-surface feedback', () => {
    it('re-anchors the full channel path against the composed hydrology bed', () => {
      const baseProvider = makeFlatHeightProvider(20);
      const hydrologyArtifact = makeSyntheticHydrologyArtifact();
      const hydrologyResult = compileHydrologyTerrainFeatures(hydrologyArtifact);

      const composed = composeTerrain({
        baseProvider,
        features: makeEmptyFeatures(),
        hydrology: hydrologyResult,
        hydrologyArtifact,
        options: { recomposeHydrology: true },
      });

      const waterPoints = composed.waterSurfaceArtifact?.channelPolylines[0]?.points ?? [];
      const originalPoints = hydrologyArtifact.channelPolylines[0]?.points ?? [];
      expect(waterPoints.length).toBe(originalPoints.length);

      let sawReanchoredPoint = false;
      for (let i = 0; i < waterPoints.length; i++) {
        const point = waterPoints[i]!;
        const original = originalPoints[i]!;
        const composedHeight = composed.composedProvider.getHeightAt(point.x, point.z);
        expect(point.elevationMeters).toBe(composedHeight);
        if (point.elevationMeters !== original.elevationMeters) sawReanchoredPoint = true;
      }
      expect(sawReanchoredPoint).toBe(true);
    });
  });

  describe('stamps wrapped in StampedHeightProvider when present', () => {
    // Sanity: the compositor's returned `composedProvider` is the same shape
    // as constructing a `StampedHeightProvider` from the resolved stamps.
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

    it('matches a StampedHeightProvider rebuilt from the resolver output', () => {
      const reconstructed = new StampedHeightProvider(baseProvider, composed.stamps);
      const samples = deterministicCoords64(2000);
      for (const { x, z } of samples) {
        expect(reconstructed.getHeightAt(x, z))
          .toBe(composed.composedProvider.getHeightAt(x, z));
      }
    });
  });
});
