// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Pure geometry builder for the orbital topographic relief mesh.
 *
 * The orbital map CPU-displaces a coarse grid plane (64-128 cells per side)
 * from a heightmap `Float32Array`. This file owns the *pure* math:
 *   - downsampling an arbitrary square height grid to the coarse topo grid,
 *   - laying out the vertex positions (world-XZ plane, displaced along +Y),
 *   - per-vertex normalized height + hypsometric vertex colours,
 *   - the triangle index buffer.
 *
 * Everything here is DOM-free and WebGL-free so it unit-tests in node. The
 * THREE.BufferGeometry assembly + `computeVertexNormals()` lives in the thin
 * `buildTopoGeometry` wrapper, which the renderer calls.
 *
 * The input `data` is treated STRICTLY READ-ONLY — when it is the live baked
 * heightmap from `TerrainSystem.getBakedHeightmap()` it is the terrain's
 * internal backing buffer with no defensive copy, so we only ever read it.
 */

import * as THREE from 'three';

/** A square height grid: row-major `data[row * size + col]`, `size`² samples. */
export interface HeightGrid {
  data: Float32Array;
  gridSize: number;
  /** World extent (metres) the grid spans on each axis. */
  worldSize: number;
}

export interface TopoMeshData {
  /** Vertex positions, 3 floats each, X/Z centred on origin, Y = displaced height. */
  positions: Float32Array;
  /** Per-vertex RGB hypsometric colour, 3 floats each, range [0,1]. */
  colors: Float32Array;
  /** Per-vertex UV (col/row normalized), 2 floats each. */
  uvs: Float32Array;
  /** Per-vertex normalized height in [0,1] (drives the TSL hypsometric tint). */
  heightNorm: Float32Array;
  /** Per-vertex world height in metres (drives the TSL contour graph). */
  worldHeight: Float32Array;
  /** Triangle indices. */
  indices: Uint32Array;
  /** Cells per side of the relief grid (vertices = (resolution + 1)²). */
  resolution: number;
  minHeight: number;
  maxHeight: number;
}

/** Four-stop hypsometric ramp stops, low → peak, each an RGB triple in [0,1]. */
export interface HypsometricRamp {
  low: [number, number, number];
  mid: [number, number, number];
  high: [number, number, number];
  peak: [number, number, number];
}

/** Default jungle ramp: river-green lowland → ridge rock → snow-free pale peak. */
export const DEFAULT_TOPO_RAMP: HypsometricRamp = {
  low: [0.18, 0.32, 0.16],
  mid: [0.4, 0.45, 0.22],
  high: [0.55, 0.47, 0.34],
  peak: [0.86, 0.83, 0.74],
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * CPU mirror of the P0 `hypsometricTintNode`: four-stop low→mid→high→peak ramp
 * over a normalized height. Used for the WebGL2 Lambert fallback's vertex
 * colours so the relief reads identically whether or not the TSL path lit up.
 */
export function hypsometricColor(heightNorm: number, ramp: HypsometricRamp = DEFAULT_TOPO_RAMP): [number, number, number] {
  const t = clamp01(heightNorm);
  const lowMid = mix3(ramp.low, ramp.mid, smoothstep(0.0, 0.4, t));
  const midHigh = mix3(lowMid, ramp.high, smoothstep(0.35, 0.75, t));
  return mix3(midHigh, ramp.peak, smoothstep(0.7, 1.0, t));
}

/**
 * Bilinearly sample a square height grid at normalized coordinates `u`,`v` in
 * [0,1] (u→col, v→row). Read-only over `grid.data`.
 */
export function sampleHeightGrid(grid: HeightGrid, u: number, v: number): number {
  const { data, gridSize } = grid;
  const fx = clamp01(u) * (gridSize - 1);
  const fy = clamp01(v) * (gridSize - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, gridSize - 1);
  const y1 = Math.min(y0 + 1, gridSize - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const h00 = data[y0 * gridSize + x0];
  const h10 = data[y0 * gridSize + x1];
  const h01 = data[y1 * gridSize + x0];
  const h11 = data[y1 * gridSize + x1];
  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return top + (bottom - top) * ty;
}

/**
 * Downsample a square height grid to a `targetSize`² grid (own buffer — never
 * aliases the source). Returns a fresh `HeightGrid`. The source is read-only.
 */
export function downsampleHeightGrid(grid: HeightGrid, targetSize: number): HeightGrid {
  const size = Math.max(2, Math.floor(targetSize));
  const out = new Float32Array(size * size);
  for (let row = 0; row < size; row++) {
    const v = row / (size - 1);
    for (let col = 0; col < size; col++) {
      const u = col / (size - 1);
      out[row * size + col] = sampleHeightGrid(grid, u, v);
    }
  }
  return { data: out, gridSize: size, worldSize: grid.worldSize };
}

/**
 * Build the CPU-displaced relief mesh data from a height grid.
 *
 * The plane is centred on the origin and spans `displaySize` world units on
 * X and Z. Heights are displaced along +Y, scaled by `verticalExaggeration`
 * relative to the horizontal scale so ridges read on the map without being
 * distorted into spikes. Min/max are computed over the resampled grid.
 */
export function buildTopoMeshData(
  grid: HeightGrid,
  options: {
    resolution?: number;
    displaySize?: number;
    verticalExaggeration?: number;
    ramp?: HypsometricRamp;
  } = {},
): TopoMeshData {
  const resolution = Math.max(2, Math.min(256, Math.floor(options.resolution ?? 96)));
  const displaySize = options.displaySize ?? 100;
  const exaggeration = options.verticalExaggeration ?? 1.6;
  const ramp = options.ramp ?? DEFAULT_TOPO_RAMP;

  const vertsPerSide = resolution + 1;
  const vertCount = vertsPerSide * vertsPerSide;

  // First pass: resample heights + find min/max.
  const heights = new Float32Array(vertCount);
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;
  for (let row = 0; row < vertsPerSide; row++) {
    const v = row / resolution;
    for (let col = 0; col < vertsPerSide; col++) {
      const u = col / resolution;
      const h = sampleHeightGrid(grid, u, v);
      heights[row * vertsPerSide + col] = h;
      if (h < minHeight) minHeight = h;
      if (h > maxHeight) maxHeight = h;
    }
  }
  const heightRange = Math.max(1e-3, maxHeight - minHeight);

  // World->display scale: heights are in metres over `worldSize`; the relief
  // height should occupy a fraction of `displaySize` so it never towers over
  // the footprint. exaggeration multiplies that fraction for legibility.
  const verticalScale = (displaySize / grid.worldSize) * exaggeration;

  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const heightNorm = new Float32Array(vertCount);
  const worldHeight = new Float32Array(vertCount);

  for (let row = 0; row < vertsPerSide; row++) {
    for (let col = 0; col < vertsPerSide; col++) {
      const i = row * vertsPerSide + col;
      const h = heights[i];
      const norm = clamp01((h - minHeight) / heightRange);

      // Centre the plane on the origin. Row 0 = far (-Z), col 0 = left (-X).
      const x = (col / resolution - 0.5) * displaySize;
      const z = (row / resolution - 0.5) * displaySize;
      const y = (h - minHeight) * verticalScale;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const c = hypsometricColor(norm, ramp);
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];

      uvs[i * 2] = col / resolution;
      uvs[i * 2 + 1] = row / resolution;
      heightNorm[i] = norm;
      worldHeight[i] = h;
    }
  }

  const indices = new Uint32Array(resolution * resolution * 6);
  let o = 0;
  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const a = row * vertsPerSide + col;
      const b = a + 1;
      const c = a + vertsPerSide;
      const d = c + 1;
      indices[o++] = a;
      indices[o++] = c;
      indices[o++] = b;
      indices[o++] = b;
      indices[o++] = c;
      indices[o++] = d;
    }
  }

  return { positions, colors, uvs, heightNorm, worldHeight, indices, resolution, minHeight, maxHeight };
}

/**
 * Assemble a THREE.BufferGeometry from pure mesh data and compute smooth
 * vertex normals for the relief lighting. Thin wrapper — the testable math is
 * `buildTopoMeshData`.
 */
export function buildTopoGeometry(meshData: TopoMeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(meshData.colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(meshData.uvs, 2));
  geometry.setAttribute('topoHeightNorm', new THREE.BufferAttribute(meshData.heightNorm, 1));
  geometry.setAttribute('topoWorldHeight', new THREE.BufferAttribute(meshData.worldHeight, 1));
  geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
