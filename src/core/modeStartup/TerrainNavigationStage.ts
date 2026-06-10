// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { GameMode } from '../../config/gameModeTypes';
import { getGameModeConfig } from '../../config/gameModes';
import type { CompiledTerrainFeatureSet } from '../../systems/terrain/TerrainFeatureTypes';
import type { PreparedTerrainSource } from '../../systems/terrain/PreparedTerrainSource';
import { Logger } from '../../utils/Logger';
import type { GameEngine } from '../GameEngine';
import { markStartup } from '../StartupTelemetry';
import { computeNavmeshBakeSignature } from '../../systems/navigation/NavmeshBakeSignature';
import { yieldToRenderer } from './StartupYield';

/**
 * Terrain + navigation wiring stage extracted from the ModeStartupPreparer
 * facade (cycle phase4-godfiles split). Behavior-identical to the original
 * `configureTerrainAndNavigation` / `applyCompiledTerrainFeatures` — same
 * ordering, telemetry marks, hydrology artifact routing, navmesh generation,
 * and connectivity validation.
 */
export async function configureTerrainAndNavigation(
  engine: GameEngine,
  config: ReturnType<typeof getGameModeConfig>,
  preparedTerrainSource: PreparedTerrainSource,
  emitProgress?: (phase: string, progress: number, label: string) => void,
): Promise<void> {
  markStartup(`engine-init.start-game.${config.id}.terrain-config.begin`);
  if (!engine.systemManager.navmeshSystem.isReady()) {
    const hasPrebakedAsset = !!config.navmeshAsset;
    await engine.systemManager.navmeshSystem.init(hasPrebakedAsset);
  }

  if (config.cameraFar || config.fogDensity || config.shadowFar) {
    engine.renderer.configureForWorldSize({
      cameraFar: config.cameraFar,
      fogDensity: config.fogDensity,
      shadowFar: config.shadowFar,
    });
  }

  const terrainSystem = engine.systemManager.terrainSystem;

  if (config.worldSize) {
    engine.systemManager.playerController.setWorldSize(config.worldSize);
  }

  const defaultBiome = config.terrain?.defaultBiome ?? 'denseJungle';
  await terrainSystem.configureModeSurface({
    preparedHeightmap: preparedTerrainSource.preparedHeightmap ?? null,
    worldSize: config.worldSize,
    visualMargin: config.visualMargin ?? 200,
    chunkSize: config.chunkSize,
    renderDistance: config.chunkRenderDistance,
    defaultBiomeId: defaultBiome,
    biomeRules: config.terrain?.biomeRules,
  });
  terrainSystem.setFarCanopyTint(config.terrain?.farCanopyTint);
  markStartup(`engine-init.start-game.${config.id}.terrain-config.end`);

  if (engine.systemManager.navmeshSystem.isWasmReady()) {
    const navWorldSize = config.worldSize ?? terrainSystem.getPlayableWorldSize();
    const navmeshAnchors = config.zones?.map(z =>
      new THREE.Vector3(z.position.x, 0, z.position.z)
    ) ?? [];
    // Yield before WASM navmesh generation so the progress bar renders "Generating navigation mesh..."
    await yieldToRenderer();
    markStartup(`engine-init.start-game.${config.id}.navmesh.begin`);
    const navmeshCacheFingerprint = computeNavmeshBakeSignature({
      modeId: config.id,
      terrainSource: preparedTerrainSource.terrainFingerprint ?? config.heightSource ?? config.terrainSeed ?? null,
      worldSize: navWorldSize,
      terrain: config.terrain ?? null,
      terrainFlow: config.terrainFlow ?? null,
      features: config.features ?? [],
    });
    const navmeshGenerated = await engine.systemManager.navmeshSystem.generateNavmesh(
      navWorldSize,
      config.features,
      config.navmeshAsset,
      {
        anchors: navmeshAnchors,
        cacheFingerprint: navmeshCacheFingerprint,
        telemetryPrefix: `engine-init.start-game.${config.id}.navmesh`,
        onTileProgress: (tilesAdded, totalTiles) => {
          emitProgress?.(
            'navmesh',
            tilesAdded / totalTiles,
            `Linking navigation tiles (${tilesAdded}/${totalTiles})...`,
          );
        },
      },
    );
    markStartup(`engine-init.start-game.${config.id}.navmesh.end`);

    if (config.id === GameMode.A_SHAU_VALLEY && !navmeshGenerated) {
      throw new Error(
        'A Shau Valley requires a generated or pre-baked navmesh. Startup stopped instead of continuing with beeline navigation.'
      );
    }

    // Validate navmesh connectivity using representative home bases (not all-pairs).
    // For 16 zones, all-pairs requires up to 120 path queries. Home-base check needs 1-2.
    markStartup(`engine-init.start-game.${config.id}.navmesh.connectivity.begin`);
    if (config.zones?.length && engine.systemManager.navmeshSystem.isReady()) {
      const homeBases = config.zones.filter(z => z.isHomeBase);

      // If no home bases defined, fall back to first and last zone as representatives
      const representatives = homeBases.length >= 2
        ? homeBases
        : [config.zones[0], config.zones[config.zones.length - 1]];

      const repPositions = representatives.map(z => {
        const y = terrainSystem.getHeightAt(z.position.x, z.position.z);
        const raw = new THREE.Vector3(z.position.x, y, z.position.z);
        const searchRadius = Math.max(z.radius + 20, 60);
        const snapped = engine.systemManager.navmeshSystem.findNearestPoint(raw, searchRadius);
        if (!snapped) {
          Logger.warn(
            'Navigation',
            `No navmesh near home base "${z.name}" within ${searchRadius.toFixed(0)}m`
          );
        }
        return snapped ?? raw;
      });

      const result = engine.systemManager.navmeshSystem.validateConnectivity(repPositions);
      if (!result.connected) {
        const repNames = representatives.map(z => z.name);
        for (const island of result.islands) {
          const names = island.map(i => repNames[i]).join(', ');
          Logger.warn('Navigation', `Disconnected home bases: [${names}]`);
        }
      }
    }
    markStartup(`engine-init.start-game.${config.id}.navmesh.connectivity.end`);
  }
}

export async function applyCompiledTerrainFeatures(
  engine: GameEngine,
  compiledFeatures: CompiledTerrainFeatureSet,
  emitProgress: (phase: string, progress: number, label: string) => void,
): Promise<void> {
  engine.systemManager.minimapSystem.setTerrainFlowPaths(compiledFeatures.flowPaths);
  engine.systemManager.fullMapSystem.setTerrainFlowPaths(compiledFeatures.flowPaths);
  engine.systemManager.fullMapSystem.setTerrainRuntime(engine.systemManager.terrainSystem);

  // Use async path - yields between vegetation cell batches to avoid blocking main thread
  await engine.systemManager.terrainSystem.setTerrainFeaturesAsync(
    compiledFeatures,
    (done, total) => {
      emitProgress('vegetation', done / total, `Placing vegetation (${done}/${total})...`);
    },
  );
}
