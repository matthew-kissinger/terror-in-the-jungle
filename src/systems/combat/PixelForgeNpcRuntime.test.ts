// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  getPixelForgeClipHorizontalNetDisplacement,
  getPixelForgeNpcCloseModelDistanceMeters,
  getPixelForgeNpcCloseModelDistanceSq,
  getPixelForgeNpcRuntimeClip,
  PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP,
  PIXEL_FORGE_NPC_RUNTIME_FACTIONS,
  PIXEL_FORGE_NPC_WEAPONS,
  PixelForgeNpcDistanceConfig,
  sanitizePixelForgeNpcAnimationClip,
} from './PixelForgeNpcRuntime';
import { Combatant, CombatantState, Faction } from './types';

// Mesh node names present in the shipped Kiln gen-2 NPC weapon GLBs (the default
// art), verified by parsing each GLB JSON chunk
// (public/models/weapons/kiln-war-2026-06/{m16a1-2,ak-47}.glb). The NPC hold
// derivation (CombatantRenderer findNamed) takes the FIRST matching name in each
// list; if none match it falls through to a hardcoded default offset and the gun
// floats. These fixtures let us assert every configured anchor list resolves
// against the real model.
const NPC_WEAPON_GLB_NODES: Record<'m16a1' | 'ak47', ReadonlySet<string>> = {
  m16a1: new Set([
    'Mesh_UpperReceiver', 'Mesh_LowerReceiver', 'Mesh_Magwell', 'Mesh_PistolGrip',
    'Mesh_Handguard', 'Mesh_DeltaRing', 'Mesh_Barrel', 'Mesh_GasBlock',
    'Mesh_FrontSightFrame', 'Mesh_FrontSightPost', 'Mesh_FlashHider', 'Mesh_MuzzleHole',
    'Mesh_MagSeg1', 'Mesh_MagSeg2', 'Mesh_MagSeg3', 'Mesh_TriggerGuard',
    'Mesh_Stock', 'Mesh_Buttplate',
  ]),
  ak47: new Set([
    'Mesh_Receiver', 'Mesh_PistolGrip', 'Mesh_TriggerGuardBottom', 'Mesh_LowerHandguard',
    'Mesh_UpperHandguard', 'Mesh_Barrel', 'Mesh_MuzzleBrake', 'Mesh_MuzzleSlant',
    'Mesh_FrontSightBase', 'Mesh_FrontSightPost', 'Mesh_MagSeg1', 'Mesh_MagBase',
    'Mesh_StockWrist', 'Mesh_StockBody', 'Mesh_Buttplate',
  ]),
};

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
    simLane: 'high',
    renderLane: 'culled',
    kills: 0,
    deaths: 0,
  };
}

describe('PixelForgeNpcRuntime', () => {
  it('maps each faction to a body GLB and the expected weapon GLB', () => {
    const weaponByFaction = new Map(
      PIXEL_FORGE_NPC_RUNTIME_FACTIONS.map((config) => [config.runtimeFaction, config.weapon.modelPath]),
    );

    // Default art is Kiln gen-2 (no window in the node test env -> 'kiln').
    expect(weaponByFaction.get(Faction.US)).toBe('weapons/kiln-war-2026-06/m16a1-2.glb');
    expect(weaponByFaction.get(Faction.ARVN)).toBe('weapons/kiln-war-2026-06/m16a1-2.glb');
    expect(weaponByFaction.get(Faction.NVA)).toBe('weapons/kiln-war-2026-06/ak-47.glb');
    expect(weaponByFaction.get(Faction.VC)).toBe('weapons/kiln-war-2026-06/ak-47.glb');
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

  describe('NPC weapon hold anchors resolve against the shipped GLB vocabulary', () => {
    // Each anchor list must contain at least one node that exists in the GLB so
    // findNamed lands a real attachment point instead of falling through to the
    // default float offset. A regression here = the gun detaching from the hand.
    for (const id of ['m16a1', 'ak47'] as const) {
      const weapon = PIXEL_FORGE_NPC_WEAPONS[id];
      const nodes = NPC_WEAPON_GLB_NODES[id];

      it(`${id} grip / support / muzzle / stock each name a real GLB node`, () => {
        for (const list of [weapon.gripNames, weapon.supportNames, weapon.muzzleNames, weapon.stockNames]) {
          expect(list.length).toBeGreaterThan(0);
          expect(list.some((name) => nodes.has(name))).toBe(true);
        }
      });

      it(`${id} muzzle anchor reaches the barrel/muzzle, not the receiver`, () => {
        // The first resolvable muzzle name must be a barrel-end node so the
        // muzzle-direction vector points down the bore.
        const firstHit = weapon.muzzleNames.find((name) => nodes.has(name));
        expect(firstHit).toBeDefined();
        expect(firstHit).toMatch(/Barrel|Muzzle|FlashHider|FrontSight/);
      });
    }
  });
});
