import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { AILineOfSight } from './AILineOfSight';
import { resetRaycastBudget } from './RaycastBudget';
import { NPC_Y_OFFSET } from '../../../config/CombatantConfig';

function makeCombatant(id: string, x: number, z: number): any {
  return {
    id,
    position: new THREE.Vector3(x, NPC_Y_OFFSET, z),
    rotation: 0,
    lodLevel: 'high',
    skillProfile: {
      visualRange: 400,
      fieldOfView: 180
    }
  };
}

describe('AILineOfSight heightfield prefilter', () => {
  const oldPrefilterFlag = (globalThis as any).__LOS_HEIGHTFIELD_PREFILTER__;

  beforeEach(() => {
    AILineOfSight.resetStats();
    resetRaycastBudget();
    (globalThis as any).__LOS_HEIGHTFIELD_PREFILTER__ = true;
  });

  afterEach(() => {
    (globalThis as any).__LOS_HEIGHTFIELD_PREFILTER__ = oldPrefilterFlag;
  });

  it('rejects blocked LOS by heightfield without terrain raycast', () => {
    const los = new AILineOfSight();
    const terrainSystem = {
      getEffectiveHeightAt: vi.fn(() => 10),
      raycastTerrain: vi.fn(() => ({ hit: false }))
    } as any;
    los.setTerrainSystem(terrainSystem);

    const source = makeCombatant('a', 0, 0);
    const target = makeCombatant('b', 80, 0);
    const visible = los.canSeeTarget(source, target, new THREE.Vector3());

    expect(visible).toBe(false);
    expect(terrainSystem.raycastTerrain).not.toHaveBeenCalled();
    const stats = AILineOfSight.getCacheStats();
    expect(stats.prefilterRejects).toBeGreaterThan(0);
  });

  it('passes heightfield and falls back to terrain raycast', () => {
    const los = new AILineOfSight();
    const terrainSystem = {
      getEffectiveHeightAt: vi.fn(() => -2),
      raycastTerrain: vi.fn(() => ({ hit: false }))
    } as any;
    los.setTerrainSystem(terrainSystem);

    const source = makeCombatant('a', 0, 0);
    const target = makeCombatant('b', 80, 0);
    const visible = los.canSeeTarget(source, target, new THREE.Vector3());

    expect(visible).toBe(true);
    expect(terrainSystem.raycastTerrain).toHaveBeenCalled();
    const stats = AILineOfSight.getCacheStats();
    expect(stats.prefilterPasses).toBeGreaterThan(0);
    expect(stats.fullEvaluations).toBe(1);
    expect(stats.terrainRaycasts).toBe(1);
    expect(stats.fullEvaluationClear).toBe(1);
  });

  it('does not double-raise player eye position for full LOS terrain raycasts', () => {
    (globalThis as any).__LOS_HEIGHTFIELD_PREFILTER__ = false;
    const los = new AILineOfSight();
    const terrainSystem = {
      getEffectiveHeightAt: vi.fn(() => -2),
      raycastTerrain: vi.fn(() => ({ hit: false }))
    } as any;
    los.setTerrainSystem(terrainSystem);

    const source = makeCombatant('a', 0, 0);
    const playerPosition = new THREE.Vector3(80, NPC_Y_OFFSET, 0);
    const playerTarget = {
      id: 'PLAYER',
      position: playerPosition,
      velocity: new THREE.Vector3(),
      health: 100,
      state: 'engaging',
      faction: source.faction,
      kind: 'player'
    } as any;

    const visible = los.canSeeTarget(source, playerTarget, playerPosition);

    expect(visible).toBe(true);
    expect(terrainSystem.raycastTerrain).toHaveBeenCalled();
    const [origin, direction] = terrainSystem.raycastTerrain.mock.calls[0];
    expect(origin.y).toBeCloseTo(NPC_Y_OFFSET, 5);
    expect(direction.y).toBeCloseTo(0, 5);
  });
});
