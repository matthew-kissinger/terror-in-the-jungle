// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { StructureModels } from '../../../config/generated/warAssetCatalog';
import {
  StaticImpostorSystem,
  type LoadedStaticImpostorAtlas,
  type StaticImpostorTextureProvider,
} from './StaticImpostorSystem';
import type { StaticImpostorArchetype } from '../../../config/staticImpostorArchetypes';
import { Logger } from '../../../utils/Logger';

function makeAtlas(): LoadedStaticImpostorAtlas {
  return {
    textures: {
      baseColorMap: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      depthMap: new THREE.Texture(),
    },
  };
}

function makeProvider(loadAtlas = vi.fn(async () => makeAtlas())): StaticImpostorTextureProvider {
  return { loadAtlas };
}

function makeStaticObject(position = new THREE.Vector3()): THREE.Group {
  const object = new THREE.Group();
  object.position.copy(position);
  object.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 1),
    new THREE.MeshStandardMaterial({ color: 0x556b2f }),
  ));
  return object;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('StaticImpostorSystem', () => {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 2, 0);
  });

  it('promotes far registered static meshes to an impostor and restores them inside demotion range', async () => {
    const provider = makeProvider();
    const system = new StaticImpostorSystem(scene, camera, { textureProvider: provider });
    const object = makeStaticObject(new THREE.Vector3(180, 0, 0));
    scene.add(object);

    const registered = system.registerInstance({
      id: 'fuel_drum_far',
      modelPath: StructureModels.FUEL_DRUM,
      object,
    });
    await flushPromises();
    system.update(0.016);

    expect(registered).toBe(true);
    expect(object.visible).toBe(false);
    expect(system.getDebugInfo()).toEqual(expect.objectContaining({
      registeredInstances: 1,
      activeImpostors: 1,
      meshFallbacks: 0,
      atlasesReady: 1,
    }));

    camera.position.set(170, 2, 0);
    system.update(0.016);

    expect(object.visible).toBe(true);
    expect(system.getDebugInfo()).toEqual(expect.objectContaining({
      activeImpostors: 0,
      meshFallbacks: 1,
    }));
  });

  it('falls back to the authored mesh while an atlas is missing or failed', async () => {
    const provider = makeProvider(vi.fn(async (_archetype: StaticImpostorArchetype) => {
      throw new Error('atlas missing');
    }));
    const system = new StaticImpostorSystem(scene, camera, { textureProvider: provider });
    const object = makeStaticObject(new THREE.Vector3(220, 0, 0));
    scene.add(object);

    system.registerInstance({
      id: 'fuel_drum_missing_atlas',
      modelPath: StructureModels.FUEL_DRUM,
      object,
    });
    await flushPromises();
    system.update(0.016);

    expect(object.visible).toBe(true);
    expect(system.getDebugInfo()).toEqual(expect.objectContaining({
      activeImpostors: 0,
      meshFallbacks: 1,
      atlasesFailed: 1,
    }));
  });

  it('does not register skinned or animated static candidates', () => {
    const provider = makeProvider();
    const system = new StaticImpostorSystem(scene, camera, { textureProvider: provider });
    const object = new THREE.Group();
    object.add(new THREE.SkinnedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    ));

    const registered = system.registerInstance({
      id: 'animated_candidate',
      modelPath: StructureModels.FUEL_DRUM,
      object,
    });

    expect(registered).toBe(false);
    expect(provider.loadAtlas).not.toHaveBeenCalled();
    expect(system.getDebugInfo().registeredInstances).toBe(0);
  });

  it('warns at most once per batch when capacity is exceeded, despite per-frame overflow retries', async () => {
    const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const provider = makeProvider();
    const system = new StaticImpostorSystem(scene, camera, {
      textureProvider: provider,
      batchCapacity: 2,
    });
    // Four far drums share ONE archetype batch ('fuel-drum'); capacity 2 -> two overflow.
    for (let i = 0; i < 4; i++) {
      const object = makeStaticObject(new THREE.Vector3(200 + i * 10, 0, 0));
      scene.add(object);
      system.registerInstance({ id: `fuel_drum_${i}`, modelPath: StructureModels.FUEL_DRUM, object });
    }
    await flushPromises();

    // Overflow instances keep a null slot, so they re-attempt every frame. Without the
    // warn-once guard this would log on every frame for every overflow instance.
    system.update(0.016);
    system.update(0.016);
    system.update(0.016);

    const capacityWarnings = warnSpy.mock.calls.filter(
      ([, message]) => typeof message === 'string' && message.includes('capacity reached'),
    );
    expect(capacityWarnings).toHaveLength(1);
    expect(system.getDebugInfo().batches['fuel-drum'].highWater).toBe(2);

    warnSpy.mockRestore();
  });

  it('honors a generous batchCapacity so dense archetypes fit without overflowing', async () => {
    const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const provider = makeProvider();
    const system = new StaticImpostorSystem(scene, camera, {
      textureProvider: provider,
      batchCapacity: 8,
    });
    for (let i = 0; i < 6; i++) {
      const object = makeStaticObject(new THREE.Vector3(200 + i * 10, 0, 0));
      scene.add(object);
      system.registerInstance({ id: `fuel_drum_${i}`, modelPath: StructureModels.FUEL_DRUM, object });
    }
    await flushPromises();
    system.update(0.016);

    const capacityWarnings = warnSpy.mock.calls.filter(
      ([, message]) => typeof message === 'string' && message.includes('capacity reached'),
    );
    expect(capacityWarnings).toHaveLength(0);
    expect(system.getDebugInfo().batches['fuel-drum'].highWater).toBe(6);

    warnSpy.mockRestore();
  });

  it('ignores model paths that have not been assigned offline atlases', () => {
    const provider = makeProvider();
    const system = new StaticImpostorSystem(scene, camera, { textureProvider: provider });
    const object = makeStaticObject(new THREE.Vector3(220, 0, 0));

    const registered = system.registerInstance({
      id: 'unregistered_archetype',
      modelPath: StructureModels.AMMO_BUNKER,
      object,
    });

    expect(registered).toBe(false);
    expect(provider.loadAtlas).not.toHaveBeenCalled();
  });
});
