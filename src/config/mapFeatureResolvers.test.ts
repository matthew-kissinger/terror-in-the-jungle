import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GameMode } from './gameModeTypes';
import { getConfiguredHelipads } from './mapFeatureResolvers';

describe('getConfiguredHelipads', () => {
  it('prefers feature-backed helipads and marks prepared terrain explicitly', () => {
    const helipads = getConfiguredHelipads({
      id: GameMode.OPEN_FRONTIER,
      name: 'Test',
      description: 'test',
      worldSize: 1000,
      chunkRenderDistance: 4,
      maxTickets: 100,
      matchDuration: 60,
      deathPenalty: 1,
      playerCanSpawnAtZones: true,
      respawnTime: 5,
      spawnProtectionDuration: 2,
      maxCombatants: 20,
      squadSize: { min: 4, max: 6 },
      reinforcementInterval: 30,
      zones: [],
      captureRadius: 25,
      captureSpeed: 5,
      minimapScale: 400,
      viewDistance: 200,
      helipads: [
        { id: 'legacy', position: new THREE.Vector3(1, 0, 1), aircraft: 'UH1_HUEY' },
      ],
      features: [
        {
          id: 'feature_helipad',
          kind: 'helipad',
          position: new THREE.Vector3(10, 0, 20),
          aircraft: 'UH1C_GUNSHIP',
          terrain: { flatten: true },
        },
      ],
    });

    expect(helipads).toHaveLength(1);
    expect(helipads[0].id).toBe('feature_helipad');
    expect(helipads[0].preparedTerrain).toBe(true);
  });

  it('falls back to legacy helipads when no helipad features exist', () => {
    const helipads = getConfiguredHelipads({
      id: GameMode.OPEN_FRONTIER,
      name: 'Test',
      description: 'test',
      worldSize: 1000,
      chunkRenderDistance: 4,
      maxTickets: 100,
      matchDuration: 60,
      deathPenalty: 1,
      playerCanSpawnAtZones: true,
      respawnTime: 5,
      spawnProtectionDuration: 2,
      maxCombatants: 20,
      squadSize: { min: 4, max: 6 },
      reinforcementInterval: 30,
      zones: [],
      captureRadius: 25,
      captureSpeed: 5,
      minimapScale: 400,
      viewDistance: 200,
      helipads: [
        { id: 'legacy', position: new THREE.Vector3(1, 0, 1), aircraft: 'UH1_HUEY' },
      ],
    });

    expect(helipads).toHaveLength(1);
    expect(helipads[0].id).toBe('legacy');
    expect(helipads[0].preparedTerrain).toBe(false);
  });
});
