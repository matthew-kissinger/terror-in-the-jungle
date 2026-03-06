import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { HelicopterInteraction } from './HelicopterInteraction';

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
});
