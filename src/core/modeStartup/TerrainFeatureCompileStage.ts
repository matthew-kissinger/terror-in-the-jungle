// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { getGameModeConfig } from '../../config/gameModes';
import { getHeightQueryCache } from '../../systems/terrain/HeightQueryCache';
import { compileTerrainFeatures } from '../../systems/terrain/TerrainFeatureCompiler';
import { bakeStampedHeightmapGrid } from '../../systems/terrain/TerrainStampGridBaker';
import type { CompiledTerrainFeatureSet } from '../../systems/terrain/TerrainFeatureTypes';
import type { PreparedHeightmapGrid, PreparedTerrainSource } from '../../systems/terrain/PreparedTerrainSource';
import { composeTerrain } from '../../systems/terrain/compositor/TerrainCompositor';
import { setLastTerrainCompositorOutput } from '../../systems/terrain/compositor/LastCompositorOutput';
import { markStartup } from '../StartupTelemetry';

/**
 * Terrain feature compilation stage extracted from the ModeStartupPreparer
 * facade (cycle phase4-godfiles split). Behavior-identical to the original
 * `compileStartupTerrainFeatures` / `bakeStampedPreparedHeightmap` — same
 * telemetry marks, ordering, and DEV-only compositor overlay.
 *
 * (Hydrology stamps + authored water-body carving + the Pass C water-surface
 * artifact were removed with the water rework on 2026-06-09.)
 */

export interface CompiledStartupTerrainFeatures {
  compiledFeatures: CompiledTerrainFeatureSet;
  preparedTerrainSource: PreparedTerrainSource;
}

export async function compileStartupTerrainFeatures(
  config: ReturnType<typeof getGameModeConfig>,
  preparedTerrainSource: PreparedTerrainSource,
): Promise<CompiledStartupTerrainFeatures> {
  const telemetryPrefix = `engine-init.start-game.${config.id}.terrain-features.compile`;
  const heightCache = getHeightQueryCache();
  const baseProvider = heightCache.getProvider();

  markStartup(`${telemetryPrefix}.features.begin`);
  const featureCompile = compileTerrainFeatures(
    config,
    (x, z) => heightCache.getHeightAt(x, z),
  );

  const composed = composeTerrain({
    baseProvider,
    features: featureCompile,
  });
  // Surface the latest output to the dev-only Shift+\ → J compositor overlay
  // (cycle-terrain-compositor R2.3). Gated on `import.meta.env.DEV` so the
  // production bundle does not hold a reference to the composed output via the
  // module-level cache slot in `LastCompositorOutput.ts`. Vite tree-shakes the
  // import along with the call site when `import.meta.env.DEV` is false.
  if (import.meta.env.DEV) {
    setLastTerrainCompositorOutput(composed);
  }

  // Reassemble the full CompiledTerrainFeatureSet so downstream consumers
  // (TerrainSystem.setTerrainFeaturesAsync, minimap/fullmap flow paths)
  // receive the same shape they did pre-compositor. Stamps and
  // vegetationExclusionZones come straight from the compositor;
  // surfacePatches and flowPaths come straight from the feature compile.
  const compiledFeatures: CompiledTerrainFeatureSet = {
    stamps: composed.stamps,
    surfacePatches: featureCompile.surfacePatches,
    vegetationExclusionZones: composed.vegetationExclusionZones,
    flowPaths: featureCompile.flowPaths,
  };
  markStartup(`${telemetryPrefix}.features.end`);
  markStartup(`${telemetryPrefix}.stats.stamps-${compiledFeatures.stamps.length}`);
  markStartup(`${telemetryPrefix}.stats.surface-patches-${compiledFeatures.surfacePatches.length}`);
  markStartup(`${telemetryPrefix}.stats.exclusion-zones-${compiledFeatures.vegetationExclusionZones.length}`);
  markStartup(`${telemetryPrefix}.stats.flow-paths-${compiledFeatures.flowPaths.length}`);

  if (compiledFeatures.stamps.length > 0) {
    markStartup(`${telemetryPrefix}.stamped-provider.begin`);
    heightCache.setProvider(composed.composedProvider);
    markStartup(`${telemetryPrefix}.stamped-provider.end`);
    if (preparedTerrainSource.preparedHeightmap) {
      markStartup(`${telemetryPrefix}.heightmap-rebake.begin`);
      const rebakedHeightmap = bakeStampedPreparedHeightmap(
        preparedTerrainSource.preparedHeightmap,
        config.worldSize,
        baseProvider,
        compiledFeatures.stamps,
      );
      preparedTerrainSource = {
        ...preparedTerrainSource,
        preparedHeightmap: rebakedHeightmap,
      };
      markStartup(`${telemetryPrefix}.heightmap-rebake.end`);
      markStartup(`${telemetryPrefix}.stats.heightmap-grid-${rebakedHeightmap.gridSize}`);
    } else {
      markStartup(`${telemetryPrefix}.heightmap-rebake.skipped-no-prepared-heightmap`);
    }
  } else {
    markStartup(`${telemetryPrefix}.stamps.none`);
  }

  return {
    compiledFeatures,
    preparedTerrainSource,
  };
}

function bakeStampedPreparedHeightmap(
  preparedHeightmap: PreparedHeightmapGrid,
  worldSize: number,
  baseProvider: Parameters<typeof bakeStampedHeightmapGrid>[3],
  stamps: CompiledTerrainFeatureSet['stamps'],
): PreparedHeightmapGrid {
  return {
    ...preparedHeightmap,
    data: bakeStampedHeightmapGrid(
      preparedHeightmap.data,
      preparedHeightmap.gridSize,
      worldSize,
      baseProvider,
      stamps,
    ),
  };
}
