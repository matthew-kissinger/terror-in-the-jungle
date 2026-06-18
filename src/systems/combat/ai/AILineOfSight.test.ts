// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { AILineOfSight } from './AILineOfSight';
import { resetRaycastBudget } from './RaycastBudget';
import {
  NPC_CENTER_MASS_Y_OFFSET,
  NPC_MUZZLE_Y_OFFSET,
  NPC_Y_OFFSET,
  PLAYER_CENTER_MASS_Y_OFFSET,
} from '../../../config/CombatantConfig';

function makeCombatant(id: string, x: number, z: number): any {
  return {
    id,
    position: new THREE.Vector3(x, NPC_Y_OFFSET, z),
    rotation: 0,
    simLane: 'high',
    renderLane: 'culled',
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

  it('rejects targets outside FOV before terrain work', () => {
    const los = new AILineOfSight();
    const terrainSystem = {
      getEffectiveHeightAt: vi.fn(() => -2),
      raycastTerrain: vi.fn(() => ({ hit: false }))
    } as any;
    los.setTerrainSystem(terrainSystem);

    const source = makeCombatant('a', 0, 0);
    source.skillProfile.fieldOfView = 90;
    const target = makeCombatant('b', 0, 80);
    const visible = los.canSeeTarget(source, target, new THREE.Vector3());

    expect(visible).toBe(false);
    expect(terrainSystem.getEffectiveHeightAt).not.toHaveBeenCalled();
    expect(terrainSystem.raycastTerrain).not.toHaveBeenCalled();
  });

  it('keeps targets on the FOV edge eligible for normal LOS evaluation', () => {
    const los = new AILineOfSight();
    const terrainSystem = {
      getEffectiveHeightAt: vi.fn(() => -2),
      raycastTerrain: vi.fn(() => ({ hit: false }))
    } as any;
    los.setTerrainSystem(terrainSystem);

    const source = makeCombatant('a', 0, 0);
    source.skillProfile.fieldOfView = 90;
    const target = makeCombatant('b', 80, 80);
    const visible = los.canSeeTarget(source, target, new THREE.Vector3());

    expect(visible).toBe(true);
    expect(terrainSystem.raycastTerrain).toHaveBeenCalledTimes(1);
  });

  it('blocks LOS with the shared fire-profile fallback when terrain raycast misses a narrow ridge', () => {
    (globalThis as any).__LOS_HEIGHTFIELD_PREFILTER__ = false;
    const los = new AILineOfSight();
    const terrainSystem = {
      getEffectiveHeightAt: vi.fn((x: number) => (x >= 36 && x <= 44 ? NPC_Y_OFFSET + 2 : 0)),
      raycastTerrain: vi.fn(() => ({ hit: false }))
    } as any;
    los.setTerrainSystem(terrainSystem);

    const source = makeCombatant('a', 0, 0);
    const target = makeCombatant('b', 80, 0);
    const visible = los.canSeeTarget(source, target, new THREE.Vector3());

    expect(visible).toBe(false);
    expect(terrainSystem.raycastTerrain).toHaveBeenCalledTimes(1);
    const stats = AILineOfSight.getCacheStats();
    expect(stats.prefilterRejects).toBe(0);
    expect(stats.fullEvaluations).toBe(1);
    expect(stats.fullEvaluationBlocked).toBe(1);
  });

  it('blocks full LOS when terrain intersects the NPC fire-authority segment', () => {
    (globalThis as any).__LOS_HEIGHTFIELD_PREFILTER__ = false;
    const los = new AILineOfSight();
    const terrainSystem = {
      getEffectiveHeightAt: vi.fn(() => -2),
      raycastTerrain: vi.fn((origin: THREE.Vector3) => {
        const usesFireOrigin = Math.abs(origin.y - (NPC_Y_OFFSET + NPC_MUZZLE_Y_OFFSET)) < 0.001;
        return usesFireOrigin ? { hit: true, distance: 10 } : { hit: false };
      })
    } as any;
    los.setTerrainSystem(terrainSystem);

    const source = makeCombatant('a', 0, 0);
    const target = makeCombatant('b', 80, 0);
    const visible = los.canSeeTarget(source, target, new THREE.Vector3());

    expect(visible).toBe(false);
    expect(terrainSystem.raycastTerrain).toHaveBeenCalledTimes(1);
    const [origin, direction] = terrainSystem.raycastTerrain.mock.calls[0];
    const expectedDirection = new THREE.Vector3(
      80,
      NPC_CENTER_MASS_Y_OFFSET - NPC_MUZZLE_Y_OFFSET,
      0,
    ).normalize();
    expect(origin.y).toBeCloseTo(NPC_Y_OFFSET + NPC_MUZZLE_Y_OFFSET, 5);
    expect(direction.y).toBeCloseTo(expectedDirection.y, 5);
  });

  it('serves a repeated check from cache without re-running the full evaluation', () => {
    (globalThis as any).__LOS_HEIGHTFIELD_PREFILTER__ = false;
    const los = new AILineOfSight();
    const terrainSystem = {
      getEffectiveHeightAt: vi.fn(() => -2),
      raycastTerrain: vi.fn(() => ({ hit: false }))
    } as any;
    los.setTerrainSystem(terrainSystem);

    const source = makeCombatant('a', 0, 0);
    const target = makeCombatant('b', 80, 0);

    const first = los.canSeeTarget(source, target, new THREE.Vector3());
    const second = los.canSeeTarget(source, target, new THREE.Vector3());

    // Same observable result both times...
    expect(first).toBe(true);
    expect(second).toBe(true);
    // ...but the expensive raycast ran only once - the second check hit the cache.
    expect(terrainSystem.raycastTerrain).toHaveBeenCalledTimes(1);
    const stats = AILineOfSight.getCacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('caches each combatant pair independently', () => {
    (globalThis as any).__LOS_HEIGHTFIELD_PREFILTER__ = false;
    const los = new AILineOfSight();
    const terrainSystem = {
      getEffectiveHeightAt: vi.fn(() => -2),
      raycastTerrain: vi.fn(() => ({ hit: false }))
    } as any;
    los.setTerrainSystem(terrainSystem);

    const source = makeCombatant('a', 0, 0);
    const targetB = makeCombatant('b', 80, 0);
    const targetC = makeCombatant('c', 0, 80);

    // Two distinct targets for the same attacker => two distinct cache entries.
    los.canSeeTarget(source, targetB, new THREE.Vector3());
    los.canSeeTarget(source, targetC, new THREE.Vector3());
    // Repeats of each pair are served from cache.
    los.canSeeTarget(source, targetB, new THREE.Vector3());
    los.canSeeTarget(source, targetC, new THREE.Vector3());

    expect(terrainSystem.raycastTerrain).toHaveBeenCalledTimes(2);
    const stats = AILineOfSight.getCacheStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
  });

  it('prunes stale large-cache entries incrementally', () => {
    (globalThis as any).__LOS_HEIGHTFIELD_PREFILTER__ = false;
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const los = new AILineOfSight();
    const debugLos = los as unknown as { losCacheSize: number };
    const source = makeCombatant('a', 0, 0);
    const playerPosition = new THREE.Vector3();

    for (let i = 0; i < 300; i++) {
      los.canSeeTarget(source, makeCombatant(`target-${i}`, 80, 0), playerPosition);
    }
    expect(debugLos.losCacheSize).toBe(300);

    nowSpy.mockReturnValue(1000);
    los.clearCache();
    expect(debugLos.losCacheSize).toBe(236);

    los.clearCache();
    expect(debugLos.losCacheSize).toBe(200);

    nowSpy.mockRestore();
  });

  it('uses player center mass rather than double-raising player eye position for terrain raycasts', () => {
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
    const expectedDirection = new THREE.Vector3(
      80,
      PLAYER_CENTER_MASS_Y_OFFSET - NPC_MUZZLE_Y_OFFSET,
      0,
    ).normalize();
    expect(origin.y).toBeCloseTo(NPC_Y_OFFSET + NPC_MUZZLE_Y_OFFSET, 5);
    expect(direction.y).toBeCloseTo(expectedDirection.y, 5);
  });
});
