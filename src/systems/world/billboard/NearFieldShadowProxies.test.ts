// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  NearFieldShadowProxies,
  NEAR_FIELD_PROXY_CAPACITY,
  NEAR_FIELD_PROXY_RADIUS,
  type ProxyCandidateSource,
} from './NearFieldShadowProxies';

/**
 * Behavior contract for the near-field billboard shadow proxies
 * (`shadow-single-map-truth`). We assert what the proxy set DOES from the
 * caller's perspective — only near billboards get a caster, freed slots are
 * skipped, the count is bounded, and the proxies actually cast — not any
 * internal buffer detail.
 */

/** Build a candidate source from an array of [x, y, z, scaleX, scaleY] rows. */
function source(rows: number[][], cardWidth = 2, cardHeight = 4): ProxyCandidateSource {
  const positions = new Float32Array(rows.length * 3);
  const scales = new Float32Array(rows.length * 2);
  rows.forEach((r, i) => {
    positions[i * 3] = r[0];
    positions[i * 3 + 1] = r[1];
    positions[i * 3 + 2] = r[2];
    scales[i * 2] = r[3];
    scales[i * 2 + 1] = r[4];
  });
  return { positions, scales, count: rows.length, cardWidth, cardHeight };
}

describe('NearFieldShadowProxies', () => {
  let scene: THREE.Scene;
  let proxies: NearFieldShadowProxies;

  beforeEach(() => {
    scene = new THREE.Scene();
    proxies = new NearFieldShadowProxies(scene);
  });

  it('casts shadows (the whole point) and does not receive them', () => {
    const mesh = scene.getObjectByName('near-field-shadow-proxies') as THREE.Mesh;
    expect(mesh).toBeTruthy();
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(false);
  });

  it('gives a proxy caster to a billboard inside the near radius', () => {
    const player = new THREE.Vector3(0, 0, 0);
    proxies.rebuild([source([[5, 0, 5, 1, 1]])], player);
    expect(proxies.getLiveCount()).toBe(1);
  });

  it('does NOT give a proxy to a billboard beyond the near radius', () => {
    const player = new THREE.Vector3(0, 0, 0);
    const far = NEAR_FIELD_PROXY_RADIUS + 10;
    proxies.rebuild([source([[far, 0, 0, 1, 1]])], player);
    expect(proxies.getLiveCount()).toBe(0);
  });

  it('recenters the near ring on the player (a distant player drops previously-near proxies)', () => {
    const near = source([[0, 0, 0, 1, 1]]);
    proxies.rebuild([near], new THREE.Vector3(0, 0, 0));
    expect(proxies.getLiveCount()).toBe(1);
    proxies.rebuild([near], new THREE.Vector3(500, 0, 500));
    expect(proxies.getLiveCount()).toBe(0);
  });

  it('skips freed slots (scale-0 instances) even when their stale position is nearby', () => {
    // Slot 0 freed (scaleX 0) but position still (1,0,1); slot 1 live at (2,0,2).
    proxies.rebuild([source([[1, 0, 1, 0, 0], [2, 0, 2, 1, 1]])], new THREE.Vector3(0, 0, 0));
    expect(proxies.getLiveCount()).toBe(1);
  });

  it('bounds the live proxy count to the capacity even with a dense near field', () => {
    const rows: number[][] = [];
    for (let i = 0; i < NEAR_FIELD_PROXY_CAPACITY * 2; i++) {
      rows.push([i % 10, 0, Math.floor(i / 10), 1, 1]);
    }
    proxies.rebuild([source(rows)], new THREE.Vector3(0, 0, 0));
    expect(proxies.getLiveCount()).toBeLessThanOrEqual(NEAR_FIELD_PROXY_CAPACITY);
  });

  it('clears all proxies on demand (kill-switch OFF path)', () => {
    proxies.rebuild([source([[5, 0, 5, 1, 1]])], new THREE.Vector3(0, 0, 0));
    expect(proxies.getLiveCount()).toBe(1);
    proxies.clear();
    expect(proxies.getLiveCount()).toBe(0);
    const mesh = scene.getObjectByName('near-field-shadow-proxies') as THREE.InstancedMesh;
    expect(mesh.count).toBe(0);
  });
});

describe('GLB hero / world-prop shadow regression pin', () => {
  it('a standard scene mesh set to cast still casts (proxies never touch other meshes castShadow)', () => {
    // Regression pin: the proxy system only adds its OWN instanced caster; it must
    // never regress GLB heroes / world props that opt into castShadow themselves.
    const scene = new THREE.Scene();
    const hero = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
    hero.castShadow = true;
    scene.add(hero);

    const proxies = new NearFieldShadowProxies(scene);
    proxies.rebuild([source([[3, 0, 3, 1, 1]])], new THREE.Vector3(0, 0, 0));

    expect(hero.castShadow).toBe(true);
    expect(proxies.getLiveCount()).toBe(1);
  });
});
