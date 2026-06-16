// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MuzzleFlashSystem } from './MuzzleFlashSystem';

type MuzzleFlashInternals = {
  npcMesh: THREE.Points;
  npcPos: Float32Array;
  npcCol: Float32Array;
  npcActiveSlots: number[];
  playerMesh?: THREE.Points;
  playerScene?: THREE.Scene | null;
  playerActiveSlots: number[];
};

function updateRangesFor(attribute: THREE.BufferAttribute): Array<{ start: number; count: number }> {
  return attribute.updateRanges as Array<{ start: number; count: number }>;
}

describe('MuzzleFlashSystem', () => {
  it('uses standard points materials for NPC muzzle flashes', () => {
    const scene = new THREE.Scene();
    const system = new MuzzleFlashSystem(scene);
    const internals = system as unknown as MuzzleFlashInternals;

    expect(scene.children).toContain(internals.npcMesh);
    expect(internals.npcMesh.userData.perfCategory).toBe('muzzle_flash_fx');
    expect(internals.npcMesh.material).toBeInstanceOf(THREE.PointsMaterial);
    expect((internals.npcMesh.material as THREE.PointsMaterial).vertexColors).toBe(true);
    expect((internals.npcMesh.material as THREE.PointsMaterial).map).toBeNull();
    expect(internals.npcMesh.geometry.getAttribute('life')).toBeUndefined();

    system.dispose();
  });

  it('uploads active NPC flash particles without custom material attributes', () => {
    const scene = new THREE.Scene();
    const system = new MuzzleFlashSystem(scene);
    const internals = system as unknown as MuzzleFlashInternals;

    system.spawnNPC(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 0, -1));
    system.update(0.016);

    expect(internals.npcMesh.geometry.getAttribute('color')).toBeDefined();
    expect(internals.npcMesh.geometry.getAttribute('aBaseSize')).toBeUndefined();
    expect(internals.npcMesh.geometry.getAttribute('life')).toBeUndefined();
    expect(internals.npcPos.some((value) => value !== 99999)).toBe(true);
    expect(internals.npcCol.some((value) => value > 0)).toBe(true);

    system.dispose();
  });

  it('uses bounded update ranges for active NPC flash particle uploads', () => {
    const scene = new THREE.Scene();
    const system = new MuzzleFlashSystem(scene);
    const internals = system as unknown as MuzzleFlashInternals;
    const positionAttr = internals.npcMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttr = internals.npcMesh.geometry.getAttribute('color') as THREE.BufferAttribute;

    system.spawnNPC(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 0, -1));
    system.update(0.016);

    const positionRanges = updateRangesFor(positionAttr);
    const colorRanges = updateRangesFor(colorAttr);
    expect(positionRanges.length).toBeGreaterThan(0);
    expect(colorRanges.length).toBe(positionRanges.length);
    expect(positionRanges[0].start).toBe(0);
    expect(positionRanges[0].count).toBeLessThan(internals.npcPos.length);
    expect(colorRanges[0]).toEqual(positionRanges[0]);

    system.dispose();
  });

  it('tracks and drains only active NPC flash slots', () => {
    const scene = new THREE.Scene();
    const system = new MuzzleFlashSystem(scene);
    const internals = system as unknown as MuzzleFlashInternals;

    system.spawnNPC(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 0, -1));

    const activeSlotsAfterSpawn = [...internals.npcActiveSlots];
    expect(activeSlotsAfterSpawn).toHaveLength(8);

    system.update(1);

    expect(internals.npcActiveSlots).toHaveLength(0);
    for (const slotIndex of activeSlotsAfterSpawn) {
      const offset = slotIndex * 3;
      expect(internals.npcPos[offset]).toBe(99999);
      expect(internals.npcPos[offset + 1]).toBe(99999);
      expect(internals.npcPos[offset + 2]).toBe(99999);
    }

    system.dispose();
  });

  it('does not duplicate active NPC slots when the ring buffer overwrites live particles', () => {
    const scene = new THREE.Scene();
    const system = new MuzzleFlashSystem(scene);
    const internals = system as unknown as MuzzleFlashInternals;

    for (let i = 0; i < 9; i++) {
      system.spawnNPC(new THREE.Vector3(i, 2, 3), new THREE.Vector3(0, 0, -1));
    }

    expect(internals.npcActiveSlots).toHaveLength(64);
    expect(new Set(internals.npcActiveSlots)).toHaveLength(64);

    system.dispose();
  });

  it('uses fixed-pixel points material for player overlay flashes', () => {
    const scene = new THREE.Scene();
    const overlayScene = new THREE.Scene();
    const system = new MuzzleFlashSystem(scene);

    system.spawnPlayer(overlayScene, new THREE.Vector3(0.2, -0.15, 0), new THREE.Vector3(0, 0, -1));

    const internals = system as unknown as MuzzleFlashInternals;
    expect(overlayScene.children).toContain(internals.playerMesh);
    expect(internals.playerMesh?.userData.perfCategory).toBe('muzzle_flash_fx');
    expect(internals.playerMesh?.material).toBeInstanceOf(THREE.PointsMaterial);
    expect((internals.playerMesh?.material as THREE.PointsMaterial).sizeAttenuation).toBe(false);
    expect((internals.playerMesh?.material as THREE.PointsMaterial).map).toBeNull();
    expect(internals.playerMesh?.geometry.getAttribute('life')).toBeUndefined();

    system.dispose();
    expect(scene.children).not.toContain(internals.npcMesh);
    expect(overlayScene.children).not.toContain(internals.playerMesh);
  });

  it('can prepare the player overlay mesh before the first shot', () => {
    const scene = new THREE.Scene();
    const overlayScene = new THREE.Scene();
    const system = new MuzzleFlashSystem(scene);

    system.preparePlayerOverlayScene(overlayScene);

    const internals = system as unknown as MuzzleFlashInternals;
    const preparedMesh = internals.playerMesh;
    expect(preparedMesh).toBeDefined();
    expect(overlayScene.children).toContain(preparedMesh);
    expect(internals.playerScene).toBe(overlayScene);

    system.spawnPlayer(overlayScene, new THREE.Vector3(0.2, -0.15, 0), new THREE.Vector3(0, 0, -1));

    expect(internals.playerMesh).toBe(preparedMesh);
    system.dispose();
  });

  it('uses bounded update ranges for active player overlay flash particle uploads', () => {
    const scene = new THREE.Scene();
    const overlayScene = new THREE.Scene();
    const system = new MuzzleFlashSystem(scene);

    system.spawnPlayer(overlayScene, new THREE.Vector3(0.2, -0.15, 0), new THREE.Vector3(0, 0, -1));
    system.update(0.016);

    const internals = system as unknown as MuzzleFlashInternals;
    const playerMesh = internals.playerMesh!;
    const positionAttr = playerMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttr = playerMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const positionRanges = updateRangesFor(positionAttr);
    const colorRanges = updateRangesFor(colorAttr);

    expect(positionRanges.length).toBeGreaterThan(0);
    expect(colorRanges.length).toBe(positionRanges.length);
    expect(positionRanges[0].start).toBe(0);
    expect(positionRanges[0].count).toBeLessThan(positionAttr.array.length);
    expect(colorRanges[0]).toEqual(positionRanges[0]);
    system.dispose();
  });

  it('resets player active flash slots when the overlay scene changes', () => {
    const scene = new THREE.Scene();
    const firstOverlayScene = new THREE.Scene();
    const secondOverlayScene = new THREE.Scene();
    const system = new MuzzleFlashSystem(scene);

    system.spawnPlayer(firstOverlayScene, new THREE.Vector3(0.2, -0.15, 0), new THREE.Vector3(0, 0, -1));

    const internals = system as unknown as MuzzleFlashInternals;
    const firstMesh = internals.playerMesh;
    expect(internals.playerActiveSlots).toHaveLength(8);

    system.spawnPlayer(secondOverlayScene, new THREE.Vector3(0.2, -0.15, 0), new THREE.Vector3(0, 0, -1));

    expect(internals.playerScene).toBe(secondOverlayScene);
    expect(firstOverlayScene.children).not.toContain(firstMesh);
    expect(secondOverlayScene.children).toContain(internals.playerMesh);
    expect(internals.playerActiveSlots).toHaveLength(8);
    expect(new Set(internals.playerActiveSlots)).toHaveLength(8);
    system.dispose();
  });
});
