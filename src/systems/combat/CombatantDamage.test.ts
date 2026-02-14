import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantDamage } from './CombatantDamage';
import { Combatant, CombatantState, Faction, Squad } from './types';
import { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { TicketSystem } from '../world/TicketSystem';
import { AudioManager } from '../audio/AudioManager';
import { CombatantRenderer } from './CombatantRenderer';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { VoiceCalloutSystem, CalloutType } from '../audio/VoiceCalloutSystem';
import { IHUDSystem } from '../../types/SystemInterfaces';
import { spatialGridManager } from './SpatialGridManager';
import { KillAssistTracker } from './KillAssistTracker';

// Mock dependencies
const mockPlayerHealthSystem: PlayerHealthSystem = {
  takeDamage: vi.fn(),
} as any;

const mockTicketSystem: TicketSystem = {
  onCombatantDeath: vi.fn(),
} as any;

const mockAudioManager: AudioManager = {
  playDeathSound: vi.fn(),
} as any;

const mockHUDSystem: IHUDSystem = {
  addDeath: vi.fn(),
  addKillToFeed: vi.fn(),
  addAssist: vi.fn(),
} as any;

const mockCombatantRenderer: CombatantRenderer = {
  setDamageFlash: vi.fn(),
} as any;

const mockCameraShakeSystem: CameraShakeSystem = {
  shakeFromNearbyDeath: vi.fn(),
} as any;

const mockImpactEffectsPool: ImpactEffectsPool = {
  spawn: vi.fn(),
} as any;

const mockVoiceCalloutSystem: VoiceCalloutSystem = {
  triggerCallout: vi.fn(),
} as any;

// Mock spatialGridManager
vi.mock('./SpatialGridManager', () => ({
  spatialGridManager: {
    getIsInitialized: vi.fn(() => true),
    queryRadius: vi.fn(() => []),
  },
}));

// Mock KillAssistTracker
vi.mock('./KillAssistTracker', () => ({
  KillAssistTracker: {
    trackDamage: vi.fn(),
    processKillAssists: vi.fn(() => new Set<string>()),
  },
}));

// Helper to create a mock combatant
function createMockCombatant(
  id: string,
  faction: Faction,
  health: number,
  state: CombatantState = CombatantState.IDLE,
  isPlayerProxy: boolean = false,
  squadId?: string
): Combatant {
  return {
    id,
    faction,
    health,
    maxHealth: 100,
    state,
    position: new THREE.Vector3(0, 0, 0),
    isPlayerProxy,
    lastHitTime: 0,
    suppressionLevel: 0,
    deaths: 0,
    kills: 0,
    isDying: false,
    deathProgress: 0,
    deathStartTime: 0,
    deathAnimationType: null as any,
    deathDirection: undefined,
    squadId,
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any,
    damageHistory: [],
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    reactionTimer: 0,
    alertTimer: 0,
    isFullAuto: false,
    panicLevel: 0,
    consecutiveMisses: 0,
    wanderAngle: 0,
    timeToDirectionChange: 0,
    lastUpdateTime: 0,
    updatePriority: 0,
    lodLevel: 'high',
  } as Combatant;
}

describe('CombatantDamage', () => {
  let combatantDamage: CombatantDamage;

  beforeEach(() => {
    combatantDamage = new CombatantDamage();
    combatantDamage.setPlayerHealthSystem(mockPlayerHealthSystem);
    combatantDamage.setTicketSystem(mockTicketSystem);
    combatantDamage.setAudioManager(mockAudioManager);
    combatantDamage.setHUDSystem(mockHUDSystem);
    combatantDamage.setCombatantRenderer(mockCombatantRenderer);
    combatantDamage.setCameraShakeSystem(mockCameraShakeSystem);
    combatantDamage.setImpactEffectsPool(mockImpactEffectsPool);
    combatantDamage.setVoiceCalloutSystem(mockVoiceCalloutSystem);
    combatantDamage.updatePlayerPosition(new THREE.Vector3(0, 0, 0));

    // Reset all mocks
    vi.clearAllMocks();
    (spatialGridManager.getIsInitialized as vi.Mock).mockReturnValue(true);
    (spatialGridManager.queryRadius as vi.Mock).mockReturnValue([]);
    (KillAssistTracker.processKillAssists as vi.Mock).mockReturnValue(new Set<string>());
  });

  describe('applyDamage', () => {
    it('should reduce combatant health correctly', () => {
      const target = createMockCombatant('target-1', Faction.US, 100);
      combatantDamage.applyDamage(target, 20);
      expect(target.health).toBe(80);
      expect(target.lastHitTime).toBeGreaterThan(0);
      expect(target.suppressionLevel).toBeCloseTo(0.3);
    });

    it('should not process damage if target is undefined', () => {
      const target = undefined as any;
      combatantDamage.applyDamage(target, 20);
      // No errors should be thrown, and no state changes on a non-existent target
      expect(true).toBe(true); // Placeholder for asserting no crash
    });

    it('should set damage flash in CombatantRenderer', () => {
      const target = createMockCombatant('target-1', Faction.US, 100);
      combatantDamage.applyDamage(target, 10);
      expect(mockCombatantRenderer.setDamageFlash).toHaveBeenCalledWith('target-1', 1.0);
    });

    it('should track damage for KillAssistTracker', () => {
      const target = createMockCombatant('target-1', Faction.US, 100);
      const attacker = createMockCombatant('attacker-1', Faction.OPFOR, 100);
      combatantDamage.applyDamage(target, 10, attacker);
      expect(KillAssistTracker.trackDamage).toHaveBeenCalledWith(target, 'attacker-1', 10);
    });

    it('should handle player proxy damage via PlayerHealthSystem', () => {
      const playerProxy = createMockCombatant('player-proxy', Faction.US, 100, CombatantState.IDLE, true);
      combatantDamage.applyDamage(playerProxy, 30);
      expect(mockPlayerHealthSystem.takeDamage).toHaveBeenCalledWith(30, undefined, playerProxy.position);
      expect(playerProxy.health).toBe(100); // Player proxy health handled by PlayerHealthSystem
    });

    it('should trigger player death HUD and kill feed if player proxy dies', () => {
      const playerProxy = createMockCombatant('player-proxy', Faction.US, 100, CombatantState.IDLE, true);
      const attacker = createMockCombatant('attacker-0001', Faction.OPFOR, 100);
      (mockPlayerHealthSystem.takeDamage as vi.Mock).mockReturnValue(true); // Player dies

      combatantDamage.applyDamage(playerProxy, 100, attacker);

      expect(mockHUDSystem.addDeath).toHaveBeenCalled();
      expect(mockHUDSystem.addKillToFeed).toHaveBeenCalledWith(
        'OPFOR-0001',
        Faction.OPFOR,
        'PLAYER',
        Faction.US,
        false,
        'rifle'
      );
    });

    it('should not trigger player death HUD if player proxy does not die', () => {
      const playerProxy = createMockCombatant('player-proxy', Faction.US, 100, CombatantState.IDLE, true);
      (mockPlayerHealthSystem.takeDamage as vi.Mock).mockReturnValue(false); // Player does not die

      combatantDamage.applyDamage(playerProxy, 10);

      expect(mockHUDSystem.addDeath).not.toHaveBeenCalled();
      expect(mockHUDSystem.addKillToFeed).not.toHaveBeenCalled();
    });

    it('should trigger voice callout on hit (with probability)', () => {
      const target = createMockCombatant('target-1', Faction.US, 100);
      vi.spyOn(Math, 'random').mockReturnValue(0.1); // Ensure callout triggers
      combatantDamage.applyDamage(target, 10);
      expect(mockVoiceCalloutSystem.triggerCallout).toHaveBeenCalledWith(target, CalloutType.TAKING_FIRE, target.position);
      vi.spyOn(Math, 'random').mockRestore();
    });

    it('should not trigger voice callout on hit (with probability)', () => {
      const target = createMockCombatant('target-1', Faction.US, 100);
      vi.spyOn(Math, 'random').mockReturnValue(0.9); // Ensure callout does not trigger
      combatantDamage.applyDamage(target, 10);
      expect(mockVoiceCalloutSystem.triggerCallout).not.toHaveBeenCalled();
      vi.spyOn(Math, 'random').mockRestore();
    });
  });

  describe('handleDeath (indirectly via applyDamage when health <= 0)', () => {
    it('should set combatant state to DEAD and increment deaths', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      combatantDamage.applyDamage(target, 20); // Health becomes -10
      expect(target.health).toBeLessThanOrEqual(0);
      expect(target.state).toBe(CombatantState.DEAD);
      expect(target.deaths).toBe(1);
    });

    it('should increment attacker kills if attacker exists and is not player proxy', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      const attacker = createMockCombatant('attacker-1', Faction.OPFOR, 100);
      combatantDamage.applyDamage(target, 20, attacker);
      expect(attacker.kills).toBe(1);
    });

    it('should not increment attacker kills if attacker is player proxy', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      const playerProxyAttacker = createMockCombatant('player-proxy', Faction.US, 100, CombatantState.IDLE, true);
      combatantDamage.applyDamage(target, 20, playerProxyAttacker);
      expect(playerProxyAttacker.kills).toBe(0);
    });

    it('should process kill assists via KillAssistTracker', () => {
      const target = createMockCombatant('target-0002', Faction.US, 10);
      target.damageHistory = [{ attackerId: 'some-attacker', damage: 1, timestamp: Date.now() }];
      const attacker = createMockCombatant('attacker-0001', Faction.OPFOR, 100);
      combatantDamage.applyDamage(target, 20, attacker);
      expect(KillAssistTracker.processKillAssists).toHaveBeenCalledWith(target, 'attacker-0001');
    });

    it('should call hudSystem.addAssist if player gets an assist', () => {
      const target = createMockCombatant('target-0003', Faction.US, 10);
      target.damageHistory = [{ attackerId: 'some-attacker', damage: 1, timestamp: Date.now() }];
      const attacker = createMockCombatant('attacker-0004', Faction.OPFOR, 100);
      (KillAssistTracker.processKillAssists as vi.Mock).mockReturnValue(new Set<string>(['PLAYER']));
      combatantDamage.applyDamage(target, 20, attacker);
      expect(mockHUDSystem.addAssist).toHaveBeenCalled();
    });

    it('should initialize death animation properties', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      combatantDamage.applyDamage(target, 20);
      expect(target.isDying).toBe(true);
      expect(target.deathProgress).toBe(0);
      expect(target.deathStartTime).toBeGreaterThan(0);
    });

    it('should set death animation type based on headshot', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      combatantDamage.applyDamage(target, 10, undefined, undefined, true); // isHeadshot = true
      expect(target.deathAnimationType).toBe('shatter');
    });

    it('should set death animation type based on high damage', () => {
      const target = createMockCombatant('target-1', Faction.US, 85);
      combatantDamage.applyDamage(target, 85); // damage > 80
      expect(target.deathAnimationType).toBe('spinfall');
    });

    it('should set death animation type to crumple for normal damage', () => {
      const target = createMockCombatant('target-1', Faction.US, 20);
      combatantDamage.applyDamage(target, 20); // normal damage
      expect(target.deathAnimationType).toBe('crumple');
    });

    it('should calculate death direction from attacker position', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      target.position.set(5, 0, 0);
      const attacker = createMockCombatant('attacker-1', Faction.OPFOR, 100);
      attacker.position.set(0, 0, 0);
      combatantDamage.applyDamage(target, 20, attacker);
      expect(target.deathDirection).toBeInstanceOf(THREE.Vector3);
      // Direction from attacker (0,0,0) to target (5,0,0) should be (1,0,0)
      expect(target.deathDirection?.x).toBeCloseTo(1);
      expect(target.deathDirection?.y).toBeCloseTo(0);
      expect(target.deathDirection?.z).toBeCloseTo(0);
    });

    it('should default death direction if no attacker', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      target.rotation = Math.PI / 2; // Facing +Z
      combatantDamage.applyDamage(target, 20);
      expect(target.deathDirection).toBeInstanceOf(THREE.Vector3);
      // Default to falling backward: if rotation is PI/2 (facing +Z), then backward is -Z
      // cos(PI/2)=0, sin(PI/2)=1. scratchDeathDir becomes (0,0,1)*-1 = (0,0,-1)
      expect(target.deathDirection?.x).toBeCloseTo(0);
      expect(target.deathDirection?.y).toBeCloseTo(0);
      expect(target.deathDirection?.z).toBeCloseTo(-1);
    });

    it('should trigger "Man down!" callout for nearby allies (with probability)', () => {
      const target = createMockCombatant('target-1', Faction.US, 10, CombatantState.IDLE, false, 'squad-1');
      target.position.set(0, 0, 0); // Set target position to ensure ally is nearby
      const attacker = createMockCombatant('attacker-1', Faction.OPFOR, 100);
      const ally1 = createMockCombatant('ally-1', Faction.US, 100, CombatantState.IDLE, false, 'squad-1');
      ally1.position.set(10, 0, 0);
      const allCombatants = new Map<string, Combatant>();
      allCombatants.set(target.id, target);
      allCombatants.set(ally1.id, ally1);

      (spatialGridManager.queryRadius as vi.Mock).mockReturnValue([ally1.id]);
      vi.spyOn(Math, 'random').mockReturnValue(0.3); // Consistently return value that prevents TAKING_FIRE

      combatantDamage.applyDamage(target, 20, attacker, undefined, false, allCombatants);
      
      // Now mock random again specifically for MAN_DOWN check
      (Math.random as vi.Mock).mockReturnValueOnce(0.1); // Trigger MAN_DOWN callout

      combatantDamage['triggerManDownCallout'](target, allCombatants); // Call directly to test
      expect(mockVoiceCalloutSystem.triggerCallout).toHaveBeenCalledWith(ally1, CalloutType.MAN_DOWN, ally1.position);
      vi.spyOn(Math, 'random').mockRestore();
    });

    it('should spawn death effects via ImpactEffectsPool', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      target.position.set(0, 0, 0);
      target.rotation = Math.PI; // Face +X direction, default backward fall is -X
      combatantDamage.applyDamage(target, 20);

      expect(mockImpactEffectsPool.spawn).toHaveBeenCalled();
      const expectedPos = new THREE.Vector3(0, 1.5, 0);
      // Expected direction should be based on target.rotation = Math.PI, negated.
      // Math.cos(Math.PI) = -1, Math.sin(Math.PI) = 0. So scratchDeathDir = (-1, 0, 0) * -1 = (1, 0, 0)
      // Then negated for splatter: (-1, 0, 0)
      const expectedDir = new THREE.Vector3(-1, 0, 0);
      const [receivedPos, receivedDir] = (mockImpactEffectsPool.spawn as vi.Mock).mock.calls[0];

      expect(receivedPos.x).toBeCloseTo(expectedPos.x);
      expect(receivedPos.y).toBeCloseTo(expectedPos.y);
      expect(receivedPos.z).toBeCloseTo(expectedPos.z);
      expect(receivedDir.x).toBeCloseTo(expectedDir.x);
      expect(receivedDir.y).toBeCloseTo(expectedDir.y);
      expect(receivedDir.z).toBeCloseTo(expectedDir.z);
    });

    it('should shake camera for nearby deaths', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      target.position.set(5, 0, 0);
      combatantDamage.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      combatantDamage.applyDamage(target, 20);
      expect(mockCameraShakeSystem.shakeFromNearbyDeath).toHaveBeenCalledWith(target.position, combatantDamage['playerPosition']);
    });

    it('should play death sound via AudioManager', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      combatantDamage.applyDamage(target, 20);
      expect(mockAudioManager.playDeathSound).toHaveBeenCalledWith(target.position, true); // US faction is ally
    });

    it('should update ticket system on death', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      combatantDamage.applyDamage(target, 20);
      expect(mockTicketSystem.onCombatantDeath).toHaveBeenCalledWith(Faction.US);
    });

    it('should add AI-on-AI kill to HUD kill feed', () => {
      const target = createMockCombatant('target-0002', Faction.US, 10);
      const attacker = createMockCombatant('attacker-0001', Faction.OPFOR, 100); // ID for slice(-4)
      combatantDamage.applyDamage(target, 20, attacker);
      expect(mockHUDSystem.addKillToFeed).toHaveBeenCalledWith(
        'OPFOR-0001', // attacker.id.slice(-4)
        Faction.OPFOR,
        'US-0002', // target.id.slice(-4)
        Faction.US,
        false,
        'rifle'
      );
    });

    it('should remove dead combatant from squad', () => {
      const target = createMockCombatant('target-1', Faction.US, 10, CombatantState.IDLE, false, 'squad-A');
      const squadA: Squad = { id: 'squad-A', faction: Faction.US, members: ['target-1', 'member-2'], formation: 'line' };
      const squads = new Map<string, Squad>([['squad-A', squadA]]);

      combatantDamage.applyDamage(target, 20, undefined, squads);

      expect(squadA.members).toEqual(['member-2']);
    });

    it('should not crash if optional systems are undefined', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      const combatantDamageWithoutSystems = new CombatantDamage(); // No systems set

      // Should not throw an error
      combatantDamageWithoutSystems.applyDamage(target, 20);
      expect(true).toBe(true); // Placeholder for asserting no crash
    });
  });

  describe('getKillerName/getVictimName logic within kill feed updates', () => {
    it('should correctly format killer name for AI attacker', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      const attacker = createMockCombatant('killer-5678', Faction.OPFOR, 100);
      combatantDamage.applyDamage(target, 20, attacker);
      expect(mockHUDSystem.addKillToFeed).toHaveBeenCalledWith(
        'OPFOR-5678',
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Boolean),
        expect.any(String)
      );
    });

    it('should correctly format victim name for AI target', () => {
      const target = createMockCombatant('victim-1234', Faction.US, 10);
      const attacker = createMockCombatant('killer-5678', Faction.OPFOR, 100);
      combatantDamage.applyDamage(target, 20, attacker);
      expect(mockHUDSystem.addKillToFeed).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'US-1234',
        expect.any(String),
        expect.any(Boolean),
        expect.any(String)
      );
    });

    it('should use "PLAYER" for player proxy as victim', () => {
      const playerProxy = createMockCombatant('player-proxy', Faction.US, 100, CombatantState.IDLE, true);
      const attacker = createMockCombatant('attacker-1', Faction.OPFOR, 100);
      (mockPlayerHealthSystem.takeDamage as vi.Mock).mockReturnValue(true); // Player dies

      combatantDamage.applyDamage(playerProxy, 100, attacker);
      expect(mockHUDSystem.addKillToFeed).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'PLAYER',
        expect.any(String),
        expect.any(Boolean),
        expect.any(String)
      );
    });
  });

  describe('VoiceCalloutSystem integration', () => {
    it('should trigger Man Down callout if spatialGridManager is not initialized but fallback behavior is used', () => {
      (spatialGridManager.getIsInitialized as vi.Mock).mockReturnValue(false); // Simulate uninitialized grid

      const target = createMockCombatant('target-1', Faction.US, 10, CombatantState.IDLE, false, 'squad-1');
      target.position.set(0, 0, 0); // Set target position to ensure ally is nearby
      const attacker = createMockCombatant('attacker-1', Faction.OPFOR, 100);
      const ally1 = createMockCombatant('ally-1', Faction.US, 100, CombatantState.IDLE, false, 'squad-1');
      ally1.position.set(10, 0, 0);
      const allCombatants = new Map<string, Combatant>();
      allCombatants.set(target.id, target);
      allCombatants.set(ally1.id, ally1);

      vi.spyOn(Math, 'random').mockReturnValue(0.3); // Consistently return value that prevents TAKING_FIRE

      combatantDamage.applyDamage(target, 20, attacker, undefined, false, allCombatants);

      // Now mock random again specifically for MAN_DOWN check
      (Math.random as vi.Mock).mockReturnValueOnce(0.1); // Trigger MAN_DOWN callout

      combatantDamage['triggerManDownCallout'](target, allCombatants); // Call directly to test
      expect(mockVoiceCalloutSystem.triggerCallout).toHaveBeenCalledWith(ally1, CalloutType.MAN_DOWN, ally1.position);
      vi.spyOn(Math, 'random').mockRestore();
    });

    it('should not trigger Man Down callout if no nearby allies', () => {
      const target = createMockCombatant('target-1', Faction.US, 10, CombatantState.IDLE, false, 'squad-1');
      const attacker = createMockCombatant('attacker-1', Faction.OPFOR, 100);
      const allCombatants = new Map<string, Combatant>();
      allCombatants.set(target.id, target);
      
      (spatialGridManager.queryRadius as vi.Mock).mockReturnValue([]); // No allies found

      vi.spyOn(Math, 'random').mockReturnValueOnce(0.1); // Try to trigger man down callout

      combatantDamage.applyDamage(target, 20, attacker, undefined, false, allCombatants);

      expect(mockVoiceCalloutSystem.triggerCallout).not.toHaveBeenCalledWith(expect.anything(), CalloutType.MAN_DOWN, expect.anything());
      vi.spyOn(Math, 'random').mockRestore();
    });

    it('should not trigger Man Down callout if nearby ally is dead', () => {
      const target = createMockCombatant('target-1', Faction.US, 10, CombatantState.IDLE, false, 'squad-1');
      const attacker = createMockCombatant('attacker-1', Faction.OPFOR, 100);
      const deadAlly = createMockCombatant('dead-ally', Faction.US, 0, CombatantState.DEAD, false, 'squad-1');
      deadAlly.position.set(10, 0, 0);
      const allCombatants = new Map<string, Combatant>();
      allCombatants.set(target.id, target);
      allCombatants.set(deadAlly.id, deadAlly);

      (spatialGridManager.queryRadius as vi.Mock).mockReturnValue([deadAlly.id]);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);

      combatantDamage.applyDamage(target, 20, attacker, undefined, false, allCombatants);

      expect(mockVoiceCalloutSystem.triggerCallout).not.toHaveBeenCalledWith(expect.anything(), CalloutType.MAN_DOWN, expect.anything());
      vi.spyOn(Math, 'random').mockRestore();
    });

    it('should not trigger Man Down callout if nearby ally is of different faction', () => {
      const target = createMockCombatant('target-1', Faction.US, 10, CombatantState.IDLE, false, 'squad-1');
      const attacker = createMockCombatant('attacker-1', Faction.OPFOR, 100);
      const enemyAlly = createMockCombatant('enemy-ally', Faction.OPFOR, 100, CombatantState.IDLE, false, 'squad-2');
      enemyAlly.position.set(10, 0, 0);
      const allCombatants = new Map<string, Combatant>();
      allCombatants.set(target.id, target);
      allCombatants.set(enemyAlly.id, enemyAlly);

      (spatialGridManager.queryRadius as vi.Mock).mockReturnValue([enemyAlly.id]);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);

      combatantDamage.applyDamage(target, 20, attacker, undefined, false, allCombatants);

      expect(mockVoiceCalloutSystem.triggerCallout).not.toHaveBeenCalledWith(expect.anything(), CalloutType.MAN_DOWN, expect.anything());
      vi.spyOn(Math, 'random').mockRestore();
    });
  });
});
