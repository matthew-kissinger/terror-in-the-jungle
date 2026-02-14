import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantHitDetection } from './CombatantHitDetection';
import { Combatant, CombatantState, Faction } from './types';
import { SpatialGridManager } from './SpatialGridManager';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}));

// Mock PerformanceTelemetry
vi.mock('../debug/PerformanceTelemetry', () => ({
  performanceTelemetry: {
    recordFallback: vi.fn()
  }
}));

// Helper: Create a minimal Combatant object
function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'test-combatant',
    faction: Faction.OPFOR,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state: CombatantState.IDLE,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any,
    ...overrides
  };
}

// Helper: Create a ray
function makeRay(origin: THREE.Vector3, direction: THREE.Vector3): THREE.Ray {
  return new THREE.Ray(origin, direction.clone().normalize());
}

describe('CombatantHitDetection', () => {
  let hitDetection: CombatantHitDetection;
  let mockGridManager: SpatialGridManager;

  beforeEach(() => {
    // Create mock grid manager
    mockGridManager = {
      getIsInitialized: vi.fn().mockReturnValue(true),
      queryRadius: vi.fn().mockReturnValue([])
    } as any;

    hitDetection = new CombatantHitDetection(mockGridManager);
  });

  describe('constructor', () => {
    it('should use provided grid manager', () => {
      const detection = new CombatantHitDetection(mockGridManager);
      expect(detection).toBeDefined();
    });

    it('should use singleton grid manager when not provided', () => {
      const detection = new CombatantHitDetection();
      expect(detection).toBeDefined();
    });
  });

  describe('setGridManager', () => {
    it('should update grid manager', () => {
      const newManager = {
        getIsInitialized: vi.fn().mockReturnValue(true),
        queryRadius: vi.fn().mockReturnValue([])
      } as any;

      hitDetection.setGridManager(newManager);
      
      // Verify by calling a method that uses the grid
      hitDetection.raycastCombatants(
        makeRay(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)),
        Faction.US,
        new Map()
      );

      expect(newManager.getIsInitialized).toHaveBeenCalled();
    });
  });

  describe('checkPlayerHit', () => {
    it('should detect direct head hit', () => {
      const playerPosition = new THREE.Vector3(10, 0, 0);
      const ray = makeRay(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0)
      );

      const result = hitDetection.checkPlayerHit(ray, playerPosition);

      expect(result.hit).toBe(true);
      expect(result.headshot).toBe(true);
      // Hit point should be within the head zone
      expect(result.point.distanceTo(playerPosition)).toBeLessThanOrEqual(0.35);
    });

    it('should detect direct body hit', () => {
      const playerPosition = new THREE.Vector3(10, 0, 0);
      // Aim at torso zone (offset 0.2, -1.1, 0)
      const ray = makeRay(
        new THREE.Vector3(0, -1.1, 0),
        new THREE.Vector3(1, 0, 0)
      );

      const result = hitDetection.checkPlayerHit(ray, playerPosition);

      expect(result.hit).toBe(true);
      expect(result.headshot).toBe(false);
    });

    it('should detect leg hit (lower left zone)', () => {
      const playerPosition = new THREE.Vector3(10, 0, 0);
      // Aim at lower left leg zone (offset -0.2, -3.1, 0)
      const ray = makeRay(
        new THREE.Vector3(0, -3.1, 0),
        new THREE.Vector3(1, 0, 0)
      );

      const result = hitDetection.checkPlayerHit(ray, playerPosition);

      expect(result.hit).toBe(true);
      expect(result.headshot).toBe(false);
    });

    it('should detect leg hit (lower right zone)', () => {
      const playerPosition = new THREE.Vector3(10, 0, 0);
      // Aim at lower right leg zone (offset 0.2, -3.1, 0)
      const ray = makeRay(
        new THREE.Vector3(0, -3.1, 0),
        new THREE.Vector3(1, 0, 0)
      );

      const result = hitDetection.checkPlayerHit(ray, playerPosition);

      expect(result.hit).toBe(true);
      expect(result.headshot).toBe(false);
    });

    it('should return miss when ray passes far from all zones', () => {
      const playerPosition = new THREE.Vector3(10, 0, 0);
      const ray = makeRay(
        new THREE.Vector3(0, 100, 0),
        new THREE.Vector3(1, 0, 0)
      );

      const result = hitDetection.checkPlayerHit(ray, playerPosition);

      expect(result.hit).toBe(false);
      expect(result.headshot).toBe(false);
      expect(result.point.x).toBe(0);
      expect(result.point.y).toBe(0);
      expect(result.point.z).toBe(0);
    });

    it('should skip when ray points away from player (t < 0)', () => {
      const playerPosition = new THREE.Vector3(10, 0, 0);
      const ray = makeRay(
        new THREE.Vector3(20, 0, 0),
        new THREE.Vector3(1, 0, 0)
      );

      const result = hitDetection.checkPlayerHit(ray, playerPosition);

      expect(result.hit).toBe(false);
    });

    it('should skip when ray is beyond MAX_ENGAGEMENT_RANGE', () => {
      const playerPosition = new THREE.Vector3(320, 0, 0);
      const ray = makeRay(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0)
      );

      const result = hitDetection.checkPlayerHit(ray, playerPosition);

      expect(result.hit).toBe(false);
    });

    it('should return hit point on zone surface', () => {
      const playerPosition = new THREE.Vector3(10, 0, 0);
      // Shoot slightly off-center to get a surface hit
      const ray = makeRay(
        new THREE.Vector3(0, 0.2, 0),
        new THREE.Vector3(1, 0, 0)
      );

      const result = hitDetection.checkPlayerHit(ray, playerPosition);

      expect(result.hit).toBe(true);
      // Head zone has radius 0.35, so hit point should be ~0.35 units from center
      const distanceFromCenter = result.point.distanceTo(playerPosition);
      expect(distanceFromCenter).toBeCloseTo(0.35, 1);
    });

    it('should handle edge case: ray tangent to sphere', () => {
      const playerPosition = new THREE.Vector3(10, 0, 0);
      // Ray passes exactly at radius distance (0.35 for head)
      const ray = makeRay(
        new THREE.Vector3(0, 0.35, 0),
        new THREE.Vector3(1, 0, 0)
      );

      const result = hitDetection.checkPlayerHit(ray, playerPosition);

      expect(result.hit).toBe(true);
      expect(result.headshot).toBe(true);
    });
  });

  describe('raycastCombatants', () => {
    it('should return null when grid not initialized', () => {
      mockGridManager.getIsInitialized = vi.fn().mockReturnValue(false);

      const ray = makeRay(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, new Map());

      expect(result).toBeNull();
      expect(mockGridManager.getIsInitialized).toHaveBeenCalled();
    });

    it('should hit closest enemy combatant', () => {
      const combatant1 = makeCombatant({
        id: 'enemy1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 2.8, 0),
        state: CombatantState.IDLE
      });

      const combatant2 = makeCombatant({
        id: 'enemy2',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(20, 2.8, 0),
        state: CombatantState.IDLE
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['enemy1', 'enemy2']);

      const allCombatants = new Map<string, Combatant>([
        ['enemy1', combatant1],
        ['enemy2', combatant2]
      ]);

      const ray = makeRay(new THREE.Vector3(0, 2.8, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).not.toBeNull();
      expect(result!.combatant.id).toBe('enemy1');
      expect(result!.distance).toBeLessThan(20);
    });

    it('should skip friendly faction when FRIENDLY_FIRE_ENABLED is false', () => {
      const friendly = makeCombatant({
        id: 'friendly1',
        faction: Faction.US,
        position: new THREE.Vector3(10, 2.8, 0),
        state: CombatantState.IDLE
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['friendly1']);

      const allCombatants = new Map<string, Combatant>([
        ['friendly1', friendly]
      ]);

      const ray = makeRay(new THREE.Vector3(0, 2.8, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).toBeNull();
    });

    it('should skip DEAD combatants', () => {
      const deadCombatant = makeCombatant({
        id: 'dead1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 2.8, 0),
        state: CombatantState.DEAD
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['dead1']);

      const allCombatants = new Map<string, Combatant>([
        ['dead1', deadCombatant]
      ]);

      const ray = makeRay(new THREE.Vector3(0, 2.8, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).toBeNull();
    });

    it('should return null on complete miss', () => {
      const combatant = makeCombatant({
        id: 'enemy1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 0, 0),
        state: CombatantState.IDLE
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['enemy1']);

      const allCombatants = new Map<string, Combatant>([
        ['enemy1', combatant]
      ]);

      // Ray passes far above combatant
      const ray = makeRay(new THREE.Vector3(0, 100, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).toBeNull();
    });

    it('should return closest hit when multiple candidates exist', () => {
      const combatant1 = makeCombatant({
        id: 'enemy1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 2.8, 0),
        state: CombatantState.IDLE
      });

      const combatant2 = makeCombatant({
        id: 'enemy2',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(5, 2.8, 0),
        state: CombatantState.IDLE
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['enemy1', 'enemy2']);

      const allCombatants = new Map<string, Combatant>([
        ['enemy1', combatant1],
        ['enemy2', combatant2]
      ]);

      const ray = makeRay(new THREE.Vector3(0, 2.8, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).not.toBeNull();
      expect(result!.combatant.id).toBe('enemy2');
    });

    it('should use ENGAGING hit zones for ENGAGING state', () => {
      const combatant = makeCombatant({
        id: 'enemy1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 0, 0),
        state: CombatantState.ENGAGING
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['enemy1']);

      const allCombatants = new Map<string, Combatant>([
        ['enemy1', combatant]
      ]);

      // ENGAGING head zone is at offset (0, 2.5, 0) with radius 0.3
      const ray = makeRay(new THREE.Vector3(0, 2.5, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).not.toBeNull();
      expect(result!.headshot).toBe(true);
    });

    it('should use ALERT hit zones for ALERT state', () => {
      const combatant = makeCombatant({
        id: 'enemy1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 0, 0),
        state: CombatantState.ALERT
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['enemy1']);

      const allCombatants = new Map<string, Combatant>([
        ['enemy1', combatant]
      ]);

      // ALERT head zone is at offset (0, 2.7, 0) with radius 0.35
      const ray = makeRay(new THREE.Vector3(0, 2.7, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).not.toBeNull();
      expect(result!.headshot).toBe(true);
    });

    it('should use default hit zones for IDLE state', () => {
      const combatant = makeCombatant({
        id: 'enemy1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 0, 0),
        state: CombatantState.IDLE
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['enemy1']);

      const allCombatants = new Map<string, Combatant>([
        ['enemy1', combatant]
      ]);

      // Default head zone is at offset (0, 2.8, 0) with radius 0.35
      const ray = makeRay(new THREE.Vector3(0, 2.8, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).not.toBeNull();
      expect(result!.headshot).toBe(true);
    });

    it('should return point on zone surface, not center', () => {
      const combatant = makeCombatant({
        id: 'enemy1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 0, 0),
        state: CombatantState.IDLE
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['enemy1']);

      const allCombatants = new Map<string, Combatant>([
        ['enemy1', combatant]
      ]);

      // Shoot slightly off-center to get a surface hit
      const ray = makeRay(new THREE.Vector3(0, 3.0, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).not.toBeNull();
      
      // Head zone center is at (10, 2.8, 0), radius 0.35
      const zoneCenter = new THREE.Vector3(10, 2.8, 0);
      const distanceFromCenter = result!.point.distanceTo(zoneCenter);
      
      // Point should be on surface (at radius distance from center)
      expect(distanceFromCenter).toBeCloseTo(0.35, 1);
    });

    it('should use ENGAGING zones for SUPPRESSING state', () => {
      const combatant = makeCombatant({
        id: 'enemy1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 0, 0),
        state: CombatantState.SUPPRESSING
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['enemy1']);

      const allCombatants = new Map<string, Combatant>([
        ['enemy1', combatant]
      ]);

      // SUPPRESSING uses same zones as ENGAGING
      const ray = makeRay(new THREE.Vector3(0, 2.5, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).not.toBeNull();
      expect(result!.headshot).toBe(true);
    });
  });

  describe('getHitZonesForState (implicit via raycastCombatants)', () => {
    it('should return engaging zones for ENGAGING state', () => {
      const combatant = makeCombatant({
        id: 'enemy1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 0, 0),
        state: CombatantState.ENGAGING
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['enemy1']);
      const allCombatants = new Map([['enemy1', combatant]]);

      // Test ENGAGING head zone (0, 2.5, 0, radius 0.3)
      const ray = makeRay(new THREE.Vector3(0, 2.5, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).not.toBeNull();
    });

    it('should return engaging zones for SUPPRESSING state', () => {
      const combatant = makeCombatant({
        id: 'enemy1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 0, 0),
        state: CombatantState.SUPPRESSING
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['enemy1']);
      const allCombatants = new Map([['enemy1', combatant]]);

      const ray = makeRay(new THREE.Vector3(0, 2.5, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).not.toBeNull();
    });

    it('should return alert zones for ALERT state', () => {
      const combatant = makeCombatant({
        id: 'enemy1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 0, 0),
        state: CombatantState.ALERT
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['enemy1']);
      const allCombatants = new Map([['enemy1', combatant]]);

      // Test ALERT head zone (0, 2.7, 0, radius 0.35)
      const ray = makeRay(new THREE.Vector3(0, 2.7, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).not.toBeNull();
    });

    it('should return default zones for IDLE state', () => {
      const combatant = makeCombatant({
        id: 'enemy1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 0, 0),
        state: CombatantState.IDLE
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['enemy1']);
      const allCombatants = new Map([['enemy1', combatant]]);

      // Test default head zone (0, 2.8, 0, radius 0.35)
      const ray = makeRay(new THREE.Vector3(0, 2.8, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).not.toBeNull();
    });

    it('should return default zones for PATROLLING state', () => {
      const combatant = makeCombatant({
        id: 'enemy1',
        faction: Faction.OPFOR,
        position: new THREE.Vector3(10, 0, 0),
        state: CombatantState.PATROLLING
      });

      mockGridManager.queryRadius = vi.fn().mockReturnValue(['enemy1']);
      const allCombatants = new Map([['enemy1', combatant]]);

      const ray = makeRay(new THREE.Vector3(0, 2.8, 0), new THREE.Vector3(1, 0, 0));
      const result = hitDetection.raycastCombatants(ray, Faction.US, allCombatants);

      expect(result).not.toBeNull();
    });
  });
});
