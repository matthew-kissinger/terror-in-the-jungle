import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AIStateMovement } from './AIStateMovement';
import { Combatant, CombatantState, Faction } from '../types';

function createCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'combatant-1',
    faction: Faction.US,
    state: CombatantState.SEEKING_COVER,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(),
    rotation: 0,
    health: 100,
    maxHealth: 100,
    isAlive: true,
    morale: 1,
    suppression: 0,
    panicLevel: 0,
    accuracy: 0.5,
    fireRate: 1,
    lastShotTime: 0,
    inCover: false,
    coverPosition: new THREE.Vector3(10, 0, 0),
    destinationPoint: new THREE.Vector3(10, 0, 0),
    ...overrides,
  };
}

describe('AIStateMovement', () => {
  const playerPosition = new THREE.Vector3(100, 0, 0);
  const allCombatants = new Map<string, Combatant>();

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('handleSeekingCover', () => {
    it('reuses a recent visible seeking-cover LOS result inside the cadence window', () => {
      vi.useFakeTimers();
      vi.setSystemTime(10_000);

      const movement = new AIStateMovement();
      const target = createCombatant({
        id: 'target-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(30, 0, 0),
        state: CombatantState.ENGAGING,
      });
      const combatant = createCombatant({ target });
      const canSeeTarget = vi.fn().mockReturnValue(true);

      movement.handleSeekingCover(combatant, 0.016, playerPosition, allCombatants, canSeeTarget);
      expect(canSeeTarget).toHaveBeenCalledTimes(1);
      expect(combatant.state).toBe(CombatantState.SEEKING_COVER);

      canSeeTarget.mockClear();
      canSeeTarget.mockReturnValue(false);
      vi.setSystemTime(10_100);

      movement.handleSeekingCover(combatant, 0.016, playerPosition, allCombatants, canSeeTarget);

      expect(canSeeTarget).not.toHaveBeenCalled();
      expect(combatant.state).toBe(CombatantState.SEEKING_COVER);
      expect(combatant.destinationPoint).toBeDefined();
    });

    it('rechecks seeking-cover LOS after the cadence window expires', () => {
      vi.useFakeTimers();
      vi.setSystemTime(20_000);

      const movement = new AIStateMovement();
      const target = createCombatant({
        id: 'target-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(30, 0, 0),
        state: CombatantState.ENGAGING,
      });
      const combatant = createCombatant({ target });
      const canSeeTarget = vi.fn().mockReturnValue(true);

      movement.handleSeekingCover(combatant, 0.016, playerPosition, allCombatants, canSeeTarget);

      canSeeTarget.mockClear();
      canSeeTarget.mockReturnValue(false);
      vi.setSystemTime(20_251);

      movement.handleSeekingCover(combatant, 0.016, playerPosition, allCombatants, canSeeTarget);

      expect(canSeeTarget).toHaveBeenCalledTimes(1);
      expect(combatant.state).toBe(CombatantState.ENGAGING);
      expect(combatant.destinationPoint).toBeUndefined();
      expect(combatant.inCover).toBe(false);
    });

    it('returns to engagement when cover data is missing', () => {
      const movement = new AIStateMovement();
      const combatant = createCombatant({ coverPosition: undefined });
      const canSeeTarget = vi.fn();

      movement.handleSeekingCover(combatant, 0.016, playerPosition, allCombatants, canSeeTarget);

      expect(combatant.state).toBe(CombatantState.ENGAGING);
      expect(combatant.inCover).toBe(false);
      expect(canSeeTarget).not.toHaveBeenCalled();
    });
  });
});
