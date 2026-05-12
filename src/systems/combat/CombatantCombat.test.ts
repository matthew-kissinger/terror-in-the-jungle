import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantCombat } from './CombatantCombat';
import { Combatant, CombatantState, Faction } from './types';
import { TracerPool } from '../effects/TracerPool';
import { MuzzleFlashSystem } from '../effects/MuzzleFlashSystem';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { TicketSystem } from '../world/TicketSystem';
import { AudioManager } from '../audio/AudioManager';
import { CombatantRenderer } from './CombatantRenderer';
import { IHUDSystem } from '../../types/SystemInterfaces';
import { TerrainSystem } from '../terrain/TerrainSystem';

const mockTracerPool: TracerPool = { spawn: vi.fn() } as any;
const mockMuzzleFlashSystem: MuzzleFlashSystem = { spawnNPC: vi.fn() } as any;
const mockImpactEffectsPool: ImpactEffectsPool = { spawn: vi.fn() } as any;
const mockCombatantRenderer: CombatantRenderer = { setDamageFlash: vi.fn() } as any;
const mockPlayerHealthSystem: PlayerHealthSystem = { takeDamage: vi.fn() } as any;
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
const mockTerrainSystem: TerrainSystem = {
  raycastTerrain: vi.fn(() => ({ hit: false, distance: undefined })),
  getEffectiveHeightAt: vi.fn(() => -1000),
} as any;

const mockScene = new THREE.Scene();

type WorldBuilderTestWindow = { __worldBuilder?: unknown };
type WorldBuilderTestGlobal = typeof globalThis & { window?: WorldBuilderTestWindow };

function clearWorldBuilderState(): void {
  delete (globalThis as WorldBuilderTestGlobal).window?.__worldBuilder;
}

function publishWorldBuilderState(oneShotKills: boolean): void {
  const global = globalThis as WorldBuilderTestGlobal;
  global.window = global.window ?? {};
  global.window.__worldBuilder = {
    invulnerable: false,
    infiniteAmmo: false,
    noClip: false,
    oneShotKills,
    shadowsEnabled: true,
    postProcessEnabled: true,
    hudVisible: true,
    ambientAudioEnabled: true,
    npcTickPaused: false,
    forceTimeOfDay: -1,
    active: true,
  };
}

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
    clearWorldBuilderState();

    combatantCombat = new CombatantCombat(
      mockScene,
      mockTracerPool,
      mockMuzzleFlashSystem,
      mockImpactEffectsPool,
      mockCombatantRenderer
    );

    combatantCombat.setPlayerHealthSystem(mockPlayerHealthSystem);
    combatantCombat.setTicketSystem(mockTicketSystem);
    combatantCombat.setAudioManager(mockAudioManager);
    combatantCombat.setHUDSystem(mockHUDSystem);
    combatantCombat.setTerrainSystem(mockTerrainSystem);

    vi.clearAllMocks();
    (mockTerrainSystem.raycastTerrain as any).mockReturnValue({ hit: false, distance: undefined });
    (mockTerrainSystem.getEffectiveHeightAt as any).mockReturnValue(-1000);
  });

  describe('updateCombat', () => {
    it('advances weapon cooldowns and burst cooldown each tick', () => {
      const combatant = createMockCombatant('test-1', Faction.US);
      combatant.burstCooldown = 0.5;

      combatantCombat.updateCombat(combatant, 0.016, new THREE.Vector3(0, 0, 0), new Map(), new Map());

      expect(combatant.gunCore.cooldown).toHaveBeenCalledWith(0.016);
      expect(combatant.burstCooldown).toBeLessThan(0.5);
    });

    it('does not fire when combatant is IDLE', () => {
      const combatant = createMockCombatant('test-1', Faction.US, 100, CombatantState.IDLE);

      combatantCombat.updateCombat(combatant, 0.016, new THREE.Vector3(0, 0, 0), new Map(), new Map());

      expect(combatant.gunCore.registerShot).not.toHaveBeenCalled();
    });

    it('does not fire when canFire returns false', () => {
      const combatant = createMockCombatant('test-1', Faction.US, 100, CombatantState.ENGAGING);
      const target = createMockCombatant('target-1', Faction.NVA);
      combatant.target = target;
      (combatant.gunCore.canFire as any) = vi.fn(() => false);

      combatantCombat.updateCombat(combatant, 0.016, new THREE.Vector3(0, 0, 0), new Map(), new Map());

      expect(combatant.gunCore.registerShot).not.toHaveBeenCalled();
    });

    it('tolerates a dead combatant or missing target without throwing', () => {
      const dead = createMockCombatant('dead', Faction.US, 0, CombatantState.DEAD);
      const targetless = createMockCombatant('t', Faction.US, 100, CombatantState.ENGAGING);
      targetless.target = undefined;

      expect(() => {
        combatantCombat.updateCombat(dead, 0.016, new THREE.Vector3(0, 0, 0), new Map(), new Map());
        combatantCombat.updateCombat(targetless, 0.016, new THREE.Vector3(0, 0, 0), new Map(), new Map());
      }).not.toThrow();
    });
  });

  describe('handlePlayerShot - hit resolution', () => {
    it('reports a hit with point/damage/headshot when the target is in the clear', () => {
      const target = createMockCombatant('target-1', Faction.NVA, 100);
      const allCombatants = new Map<string, Combatant>([['target-1', target]]);
      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));

      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(10, 0, 0),
        distance: 10,
        headshot: true,
      });

      const result = combatantCombat.handlePlayerShot(ray, (_d, isHeadshot) => (isHeadshot ? 150 : 50), allCombatants);

      expect(result.hit).toBe(true);
      expect(result.headshot).toBe(true);
      expect(result.damage).toBe(150);
      expect(result.point).toBeDefined();
    });

    it('reports a miss when no combatant is hit by the ray', () => {
      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue(null);

      const result = combatantCombat.handlePlayerShot(ray, () => 50, new Map());

      expect(result.hit).toBe(false);
    });

    it('uses visual Pixel Forge proxy positions for player shot damage', () => {
      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const allCombatants = new Map<string, Combatant>();
      const raycast = vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue(null);

      combatantCombat.handlePlayerShot(ray, () => 50, allCombatants);

      expect(raycast).toHaveBeenCalledWith(ray, Faction.US, allCombatants, { positionMode: 'visual' });
    });

    it('adds a kill to the HUD when the shot is lethal', () => {
      const target = createMockCombatant('target-1', Faction.NVA, 10);
      const allCombatants = new Map<string, Combatant>([['target-1', target]]);
      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));

      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(10, 0, 0),
        distance: 10,
        headshot: false,
      });

      const result = combatantCombat.handlePlayerShot(ray, () => 100, allCombatants);

      expect(result.killed).toBe(true);
      expect(mockHUDSystem.addKill).toHaveBeenCalled();
    });

    it('blocks the hit and reports the terrain impact point when terrain is closer than the target', () => {
      const target = createMockCombatant('target-1', Faction.NVA, 100);
      const allCombatants = new Map<string, Combatant>([['target-1', target]]);
      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));

      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(20, 0, 0),
        distance: 20,
        headshot: false,
      });
      (mockTerrainSystem.raycastTerrain as any).mockReturnValue({
        hit: true,
        point: new THREE.Vector3(8, 0, 0),
        distance: 8,
      });

      const result = combatantCombat.handlePlayerShot(ray, () => 50, allCombatants);

      expect(result.hit).toBe(false);
      expect(result.point.x).toBeCloseTo(8, 5);
      expect(target.health).toBe(100);
    });

    it('blocks a long-range hit when the height profile shows terrain occlusion beyond BVH range', () => {
      const target = createMockCombatant('target-1', Faction.NVA, 100);
      const allCombatants = new Map<string, Combatant>([['target-1', target]]);
      const ray = new THREE.Ray(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(1, 0, 0));

      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(250, 1.2, 0),
        distance: 250,
        headshot: false,
      });
      (mockTerrainSystem.raycastTerrain as any).mockReturnValue({ hit: false, distance: undefined });
      (mockTerrainSystem.getEffectiveHeightAt as any).mockImplementation((x: number) => (x >= 210 ? 1.5 : 0));

      const result = combatantCombat.handlePlayerShot(ray, () => 50, allCombatants);

      expect(result.hit).toBe(false);
      expect(target.health).toBe(100);
    });

    it('blocks a close-range hit when the BVH misses but the height profile shows a strong ridge', () => {
      const target = createMockCombatant('target-1', Faction.NVA, 100);
      const allCombatants = new Map<string, Combatant>([['target-1', target]]);
      const ray = new THREE.Ray(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(1, 0, 0));

      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(80, 1.2, 0),
        distance: 80,
        headshot: false,
      });
      (mockTerrainSystem.raycastTerrain as any).mockReturnValue({ hit: false, distance: undefined });
      (mockTerrainSystem.getEffectiveHeightAt as any).mockImplementation((x: number) => (
        x >= 36 && x <= 44 ? 2.6 : 0
      ));

      const result = combatantCombat.handlePlayerShot(ray, () => 50, allCombatants);

      expect(result.hit).toBe(false);
      expect(result.point.x).toBeCloseTo(36, 5);
      expect(target.health).toBe(100);
    });

    it('previews a close-range terrain block from the height profile when the BVH misses', () => {
      const target = createMockCombatant('target-1', Faction.NVA, 100);
      const allCombatants = new Map<string, Combatant>([['target-1', target]]);
      const ray = new THREE.Ray(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(1, 0, 0));

      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(80, 1.2, 0),
        distance: 80,
        headshot: false,
      });
      (mockTerrainSystem.raycastTerrain as any).mockReturnValue({ hit: false, distance: undefined });
      (mockTerrainSystem.getEffectiveHeightAt as any).mockImplementation((x: number) => (
        x >= 36 && x <= 44 ? 2.6 : 0
      ));

      const result = combatantCombat.previewPlayerShot(ray, allCombatants);

      expect(result.hit).toBe(false);
      expect(result.point.x).toBeCloseTo(36, 5);
      expect(target.health).toBe(100);
    });
  });

  // ── NPC combat response (B1): player shots must give the target a threat
  //    signal (hit flag + attacker bearing) so AI can react, and the kill feed
  //    path must not double-count player kills.
  describe('handlePlayerShot - NPC response contract (B1)', () => {
    afterEach(() => {
      clearWorldBuilderState();
    });

    it('flags lastHitTime and raises suppressionLevel on the shot target', () => {
      const target = createMockCombatant('target-1', Faction.NVA, 100, CombatantState.PATROLLING);
      const allCombatants = new Map<string, Combatant>([['target-1', target]]);
      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));

      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(10, 0, 0),
        distance: 10,
        headshot: false,
      });

      expect(target.lastHitTime).toBe(0);
      const startingSuppression = target.suppressionLevel;

      combatantCombat.handlePlayerShot(ray, () => 30, allCombatants);

      expect(target.lastHitTime).toBeGreaterThan(0);
      expect(target.suppressionLevel).toBeGreaterThan(startingSuppression);
    });

    it('records the player position as a threat bearing on the target', () => {
      const target = createMockCombatant('target-1', Faction.NVA, 100, CombatantState.PATROLLING);
      const allCombatants = new Map<string, Combatant>([['target-1', target]]);
      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));

      const playerPos = new THREE.Vector3(-7, 0, 12);
      combatantCombat.updateCombat(
        createMockCombatant('ticker', Faction.US),
        0.016,
        playerPos,
        new Map(),
        new Map()
      );

      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(10, 0, 0),
        distance: 10,
        headshot: false,
      });

      combatantCombat.handlePlayerShot(ray, () => 20, allCombatants);

      expect(target.lastKnownTargetPos).toBeInstanceOf(THREE.Vector3);
      expect(target.lastKnownTargetPos!.x).toBeCloseTo(playerPos.x);
      expect(target.lastKnownTargetPos!.z).toBeCloseTo(playerPos.z);
    });

    it('does not duplicate the kill feed entry when the player scores a lethal hit', () => {
      const target = createMockCombatant('target-1', Faction.NVA, 10);
      const allCombatants = new Map<string, Combatant>([['target-1', target]]);
      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));

      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(10, 0, 0),
        distance: 10,
        headshot: false,
      });

      const result = combatantCombat.handlePlayerShot(ray, () => 100, allCombatants, 'rifle');

      expect(result.killed).toBe(true);
      const calls = (mockHUDSystem.addKillToFeed as any).mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe('PLAYER');
    });

    it('lets the WorldBuilder one-shot flag make player hits lethal', () => {
      publishWorldBuilderState(true);

      const target = createMockCombatant('target-1', Faction.NVA, 100);
      const allCombatants = new Map<string, Combatant>([['target-1', target]]);
      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));

      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(10, 0, 0),
        distance: 10,
        headshot: false,
      });

      const result = combatantCombat.handlePlayerShot(ray, () => 1, allCombatants, 'rifle');

      expect(result.killed).toBe(true);
      expect(target.state).toBe(CombatantState.DEAD);
      expect(result.damage).toBe(100);
    });
  });

  describe('applyDamage', () => {
    it('delegates to the damage module with the given attacker + headshot flag', () => {
      const target = createMockCombatant('target-1', Faction.US, 100);
      const attacker = createMockCombatant('attacker-1', Faction.NVA, 100);
      vi.spyOn(combatantCombat['damage'], 'applyDamage');

      combatantCombat.applyDamage(target, 150, attacker, undefined, true);

      expect(combatantCombat['damage'].applyDamage).toHaveBeenCalledWith(
        target,
        150,
        attacker,
        undefined,
        true,
        undefined
      );
    });
  });
});
