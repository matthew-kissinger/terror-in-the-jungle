import * as THREE from 'three';
import { isPerfDiagnosticsEnabled } from '../../core/PerfDiagnostics';
import type { CDLODTile } from './CDLODQuadtree';

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
    && isPerfDiagnosticsEnabled()
    && readBooleanQueryFlag('perfDisableTerrainShadows');
}

/**
 * Renders all terrain as a single THREE.InstancedMesh.
 * Each instance = one CDLOD tile, scaled/positioned via instance matrix.
 * Per-instance `lodLevel` and `morphFactor` attributes drive vertex shader morphing.
 *
 * One draw call for the entire terrain (vs ~100 chunk meshes before).
 */
export class CDLODRenderer {
  private mesh: THREE.InstancedMesh;
  private lodLevelAttr: THREE.InstancedBufferAttribute;
  private morphFactorAttr: THREE.InstancedBufferAttribute;
  private edgeMorphMaskAttr: THREE.InstancedBufferAttribute;
  private tileCenterXAttr: THREE.InstancedBufferAttribute;
  private tileCenterZAttr: THREE.InstancedBufferAttribute;
  private tileSizeAttr: THREE.InstancedBufferAttribute;
  private readonly maxInstances: number;

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
    this.mesh.name = 'CDLODTerrain';
    this.mesh.matrixAutoUpdate = false;
    this.mesh.matrixWorldAutoUpdate = false;

    // Per-instance attributes
    const lodData = new Float32Array(maxInstances);
    const morphData = new Float32Array(maxInstances);
    const edgeMaskData = new Float32Array(maxInstances);
    const tileCenterXData = new Float32Array(maxInstances);
    const tileCenterZData = new Float32Array(maxInstances);
    const tileSizeData = new Float32Array(maxInstances);
    this.lodLevelAttr = new THREE.InstancedBufferAttribute(lodData, 1);
    this.morphFactorAttr = new THREE.InstancedBufferAttribute(morphData, 1);
    // edgeMorphMask is logically a bitmask but is stored as float for GLSL
    // attribute compatibility (Three.js r184 InstancedBufferAttribute is
    // most reliable with Float32Array; the shader rounds to int).
    this.edgeMorphMaskAttr = new THREE.InstancedBufferAttribute(edgeMaskData, 1);
    this.tileCenterXAttr = new THREE.InstancedBufferAttribute(tileCenterXData, 1);
    this.tileCenterZAttr = new THREE.InstancedBufferAttribute(tileCenterZData, 1);
    this.tileSizeAttr = new THREE.InstancedBufferAttribute(tileSizeData, 1);
    geo.setAttribute('lodLevel', this.lodLevelAttr);
    geo.setAttribute('morphFactor', this.morphFactorAttr);
    geo.setAttribute('edgeMorphMask', this.edgeMorphMaskAttr);
    geo.setAttribute('tileCenterX', this.tileCenterXAttr);
    geo.setAttribute('tileCenterZ', this.tileCenterZAttr);
    geo.setAttribute('tileSize', this.tileSizeAttr);

    // Diagnostic-only terrain shadow isolation. Terrain still receives shadows
    // so this isolates CDLOD shadow-caster submissions without changing the
    // rest of the scene's shadow contract.
    this.mesh.castShadow = !isTerrainShadowPerfIsolationEnabled();
    this.mesh.receiveShadow = true;
  }

  /**
   * Get the InstancedMesh to add to the scene.
   */
  getMesh(): THREE.InstancedMesh {
    return this.mesh;
  }

  /**
   * Update all instances from quadtree-selected tiles.
   * Called every frame after CDLODQuadtree.selectTiles().
   */
  updateInstances(tiles: readonly CDLODTile[]): void {
    const count = Math.min(tiles.length, this.maxInstances);
    this.mesh.count = count;

    for (let i = 0; i < count; i++) {
      const tile = tiles[i];

      // Position at tile center, scale to tile size
      this._matrix.makeScale(tile.size, 1, tile.size);
      this._matrix.setPosition(tile.x, 0, tile.z);

      this.mesh.setMatrixAt(i, this._matrix);
      this.lodLevelAttr.array[i] = tile.lodLevel;
      this.morphFactorAttr.array[i] = tile.morphFactor;
      this.edgeMorphMaskAttr.array[i] = tile.edgeMorphMask;
      this.tileCenterXAttr.array[i] = tile.x;
      this.tileCenterZAttr.array[i] = tile.z;
      this.tileSizeAttr.array[i] = tile.size;
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.lodLevelAttr.needsUpdate = true;
    this.morphFactorAttr.needsUpdate = true;
    this.edgeMorphMaskAttr.needsUpdate = true;
    this.tileCenterXAttr.needsUpdate = true;
    this.tileCenterZAttr.needsUpdate = true;
    this.tileSizeAttr.needsUpdate = true;
  }

  /**
   * Replace the material (e.g. after DEM load triggers material rebuild).
   */
  setMaterial(material: THREE.Material): void {
    this.mesh.material = material;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    if (this.mesh.material instanceof THREE.Material) {
      this.mesh.material.dispose();
    }
  }
}
