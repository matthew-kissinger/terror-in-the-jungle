// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { StaticImpostorArchetype } from '../../config/staticImpostorArchetypes';
import { getBiome, type BiomeVegetationEntry } from '../../config/biomes';
import { vegetationLibraryStaticArchetypes } from '../../config/vegetation/vegetationLibraryAdapter';
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

describe('GLBHeroScatterer POI exclusion', () => {
  // Regression guard for the 2026-06-28 owner playtest bug: hero canopy trees
  // grew on the airfield runway because the hero scatterer was never told about
  // the exclusion zones. The behavior contract: a hero must never be placed
  // inside an exclusion zone, while heroes outside it are unaffected.
  it('places no hero inside an exclusion zone, but still places heroes outside it', async () => {
    // Capture the world XZ of every hero the scatterer registers (the object's
    // position is set before registration, mirroring production placement).
    const placedXZ: Array<{ x: number; z: number }> = [];
    const scene = new THREE.Scene();
    const modelLoader = new FakeModelLoader();
    const impostors: HeroImpostorRegistrar = {
      registerInstance(params: { id: string; modelPath: string; object: THREE.Object3D }): boolean {
        placedXZ.push({ x: params.object.position.x, z: params.object.position.z });
        return true;
      },
      unregisterInstance(): void {},
      update(): void {},
    };
    const scatterer = new GLBHeroScatterer(
      {
        scene,
        modelLoader,
        impostors,
        getHeight: flatHeight,
        archetypes: { 'jungle-tree': HERO_ARCHETYPE },
      },
      128,
      2, // wide enough residency that heroes land both inside and outside the zone
    );
    scatterer.setWorldBounds(100_000, 200);
    scatterer.configure(
      'denseJungle',
      new Map([['denseJungle', [{ typeId: 'jungle-tree', densityMultiplier: 0.2 }]]]),
      [],
    );

    // A runway-sized exclusion zone centered at the world origin.
    const zone = { x: 0, z: 0, radius: 120 };
    scatterer.setExclusionZones([zone]);

    await settle(scatterer, new THREE.Vector3(0, 0, 0));

    expect(placedXZ.length).toBeGreaterThan(0);

    const radiusSq = zone.radius * zone.radius;
    const inside = placedXZ.filter((p) => {
      const dx = p.x - zone.x;
      const dz = p.z - zone.z;
      return dx * dx + dz * dz <= radiusSq;
    });
    const outside = placedXZ.length - inside.length;

    // The bug: heroes ignored the exclusion zone (inside.length > 0).
    expect(inside.length).toBe(0);
    // And the fix must not over-cull: heroes outside the zone still place.
    expect(outside).toBeGreaterThan(0);
  });
});

describe('GLBHeroScatterer real-config wiring', () => {
  // Regression guard for the asset cutover: proves the live catalog -> adapter ->
  // biome palette chain actually streams the baked canopy heroes, and that the
  // billboard-only palette ids (fern, fanPalm, ...) never reach the GLB loader.
  it('streams the baked library canopy heroes from the real denseJungle palette', async () => {
    const archetypes = vegetationLibraryStaticArchetypes();
    const palette = getBiome('denseJungle').vegetationPalette;

    const requested: string[] = [];
    const loader: HeroModelLoader = {
      async loadModelFromUrl(url: string): Promise<THREE.Group> {
        requested.push(url);
        return new THREE.Group();
      },
      disposeInstance(o: THREE.Object3D): void {
        o.removeFromParent();
      },
    };
    const impostors = new FakeImpostors();
    const scatterer = new GLBHeroScatterer(
      {
        scene: new THREE.Scene(),
        modelLoader: loader,
        impostors,
        getHeight: () => 10,
        archetypes,
      },
      128,
      3, // wide enough residency that every wired species samples many cells
    );
    scatterer.setWorldBounds(100_000, 200);
    scatterer.configure('denseJungle', new Map([['denseJungle', palette]]), []);
    await settle(scatterer, new THREE.Vector3(0, 0, 0));

    // Distinct asset slugs actually streamed to the loader.
    const slugs = new Set(
      requested.map((u) => u.split('/assets/vegetation/')[1]?.split('/')[0]),
    );
    // Every baked canopy hero wired into denseJungle places.
    for (const s of ['jungle-tree', 'rubber-a', 'rubber-b', 'teak-a', 'teak-b']) {
      expect(slugs.has(s), s).toBe(true);
    }
    // Nothing outside the hero archetype set ever reaches the GLB loader.
    expect([...slugs].every((s) => s in archetypes)).toBe(true);
    expect(impostors.registered.size).toBeGreaterThan(0);
  });
});
