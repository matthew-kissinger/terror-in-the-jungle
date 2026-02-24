import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { GrenadeEffects } from './GrenadeEffects';
import { Grenade } from './GrenadePhysics';
import { GrenadeType, CombatantState, Faction } from '../combat/types';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { CombatantSystem } from '../combat/CombatantSystem';
import { AudioManager } from '../audio/AudioManager';
import { spawnSmokeCloud } from '../effects/SmokeCloudSystem';
import { Logger } from '../../utils/Logger';
import type { IFlashbangScreenEffect, IPlayerController } from '../../types/SystemInterfaces';

// Mock Date.now for consistent testing of disorientation
const MOCK_DATE_NOW = 1000000;
let mockDateNowSpy: ReturnType<typeof vi.spyOn>;

// Mock Three.js Vector3 and other necessary classes
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();

  const mockVector3 = vi.fn(function (this: THREE.Vector3, x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.copy = vi.fn(function (v: THREE.Vector3) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    });
    this.add = vi.fn(function (v: THREE.Vector3) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    });
    this.subVectors = vi.fn(function (v1: THREE.Vector3, v2: THREE.Vector3) {
      this.x = v1.x - v2.x;
      this.y = v1.y - v2.y;
      this.z = v1.z - v2.z;
      return this;
    });
    this.length = vi.fn(() => Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z));
    this.set = vi.fn(function (xVal: number, yVal: number, zVal: number) {
      this.x = xVal;
      this.y = yVal;
      this.z = zVal;
      return this;
    });
    this.clone = vi.fn(function () {
      return new mockVector3(this.x, this.y, this.z);
    });
  }) as unknown as jest.Mock<THREE.Vector3>; // Cast to allow 'new' calls

  // Mock toFixed on numbers when they are returned from Vector3 accessors
  const originalToFixed = Number.prototype.toFixed;
  Number.prototype.toFixed = vi.fn(function (fractionDigits?: number) {
    return originalToFixed.call(this, fractionDigits);
  });

  const mockPerspectiveCamera = vi.fn(function (this: THREE.PerspectiveCamera) {
    this.getWorldDirection = vi.fn((target: THREE.Vector3) => {
      target.set(0, 0, -1); // Default camera looks down -Z
      return target;
    });
  }) as unknown as jest.Mock<THREE.PerspectiveCamera>;

  return {
    ...actual,
    Vector3: mockVector3,
    PerspectiveCamera: mockPerspectiveCamera,
  };
});

// Mock external dependencies
vi.mock('../effects/ImpactEffectsPool', () => ({
  ImpactEffectsPool: {
    spawn: vi.fn(),
  },
}));

vi.mock('../effects/ExplosionEffectsPool', () => ({
  ExplosionEffectsPool: {
    spawn: vi.fn(),
  },
}));

vi.mock('../combat/CombatantSystem', () => ({
  CombatantSystem: vi.fn(function (this: CombatantSystem) {
    this.applyExplosionDamage = vi.fn();
    this.combatants = new Map();
    this.querySpatialRadius = vi.fn(() => []);
  }),
}));

vi.mock('../audio/AudioManager', () => ({
  AudioManager: {
    playExplosionAt: vi.fn(),
  },
}));

vi.mock('../effects/SmokeCloudSystem', () => ({
  spawnSmokeCloud: vi.fn(),
}));

vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Helper functions
const createMockGrenade = (type: GrenadeType, position: THREE.Vector3): Grenade => ({
  id: `grenade-${Math.random()}`,
  type,
  position,
  velocity: new THREE.Vector3(),
  rotation: new THREE.Vector3(),
  rotationVelocity: new THREE.Vector3(),
  mesh: new THREE.Mesh(),
  fuseTime: 0,
  isActive: true,
});

const createMockCombatant = (
  id: string,
  position: THREE.Vector3,
  state: CombatantState = CombatantState.IDLE,
  faction: Faction = Faction.NVA
): Combatant => ({
  id,
  faction,
  position,
  health: 100,
  maxHealth: 100,
  state,
  velocity: new THREE.Vector3(),
  rotation: 0,
  visualRotation: 0,
  rotationVelocity: 0,
  scale: new THREE.Vector3(),
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
  kills: 0,
  deaths: 0,
  flashDisorientedUntil: undefined,
});

describe('GrenadeEffects', () => {
  let grenadeEffects: GrenadeEffects;
  let mockImpactEffectsPool: typeof ImpactEffectsPool;
  let mockExplosionEffectsPool: typeof ExplosionEffectsPool;
  let mockCombatantSystem: CombatantSystem;
  let mockAudioManager: typeof AudioManager;
  let mockPlayerController: IPlayerController;
  let mockFlashbangEffect: IFlashbangScreenEffect;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock Date.now for consistent testing of disorientation
    mockDateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(MOCK_DATE_NOW);

    grenadeEffects = new GrenadeEffects();
    mockImpactEffectsPool = ImpactEffectsPool;
    mockExplosionEffectsPool = ExplosionEffectsPool;
    mockCombatantSystem = new CombatantSystem(); // Needs to be new instance for combatants Map
    mockAudioManager = AudioManager;
    mockPlayerController = {
      applyExplosionShake: vi.fn(),
      getPosition: vi.fn(() => new THREE.Vector3(0, 0, 0)),
      getCamera: vi.fn(() => new THREE.PerspectiveCamera()),
      applyFlashbangEffect: vi.fn(),
    };
    mockFlashbangEffect = {
      triggerFlash: vi.fn(),
    };

    // Set flashbangEffect for flashbang tests
    grenadeEffects.setFlashbangEffect(mockFlashbangEffect);

    (mockCombatantSystem as any).querySpatialRadius = vi.fn(() => []);
  });

  afterEach(() => {
    mockDateNowSpy.mockRestore();
  });

  // Test suite for explodeGrenade() dispatch
  describe('explodeGrenade', () => {
    it('should dispatch to explodeFrag for FRAG grenade type', () => {
      const grenade = createMockGrenade(GrenadeType.FRAG, new THREE.Vector3(0, 0, 0));
      const spy = vi.spyOn(grenadeEffects as any, 'explodeFrag');
      grenadeEffects.explodeGrenade(
        grenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(spy).toHaveBeenCalledWith(
        grenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
    });

    it('should dispatch to explodeSmoke for SMOKE grenade type', () => {
      const grenade = createMockGrenade(GrenadeType.SMOKE, new THREE.Vector3(0, 0, 0));
      const spy = vi.spyOn(grenadeEffects as any, 'explodeSmoke');
      grenadeEffects.explodeGrenade(
        grenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(spy).toHaveBeenCalledWith(grenade, mockImpactEffectsPool);
    });

    it('should dispatch to explodeFlashbang for FLASHBANG grenade type', () => {
      const grenade = createMockGrenade(GrenadeType.FLASHBANG, new THREE.Vector3(0, 0, 0));
      const spy = vi.spyOn(grenadeEffects as any, 'explodeFlashbang');
      grenadeEffects.explodeGrenade(
        grenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(spy).toHaveBeenCalledWith(
        grenade,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
    });

    it('should log info about the explosion', () => {
      const grenade = createMockGrenade(GrenadeType.FRAG, new THREE.Vector3(10, 20, 30));
      grenadeEffects.explodeGrenade(
        grenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(Logger.info).toHaveBeenCalledWith(
        'weapons',
        `FRAG grenade exploded at (10.0, 20.0, 30.0)`
      );
    });
  });

  // Test suite for explodeFrag()
  describe('explodeFrag', () => {
    const fragGrenade = createMockGrenade(GrenadeType.FRAG, new THREE.Vector3(1, 2, 3));

    it('should spawn explosion effect', () => {
      grenadeEffects.explodeGrenade(
        fragGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(mockExplosionEffectsPool.spawn).toHaveBeenCalledTimes(1);
      expect(mockExplosionEffectsPool.spawn).toHaveBeenCalledWith(fragGrenade.position);
    });

    it('should spawn 15 debris impacts', () => {
      grenadeEffects.explodeGrenade(
        fragGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(mockImpactEffectsPool.spawn).toHaveBeenCalledTimes(15);
      // Check that positions are offset from grenade position
      const calls = (mockImpactEffectsPool.spawn as vi.Mock).mock.calls;
      const grenadePosX = fragGrenade.position.x;
      const grenadePosY = fragGrenade.position.y;
      const grenadePosZ = fragGrenade.position.z;



      calls.forEach((call) => {
        const spawnedPos = call[0];
        // Ensure spawn position is a Vector3
        expect(spawnedPos).toHaveProperty('x');
        expect(spawnedPos).toHaveProperty('y');
        expect(spawnedPos).toHaveProperty('z');
        // Check if positions are varied around the grenade position
        expect(spawnedPos.x).not.toBe(grenadePosX);
        expect(spawnedPos.y).not.toBe(grenadePosY); // Y is offset upwards randomly
        expect(spawnedPos.z).not.toBe(grenadePosZ);
      });
    });

    it('should play explosion audio', () => {
      grenadeEffects.explodeGrenade(
        fragGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(mockAudioManager.playExplosionAt).toHaveBeenCalledTimes(1);
      expect(mockAudioManager.playExplosionAt).toHaveBeenCalledWith(fragGrenade.position);
    });

    it('should apply area damage', () => {
      grenadeEffects.explodeGrenade(
        fragGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(mockCombatantSystem.applyExplosionDamage).toHaveBeenCalledTimes(1);
      expect(mockCombatantSystem.applyExplosionDamage).toHaveBeenCalledWith(
        fragGrenade.position,
        15, // DAMAGE_RADIUS
        150, // MAX_DAMAGE
        'PLAYER'
      );
    });

    it('should trigger camera shake', () => {
      grenadeEffects.explodeGrenade(
        fragGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(mockPlayerController.applyExplosionShake).toHaveBeenCalledTimes(1);
      expect(mockPlayerController.applyExplosionShake).toHaveBeenCalledWith(
        fragGrenade.position,
        15 // DAMAGE_RADIUS
      );
    });

    it('should handle undefined explosionEffectsPool gracefully', () => {
      expect(() =>
        grenadeEffects.explodeGrenade(
          fragGrenade,
          mockImpactEffectsPool,
          undefined, // explosionEffectsPool
          mockAudioManager,
          mockCombatantSystem,
          mockPlayerController
        )
      ).not.toThrow();
      expect(mockExplosionEffectsPool.spawn).not.toHaveBeenCalled();
    });

    it('should handle undefined impactEffectsPool gracefully', () => {
      expect(() =>
        grenadeEffects.explodeGrenade(
          fragGrenade,
          undefined, // impactEffectsPool
          mockExplosionEffectsPool,
          mockAudioManager,
          mockCombatantSystem,
          mockPlayerController
        )
      ).not.toThrow();
      expect(mockImpactEffectsPool.spawn).not.toHaveBeenCalled();
    });

    it('should handle undefined audioManager gracefully', () => {
      expect(() =>
        grenadeEffects.explodeGrenade(
          fragGrenade,
          mockImpactEffectsPool,
          mockExplosionEffectsPool,
          undefined, // audioManager
          mockCombatantSystem,
          mockPlayerController
        )
      ).not.toThrow();
      expect(mockAudioManager.playExplosionAt).not.toHaveBeenCalled();
    });

    it('should handle undefined combatantSystem gracefully', () => {
      expect(() =>
        grenadeEffects.explodeGrenade(
          fragGrenade,
          mockImpactEffectsPool,
          mockExplosionEffectsPool,
          mockAudioManager,
          undefined, // combatantSystem
          mockPlayerController
        )
      ).not.toThrow();
      expect(mockCombatantSystem.applyExplosionDamage).not.toHaveBeenCalled();
    });

    it('should handle undefined playerController gracefully', () => {
      expect(() =>
        grenadeEffects.explodeGrenade(
          fragGrenade,
          mockImpactEffectsPool,
          mockExplosionEffectsPool,
          mockAudioManager,
          mockCombatantSystem,
          undefined // playerController
        )
      ).not.toThrow();
      expect(mockPlayerController.applyExplosionShake).not.toHaveBeenCalled();
    });
  });

  // Test suite for explodeSmoke()
  describe('explodeSmoke', () => {
    const smokeGrenade = createMockGrenade(GrenadeType.SMOKE, new THREE.Vector3(4, 5, 6));

    it('should spawn 30 smoke particles', () => {
      grenadeEffects.explodeGrenade(
        smokeGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(mockImpactEffectsPool.spawn).toHaveBeenCalledTimes(30);
      // Check that positions are offset from grenade position
      const calls = (mockImpactEffectsPool.spawn as vi.Mock).mock.calls;
      const grenadePosY = smokeGrenade.position.y;


      calls.forEach((call) => {
        const spawnedPos = call[0];
        expect(spawnedPos).toHaveProperty('x');
        expect(spawnedPos).toHaveProperty('y');
        expect(spawnedPos).toHaveProperty('z');
        expect(spawnedPos.x).not.toBe(smokeGrenade.position.x);
        expect(spawnedPos.y).not.toBe(grenadePosY); // Y is offset upwards randomly
      });
    });

    it('should call spawnSmokeCloud', () => {
      grenadeEffects.explodeGrenade(
        smokeGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(spawnSmokeCloud).toHaveBeenCalledTimes(1);
      expect(spawnSmokeCloud).toHaveBeenCalledWith(smokeGrenade.position);
    });

    it('should NOT deal damage', () => {
      grenadeEffects.explodeGrenade(
        smokeGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(mockCombatantSystem.applyExplosionDamage).not.toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith('weapons', 'Smoke grenade deployed - no damage');
    });

    it('should handle undefined impactEffectsPool gracefully', () => {
      expect(() =>
        grenadeEffects.explodeGrenade(
          smokeGrenade,
          undefined, // impactEffectsPool
          mockExplosionEffectsPool,
          mockAudioManager,
          mockCombatantSystem,
          mockPlayerController
        )
      ).not.toThrow();
      expect(mockImpactEffectsPool.spawn).not.toHaveBeenCalled();
    });
  });

  // Test suite for explodeFlashbang()
  describe('explodeFlashbang', () => {
    const flashbangGrenade = createMockGrenade(GrenadeType.FLASHBANG, new THREE.Vector3(7, 8, 9));

    it('should spawn explosion effect', () => {
      grenadeEffects.explodeGrenade(
        flashbangGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(mockExplosionEffectsPool.spawn).toHaveBeenCalledTimes(1);
      expect(mockExplosionEffectsPool.spawn).toHaveBeenCalledWith(flashbangGrenade.position);
    });

    it('should play explosion audio', () => {
      grenadeEffects.explodeGrenade(
        flashbangGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(mockAudioManager.playExplosionAt).toHaveBeenCalledTimes(1);
      expect(mockAudioManager.playExplosionAt).toHaveBeenCalledWith(flashbangGrenade.position);
    });

    it('should apply minimal damage with larger radius', () => {
      grenadeEffects.explodeGrenade(
        flashbangGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(mockCombatantSystem.applyExplosionDamage).toHaveBeenCalledTimes(1);
      expect(mockCombatantSystem.applyExplosionDamage).toHaveBeenCalledWith(
        flashbangGrenade.position,
        20, // Larger radius
        5, // Minimal damage
        'PLAYER'
      );
    });

    it('should trigger light camera shake', () => {
      grenadeEffects.explodeGrenade(
        flashbangGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(mockPlayerController.applyExplosionShake).toHaveBeenCalledTimes(1);
      expect(mockPlayerController.applyExplosionShake).toHaveBeenCalledWith(
        flashbangGrenade.position,
        10 // Smaller radius for shake
      );
    });

    it('should trigger screen whiteout when flashbangEffect is set', () => {
      mockPlayerController.getPosition.mockReturnValue(new THREE.Vector3(1, 1, 1));
      const mockCamera = new THREE.PerspectiveCamera();
      mockPlayerController.getCamera.mockReturnValue(mockCamera);

      grenadeEffects.explodeGrenade(
        flashbangGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(mockFlashbangEffect.triggerFlash).toHaveBeenCalledTimes(1);

      const expectedPlayerPos = { x: 1, y: 1, z: 1 };
      const expectedLookDirection = { x: 0, y: 0, z: -1 }; // From mock camera
      expect(mockFlashbangEffect.triggerFlash).toHaveBeenCalledWith(
        expect.objectContaining(flashbangGrenade.position),
        expect.objectContaining(expectedPlayerPos),
        expect.objectContaining(expectedLookDirection)
      );
    });

    it('should NOT trigger screen effect when flashbangEffect is NOT set', () => {
      grenadeEffects = new GrenadeEffects(); // Create new instance without setting flashbangEffect
      expect(() =>
        grenadeEffects.explodeGrenade(
          flashbangGrenade,
          mockImpactEffectsPool,
          mockExplosionEffectsPool,
          mockAudioManager,
          mockCombatantSystem,
          mockPlayerController
        )
      ).not.toThrow();
      expect(mockFlashbangEffect.triggerFlash).not.toHaveBeenCalled();
    });

    it('should NOT trigger screen effect when playerController is NOT set', () => {
      expect(() =>
        grenadeEffects.explodeGrenade(
          flashbangGrenade,
          mockImpactEffectsPool,
          mockExplosionEffectsPool,
          mockAudioManager,
          mockCombatantSystem,
          undefined // playerController
        )
      ).not.toThrow();
      expect(mockFlashbangEffect.triggerFlash).not.toHaveBeenCalled();
    });
  });

  // Test suite for NPC disorientation
  describe('applyNPCDisorientation', () => {
    const flashPosition = new THREE.Vector3(0, 0, 0);

    it('should not do anything if combatantSystem is undefined', () => {
      const spy = vi.spyOn(mockCombatantSystem.combatants, 'forEach');
      (grenadeEffects as any).applyNPCDisorientation(flashPosition, undefined);
      expect(spy).not.toHaveBeenCalled();
      expect(Logger.info).not.toHaveBeenCalledWith(
        'weapons',
        expect.stringContaining('Flashbang disoriented')
      );
    });

    it('should apply full disorientation to NPCs within 15m (query provider path)', () => {
      const npc1 = createMockCombatant('npc1', new THREE.Vector3(10, 0, 0)); // 10m - full disorient
      const npc2 = createMockCombatant('npc2', new THREE.Vector3(20, 0, 0)); // 20m - partial disorient
      mockCombatantSystem.combatants.set(npc1.id, npc1);
      mockCombatantSystem.combatants.set(npc2.id, npc2);

      (mockCombatantSystem as any).querySpatialRadius.mockReturnValue([npc1.id, npc2.id]);

      (grenadeEffects as any).applyNPCDisorientation(flashPosition, mockCombatantSystem);

      expect(npc1.flashDisorientedUntil).toBe(MOCK_DATE_NOW + 3000);
      expect(npc2.flashDisorientedUntil).toBe(MOCK_DATE_NOW + 1500);
      expect((mockCombatantSystem as any).querySpatialRadius).toHaveBeenCalledWith(flashPosition, 25);
      expect(Logger.info).toHaveBeenCalledWith('weapons', 'Flashbang disoriented 2 NPCs');
    });

    it('should apply partial disorientation to NPCs between 15-25m (query provider path)', () => {
      const npc1 = createMockCombatant('npc1', new THREE.Vector3(16, 0, 0)); // 16m - partial disorient
      mockCombatantSystem.combatants.set(npc1.id, npc1);

      (mockCombatantSystem as any).querySpatialRadius.mockReturnValue([npc1.id]);

      (grenadeEffects as any).applyNPCDisorientation(flashPosition, mockCombatantSystem);

      expect(npc1.flashDisorientedUntil).toBe(MOCK_DATE_NOW + 1500);
    });

    it('should skip dead combatants (query provider path)', () => {
      const npc1 = createMockCombatant('npc1', new THREE.Vector3(10, 0, 0), CombatantState.DEAD);
      const npc2 = createMockCombatant('npc2', new THREE.Vector3(5, 0, 0));
      mockCombatantSystem.combatants.set(npc1.id, npc1);
      mockCombatantSystem.combatants.set(npc2.id, npc2);

      (mockCombatantSystem as any).querySpatialRadius.mockReturnValue([npc1.id, npc2.id]);

      (grenadeEffects as any).applyNPCDisorientation(flashPosition, mockCombatantSystem);

      expect(npc1.flashDisorientedUntil).toBeUndefined();
      expect(npc2.flashDisorientedUntil).toBe(MOCK_DATE_NOW + 3000);
      expect(Logger.info).toHaveBeenCalledWith('weapons', 'Flashbang disoriented 1 NPCs');
    });

    it('should skip combatants beyond 25m (query provider path)', () => {
      const npc1 = createMockCombatant('npc1', new THREE.Vector3(26, 0, 0)); // 26m - beyond range
      const npc2 = createMockCombatant('npc2', new THREE.Vector3(24, 0, 0)); // 24m - partial disorient
      mockCombatantSystem.combatants.set(npc1.id, npc1);
      mockCombatantSystem.combatants.set(npc2.id, npc2);

      (mockCombatantSystem as any).querySpatialRadius.mockReturnValue([npc1.id, npc2.id]);

      (grenadeEffects as any).applyNPCDisorientation(flashPosition, mockCombatantSystem);

      expect(npc1.flashDisorientedUntil).toBeUndefined();
      expect(npc2.flashDisorientedUntil).toBe(MOCK_DATE_NOW + 1500);
      expect(Logger.info).toHaveBeenCalledWith('weapons', 'Flashbang disoriented 1 NPCs');
    });

    it('should fall back to iterate all combatants when query provider is missing', () => {
      const npc1 = createMockCombatant('npc1', new THREE.Vector3(10, 0, 0));
      const npc2 = createMockCombatant('npc2', new THREE.Vector3(20, 0, 0));
      const npc3 = createMockCombatant('npc3', new THREE.Vector3(30, 0, 0)); // Beyond range for fallback
      mockCombatantSystem.combatants.set(npc1.id, npc1);
      mockCombatantSystem.combatants.set(npc2.id, npc2);
      mockCombatantSystem.combatants.set(npc3.id, npc3);

      (mockCombatantSystem as any).querySpatialRadius = undefined;

      (grenadeEffects as any).applyNPCDisorientation(flashPosition, mockCombatantSystem);

      expect((mockCombatantSystem as any).querySpatialRadius).toBeUndefined();
      expect(npc1.flashDisorientedUntil).toBe(MOCK_DATE_NOW + 3000);
      expect(npc2.flashDisorientedUntil).toBe(MOCK_DATE_NOW + 1500);
      expect(npc3.flashDisorientedUntil).toBeUndefined();
      expect(Logger.info).toHaveBeenCalledWith('weapons', 'Flashbang disoriented 2 NPCs');
    });

    it('should handle no NPCs being disoriented', () => {
      const npc1 = createMockCombatant('npc1', new THREE.Vector3(30, 0, 0)); // Beyond range
      mockCombatantSystem.combatants.set(npc1.id, npc1);

      (mockCombatantSystem as any).querySpatialRadius = undefined;

      (grenadeEffects as any).applyNPCDisorientation(flashPosition, mockCombatantSystem);

      expect(npc1.flashDisorientedUntil).toBeUndefined();
      expect(Logger.info).not.toHaveBeenCalledWith(
        'weapons',
        expect.stringContaining('Flashbang disoriented')
      );
    });

    it('should correctly handle combatants with different positions and states (complex scenario)', () => {
      const npcNearAlive = createMockCombatant('near_alive', new THREE.Vector3(5, 0, 0)); // Full disorient
      const npcMidAlive = createMockCombatant('mid_alive', new THREE.Vector3(18, 0, 0)); // Partial disorient
      const npcFarAlive = createMockCombatant('far_alive', new THREE.Vector3(26, 0, 0)); // Too far
      const npcNearDead = createMockCombatant('near_dead', new THREE.Vector3(8, 0, 0), CombatantState.DEAD); // Dead
      const npcMidDead = createMockCombatant('mid_dead', new THREE.Vector3(22, 0, 0), CombatantState.DEAD); // Dead

      mockCombatantSystem.combatants.set(npcNearAlive.id, npcNearAlive);
      mockCombatantSystem.combatants.set(npcMidAlive.id, npcMidAlive);
      mockCombatantSystem.combatants.set(npcFarAlive.id, npcFarAlive);
      mockCombatantSystem.combatants.set(npcNearDead.id, npcNearDead);
      mockCombatantSystem.combatants.set(npcMidDead.id, npcMidDead);

      (mockCombatantSystem as any).querySpatialRadius.mockReturnValue([
        npcNearAlive.id,
        npcMidAlive.id,
        npcFarAlive.id,
        npcNearDead.id,
        npcMidDead.id,
      ]);

      (grenadeEffects as any).applyNPCDisorientation(flashPosition, mockCombatantSystem);

      expect(npcNearAlive.flashDisorientedUntil).toBe(MOCK_DATE_NOW + 3000);
      expect(npcMidAlive.flashDisorientedUntil).toBe(MOCK_DATE_NOW + 1500);
      expect(npcFarAlive.flashDisorientedUntil).toBeUndefined(); // Too far
      expect(npcNearDead.flashDisorientedUntil).toBeUndefined(); // Dead
      expect(npcMidDead.flashDisorientedUntil).toBeUndefined(); // Dead

      expect(Logger.info).toHaveBeenCalledWith('weapons', 'Flashbang disoriented 2 NPCs');
    });
  });

  // Test suite for setFlashbangEffect()
  describe('setFlashbangEffect', () => {
    it('should store the flashbang effect reference', () => {
      const newEffect: IFlashbangScreenEffect = { triggerFlash: vi.fn() };
      grenadeEffects.setFlashbangEffect(newEffect);
      const flashbangGrenade = createMockGrenade(GrenadeType.FLASHBANG, new THREE.Vector3(0, 0, 0));

      // Call explodeFlashbang to ensure the new effect is used
      grenadeEffects.explodeGrenade(
        flashbangGrenade,
        mockImpactEffectsPool,
        mockExplosionEffectsPool,
        mockAudioManager,
        mockCombatantSystem,
        mockPlayerController
      );
      expect(newEffect.triggerFlash).toHaveBeenCalledTimes(1);
      expect(mockFlashbangEffect.triggerFlash).not.toHaveBeenCalled(); // Old mock should not be called
    });
  });
});
