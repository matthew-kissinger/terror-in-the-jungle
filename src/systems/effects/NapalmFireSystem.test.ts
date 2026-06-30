// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { NapalmFireSystem, setNapalmFireSystem, spawnNapalmFire } from './NapalmFireSystem';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Avoid real canvas/WebGL: stub the procedural textures.
vi.mock('./ExplosionTextures', () => ({
  createFireTexture: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  createScorchTexture: vi.fn().mockReturnValue({ dispose: vi.fn() }),
}));

const POOL_SIZE = 12;

describe('NapalmFireSystem', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let system: NapalmFireSystem;

  beforeEach(async () => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    system = new NapalmFireSystem(scene, camera);
    await system.init();
  });

  afterEach(() => {
    system.dispose();
    vi.clearAllMocks();
  });

  const activeCount = () => (system as any).zones.length as number;
  const poolCount = () => (system as any).pool.length as number;

  it('pre-allocates a fixed pool with no active zones', () => {
    expect(activeCount()).toBe(0);
    expect(poolCount()).toBe(POOL_SIZE);
  });

  it('acquires a zone from the pool on spawn and places it at the target', () => {
    const pos = new THREE.Vector3(40, 12, -7);
    system.spawn(pos, 12, 25);

    expect(activeCount()).toBe(1);
    expect(poolCount()).toBe(POOL_SIZE - 1);

    const zone = (system as any).zones[0];
    expect(zone.group.visible).toBe(true);
    expect(zone.group.position.x).toBeCloseTo(40);
    expect(zone.group.position.z).toBeCloseTo(-7);
  });

  it('deactivates a zone back to the pool after the burn + fade window', () => {
    system.spawn(new THREE.Vector3(0, 0, 0), 1, 25); // 1s burn
    const zone = (system as any).zones[0];

    // Step through the full burn + fade tail.
    for (let i = 0; i < 50; i++) system.update(0.1);

    expect(activeCount()).toBe(0);
    expect(poolCount()).toBe(POOL_SIZE);
    expect(zone.group.visible).toBe(false);
  });

  it('reuses pooled geometry instead of recreating it', () => {
    const pos = new THREE.Vector3(5, 0, 5);
    system.spawn(pos, 1, 25);
    const firstGroup = (system as any).zones[0].group;
    const firstFlame = (system as any).zones[0].flames[0];

    for (let i = 0; i < 50; i++) system.update(0.1); // burn out
    system.spawn(pos, 1, 25);

    const secondGroup = (system as any).zones[0].group;
    const secondFlame = (system as any).zones[0].flames[0];
    expect(secondGroup).toBe(firstGroup);   // same Object3D, not recreated
    expect(secondFlame).toBe(firstFlame);
  });

  it('never lets the live zone count exceed the pool size under burst spawns', () => {
    for (let i = 0; i < POOL_SIZE * 2; i++) {
      system.spawn(new THREE.Vector3(i, 0, 0), 12, 25);
      expect(activeCount()).toBeLessThanOrEqual(POOL_SIZE);
    }
    // Total objects are conserved: active + pooled always equals the pool size.
    expect(activeCount() + poolCount()).toBe(POOL_SIZE);
  });

  it('keeps the flame alive (positive opacity) across the full burn window', () => {
    system.spawn(new THREE.Vector3(0, 0, 0), 6, 25);
    const mat = (system as any).zones[0].flameMats[0] as THREE.SpriteMaterial;

    let sawOpaqueDuringBurn = false;
    for (let t = 0; t < 6; t += 0.5) {
      system.update(0.5);
      if (mat.opacity > 0) sawOpaqueDuringBurn = true;
    }
    expect(sawOpaqueDuringBurn).toBe(true);
  });

  it('routes the module-level spawn helper to the active system, and no-ops when unset', () => {
    setNapalmFireSystem(system);
    spawnNapalmFire(new THREE.Vector3(1, 0, 1), 12, 25);
    expect(activeCount()).toBe(1);

    setNapalmFireSystem(undefined);
    expect(() => spawnNapalmFire(new THREE.Vector3(2, 0, 2), 12, 25)).not.toThrow();
    expect(activeCount()).toBe(1); // unchanged
  });
});
