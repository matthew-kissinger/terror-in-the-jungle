// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TracerPool } from './TracerPool';

describe('TracerPool', () => {
  it('tags pooled tracer drawables for render attribution', () => {
    const scene = new THREE.Scene();
    const pool = new TracerPool(scene, 1);
    const group = scene.children[0] as THREE.Group;

    expect(group.name).toBe('TracerFx');
    expect(group.userData.perfCategory).toBe('tracer_fx');
    expect(group.children).toHaveLength(2);
    for (const child of group.children) {
      expect(child.userData.perfCategory).toBe('tracer_fx');
    }

    pool.spawn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -10));

    expect(group.visible).toBe(true);
    pool.dispose();
    expect(scene.children).not.toContain(group);
  });

  it('writes tracer endpoints directly into the shared line buffer and marks the edited range dirty', () => {
    const scene = new THREE.Scene();
    const pool = new TracerPool(scene, 1);
    const group = scene.children[0] as THREE.Group;
    const line = group.children[0] as THREE.Line;
    const position = (line.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    const start = new THREE.Vector3(1, 2, 3);
    const end = new THREE.Vector3(4, 5, 6);
    const versionBeforeSpawn = position.version;

    pool.spawn(start, end);

    expect(Array.from(position.array)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(position.version).toBeGreaterThan(versionBeforeSpawn);
    expect(position.updateRanges.at(-1)).toEqual({ start: 0, count: 6 });
    expect(group.visible).toBe(true);

    pool.dispose();
  });

  it('does not read the clock on idle update when no tracers are active', () => {
    const scene = new THREE.Scene();
    const pool = new TracerPool(scene, 1);
    const nowSpy = vi.spyOn(performance, 'now');

    try {
      pool.update();

      expect(nowSpy).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
      pool.dispose();
    }
  });

  it('fades active tracer materials during the final 50ms of lifetime', () => {
    const scene = new THREE.Scene();
    const pool = new TracerPool(scene, 1);
    const group = scene.children[0] as THREE.Group;
    const coreLine = group.children[0] as THREE.Line;
    const glowLine = group.children[1] as THREE.Line;
    const coreMaterial = coreLine.material as THREE.LineBasicMaterial;
    const glowMaterial = glowLine.material as THREE.LineBasicMaterial;
    const nowSpy = vi.spyOn(performance, 'now');

    try {
      nowSpy.mockReturnValue(1000);
      pool.spawn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -10), 100);

      expect(coreMaterial.opacity).toBeCloseTo(0.9);
      expect(glowMaterial.opacity).toBeCloseTo(0.5);

      nowSpy.mockReturnValue(1075);
      pool.update();

      expect(coreMaterial.opacity).toBeCloseTo(0.45);
      expect(glowMaterial.opacity).toBeCloseTo(0.15);
    } finally {
      nowSpy.mockRestore();
      pool.dispose();
    }
  });
});
