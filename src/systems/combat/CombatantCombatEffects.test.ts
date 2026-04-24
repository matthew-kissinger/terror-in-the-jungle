import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CombatantCombatEffects } from './CombatantCombatEffects';
import { createTestCombatant } from '../../test-utils';
import { NPC_MUZZLE_Y_OFFSET, NPC_Y_OFFSET } from '../../config/CombatantConfig';

function makeEffects() {
  const tracerStarts: THREE.Vector3[] = [];
  const muzzlePositions: THREE.Vector3[] = [];

  const tracerPool = {
    spawn: vi.fn((start: THREE.Vector3) => {
      tracerStarts.push(start.clone());
    }),
  };
  const muzzleFlashSystem = {
    spawnNPC: vi.fn((position: THREE.Vector3) => {
      muzzlePositions.push(position.clone());
    }),
  };
  const impactEffectsPool = {
    spawn: vi.fn(),
  };
  const damage = {
    applyDamage: vi.fn(),
  };
  const suppression = {
    trackNearMisses: vi.fn(),
  };

  const effects = new CombatantCombatEffects(
    tracerPool as any,
    muzzleFlashSystem as any,
    impactEffectsPool as any,
    damage as any,
    suppression as any
  );

  return { effects, tracerPool, muzzleFlashSystem, tracerStarts, muzzlePositions };
}

describe('CombatantCombatEffects actor-height contract', () => {
  it('starts normal tracers at the shot ray origin without adding a second muzzle height', () => {
    const { effects, tracerPool, muzzleFlashSystem, tracerStarts, muzzlePositions } = makeEffects();
    const combatant = createTestCombatant({
      position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
    });
    const shotRay = new THREE.Ray(
      new THREE.Vector3(0, NPC_Y_OFFSET + NPC_MUZZLE_Y_OFFSET, 0),
      new THREE.Vector3(1, 0, 0)
    );

    effects.spawnCombatEffects(
      combatant,
      shotRay,
      null,
      new THREE.Vector3(10, NPC_Y_OFFSET, 0),
      new Map(),
      new Map()
    );

    expect(tracerPool.spawn).toHaveBeenCalled();
    expect(muzzleFlashSystem.spawnNPC).toHaveBeenCalled();
    expect(tracerStarts[0].y).toBeCloseTo(shotRay.origin.y, 5);
    expect(muzzlePositions[0].y).toBeCloseTo(shotRay.origin.y, 5);
  });

  it('starts suppressive tracers at the same shot ray origin', () => {
    const { effects, tracerPool, tracerStarts } = makeEffects();
    const combatant = createTestCombatant({
      position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
    });
    const shotRay = new THREE.Ray(
      new THREE.Vector3(0, NPC_Y_OFFSET + NPC_MUZZLE_Y_OFFSET, 0),
      new THREE.Vector3(1, 0, 0)
    );

    effects.spawnSuppressiveFireEffects(combatant, shotRay, new THREE.Vector3(10, NPC_Y_OFFSET, 0));

    expect(tracerPool.spawn).toHaveBeenCalled();
    expect(tracerStarts[0].y).toBeCloseTo(shotRay.origin.y, 5);
  });
});
