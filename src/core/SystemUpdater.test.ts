import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SystemUpdater } from './SystemUpdater';
import { SYSTEM_UPDATE_SCHEDULE, TRACKED_SYSTEM_KEYS } from './SystemUpdateSchedule';
import type { SystemKeyToType } from './SystemRegistry';

function createRefs(overrides: Partial<SystemKeyToType> = {}): SystemKeyToType {
  return {
    spatialGridManager: {
      resetFrameTelemetry: vi.fn(),
    },
    minimapSystem: {
      setCommandPosition: vi.fn(),
      update: vi.fn(),
    },
    fullMapSystem: {
      setCommandPosition: vi.fn(),
      getIsVisible: vi.fn(() => false),
      update: vi.fn(),
    },
    compassSystem: {
      update: vi.fn(),
    },
    hudSystem: {
      update: vi.fn(),
      showMessage: vi.fn(),
    },
    zoneManager: {
      update: vi.fn(),
    },
    ticketSystem: {
      update: vi.fn(),
    },
    weatherSystem: {
      update: vi.fn(),
    },
    waterSystem: {
      update: vi.fn(),
    },
    playerController: {
      getPosition: vi.fn(() => new THREE.Vector3(0, 2, 0)),
      setPosition: vi.fn(),
      update: vi.fn(),
    },
    combatantSystem: {
      getAllCombatants: vi.fn(() => []),
      update: vi.fn(),
    },
    gameModeManager: {
      getRespawnPolicy: vi.fn(() => ({ contactAssistStyle: 'none' })),
      updateRuntime: vi.fn(),
    },
    playerRespawnManager: {
      getPolicyDrivenInsertionSuggestion: vi.fn(() => new THREE.Vector3(50, 2, 50)),
    },
    playerHealthSystem: {
      applySpawnProtection: vi.fn(),
    },
    strategicFeedback: {
      setPlayerPosition: vi.fn(),
    },
    ...overrides,
  } as unknown as SystemKeyToType;
}

describe('SystemUpdater', () => {
  it('declares manually scheduled systems as fallback-tracked', () => {
    const scheduledKeys = new Set(
      SYSTEM_UPDATE_SCHEDULE.flatMap(group => group.systems.map(system => system.key)),
    );

    expect(scheduledKeys.has('navmeshSystem')).toBe(true);
    expect(scheduledKeys.has('npcVehicleController')).toBe(true);
    expect(scheduledKeys.has('gameModeManager')).toBe(true);
    expect(new Set(TRACKED_SYSTEM_KEYS)).toEqual(scheduledKeys);
  });

  it('schedules world-state updates on a lower cadence with accumulated delta', () => {
    const updater = new SystemUpdater();
    const refs = createRefs();

    updater.updateSystems(refs, [], undefined, 0.02, true);
    updater.updateSystems(refs, [], undefined, 0.02, true);
    expect(refs.zoneManager.update).not.toHaveBeenCalled();

    updater.updateSystems(refs, [], undefined, 0.03, true);

    expect(refs.zoneManager.update).toHaveBeenCalledTimes(1);
    expect(refs.zoneManager.update).toHaveBeenCalledWith(0.07);
    expect(refs.ticketSystem.update).toHaveBeenCalledWith(0.07);
    expect(refs.weatherSystem.update).toHaveBeenCalledWith(0.07);
    expect(refs.waterSystem.update).toHaveBeenCalledWith(0.07);
  });

  it('does not contain A Shau contact-assist logic (removed from core)', () => {
    const updater = new SystemUpdater();
    const refs = createRefs();

    // Run many frames - should never trigger any player teleport or HUD message
    for (let i = 0; i < 61; i++) {
      updater.updateSystems(refs, [], undefined, 1, true);
    }

    expect(refs.hudSystem.showMessage).not.toHaveBeenCalled();
    expect(refs.playerController.setPosition).not.toHaveBeenCalled();
  });

  it('does not fallback-update manually scheduled systems when they are present in the generic system list', () => {
    const updater = new SystemUpdater();
    const navmeshSystem = {
      update: vi.fn(),
    };
    const npcVehicleController = {
      update: vi.fn(),
    };
    const gameModeManager = {
      getRespawnPolicy: vi.fn(() => ({ contactAssistStyle: 'none' })),
      update: vi.fn(),
      updateRuntime: vi.fn(),
    };
    const refs = createRefs({
      navmeshSystem,
      npcVehicleController,
      gameModeManager,
    } as unknown as Partial<SystemKeyToType>);

    updater.updateSystems(
      refs,
      [
        navmeshSystem,
        npcVehicleController,
        gameModeManager,
      ] as unknown as Parameters<SystemUpdater['updateSystems']>[1],
      undefined,
      0.016,
      true,
    );

    expect(navmeshSystem.update).toHaveBeenCalledTimes(1);
    expect(npcVehicleController.update).toHaveBeenCalledTimes(1);
    expect(gameModeManager.updateRuntime).not.toHaveBeenCalled();
    expect(gameModeManager.update).not.toHaveBeenCalled();
  });

  it('fallback-updates systems that are not declared in the explicit schedule', () => {
    const updater = new SystemUpdater();
    const genericSystem = {
      update: vi.fn(),
    };
    const refs = createRefs();

    updater.updateSystems(
      refs,
      [genericSystem] as unknown as Parameters<SystemUpdater['updateSystems']>[1],
      undefined,
      0.016,
      true,
    );

    expect(genericSystem.update).toHaveBeenCalledTimes(1);
    expect(genericSystem.update).toHaveBeenCalledWith(0.016);
  });
});
