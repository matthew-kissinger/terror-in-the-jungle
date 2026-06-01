import { GameMode } from '../../config/gameModeTypes';
import { getGameModeConfig } from '../../config/gameModes';
import { pickRandomVariant } from '../../config/MapSeedRegistry';
import { BakedHeightProvider } from '../../systems/terrain/BakedHeightProvider';
import { getHeightQueryCache } from '../../systems/terrain/HeightQueryCache';
import { DEMHeightProvider } from '../../systems/terrain/DEMHeightProvider';
import { NoiseHeightProvider } from '../../systems/terrain/NoiseHeightProvider';
import type { PreparedTerrainSource } from '../../systems/terrain/PreparedTerrainSource';
import { Logger } from '../../utils/Logger';
import { resolveGameAssetUrl } from '../GameAssetManifest';
import type { GameEngine } from '../GameEngine';
import { markStartup } from '../StartupTelemetry';
import { computeNavmeshBakeSignature } from '../../systems/navigation/NavmeshBakeSignature';
import { maybePreloadHydrologyBake } from './HydrologyArtifactCacheStage';

/**
 * Height-source preparation stage extracted from the ModeStartupPreparer
 * facade (cycle phase4-godfiles split). Behavior-identical to the original
 * `configureHeightSource`: same DEM-required guards, seed-rotation, pre-baked
 * fallback, procedural fallback, telemetry marks, and return shapes.
 */
export async function configureHeightSource(
  _engine: GameEngine,
  mode: GameMode,
  config: ReturnType<typeof getGameModeConfig>
): Promise<PreparedTerrainSource> {
  markStartup(`engine-init.start-game.${mode}.height-source.begin`);
  if (config.heightSource?.type === 'dem') {
    markStartup(`engine-init.start-game.${mode}.dem-load.begin`);
    const { assetId, path, width, height, metersPerPixel } = config.heightSource;
    let resolvedPath = path;
    const expectedBytes = width * height * 4;
    let demLoadError: unknown = null;
    try {
      resolvedPath = await resolveGameAssetUrl(assetId, path);
      Logger.info('engine-init', `Loading DEM terrain from ${resolvedPath} (expect ${width}x${height}, ${(expectedBytes / 1024 / 1024).toFixed(1)}MB)...`);
      const response = await fetch(resolvedPath);
      if (!response.ok) {
        throw new Error(`DEM fetch failed: HTTP ${response.status} for ${resolvedPath}`);
      }
      // SPA fallbacks (Cloudflare Pages _redirects, dev history fallback) can
      // answer missing-asset requests with 200 + text/html. Treat anything that
      // is not unambiguously binary as a fetch failure so the terrain pipeline
      // does not silently install an unrelated procedural provider.
      const contentType = response.headers.get('content-type') ?? '';
      if (/^text\/html\b/i.test(contentType)) {
        throw new Error(
          `DEM fetch returned HTML (content-type=${contentType}) for ${resolvedPath}; asset is missing from the deployed public/ tree or R2 manifest.`
        );
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) {
        throw new Error(`DEM fetch returned empty body for ${resolvedPath}`);
      }
      if (buffer.byteLength % 4 !== 0) {
        throw new Error(
          `DEM payload is not a Float32Array (byteLength=${buffer.byteLength}, content-type=${contentType}) for ${resolvedPath}; ` +
          `expected a multiple of 4 bytes.`
        );
      }
      if (buffer.byteLength !== expectedBytes) {
        throw new Error(
          `DEM size mismatch for ${resolvedPath}: got ${buffer.byteLength} bytes, expected ${expectedBytes} (${width}x${height} Float32).`
        );
      }
      const demProvider = new DEMHeightProvider(
        new Float32Array(buffer),
        width,
        height,
        metersPerPixel
      );
      getHeightQueryCache().setProvider(demProvider);
      Logger.info(
        'engine-init',
        `DEM loaded: ${width}x${height}, ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`
      );
    } catch (error) {
      demLoadError = error;
      Logger.error(
        'engine-init',
        `Failed to load required DEM terrain from ${resolvedPath}; mode startup cannot continue with fallback terrain. ` +
        `Confirm the binary is present under public${path.startsWith('/') ? path : '/' + path} ` +
        `for local dev, or that asset '${assetId ?? '(none)'}' is present in asset-manifest.json/R2 for production ` +
        `(A Shau DEMs are gitignored; see data/vietnam/DATA_PIPELINE.md).`,
        error,
      );
    }
    markStartup(`engine-init.start-game.${mode}.dem-load.end`);
    markStartup(`engine-init.start-game.${mode}.height-source.end`);
    if (demLoadError) {
      const reason = demLoadError instanceof Error ? demLoadError.message : String(demLoadError);
      throw new Error(`Required DEM terrain unavailable for ${mode}: ${reason}`);
    }
    return {
      kind: 'dem',
      hydrologyBake: await maybePreloadHydrologyBake(mode, config),
      terrainFingerprint: computeNavmeshBakeSignature({
        heightSource: config.heightSource,
        resolvedPath,
      }),
    };
  }

  // Try seed rotation: pick a random pre-baked variant if available
  const variant = pickRandomVariant(mode);
  if (variant) {
    // Override config's fixed seed/asset paths with the selected variant
    config.terrainSeed = variant.seed;
    config.navmeshAsset = variant.navmeshAsset;
    config.heightmapAsset = variant.heightmapAsset;
    Logger.info('engine-init', `Selected map variant: seed=${variant.seed}`);
  }

  // Try loading a pre-baked heightmap
  if (config.heightmapAsset) {
    try {
      const response = await fetch(config.heightmapAsset);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const gridData = new Float32Array(buffer);
        const gridSize = Math.round(Math.sqrt(gridData.length));
        if (gridSize * gridSize !== gridData.length) {
          throw new Error(`Heightmap asset is not a square grid: ${gridData.length} samples`);
        }
        const seed = typeof config.terrainSeed === 'number' ? config.terrainSeed : 42;
        const workerConfig = new NoiseHeightProvider(seed).getWorkerConfig();
        getHeightQueryCache().setProvider(
          new BakedHeightProvider(gridData, gridSize, config.worldSize, workerConfig),
        );
        Logger.info('engine-init', `Pre-baked heightmap loaded: ${gridSize}x${gridSize} (${(buffer.byteLength / 1024).toFixed(0)}KB), seed=${seed}`);
        markStartup(`engine-init.start-game.${mode}.height-source.end`);
        return {
          kind: 'prebaked',
          hydrologyBake: await maybePreloadHydrologyBake(mode, config),
          preparedHeightmap: {
            data: gridData,
            gridSize,
            workerConfig,
          },
          terrainFingerprint: config.heightmapAsset,
        };
      }
      Logger.warn('engine-init', `Pre-baked heightmap not found (${response.status}), falling back to procedural`);
    } catch (error) {
      Logger.warn('engine-init', 'Failed to fetch pre-baked heightmap, falling back to procedural:', error);
    }
  }

  const seedConfig = config.terrainSeed;
  const seed = seedConfig === 'random' || seedConfig === undefined
    ? Math.floor(Math.random() * 2147483647)
    : seedConfig;

  getHeightQueryCache().setProvider(new NoiseHeightProvider(seed));
  Logger.info('engine-init', `Procedural terrain seed: ${seed}`);
  markStartup(`engine-init.start-game.${mode}.height-source.end`);
  return {
    kind: 'procedural',
    hydrologyBake: await maybePreloadHydrologyBake(mode, config),
    terrainFingerprint: seed,
  };
}
