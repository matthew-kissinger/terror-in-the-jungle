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
import {
  STATIC_IMPOSTOR_FOLIAGE_EXPOSURE,
  type StaticImpostorNodeMaterial,
} from './StaticImpostorMaterial';
import type { StaticImpostorArchetype } from '../../../config/staticImpostorArchetypes';
import { Logger } from '../../../utils/Logger';
import { LightingRigConfig, lightingRigBindings } from '../../environment/LightingRig';

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

function getBatchMaterial(scene: THREE.Scene): StaticImpostorNodeMaterial {
  const mesh = scene.children.find(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh && child.name.startsWith('StaticImpostorBatch_'),
  );
  expect(mesh).toBeDefined();
  return mesh!.material as StaticImpostorNodeMaterial;
}

function getBatchMesh(scene: THREE.Scene, slug = 'fuel-drum'): THREE.Mesh {
  const mesh = scene.children.find(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh && child.name === `StaticImpostorBatch_${slug}`,
  );
  expect(mesh).toBeDefined();
  return mesh!;
}

function getFirstBatchOpacity(scene: THREE.Scene, slug = 'fuel-drum'): number {
  const mesh = getBatchMesh(scene, slug);
  const attribute = mesh.geometry.getAttribute('instanceOpacity') as THREE.InstancedBufferAttribute | undefined;
  expect(attribute).toBeDefined();
  return Number(attribute!.array[0]);
}

function makeVegetationArchetype(overrides: Partial<StaticImpostorArchetype> = {}): StaticImpostorArchetype {
  return {
    slug: 'jungle-tree',
    modelPath: '/assets/vegetation/jungle-tree/jungle-tree.glb',
    maps: {
      baseColor: '/assets/vegetation/jungle-tree/impostor/atlas.base-color.png',
      normal: '/assets/vegetation/jungle-tree/impostor/atlas.normal.png',
      depth: '/assets/vegetation/jungle-tree/impostor/atlas.depth.png',
    },
    atlasSize: [2048, 768],
    tileSize: [256, 256],
    columns: 8,
    rows: 3,
    azimuthFrames: 8,
    elevationFrames: 3,
    maxTextureSize: 2048,
    planePaddingScale: 1.16,
    bounds: { center: [0, 1, 0], size: [2, 4, 2], radius: 2.5 },
    promotionDistanceMeters: 160,
    demotionDistanceMeters: 136,
    parallaxStrength: 0.04,
    lightingProfile: 'foliage-card',
    ...overrides,
  };
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

  it('labels vegetation-owned batches and reports per-archetype LOD distances', async () => {
    const provider = makeProvider();
    const vegetationArchetype = makeVegetationArchetype();
    const system = new StaticImpostorSystem(scene, camera, {
      textureProvider: provider,
      archetypes: { [vegetationArchetype.modelPath]: vegetationArchetype },
      debugSource: 'vegetation',
    });
    const object = makeStaticObject(new THREE.Vector3(220, 0, 0));
    scene.add(object);

    system.registerInstance({
      id: 'vegetation_jungle_tree_far',
      modelPath: vegetationArchetype.modelPath,
      object,
    });
    await flushPromises();
    system.update(0.016);

    const batch = scene.children.find(
      (child): child is THREE.Mesh => child instanceof THREE.Mesh && child.name === 'StaticImpostorBatch_jungle-tree',
    );
    expect(batch?.userData).toEqual(expect.objectContaining({
      staticImpostorSource: 'vegetation',
      staticImpostorSlug: 'jungle-tree',
      staticImpostorLightingProfile: 'foliage-card',
      staticImpostorPromotionDistanceMeters: 160,
      staticImpostorDemotionDistanceMeters: 136,
    }));

    const debug = system.getDebugInfo();
    expect(debug.source).toBe('vegetation');
    expect(debug.batches['jungle-tree']).toEqual(expect.objectContaining({
      source: 'vegetation',
      lightingProfile: 'foliage-card',
      promotionDistanceMeters: 160,
      demotionDistanceMeters: 136,
      active: 1,
    }));
    expect(debug.archetypes['jungle-tree']).toEqual(expect.objectContaining({
      registeredInstances: 1,
      activeImpostors: 1,
      meshFallbacks: 0,
      promotionDistanceMeters: 160,
      demotionDistanceMeters: 136,
      lightingProfile: 'foliage-card',
    }));
    expect(debug.archetypes['jungle-tree'].nearestImpostorDistanceMeters).toBeGreaterThan(160);
  });

  it('crossfades opted-in vegetation meshes without mutating shared source materials', async () => {
    camera.position.set(0, 0, 0);
    const provider = makeProvider();
    const vegetationArchetype = makeVegetationArchetype({
      promotionDistanceMeters: 100,
      demotionDistanceMeters: 80,
    });
    const system = new StaticImpostorSystem(scene, camera, {
      textureProvider: provider,
      archetypes: { [vegetationArchetype.modelPath]: vegetationArchetype },
      debugSource: 'vegetation',
      transitionFadeMeters: 20,
    });
    const object = new THREE.Group();
    object.position.set(110, 0, 0);
    const sharedMaterial = new THREE.MeshStandardMaterial({ color: 0x335522 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), sharedMaterial);
    object.add(mesh);
    scene.add(object);

    const registered = system.registerInstance({
      id: 'vegetation_jungle_tree_transition',
      modelPath: vegetationArchetype.modelPath,
      object,
    });
    await flushPromises();
    system.update(0.016);

    expect(registered).toBe(true);
    expect(object.visible).toBe(true);
    expect(mesh.material).not.toBe(sharedMaterial);
    expect(sharedMaterial.opacity).toBe(1);
    expect(sharedMaterial.transparent).toBe(false);
    expect((mesh.material as THREE.Material).opacity).toBeCloseTo(0.5, 1);
    expect((mesh.material as THREE.Material).transparent).toBe(true);
    expect(getFirstBatchOpacity(scene, 'jungle-tree')).toBeCloseTo(0.5, 1);
    expect(system.getDebugInfo()).toEqual(expect.objectContaining({
      activeImpostors: 1,
      meshFallbacks: 0,
      transitioningInstances: 1,
    }));
    expect(system.getDebugInfo().archetypes['jungle-tree']).toEqual(expect.objectContaining({
      transitioningInstances: 1,
      transitionFadeMeters: 20,
    }));

    camera.position.set(-10, 0, 0);
    system.update(0.016);

    expect(object.visible).toBe(false);
    expect((mesh.material as THREE.Material).opacity).toBe(1);
    expect(getFirstBatchOpacity(scene, 'jungle-tree')).toBe(1);

    camera.position.set(40, 0, 0);
    system.update(0.016);

    expect(object.visible).toBe(true);
    expect((mesh.material as THREE.Material).opacity).toBeCloseTo(0.5, 1);
    expect(getFirstBatchOpacity(scene, 'jungle-tree')).toBeCloseTo(0.5, 1);

    camera.position.set(55, 0, 0);
    system.update(0.016);

    expect(object.visible).toBe(true);
    expect((mesh.material as THREE.Material).opacity).toBe(1);
    expect(getFirstBatchOpacity(scene, 'jungle-tree')).toBe(0);

    system.unregisterInstance('vegetation_jungle_tree_transition');

    expect(mesh.material).toBe(sharedMaterial);
    sharedMaterial.dispose();
    mesh.geometry.dispose();
  });

  it('forwards scene fog into the custom static impostor material and clamps density', async () => {
    const previousRigState = LightingRigConfig.enabled;
    LightingRigConfig.enabled = false;
    try {
      const provider = makeProvider();
      scene.fog = new THREE.FogExp2(0x123456, 0.01);
      const system = new StaticImpostorSystem(scene, camera, { textureProvider: provider });
      const object = makeStaticObject(new THREE.Vector3(220, 0, 0));
      scene.add(object);

      system.registerInstance({ id: 'fogged_static', modelPath: StructureModels.FUEL_DRUM, object });
      await flushPromises();
      system.update(0.016);

      const material = getBatchMaterial(scene);
      expect(material.uniforms.fogEnabled.value).toBe(true);
      expect(material.uniforms.fogDensity.value).toBe(0.002);
      expect(material.uniforms.fogColor.value.getHex()).toBe(0x123456);

      scene.fog = null;
      system.update(0.016);
      expect(material.uniforms.fogEnabled.value).toBe(false);
    } finally {
      LightingRigConfig.enabled = previousRigState;
    }
  });

  it('compresses rig fog color for static alpha impostors before manual fog mixing', async () => {
    const previousRigState = LightingRigConfig.enabled;
    const previousFogColor = lightingRigBindings.fogColor.value.clone();
    LightingRigConfig.enabled = true;
    lightingRigBindings.fogColor.value.setRGB(2.36, 2.66, 2.82);
    try {
      const provider = makeProvider();
      scene.fog = new THREE.FogExp2(0x123456, 0.00055);
      const system = new StaticImpostorSystem(scene, camera, { textureProvider: provider });
      const object = makeStaticObject(new THREE.Vector3(220, 0, 0));
      scene.add(object);

      system.registerInstance({ id: 'rig_fogged_static', modelPath: StructureModels.FUEL_DRUM, object });
      await flushPromises();
      system.update(0.016);

      const material = getBatchMaterial(scene);
      expect(material.uniforms.fogColor.value.b).toBeCloseTo(0.74, 2);
      expect(material.uniforms.fogColor.value.r).toBeLessThan(0.74);
      expect(material.uniforms.fogColor.value.g).toBeLessThan(0.74);
      expect(material.uniforms.fogColor.value.r / material.uniforms.fogColor.value.b)
        .toBeCloseTo(2.36 / 2.82, 2);
    } finally {
      lightingRigBindings.fogColor.value.copy(previousFogColor);
      LightingRigConfig.enabled = previousRigState;
    }
  });

  it('applies explicit material tuning only when provided by the caller', async () => {
    const provider = makeProvider();
    const system = new StaticImpostorSystem(scene, camera, {
      textureProvider: provider,
      materialTuning: {
        fogStrength: 0.62,
        foliageExposureScale: 0.9,
        foliageColorGamma: 1.45,
        foliageSaturation: 0.92,
      },
    });
    const object = makeStaticObject(new THREE.Vector3(220, 0, 0));
    scene.add(object);

    system.registerInstance({ id: 'review_tuned_static', modelPath: StructureModels.FUEL_DRUM, object });
    await flushPromises();
    system.update(0.016);

    const material = getBatchMaterial(scene);
    expect(material.uniforms.fogStrength.value).toBeCloseTo(0.62);
    expect(material.uniforms.foliageExposure.value).toBeCloseTo(STATIC_IMPOSTOR_FOLIAGE_EXPOSURE * 0.9);
    expect(material.uniforms.foliageColorGamma.value).toBeCloseTo(1.45);
    expect(material.uniforms.foliageSaturation.value).toBeCloseTo(0.92);
    expect(system.getDebugInfo().batches['fuel-drum']).toEqual(expect.objectContaining({
      fogStrength: 0.62,
      foliageExposure: material.uniforms.foliageExposure.value,
      foliageColorGamma: 1.45,
      foliageSaturation: 0.92,
    }));
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
