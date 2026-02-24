import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantSuppression } from './CombatantSuppression';
import { Combatant, CombatantState, Faction } from './types';
import { PlayerSuppressionSystem } from '../player/PlayerSuppressionSystem';
import { AudioManager } from '../audio/AudioManager';

// Mock spatialGridManager
vi.mock('./SpatialGridManager', () => ({
  spatialGridManager: {
    getIsInitialized: vi.fn(() => true),
    queryRadius: vi.fn(() => []),
  },
}));

import { spatialGridManager } from './SpatialGridManager';

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
    nearMissCount: 0,
    ...overrides,
  };
}

describe('CombatantSuppression', () => {
  let suppression: CombatantSuppression;
  let mockPlayerSuppressionSystem: PlayerSuppressionSystem;
  let mockAudioManager: AudioManager;

  beforeEach(() => {
    suppression = new CombatantSuppression();
    
    mockPlayerSuppressionSystem = {
      registerNearMiss: vi.fn(),
    } as any;

    mockAudioManager = {
      playBulletWhizSound: vi.fn(),
    } as any;

    vi.clearAllMocks();
  });

  describe('trackNearMisses', () => {
    it('increases combatant suppression level on near miss', () => {
      const combatant = createMockCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(2, 0, 0),
        suppressionLevel: 0,
      });

      const allCombatants = new Map([['enemy-1', combatant]]);
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue(['enemy-1']);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants);

      expect(combatant.suppressionLevel).toBeGreaterThan(0);
      expect(combatant.nearMissCount).toBe(1);
    });

    it('does not suppress dead combatants', () => {
      const combatant = createMockCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(2, 0, 0),
        state: CombatantState.DEAD,
        suppressionLevel: 0,
      });

      const allCombatants = new Map([['enemy-1', combatant]]);
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue(['enemy-1']);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants);

      expect(combatant.suppressionLevel).toBe(0);
      expect(combatant.nearMissCount).toBe(0);
    });

    it('does not suppress same-faction combatants', () => {
      const combatant = createMockCombatant({
        id: 'friendly-1',
        faction: Faction.US,
        position: new THREE.Vector3(2, 0, 0),
        suppressionLevel: 0,
      });

      const allCombatants = new Map([['friendly-1', combatant]]);
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue(['friendly-1']);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants);

      expect(combatant.suppressionLevel).toBe(0);
      expect(combatant.nearMissCount).toBe(0);
    });

    it('calls player suppression system when player is near miss', () => {
      suppression.setPlayerSuppressionSystem(mockPlayerSuppressionSystem);

      const allCombatants = new Map();
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);
      const playerPosition = new THREE.Vector3(2, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue([]);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.NVA, allCombatants, playerPosition);

      expect(mockPlayerSuppressionSystem.registerNearMiss).toHaveBeenCalledWith(hitPoint, playerPosition);
    });

    it('does not call player suppression for friendly fire', () => {
      suppression.setPlayerSuppressionSystem(mockPlayerSuppressionSystem);

      const allCombatants = new Map();
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);
      const playerPosition = new THREE.Vector3(2, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue([]);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants, playerPosition);

      expect(mockPlayerSuppressionSystem.registerNearMiss).not.toHaveBeenCalled();
    });

    it('plays whiz sound for very close player misses', () => {
      suppression.setPlayerSuppressionSystem(mockPlayerSuppressionSystem);
      suppression.setAudioManager(mockAudioManager);

      const allCombatants = new Map();
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);
      const playerPosition = new THREE.Vector3(1, 0, 0); // 1 unit away

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue([]);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.NVA, allCombatants, playerPosition);

      expect(mockAudioManager.playBulletWhizSound).toHaveBeenCalledWith(hitPoint, playerPosition);
    });

    it('does not play whiz sound for distant player misses', () => {
      suppression.setPlayerSuppressionSystem(mockPlayerSuppressionSystem);
      suppression.setAudioManager(mockAudioManager);

      const allCombatants = new Map();
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);
      const playerPosition = new THREE.Vector3(10, 0, 0); // 10 units away

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue([]);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.NVA, allCombatants, playerPosition);

      expect(mockAudioManager.playBulletWhizSound).not.toHaveBeenCalled();
    });

    it('uses spatial grid query for efficient lookups', () => {
      const combatant = createMockCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(2, 0, 0),
      });

      const allCombatants = new Map([['enemy-1', combatant]]);
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue(['enemy-1']);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants);

      expect(spatialGridManager.queryRadius).toHaveBeenCalledWith(hitPoint, 5.0);
    });

    it('falls back to full scan when spatial grid not initialized', () => {
      vi.mocked(spatialGridManager.getIsInitialized).mockReturnValue(false);

      const combatant = createMockCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(2, 0, 0),
        suppressionLevel: 0,
      });

      const allCombatants = new Map([['enemy-1', combatant]]);
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants);

      expect(combatant.suppressionLevel).toBeGreaterThan(0);
      expect(spatialGridManager.queryRadius).not.toHaveBeenCalled();
    });

    it('increases panic level based on proximity', () => {
      const combatant = createMockCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(1, 0, 0), // Very close
        panicLevel: 0,
      });

      const allCombatants = new Map([['enemy-1', combatant]]);
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue(['enemy-1']);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants);

      expect(combatant.panicLevel).toBeGreaterThan(0);
    });

    it('triggers cover seeking after multiple near misses', () => {
      const combatant = createMockCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(1, 0, 0),
        state: CombatantState.ENGAGING,
        panicLevel: 0.7,
        nearMissCount: 2,
      });

      const allCombatants = new Map([['enemy-1', combatant]]);
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue(['enemy-1']);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants);

      expect(combatant.nearMissCount).toBe(3);
      expect(combatant.state).toBe(CombatantState.SEEKING_COVER);
    });

    it('does not trigger cover seeking from idle state', () => {
      const combatant = createMockCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(1, 0, 0),
        state: CombatantState.IDLE,
        panicLevel: 0.7,
        nearMissCount: 2,
      });

      const allCombatants = new Map([['enemy-1', combatant]]);
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue(['enemy-1']);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants);

      expect(combatant.state).toBe(CombatantState.IDLE);
    });

    it('sets lastSuppressedTime timestamp', () => {
      const combatant = createMockCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(2, 0, 0),
      });

      const allCombatants = new Map([['enemy-1', combatant]]);
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue(['enemy-1']);

      const beforeTime = Date.now();
      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants);
      const afterTime = Date.now();

      expect(combatant.lastSuppressedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(combatant.lastSuppressedTime).toBeLessThanOrEqual(afterTime);
    });

    it('clamps suppression level at 1.0', () => {
      const combatant = createMockCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(1, 0, 0),
        suppressionLevel: 0.9,
      });

      const allCombatants = new Map([['enemy-1', combatant]]);
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue(['enemy-1']);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants);

      expect(combatant.suppressionLevel).toBeLessThanOrEqual(1.0);
    });

    it('clamps panic level at 1.0', () => {
      const combatant = createMockCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(1, 0, 0),
        panicLevel: 0.95,
      });

      const allCombatants = new Map([['enemy-1', combatant]]);
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue(['enemy-1']);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants);

      expect(combatant.panicLevel).toBeLessThanOrEqual(1.0);
    });

    it('ignores combatants outside suppression radius', () => {
      const combatant = createMockCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(100, 0, 0), // Far away
        suppressionLevel: 0,
      });

      const allCombatants = new Map([['enemy-1', combatant]]);
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue(['enemy-1']);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants);

      expect(combatant.suppressionLevel).toBe(0);
      expect(combatant.nearMissCount).toBe(0);
    });

    it('handles multiple combatants in suppression radius', () => {
      const combatant1 = createMockCombatant({
        id: 'enemy-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(2, 0, 0),
        suppressionLevel: 0,
      });

      const combatant2 = createMockCombatant({
        id: 'enemy-2',
        faction: Faction.NVA,
        position: new THREE.Vector3(0, 2, 0),
        suppressionLevel: 0,
      });

      const allCombatants = new Map([
        ['enemy-1', combatant1],
        ['enemy-2', combatant2],
      ]);
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue(['enemy-1', 'enemy-2']);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.US, allCombatants);

      expect(combatant1.suppressionLevel).toBeGreaterThan(0);
      expect(combatant2.suppressionLevel).toBeGreaterThan(0);
    });

    it('does not suppress player when no player position provided', () => {
      suppression.setPlayerSuppressionSystem(mockPlayerSuppressionSystem);

      const allCombatants = new Map();
      const shotRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const hitPoint = new THREE.Vector3(0, 0, 0);

      vi.mocked(spatialGridManager.queryRadius).mockReturnValue([]);

      suppression.trackNearMisses(shotRay, hitPoint, Faction.NVA, allCombatants);

      expect(mockPlayerSuppressionSystem.registerNearMiss).not.toHaveBeenCalled();
    });
  });
});
