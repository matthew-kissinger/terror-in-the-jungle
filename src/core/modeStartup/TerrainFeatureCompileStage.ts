import { getGameModeConfig } from '../../config/gameModes';
import { getHeightQueryCache } from '../../systems/terrain/HeightQueryCache';
import { compileTerrainFeatures } from '../../systems/terrain/TerrainFeatureCompiler';
import { bakeStampedHeightmapGrid } from '../../systems/terrain/TerrainStampGridBaker';
import type { CompiledTerrainFeatureSet } from '../../systems/terrain/TerrainFeatureTypes';
import type { PreparedHeightmapGrid, PreparedTerrainSource } from '../../systems/terrain/PreparedTerrainSource';
import { compileHydrologyTerrainFeatures } from '../../systems/terrain/hydrology/HydrologyTerrainFeatures';
import type { HydrologyBakeArtifact } from '../../systems/terrain/hydrology/HydrologyBake';
import { composeTerrain } from '../../systems/terrain/compositor/TerrainCompositor';
import {
  HydrologyArtifactCache,
  computeHydrologyArtifactCacheKey,
} from '../../systems/terrain/compositor/HydrologyArtifactCache';
import { setLastTerrainCompositorOutput } from '../../systems/terrain/compositor/LastCompositorOutput';
import { markStartup } from '../StartupTelemetry';
import {
  fingerprintStamps,
  getHydrologyArtifactCache,
  heightProviderIdentity,
} from './HydrologyArtifactCacheStage';

/**
 * Terrain feature compilation stage extracted from the ModeStartupPreparer
 * facade (cycle phase4-godfiles split). Behavior-identical to the original
 * `compileStartupTerrainFeatures` / `bakeStampedPreparedHeightmap` — same
 * telemetry marks, ordering, cache wiring, and DEV-only compositor overlay.
 */

export interface CompiledStartupTerrainFeatures {
  compiledFeatures: CompiledTerrainFeatureSet;
  preparedTerrainSource: PreparedTerrainSource;
  /**
   * Hydrology artifact for the water-surface mesh. After R2.2 this is the
   * Pass C re-anchored copy (river polyline elevations re-sampled against
   * the composed provider) when hydrology + recomposeHydrology are both
   * on; otherwise it matches `preparedTerrainSource.hydrologyBake.artifact`
   * (the original). Navmesh + heightmap bake consumers must continue to
   * read the ORIGINAL artifact via `preparedTerrainSource.hydrologyBake`
   * (memo §Risks "Navmesh desync").
   */
  waterSurfaceArtifact: HydrologyBakeArtifact | null;
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
  const hydrologyFeatures = compileHydrologyTerrainFeatures(
    preparedTerrainSource.hydrologyBake?.artifact ?? null,
  );

  // R2.2 (wire-up): when a hydrology artifact is present, compute the cache
  // key from the inputs to compose (sorted stamp fingerprint + artifact
  // schema + base provider identity) and warm the in-memory LRU from
  // persistent storage. The synchronous compose path then reads the warmed
  // cache via `getInMemory`. Misses recompute and write back through
  // `cache.set`. Cache is module-scoped so repeated launches of the same
  // map share warm state.
  const hydrologyArtifact = preparedTerrainSource.hydrologyBake?.artifact ?? null;
  const passCEnabled = hydrologyArtifact !== null;
  let hydrologyCache: HydrologyArtifactCache | undefined;
  let hydrologyCacheKey: string | undefined;
  if (passCEnabled) {
    hydrologyCache = getHydrologyArtifactCache();
    const stampsFingerprint = fingerprintStamps([
      ...featureCompile.stamps,
      ...hydrologyFeatures.stamps,
    ]);
    hydrologyCacheKey = await computeHydrologyArtifactCacheKey(
      stampsFingerprint,
      hydrologyArtifact,
      heightProviderIdentity(baseProvider.getWorkerConfig()),
    );
    // `warm` resolves false when neither persistent backend has the entry;
    // that's fine — the compose path falls through to the synchronous
    // recompute branch. Errors are swallowed inside warm().
    await hydrologyCache.warm(hydrologyCacheKey);
  }

  // R2.2: enable Pass C (hydrology feedback) so the water-surface mesh
  // rides on the composed terrain over airfield/motor-pool overlaps.
  // The original hydrology artifact stays available via
  // `preparedTerrainSource.hydrologyBake.artifact` for navmesh + heightmap
  // bake consumers; only the water-surface consumer (HydrologyRiverSurface)
  // reads `composed.waterSurfaceArtifact`.
  const composed = composeTerrain(
    {
      baseProvider,
      features: featureCompile,
      hydrology: hydrologyFeatures,
      hydrologyArtifact,
      options: { recomposeHydrology: passCEnabled },
    },
    { hydrologyCache, hydrologyCacheKey },
  );
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
  // receive the same shape they did pre-compositor. R1.1 is NO-OP: stamps
  // and vegetationExclusionZones come straight from the compositor;
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
  markStartup(`${telemetryPrefix}.stats.hydrology-stamps-${hydrologyFeatures.stamps.length}`);
  markStartup(`${telemetryPrefix}.stats.hydrology-exclusion-zones-${hydrologyFeatures.vegetationExclusionZones.length}`);

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
    waterSurfaceArtifact: composed.waterSurfaceArtifact,
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
