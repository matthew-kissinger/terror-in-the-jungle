// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
import {
  getCombatFireRaycastBudgetStats,
  resetCombatFireRaycastBudget,
  tryConsumeCombatFireRaycast,
} from './ai/CombatFireRaycastBudget';
import { NPC_Y_OFFSET } from '../../config/CombatantConfig';
import { performanceTelemetry } from '../debug/PerformanceTelemetry';

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
    simLane: 'high',
    renderLane: 'culled',
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
    resetCombatFireRaycastBudget();
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

    it('does not register a shot against a stale dead combatant target', () => {
      const shooter = createMockCombatant(
        'shooter-dead-target',
        Faction.NVA,
        100,
        CombatantState.ENGAGING,
        new THREE.Vector3(0, NPC_Y_OFFSET, 0)
      );
      const deadTarget = createMockCombatant(
        'target-dead',
        Faction.US,
        0,
        CombatantState.DEAD,
        new THREE.Vector3(40, NPC_Y_OFFSET, 0)
      );
      shooter.target = deadTarget;
      shooter.isFullAuto = true;

      combatantCombat.updateCombat(shooter, 0.016, new THREE.Vector3(0, 0, 0), new Map(), new Map());

      expect(shooter.gunCore.registerShot).not.toHaveBeenCalled();
      expect(shooter.target).toBeNull();
      expect(shooter.isFullAuto).toBe(false);
      expect(mockMuzzleFlashSystem.spawnNPC).not.toHaveBeenCalled();
      expect(mockTracerPool.spawn).not.toHaveBeenCalled();
    });

    // fire-gate-ordering: a shot the terrain gate aborts must not consume the
    // fire-rate clock or accumulate bloom. registerShot() is the single mutation
    // that advances both, so an aborted attempt must leave it uncalled and the
    // next unblocked attempt must fire immediately.
    it('a terrain-blocked attempt does not register a shot, and the next clear attempt fires', () => {
      const shooter = createMockCombatant('shooter-1', Faction.NVA, 100, CombatantState.ENGAGING, new THREE.Vector3(0, 0, 0));
      const target = createMockCombatant('target-1', Faction.US, 100, CombatantState.ENGAGING, new THREE.Vector3(40, 0, 0));
      shooter.target = target;
      // Keep the shooter at burst index 0 across both attempts so neither is
      // gated by burst control.
      shooter.skillProfile.burstLength = 10;

      // First attempt: a ridge between shooter and target blocks the shot.
      (mockTerrainSystem.raycastTerrain as any).mockReturnValueOnce({ hit: true, distance: 5 });

      combatantCombat.updateCombat(shooter, 0.016, new THREE.Vector3(0, 0, 0), new Map(), new Map());

      // Blocked: no fire-rate / bloom mutation, no burst advance.
      expect(shooter.gunCore.registerShot).not.toHaveBeenCalled();
      expect(shooter.currentBurst).toBe(0);
      expect(getCombatFireRaycastBudgetStats().terrainBlockedThisFrame).toBe(1);

      // Second attempt: terrain is clear (default mock returns no hit).
      combatantCombat.updateCombat(shooter, 0.016, new THREE.Vector3(0, 0, 0), new Map(), new Map());

      expect(shooter.gunCore.registerShot).toHaveBeenCalledTimes(1);
      expect(shooter.currentBurst).toBe(1);
    });

    it('an over-budget attempt does not register a shot (no cooldown/bloom theft)', () => {
      const shooter = createMockCombatant('shooter-2', Faction.NVA, 100, CombatantState.ENGAGING, new THREE.Vector3(0, 0, 0));
      const target = createMockCombatant('target-2', Faction.US, 100, CombatantState.ENGAGING, new THREE.Vector3(40, 0, 0));
      shooter.target = target;
      shooter.skillProfile.burstLength = 10;

      // Exhaust the per-frame raycast budget so this combatant's terrain check is denied.
      resetCombatFireRaycastBudget();
      for (let i = 0; i < 64; i++) tryConsumeCombatFireRaycast();
      try {
        combatantCombat.updateCombat(shooter, 0.016, new THREE.Vector3(0, 0, 0), new Map(), new Map());

        expect(shooter.gunCore.registerShot).not.toHaveBeenCalled();
        expect(shooter.currentBurst).toBe(0);
        const fireBudgetStats = getCombatFireRaycastBudgetStats();
        expect(fireBudgetStats.deniedThisFrame).toBeGreaterThan(0);
        expect(fireBudgetStats.terrainBlockedThisFrame).toBe(0);
      } finally {
        resetCombatFireRaycastBudget();
      }
    });

    it('blocks NPC fire when BVH misses but effective terrain height occludes the muzzle line', () => {
      const shooter = createMockCombatant(
        'shooter-3',
        Faction.NVA,
        100,
        CombatantState.ENGAGING,
        new THREE.Vector3(0, NPC_Y_OFFSET, 0)
      );
      const target = createMockCombatant(
        'target-3',
        Faction.US,
        100,
        CombatantState.ENGAGING,
        new THREE.Vector3(80, NPC_Y_OFFSET, 0)
      );
      shooter.target = target;
      shooter.skillProfile.burstLength = 10;

      (mockTerrainSystem.raycastTerrain as any).mockReturnValue({ hit: false, distance: undefined });
      (mockTerrainSystem.getEffectiveHeightAt as any).mockImplementation((x: number) => (
        x >= 36 && x <= 44 ? NPC_Y_OFFSET + 2.0 : 0
      ));

      combatantCombat.updateCombat(shooter, 0.016, new THREE.Vector3(0, 0, 0), new Map(), new Map());

      expect(shooter.gunCore.registerShot).not.toHaveBeenCalled();
      expect(shooter.currentBurst).toBe(0);
      expect(mockMuzzleFlashSystem.spawnNPC).not.toHaveBeenCalled();
      expect(mockTracerPool.spawn).not.toHaveBeenCalled();
      expect(getCombatFireRaycastBudgetStats().terrainBlockedThisFrame).toBe(1);
    });

    it('blocks suppressive fire when the last-known area is terrain-occluded', () => {
      const shooter = createMockCombatant(
        'suppressor-1',
        Faction.NVA,
        100,
        CombatantState.SUPPRESSING,
        new THREE.Vector3(0, NPC_Y_OFFSET, 0)
      );
      shooter.lastKnownTargetPos = new THREE.Vector3(80, NPC_Y_OFFSET, 0);
      shooter.skillProfile.burstLength = 10;

      (mockTerrainSystem.raycastTerrain as any).mockReturnValue({ hit: false, distance: undefined });
      (mockTerrainSystem.getEffectiveHeightAt as any).mockImplementation((x: number) => (
        x >= 36 && x <= 44 ? NPC_Y_OFFSET + 2.0 : 0
      ));

      combatantCombat.updateCombat(
        shooter,
        0.016,
        new THREE.Vector3(10, NPC_Y_OFFSET, 0),
        new Map(),
        new Map()
      );

      expect(shooter.gunCore.registerShot).not.toHaveBeenCalled();
      expect(shooter.currentBurst).toBe(0);
      expect(mockMuzzleFlashSystem.spawnNPC).not.toHaveBeenCalled();
      expect(mockTracerPool.spawn).not.toHaveBeenCalled();
      expect(getCombatFireRaycastBudgetStats().terrainBlockedThisFrame).toBe(1);
    });

    it('keeps suppressive fire active when the last-known area is clear', () => {
      const shooter = createMockCombatant(
        'suppressor-2',
        Faction.NVA,
        100,
        CombatantState.SUPPRESSING,
        new THREE.Vector3(0, NPC_Y_OFFSET, 0)
      );
      shooter.lastKnownTargetPos = new THREE.Vector3(80, NPC_Y_OFFSET, 0);
      shooter.skillProfile.burstLength = 10;

      combatantCombat.updateCombat(
        shooter,
        0.016,
        new THREE.Vector3(10, NPC_Y_OFFSET, 0),
        new Map(),
        new Map()
      );

      expect(shooter.gunCore.registerShot).toHaveBeenCalledTimes(1);
      expect(shooter.currentBurst).toBe(1);
      expect(mockMuzzleFlashSystem.spawnNPC).toHaveBeenCalledTimes(1);
      expect(mockTracerPool.spawn).toHaveBeenCalledTimes(1);
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

    it('does not emit player-shot telemetry spans when telemetry is disabled', () => {
      const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
      const allCombatants = new Map<string, Combatant>();
      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue(null);
      const isEnabledSpy = vi.spyOn(performanceTelemetry, 'isEnabled').mockReturnValue(false);
      const beginSystemSpy = vi.spyOn(performanceTelemetry, 'beginSystem').mockImplementation(() => undefined);
      const endSystemSpy = vi.spyOn(performanceTelemetry, 'endSystem').mockImplementation(() => undefined);

      try {
        combatantCombat.handlePlayerShot(ray, () => 50, allCombatants);

        expect(isEnabledSpy).toHaveBeenCalledTimes(1);
        expect(beginSystemSpy).not.toHaveBeenCalled();
        expect(endSystemSpy).not.toHaveBeenCalled();
      } finally {
        isEnabledSpy.mockRestore();
        beginSystemSpy.mockRestore();
        endSystemSpy.mockRestore();
      }
    });

    it('emits fixed player-shot telemetry spans when telemetry is enabled', () => {
      const target = createMockCombatant('target-telemetry', Faction.NVA, 100);
      const allCombatants = new Map<string, Combatant>([['target-telemetry', target]]);
      const ray = new THREE.Ray(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(1, 0, 0));
      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(20, 1.2, 0),
        distance: 20,
        headshot: false,
      });
      const isEnabledSpy = vi.spyOn(performanceTelemetry, 'isEnabled').mockReturnValue(true);
      const beginSystemSpy = vi.spyOn(performanceTelemetry, 'beginSystem').mockImplementation(() => undefined);
      const endSystemSpy = vi.spyOn(performanceTelemetry, 'endSystem').mockImplementation(() => undefined);

      try {
        combatantCombat.handlePlayerShot(ray, () => 50, allCombatants);

        const expectedPhases = [
          'Combat.PlayerShot.HitDetection',
          'Combat.PlayerShot.TerrainRaycast',
          'Combat.PlayerShot.HeightProfile',
          'Combat.PlayerShot.Damage',
        ];
        expect(beginSystemSpy.mock.calls.map(([name]) => name)).toEqual(expectedPhases);
        expect(endSystemSpy.mock.calls.map(([name]) => name)).toEqual(expectedPhases);
      } finally {
        isEnabledSpy.mockRestore();
        beginSystemSpy.mockRestore();
        endSystemSpy.mockRestore();
      }
    });

    it('emits fixed preview-shot telemetry spans when telemetry is enabled', () => {
      const target = createMockCombatant('target-preview-telemetry', Faction.NVA, 100);
      const allCombatants = new Map<string, Combatant>([['target-preview-telemetry', target]]);
      const ray = new THREE.Ray(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(1, 0, 0));
      vi.spyOn(combatantCombat.hitDetection, 'raycastCombatants').mockReturnValue({
        combatant: target,
        point: new THREE.Vector3(20, 1.2, 0),
        distance: 20,
        headshot: false,
      });
      const isEnabledSpy = vi.spyOn(performanceTelemetry, 'isEnabled').mockReturnValue(true);
      const beginSystemSpy = vi.spyOn(performanceTelemetry, 'beginSystem').mockImplementation(() => undefined);
      const endSystemSpy = vi.spyOn(performanceTelemetry, 'endSystem').mockImplementation(() => undefined);

      try {
        combatantCombat.previewPlayerShot(ray, allCombatants);

        const expectedPhases = [
          'Combat.PlayerShot.PreviewHitDetection',
          'Combat.PlayerShot.PreviewTerrainRaycast',
          'Combat.PlayerShot.PreviewHeightProfile',
        ];
        expect(beginSystemSpy.mock.calls.map(([name]) => name)).toEqual(expectedPhases);
        expect(endSystemSpy.mock.calls.map(([name]) => name)).toEqual(expectedPhases);
      } finally {
        isEnabledSpy.mockRestore();
        beginSystemSpy.mockRestore();
        endSystemSpy.mockRestore();
      }
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
