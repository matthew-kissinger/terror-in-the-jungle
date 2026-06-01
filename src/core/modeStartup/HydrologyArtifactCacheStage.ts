import { getGameModeConfig } from '../../config/gameModes';
import { GameMode } from '../../config/gameModeTypes';
import { loadHydrologyBakeForMode } from '../../systems/terrain/hydrology/HydrologyBakeManifest';
import type { LoadedHydrologyBake } from '../../systems/terrain/hydrology/HydrologyBakeManifest';
import type { HydrologyBiomePolicy } from '../../systems/terrain/hydrology/HydrologyBiomeClassifier';
import { HydrologyArtifactCache } from '../../systems/terrain/compositor/HydrologyArtifactCache';
import type { TerrainStampConfig } from '../../systems/terrain/TerrainFeatureTypes';
import type { HeightProviderConfig } from '../../systems/terrain/IHeightProvider';
import { Logger } from '../../utils/Logger';

/**
 * Hydrology bake preload + cache-key plumbing extracted from the
 * ModeStartupPreparer facade (cycle phase4-godfiles split). All helpers here
 * are behavior-identical to the original module-private functions; the facade
 * and the terrain-feature compile stage compose them.
 */

type GameModeRuntimeConfig = ReturnType<typeof getGameModeConfig>;

export function hydrologyPreloadEnabled(config: GameModeRuntimeConfig): boolean {
  const globalScope = globalThis as {
    __PROJEKT_143_ENABLE_HYDROLOGY_PRELOAD__?: boolean;
    __PROJEKT_143_ENABLE_HYDROLOGY_BIOMES__?: boolean;
  };
  return config.hydrology?.preload === true
    || config.hydrology?.biomeClassification?.enabled === true
    || globalScope.__PROJEKT_143_ENABLE_HYDROLOGY_PRELOAD__ === true
    || globalScope.__PROJEKT_143_ENABLE_HYDROLOGY_BIOMES__ === true;
}

export async function maybePreloadHydrologyBake(
  mode: GameMode,
  config: GameModeRuntimeConfig,
): Promise<LoadedHydrologyBake | null> {
  if (!hydrologyPreloadEnabled(config)) return null;

  try {
    const seed = typeof config.terrainSeed === 'number' ? config.terrainSeed : null;
    const loaded = await loadHydrologyBakeForMode({
      modeId: mode,
      seed,
      allowSeededFallback: config.hydrology?.allowSeededFallback,
      manifestUrl: config.hydrology?.manifestUrl,
    });

    if (!loaded) {
      Logger.info(
        'engine-init',
        `Hydrology preload enabled for ${mode}, but no matching public bake cache was found for seed=${seed ?? 'unseeded'}.`,
      );
      return null;
    }

    Logger.info(
      'engine-init',
      `Hydrology cache preloaded for ${mode}: ${loaded.entry.signature} (${loaded.artifact.width}x${loaded.artifact.height})`,
    );
    return loaded;
  } catch (error) {
    Logger.warn(
      'engine-init',
      `Hydrology preload failed for ${mode}; continuing without hydrology-backed vegetation classification.`,
      error,
    );
    return null;
  }
}

function hydrologyBiomePolicyEnabled(config: GameModeRuntimeConfig): boolean {
  const globalScope = globalThis as { __PROJEKT_143_ENABLE_HYDROLOGY_BIOMES__?: boolean };
  return config.hydrology?.biomeClassification?.enabled === true
    || globalScope.__PROJEKT_143_ENABLE_HYDROLOGY_BIOMES__ === true;
}

export function resolveHydrologyBiomePolicy(config: GameModeRuntimeConfig): HydrologyBiomePolicy | null {
  if (!hydrologyBiomePolicyEnabled(config)) return null;
  const policy = config.hydrology?.biomeClassification;
  return {
    wetBiomeId: policy?.wetBiomeId ?? 'swamp',
    channelBiomeId: policy?.channelBiomeId ?? 'riverbank',
    maxSlopeDeg: policy?.maxSlopeDeg,
  };
}

/**
 * Module-scoped cache for Pass C (hydrology recompose) artifacts. Constructed
 * lazily on first use so test envs that never call `compileStartupTerrainFeatures`
 * don't allocate one. Shared across mode startups so repeated launches of the
 * same map (mode-switch, post-victory restart) hit the in-memory LRU; cold
 * starts hit the IDB / OPFS persistent layer. Both are safe to miss — Pass C
 * is pure and will recompute on a miss.
 */
let cachedHydrologyArtifactCache: HydrologyArtifactCache | null = null;
export function getHydrologyArtifactCache(): HydrologyArtifactCache {
  if (!cachedHydrologyArtifactCache) {
    cachedHydrologyArtifactCache = new HydrologyArtifactCache();
  }
  return cachedHydrologyArtifactCache;
}

/**
 * Test-only escape hatch — reset the module-scoped cache so each test gets a
 * clean LRU. Not exported from the package surface.
 */
export function __resetHydrologyArtifactCacheForTests(): void {
  cachedHydrologyArtifactCache = null;
}

/**
 * Project stamps to a normalized, order-independent fingerprint suitable for
 * the cache key. Sort by (priority, kind, primary-coord) and project to a
 * fixed key order so two callers producing the same stamp set in different
 * insertion orders compute the same cache key.
 *
 * Reviewer Note 2 (R2.2): the cache key relies on caller-supplied canonical
 * serialization. Doing it here keeps that responsibility at the call site.
 */
export function fingerprintStamps(stamps: TerrainStampConfig[]): Array<Record<string, unknown>> {
  const projected = stamps.map(stampToFingerprint);
  projected.sort(compareStampFingerprints);
  return projected;
}

function stampToFingerprint(stamp: TerrainStampConfig): Record<string, unknown> {
  if (stamp.kind === 'flatten_circle') {
    return {
      kind: stamp.kind,
      priority: stamp.priority,
      x: stamp.centerX,
      z: stamp.centerZ,
      innerRadius: stamp.innerRadius,
      outerRadius: stamp.outerRadius,
      gradeRadius: stamp.gradeRadius,
      fixedTargetHeight: stamp.fixedTargetHeight ?? null,
      heightOffset: stamp.heightOffset,
      obstructionPolicy: stamp.obstructionPolicy ?? null,
      targetHeightStrategy: stamp.targetHeightStrategy ?? null,
    };
  }
  return {
    kind: stamp.kind,
    priority: stamp.priority,
    x: stamp.startX,
    z: stamp.startZ,
    endX: stamp.endX,
    endZ: stamp.endZ,
    innerRadius: stamp.innerRadius,
    outerRadius: stamp.outerRadius,
    gradeRadius: stamp.gradeRadius,
    fixedTargetHeight: stamp.fixedTargetHeight ?? null,
    heightOffset: stamp.heightOffset,
    obstructionPolicy: stamp.obstructionPolicy ?? null,
    targetHeightStrategy: stamp.targetHeightStrategy ?? null,
  };
}

function compareStampFingerprints(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): number {
  if (a.priority !== b.priority) return (a.priority as number) - (b.priority as number);
  if (a.kind !== b.kind) return (a.kind as string).localeCompare(b.kind as string);
  if (a.x !== b.x) return (a.x as number) - (b.x as number);
  if (a.z !== b.z) return (a.z as number) - (b.z as number);
  return 0;
}

/**
 * Cheap, deterministic identity for a height provider. Strips heavy buffers
 * (DEM payloads) and keeps only the shape that drives the height function.
 * The cache invalidates whenever this identity changes — switching DEMs,
 * re-seeding noise, swapping in a stamped wrapper.
 */
export function heightProviderIdentity(config: HeightProviderConfig): unknown {
  if (config.type === 'dem') {
    return {
      type: 'dem',
      width: config.width,
      height: config.height,
      metersPerPixel: config.metersPerPixel,
      originX: config.originX,
      originZ: config.originZ,
      byteLength: config.buffer.byteLength,
    };
  }
  if (config.type === 'stamped') {
    return {
      type: 'stamped',
      base: heightProviderIdentity(config.base),
      stampCount: config.stamps.length,
    };
  }
  if (config.type === 'visualExtent') {
    return {
      type: 'visualExtent',
      base: heightProviderIdentity(config.base),
      source: heightProviderIdentity(config.source),
      playableWorldSize: config.playableWorldSize,
      visualMargin: config.visualMargin,
    };
  }
  return { type: config.type, seed: config.seed };
}
