import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MuzzleFlashSystem } from './MuzzleFlashSystem';

type MuzzleFlashInternals = {
  npcMesh: THREE.Points;
  npcPos: Float32Array;
  npcCol: Float32Array;
  playerMesh?: THREE.Points;
};

describe('MuzzleFlashSystem', () => {
  it('uses standard points materials for NPC muzzle flashes', () => {
    const scene = new THREE.Scene();
    const system = new MuzzleFlashSystem(scene);
    const internals = system as unknown as MuzzleFlashInternals;

    expect(scene.children).toContain(internals.npcMesh);
    expect(internals.npcMesh.material).toBeInstanceOf(THREE.PointsMaterial);
    expect((internals.npcMesh.material as THREE.PointsMaterial).vertexColors).toBe(true);
    expect((internals.npcMesh.material as THREE.PointsMaterial).map).toBeNull();

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
    expect(internals.npcPos.some((value) => value !== 99999)).toBe(true);
    expect(internals.npcCol.some((value) => value > 0)).toBe(true);

    system.dispose();
  });

  it('uses fixed-pixel points material for player overlay flashes', () => {
    const scene = new THREE.Scene();
    const overlayScene = new THREE.Scene();
    const system = new MuzzleFlashSystem(scene);

    system.spawnPlayer(overlayScene, new THREE.Vector3(0.2, -0.15, 0), new THREE.Vector3(0, 0, -1));

    const internals = system as unknown as MuzzleFlashInternals;
    expect(overlayScene.children).toContain(internals.playerMesh);
    expect(internals.playerMesh?.material).toBeInstanceOf(THREE.PointsMaterial);
    expect((internals.playerMesh?.material as THREE.PointsMaterial).sizeAttenuation).toBe(false);
    expect((internals.playerMesh?.material as THREE.PointsMaterial).map).toBeNull();

    system.dispose();
    expect(scene.children).not.toContain(internals.npcMesh);
    expect(overlayScene.children).not.toContain(internals.playerMesh);
  });
});
