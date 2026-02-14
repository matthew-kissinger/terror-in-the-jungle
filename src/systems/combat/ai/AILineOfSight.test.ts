import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { AILineOfSight } from './AILineOfSight';
import { resetRaycastBudget } from './RaycastBudget';

function makeCombatant(id: string, x: number, z: number): any {
  return {
    id,
    position: new THREE.Vector3(x, 0, z),
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
    const chunkManager = {
      getHeightAt: vi.fn(() => 10),
      raycastTerrain: vi.fn(() => ({ hit: false }))
    } as any;
    los.setChunkManager(chunkManager);

    const source = makeCombatant('a', 0, 0);
    const target = makeCombatant('b', 80, 0);
    const visible = los.canSeeTarget(source, target, new THREE.Vector3());

    expect(visible).toBe(false);
    expect(chunkManager.raycastTerrain).not.toHaveBeenCalled();
    const stats = AILineOfSight.getCacheStats();
    expect(stats.prefilterRejects).toBeGreaterThan(0);
  });

  it('passes heightfield and falls back to terrain raycast', () => {
    const los = new AILineOfSight();
    const chunkManager = {
      getHeightAt: vi.fn(() => -2),
      raycastTerrain: vi.fn(() => ({ hit: false }))
    } as any;
    los.setChunkManager(chunkManager);

    const source = makeCombatant('a', 0, 0);
    const target = makeCombatant('b', 80, 0);
    const visible = los.canSeeTarget(source, target, new THREE.Vector3());

    expect(visible).toBe(true);
    expect(chunkManager.raycastTerrain).toHaveBeenCalled();
    const stats = AILineOfSight.getCacheStats();
    expect(stats.prefilterPasses).toBeGreaterThan(0);
  });
});
