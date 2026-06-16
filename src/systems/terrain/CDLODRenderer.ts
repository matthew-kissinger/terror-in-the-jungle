// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { isPerfHarnessEnabled } from '../../core/PerfDiagnostics';
import type { CDLODTile } from './CDLODQuadtree';
import { TERRAIN_SHADOW_BOUND_FALLBACK_RADIUS_METERS } from './TerrainShadowBounds';

/**
 * CDLOD tile base geometry: NxN XZ grid (`isSkirt=0`) plus a perimeter
 * skirt ring (`isSkirt=1`). The vertex shader drops skirt verts by a
 * per-LOD amount to hide sub-pixel cracks at chunk borders. Skirt walls
 * are indexed with both windings so FrontSide terrain material cannot
 * cull the seam cover from oblique helicopter/far-horizon views. Stage
 * D2/D3 of `terrain-cdlod-seam`. Total verts = N*N + 4*N - 4.
 */
export function createTileGeometry(tileResolution: number): THREE.BufferGeometry {
  const N = tileResolution;
  const interiorCount = N * N;
  const totalVerts = interiorCount + 4 * N - 4;
  const positions = new Float32Array(totalVerts * 3);
  const isSkirtArr = new Float32Array(totalVerts);

  // Interior grid mirrors PlaneGeometry(1,1,N-1,N-1) post-rotateX(-π/2):
  // rotateX(-π/2) maps (x, y_orig, 0) -> (x, 0, -y_orig). PlaneGeometry's
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

  // Skirt ring duplicates each perimeter vertex (corners shared between
  // sides), tagged isSkirt=1. Walk the perimeter once.
  const skirtIndexOf = new Int32Array(interiorCount).fill(-1);
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
  for (let i = 0; i < N; i++) dup(i);                            // top
  for (let j = 1; j < N; j++) dup(j * N + (N - 1));              // right
  for (let i = N - 2; i >= 0; i--) dup((N - 1) * N + i);          // bottom
  for (let j = N - 2; j >= 1; j--) dup(j * N + 0);                // left

  // Indices: interior triangles (PlaneGeometry winding) + two-sided
  // skirt strips. Only skirt walls duplicate winding; the terrain top
  // remains FrontSide so we do not pay a full-material DoubleSide cost.
  const indexCount = ((N - 1) * (N - 1) * 2 + (N - 1) * 4 * 4) * 3;
  const indices = totalVerts > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let k = 0;
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }
  // Skirt strips: connect each perimeter edge's two interior endpoints
  // with their skirt duplicates so the skirt drops vertically. Emit both
  // windings because the seam may be viewed from either adjacent tile at
  // helicopter/far-camera angles while the material remains FrontSide.
  const addQuad = (ia: number, ib: number): void => {
    const sa = skirtIndexOf[ia], sb = skirtIndexOf[ib];
    indices[k++] = ia; indices[k++] = sa; indices[k++] = ib;
    indices[k++] = ib; indices[k++] = sa; indices[k++] = sb;
    indices[k++] = ia; indices[k++] = ib; indices[k++] = sa;
    indices[k++] = ib; indices[k++] = sb; indices[k++] = sa;
  };
  for (let i = 0; i < N - 1; i++) addQuad(i, i + 1);
  for (let j = 0; j < N - 1; j++) addQuad(j * N + (N - 1), (j + 1) * N + (N - 1));
  for (let i = 0; i < N - 1; i++) addQuad((N - 1) * N + (i + 1), (N - 1) * N + i);
  for (let j = 0; j < N - 1; j++) addQuad((j + 1) * N + 0, j * N + 0);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('isSkirt', new THREE.BufferAttribute(isSkirtArr, 1));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

function readBooleanQueryFlag(name: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const value = new URLSearchParams(window.location.search).get(name);
    if (value === null) return false;
    const normalized = value.toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  } catch {
    return false;
  }
}

export function isTerrainShadowPerfIsolationEnabled(): boolean {
  return (import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1')
    && isPerfHarnessEnabled()
    && readBooleanQueryFlag('perfDisableTerrainShadows');
}

export function isTerrainBoundedShadowPassEnabled(): boolean {
  return !readBooleanQueryFlag('terrainFullShadowPass');
}

export interface CDLODRendererShadowPassStats {
  boundedShadowPassEnabled: boolean;
  shadowCenterX: number;
  shadowCenterZ: number;
  shadowRadiusMeters: number;
  shadowPrefixInstances: number;
  lastMainPassInstances: number;
  lastShadowPassInstances: number;
  shadowPassReductions: number;
}

/**
 * Renders all terrain as a single THREE.InstancedMesh.
 * Each instance = one CDLOD tile, scaled/positioned via instance matrix.
 * Per-instance tile params drive vertex shader morphing. The attributes are
 * packed into two vec4 buffers so WebGPU devices with 8 vertex-buffer slots
 * can render terrain plus Three.js' instancing buffer without exceeding limits.
 *
 * One draw call for the entire terrain (vs ~100 chunk meshes before).
 */
export class CDLODRenderer {
  private mesh: THREE.InstancedMesh;
  private tileParams0Attr: THREE.InstancedBufferAttribute;
  private tileParams1Attr: THREE.InstancedBufferAttribute;
  private readonly maxInstances: number;
  private boundedShadowPassEnabled = isTerrainBoundedShadowPassEnabled();
  private shadowCenterX = 0;
  private shadowCenterZ = 0;
  private shadowRadiusMeters = TERRAIN_SHADOW_BOUND_FALLBACK_RADIUS_METERS;
  private shadowRadiusSq = this.shadowRadiusMeters * this.shadowRadiusMeters;
  private shadowPrefixInstances = 0;
  private lastMainPassInstances = 0;
  private lastShadowPassInstances = 0;
  private shadowPassReductions = 0;
  private restoreShadowCount: number | null = null;

  // Scratch matrix for setting instance transforms
  private readonly _matrix = new THREE.Matrix4();

  constructor(
    material: THREE.Material,
    tileResolution: number,
    maxInstances = 2048,
  ) {
    this.maxInstances = maxInstances;

    // Shared base geometry: a flat XZ plane with 1x1 dimensions plus a
    // perimeter skirt ring tagged with `isSkirt = 1`. Each instance scales
    // this to the tile's world size. The vertex shader drops skirt verts
    // by a per-LOD amount to hide sub-pixel cracks at chunk borders. See
    // `createTileGeometry` and `terrain-cdlod-seam` Stage D2.
    const geo = createTileGeometry(tileResolution);

    this.mesh = new THREE.InstancedMesh(geo, material, maxInstances);
    this.mesh.frustumCulled = false; // Quadtree already culls
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.name = 'CDLODTerrain';
    this.mesh.matrixAutoUpdate = false;
    this.mesh.matrixWorldAutoUpdate = false;

    // Per-instance attributes:
    // tileParams0 = centerX, centerZ, size, lodLevel
    // tileParams1 = morphFactor, edgeMorphMask, reserved, reserved
    // edgeMorphMask is logically a bitmask but is stored as float for WebGPU/
    // WebGL attribute compatibility; the shader rounds via bit extraction.
    this.tileParams0Attr = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4);
    this.tileParams1Attr = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tileParams0Attr.setUsage(THREE.DynamicDrawUsage);
    this.tileParams1Attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('tileParams0', this.tileParams0Attr);
    geo.setAttribute('tileParams1', this.tileParams1Attr);

    // Terrain still receives shadows, but only terrain within the useful
    // camera-following shadow-map footprint is submitted as a caster.
    this.mesh.castShadow = !isTerrainShadowPerfIsolationEnabled();
    this.mesh.receiveShadow = true;
    this.mesh.onBeforeShadow = () => {
      this.restoreShadowCount = this.mesh.count;
      if (this.boundedShadowPassEnabled && this.shadowPrefixInstances < this.mesh.count) {
        this.mesh.count = this.shadowPrefixInstances;
        this.shadowPassReductions += 1;
      }
      this.lastShadowPassInstances = this.mesh.count;
    };
    this.mesh.onAfterShadow = () => {
      if (this.restoreShadowCount !== null) {
        this.mesh.count = this.restoreShadowCount;
        this.restoreShadowCount = null;
      }
    };
  }

  /**
   * Get the InstancedMesh to add to the scene.
   */
  getMesh(): THREE.InstancedMesh {
    return this.mesh;
  }

  configureBoundedShadowPass(
    centerX: number,
    centerZ: number,
    radiusMeters = TERRAIN_SHADOW_BOUND_FALLBACK_RADIUS_METERS,
  ): void {
    this.boundedShadowPassEnabled = isTerrainBoundedShadowPassEnabled();
    this.shadowCenterX = centerX;
    this.shadowCenterZ = centerZ;
    this.shadowRadiusMeters = Math.max(1, radiusMeters);
    this.shadowRadiusSq = this.shadowRadiusMeters * this.shadowRadiusMeters;
  }

  /**
   * Update all instances from quadtree-selected tiles.
   * Called every frame after CDLODQuadtree.selectTiles().
   */
  updateInstances(tiles: readonly CDLODTile[]): void {
    const count = Math.min(tiles.length, this.maxInstances);
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    this.lastMainPassInstances = count;
    this.clearAttributeUpdateRanges(this.mesh.instanceMatrix);
    this.clearAttributeUpdateRanges(this.tileParams0Attr);
    this.clearAttributeUpdateRanges(this.tileParams1Attr);

    let writeIndex = 0;
    if (this.boundedShadowPassEnabled) {
      for (let i = 0; i < count; i++) {
        const tile = tiles[i];
        if (this.tileIntersectsShadowRadius(tile)) {
          this.writeTileInstance(writeIndex++, tile);
        }
      }
      this.shadowPrefixInstances = writeIndex;
      for (let i = 0; i < count; i++) {
        const tile = tiles[i];
        if (!this.tileIntersectsShadowRadius(tile)) {
          this.writeTileInstance(writeIndex++, tile);
        }
      }
    } else {
      this.shadowPrefixInstances = count;
      for (let i = 0; i < count; i++) {
        this.writeTileInstance(i, tiles[i]);
      }
    }

    this.markActivePrefixNeedsUpdate(count);
  }

  resubmitCurrentInstances(): void {
    this.clearAttributeUpdateRanges(this.mesh.instanceMatrix);
    this.clearAttributeUpdateRanges(this.tileParams0Attr);
    this.clearAttributeUpdateRanges(this.tileParams1Attr);
    this.markActivePrefixNeedsUpdate(this.mesh.count);
  }

  private writeTileInstance(index: number, tile: CDLODTile): void {
    const base = index * 4;
    const tileX = Math.fround(tile.x);
    const tileZ = Math.fround(tile.z);
    const tileSize = Math.fround(tile.size);
    const lodLevel = Math.fround(tile.lodLevel);

    // Keep matrix and tileParams0 coherent. The vertex node combines both:
    // matrix supplies rendered XZ placement while tileParams0 supplies the
    // world-space heightmap sample. Sparse uploads can leave one buffer newer
    // than the other on renderer backends, which manifests as terrain bands
    // or inverted/see-through CDLOD tiles.
    this._matrix.makeScale(tileSize, 1, tileSize);
    this._matrix.setPosition(tileX, 0, tileZ);
    this.mesh.setMatrixAt(index, this._matrix);

    const morphFactor = Math.fround(tile.morphFactor);
    const edgeMorphMask = Math.fround(Number(tile.edgeMorphMask ?? 0));
    this.writeTileParams(
      this.tileParams0Attr,
      this.tileParams1Attr,
      base,
      tileX,
      tileZ,
      tileSize,
      lodLevel,
      morphFactor,
      edgeMorphMask,
    );
  }

  private tileIntersectsShadowRadius(tile: CDLODTile): boolean {
    const halfSize = tile.size / 2;
    const dx = Math.max(Math.abs(this.shadowCenterX - tile.x) - halfSize, 0);
    const dz = Math.max(Math.abs(this.shadowCenterZ - tile.z) - halfSize, 0);
    return (dx * dx + dz * dz) <= this.shadowRadiusSq;
  }

  private writeTileParams(
    tileParams0Attr: THREE.InstancedBufferAttribute,
    tileParams1Attr: THREE.InstancedBufferAttribute,
    base: number,
    tileX: number,
    tileZ: number,
    tileSize: number,
    lodLevel: number,
    morphFactor: number,
    edgeMorphMask: number,
  ): void {
    tileParams0Attr.array[base] = tileX;
    tileParams0Attr.array[base + 1] = tileZ;
    tileParams0Attr.array[base + 2] = tileSize;
    tileParams0Attr.array[base + 3] = lodLevel;
    tileParams1Attr.array[base] = morphFactor;
    tileParams1Attr.array[base + 1] = edgeMorphMask;
    tileParams1Attr.array[base + 2] = 0;
    tileParams1Attr.array[base + 3] = 0;
  }

  private clearAttributeUpdateRanges(
    attribute: THREE.BufferAttribute | THREE.InstancedBufferAttribute,
  ): void {
    if (typeof attribute.clearUpdateRanges === 'function') {
      attribute.clearUpdateRanges();
    }
  }

  private markActivePrefixNeedsUpdate(count: number): void {
    if (count <= 0) return;
    this.markAttributePrefixNeedsUpdate(this.mesh.instanceMatrix, count * 16);
    this.markAttributePrefixNeedsUpdate(this.tileParams0Attr, count * 4);
    this.markAttributePrefixNeedsUpdate(this.tileParams1Attr, count * 4);
  }

  private markAttributePrefixNeedsUpdate(
    attribute: THREE.BufferAttribute | THREE.InstancedBufferAttribute,
    componentCount: number,
  ): void {
    if (typeof attribute.addUpdateRange === 'function') {
      attribute.addUpdateRange(0, componentCount);
    }
    attribute.needsUpdate = true;
  }

  /**
   * Replace the material (e.g. after DEM load triggers material rebuild).
   */
  setMaterial(material: THREE.Material): void {
    this.mesh.material = material;
  }

  getShadowPassStatsForDebug(): CDLODRendererShadowPassStats {
    return {
      boundedShadowPassEnabled: this.boundedShadowPassEnabled,
      shadowCenterX: this.shadowCenterX,
      shadowCenterZ: this.shadowCenterZ,
      shadowRadiusMeters: this.shadowRadiusMeters,
      shadowPrefixInstances: this.shadowPrefixInstances,
      lastMainPassInstances: this.lastMainPassInstances,
      lastShadowPassInstances: this.lastShadowPassInstances,
      shadowPassReductions: this.shadowPassReductions,
    };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    if (this.mesh.material instanceof THREE.Material) {
      this.mesh.material.dispose();
    }
  }
}
