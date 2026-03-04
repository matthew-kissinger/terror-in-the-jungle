import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { AITargetAcquisition } from './AITargetAcquisition';
import { Combatant, CombatantState, Faction } from '../types';

function createCombatant(
  id: string,
  faction: Faction,
  position: THREE.Vector3
): Combatant {
  return {
    id,
    faction,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    state: CombatantState.PATROLLING,
    health: 100,
    maxHealth: 100,
    skillProfile: {
      visualRange: 100,
      reactionDelayMs: 100
    },
    kills: 0,
    deaths: 0
  } as Combatant;
}

describe('AITargetAcquisition', () => {
  let acquisition: AITargetAcquisition;
  let combatant: Combatant;
  let ally: Combatant;
  let enemy: Combatant;
  let allCombatants: Map<string, Combatant>;
  let spatialGrid: { queryRadius: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    acquisition = new AITargetAcquisition();
    combatant = createCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
    ally = createCombatant('ally', Faction.US, new THREE.Vector3(10, 0, 0));
    enemy = createCombatant('enemy', Faction.NVA, new THREE.Vector3(20, 0, 0));
    allCombatants = new Map([
      [combatant.id, combatant],
      [ally.id, ally],
      [enemy.id, enemy]
    ]);
    spatialGrid = {
      queryRadius: vi.fn(() => [combatant.id, ally.id, enemy.id])
    };
  });

  it('reuses the widest cached spatial query for smaller same-frame checks', () => {
    acquisition.beginFrame();

    const target = acquisition.findNearestEnemy(
      combatant,
      new THREE.Vector3(200, 0, 0),
      allCombatants,
      spatialGrid as any
    );
    const nearbyEnemies = acquisition.countNearbyEnemies(
      combatant,
      40,
      new THREE.Vector3(200, 0, 0),
      allCombatants,
      spatialGrid as any
    );
    const clusterDensity = acquisition.getClusterDensity(
      combatant,
      allCombatants,
      spatialGrid as any
    );

    expect(target).toBe(enemy);
    expect(nearbyEnemies).toBe(1);
    expect(clusterDensity).toBeCloseTo(0.1);
    expect(spatialGrid.queryRadius).toHaveBeenCalledTimes(1);
    expect(spatialGrid.queryRadius).toHaveBeenCalledWith(combatant.position, 100);
  });

  it('refreshes the cache when a later call needs a wider radius', () => {
    acquisition.beginFrame();

    acquisition.countNearbyEnemies(
      combatant,
      20,
      new THREE.Vector3(200, 0, 0),
      allCombatants,
      spatialGrid as any
    );
    acquisition.findNearestEnemy(
      combatant,
      new THREE.Vector3(200, 0, 0),
      allCombatants,
      spatialGrid as any
    );

    expect(spatialGrid.queryRadius).toHaveBeenCalledTimes(2);
    expect(spatialGrid.queryRadius.mock.calls[0]?.[1]).toBe(20);
    expect(spatialGrid.queryRadius.mock.calls[1]?.[1]).toBe(100);
  });
});
