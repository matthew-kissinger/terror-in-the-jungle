/**
 * Behavior tests for the terrain-sandbox mesh builder. WebGLRenderer does
 * not initialize in jsdom, so we test the pure geometry construction —
 * which is where the params-to-mesh contract lives.
 * (See docs/TESTING.md.)
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTerrainMesh } from './terrainSandboxScene';
import {
  DEFAULT_PREVIEW_TOGGLES,
  type PreviewToggles,
} from './terrainSandbox/terrainTuning';
import { generateHeightmap } from './terrainSandbox/heightmapGenerator';

describe('buildTerrainMesh', () => {
  it('produces a mesh with one vertex per heightmap sample', () => {
    const heightmap = generateHeightmap({ resolution: 128 });
    const mesh = buildTerrainMesh(heightmap, DEFAULT_PREVIEW_TOGGLES);
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    expect(pos.count).toBe(128 * 128);
  });

  it('writes heightmap values into the Y channel of vertex positions', () => {
    const heightmap = generateHeightmap({ resolution: 128 });
    const mesh = buildTerrainMesh(heightmap, DEFAULT_PREVIEW_TOGGLES);
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    // The first vertex's Y should equal the first heightmap sample.
    expect(pos.getY(0)).toBeCloseTo(heightmap.data[0], 5);
    // A mid-row vertex too, to rule out a coincidental zero match.
    const idx = 64 * 128 + 7;
    expect(pos.getY(idx)).toBeCloseTo(heightmap.data[idx], 5);
  });

  it('applies the wireframe toggle to the material', () => {
    const heightmap = generateHeightmap({ resolution: 128 });
    const preview: PreviewToggles = { ...DEFAULT_PREVIEW_TOGGLES, wireframe: true };
    const mesh = buildTerrainMesh(heightmap, preview);
    const mat = mesh.material as THREE.Material & { wireframe?: boolean };
    expect(mat.wireframe).toBe(true);
  });

  it('uses a normal-debug material when the normals toggle is on', () => {
    const heightmap = generateHeightmap({ resolution: 128 });
    const preview: PreviewToggles = { ...DEFAULT_PREVIEW_TOGGLES, normals: true };
    const mesh = buildTerrainMesh(heightmap, preview);
    // MeshNormalMaterial is the canonical "color by surface normal" material.
    expect(mesh.material).toBeInstanceOf(THREE.MeshNormalMaterial);
  });

  it('regenerating with a different seed produces a different mesh Y attribute', () => {
    const h1 = generateHeightmap({ seed: 11, resolution: 128 });
    const h2 = generateHeightmap({ seed: 22, resolution: 128 });
    const m1 = buildTerrainMesh(h1, DEFAULT_PREVIEW_TOGGLES);
    const m2 = buildTerrainMesh(h2, DEFAULT_PREVIEW_TOGGLES);
    const p1 = m1.geometry.attributes.position as THREE.BufferAttribute;
    const p2 = m2.geometry.attributes.position as THREE.BufferAttribute;
    let differs = false;
    for (let i = 0; i < p1.count; i++) {
      if (p1.getY(i) !== p2.getY(i)) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });
});
