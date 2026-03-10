import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Alliance, Faction } from '../systems/combat/types';
import { GameMode } from '../config/gameModeTypes';
import { getGameModeDefinition } from '../config/gameModeDefinitions';
import { InitialDeployCancelledError } from '../systems/player/InitialDeployCancelledError';
import { prepareInitialDeploy, resolveInitialDeployPosition } from './InitialDeployStartup';

describe('InitialDeployStartup', () => {
  it('uses policy spawn fallback during sandbox autostart instead of opening deploy UI', async () => {
    const definition = getGameModeDefinition(GameMode.ZONE_CONTROL);
    const beginInitialDeploy = vi.fn();
    const preGenerateSpawnArea = vi.fn().mockResolvedValue(undefined);
    const applyToRuntime = vi.fn();

    const engine = {
      sandboxEnabled: true,
      sandboxConfig: { autoStart: true },
      startupFlow: {
        enterDeploySelect: vi.fn(),
        enterSpawnWarming: vi.fn(),
      },
      systemManager: {
        playerRespawnManager: { beginInitialDeploy },
        preGenerateSpawnArea,
        loadoutService: { applyToRuntime },
        inventoryManager: {},
        firstPersonWeapon: {},
        grenadeSystem: {},
      },
    } as any;

    const launchSelection = {
      mode: GameMode.ZONE_CONTROL,
      alliance: Alliance.BLUFOR,
      faction: Faction.US,
    };

    const position = await prepareInitialDeploy(engine, definition, launchSelection, GameMode.ZONE_CONTROL);

    expect(position).toBeInstanceOf(THREE.Vector3);
    expect(beginInitialDeploy).not.toHaveBeenCalled();
    expect(engine.startupFlow.enterDeploySelect).toHaveBeenCalledTimes(1);
    expect(engine.startupFlow.enterSpawnWarming).toHaveBeenCalledTimes(1);
    expect(preGenerateSpawnArea).toHaveBeenCalledTimes(1);
    expect(applyToRuntime).toHaveBeenCalledTimes(1);
  });

  it('rethrows explicit initial deploy cancellation', async () => {
    const definition = getGameModeDefinition(GameMode.ZONE_CONTROL);
    const engine = {
      sandboxEnabled: false,
      sandboxConfig: null,
      systemManager: {
        playerRespawnManager: {
          beginInitialDeploy: vi.fn().mockRejectedValue(new InitialDeployCancelledError()),
        },
      },
    } as any;

    await expect(resolveInitialDeployPosition(engine, definition, {
      mode: GameMode.ZONE_CONTROL,
      alliance: Alliance.BLUFOR,
      faction: Faction.US,
    })).rejects.toBeInstanceOf(InitialDeployCancelledError);
  });
});
