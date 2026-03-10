import * as THREE from 'three';
import type { GameLaunchSelection, GameModeDefinition } from '../config/gameModeTypes';
import { Logger } from '../utils/Logger';
import { InitialDeployCancelledError } from '../systems/player/InitialDeployCancelledError';
import type { GameEngine } from './GameEngine';
import { markStartup } from './StartupTelemetry';
import { resolveModeSpawnPosition } from './ModeSpawnPosition';

export async function resolveInitialDeployPosition(
  engine: GameEngine,
  definition: GameModeDefinition,
  launchSelection: GameLaunchSelection
): Promise<THREE.Vector3> {
  if (engine.sandboxEnabled && engine.sandboxConfig?.autoStart) {
    return resolveModeSpawnPosition(definition, launchSelection.alliance);
  }

  try {
    return await engine.systemManager.playerRespawnManager.beginInitialDeploy();
  } catch (error) {
    if (error instanceof InitialDeployCancelledError) {
      throw error;
    }
    Logger.warn('engine-init', 'Initial deploy flow unavailable, using mode spawn fallback', error);
    return resolveModeSpawnPosition(definition, launchSelection.alliance);
  }
}

function applyConfiguredLoadout(engine: GameEngine): void {
  engine.systemManager.loadoutService.applyToRuntime({
    inventoryManager: engine.systemManager.inventoryManager,
    firstPersonWeapon: engine.systemManager.firstPersonWeapon,
    grenadeSystem: engine.systemManager.grenadeSystem,
  });
  Logger.info('engine-init', 'Configured deploy loadout applied');
}

export async function prepareInitialDeploy(
  engine: GameEngine,
  definition: GameModeDefinition,
  launchSelection: GameLaunchSelection,
  modeNameForTelemetry: string
): Promise<THREE.Vector3> {
  engine.startupFlow.enterDeploySelect();
  const initialDeployPosition = await resolveInitialDeployPosition(engine, definition, launchSelection);

  engine.startupFlow.enterSpawnWarming();
  const spawnPos = initialDeployPosition.clone();
  spawnPos.y = 5;
  await engine.systemManager.preGenerateSpawnArea(spawnPos);
  markStartup(`engine-init.start-game.${modeNameForTelemetry}.post-pre-generate`);

  applyConfiguredLoadout(engine);
  return initialDeployPosition;
}
