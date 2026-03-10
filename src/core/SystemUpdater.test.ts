import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SystemUpdater } from './SystemUpdater';
import type { SystemReferences } from './SystemInitializer';

function createRefs(overrides: Partial<SystemReferences> = {}): SystemReferences {
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
  } as unknown as SystemReferences;
}

describe('SystemUpdater', () => {
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

  it('suggests manual redeploy in A Shau instead of teleporting the player', () => {
    const updater = new SystemUpdater();
    const refs = createRefs({
      gameModeManager: {
        getRespawnPolicy: vi.fn(() => ({ contactAssistStyle: 'pressure_front' })),
      },
    });

    for (let i = 0; i < 61; i++) {
      updater.updateSystems(refs, [], undefined, 1, true);
    }

    expect(refs.hudSystem.showMessage).toHaveBeenCalledWith(
      'No nearby contact. Open the map and redeploy to the active front.',
      5000
    );
    expect(refs.playerController.setPosition).not.toHaveBeenCalled();
    expect(refs.playerHealthSystem.applySpawnProtection).not.toHaveBeenCalled();
  });
});
