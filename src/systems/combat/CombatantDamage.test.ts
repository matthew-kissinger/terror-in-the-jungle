import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantDamage } from './CombatantDamage';
import { Combatant, CombatantState, Faction, Squad } from './types';
import { createTestCombatant } from '../../test-utils';
import { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { TicketSystem } from '../world/TicketSystem';
import { AudioManager } from '../audio/AudioManager';
import { CombatantRenderer } from './CombatantRenderer';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { IHUDSystem } from '../../types/SystemInterfaces';
import { spatialGridManager } from './SpatialGridManager';
import { KillAssistTracker } from './KillAssistTracker';

const mockPlayerHealthSystem: PlayerHealthSystem = { takeDamage: vi.fn() } as any;
const mockTicketSystem: TicketSystem = { onCombatantDeath: vi.fn() } as any;
const mockAudioManager: AudioManager = { playDeathSound: vi.fn() } as any;
const mockHUDSystem: IHUDSystem = {
  addDeath: vi.fn(),
  addKillToFeed: vi.fn(),
  addAssist: vi.fn(),
} as any;
const mockCombatantRenderer: CombatantRenderer = { setDamageFlash: vi.fn() } as any;
const mockCameraShakeSystem: CameraShakeSystem = { shakeFromNearbyDeath: vi.fn() } as any;
const mockImpactEffectsPool: ImpactEffectsPool = { spawn: vi.fn() } as any;

vi.mock('./SpatialGridManager', () => ({
  spatialGridManager: {
    getIsInitialized: vi.fn(() => true),
    queryRadius: vi.fn(() => []),
  },
}));

vi.mock('./KillAssistTracker', () => ({
  KillAssistTracker: {
    trackDamage: vi.fn(),
    processKillAssists: vi.fn(() => new Set<string>()),
  },
}));

function createMockCombatant(
  id: string,
  faction: Faction,
  health: number,
  state: CombatantState = CombatantState.IDLE,
  squadId?: string
): Combatant {
  return createTestCombatant({
    id,
    faction,
    health,
    state,
    squadId,
    isDying: false,
    deathProgress: 0,
    deathStartTime: 0,
    deathAnimationType: null as any,
    deathDirection: undefined,
  });
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
    combatantDamage.updatePlayerPosition(new THREE.Vector3(0, 0, 0));

    vi.clearAllMocks();
    (spatialGridManager.getIsInitialized as vi.Mock).mockReturnValue(true);
    (spatialGridManager.queryRadius as vi.Mock).mockReturnValue([]);
    (KillAssistTracker.processKillAssists as vi.Mock).mockReturnValue(new Set<string>());
  });

  describe('applyDamage - non-lethal hits', () => {
    it('reduces health, stamps lastHitTime, and raises suppressionLevel', () => {
      const target = createMockCombatant('target-1', Faction.US, 100);

      combatantDamage.applyDamage(target, 20);

      expect(target.health).toBe(80);
      expect(target.lastHitTime).toBeGreaterThan(0);
      expect(target.suppressionLevel).toBeGreaterThan(0);
    });

    it('triggers damage flash via CombatantRenderer', () => {
      const target = createMockCombatant('target-1', Faction.US, 100);

      combatantDamage.applyDamage(target, 10);

      expect(mockCombatantRenderer.setDamageFlash).toHaveBeenCalledWith('target-1', 1.0);
    });

    it('tracks damage attribution via KillAssistTracker when an attacker is present', () => {
      const target = createMockCombatant('target-1', Faction.US, 100);
      const attacker = createMockCombatant('attacker-1', Faction.NVA, 100);

      combatantDamage.applyDamage(target, 10, attacker);

      expect(KillAssistTracker.trackDamage).toHaveBeenCalledWith(target, 'attacker-1', 10);
    });

    it('is a safe no-op when the target is undefined', () => {
      expect(() => combatantDamage.applyDamage(undefined as any, 20)).not.toThrow();
    });
  });

  describe('applyDamage - lethal hits', () => {
    it('marks the target DEAD, increments deaths, and starts a death animation', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);

      combatantDamage.applyDamage(target, 20);

      expect(target.health).toBeLessThanOrEqual(0);
      expect(target.state).toBe(CombatantState.DEAD);
      expect(target.deaths).toBe(1);
      expect(target.isDying).toBe(true);
      expect(target.deathAnimationType).toBeTruthy();
    });

    it('increments attacker kills for a non-player combatant attacker', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      const attacker = createMockCombatant('attacker-1', Faction.NVA, 100);

      combatantDamage.applyDamage(target, 20, attacker);

      expect(attacker.kills).toBe(1);
    });

    it('credits a player assist when KillAssistTracker reports PLAYER in the set', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      target.damageHistory = [{ attackerId: 'some-attacker', damage: 1, timestamp: Date.now() }];
      const attacker = createMockCombatant('attacker-1', Faction.NVA, 100);
      (KillAssistTracker.processKillAssists as vi.Mock).mockReturnValue(new Set<string>(['PLAYER']));

      combatantDamage.applyDamage(target, 20, attacker);

      expect(mockHUDSystem.addAssist).toHaveBeenCalled();
    });

    it('orients the death direction away from the attacker', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      target.position.set(5, 0, 0);
      const attacker = createMockCombatant('attacker-1', Faction.NVA, 100);
      attacker.position.set(0, 0, 0);

      combatantDamage.applyDamage(target, 20, attacker);

      expect(target.deathDirection).toBeInstanceOf(THREE.Vector3);
      expect(target.deathDirection!.x).toBeCloseTo(1);
    });

    it('plays a death sound and informs the ticket system', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);

      combatantDamage.applyDamage(target, 20);

      expect(mockAudioManager.playDeathSound).toHaveBeenCalled();
      expect(mockTicketSystem.onCombatantDeath).toHaveBeenCalledWith(Faction.US);
    });

    it('emits an AI-on-AI kill feed entry with killer + victim faction-coded ids', () => {
      const target = createMockCombatant('target-0002', Faction.US, 10);
      const attacker = createMockCombatant('attacker-0001', Faction.NVA, 100);

      combatantDamage.applyDamage(target, 20, attacker);

      expect(mockHUDSystem.addKillToFeed).toHaveBeenCalledWith(
        'NVA-0001',
        Faction.NVA,
        'US-0002',
        Faction.US,
        expect.any(Boolean),
        expect.any(String)
      );
    });

    it('removes the dead combatant from their squad members list', () => {
      const target = createMockCombatant('target-1', Faction.US, 10, CombatantState.IDLE, 'squad-A');
      const squadA: Squad = { id: 'squad-A', faction: Faction.US, members: ['target-1', 'member-2'], formation: 'line' };
      const squads = new Map<string, Squad>([['squad-A', squadA]]);

      combatantDamage.applyDamage(target, 20, undefined, squads);

      expect(squadA.members).toEqual(['member-2']);
    });

    it('does not crash when optional systems are missing', () => {
      const target = createMockCombatant('target-1', Faction.US, 10);
      const bare = new CombatantDamage();

      expect(() => bare.applyDamage(target, 20)).not.toThrow();
    });
  });
});
