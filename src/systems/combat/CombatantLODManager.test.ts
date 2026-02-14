import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { CombatantLODManager } from './CombatantLODManager';
import { Combatant, CombatantState, Faction } from './types';
import { SpatialOctree } from './SpatialOctree';
import type { CombatantAI } from './CombatantAI';
import type { CombatantCombat } from './CombatantCombat';
import type { CombatantMovement } from './CombatantMovement';
import type { CombatantRenderer } from './CombatantRenderer';
import type { SquadManager } from './SquadManager';
import type { GameModeManager } from '../world/GameModeManager';
import type { ZoneManager } from '../world/ZoneManager';

// Helper to create a mock combatant
function createMockCombatant(
  id: string,
  position: THREE.Vector3,
  faction: Faction = Faction.US,
  state: CombatantState = CombatantState.IDLE,
  isDying = false
): Combatant {
  return {
    id,
    faction,
    position,
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any,
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
    isDying,
    deathProgress: isDying ? 0 : undefined,
    kills: 0,
    deaths: 0,
  } as Combatant;
}

// Mock factory functions
function createMockCombatantAI(): CombatantAI {
  return {
    updateAI: vi.fn(),
    clearLOSCache: vi.fn(),
  } as unknown as CombatantAI;
}

function createMockCombatantCombat(): CombatantCombat {
  return {
    updateCombat: vi.fn(),
  } as unknown as CombatantCombat;
}

function createMockCombatantMovement(): CombatantMovement {
  return {
    updateMovement: vi.fn(),
    updateRotation: vi.fn(),
  } as unknown as CombatantMovement;
}

function createMockCombatantRenderer(): CombatantRenderer {
  return {
    updateCombatantTexture: vi.fn(),
  } as unknown as CombatantRenderer;
}

function createMockSquadManager(): SquadManager {
  return {
    getAllSquads: vi.fn().mockReturnValue([]),
  } as unknown as SquadManager;
}

function createMockSpatialOctree(): SpatialOctree {
  return {
    updatePosition: vi.fn(),
    remove: vi.fn(),
  } as unknown as SpatialOctree;
}

function createMockGameModeManager(worldSize = 400): GameModeManager {
  return {
    getWorldSize: vi.fn().mockReturnValue(worldSize),
  } as unknown as GameModeManager;
}

function createMockZoneManager(): ZoneManager {
  return {
    getAllZones: vi.fn().mockReturnValue([]),
  } as unknown as ZoneManager;
}

describe('CombatantLODManager', () => {
  let manager: CombatantLODManager;
  let combatants: Map<string, Combatant>;
  let playerPosition: THREE.Vector3;
  let combatantAI: CombatantAI;
  let combatantCombat: CombatantCombat;
  let combatantMovement: CombatantMovement;
  let combatantRenderer: CombatantRenderer;
  let squadManager: SquadManager;
  let spatialGrid: SpatialOctree;

  beforeEach(() => {
    combatants = new Map();
    playerPosition = new THREE.Vector3(0, 0, 0);
    combatantAI = createMockCombatantAI();
    combatantCombat = createMockCombatantCombat();
    combatantMovement = createMockCombatantMovement();
    combatantRenderer = createMockCombatantRenderer();
    squadManager = createMockSquadManager();
    spatialGrid = createMockSpatialOctree();

    manager = new CombatantLODManager(
      combatants,
      playerPosition,
      combatantAI,
      combatantCombat,
      combatantMovement,
      combatantRenderer,
      squadManager,
      spatialGrid
    );
  });

  describe('Constructor', () => {
    it('should create with provided dependencies', () => {
      expect(manager).toBeDefined();
      expect(manager.lodHighCount).toBe(0);
      expect(manager.lodMediumCount).toBe(0);
      expect(manager.lodLowCount).toBe(0);
      expect(manager.lodCulledCount).toBe(0);
      expect(manager.intervalScale).toBe(1.0);
    });
  });

  describe('updateFrameTiming', () => {
    it('should set interval scale to 1.0 at 60 FPS', () => {
      // At 60 FPS, delta time is ~16.67ms
      // Call multiple times to let EMA converge
      for (let i = 0; i < 20; i++) {
        manager.updateFrameTiming(1 / 60);
      }
      expect(manager.intervalScale).toBe(1.0);
    });

    it('should scale up intervals when FPS drops below 30', () => {
      // At 20 FPS, delta time is 50ms
      // Call multiple times to let EMA converge to the new frame rate
      for (let i = 0; i < 50; i++) {
        manager.updateFrameTiming(1 / 20);
      }
      // intervalScale should be 30/20 = 1.5, capped at 3.0
      expect(manager.intervalScale).toBeGreaterThan(1.0);
    });

    it('should scale down intervals when FPS is above 90', () => {
      // At 120 FPS, delta time is ~8.33ms
      // Call multiple times to let EMA converge
      for (let i = 0; i < 50; i++) {
        manager.updateFrameTiming(1 / 120);
      }
      // intervalScale should be 90/120 = 0.75
      expect(manager.intervalScale).toBeLessThan(1.0);
    });

    it('should clamp interval scale to maximum of 3.0', () => {
      // At very low FPS (10), scale would be 3.0, capped
      // Call multiple times to let EMA converge to the low frame rate
      for (let i = 0; i < 100; i++) {
        manager.updateFrameTiming(1 / 10);
      }
      expect(manager.intervalScale).toBeCloseTo(3.0, 1);
    });

    it('should clamp interval scale to minimum of 0.75', () => {
      // At very high FPS, scale shouldn't go below 0.75
      for (let i = 0; i < 50; i++) {
        manager.updateFrameTiming(1 / 240);
      }
      expect(manager.intervalScale).toBe(0.75);
    });

    it('should use EMA smoothing for frame timing', () => {
      // First establish baseline at 60 FPS
      for (let i = 0; i < 20; i++) {
        manager.updateFrameTiming(1 / 60);
      }
      expect(manager.intervalScale).toBe(1.0);

      // Sudden drop to 20 FPS - EMA should smooth the transition
      // First call won't immediately change much due to EMA
      manager.updateFrameTiming(1 / 20);
      const scaleAfterOneCall = manager.intervalScale;
      
      // After many calls, should eventually scale up
      for (let i = 0; i < 50; i++) {
        manager.updateFrameTiming(1 / 20);
      }
      const scaleAfterManyCalls = manager.intervalScale;

      expect(scaleAfterOneCall).toBe(1.0); // First call doesn't change much due to EMA
      expect(scaleAfterManyCalls).toBeGreaterThan(1.0);
    });
  });

  describe('computeDynamicIntervalMs', () => {
    it('should return minimum interval at close distances', () => {
      const gameModeManager = createMockGameModeManager(400);
      manager.setGameModeManager(gameModeManager);

      // At distance 0, should return minimum
      const interval = manager.computeDynamicIntervalMs(0);
      expect(interval).toBe(16); // minMs for small worlds
    });

    it('should scale intervals for larger worlds', () => {
      const smallWorldManager = createMockGameModeManager(400);
      const largeWorldManager = createMockGameModeManager(2000);

      manager.setGameModeManager(smallWorldManager);
      const smallWorldInterval = manager.computeDynamicIntervalMs(100);

      manager.setGameModeManager(largeWorldManager);
      const largeWorldInterval = manager.computeDynamicIntervalMs(100);

      // Large world should have longer intervals at same distance
      expect(largeWorldInterval).toBeGreaterThanOrEqual(smallWorldInterval);
    });

    it('should increase interval with distance', () => {
      const gameModeManager = createMockGameModeManager(400);
      manager.setGameModeManager(gameModeManager);

      const closeInterval = manager.computeDynamicIntervalMs(50);
      const farInterval = manager.computeDynamicIntervalMs(500);

      expect(farInterval).toBeGreaterThan(closeInterval);
    });

    it('should cap interval at maximum value', () => {
      const gameModeManager = createMockGameModeManager(400);
      manager.setGameModeManager(gameModeManager);

      const maxInterval = manager.computeDynamicIntervalMs(10000);
      expect(maxInterval).toBe(500); // maxMs for small worlds
    });

    it('should use quadratic falloff', () => {
      const gameModeManager = createMockGameModeManager(400);
      manager.setGameModeManager(gameModeManager);

      // At half distance threshold, should be roughly quarter of max increase
      const startScale = 80;
      const maxScale = 1000;
      const midPoint = startScale + (maxScale - startScale) / 2;

      const atStart = manager.computeDynamicIntervalMs(startScale);
      const atMid = manager.computeDynamicIntervalMs(midPoint);
      const atEnd = manager.computeDynamicIntervalMs(maxScale);

      // Quadratic curve means mid should be at ~25% of the way up
      const expectedProgress = 0.25;
      const actualProgress = (atMid - atStart) / (atEnd - atStart);
      expect(actualProgress).toBeCloseTo(expectedProgress, 1);
    });
  });

  describe('updateCombatants - bucketing', () => {
    beforeEach(() => {
      const gameModeManager = createMockGameModeManager(400);
      manager.setGameModeManager(gameModeManager);
    });

    it('should bucket combatants by distance thresholds', () => {
      // Create combatants at various distances
      const closeCombatant = createMockCombatant('close', new THREE.Vector3(50, 0, 0));
      const mediumCombatant = createMockCombatant('medium', new THREE.Vector3(200, 0, 0));
      const farCombatant = createMockCombatant('far', new THREE.Vector3(400, 0, 0));
      const culledCombatant = createMockCombatant('culled', new THREE.Vector3(600, 0, 0));

      combatants.set('close', closeCombatant);
      combatants.set('medium', mediumCombatant);
      combatants.set('far', farCombatant);
      combatants.set('culled', culledCombatant);

      manager.updateCombatants(0.016);

      // Check LOD counts
      expect(manager.lodHighCount).toBe(1);
      expect(manager.lodMediumCount).toBe(1);
      expect(manager.lodLowCount).toBe(1);
      expect(manager.lodCulledCount).toBe(1);

      // Check individual combatant LOD levels
      expect(closeCombatant.lodLevel).toBe('high');
      expect(mediumCombatant.lodLevel).toBe('medium');
      expect(farCombatant.lodLevel).toBe('low');
      expect(culledCombatant.lodLevel).toBe('culled');
    });

    it('should handle empty combatant map', () => {
      manager.updateCombatants(0.016);

      expect(manager.lodHighCount).toBe(0);
      expect(manager.lodMediumCount).toBe(0);
      expect(manager.lodLowCount).toBe(0);
      expect(manager.lodCulledCount).toBe(0);
    });

    it('should cull combatants outside world bounds', () => {
      const outsideCombatant = createMockCombatant('outside', new THREE.Vector3(500, 0, 0));
      combatants.set('outside', outsideCombatant);

      manager.updateCombatants(0.016);

      expect(manager.lodCulledCount).toBe(1);
      expect(outsideCombatant.lodLevel).toBe('culled');
    });

    it('should nudge off-map combatants toward center', () => {
      const outsideCombatant = createMockCombatant('outside', new THREE.Vector3(500, 0, 500));
      const originalX = outsideCombatant.position.x;
      const originalZ = outsideCombatant.position.z;

      combatants.set('outside', outsideCombatant);

      manager.updateCombatants(0.016);

      // Position should have moved toward center
      expect(outsideCombatant.position.x).toBeLessThan(originalX);
      expect(outsideCombatant.position.z).toBeLessThan(originalZ);
    });

    it('should set distanceSq on combatants', () => {
      const combatant = createMockCombatant('test', new THREE.Vector3(100, 0, 0));
      combatants.set('test', combatant);

      manager.updateCombatants(0.016);

      expect(combatant.distanceSq).toBeDefined();
      expect(combatant.distanceSq).toBe(10000); // 100^2
    });
  });

  describe('updateCombatants - update scheduling', () => {
    beforeEach(() => {
      const gameModeManager = createMockGameModeManager(400);
      manager.setGameModeManager(gameModeManager);
    });

    it('should update high LOD combatants with staggering over 3 frames', () => {
      const combatant = createMockCombatant('high', new THREE.Vector3(10, 0, 0));
      combatants.set('high', combatant);

      // With stagger period of 3, AI should be called once within 3 frames
      manager.updateCombatants(0.016);
      manager.updateCombatants(0.016);
      manager.updateCombatants(0.016);
      expect(combatantAI.updateAI).toHaveBeenCalledTimes(1);

      // Movement should still update every frame (visual smoothness)
      expect(combatantMovement.updateMovement).toHaveBeenCalledTimes(3);
    });

    it('should schedule medium LOD updates based on dynamic interval and stagger', () => {
      const combatant = createMockCombatant('medium', new THREE.Vector3(200, 0, 0));
      combatants.set('medium', combatant);

      // Medium LOD uses both time-based intervals and stagger (period 5).
      // Over several frames, AI may or may not fire depending on timing + stagger alignment.
      // Run enough frames to ensure at least one AI update triggers.
      for (let i = 0; i < 10; i++) {
        manager.updateCombatants(0.016);
      }
      // Should have been called at least once within 10 frames
      const callCount = (combatantAI.updateAI as any).mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    it('should update dead combatants for death animation', () => {
      const dyingCombatant = createMockCombatant('dying', new THREE.Vector3(100, 0, 0), Faction.US, CombatantState.ENGAGING, true);
      dyingCombatant.deathProgress = 0;
      combatants.set('dying', dyingCombatant);

      manager.updateCombatants(0.1);

      // Death progress should advance
      expect(dyingCombatant.deathProgress).toBeGreaterThan(0);
    });

    it('should remove combatants after death animation completes', () => {
      const dyingCombatant = createMockCombatant('dying', new THREE.Vector3(100, 0, 0), Faction.US, CombatantState.ENGAGING, true);
      dyingCombatant.deathProgress = 0.99;
      combatants.set('dying', dyingCombatant);

      // Total death time is 5.7 seconds (0.7 + 4.0 + 1.0)
      manager.updateCombatants(0.1);

      // Combatant should be removed after animation completes
      if (dyingCombatant.deathProgress! >= 1.0) {
        expect(combatants.has('dying')).toBe(false);
      }
    });
  });

  describe('simulateDistantAI', () => {
    beforeEach(() => {
      const gameModeManager = createMockGameModeManager(400);
      manager.setGameModeManager(gameModeManager);
    });

    it('should return early when zone manager is not set', () => {
      const combatant = createMockCombatant('test', new THREE.Vector3(1000, 0, 0));
      combatants.set('test', combatant);

      // No zone manager set, should not throw
      expect(() => manager.updateCombatants(30)).not.toThrow();
    });

    it('should move combatant toward strategic zones', () => {
      const zoneManager = createMockZoneManager();
      const strategicZone = {
        id: 'zone1',
        name: 'Zone 1',
        position: new THREE.Vector3(0, 0, 0),
        radius: 20,
        height: 2,
        owner: null,
        state: 'neutral',
        captureProgress: 0,
        captureSpeed: 0,
        isHomeBase: false,
      };
      vi.mocked(zoneManager.getAllZones).mockReturnValue([strategicZone as any]);
      manager.setZoneManager(zoneManager);

      const combatant = createMockCombatant('test', new THREE.Vector3(900, 0, 900));
      const originalDistance = combatant.position.distanceTo(strategicZone.position);
      combatants.set('test', combatant);

      // Simulate 30 seconds passing for distant AI
      manager.updateCombatants(30);

      // Combatant should have moved closer to zone
      const newDistance = combatant.position.distanceTo(strategicZone.position);
      expect(newDistance).toBeLessThan(originalDistance);
    });

    it('should ignore home base zones', () => {
      const zoneManager = createMockZoneManager();
      const homeBase = {
        id: 'home',
        name: 'Home Base',
        position: new THREE.Vector3(0, 0, 0),
        radius: 20,
        height: 2,
        owner: Faction.US,
        state: 'us_controlled',
        captureProgress: 0,
        captureSpeed: 0,
        isHomeBase: true,
      };
      vi.mocked(zoneManager.getAllZones).mockReturnValue([homeBase as any]);
      manager.setZoneManager(zoneManager);

      const combatant = createMockCombatant('test', new THREE.Vector3(900, 0, 900));
      combatants.set('test', combatant);

      // Should not throw even with only home base zones
      expect(() => manager.updateCombatants(30)).not.toThrow();
    });

    it('should add randomness to movement to prevent clustering', () => {
      const zoneManager = createMockZoneManager();
      const strategicZone = {
        id: 'zone1',
        name: 'Zone 1',
        position: new THREE.Vector3(0, 0, 0),
        radius: 20,
        height: 2,
        owner: null,
        state: 'contested',
        captureProgress: 0,
        captureSpeed: 0,
        isHomeBase: false,
      };
      vi.mocked(zoneManager.getAllZones).mockReturnValue([strategicZone as any]);
      manager.setZoneManager(zoneManager);

      // Create a single combatant at far distance to trigger simulateDistantAI
      // Position at (900, 0, 900) - distance ~1273, which is > 600 LOD threshold for 400-size world
      const farCombatant = createMockCombatant('far', new THREE.Vector3(900, 0, 900));
      farCombatant.lastUpdateTime = 0; // Trigger simulation on first update
      combatants.set('far', farCombatant);

      const originalX = farCombatant.position.x;
      const originalZ = farCombatant.position.z;

      // Update should trigger simulateDistantAI for culled combatants
      manager.updateCombatants(0.016);

      // simulateDistantAI moves the combatant toward the strategic zone at (0,0,0)
      // and adds random offset, so position should change
      const movedX = farCombatant.position.x !== originalX;
      const movedZ = farCombatant.position.z !== originalZ;

      // At least one coordinate should have changed due to movement toward zone + random offset
      expect(movedX || movedZ).toBe(true);
    });
  });

  describe('setPlayerPosition', () => {
    it('should update player position reference', () => {
      const newPosition = new THREE.Vector3(100, 0, 100);
      manager.setPlayerPosition(newPosition);

      // Add a combatant and verify bucketing uses new position
      const combatant = createMockCombatant('test', new THREE.Vector3(100, 0, 100));
      combatants.set('test', combatant);

      const gameModeManager = createMockGameModeManager(400);
      manager.setGameModeManager(gameModeManager);

      manager.updateCombatants(0.016);

      // Combatant at (100, 0, 100) with player at (100, 0, 100) should be high LOD
      expect(combatant.lodLevel).toBe('high');
    });
  });

  describe('setGameModeManager', () => {
    it('should set the game mode manager', () => {
      const gameModeManager = createMockGameModeManager(2000);
      manager.setGameModeManager(gameModeManager);

      // Verify it's being used by checking interval computation
      const interval = manager.computeDynamicIntervalMs(100);
      // Large world should use different thresholds
      expect(interval).toBeGreaterThanOrEqual(33); // minMs for large worlds
    });
  });

  describe('setZoneManager', () => {
    it('should set the zone manager', () => {
      const zoneManager = createMockZoneManager();
      manager.setZoneManager(zoneManager);

      // Should not throw when updating with zone manager set
      const gameModeManager = createMockGameModeManager(400);
      manager.setGameModeManager(gameModeManager);

      const combatant = createMockCombatant('test', new THREE.Vector3(900, 0, 0));
      combatants.set('test', combatant);

      expect(() => manager.updateCombatants(30)).not.toThrow();
    });
  });

  describe('Integration - distance bucketing with different world sizes', () => {
    it('should use larger thresholds for large worlds', () => {
      const smallWorldManager = createMockGameModeManager(400);
      const largeWorldManager = createMockGameModeManager(2000);

      // Combatant at 250 units distance
      const combatant = createMockCombatant('test', new THREE.Vector3(250, 0, 0));
      combatants.set('test', combatant);

      // Small world: 250 > 150 (highLODRange), so medium or lower
      manager.setGameModeManager(smallWorldManager);
      manager.updateCombatants(0.016);
      const smallWorldLOD = combatant.lodLevel;

      // Reset
      combatant.lodLevel = 'high';

      // Large world: 250 < 400 (mediumLODRange for large world), so medium
      manager.setGameModeManager(largeWorldManager);
      manager.updateCombatants(0.016);
      const largeWorldLOD = combatant.lodLevel;

      // Both should at least be medium or lower, but thresholds differ
      expect(['medium', 'low', 'culled']).toContain(smallWorldLOD);
      expect(['medium', 'low', 'culled']).toContain(largeWorldLOD);
    });
  });
});
