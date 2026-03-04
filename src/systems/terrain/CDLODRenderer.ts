import * as THREE from 'three';
import type { CDLODTile } from './CDLODQuadtree';

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
  private readonly maxInstances: number;

  // Scratch matrix for setting instance transforms
  private readonly _matrix = new THREE.Matrix4();

  constructor(
    material: THREE.Material,
    tileResolution: number,
    maxInstances = 2048,
  ) {
    this.maxInstances = maxInstances;

    // Shared base geometry: a flat XZ plane with 1x1 dimensions
    // Each instance scales this to the tile's world size.
    const geo = new THREE.PlaneGeometry(1, 1, tileResolution - 1, tileResolution - 1);
    // Rotate from XY to XZ plane
    geo.rotateX(-Math.PI / 2);

    this.mesh = new THREE.InstancedMesh(geo, material, maxInstances);
    this.mesh.frustumCulled = false; // Quadtree already culls
    this.mesh.count = 0;
    this.mesh.name = 'CDLODTerrain';

    // Per-instance attributes
    const lodData = new Float32Array(maxInstances);
    const morphData = new Float32Array(maxInstances);
    this.lodLevelAttr = new THREE.InstancedBufferAttribute(lodData, 1);
    this.morphFactorAttr = new THREE.InstancedBufferAttribute(morphData, 1);
    geo.setAttribute('lodLevel', this.lodLevelAttr);
    geo.setAttribute('morphFactor', this.morphFactorAttr);

    // Enable shadow casting/receiving
    this.mesh.castShadow = true;
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
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.lodLevelAttr.needsUpdate = true;
    this.morphFactorAttr.needsUpdate = true;
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
