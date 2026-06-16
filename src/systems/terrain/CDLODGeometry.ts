// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

export type TerrainEdgeSkirtBit = 1 | 2 | 4 | 8;

export interface CDLODTileGeometryStats {
  tileResolution: number;
  tileInteriorVertices: number;
  tileSkirtVertices: number;
  tileInteriorTriangles: number;
  tileSkirtTriangles: number;
  tileSkirtTrianglesPerEdge: number;
  tileTotalTriangles: number;
}

/**
 * CDLOD tile base geometry: NxN XZ grid (`isSkirt=0`) plus, in the legacy full
 * path, a perimeter skirt ring (`isSkirt=1`). The vertex shader drops skirt
 * verts by a per-LOD amount to hide sub-pixel cracks at chunk borders. Skirt
 * walls are indexed with both windings so FrontSide terrain material cannot
 * cull the seam cover from oblique helicopter/far-horizon views. Stage D2/D3
 * of `terrain-cdlod-seam`.
 */
export function createTileGeometry(
  tileResolution: number,
  options: { includeSkirts?: boolean } = {},
): THREE.BufferGeometry {
  const N = tileResolution;
  const includeSkirts = options.includeSkirts ?? true;
  const geometryStats = computeTileGeometryStats(N, includeSkirts);
  const interiorCount = N * N;
  const totalVerts = interiorCount + geometryStats.tileSkirtVertices;
  const positions = new Float32Array(totalVerts * 3);
  const isSkirtArr = new Float32Array(totalVerts);

  // Interior grid mirrors PlaneGeometry(1,1,N-1,N-1) post-rotateX(-pi/2):
  // rotateX(-pi/2) maps (x, y_orig, 0) -> (x, 0, -y_orig). PlaneGeometry's
  // y_orig at row j is 0.5 - j/(N-1), so post-rotation z = j/(N-1) - 0.5.
  // Z must increase with j to preserve PlaneGeometry's CCW triangle winding;
  // otherwise interior face normals flip to -Y and FrontSide culling hides
  // the entire terrain when viewed from above.
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const base = (j * N + i) * 3;
      positions[base] = i / (N - 1) - 0.5;
      positions[base + 2] = j / (N - 1) - 0.5;
    }
  }

  const skirtIndexOf = new Int32Array(interiorCount).fill(-1);
  if (includeSkirts) {
    let cursor = interiorCount;
    const dup = (interiorIdx: number): void => {
      if (skirtIndexOf[interiorIdx] !== -1) return;
      const ib = interiorIdx * 3;
      const sb = cursor * 3;
      positions[sb] = positions[ib];
      positions[sb + 2] = positions[ib + 2];
      isSkirtArr[cursor] = 1;
      skirtIndexOf[interiorIdx] = cursor;
      cursor++;
    };
    for (let i = 0; i < N; i++) dup(i);
    for (let j = 1; j < N; j++) dup(j * N + (N - 1));
    for (let i = N - 2; i >= 0; i--) dup((N - 1) * N + i);
    for (let j = N - 2; j >= 1; j--) dup(j * N);
  }

  const indexCount = geometryStats.tileTotalTriangles * 3;
  const indices = totalVerts > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let k = 0;
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }

  const addQuad = (ia: number, ib: number): void => {
    const sa = skirtIndexOf[ia], sb = skirtIndexOf[ib];
    indices[k++] = ia; indices[k++] = sa; indices[k++] = ib;
    indices[k++] = ib; indices[k++] = sa; indices[k++] = sb;
    indices[k++] = ia; indices[k++] = ib; indices[k++] = sa;
    indices[k++] = ib; indices[k++] = sb; indices[k++] = sa;
  };
  if (includeSkirts) {
    for (let i = 0; i < N - 1; i++) addQuad(i, i + 1);
    for (let j = 0; j < N - 1; j++) addQuad(j * N + (N - 1), (j + 1) * N + (N - 1));
    for (let i = 0; i < N - 1; i++) addQuad((N - 1) * N + (i + 1), (N - 1) * N + i);
    for (let j = 0; j < N - 1; j++) addQuad((j + 1) * N, j * N);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('isSkirt', new THREE.BufferAttribute(isSkirtArr, 1));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

/**
 * Edge-only skirt geometry for the default sparse-skirt path. It uses the same
 * terrain material and per-instance tile params as the main tile mesh, but only
 * draws a single skirt wall for edges selected by the quadtree's visual
 * `edgeSkirtMask` contract. The shader still receives only `edgeMorphMask`
 * for true LOD-transition force-morphing.
 */
export function createEdgeSkirtGeometry(
  tileResolution: number,
  edgeBit: TerrainEdgeSkirtBit,
): THREE.BufferGeometry {
  const N = Math.max(2, Math.floor(tileResolution));
  const totalVerts = N * 2;
  const positions = new Float32Array(totalVerts * 3);
  const isSkirtArr = new Float32Array(totalVerts);

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1) - 0.5;
    const topBase = i * 3;
    const skirtBase = (N + i) * 3;
    let x = t;
    let z = 0.5;

    if (edgeBit === 2) {
      x = 0.5;
      z = t;
    } else if (edgeBit === 4) {
      x = t;
      z = -0.5;
    } else if (edgeBit === 8) {
      x = -0.5;
      z = t;
    }

    positions[topBase] = x;
    positions[topBase + 2] = z;
    positions[skirtBase] = x;
    positions[skirtBase + 2] = z;
    isSkirtArr[N + i] = 1;
  }

  const edgeSegments = N - 1;
  const indices = totalVerts > 65535
    ? new Uint32Array(edgeSegments * 12)
    : new Uint16Array(edgeSegments * 12);
  let k = 0;
  for (let i = 0; i < edgeSegments; i++) {
    const a = i;
    const b = i + 1;
    const sa = N + i;
    const sb = N + i + 1;
    indices[k++] = a; indices[k++] = sa; indices[k++] = b;
    indices[k++] = b; indices[k++] = sa; indices[k++] = sb;
    indices[k++] = a; indices[k++] = b; indices[k++] = sa;
    indices[k++] = b; indices[k++] = sb; indices[k++] = sa;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('isSkirt', new THREE.BufferAttribute(isSkirtArr, 1));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

export function computeTileGeometryStats(tileResolution: number, includeSkirts = true): CDLODTileGeometryStats {
  const N = Math.max(2, Math.floor(tileResolution));
  const edgeSegments = N - 1;
  const tileInteriorTriangles = edgeSegments * edgeSegments * 2;
  const tileSkirtTrianglesPerEdge = includeSkirts ? edgeSegments * 4 : 0;
  const tileSkirtTriangles = tileSkirtTrianglesPerEdge * 4;
  return {
    tileResolution: N,
    tileInteriorVertices: N * N,
    tileSkirtVertices: includeSkirts ? 4 * N - 4 : 0,
    tileInteriorTriangles,
    tileSkirtTriangles,
    tileSkirtTrianglesPerEdge,
    tileTotalTriangles: tileInteriorTriangles + tileSkirtTriangles,
  };
}
