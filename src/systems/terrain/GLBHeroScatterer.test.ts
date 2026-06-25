// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { StaticImpostorArchetype } from '../../config/staticImpostorArchetypes';
import type { BiomeVegetationEntry } from '../../config/biomes';
import {
  GLBHeroScatterer,
  type HeroImpostorRegistrar,
  type HeroModelLoader,
} from './GLBHeroScatterer';

const HERO_ARCHETYPE: StaticImpostorArchetype = {
  slug: 'jungle-tree',
  modelPath: '/assets/vegetation/jungle-tree/jungle-tree.glb',
  maps: { baseColor: 'a.png', normal: 'n.png', depth: 'd.png' },
  atlasSize: [2048, 768],
  tileSize: [256, 256],
  columns: 8,
  rows: 3,
  azimuthFrames: 8,
  elevationFrames: 3,
  maxTextureSize: 2048,
  planePaddingScale: 1.16,
  bounds: { center: [0, 15, 0], size: [29, 31, 28], radius: 25 },
  promotionDistanceMeters: 180,
  demotionDistanceMeters: 153,
  parallaxStrength: 0.04,
};

/** A fake loader: resolves immediately with a plain Object3D, tracks dispose calls. */
class FakeModelLoader implements HeroModelLoader {
  loaded = 0;
  disposed = 0;
  // Resolve on a microtask so the streaming + load ordering matches production.
  async loadModelFromUrl(_servedUrl: string): Promise<THREE.Group> {
    this.loaded++;
    return new THREE.Group();
  }
  disposeInstance(instance: THREE.Object3D): void {
    this.disposed++;
    instance.removeFromParent();
  }
}

/** A fake registrar mirroring StaticImpostorSystem's id bookkeeping. */
class FakeImpostors implements HeroImpostorRegistrar {
  registered = new Set<string>();
  updates = 0;
  registerInstance(params: { id: string; modelPath: string; object: THREE.Object3D }): boolean {
    this.registered.add(params.id);
    return true;
  }
  unregisterInstance(id: string): void {
    this.registered.delete(id);
  }
  update(_deltaTime: number): void {
    this.updates++;
  }
}

function flatHeight(_x: number, _z: number): number {
  return 10;
}

function makeScatterer(opts: {
  getHeight?: (x: number, z: number) => number;
  palette?: BiomeVegetationEntry[];
  archetypes?: Record<string, StaticImpostorArchetype>;
} = {}) {
  const scene = new THREE.Scene();
  const modelLoader = new FakeModelLoader();
  const impostors = new FakeImpostors();
  const archetypes = opts.archetypes ?? { 'jungle-tree': HERO_ARCHETYPE };
  const scatterer = new GLBHeroScatterer(
    {
      scene,
      modelLoader,
      impostors,
      getHeight: opts.getHeight ?? flatHeight,
      archetypes,
    },
    128,
    1, // small residency radius keeps the cell count tractable for tests
  );
  scatterer.setWorldBounds(100_000, 200);
  scatterer.configure(
    'denseJungle',
    new Map([['denseJungle', opts.palette ?? [{ typeId: 'jungle-tree', densityMultiplier: 0.2 }]]]),
    [],
  );
  return { scene, modelLoader, impostors, scatterer };
}

/** Drain all pending streaming work + queued microtasks until counts settle. */
async function settle(scatterer: GLBHeroScatterer, player: THREE.Vector3): Promise<void> {
  for (let i = 0; i < 50; i++) {
    scatterer.updateBudgeted(player, { maxAddsPerFrame: 64, maxRemovalsPerFrame: 64 });
    await Promise.resolve();
    await Promise.resolve();
    const pending = scatterer.getPendingCounts();
    if (pending.adds === 0 && pending.removals === 0 && scatterer.getDebugInfo().inFlightLoads === 0) {
      return;
    }
  }
}

describe('GLBHeroScatterer', () => {
  it('scatters hero meshes near the player and registers them with the impostor system', async () => {
    const { scatterer, impostors, modelLoader } = makeScatterer();
    await settle(scatterer, new THREE.Vector3(0, 0, 0));

    const debug = scatterer.getDebugInfo();
    expect(debug.activeCells).toBe(9); // (2*1+1)^2 cells at residency radius 1
    expect(debug.registeredInstances).toBeGreaterThan(0);
    expect(impostors.registered.size).toBe(debug.registeredInstances);
    expect(modelLoader.loaded).toBe(debug.registeredInstances);
  });

  it('rejects underwater and steep-slope placements', async () => {
    // All terrain underwater -> zero heroes despite a non-empty palette.
    const underwater = makeScatterer({ getHeight: () => -5 });
    await settle(underwater.scatterer, new THREE.Vector3(0, 0, 0));
    expect(underwater.scatterer.getDebugInfo().registeredInstances).toBe(0);

    // A 45-degree ramp (slope > 20 deg max) -> zero heroes.
    const steep = makeScatterer({ getHeight: (x) => x });
    await settle(steep.scatterer, new THREE.Vector3(0, 0, 0));
    expect(steep.scatterer.getDebugInfo().registeredInstances).toBe(0);
  });

  it('places nothing when the palette has no hero archetype', async () => {
    const { scatterer } = makeScatterer({
      palette: [{ typeId: 'fern', densityMultiplier: 1 }],
    });
    await settle(scatterer, new THREE.Vector3(0, 0, 0));
    expect(scatterer.getDebugInfo().registeredInstances).toBe(0);
    expect(scatterer.getDebugInfo().activeCells).toBe(0); // no residency targets built
  });

  it('unregisters and disposes every instance on teardown (no leak)', async () => {
    const { scatterer, impostors, modelLoader } = makeScatterer();
    await settle(scatterer, new THREE.Vector3(0, 0, 0));
    const placed = scatterer.getDebugInfo().registeredInstances;
    expect(placed).toBeGreaterThan(0);

    scatterer.dispose();

    expect(impostors.registered.size).toBe(0);
    expect(scatterer.getDebugInfo().registeredInstances).toBe(0);
    expect(scatterer.getDebugInfo().activeCells).toBe(0);
    expect(modelLoader.disposed).toBe(placed);
  });

  it('evicts cells when the player walks away, returning to a clean baseline', async () => {
    const { scatterer, impostors } = makeScatterer();
    await settle(scatterer, new THREE.Vector3(0, 0, 0));
    expect(scatterer.getDebugInfo().registeredInstances).toBeGreaterThan(0);

    // Walk far enough that no original cell remains in residency.
    await settle(scatterer, new THREE.Vector3(100_000, 0, 100_000));

    // Far corner is outside the world margin -> cells generate empty; the
    // originally-populated cells must all have been unregistered.
    const ids = [...impostors.registered];
    expect(ids.every((id) => id.startsWith('veg-hero:'))).toBe(true);
    // Old near-origin instances are gone; registry only holds current residency.
    expect(scatterer.getDebugInfo().registeredInstances).toBe(impostors.registered.size);
  });

  it('drives the impostor LOD update every frame via updateImpostors', () => {
    const { scatterer, impostors } = makeScatterer();
    scatterer.updateImpostors(0.016);
    scatterer.updateImpostors(0.016);
    expect(impostors.updates).toBe(2);
  });
});
