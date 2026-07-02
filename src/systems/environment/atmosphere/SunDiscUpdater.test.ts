// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SunDiscUpdater } from './SunDiscUpdater';
import type { ITerrainRuntime } from '../../../types/SystemInterfaces';

/**
 * Behaviour contract for the sun-disc updater — the thin owner that wraps the
 * disc sprite and drives the terrain-horizon occlusion fade. We assert the
 * caller-observable outcome: the disc mesh is reachable, a blocking ridge fades
 * the disc opacity to zero, and a clear ray leaves it at full opacity. The
 * WebGL2 material exposes a plain `uOcclusion` uniform we can read; the TSL path
 * shares the same drive.
 */
function tallTerrain(height: number): ITerrainRuntime {
  return {
    getHeightAt: () => height,
    isTerrainReady: () => true,
  } as unknown as ITerrainRuntime;
}

describe('SunDiscUpdater', () => {
  const DOME_RADIUS = 500;
  const readOcclusion = (updater: SunDiscUpdater): number =>
    ((updater.getMesh().material as THREE.ShaderMaterial).uniforms.uOcclusion.value as number);

  it('exposes a single stable disc mesh for scene attachment', () => {
    const updater = new SunDiscUpdater(DOME_RADIUS);
    const a = updater.getMesh();
    expect(a).toBe(updater.getMesh());
    expect(a).toBeInstanceOf(THREE.Mesh);
    updater.dispose();
  });

  it('fades the disc to zero opacity when a tall ridge blocks a low sun', () => {
    const updater = new SunDiscUpdater(DOME_RADIUS);
    updater.setRendererBackend('webgl');
    updater.setTerrainRuntime(tallTerrain(5000));
    const lowSun = new THREE.Vector3(0.98, 0.06, 0).normalize();

    updater.update(true, new THREE.Vector3(0, 100, 0), lowSun, new THREE.Color(1, 0.7, 0.4));

    expect(readOcclusion(updater)).toBe(0);
    updater.dispose();
  });

  it('keeps the disc fully visible over terrain far below the eye', () => {
    const updater = new SunDiscUpdater(DOME_RADIUS);
    updater.setRendererBackend('webgl');
    updater.setTerrainRuntime(tallTerrain(-500));
    const sun = new THREE.Vector3(0.6, 0.5, 0.2).normalize();

    updater.update(true, new THREE.Vector3(0, 200, 0), sun, new THREE.Color(1, 1, 1));

    expect(readOcclusion(updater)).toBe(1);
    updater.dispose();
  });

  it('never occludes when no terrain is bound (sandbox / pre-terrain frames)', () => {
    const updater = new SunDiscUpdater(DOME_RADIUS);
    updater.setRendererBackend('webgl');
    const sun = new THREE.Vector3(0.9, 0.1, 0).normalize();

    updater.update(true, new THREE.Vector3(0, 100, 0), sun, new THREE.Color(1, 0.8, 0.5));

    expect(readOcclusion(updater)).toBe(1);

    // Clearing a previously-bound terrain restores full visibility.
    updater.setTerrainRuntime(tallTerrain(5000));
    updater.update(true, new THREE.Vector3(0, 100, 0), sun, new THREE.Color(1, 0.8, 0.5));
    expect(readOcclusion(updater)).toBe(0);
    updater.setTerrainRuntime(undefined);
    updater.update(true, new THREE.Vector3(0, 100, 0), sun, new THREE.Color(1, 0.8, 0.5));
    expect(readOcclusion(updater)).toBe(1);
    updater.dispose();
  });

  it('hides the sprite when disabled', () => {
    const updater = new SunDiscUpdater(DOME_RADIUS);
    const sun = new THREE.Vector3(0.3, 0.9, 0.3).normalize();
    updater.update(false, new THREE.Vector3(0, 0, 0), sun, new THREE.Color(1, 1, 1));
    expect(updater.getMesh().visible).toBe(false);
  });
});
