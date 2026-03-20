import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { HelicopterInteraction } from './HelicopterInteraction';

vi.mock('../../utils/DeviceDetector', () => ({
  shouldUseTouchControls: () => true,
}));

describe('HelicopterInteraction', () => {
  it('uses effective terrain height when exiting a helicopter', () => {
    const helicopter = new THREE.Group();
    helicopter.position.set(10, 5, 20);
    const interaction = new HelicopterInteraction(
      new Map([['heli_test', helicopter]]),
      6
    );

    const playerController = {
      isInHelicopter: vi.fn(() => true),
      getHelicopterId: vi.fn(() => 'heli_test'),
      exitHelicopter: vi.fn(),
    };
    const terrainManager = {
      getHeightAt: vi.fn(() => 4),
      getEffectiveHeightAt: vi.fn(() => 12),
    };

    interaction.setPlayerController(playerController as any);
    interaction.setTerrainManager(terrainManager as any);

    interaction.exitHelicopter();

    expect(terrainManager.getEffectiveHeightAt).toHaveBeenCalledWith(13, 20);
    expect(terrainManager.getHeightAt).not.toHaveBeenCalled();
    expect(playerController.exitHelicopter).toHaveBeenCalledWith(
      expect.objectContaining({ x: 13, y: 13.5, z: 20 })
    );
  });

  it('suppresses re-entry prompts briefly after exiting a helicopter', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T00:00:00.000Z'));

    try {
      const helicopter = new THREE.Group();
      helicopter.position.set(10, 5, 20);
      const interaction = new HelicopterInteraction(
        new Map([['heli_test', helicopter]]),
        6,
      );

      let inHelicopter = true;
      const playerPosition = new THREE.Vector3(13, 5, 20);
      const playerController = {
        isInHelicopter: vi.fn(() => inHelicopter),
        getHelicopterId: vi.fn(() => 'heli_test'),
        getPosition: vi.fn(() => playerPosition),
        exitHelicopter: vi.fn(() => {
          inHelicopter = false;
        }),
        enterHelicopter: vi.fn(),
      };
      const hudSystem = {
        setInteractionContext: vi.fn(),
      };
      const terrainManager = {
        getEffectiveHeightAt: vi.fn(() => 4),
      };

      interaction.setPlayerController(playerController as any);
      interaction.setHUDSystem(hudSystem as any);
      interaction.setTerrainManager(terrainManager as any);

      interaction.exitHelicopter();
      interaction.checkPlayerProximity();

      expect(hudSystem.setInteractionContext).toHaveBeenLastCalledWith(null);
      expect(playerController.enterHelicopter).not.toHaveBeenCalled();

      interaction.tryEnterHelicopter();
      expect(playerController.enterHelicopter).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1001);
      interaction.checkPlayerProximity();

      expect(hudSystem.setInteractionContext).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: 'vehicle-enter',
          targetId: 'heli_test',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
