// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { isPerfHarnessEnabled } from '../../core/PerfDiagnostics';
import type { CDLODTile } from './CDLODQuadtree';
import {
  computeTileGeometryStats,
  createEdgeSkirtGeometry,
  createTileGeometry,
  type CDLODTileGeometryStats,
  type TerrainEdgeSkirtBit,
} from './CDLODGeometry';
import { TERRAIN_SHADOW_BOUND_FALLBACK_RADIUS_METERS } from './TerrainShadowBounds';

type TerrainSkirtMode = 'full' | 'sparse-edge' | 'none';

interface TerrainEdgeSkirtSpec {
  bit: TerrainEdgeSkirtBit;
  name: string;
}

interface TerrainEdgeSkirtInstanceState {
  bit: TerrainEdgeSkirtBit;
  mesh: THREE.InstancedMesh;
  tileParams0Attr: THREE.InstancedBufferAttribute;
  tileParams1Attr: THREE.InstancedBufferAttribute;
  shadowPrefixInstances: number;
  lastMainPassInstances: number;
  lastShadowPassInstances: number;
  restoreShadowCount: number | null;
}

const TERRAIN_EDGE_SKIRT_SPECS: readonly TerrainEdgeSkirtSpec[] = [
  { bit: 1, name: 'North' },
  { bit: 2, name: 'East' },
  { bit: 4, name: 'South' },
  { bit: 8, name: 'West' },
];

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

export function isTerrainSkirtPerfIsolationEnabled(): boolean {
  return (import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1')
    && isPerfHarnessEnabled()
    && readBooleanQueryFlag('perfDisableTerrainSkirts');
}

function getTerrainSkirtMode(): TerrainSkirtMode {
  if (isTerrainSkirtPerfIsolationEnabled()) return 'none';
  if (readBooleanQueryFlag('terrainFullTerrainSkirts')) return 'full';
  return 'sparse-edge';
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
  lastMainPassEdgeSkirtInstances: number;
  lastShadowPassEdgeSkirtInstances: number;
  shadowPassReductions: number;
  edgeShadowPassReductions: number;
  sparseEdgeSkirtsEnabled: boolean;
  tileInteriorTriangles: number;
  tileSkirtTriangles: number;
  tileSkirtTrianglesPerEdge: number;
  tileTotalTriangles: number;
  tileFullSkirtTriangles: number;
  lastMainPassTriangleEstimate: number;
  lastShadowPassTriangleEstimate: number;
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
  private readonly edgeSkirts: TerrainEdgeSkirtInstanceState[] = [];
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
  private edgeShadowPassReductions = 0;
  private restoreShadowCount: number | null = null;
  private readonly geometryStats: CDLODTileGeometryStats;
  private readonly fullSkirtGeometryStats: CDLODTileGeometryStats;
  private readonly sparseEdgeSkirtsEnabled: boolean;

  // Scratch matrix for setting instance transforms
  private readonly _matrix = new THREE.Matrix4();

  constructor(
    material: THREE.Material,
    tileResolution: number,
    maxInstances = 2048,
  ) {
    this.maxInstances = maxInstances;

    // Shared base geometry: a flat XZ plane with 1x1 dimensions. The default
    // path moves seam skirts into separate edge-only instanced meshes so tiles
    // pay skirt triangles only where `edgeMorphMask` marks a LOD transition.
    const skirtMode = getTerrainSkirtMode();
    const includeSkirts = skirtMode === 'full';
    this.sparseEdgeSkirtsEnabled = skirtMode === 'sparse-edge';
    const geo = createTileGeometry(tileResolution, { includeSkirts });
    this.geometryStats = computeTileGeometryStats(tileResolution, includeSkirts);
    this.fullSkirtGeometryStats = computeTileGeometryStats(tileResolution, true);

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

    if (this.sparseEdgeSkirtsEnabled) {
      for (const spec of TERRAIN_EDGE_SKIRT_SPECS) {
        this.edgeSkirts.push(this.createEdgeSkirtState(spec, material, tileResolution, maxInstances));
      }
    }

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

    for (const edgeSkirt of this.edgeSkirts) {
      this.mesh.add(edgeSkirt.mesh);
    }
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
    this.resetEdgeSkirtInstances();

    let writeIndex = 0;
    if (this.boundedShadowPassEnabled) {
      for (let i = 0; i < count; i++) {
        const tile = tiles[i];
        if (this.tileIntersectsShadowRadius(tile)) {
          this.writeTileInstance(writeIndex++, tile);
          this.writeEdgeSkirtInstances(tile);
        }
      }
      this.shadowPrefixInstances = writeIndex;
      this.rememberEdgeSkirtShadowPrefixes();
      for (let i = 0; i < count; i++) {
        const tile = tiles[i];
        if (!this.tileIntersectsShadowRadius(tile)) {
          this.writeTileInstance(writeIndex++, tile);
          this.writeEdgeSkirtInstances(tile);
        }
      }
    } else {
      this.shadowPrefixInstances = count;
      for (let i = 0; i < count; i++) {
        this.writeTileInstance(i, tiles[i]);
        this.writeEdgeSkirtInstances(tiles[i]);
      }
      this.rememberEdgeSkirtShadowPrefixes();
    }

    this.markActivePrefixNeedsUpdate(count);
    this.markEdgeSkirtActivePrefixesNeedsUpdate();
  }

  resubmitCurrentInstances(): void {
    this.clearAttributeUpdateRanges(this.mesh.instanceMatrix);
    this.clearAttributeUpdateRanges(this.tileParams0Attr);
    this.clearAttributeUpdateRanges(this.tileParams1Attr);
    for (const edgeSkirt of this.edgeSkirts) {
      this.clearAttributeUpdateRanges(edgeSkirt.mesh.instanceMatrix);
      this.clearAttributeUpdateRanges(edgeSkirt.tileParams0Attr);
      this.clearAttributeUpdateRanges(edgeSkirt.tileParams1Attr);
    }
    this.markActivePrefixNeedsUpdate(this.mesh.count);
    this.markEdgeSkirtActivePrefixesNeedsUpdate();
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

  private writeEdgeSkirtInstances(tile: CDLODTile): void {
    if (!this.sparseEdgeSkirtsEnabled) return;
    const edgeMorphMask = Number(tile.edgeMorphMask ?? 0);
    if (edgeMorphMask === 0) return;

    for (const edgeSkirt of this.edgeSkirts) {
      if ((edgeMorphMask & edgeSkirt.bit) === 0) continue;
      const index = edgeSkirt.mesh.count;
      if (index >= this.maxInstances) continue;
      edgeSkirt.mesh.count = index + 1;
      edgeSkirt.mesh.visible = true;
      edgeSkirt.lastMainPassInstances = edgeSkirt.mesh.count;
      this.writeTileInstanceToMesh(
        edgeSkirt.mesh,
        edgeSkirt.tileParams0Attr,
        edgeSkirt.tileParams1Attr,
        index,
        tile,
      );
    }
  }

  private writeTileInstanceToMesh(
    mesh: THREE.InstancedMesh,
    tileParams0Attr: THREE.InstancedBufferAttribute,
    tileParams1Attr: THREE.InstancedBufferAttribute,
    index: number,
    tile: CDLODTile,
  ): void {
    const base = index * 4;
    const tileX = Math.fround(tile.x);
    const tileZ = Math.fround(tile.z);
    const tileSize = Math.fround(tile.size);
    const lodLevel = Math.fround(tile.lodLevel);
    const morphFactor = Math.fround(tile.morphFactor);
    const edgeMorphMask = Math.fround(Number(tile.edgeMorphMask ?? 0));

    this._matrix.makeScale(tileSize, 1, tileSize);
    this._matrix.setPosition(tileX, 0, tileZ);
    mesh.setMatrixAt(index, this._matrix);

    this.writeTileParams(
      tileParams0Attr,
      tileParams1Attr,
      base,
      tileX,
      tileZ,
      tileSize,
      lodLevel,
      morphFactor,
      edgeMorphMask,
    );
  }

  private createEdgeSkirtState(
    spec: TerrainEdgeSkirtSpec,
    material: THREE.Material,
    tileResolution: number,
    maxInstances: number,
  ): TerrainEdgeSkirtInstanceState {
    const geometry = createEdgeSkirtGeometry(tileResolution, spec.bit);
    const mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    mesh.name = `CDLODTerrainEdgeSkirt${spec.name}`;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.castShadow = !isTerrainShadowPerfIsolationEnabled();
    mesh.receiveShadow = true;

    const tileParams0Attr = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4);
    const tileParams1Attr = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    tileParams0Attr.setUsage(THREE.DynamicDrawUsage);
    tileParams1Attr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('tileParams0', tileParams0Attr);
    geometry.setAttribute('tileParams1', tileParams1Attr);

    const state: TerrainEdgeSkirtInstanceState = {
      bit: spec.bit,
      mesh,
      tileParams0Attr,
      tileParams1Attr,
      shadowPrefixInstances: 0,
      lastMainPassInstances: 0,
      lastShadowPassInstances: 0,
      restoreShadowCount: null,
    };

    mesh.onBeforeShadow = () => {
      state.restoreShadowCount = mesh.count;
      if (this.boundedShadowPassEnabled && state.shadowPrefixInstances < mesh.count) {
        mesh.count = state.shadowPrefixInstances;
        this.edgeShadowPassReductions += 1;
      }
      state.lastShadowPassInstances = mesh.count;
    };
    mesh.onAfterShadow = () => {
      if (state.restoreShadowCount !== null) {
        mesh.count = state.restoreShadowCount;
        state.restoreShadowCount = null;
      }
    };

    return state;
  }

  private resetEdgeSkirtInstances(): void {
    for (const edgeSkirt of this.edgeSkirts) {
      edgeSkirt.mesh.count = 0;
      edgeSkirt.mesh.visible = false;
      edgeSkirt.shadowPrefixInstances = 0;
      edgeSkirt.lastMainPassInstances = 0;
      edgeSkirt.lastShadowPassInstances = 0;
      edgeSkirt.restoreShadowCount = null;
      this.clearAttributeUpdateRanges(edgeSkirt.mesh.instanceMatrix);
      this.clearAttributeUpdateRanges(edgeSkirt.tileParams0Attr);
      this.clearAttributeUpdateRanges(edgeSkirt.tileParams1Attr);
    }
  }

  private rememberEdgeSkirtShadowPrefixes(): void {
    for (const edgeSkirt of this.edgeSkirts) {
      edgeSkirt.shadowPrefixInstances = edgeSkirt.mesh.count;
    }
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

  private markEdgeSkirtActivePrefixesNeedsUpdate(): void {
    for (const edgeSkirt of this.edgeSkirts) {
      const count = edgeSkirt.mesh.count;
      if (count <= 0) continue;
      this.markAttributePrefixNeedsUpdate(edgeSkirt.mesh.instanceMatrix, count * 16);
      this.markAttributePrefixNeedsUpdate(edgeSkirt.tileParams0Attr, count * 4);
      this.markAttributePrefixNeedsUpdate(edgeSkirt.tileParams1Attr, count * 4);
    }
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
    for (const edgeSkirt of this.edgeSkirts) {
      edgeSkirt.mesh.material = material;
    }
  }

  getShadowPassStatsForDebug(): CDLODRendererShadowPassStats {
    const lastMainPassEdgeSkirtInstances = this.sumEdgeSkirtMainInstances();
    const lastShadowPassEdgeSkirtInstances = this.sumEdgeSkirtShadowInstances();
    const activeSkirtTrianglesPerEdge =
      (this.sparseEdgeSkirtsEnabled || this.geometryStats.tileSkirtTriangles > 0)
        ? this.fullSkirtGeometryStats.tileSkirtTrianglesPerEdge
        : 0;
    const mainPassTriangleEstimate =
      this.lastMainPassInstances * this.geometryStats.tileTotalTriangles
      + lastMainPassEdgeSkirtInstances * activeSkirtTrianglesPerEdge;
    const shadowPassTriangleEstimate =
      this.lastShadowPassInstances * this.geometryStats.tileTotalTriangles
      + lastShadowPassEdgeSkirtInstances * activeSkirtTrianglesPerEdge;
    return {
      boundedShadowPassEnabled: this.boundedShadowPassEnabled,
      shadowCenterX: this.shadowCenterX,
      shadowCenterZ: this.shadowCenterZ,
      shadowRadiusMeters: this.shadowRadiusMeters,
      shadowPrefixInstances: this.shadowPrefixInstances,
      lastMainPassInstances: this.lastMainPassInstances,
      lastShadowPassInstances: this.lastShadowPassInstances,
      lastMainPassEdgeSkirtInstances,
      lastShadowPassEdgeSkirtInstances,
      shadowPassReductions: this.shadowPassReductions,
      edgeShadowPassReductions: this.edgeShadowPassReductions,
      sparseEdgeSkirtsEnabled: this.sparseEdgeSkirtsEnabled,
      tileInteriorTriangles: this.geometryStats.tileInteriorTriangles,
      tileSkirtTriangles: this.geometryStats.tileSkirtTriangles,
      tileSkirtTrianglesPerEdge: activeSkirtTrianglesPerEdge,
      tileTotalTriangles: this.geometryStats.tileTotalTriangles,
      tileFullSkirtTriangles: this.fullSkirtGeometryStats.tileSkirtTriangles,
      lastMainPassTriangleEstimate: mainPassTriangleEstimate,
      lastShadowPassTriangleEstimate: shadowPassTriangleEstimate,
    };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    for (const edgeSkirt of this.edgeSkirts) {
      edgeSkirt.mesh.geometry.dispose();
    }
    if (this.mesh.material instanceof THREE.Material) {
      this.mesh.material.dispose();
    }
  }

  private sumEdgeSkirtMainInstances(): number {
    let total = 0;
    for (const edgeSkirt of this.edgeSkirts) total += edgeSkirt.lastMainPassInstances;
    return total;
  }

  private sumEdgeSkirtShadowInstances(): number {
    let total = 0;
    for (const edgeSkirt of this.edgeSkirts) total += edgeSkirt.lastShadowPassInstances;
    return total;
  }
}
