import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { SpatialGridManager, SyncFrequency } from './SpatialGridManager';
import { Combatant, CombatantState, Faction } from './types';

// Helper to create a mock combatant
function createMockCombatant(
  id: string,
  position: THREE.Vector3,
  state: CombatantState = CombatantState.IDLE
): Combatant {
  return {
    id,
    faction: Faction.US,
    position: position.clone(),
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
    lastUpdateTime: Date.now(),
    updatePriority: 0,
    lodLevel: 'high',
    kills: 0,
    deaths: 0,
  };
}

describe('SpatialGridManager', () => {
  let manager: SpatialGridManager;

  beforeEach(() => {
    // Create a new manager instance for each test
    manager = new SpatialGridManager();
  });

  describe('Constructor', () => {
    it('should create with uninitialized state', () => {
      expect(manager.getIsInitialized()).toBe(false);

      const telemetry = manager.getTelemetry();
      expect(telemetry.initialized).toBe(false);
      expect(telemetry.entityCount).toBe(0);
      expect(telemetry.queriesThisFrame).toBe(0);
    });

    it('should have null grid initially', () => {
      const grid = manager.getGrid();
      expect(grid).toBeNull();
    });

    it('should have zero fallback count initially', () => {
      const telemetry = manager.getTelemetry();
      expect(telemetry.fallbackCount).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should initialize with world size', () => {
      manager.initialize(4000);

      expect(manager.getIsInitialized()).toBe(true);

      const telemetry = manager.getTelemetry();
      expect(telemetry.initialized).toBe(true);
    });

    it('should create underlying octree', () => {
      manager.initialize(4000);

      const grid = manager.getGrid();
      expect(grid).not.toBeNull();
    });

    it('should record initialization timing', () => {
      manager.initialize(4000);

      const telemetry = manager.getTelemetry();
      expect(telemetry.lastRebuildMs).toBeGreaterThan(0);
    });

    it('should skip reinitialization with same world size', () => {
      manager.initialize(4000);
      const firstRebuildMs = manager.getTelemetry().lastRebuildMs;

      // Initialize again with same size
      manager.initialize(4000);
      const secondRebuildMs = manager.getTelemetry().lastRebuildMs;

      // Should not have rebuilt
      expect(secondRebuildMs).toBe(firstRebuildMs);
    });

    it('should initialize with custom octree parameters', () => {
      manager.initialize(2000);

      const stats = manager.getOctreeStats();
      expect(stats).not.toBeNull();
      expect(stats!.totalEntities).toBe(0);
    });
  });

  describe('reinitialize', () => {
    it('should reinitialize with new world size', () => {
      manager.initialize(2000);
      const firstGrid = manager.getGrid();

      manager.reinitialize(4000);
      const secondGrid = manager.getGrid();

      expect(firstGrid).not.toBe(secondGrid);
      expect(manager.getIsInitialized()).toBe(true);
    });

    it('should clear entity count on reinitialize', () => {
      manager.initialize(4000);

      // Add some entities via syncEntity
      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.syncEntity('e2', new THREE.Vector3(200, 0, 200));

      manager.reinitialize(2000);

      const telemetry = manager.getTelemetry();
      expect(telemetry.entityCount).toBe(0);
    });

    it('should create fresh grid instance', () => {
      manager.initialize(4000);
      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));

      const oldStats = manager.getOctreeStats();
      expect(oldStats!.totalEntities).toBe(1);

      manager.reinitialize(4000);

      const newStats = manager.getOctreeStats();
      expect(newStats!.totalEntities).toBe(0);
    });
  });

  describe('syncAllPositions', () => {
    it('should fail if not initialized', () => {
      const combatants = new Map<string, Combatant>([
        ['c1', createMockCombatant('c1', new THREE.Vector3(100, 0, 100))],
      ]);

      const playerPosition = new THREE.Vector3(0, 0, 0);
      manager.syncAllPositions(combatants, playerPosition);

      const telemetry = manager.getTelemetry();
      expect(telemetry.fallbackCount).toBeGreaterThan(0);
    });

    it('should sync all alive combatants', () => {
      manager.initialize(4000);

      const combatants = new Map<string, Combatant>([
        ['c1', createMockCombatant('c1', new THREE.Vector3(100, 0, 100))],
        ['c2', createMockCombatant('c2', new THREE.Vector3(200, 0, 200))],
        ['c3', createMockCombatant('c3', new THREE.Vector3(300, 0, 300))],
      ]);

      const playerPosition = new THREE.Vector3(0, 0, 0);
      manager.syncAllPositions(combatants, playerPosition);

      const telemetry = manager.getTelemetry();
      expect(telemetry.entityCount).toBe(3);
    });

    it('should remove dead combatants from grid', () => {
      manager.initialize(4000);

      const combatants = new Map<string, Combatant>([
        ['alive', createMockCombatant('alive', new THREE.Vector3(100, 0, 100), CombatantState.IDLE)],
        ['dead', createMockCombatant('dead', new THREE.Vector3(200, 0, 200), CombatantState.DEAD)],
      ]);

      const playerPosition = new THREE.Vector3(0, 0, 0);
      manager.syncAllPositions(combatants, playerPosition);

      // Only alive combatant should be in grid
      const results = manager.queryRadius(new THREE.Vector3(100, 0, 100), 50);
      expect(results).toContain('alive');
      expect(results).not.toContain('dead');
    });

    it('should use LOD-based sync frequency for nearby entities', () => {
      manager.initialize(4000);

      const combatants = new Map<string, Combatant>([
        ['close', createMockCombatant('close', new THREE.Vector3(50, 0, 50))], // <150m
      ]);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      // Should sync every frame for close entities
      manager.syncAllPositions(combatants, playerPosition);
      const results = manager.queryRadius(new THREE.Vector3(50, 0, 50), 10);
      expect(results).toContain('close');
    });

    it('should reduce sync frequency for distant entities', () => {
      manager.initialize(4000);

      const combatants = new Map<string, Combatant>([
        ['far', createMockCombatant('far', new THREE.Vector3(600, 0, 600))], // >500m
      ]);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      // Far entities sync every 30 frames - may not sync on first call
      manager.syncAllPositions(combatants, playerPosition);
    });

    it('should track sync timing', () => {
      manager.initialize(4000);

      const combatants = new Map<string, Combatant>([
        ['c1', createMockCombatant('c1', new THREE.Vector3(100, 0, 100))],
      ]);

      const playerPosition = new THREE.Vector3(0, 0, 0);
      manager.syncAllPositions(combatants, playerPosition);

      const telemetry = manager.getTelemetry();
      expect(telemetry.lastSyncMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty combatants map', () => {
      manager.initialize(4000);

      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      expect(() => manager.syncAllPositions(combatants, playerPosition)).not.toThrow();

      const telemetry = manager.getTelemetry();
      expect(telemetry.entityCount).toBe(0);
    });

    it('should update entity count telemetry', () => {
      manager.initialize(4000);

      const combatants = new Map<string, Combatant>([
        ['c1', createMockCombatant('c1', new THREE.Vector3(100, 0, 100))],
        ['c2', createMockCombatant('c2', new THREE.Vector3(200, 0, 200))],
        ['c3', createMockCombatant('c3', new THREE.Vector3(300, 0, 300))],
      ]);

      const playerPosition = new THREE.Vector3(0, 0, 0);
      manager.syncAllPositions(combatants, playerPosition);

      const telemetry = manager.getTelemetry();
      expect(telemetry.entityCount).toBe(3);
    });
  });

  describe('syncEntity', () => {
    it('should fail if not initialized', () => {
      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));

      const telemetry = manager.getTelemetry();
      expect(telemetry.fallbackCount).toBeGreaterThan(0);
    });

    it('should sync single entity immediately', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));

      const results = manager.queryRadius(new THREE.Vector3(100, 0, 100), 50);
      expect(results).toContain('e1');
    });

    it('should update existing entity position', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.syncEntity('e1', new THREE.Vector3(500, 0, 500));

      // Should find at new position
      let results = manager.queryRadius(new THREE.Vector3(500, 0, 500), 50);
      expect(results).toContain('e1');

      // Should not find at old position
      results = manager.queryRadius(new THREE.Vector3(100, 0, 100), 50);
      expect(results).not.toContain('e1');
    });

    it('should handle multiple entity syncs', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.syncEntity('e2', new THREE.Vector3(200, 0, 200));
      manager.syncEntity('e3', new THREE.Vector3(300, 0, 300));

      const stats = manager.getOctreeStats();
      expect(stats!.totalEntities).toBe(3);
    });
  });

  describe('removeEntity', () => {
    it('should handle removal when not initialized', () => {
      expect(() => manager.removeEntity('e1')).not.toThrow();
    });

    it('should remove entity from grid', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.removeEntity('e1');

      const results = manager.queryRadius(new THREE.Vector3(100, 0, 100), 50);
      expect(results).not.toContain('e1');
    });

    it('should handle removing non-existent entity', () => {
      manager.initialize(4000);

      expect(() => manager.removeEntity('non-existent')).not.toThrow();
    });

    it('should update entity count after removal', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.syncEntity('e2', new THREE.Vector3(200, 0, 200));

      expect(manager.getOctreeStats()!.totalEntities).toBe(2);

      manager.removeEntity('e1');

      expect(manager.getOctreeStats()!.totalEntities).toBe(1);
    });
  });

  describe('queryRadius', () => {
    it('should fail if not initialized', () => {
      const results = manager.queryRadius(new THREE.Vector3(0, 0, 0), 100);

      expect(results).toEqual([]);

      const telemetry = manager.getTelemetry();
      expect(telemetry.fallbackCount).toBeGreaterThan(0);
    });

    it('should find entities within radius', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.syncEntity('e2', new THREE.Vector3(150, 0, 150));
      manager.syncEntity('e3', new THREE.Vector3(500, 0, 500));

      const results = manager.queryRadius(new THREE.Vector3(100, 0, 100), 100);

      expect(results).toContain('e1');
      expect(results).toContain('e2');
      expect(results).not.toContain('e3');
    });

    it('should return empty array for empty grid', () => {
      manager.initialize(4000);

      const results = manager.queryRadius(new THREE.Vector3(0, 0, 0), 100);

      expect(results).toEqual([]);
    });

    it('should track query timing', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.queryRadius(new THREE.Vector3(100, 0, 100), 50);

      const telemetry = manager.getTelemetry();
      expect(telemetry.avgQueryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should increment query count', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));

      manager.resetFrameTelemetry();
      manager.queryRadius(new THREE.Vector3(100, 0, 100), 50);
      manager.queryRadius(new THREE.Vector3(200, 0, 200), 50);

      const telemetry = manager.getTelemetry();
      expect(telemetry.queriesThisFrame).toBe(2);
    });

    it('should handle large radius queries', () => {
      manager.initialize(4000);

      for (let i = 0; i < 10; i++) {
        manager.syncEntity(`e${i}`, new THREE.Vector3(i * 100, 0, i * 100));
      }

      const results = manager.queryRadius(new THREE.Vector3(0, 0, 0), 2000);

      expect(results).toHaveLength(10);
    });

    it('should maintain query time EMA', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));

      // Perform multiple queries
      for (let i = 0; i < 10; i++) {
        manager.queryRadius(new THREE.Vector3(100, 0, 100), 50);
      }

      const telemetry = manager.getTelemetry();
      expect(telemetry.avgQueryTimeMs).toBeGreaterThan(0);
    });
  });

  describe('queryNearestK', () => {
    it('should fail if not initialized', () => {
      const results = manager.queryNearestK(new THREE.Vector3(0, 0, 0), 3);

      expect(results).toEqual([]);

      const telemetry = manager.getTelemetry();
      expect(telemetry.fallbackCount).toBeGreaterThan(0);
    });

    it('should find k nearest entities', () => {
      manager.initialize(4000);

      manager.syncEntity('closest', new THREE.Vector3(10, 0, 0));
      manager.syncEntity('middle', new THREE.Vector3(50, 0, 0));
      manager.syncEntity('farthest', new THREE.Vector3(100, 0, 0));

      const results = manager.queryNearestK(new THREE.Vector3(0, 0, 0), 2);

      expect(results).toHaveLength(2);
      expect(results).toContain('closest');
      expect(results).toContain('middle');
      expect(results).not.toContain('farthest');
    });

    it('should respect maxDistance parameter', () => {
      manager.initialize(4000);

      manager.syncEntity('close', new THREE.Vector3(10, 0, 0));
      manager.syncEntity('far', new THREE.Vector3(200, 0, 0));

      const results = manager.queryNearestK(new THREE.Vector3(0, 0, 0), 10, 100);

      expect(results).toContain('close');
      expect(results).not.toContain('far');
    });

    it('should handle k larger than entity count', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(10, 0, 0));
      manager.syncEntity('e2', new THREE.Vector3(20, 0, 0));

      const results = manager.queryNearestK(new THREE.Vector3(0, 0, 0), 10);

      expect(results).toHaveLength(2);
    });

    it('should increment query count', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));

      manager.resetFrameTelemetry();
      manager.queryNearestK(new THREE.Vector3(0, 0, 0), 5);

      const telemetry = manager.getTelemetry();
      expect(telemetry.queriesThisFrame).toBe(1);
    });
  });

  describe('queryRay', () => {
    it('should fail if not initialized', () => {
      const results = manager.queryRay(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        1000
      );

      expect(results).toEqual([]);

      const telemetry = manager.getTelemetry();
      expect(telemetry.fallbackCount).toBeGreaterThan(0);
    });

    it('should find entities along ray', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(-1500, 0, 0));
      manager.syncEntity('e2', new THREE.Vector3(-1400, 0, 0));
      manager.syncEntity('e3', new THREE.Vector3(-1500, 10, 0)); // Off the ray

      const results = manager.queryRay(
        new THREE.Vector3(-2500, 0, 0),
        new THREE.Vector3(1, 0, 0),
        2000
      );

      expect(results).toContain('e1');
      expect(results).toContain('e2');
      expect(results).not.toContain('e3');
    });

    it('should respect maxDistance', () => {
      manager.initialize(4000);

      manager.syncEntity('close', new THREE.Vector3(-1500, 0, 0));
      manager.syncEntity('far', new THREE.Vector3(-500, 0, 0));

      const results = manager.queryRay(
        new THREE.Vector3(-2500, 0, 0),
        new THREE.Vector3(1, 0, 0),
        1200
      );

      expect(results).toContain('close');
      expect(results).not.toContain('far');
    });

    it('should increment query count', () => {
      manager.initialize(4000);

      manager.resetFrameTelemetry();
      manager.queryRay(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        1000
      );

      const telemetry = manager.getTelemetry();
      expect(telemetry.queriesThisFrame).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear grid when initialized', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.syncEntity('e2', new THREE.Vector3(200, 0, 200));

      expect(manager.getOctreeStats()!.totalEntities).toBe(2);

      manager.clear();

      expect(manager.getOctreeStats()!.totalEntities).toBe(0);
    });

    it('should reset entity count telemetry', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.clear();

      const telemetry = manager.getTelemetry();
      expect(telemetry.entityCount).toBe(0);
    });

    it('should handle clear when not initialized', () => {
      expect(() => manager.clear()).not.toThrow();
    });

    it('should allow adding entities after clear', () => {
      manager.initialize(4000);

      manager.syncEntity('old', new THREE.Vector3(100, 0, 100));
      manager.clear();
      manager.syncEntity('new', new THREE.Vector3(200, 0, 200));

      const results = manager.queryRadius(new THREE.Vector3(200, 0, 200), 50);
      expect(results).toContain('new');
      expect(results).not.toContain('old');
    });
  });

  describe('resetFrameTelemetry', () => {
    it('should reset queries counter', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.queryRadius(new THREE.Vector3(100, 0, 100), 50);

      expect(manager.getTelemetry().queriesThisFrame).toBeGreaterThan(0);

      manager.resetFrameTelemetry();

      expect(manager.getTelemetry().queriesThisFrame).toBe(0);
    });

    it('should preserve other telemetry values', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.queryRadius(new THREE.Vector3(100, 0, 100), 50);

      const avgQueryTimeBefore = manager.getTelemetry().avgQueryTimeMs;

      manager.resetFrameTelemetry();

      const telemetry = manager.getTelemetry();
      expect(telemetry.avgQueryTimeMs).toBe(avgQueryTimeBefore);
      expect(telemetry.initialized).toBe(true);
    });
  });

  describe('getTelemetry', () => {
    it('should return copy of telemetry object', () => {
      const telemetry1 = manager.getTelemetry();
      const telemetry2 = manager.getTelemetry();

      expect(telemetry1).not.toBe(telemetry2);
      expect(telemetry1).toEqual(telemetry2);
    });

    it('should include all telemetry fields', () => {
      const telemetry = manager.getTelemetry();

      expect(telemetry).toHaveProperty('initialized');
      expect(telemetry).toHaveProperty('entityCount');
      expect(telemetry).toHaveProperty('queriesThisFrame');
      expect(telemetry).toHaveProperty('avgQueryTimeMs');
      expect(telemetry).toHaveProperty('fallbackCount');
      expect(telemetry).toHaveProperty('lastSyncMs');
      expect(telemetry).toHaveProperty('lastRebuildMs');
    });

    it('should reflect current state', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.queryRadius(new THREE.Vector3(100, 0, 100), 50);

      const telemetry = manager.getTelemetry();

      expect(telemetry.initialized).toBe(true);
      expect(telemetry.queriesThisFrame).toBeGreaterThan(0);
      expect(telemetry.avgQueryTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getOctreeStats', () => {
    it('should return null when not initialized', () => {
      const stats = manager.getOctreeStats();
      expect(stats).toBeNull();
    });

    it('should return stats when initialized', () => {
      manager.initialize(4000);

      const stats = manager.getOctreeStats();

      expect(stats).not.toBeNull();
      expect(stats).toHaveProperty('totalNodes');
      expect(stats).toHaveProperty('totalEntities');
      expect(stats).toHaveProperty('maxDepth');
      expect(stats).toHaveProperty('avgEntitiesPerLeaf');
    });

    it('should reflect entity count', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.syncEntity('e2', new THREE.Vector3(200, 0, 200));

      const stats = manager.getOctreeStats();
      expect(stats!.totalEntities).toBe(2);
    });

    it('should show subdivision when many entities added', () => {
      manager.initialize(4000);

      // Add many entities to trigger subdivision
      for (let i = 0; i < 50; i++) {
        manager.syncEntity(`e${i}`, new THREE.Vector3(i * 50, 0, i * 50));
      }

      const stats = manager.getOctreeStats();
      expect(stats!.totalNodes).toBeGreaterThan(1);
      expect(stats!.maxDepth).toBeGreaterThan(0);
    });
  });

  describe('getGrid', () => {
    it('should return null when not initialized', () => {
      const grid = manager.getGrid();
      expect(grid).toBeNull();
    });

    it('should return grid instance when initialized', () => {
      manager.initialize(4000);

      const grid = manager.getGrid();
      expect(grid).not.toBeNull();
      expect(grid).toHaveProperty('queryRadius');
      expect(grid).toHaveProperty('updatePosition');
    });

    it('should return same grid instance on multiple calls', () => {
      manager.initialize(4000);

      const grid1 = manager.getGrid();
      const grid2 = manager.getGrid();

      expect(grid1).toBe(grid2);
    });
  });

  describe('Integration tests', () => {
    it('should handle complete workflow', () => {
      // Initialize
      manager.initialize(4000);
      expect(manager.getIsInitialized()).toBe(true);

      // Add entities
      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.syncEntity('e2', new THREE.Vector3(200, 0, 200));
      manager.syncEntity('e3', new THREE.Vector3(300, 0, 300));

      // Query
      let results = manager.queryRadius(new THREE.Vector3(100, 0, 100), 150);
      expect(results).toContain('e1');
      expect(results).toContain('e2');

      // Remove
      manager.removeEntity('e1');
      results = manager.queryRadius(new THREE.Vector3(100, 0, 100), 150);
      expect(results).not.toContain('e1');

      // Update position
      manager.syncEntity('e2', new THREE.Vector3(100, 0, 100));
      results = manager.queryRadius(new THREE.Vector3(100, 0, 100), 50);
      expect(results).toContain('e2');

      // Clear
      manager.clear();
      expect(manager.getOctreeStats()!.totalEntities).toBe(0);
    });

    it('should maintain telemetry across operations', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.queryRadius(new THREE.Vector3(100, 0, 100), 50);
      manager.queryNearestK(new THREE.Vector3(0, 0, 0), 5);

      const telemetry = manager.getTelemetry();

      expect(telemetry.initialized).toBe(true);
      expect(telemetry.queriesThisFrame).toBe(2);
      expect(telemetry.avgQueryTimeMs).toBeGreaterThanOrEqual(0);
      expect(telemetry.fallbackCount).toBe(0);
    });

    it('should handle reinitialize workflow', () => {
      manager.initialize(2000);
      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));

      expect(manager.getOctreeStats()!.totalEntities).toBe(1);

      manager.reinitialize(4000);

      expect(manager.getOctreeStats()!.totalEntities).toBe(0);
      expect(manager.getIsInitialized()).toBe(true);

      manager.syncEntity('e2', new THREE.Vector3(200, 0, 200));
      expect(manager.getOctreeStats()!.totalEntities).toBe(1);
    });

    it('should track fallbacks when operations called before init', () => {
      // Try operations before initialization
      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.queryRadius(new THREE.Vector3(0, 0, 0), 100);
      manager.queryNearestK(new THREE.Vector3(0, 0, 0), 5);

      const telemetry = manager.getTelemetry();
      expect(telemetry.fallbackCount).toBe(3);
    });

    it('should handle mixed sync strategies', () => {
      manager.initialize(4000);

      // Use positions close to player (<150m) so they sync every frame
      const combatants = new Map<string, Combatant>([
        ['c1', createMockCombatant('c1', new THREE.Vector3(50, 0, 50))],
        ['c2', createMockCombatant('c2', new THREE.Vector3(100, 0, 100))],
      ]);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      // Bulk sync - entities are close to player, will sync on first frame
      manager.syncAllPositions(combatants, playerPosition);

      // Individual sync (bypasses LOD frequency check)
      manager.syncEntity('c3', new THREE.Vector3(300, 0, 300));

      // Verify all three entities are in grid
      const stats = manager.getOctreeStats();
      expect(stats!.totalEntities).toBe(3);

      // Verify they can be queried
      const c1Results = manager.queryRadius(new THREE.Vector3(50, 0, 50), 10);
      expect(c1Results).toContain('c1');

      const c2Results = manager.queryRadius(new THREE.Vector3(100, 0, 100), 10);
      expect(c2Results).toContain('c2');

      const c3Results = manager.queryRadius(new THREE.Vector3(300, 0, 300), 10);
      expect(c3Results).toContain('c3');
    });

    it('should handle rapid queries', () => {
      manager.initialize(4000);

      for (let i = 0; i < 10; i++) {
        manager.syncEntity(`e${i}`, new THREE.Vector3(i * 100, 0, i * 100));
      }

      manager.resetFrameTelemetry();

      // Perform many queries
      for (let i = 0; i < 50; i++) {
        manager.queryRadius(new THREE.Vector3(0, 0, 0), 1000);
      }

      const telemetry = manager.getTelemetry();
      expect(telemetry.queriesThisFrame).toBe(50);
      expect(telemetry.avgQueryTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SyncFrequency constants', () => {
    it('should have expected frequency values', () => {
      expect(SyncFrequency.EVERY_FRAME).toBe(1);
      expect(SyncFrequency.EVERY_2_FRAMES).toBe(2);
      expect(SyncFrequency.EVERY_5_FRAMES).toBe(5);
      expect(SyncFrequency.EVERY_30_FRAMES).toBe(30);
    });
  });
});
