// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CombatantCombatEffects } from './CombatantCombatEffects';
import { createTestCombatant } from '../../test-utils';
import { NPC_MUZZLE_Y_OFFSET, NPC_Y_OFFSET } from '../../config/CombatantConfig';

function makeEffects() {
  const tracerStarts: THREE.Vector3[] = [];
  const tracerEnds: THREE.Vector3[] = [];
  const muzzlePositions: THREE.Vector3[] = [];
  const impactPositions: THREE.Vector3[] = [];
  const impactNormals: THREE.Vector3[] = [];
  const nearMissPoints: THREE.Vector3[] = [];

  const tracerPool = {
    spawn: vi.fn((start: THREE.Vector3, end: THREE.Vector3) => {
      tracerStarts.push(start.clone());
      tracerEnds.push(end.clone());
    }),
  };
  const muzzleFlashSystem = {
    spawnNPC: vi.fn((position: THREE.Vector3) => {
      muzzlePositions.push(position.clone());
    }),
  };
  const impactEffectsPool = {
    spawn: vi.fn((position: THREE.Vector3, normal: THREE.Vector3) => {
      impactPositions.push(position.clone());
      impactNormals.push(normal.clone());
    }),
  };
  const damage = {
    applyDamage: vi.fn(),
  };
  const suppression = {
    trackNearMisses: vi.fn((_shotRay: THREE.Ray, hitPoint: THREE.Vector3) => {
      nearMissPoints.push(hitPoint.clone());
    }),
  };

  const effects = new CombatantCombatEffects(
    tracerPool as any,
    muzzleFlashSystem as any,
    impactEffectsPool as any,
    damage as any,
    suppression as any
  );

  return {
    effects,
    tracerPool,
    muzzleFlashSystem,
    impactEffectsPool,
    damage,
    suppression,
    tracerStarts,
    tracerEnds,
    muzzlePositions,
    impactPositions,
    impactNormals,
    nearMissPoints,
  };
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

  it('uses the same visible miss endpoint for tracer and near-miss suppression', () => {
    const { effects, tracerEnds, nearMissPoints, suppression } = makeEffects();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
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

      expect(suppression.trackNearMisses).toHaveBeenCalled();
      expect(tracerEnds[0].x).toBeCloseTo(100, 5);
      expect(nearMissPoints[0].x).toBeCloseTo(tracerEnds[0].x, 5);
      expect(nearMissPoints[0].y).toBeCloseTo(tracerEnds[0].y, 5);
      expect(nearMissPoints[0].z).toBeCloseTo(tracerEnds[0].z, 5);
    } finally {
      random.mockRestore();
    }
  });

  it('spawns hit impacts with the negated shot direction', () => {
    const { effects, impactEffectsPool, impactPositions, impactNormals } = makeEffects();
    const combatant = createTestCombatant({
      position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
    });
    const shotRay = new THREE.Ray(
      new THREE.Vector3(0, NPC_Y_OFFSET + NPC_MUZZLE_Y_OFFSET, 0),
      new THREE.Vector3(1, 0, 0)
    );
    const hitPoint = new THREE.Vector3(20, NPC_Y_OFFSET, 0);

    effects.spawnCombatEffects(
      combatant,
      shotRay,
      { point: hitPoint, distance: 20, headshot: false },
      new THREE.Vector3(10, NPC_Y_OFFSET, 0),
      new Map(),
      new Map()
    );

    expect(impactEffectsPool.spawn).toHaveBeenCalled();
    expect(impactPositions[0].x).toBeCloseTo(hitPoint.x, 5);
    expect(impactNormals[0].x).toBeCloseTo(-1, 5);
    expect(impactNormals[0].y).toBeCloseTo(0, 5);
    expect(impactNormals[0].z).toBeCloseTo(0, 5);
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

  it('keeps local shot effects inside the 200m presentation radius', () => {
    const { effects, tracerPool, muzzleFlashSystem } = makeEffects();
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
      new THREE.Vector3(199.9, NPC_Y_OFFSET, 0),
      new Map(),
      new Map()
    );

    expect(tracerPool.spawn).toHaveBeenCalledTimes(1);
    expect(muzzleFlashSystem.spawnNPC).toHaveBeenCalledTimes(1);
  });

  it('does not spawn local shot effects at the 200m boundary but still applies combatant damage', () => {
    const { effects, tracerPool, muzzleFlashSystem, impactEffectsPool, damage } = makeEffects();
    const combatant = createTestCombatant({
      position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
    });
    combatant.gunCore = {
      ...combatant.gunCore,
      computeDamage: vi.fn(() => 33),
    } as typeof combatant.gunCore;
    const target = createTestCombatant({
      position: new THREE.Vector3(40, NPC_Y_OFFSET, 0),
    });
    const shotRay = new THREE.Ray(
      new THREE.Vector3(0, NPC_Y_OFFSET + NPC_MUZZLE_Y_OFFSET, 0),
      new THREE.Vector3(1, 0, 0)
    );
    const hitPoint = new THREE.Vector3(40, NPC_Y_OFFSET, 0);

    effects.spawnCombatEffects(
      combatant,
      shotRay,
      { combatant: target, point: hitPoint, distance: 40, headshot: false },
      new THREE.Vector3(200, NPC_Y_OFFSET, 0),
      new Map([[target.id, target]]),
      new Map()
    );

    expect(tracerPool.spawn).not.toHaveBeenCalled();
    expect(muzzleFlashSystem.spawnNPC).not.toHaveBeenCalled();
    expect(impactEffectsPool.spawn).not.toHaveBeenCalled();
    expect(damage.applyDamage).toHaveBeenCalledTimes(1);
  });

  it('does not spawn suppressive fire effects at the 200m boundary', () => {
    const { effects, tracerPool, muzzleFlashSystem, impactEffectsPool } = makeEffects();
    const combatant = createTestCombatant({
      position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
    });
    const shotRay = new THREE.Ray(
      new THREE.Vector3(0, NPC_Y_OFFSET + NPC_MUZZLE_Y_OFFSET, 0),
      new THREE.Vector3(1, 0, 0)
    );

    effects.spawnSuppressiveFireEffects(combatant, shotRay, new THREE.Vector3(200, NPC_Y_OFFSET, 0));

    expect(tracerPool.spawn).not.toHaveBeenCalled();
    expect(muzzleFlashSystem.spawnNPC).not.toHaveBeenCalled();
    expect(impactEffectsPool.spawn).not.toHaveBeenCalled();
  });
});
