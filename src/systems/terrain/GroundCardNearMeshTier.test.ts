// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { VegetationGroundCardArchetype } from '../../config/vegetation/groundCardArchetypes';
import type {
  GroundCardBatch,
  GroundCardCellResidency,
  GroundCardModelLoader,
} from './GroundCardScatterer';
import {
  GroundCardNearMeshTier,
  computeNearMeshFadeBlend,
  DEFAULT_GROUND_CARD_TRANSITION_FADE_METERS,
} from './GroundCardNearMeshTier';

// A coconut-like archetype: 50m near edge, the case the owner saw pop mesh<->card.
const COCONUT: VegetationGroundCardArchetype = {
  slug: 'coconut-palm',
  meshPath: '/assets/vegetation/coconut-palm/coconut-palm.glb',
  card: { baseColor: 'coconut.base.png', normal: 'coconut.normal.png' },
  cardWorldSize: [17.62, 27.08],
  bounds: { center: [0, 13.54, 0], size: [12.75, 27.08, 12.16], radius: 16.15 },
  meshFarEdgeMeters: 50,
  cullDistanceMeters: 140,
  yOffset: 13.54,
  tier: 'canopy',
  density: 0.4,
  maxSlopeDeg: 18,
};

const MESH_FAR_EDGE = COCONUT.meshFarEdgeMeters;
const DEMOTE = MESH_FAR_EDGE * 1.18;

/** A loader whose GLB carries one mesh + material, so the crossfade opacity is observable. */
class MeshBearingLoader implements GroundCardModelLoader {
  readonly loaded: THREE.Group[] = [];
  async loadModelFromUrl(): Promise<THREE.Group> {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ opacity: 1, transparent: false }),
    );
    group.add(mesh);
    this.loaded.push(group);
    return group;
  }
  disposeInstance(instance: THREE.Object3D): void {
    instance.removeFromParent();
  }
}

function makeBatch(scene: THREE.Object3D): GroundCardBatch {
  // One plant sitting at the world origin.
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 1);
  mesh.name = 'veg-card:coconut-palm:0|0';
  const baseMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0, 0),
    new THREE.Quaternion(),
    new THREE.Vector3(1, 1, 1),
  );
  mesh.setMatrixAt(0, baseMatrix);
  scene.add(mesh);
  return {
    slug: COCONUT.slug,
    mesh,
    placements: [{ x: 0, z: 0, height: 0, yaw: 0, scale: 1 }],
    baseMatrices: [baseMatrix.clone()],
    hidden: new Set<number>(),
    meshFarEdgeSq: MESH_FAR_EDGE * MESH_FAR_EDGE,
    meshDemoteSq: DEMOTE * DEMOTE,
    cullDistanceSq: COCONUT.cullDistanceMeters * COCONUT.cullDistanceMeters,
  };
}

function makeTier(opts: { transitionFadeMeters?: number } = {}) {
  const scene = new THREE.Scene();
  const modelLoader = new MeshBearingLoader();
  const batch = makeBatch(scene);
  const residency: GroundCardCellResidency = {
    generation: 1,
    cellX: 0,
    cellZ: 0,
    batches: [batch],
    empty: false,
  };
  const activeCells = new Map<string, GroundCardCellResidency>([['0|0', residency]]);
  const tier = new GroundCardNearMeshTier({
    scene,
    modelLoader,
    archetypes: { [COCONUT.slug]: COCONUT },
    cellSize: 128,
    maxNearMeshes: 4,
    activeCells,
    ...opts,
  });
  return { scene, modelLoader, batch, tier };
}

/** Drive refresh() until the async promotion has placed its GLB, then once more. */
async function promoteAt(tier: GroundCardNearMeshTier, player: THREE.Vector3): Promise<void> {
  for (let i = 0; i < 20; i++) {
    tier.refresh(player);
    await Promise.resolve();
    await Promise.resolve();
    if (tier.activeCount > 0 && tier.inFlightLoadCount === 0) break;
  }
  // One more pass so the just-placed mesh gets its distance-driven crossfade opacity.
  tier.refresh(player);
}

function nearMeshMaterialOpacity(scene: THREE.Object3D): number | null {
  let opacity: number | null = null;
  for (const child of scene.children) {
    if (!(child instanceof THREE.Group)) continue;
    child.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        const material = Array.isArray(node.material) ? node.material[0] : node.material;
        opacity = material.opacity;
      }
    });
  }
  return opacity;
}

describe('computeNearMeshFadeBlend', () => {
  it('crossfades mesh->card across the band instead of a hard switch', () => {
    const fade = DEFAULT_GROUND_CARD_TRANSITION_FADE_METERS;
    const edge = MESH_FAR_EDGE;

    // Well inside the near edge: all mesh, no card.
    const near = computeNearMeshFadeBlend(0, edge, fade);
    expect(near.meshOpacity).toBe(1);
    expect(near.cardOpacity).toBe(0);

    // Midway through the band: a partial blend, NOT a 0/1 switch, and the two sum to 1.
    const mid = computeNearMeshFadeBlend(edge - fade / 2, edge, fade);
    expect(mid.meshOpacity).toBeGreaterThan(0);
    expect(mid.meshOpacity).toBeLessThan(1);
    expect(mid.cardOpacity).toBeGreaterThan(0);
    expect(mid.cardOpacity).toBeLessThan(1);
    expect(mid.meshOpacity + mid.cardOpacity).toBeCloseTo(1, 6);

    // At/just past the swap edge: all card.
    const far = computeNearMeshFadeBlend(edge, edge, fade);
    expect(far.meshOpacity).toBe(0);
    expect(far.cardOpacity).toBe(1);

    // Opacity falls monotonically as the plant recedes through the band.
    const a = computeNearMeshFadeBlend(edge - fade * 0.75, edge, fade).meshOpacity;
    const b = computeNearMeshFadeBlend(edge - fade * 0.25, edge, fade).meshOpacity;
    expect(a).toBeGreaterThan(b);
  });
});

describe('GroundCardNearMeshTier crossfade', () => {
  it('blends a promoted near mesh partially within the transition band (no hard pop)', async () => {
    const { scene, tier } = makeTier();
    // Stand the player inside the band (between meshFarEdge - fade and meshFarEdge).
    const bandDistance = MESH_FAR_EDGE - DEFAULT_GROUND_CARD_TRANSITION_FADE_METERS / 2;
    await promoteAt(tier, new THREE.Vector3(bandDistance, 0, 0));

    expect(tier.activeCount).toBe(1);
    const opacity = nearMeshMaterialOpacity(scene);
    expect(opacity).not.toBeNull();
    // Partial blend: the near mesh is neither fully opaque nor fully gone.
    expect(opacity!).toBeGreaterThan(0);
    expect(opacity!).toBeLessThan(1);
  });

  it('keeps the card visible across the band and hides it only at full mesh opacity', async () => {
    const { batch, tier } = makeTier();

    // Inside the band: the card instance stays visible (read through the fading mesh).
    await promoteAt(tier, new THREE.Vector3(MESH_FAR_EDGE - 4, 0, 0));
    expect(tier.activeCount).toBe(1);
    expect(batch.hidden.has(0)).toBe(false);

    // Walk in to full-mesh range: now the card is hidden (no double-draw at rest).
    tier.refresh(new THREE.Vector3(2, 0, 0));
    expect(batch.hidden.has(0)).toBe(true);
  });

  it('hard-switches (card hidden immediately) when the fade band is disabled', async () => {
    const { batch, tier } = makeTier({ transitionFadeMeters: 0 });
    await promoteAt(tier, new THREE.Vector3(MESH_FAR_EDGE - 4, 0, 0));

    expect(tier.activeCount).toBe(1);
    // Legacy behavior: the card is hidden the moment a near mesh is shown.
    expect(batch.hidden.has(0)).toBe(true);
  });

  it('restores the card when the plant demotes back past the hysteresis band', async () => {
    const { batch, tier } = makeTier();
    await promoteAt(tier, new THREE.Vector3(2, 0, 0));
    expect(tier.activeCount).toBe(1);

    // Walk well past the demote distance: the near mesh is dropped and the card returns.
    tier.refresh(new THREE.Vector3(DEMOTE + 10, 0, 0));
    expect(tier.activeCount).toBe(0);
    expect(batch.hidden.has(0)).toBe(false);
  });
});
