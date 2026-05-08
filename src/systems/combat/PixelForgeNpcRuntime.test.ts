import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  getPixelForgeClipHorizontalNetDisplacement,
  getPixelForgeNpcCloseModelDistanceMeters,
  getPixelForgeNpcCloseModelDistanceSq,
  getPixelForgeNpcRuntimeClip,
  PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP,
  PIXEL_FORGE_NPC_RUNTIME_FACTIONS,
  PixelForgeNpcDistanceConfig,
  sanitizePixelForgeNpcAnimationClip,
} from './PixelForgeNpcRuntime';
import { Combatant, CombatantState, Faction } from './types';

function createCombatant(state: CombatantState): Combatant {
  return {
    id: 'test',
    faction: Faction.NVA,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state,
    weaponSpec: {} as Combatant['weaponSpec'],
    gunCore: {} as Combatant['gunCore'],
    skillProfile: {} as Combatant['skillProfile'],
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
  };
}

describe('PixelForgeNpcRuntime', () => {
  it('maps each faction to a body GLB and the expected weapon GLB', () => {
    const weaponByFaction = new Map(
      PIXEL_FORGE_NPC_RUNTIME_FACTIONS.map((config) => [config.runtimeFaction, config.weapon.modelPath]),
    );

    expect(weaponByFaction.get(Faction.US)).toBe('weapons/m16a1.glb');
    expect(weaponByFaction.get(Faction.ARVN)).toBe('weapons/m16a1.glb');
    expect(weaponByFaction.get(Faction.NVA)).toBe('weapons/ak47.glb');
    expect(weaponByFaction.get(Faction.VC)).toBe('weapons/ak47.glb');
    for (const config of PIXEL_FORGE_NPC_RUNTIME_FACTIONS) {
      expect(config.modelPath.endsWith('.glb')).toBe(true);
      expect(config.rightHandSocket).toBe('RightHand');
      expect(config.leftHandSocket).toBe('LeftHand');
    }
  });

  it('keeps the close-model radius live-tunable and well above the legacy 64 m threshold', () => {
    // The cycle brief widens the close-model radius so flyovers see distant
    // NPCs as 3D actors instead of static billboards. The exact value is a
    // tuning knob; we assert the floor and the live-getter contract here.
    expect(getPixelForgeNpcCloseModelDistanceMeters()).toBeGreaterThan(64);
  });

  it('exposes a squared-distance accessor that tracks the live config', () => {
    const original = PixelForgeNpcDistanceConfig.closeModelDistanceMeters;
    try {
      PixelForgeNpcDistanceConfig.closeModelDistanceMeters = 100;
      expect(getPixelForgeNpcCloseModelDistanceSq()).toBeCloseTo(100 * 100);

      PixelForgeNpcDistanceConfig.closeModelDistanceMeters = 150;
      expect(getPixelForgeNpcCloseModelDistanceSq()).toBeCloseTo(150 * 150);
    } finally {
      PixelForgeNpcDistanceConfig.closeModelDistanceMeters = original;
    }
  });

  it('keeps the close-model GPU cap unchanged so the GPU budget is flat', () => {
    expect(PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP).toBe(8);
  });

  it('maps moving combat states away from advance_fire root motion', () => {
    expect(getPixelForgeNpcRuntimeClip(createCombatant(CombatantState.ENGAGING))).toBe('walk_fight_forward');
    expect(getPixelForgeNpcRuntimeClip(createCombatant(CombatantState.SUPPRESSING))).toBe('walk_fight_forward');
    expect(getPixelForgeNpcRuntimeClip(createCombatant(CombatantState.ADVANCING))).toBe('walk_fight_forward');
  });

  it('strips horizontal Hips root motion from looped clips', () => {
    const clip = new THREE.AnimationClip('advance_fire', 1, [
      new THREE.VectorKeyframeTrack('Hips.position', [0, 0.5, 1], [
        0, 0, 0,
        5, 1, 10,
        10, 2, 20,
      ]),
    ]);

    const before = getPixelForgeClipHorizontalNetDisplacement(clip);
    const sanitized = sanitizePixelForgeNpcAnimationClip(clip);
    const after = getPixelForgeClipHorizontalNetDisplacement(sanitized);
    const hips = sanitized.tracks[0] as THREE.VectorKeyframeTrack;

    expect(before.length()).toBeGreaterThan(20);
    expect(after.length()).toBeLessThan(0.0001);
    expect(hips.values[1]).toBe(0);
    expect(hips.values[7]).toBe(2);
  });

  it('does not strip death root translation', () => {
    const clip = new THREE.AnimationClip('death_fall_back', 1, [
      new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [
        0, 0, 0,
        0, 0, 4,
      ]),
    ]);

    const sanitized = sanitizePixelForgeNpcAnimationClip(clip);
    expect(getPixelForgeClipHorizontalNetDisplacement(sanitized).length()).toBe(4);
  });
});
