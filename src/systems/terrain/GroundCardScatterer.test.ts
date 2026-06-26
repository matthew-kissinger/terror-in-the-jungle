// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { VegetationGroundCardArchetype } from '../../config/vegetation/groundCardArchetypes';
import { getBiome, type BiomeVegetationEntry } from '../../config/biomes';
import { vegetationLibraryGroundCards } from '../../config/vegetation/vegetationLibraryAdapter';
import {
  GroundCardScatterer,
  type GroundCardModelLoader,
} from './GroundCardScatterer';

const FERN_CARD: VegetationGroundCardArchetype = {
  slug: 'understory-fern',
  meshPath: '/assets/vegetation/understory-fern/understory-fern.glb',
  card: { baseColor: 'fern.base.png', normal: 'fern.normal.png' },
  cardWorldSize: [2.5, 0.69],
  bounds: { center: [0, 0.34, 0], size: [1.78, 0.69, 1.75], radius: 1.3 },
  meshFarEdgeMeters: 14,
  cullDistanceMeters: 40,
  yOffset: 0.345,
  tier: 'groundCover',
  density: 0.6,
  maxSlopeDeg: 28,
};

/** A fake loader: resolves immediately with a plain Group, tracks loads/disposes/urls. */
class FakeModelLoader implements GroundCardModelLoader {
  loaded = 0;
  disposed = 0;
  readonly requested: string[] = [];
  async loadModelFromUrl(servedUrl: string): Promise<THREE.Group> {
    this.loaded++;
    this.requested.push(servedUrl);
    return new THREE.Group();
  }
  disposeInstance(instance: THREE.Object3D): void {
    this.disposed++;
    instance.removeFromParent();
  }
}

function flatHeight(_x: number, _z: number): number {
  return 10;
}

function makeScatterer(opts: {
  getHeight?: (x: number, z: number) => number;
  palette?: BiomeVegetationEntry[];
  archetypes?: Record<string, VegetationGroundCardArchetype>;
  maxNearMeshes?: number;
  maxCellDistance?: number;
} = {}) {
  const scene = new THREE.Scene();
  const modelLoader = new FakeModelLoader();
  const archetypes = opts.archetypes ?? { 'understory-fern': FERN_CARD };
  const scatterer = new GroundCardScatterer(
    {
      scene,
      modelLoader,
      getHeight: opts.getHeight ?? flatHeight,
      archetypes,
      maxNearMeshes: opts.maxNearMeshes ?? 0, // cards-only by default; near tier tested explicitly
    },
    128,
    opts.maxCellDistance ?? 1, // small residency radius keeps the cell count tractable
  );
  scatterer.setWorldBounds(100_000, 200);
  scatterer.configure(
    'denseJungle',
    new Map([['denseJungle', opts.palette ?? [{ typeId: 'understory-fern', densityMultiplier: 0.5 }]]]),
    [],
  );
  return { scene, modelLoader, scatterer };
}

/** Drain the (synchronous) cell-streaming queue until residency settles. */
function settle(scatterer: GroundCardScatterer, player: THREE.Vector3): void {
  for (let i = 0; i < 50; i++) {
    scatterer.updateBudgeted(player, { maxAddsPerFrame: 64, maxRemovalsPerFrame: 64 });
    const pending = scatterer.getPendingCounts();
    if (pending.adds === 0 && pending.removals === 0) return;
  }
}

/** Drive the per-frame LOD pass and drain the async near-mesh loads it kicks off. */
async function settleNearMeshes(scatterer: GroundCardScatterer): Promise<void> {
  for (let i = 0; i < 50; i++) {
    scatterer.updateLod(0.016);
    await Promise.resolve();
    await Promise.resolve();
    if (scatterer.getDebugInfo().inFlightNearLoads === 0) return;
  }
}

function cardMeshes(scene: THREE.Scene): THREE.InstancedMesh[] {
  return scene.children.filter(
    (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh && c.name.startsWith('veg-card:'),
  );
}

describe('GroundCardScatterer', () => {
  it('streams world-anchored instanced card batches near the player', () => {
    const { scatterer, scene } = makeScatterer();
    settle(scatterer, new THREE.Vector3(0, 0, 0));

    const debug = scatterer.getDebugInfo();
    expect(debug.activeCells).toBe(9); // (2*1+1)^2 cells at residency radius 1
    expect(debug.cardBatches).toBeGreaterThan(0);
    expect(debug.cardInstances).toBeGreaterThan(0);

    // Every batch is ONE InstancedMesh (never one clone per plant), and the instanced
    // counts in the scene match the reported instance total.
    const meshes = cardMeshes(scene);
    expect(meshes.length).toBe(debug.cardBatches);
    const sceneInstances = meshes.reduce((sum, m) => sum + m.count, 0);
    expect(sceneInstances).toBe(debug.cardInstances);
    for (const mesh of meshes) {
      expect(mesh.name.startsWith('veg-card:understory-fern:')).toBe(true);
    }
  });

  it('grounds card instances on the terrain height with a varied footprint scale', () => {
    const { scatterer, scene } = makeScatterer();
    settle(scatterer, new THREE.Vector3(0, 0, 0));

    const mesh = cardMeshes(scene)[0];
    expect(mesh).toBeDefined();
    expect(mesh.count).toBeGreaterThan(0);

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    mesh.getMatrixAt(0, m);
    m.decompose(pos, quat, scale);

    // Base-anchored geometry: the instance origin sits exactly on the terrain height.
    expect(pos.y).toBeCloseTo(10, 5);
    // Footprint scale derives from cardWorldSize (2.5 wide, 0.69 tall) * a per-plant 0.8..1.2.
    expect(scale.x).toBeGreaterThan(2.5 * 0.8 - 1e-3);
    expect(scale.x).toBeLessThan(2.5 * 1.2 + 1e-3);
    expect(scale.y).toBeGreaterThan(0.69 * 0.8 - 1e-3);
    expect(scale.y).toBeLessThan(0.69 * 1.2 + 1e-3);
  });

  it('rejects underwater and steep-slope placements', () => {
    // All terrain underwater -> zero cards despite a non-empty card palette.
    const underwater = makeScatterer({ getHeight: () => -5 });
    settle(underwater.scatterer, new THREE.Vector3(0, 0, 0));
    expect(underwater.scatterer.getDebugInfo().cardInstances).toBe(0);
    expect(cardMeshes(underwater.scene).length).toBe(0);

    // A 45-degree ramp (slope > 28 deg max) -> zero cards.
    const steep = makeScatterer({ getHeight: (x) => x });
    settle(steep.scatterer, new THREE.Vector3(0, 0, 0));
    expect(steep.scatterer.getDebugInfo().cardInstances).toBe(0);
  });

  it('ignores palette ids that are not ground-card archetypes (dual-namespace)', () => {
    // 'fern' + 'jungle-tree' are billboard / hero ids, not ground-card slugs.
    const { scatterer, scene } = makeScatterer({
      palette: [
        { typeId: 'fern', densityMultiplier: 1 },
        { typeId: 'jungle-tree', densityMultiplier: 1 },
      ],
    });
    settle(scatterer, new THREE.Vector3(0, 0, 0));

    expect(scatterer.getDebugInfo().cardInstances).toBe(0);
    expect(scatterer.getDebugInfo().activeCells).toBe(0); // no residency targets built
    expect(cardMeshes(scene).length).toBe(0);
  });

  it('scales the instance count with the palette density multiplier', () => {
    const sparse = makeScatterer({ palette: [{ typeId: 'understory-fern', densityMultiplier: 0.2 }] });
    const dense = makeScatterer({ palette: [{ typeId: 'understory-fern', densityMultiplier: 0.9 }] });
    settle(sparse.scatterer, new THREE.Vector3(0, 0, 0));
    settle(dense.scatterer, new THREE.Vector3(0, 0, 0));

    expect(dense.scatterer.getDebugInfo().cardInstances).toBeGreaterThan(
      sparse.scatterer.getDebugInfo().cardInstances,
    );
  });

  it('culls whole cells past the per-archetype cull distance', () => {
    const { scatterer, scene } = makeScatterer();
    settle(scatterer, new THREE.Vector3(0, 0, 0));
    scatterer.updateLod(0.016);

    const meshes = cardMeshes(scene);
    const visible = meshes.filter((m) => m.visible).length;
    // The cell under the player is visible; far corner cells (≥181m away, > 40m cull) are not.
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(meshes.length);

    // Walk far enough that every original cell is beyond the cull distance.
    scatterer.updateBudgeted(new THREE.Vector3(0, 0, 0), { maxAddsPerFrame: 0, maxRemovalsPerFrame: 0 });
    settle(scatterer, new THREE.Vector3(5_000, 0, 5_000));
    scatterer.updateLod(0.016);
    // The original near-origin meshes were evicted; whatever remains streams around the
    // new position. None of the new cells should be culled when the player stands in them.
    expect(scatterer.getDebugInfo().activeCells).toBe(9);
  });

  it('promotes the closest plants to real GLB near meshes, bounded + hidden', async () => {
    const { scatterer, scene, modelLoader } = makeScatterer({ maxNearMeshes: 6 });
    settle(scatterer, new THREE.Vector3(0, 0, 0));
    await settleNearMeshes(scatterer);

    const debug = scatterer.getDebugInfo();
    expect(debug.nearMeshes).toBeGreaterThan(0);
    expect(debug.nearMeshes).toBeLessThanOrEqual(6); // global cap respected
    // Each promotion loads the species' real GLB mesh, added to the scene.
    expect(modelLoader.loaded).toBeGreaterThanOrEqual(debug.nearMeshes);
    expect(modelLoader.requested.every((url) => url === FERN_CARD.meshPath)).toBe(true);
    const groups = scene.children.filter((c) => c instanceof THREE.Group);
    expect(groups.length).toBe(debug.nearMeshes);
  });

  it('disposes every card batch + near mesh on teardown (no leak)', async () => {
    const { scatterer, scene, modelLoader } = makeScatterer({ maxNearMeshes: 6 });
    settle(scatterer, new THREE.Vector3(0, 0, 0));
    await settleNearMeshes(scatterer);
    expect(cardMeshes(scene).length).toBeGreaterThan(0);
    const promoted = scatterer.getDebugInfo().nearMeshes;

    scatterer.dispose();

    expect(scatterer.getDebugInfo().activeCells).toBe(0);
    expect(scatterer.getDebugInfo().cardInstances).toBe(0);
    expect(scatterer.getDebugInfo().nearMeshes).toBe(0);
    expect(cardMeshes(scene).length).toBe(0);
    expect(modelLoader.disposed).toBe(promoted);
  });

  it('places nothing when no palette entry is a ground-card archetype', () => {
    const { scatterer } = makeScatterer({
      palette: [{ typeId: 'coconut', densityMultiplier: 1 }],
    });
    settle(scatterer, new THREE.Vector3(0, 0, 0));
    expect(scatterer.getDebugInfo().cardInstances).toBe(0);
    expect(scatterer.getDebugInfo().activeCells).toBe(0);
  });
});

describe('GroundCardScatterer real-config wiring', () => {
  // Regression guard for the cutover: proves the live catalog -> adapter -> biome palette
  // chain actually streams the baked ground cards, and that billboard/hero palette ids
  // (fern, jungle-tree, ...) never reach the card path.
  it('streams the baked library ground cards from the real denseJungle palette', async () => {
    const archetypes = vegetationLibraryGroundCards();
    const palette = getBiome('denseJungle').vegetationPalette;

    const scene = new THREE.Scene();
    const modelLoader = new FakeModelLoader();
    const scatterer = new GroundCardScatterer(
      { scene, modelLoader, getHeight: () => 10, archetypes, maxNearMeshes: 4 },
      128,
      2,
    );
    scatterer.setWorldBounds(100_000, 200);
    scatterer.configure('denseJungle', new Map([['denseJungle', palette]]), []);
    settle(scatterer, new THREE.Vector3(0, 0, 0));
    await settleNearMeshes(scatterer);

    // denseJungle wires understory-fern + taro-elephant-ear + banana-plant cards
    // (rice-paddy is riverbank-only).
    const slugs = new Set(
      cardMeshes(scene).map((m) => m.name.split(':')[1]),
    );
    expect(slugs.has('understory-fern')).toBe(true);
    expect(slugs.has('taro-elephant-ear')).toBe(true);
    expect(slugs.has('banana-plant')).toBe(true);
    expect(slugs.has('rice-paddy')).toBe(false);
    // Nothing outside the ground-card archetype set ever produces a card batch.
    expect([...slugs].every((s) => s in archetypes)).toBe(true);
    // Near meshes only ever request a known ground-card GLB mesh path.
    const meshPaths = new Set(Object.values(archetypes).map((a) => a.meshPath));
    expect(modelLoader.requested.every((url) => meshPaths.has(url))).toBe(true);
  });
});
