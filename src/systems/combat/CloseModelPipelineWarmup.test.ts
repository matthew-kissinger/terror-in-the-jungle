// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { prepareCombatantRendererCloseModelPipelineWarmup } from './CloseModelPipelineWarmup';

function makeInstance(poolKey: string, x: number): { root: THREE.Group; poolKey: string; visualScale: number } {
  const root = new THREE.Group();
  root.visible = false;
  root.position.set(x, 2, 3);
  root.scale.set(1, 1, 1);
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  ));
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.frustumCulled = true;
    }
  });
  return { root, poolKey, visualScale: 0.8 };
}

describe('prepareCombatantRendererCloseModelPipelineWarmup', () => {
  it('temporarily exposes pooled and active close models, then restores state', () => {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 1, 8);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld(true);
    const pooled = makeInstance('NVA', 1);
    const active = makeInstance('VC', 5);
    active.root.visible = true;
    const rendererLike = {
      closeModelPools: new Map([['NVA', [pooled]]]),
      activeCloseModels: new Map([['combatant-1', active]]),
    };
    const pooledPosition = pooled.root.position.clone();
    const activePosition = active.root.position.clone();

    const warmup = prepareCombatantRendererCloseModelPipelineWarmup(rendererLike, camera);

    expect(warmup.count).toBe(2);
    expect(warmup.poolCounts).toEqual({ NVA: 1, VC: 1 });
    expect(pooled.root.visible).toBe(true);
    expect(active.root.visible).toBe(true);
    const cullingDuring: boolean[] = [];
    pooled.root.traverse((child) => {
      if (child instanceof THREE.Mesh) cullingDuring.push(child.frustumCulled);
    });
    expect(cullingDuring).toEqual([false]);

    warmup.restore();
    warmup.restore();

    expect(pooled.root.visible).toBe(false);
    expect(active.root.visible).toBe(true);
    expect(pooled.root.position.toArray()).toEqual(pooledPosition.toArray());
    expect(active.root.position.toArray()).toEqual(activePosition.toArray());
    const cullingAfter: boolean[] = [];
    pooled.root.traverse((child) => {
      if (child instanceof THREE.Mesh) cullingAfter.push(child.frustumCulled);
    });
    expect(cullingAfter).toEqual([true]);
  });
});
