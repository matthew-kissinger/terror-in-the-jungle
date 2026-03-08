import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GameMode } from '../../config/gameModeTypes';
import { compileTerrainFeatures } from './TerrainFeatureCompiler';

describe('compileTerrainFeatures', () => {
  it('compiles helipad terrain, surface, and vegetation outputs', () => {
    const compiled = compileTerrainFeatures({
      id: GameMode.OPEN_FRONTIER,
      name: 'Test Mode',
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
      features: [
        {
          id: 'helipad_main',
          kind: 'helipad',
          position: new THREE.Vector3(10, 0, 20),
          aircraft: 'UH1_HUEY',
          terrain: {
            flatten: true,
            flatRadius: 8,
            blendRadius: 13,
          },
          vegetation: {
            clear: true,
            exclusionRadius: 13,
          },
          surface: {
            kind: 'packed_earth',
            innerRadius: 8,
            outerRadius: 12,
          },
        },
      ],
    });

    expect(compiled.stamps).toHaveLength(1);
    expect(compiled.surfacePatches).toHaveLength(1);
    expect(compiled.vegetationExclusionZones).toHaveLength(1);
    expect(compiled.stamps[0].kind).toBe('flatten_circle');
    expect(compiled.surfacePatches[0].shape).toBe('circle');
    expect(compiled.vegetationExclusionZones[0].radius).toBe(13);
  });
});
