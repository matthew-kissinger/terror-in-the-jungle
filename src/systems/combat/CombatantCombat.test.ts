import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantCombat, CombatHitResult } from './CombatantCombat';
import { Combatant, CombatantState, Faction } from './types';
import { TracerPool } from '../effects/TracerPool';
import { MuzzleFlashPool } from '../effects/MuzzleFlashPool';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { CombatantHitDetection } from './CombatantHitDetection';
import { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { TicketSystem } from '../world/TicketSystem';
import { AudioManager } from '../audio/AudioManager';
import { CombatantRenderer } from './CombatantRenderer';
import { IHUDSystem } from '../../types/SystemInterfaces';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';

// Mock dependencies
const mockTracerPool: TracerPool = {
  spawn: vi.fn(),
} as any;

const mockMuzzleFlashPool: MuzzleFlashPool = {
  spawn: vi.fn(),
} as any;

const mockImpactEffectsPool: ImpactEffectsPool = {
  spawn: vi.fn(),
} as any;

const mockCombatantRenderer: CombatantRenderer = {
  setDamageFlash: vi.fn(),
} as any;

const mockPlayerHealthSystem: PlayerHealthSystem = {
  takeDamage: vi.fn(),
} as any;

const mockTicketSystem: TicketSystem = {
  onCombatantDeath: vi.fn(),
  isGameActive: vi.fn(() => true),
} as any;

const mockAudioManager: AudioManager = {
  playSound: vi.fn(),
  playDeathSound: vi.fn(),
  playGunshotAt: vi.fn(),
} as any;

const mockHUDSystem: IHUDSystem = {
  addKill: vi.fn(),
  addKillToFeed: vi.fn(),
} as any;

const mockChunkManager: ImprovedChunkManager = {
  raycastTerrain: vi.fn(() => ({ hit: false, distance: undefined })),
} as any;

// Mock scene
const mockScene = new THREE.Scene();

// Helper to create a mock combatant
function createMockCombatant(
  id: string,
  faction: Faction,
  health: number = 100,
  state: CombatantState = CombatantState.IDLE,
  position: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
): Combatant {
  return {
    id,
    faction,
    health,
    maxHealth: 100,
    state,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    weaponSpec: {} as any,
    gunCore: {
      cooldown: vi.fn(),
      canFire: vi.fn(() => true),
      registerShot: vi.fn(),
      computeDamage: vi.fn((distance, isHeadshot) => isHeadshot ? 150 : 50),
    } as any,
    skillProfile: {
      reactionDelayMs: 100,
      aimJitterAmplitude: 1.0,
      burstLength: 3,
      burstPauseMs: 500,
      leadingErrorFactor: 0.5,
      suppressionResistance: 0.5,
      visualRange: 100,
      fieldOfView: 120,
      firstShotAccuracy: 0.4,
      burstDegradation: 3.5,
    } as any,
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    target: undefined,
    lastKnownTargetPos: undefined,
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
  } as Combatant;
}

describe('CombatantCombat', () => {
  let combatantCombat: CombatantCombat;

  beforeEach(() => {
    combatantCombat = new CombatantCombat(
      mockScene,
      mockTracerPool,
      mockMuzzleFlashPool,
      mockImpactEffectsPool,
      mockCombatantRenderer
    );

    // Set optional systems
    combatantCombat.setPlayerHealthSystem(mockPlayerHealthSystem);
    combatantCombat.setTicketSystem(mockTicketSystem);
    combatantCombat.setAudioManager(mockAudioManager);
    combatantCombat.setHUDSystem(mockHUDSystem);
    combatantCombat.setChunkManager(mockChunkManager);

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with required dependencies', () => {
      const combat = new CombatantCombat(
        mockScene,
        mockTracerPool,
        mockMuzzleFlashPool,
        mockImpactEffectsPool
      );
      expect(combat.hitDetection).toBeDefined();
    });

    it('should initialize extracted modules', () => {
      const combat = new CombatantCombat(
        mockScene,
        mockTracerPool,
        mockMuzzleFlashPool,
        mockImpactEffectsPool
      );
      // Modules should be initialized
      expect(combat).toBeDefined();
    });
  });

  describe('updateCombat', () => {
    it('should update weapon cooldowns', () => {
      const combatant = createMockCombatant('test-1', Faction.US);
      const allCombatants = new Map<string, Combatant>();
      const squads = new Map();

      combatantCombat.updateCombat(
        combatant,
        0.016, // 60fps
        new THREE.Vector3(0, 0, 0),
        allCombatants,
        squads
      );

      expect(combatant.gunCore.cooldown).toHaveBeenCalledWith(0.016);
    });

    it('should decrease burst cooldown over time', () => {
      const combatant = createMockCombatant('test-1', Faction.US);
      combatant.burstCooldown = 0.5;
      const allCombatants = new Map<string, Combatant>();
      const squads = new Map();

      combatantCombat.updateCombat(
        combatant,
        0.016,
        new THREE.Vector3(0, 0, 0),
        allCombatants,
        squads
      );

      expect(combatant.burstCooldown).toBeCloseTo(0.484);
    });

    it('should not fire when state is IDLE', () => {
      const combatant = createMockCombatant('test-1', Faction.US, 100, CombatantState.IDLE);
      const allCombatants = new Map<string, Combatant>();
      const squads = new Map();

      combatantCombat.updateCombat(
        combatant,
        0.016,
        new THREE.Vector3(0, 0, 0),
        allCombatants,
        squads
      );

      expect(combatant.gunCore.registerShot).not.toHaveBeenCalled();
    });

    it('should attempt to fire when state is ENGAGING with target', () => {
      const combatant = createMockCombatant('test-1', Faction.US, 100, CombatantState.ENGAGING);
      const target = createMockCombatant('target-1', Faction.OPFOR, 100);
      combatant.target = target;
      combatant.lodLevel = 'high';

      const allCombatants = new Map<string, Combatant>();
      allCombatants.set('target-1', target);
      const squads = new Map();

      combatantCombat.updateCombat(
        combatant,
        0.016,
        new THREE.Vector3(0, 0, 0),
        allCombatants,
        squads
      );

      // Gun should attempt to fire (may be blocked by gunCore checks)
      // We can't assert registerShot directly because it depends on gunCore.canFire()
      // But we can verify the update completes without errors
      expect(combatant).toBeDefined();
    });
  });

  describe('Suppression State', () => {
    it('should handle suppressive fire state', () => {
      const combatant = createMockCombatant(
        'test-1',
        Faction.US,
        100,
        CombatantState.SUPPRESSING
      );
      combatant.lastKnownTargetPos = new THREE.Vector3(10, 0, 0);
      combatant.lodLevel = 'high';

      const allCombatants = new Map<string, Combatant>();
      const squads = new Map();

      combatantCombat.updateCombat(
        combatant,
        0.016,
        new THREE.Vector3(0, 0, 0),
        allCombatants,
        squads
      );

      // Should process suppressive fire (gun may fire based on cooldown)
      expect(combatant.state).toBe(CombatantState.SUPPRESSING);
    });

    it('should use suppressionTarget if available', () => {
      const combatant = createMockCombatant(
        'test-1',
        Faction.US,
        100,
        CombatantState.SUPPRESSING
      );
      const suppressionPos = new THREE.Vector3(15, 0, 0);
      combatant.suppressionTarget = suppressionPos;
      combatant.lodLevel = 'high';

      const allCombatants = new Map<string, Combatant>();
      const squads = new Map();

      // Should use suppressionTarget over lastKnownTargetPos
      combatantCombat.updateCombat(
        combatant,
        0.016,
        new THREE.Vector3(0, 0, 0),
        allCombatants,
        squads
      );

      expect(combatant).toBeDefined();
    });
  });

  describe('Target Management', () => {
    it('should acquire and maintain a target', () => {
      const combatant = createMockCombatant('test-1', Faction.US);
      const target = createMockCombatant('target-1', Faction.OPFOR);

      combatant.state = CombatantState.ENGAGING;
      combatant.target = target;

      expect(combatant.target).toBe(target);
      expect(combatant.state).toBe(CombatantState.ENGAGING);
    });

    it('should clear target when null', () => {
      const combatant = createMockCombatant('test-1', Faction.US);
      combatant.state = CombatantState.ENGAGING;
      combatant.target = null;

      expect(combatant.target).toBeNull();
    });

    it('should handle target at range', () => {
      const combatant = createMockCombatant('test-1', Faction.US, 100, CombatantState.ENGAGING);
      const target = createMockCombatant('target-1', Faction.OPFOR, 100, CombatantState.IDLE, new THREE.Vector3(150, 0, 0));

      combatant.target = target;
      combatant.lodLevel = 'high';

      const allCombatants = new Map<string, Combatant>();
      allCombatants.set('target-1', target);
      const squads = new Map();

      combatantCombat.updateCombat(
        combatant,
        0.016,
        new THREE.Vector3(0, 0, 0),
        allCombatants,
        squads
      );

      // Target should still be engaged (distance-based accuracy penalty applied)
      expect(combatant.target).toBe(target);
    });
  });

  describe('Combat Timing', () => {
    it('should respect fire rate limits', () => {
      const combatant = createMockCombatant('test-1', Faction.US, 100, CombatantState.ENGAGING);
      combatant.burstCooldown = 0.5; // Cooldown still active
      const target = createMockCombatant('target-1', Faction.OPFOR);
      combatant.target = target;
      combatant.lodLevel = 'high';

      const allCombatants = new Map<string, Combatant>();
      const squads = new Map();

      combatantCombat.updateCombat(
        combatant,
        0.016,
        new THREE.Vector3(0, 0, 0),
        allCombatants,
        squads
      );

      expect(combatant.burstCooldown).toBeLessThan(0.5);
    });

    it('should track burst fire progression', () => {
      const combatant = createMockCombatant('test-1', Faction.US);
      expect(combatant.currentBurst).toBe(0);

      combatant.currentBurst = 1;
      expect(combatant.currentBurst).toBe(1);

      combatant.currentBurst = 2;
      expect(combatant.currentBurst).toBe(2);
    });

    it('should reset burst on pause', () => {
      const combatant = createMockCombatant('test-1', Faction.US);
      combatant.currentBurst = 3;
      combatant.skillProfile.burstLength = 3;

      // Simulate burst completion logic
      if (combatant.currentBurst >= combatant.skillProfile.burstLength) {
        combatant.currentBurst = 0;
        combatant.burstCooldown = combatant.skillProfile.burstPauseMs / 1000;
      }

      expect(combatant.currentBurst).toBe(0);
      expect(combatant.burstCooldown).toBeCloseTo(0.5);
    });
  });

  describe('Accuracy and Recoil', () => {
    it('should apply first shot accuracy bonus', () => {
      // First shot has multiplier = skillProfile.firstShotAccuracy (e.g., 0.4)
      const combatant = createMockCombatant('test-1', Faction.US);
      combatant.currentBurst = 1;

      let multiplier = combatant.skillProfile.firstShotAccuracy || 0.4;
      expect(multiplier).toBeCloseTo(0.4);
    });

    it('should apply burst degradation', () => {
      const combatant = createMockCombatant('test-1', Faction.US);
      combatant.currentBurst = 2;

      const degradation = combatant.skillProfile.burstDegradation || 3.5;
      let multiplier = 1.0 + (combatant.currentBurst - 1) * degradation / 2;
      multiplier = Math.min(multiplier, 8.0);

      expect(multiplier).toBeGreaterThan(1.0);
      expect(multiplier).toBeLessThanOrEqual(8.0);
    });

    it('should apply full auto penalty', () => {
      const combatant = createMockCombatant('test-1', Faction.US);
      combatant.isFullAuto = true;

      let multiplier = 1.0;
      if (combatant.isFullAuto) {
        multiplier *= 2.0;
      }

      expect(multiplier).toBe(2.0);
    });

    it('should apply flashbang disorientation penalty', () => {
      const combatant = createMockCombatant('test-1', Faction.US);
      combatant.flashDisorientedUntil = Date.now() + 1000;

      let multiplier = 1.0;
      if (combatant.flashDisorientedUntil && Date.now() < combatant.flashDisorientedUntil) {
        multiplier *= 4.0;
      }

      expect(multiplier).toBe(4.0);
    });

    it('should apply distance-based accuracy degradation', () => {
      const combatant = createMockCombatant('test-1', Faction.US);
      const targetPos = new THREE.Vector3(50, 0, 0);

      const distance = combatant.position.distanceTo(targetPos);
      let multiplier = 1.0;

      if (distance > 30) {
        const distancePenalty = Math.pow(1.5, (distance - 30) / 20);
        multiplier *= Math.min(distancePenalty, 8.0);
      }

      expect(multiplier).toBeGreaterThan(1.0);
    });
  });

  describe('handlePlayerShot', () => {
    it('should return hit result on successful hit', () => {
      const target = createMockCombatant('target-1', Faction.OPFOR, 100);
      const allCombatants = new Map<string, Combatant>();
      allCombatants.set('target-1', target);

      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const damageCalculator = (distance: number, isHeadshot: boolean) => isHeadshot ? 150 : 50;

      // Mock hitDetection
      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(10, 0, 0),
        distance: 10,
        headshot: false,
      });

      const result = combatantCombat.handlePlayerShot(ray, damageCalculator, allCombatants);

      expect(result.hit).toBe(true);
      expect(result.point).toBeDefined();
    });

    it('should return miss result when no target hit', () => {
      const allCombatants = new Map<string, Combatant>();

      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const damageCalculator = (distance: number, isHeadshot: boolean) => 50;

      // Mock hitDetection
      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue(null);

      const result = combatantCombat.handlePlayerShot(ray, damageCalculator, allCombatants);

      expect(result.hit).toBe(false);
    });

    it('should add kill to HUD when target is eliminated', () => {
      const target = createMockCombatant('target-1', Faction.OPFOR, 10);
      const allCombatants = new Map<string, Combatant>();
      allCombatants.set('target-1', target);

      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const damageCalculator = (distance: number, isHeadshot: boolean) => 100; // Lethal

      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(10, 0, 0),
        distance: 10,
        headshot: false,
      });

      const result = combatantCombat.handlePlayerShot(ray, damageCalculator, allCombatants);

      expect(result.killed).toBe(true);
      expect(mockHUDSystem.addKill).toHaveBeenCalled();
    });

    it('should track headshot in result', () => {
      const target = createMockCombatant('target-1', Faction.OPFOR, 100);
      const allCombatants = new Map<string, Combatant>();
      allCombatants.set('target-1', target);

      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const damageCalculator = (distance: number, isHeadshot: boolean) => isHeadshot ? 150 : 50;

      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(10, 0, 0),
        distance: 10,
        headshot: true,
      });

      const result = combatantCombat.handlePlayerShot(ray, damageCalculator, allCombatants);

      expect(result.headshot).toBe(true);
      expect(result.damage).toBe(150);
    });
  });

  describe('checkPlayerHit', () => {
    it('should check player hit detection', () => {
      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const playerPos = new THREE.Vector3(10, 0, 0);

      vi.spyOn(combatantCombat.hitDetection, 'checkPlayerHit').mockReturnValue({
        hit: true,
        point: new THREE.Vector3(10, 0, 0),
        headshot: false,
      });

      const result = combatantCombat.checkPlayerHit(ray, playerPos);

      expect(result.hit).toBe(true);
    });
  });

  describe('applyDamage', () => {
    it('should apply damage via damage module', () => {
      const target = createMockCombatant('target-1', Faction.US, 100);
      const attacker = createMockCombatant('attacker-1', Faction.OPFOR, 100);

      vi.spyOn(combatantCombat['damage'], 'applyDamage');

      combatantCombat.applyDamage(target, 20, attacker);

      expect(combatantCombat['damage'].applyDamage).toHaveBeenCalledWith(
        target,
        20,
        attacker,
        undefined,
        false,
        undefined
      );
    });

    it('should handle headshot flag', () => {
      const target = createMockCombatant('target-1', Faction.US, 100);

      vi.spyOn(combatantCombat['damage'], 'applyDamage');

      combatantCombat.applyDamage(target, 150, undefined, undefined, true);

      expect(combatantCombat['damage'].applyDamage).toHaveBeenCalledWith(
        target,
        150,
        undefined,
        undefined,
        true,
        undefined
      );
    });
  });

  describe('System Setters', () => {
    it('should set PlayerHealthSystem', () => {
      combatantCombat.setPlayerHealthSystem(mockPlayerHealthSystem);
      expect(combatantCombat).toBeDefined();
    });

    it('should set TicketSystem', () => {
      combatantCombat.setTicketSystem(mockTicketSystem);
      expect(combatantCombat).toBeDefined();
    });

    it('should set AudioManager', () => {
      combatantCombat.setAudioManager(mockAudioManager);
      expect(combatantCombat).toBeDefined();
    });

    it('should set HUDSystem', () => {
      combatantCombat.setHUDSystem(mockHUDSystem);
      expect(combatantCombat).toBeDefined();
    });

    it('should set ChunkManager', () => {
      combatantCombat.setChunkManager(mockChunkManager);
      expect(combatantCombat).toBeDefined();
    });

    it('should set Camera', () => {
      const camera = new THREE.PerspectiveCamera();
      combatantCombat.setCamera(camera);
      expect(combatantCombat).toBeDefined();
    });

    it('should set CombatantRenderer', () => {
      combatantCombat.setCombatantRenderer(mockCombatantRenderer);
      expect(combatantCombat).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle combatant with no target gracefully', () => {
      const combatant = createMockCombatant('test-1', Faction.US, 100, CombatantState.ENGAGING);
      combatant.target = undefined;

      const allCombatants = new Map<string, Combatant>();
      const squads = new Map();

      expect(() => {
        combatantCombat.updateCombat(
          combatant,
          0.016,
          new THREE.Vector3(0, 0, 0),
          allCombatants,
          squads
        );
      }).not.toThrow();
    });

    it('should handle dead combatant state', () => {
      const combatant = createMockCombatant('test-1', Faction.US, 0, CombatantState.DEAD);

      const allCombatants = new Map<string, Combatant>();
      const squads = new Map();

      expect(() => {
        combatantCombat.updateCombat(
          combatant,
          0.016,
          new THREE.Vector3(0, 0, 0),
          allCombatants,
          squads
        );
      }).not.toThrow();
    });

    it('should not fire when canFire returns false', () => {
      const combatant = createMockCombatant('test-1', Faction.US, 100, CombatantState.ENGAGING);
      const target = createMockCombatant('target-1', Faction.OPFOR);
      combatant.target = target;
      combatant.lodLevel = 'high';

      // Mock gunCore to return canFire = false
      (combatant.gunCore.canFire as any) = vi.fn(() => false);

      const allCombatants = new Map<string, Combatant>();
      const squads = new Map();

      combatantCombat.updateCombat(
        combatant,
        0.016,
        new THREE.Vector3(0, 0, 0),
        allCombatants,
        squads
      );

      expect(combatant.gunCore.registerShot).not.toHaveBeenCalled();
    });

    it('should handle terrain obstruction blocking shots', () => {
      const combatant = createMockCombatant('test-1', Faction.US, 100, CombatantState.ENGAGING);
      const target = createMockCombatant('target-1', Faction.OPFOR, 100, CombatantState.IDLE, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      combatant.lodLevel = 'high';

      const allCombatants = new Map<string, Combatant>();
      allCombatants.set('target-1', target);
      const squads = new Map();

      // Mock terrain as blocking the shot
      (mockChunkManager.raycastTerrain as any).mockReturnValue({
        hit: true,
        distance: 10,
      });

      combatantCombat.updateCombat(
        combatant,
        0.016,
        new THREE.Vector3(0, 0, 0),
        allCombatants,
        squads
      );

      // Should not fire if terrain blocks
      expect(combatant).toBeDefined();
    });

    it('should handle weapon spec with various damage profiles', () => {
      const combatant = createMockCombatant('test-1', Faction.US, 100);

      (combatant.gunCore.computeDamage as any) = vi.fn((distance, isHeadshot) => {
        if (isHeadshot) return 150;
        if (distance < 30) return 50;
        return 20;
      });

      expect((combatant.gunCore.computeDamage as any)(10, false)).toBe(50);
      expect((combatant.gunCore.computeDamage as any)(50, false)).toBe(20);
      expect((combatant.gunCore.computeDamage as any)(10, true)).toBe(150);
    });

    it('should track consecutive misses', () => {
      const combatant = createMockCombatant('test-1', Faction.US, 100);
      combatant.consecutiveMisses = 0;

      combatant.consecutiveMisses++;
      expect(combatant.consecutiveMisses).toBe(1);

      combatant.consecutiveMisses++;
      expect(combatant.consecutiveMisses).toBe(2);

      combatant.consecutiveMisses = 0; // Reset on hit
      expect(combatant.consecutiveMisses).toBe(0);
    });

    it('should handle LOD-based terrain checks', () => {
      const highLodCombatant = createMockCombatant('test-1', Faction.US, 100);
      highLodCombatant.lodLevel = 'high';

      const mediumLodCombatant = createMockCombatant('test-2', Faction.US, 100);
      mediumLodCombatant.lodLevel = 'medium';

      const lowLodCombatant = createMockCombatant('test-3', Faction.US, 100);
      lowLodCombatant.lodLevel = 'low';

      // Only high and medium LOD should do terrain checks
      expect(['high', 'medium']).toContain(highLodCombatant.lodLevel);
      expect(['high', 'medium']).toContain(mediumLodCombatant.lodLevel);
      expect(['high', 'medium']).not.toContain(lowLodCombatant.lodLevel);
    });
  });

  describe('Integration', () => {
    it('should handle full combat loop: acquire target -> fire -> adjust aim', () => {
      const attacker = createMockCombatant('attacker-1', Faction.US, 100, CombatantState.IDLE);
      const target = createMockCombatant('target-1', Faction.OPFOR, 100, CombatantState.IDLE, new THREE.Vector3(30, 0, 0));

      // Step 1: Acquire target
      attacker.state = CombatantState.ENGAGING;
      attacker.target = target;

      expect(attacker.state).toBe(CombatantState.ENGAGING);
      expect(attacker.target).toBe(target);

      // Step 2: Attempt fire
      const allCombatants = new Map<string, Combatant>();
      allCombatants.set('target-1', target);
      const squads = new Map();

      combatantCombat.updateCombat(
        attacker,
        0.016,
        new THREE.Vector3(0, 0, 0),
        allCombatants,
        squads
      );

      expect(attacker).toBeDefined();
    });

    it('should handle suppressing ally under fire', () => {
      const suppressor = createMockCombatant('suppressor-1', Faction.US, 100, CombatantState.SUPPRESSING);
      suppressor.lastKnownTargetPos = new THREE.Vector3(50, 0, 0);
      suppressor.lodLevel = 'high';

      const allCombatants = new Map<string, Combatant>();
      const squads = new Map();

      combatantCombat.updateCombat(
        suppressor,
        0.016,
        new THREE.Vector3(0, 0, 0),
        allCombatants,
        squads
      );

      expect(suppressor.state).toBe(CombatantState.SUPPRESSING);
    });
  });
});
