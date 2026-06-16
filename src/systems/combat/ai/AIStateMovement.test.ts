// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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

  describe('handleAdvancing', () => {
    it('keeps the 3m destination boundary strict without exact distance checks', () => {
      const movement = new AIStateMovement();
      const combatant = createCombatant({
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, 0, 0),
        destinationPoint: new THREE.Vector3(3, 0, 0),
      });
      const exactDistanceSpy = vi.spyOn(combatant.position, 'distanceTo');
      const findNearestEnemy = vi.fn(() => null);
      const canSeeTarget = vi.fn(() => true);

      movement.handleAdvancing(
        combatant,
        0.016,
        playerPosition,
        allCombatants,
        undefined,
        findNearestEnemy,
        canSeeTarget
      );

      expect(combatant.state).toBe(CombatantState.ADVANCING);
      expect(combatant.destinationPoint).toBeDefined();
      expect(exactDistanceSpy).not.toHaveBeenCalled();
    });

    it('arrives just inside the 3m destination radius without exact distance checks', () => {
      const movement = new AIStateMovement();
      const combatant = createCombatant({
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, 0, 0),
        destinationPoint: new THREE.Vector3(2.9, 0, 0),
      });
      const exactDistanceSpy = vi.spyOn(combatant.position, 'distanceTo');
      const findNearestEnemy = vi.fn(() => null);
      const canSeeTarget = vi.fn(() => true);

      movement.handleAdvancing(
        combatant,
        0.016,
        playerPosition,
        allCombatants,
        undefined,
        findNearestEnemy,
        canSeeTarget
      );

      expect(combatant.state).toBe(CombatantState.ENGAGING);
      expect(combatant.destinationPoint).toBeUndefined();
      expect(exactDistanceSpy).not.toHaveBeenCalled();
    });

    it('keeps the 30m enemy reaction boundary strict without exact distance checks', () => {
      const movement = new AIStateMovement();
      const enemy = createCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(30, 0, 0),
      });
      const combatant = createCombatant({
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, 0, 0),
        destinationPoint: new THREE.Vector3(100, 0, 0),
      });
      const exactDistanceSpy = vi.spyOn(combatant.position, 'distanceTo');
      const findNearestEnemy = vi.fn(() => enemy);
      const canSeeTarget = vi.fn(() => true);

      movement.handleAdvancing(
        combatant,
        0.016,
        playerPosition,
        allCombatants,
        undefined,
        findNearestEnemy,
        canSeeTarget
      );

      expect(combatant.state).toBe(CombatantState.ADVANCING);
      expect(canSeeTarget).not.toHaveBeenCalled();
      expect(exactDistanceSpy).not.toHaveBeenCalled();
    });

    it('very close enemies force engagement without LOS using squared distance', () => {
      const movement = new AIStateMovement();
      const enemy = createCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(14.9, 0, 0),
      });
      const combatant = createCombatant({
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, 0, 0),
        destinationPoint: new THREE.Vector3(100, 0, 0),
      });
      const exactDistanceSpy = vi.spyOn(combatant.position, 'distanceTo');
      const findNearestEnemy = vi.fn(() => enemy);
      const canSeeTarget = vi.fn(() => false);

      movement.handleAdvancing(
        combatant,
        0.016,
        playerPosition,
        allCombatants,
        undefined,
        findNearestEnemy,
        canSeeTarget
      );

      expect(combatant.state).toBe(CombatantState.ENGAGING);
      expect(combatant.target).toBe(enemy);
      expect(canSeeTarget).not.toHaveBeenCalled();
      expect(exactDistanceSpy).not.toHaveBeenCalled();
    });
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

    it('keeps the 1.5m cover-arrival boundary strict without exact distance checks', () => {
      const movement = new AIStateMovement();
      const target = createCombatant({
        id: 'target-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(30, 0, 0),
        state: CombatantState.ENGAGING,
      });
      const combatant = createCombatant({
        target,
        position: new THREE.Vector3(0, 0, 0),
        coverPosition: new THREE.Vector3(1.5, 0, 0),
        destinationPoint: new THREE.Vector3(1.5, 0, 0),
      });
      const exactDistanceSpy = vi.spyOn(combatant.position, 'distanceTo');
      const canSeeTarget = vi.fn(() => true);

      movement.handleSeekingCover(combatant, 0.016, playerPosition, allCombatants, canSeeTarget);

      expect(combatant.inCover).toBe(false);
      expect(combatant.state).toBe(CombatantState.SEEKING_COVER);
      expect(exactDistanceSpy).not.toHaveBeenCalled();
    });

    it('marks cover reached just inside 1.5m without exact distance checks', () => {
      const movement = new AIStateMovement();
      const target = createCombatant({
        id: 'target-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(30, 0, 0),
        state: CombatantState.ENGAGING,
      });
      const combatant = createCombatant({
        target,
        position: new THREE.Vector3(0, 0, 0),
        coverPosition: new THREE.Vector3(1.49, 0, 0),
        destinationPoint: new THREE.Vector3(1.49, 0, 0),
      });
      const exactDistanceSpy = vi.spyOn(combatant.position, 'distanceTo');
      const canSeeTarget = vi.fn(() => true);

      movement.handleSeekingCover(combatant, 0.016, playerPosition, allCombatants, canSeeTarget);

      expect(combatant.inCover).toBe(true);
      expect(combatant.state).toBe(CombatantState.ENGAGING);
      expect(exactDistanceSpy).not.toHaveBeenCalled();
    });
  });
});
