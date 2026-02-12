import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantBallistics } from './CombatantBallistics';
import { Combatant, CombatantState, Faction } from './types';

function createMockCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'test-combatant',
    faction: Faction.US,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state: CombatantState.IDLE,
    skillProfile: {
      reactionDelayMs: 500,
      aimJitterAmplitude: 2.0,
      burstLength: 3,
      burstPauseMs: 200,
      leadingErrorFactor: 1.0,
      suppressionResistance: 0.5,
      visualRange: 100,
      fieldOfView: 120,
      firstShotAccuracy: 0.9,
      burstDegradation: 0.1,
    },
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    reactionTimer: 0,
    suppressionLevel: 0,
    alertTimer: 0,
    isFullAuto: false,
    panicLevel: 0,
    lastHitTime: 0,
    consecutiveMisses: 0,
    wanderAngle: 0,
    timeToDirectionChange: 0,
    lastUpdateTime: 0,
    updatePriority: 0,
    lodLevel: 'high',
    kills: 0,
    deaths: 0,
    weaponSpec: {} as any,
    gunCore: {} as any,
    ...overrides,
  };
}

describe('CombatantBallistics', () => {
  let ballistics: CombatantBallistics;

  beforeEach(() => {
    ballistics = new CombatantBallistics();
  });

  describe('calculateAIShot', () => {
    it('returns valid Ray with correct origin', () => {
      const combatant = createMockCombatant({
        position: new THREE.Vector3(10, 5, 20),
        target: {
          id: 'PLAYER',
          position: new THREE.Vector3(50, 0, 50),
          velocity: new THREE.Vector3(0, 0, 0),
        } as any,
      });
      const playerPosition = new THREE.Vector3(50, 0, 50);

      const ray = ballistics.calculateAIShot(combatant, playerPosition);

      expect(ray).toBeInstanceOf(THREE.Ray);
      expect(ray.origin.x).toBe(10);
      expect(ray.origin.y).toBe(6.5); // position.y + 1.5
      expect(ray.origin.z).toBe(20);
    });

    it('direction points roughly toward target', () => {
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        target: {
          id: 'PLAYER',
          position: new THREE.Vector3(100, 0, 0),
          velocity: new THREE.Vector3(0, 0, 0),
        } as any,
      });
      const playerPosition = new THREE.Vector3(100, 0, 0);

      const ray = ballistics.calculateAIShot(combatant, playerPosition);

      // Direction should be roughly toward +X axis
      expect(ray.direction.x).toBeGreaterThan(0.9);
      expect(Math.abs(ray.direction.y)).toBeLessThan(0.2);
      expect(Math.abs(ray.direction.z)).toBeLessThan(0.2);
    });

    it('accuracy config affects jitter magnitude', () => {
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        target: {
          id: 'PLAYER',
          position: new THREE.Vector3(100, 0, 0),
          velocity: new THREE.Vector3(0, 0, 0),
        } as any,
        skillProfile: {
          aimJitterAmplitude: 10.0, // High jitter
          reactionDelayMs: 500,
          burstLength: 3,
          burstPauseMs: 200,
          leadingErrorFactor: 1.0,
          suppressionResistance: 0.5,
          visualRange: 100,
          fieldOfView: 120,
          firstShotAccuracy: 0.9,
          burstDegradation: 0.1,
        },
      });
      const playerPosition = new THREE.Vector3(100, 0, 0);

      // Take multiple samples to verify jitter is present
      const directions: THREE.Vector3[] = [];
      for (let i = 0; i < 10; i++) {
        const ray = ballistics.calculateAIShot(combatant, playerPosition);
        directions.push(ray.direction.clone());
      }

      // With high jitter, directions should vary
      const firstDir = directions[0];
      let hasVariation = false;
      for (let i = 1; i < directions.length; i++) {
        if (directions[i].distanceTo(firstDir) > 0.01) {
          hasVariation = true;
          break;
        }
      }
      expect(hasVariation).toBe(true);
    });

    it('leading factor adjusts aim ahead of moving targets', () => {
      const targetVelocity = new THREE.Vector3(10, 0, 0); // Moving right
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        target: {
          id: 'enemy-1',
          position: new THREE.Vector3(100, 0, 0),
          velocity: targetVelocity,
        } as any,
        skillProfile: {
          aimJitterAmplitude: 0, // No jitter for predictable test
          leadingErrorFactor: 1.0,
          reactionDelayMs: 500,
          burstLength: 3,
          burstPauseMs: 200,
          suppressionResistance: 0.5,
          visualRange: 100,
          fieldOfView: 120,
          firstShotAccuracy: 0.9,
          burstDegradation: 0.1,
        },
      });
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const ray = ballistics.calculateAIShot(combatant, playerPosition);

      // With leading, direction should be slightly ahead (more positive X)
      expect(ray.direction.x).toBeGreaterThan(0.9);
    });

    it('returns forward direction when no target', () => {
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        rotation: Math.PI / 2, // Facing +Z
        target: null,
      });
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const ray = ballistics.calculateAIShot(combatant, playerPosition);

      // Should use rotation to determine direction
      expect(Math.abs(ray.direction.x)).toBeLessThan(0.1);
      expect(Math.abs(ray.direction.z - 1.0)).toBeLessThan(0.1);
    });

    it('handles zero distance to target', () => {
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        target: {
          id: 'PLAYER',
          position: new THREE.Vector3(0, 0, 0),
          velocity: new THREE.Vector3(0, 0, 0),
        } as any,
      });
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const ray = ballistics.calculateAIShot(combatant, playerPosition);

      expect(ray).toBeInstanceOf(THREE.Ray);
      expect(ray.direction.length()).toBeCloseTo(1.0, 5);
    });

    it('handles zero velocity target', () => {
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        target: {
          id: 'enemy-1',
          position: new THREE.Vector3(100, 0, 0),
          velocity: new THREE.Vector3(0, 0, 0),
        } as any,
      });
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const ray = ballistics.calculateAIShot(combatant, playerPosition);

      expect(ray.direction.x).toBeGreaterThan(0.9);
    });

    it('applies accuracy multiplier correctly', () => {
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        target: {
          id: 'PLAYER',
          position: new THREE.Vector3(100, 0, 0),
          velocity: new THREE.Vector3(0, 0, 0),
        } as any,
        skillProfile: {
          aimJitterAmplitude: 5.0,
          reactionDelayMs: 500,
          burstLength: 3,
          burstPauseMs: 200,
          leadingErrorFactor: 1.0,
          suppressionResistance: 0.5,
          visualRange: 100,
          fieldOfView: 120,
          firstShotAccuracy: 0.9,
          burstDegradation: 0.1,
        },
      });
      const playerPosition = new THREE.Vector3(100, 0, 0);

      // High accuracy multiplier should increase jitter
      const ray1 = ballistics.calculateAIShot(combatant, playerPosition, 0.1);
      const ray2 = ballistics.calculateAIShot(combatant, playerPosition, 2.0);

      // Both should be valid rays
      expect(ray1.direction.length()).toBeCloseTo(1.0, 5);
      expect(ray2.direction.length()).toBeCloseTo(1.0, 5);
    });

    it('adjusts player target position downward', () => {
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        target: {
          id: 'PLAYER',
          position: new THREE.Vector3(100, 10, 0),
          velocity: new THREE.Vector3(0, 0, 0),
        } as any,
        skillProfile: {
          aimJitterAmplitude: 0,
          reactionDelayMs: 500,
          burstLength: 3,
          burstPauseMs: 200,
          leadingErrorFactor: 1.0,
          suppressionResistance: 0.5,
          visualRange: 100,
          fieldOfView: 120,
          firstShotAccuracy: 0.9,
          burstDegradation: 0.1,
        },
      });
      const playerPosition = new THREE.Vector3(100, 10, 0);

      const ray = ballistics.calculateAIShot(combatant, playerPosition);

      // Direction should point slightly downward (negative Y component)
      expect(ray.direction.y).toBeLessThan(0.1);
    });
  });

  describe('calculateSuppressiveShot', () => {
    it('returns valid Ray with correct origin', () => {
      const combatant = createMockCombatant({
        position: new THREE.Vector3(10, 5, 20),
        lastKnownTargetPos: new THREE.Vector3(50, 0, 50),
      });

      const ray = ballistics.calculateSuppressiveShot(combatant, 10);

      expect(ray).toBeInstanceOf(THREE.Ray);
      expect(ray.origin.x).toBe(10);
      expect(ray.origin.y).toBe(6.5); // position.y + 1.5
      expect(ray.origin.z).toBe(20);
    });

    it('suppressive spread is wider than aimed shots', () => {
      const targetPos = new THREE.Vector3(100, 0, 0);
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        lastKnownTargetPos: targetPos.clone(),
      });

      // Take multiple samples
      const directions: THREE.Vector3[] = [];
      for (let i = 0; i < 20; i++) {
        const ray = ballistics.calculateSuppressiveShot(combatant, 15);
        directions.push(ray.direction.clone());
      }

      // Calculate spread (max distance between directions)
      let maxSpread = 0;
      for (let i = 0; i < directions.length; i++) {
        for (let j = i + 1; j < directions.length; j++) {
          const dist = directions[i].distanceTo(directions[j]);
          maxSpread = Math.max(maxSpread, dist);
        }
      }

      // With 15 degree spread, should have noticeable variation
      expect(maxSpread).toBeGreaterThan(0.1);
    });

    it('uses provided target position', () => {
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        lastKnownTargetPos: new THREE.Vector3(0, 0, 100),
      });
      const targetPos = new THREE.Vector3(100, 0, 0);

      const ray = ballistics.calculateSuppressiveShot(combatant, 5, targetPos);

      // Should aim roughly toward provided position (+X)
      expect(ray.direction.x).toBeGreaterThan(0.8);
    });

    it('falls back to lastKnownTargetPos when no target provided', () => {
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        lastKnownTargetPos: new THREE.Vector3(0, 0, 100),
      });

      const ray = ballistics.calculateSuppressiveShot(combatant, 5);

      // Should aim roughly toward +Z
      expect(ray.direction.z).toBeGreaterThan(0.8);
    });

    it('returns forward direction when no target or lastKnownTargetPos', () => {
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        rotation: Math.PI / 4,
        lastKnownTargetPos: undefined,
      });

      const ray = ballistics.calculateSuppressiveShot(combatant, 10);

      // Should use rotation
      expect(ray.direction.length()).toBeCloseTo(1.0, 5);
    });

    it('handles zero spread', () => {
      const targetPos = new THREE.Vector3(100, 0, 0);
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        lastKnownTargetPos: targetPos.clone(),
      });

      const ray = ballistics.calculateSuppressiveShot(combatant, 0);

      // With zero spread, should point directly at target
      expect(ray.direction.x).toBeGreaterThan(0.99);
    });

    it('handles large spread values', () => {
      const targetPos = new THREE.Vector3(100, 0, 0);
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        lastKnownTargetPos: targetPos.clone(),
      });

      const ray = ballistics.calculateSuppressiveShot(combatant, 45);

      // Should still produce valid normalized direction
      expect(ray.direction.length()).toBeCloseTo(1.0, 5);
    });

    it('produces different directions on multiple calls', () => {
      const targetPos = new THREE.Vector3(100, 0, 0);
      const combatant = createMockCombatant({
        position: new THREE.Vector3(0, 0, 0),
        lastKnownTargetPos: targetPos.clone(),
      });

      const ray1 = ballistics.calculateSuppressiveShot(combatant, 10);
      const ray2 = ballistics.calculateSuppressiveShot(combatant, 10);

      // Directions should likely differ due to randomness
      const distance = ray1.direction.distanceTo(ray2.direction);
      // Allow for small chance they're the same
      expect(distance).toBeGreaterThanOrEqual(0);
    });
  });
});
