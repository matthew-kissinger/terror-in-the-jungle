import * as THREE from 'three';

import { ChunkMaterials } from './ChunkMaterials';
import { AssetLoader } from '../assets/AssetLoader';

/**
 * Builds terrain geometry and meshes for chunks
 */
export class ChunkGeometryBuilder {
  /**
   * Create terrain geometry from height data
   * @param heightData - Height data array
   * @param size - Chunk size in world units
   * @param segments - Grid resolution
   * @returns BufferGeometry with height data applied
   */
  static createGeometryFromHeightData(
    heightData: Float32Array,
    size: number,
    segments: number
  ): THREE.BufferGeometry {
    // Create PlaneGeometry following Three.js example pattern
    const geometry = new THREE.PlaneGeometry(
      size,
      size,
      segments,
      segments
    );

    // Rotate to horizontal FIRST (before modifying vertices)
    geometry.rotateX(-Math.PI / 2);

    // Apply height data to vertices - following Three.js example
    const vertices = geometry.attributes.position.array as Float32Array;

    // THREE.PlaneGeometry creates vertices in a specific order
    // After rotation, Y is up, X and Z are horizontal
    for (let i = 0, j = 0; i < heightData.length; i++, j += 3) {
      // Set Y coordinate (height)
      vertices[j + 1] = heightData[i];
    }

    // Update geometry
    geometry.computeVertexNormals();
    geometry.attributes.position.needsUpdate = true;

    // Compute BVH for accurate collision detection
    geometry.computeBoundsTree();

    return geometry;
  }

  /**
   * Create terrain mesh from geometry
   * @param geometry - BufferGeometry (may have BVH already computed)
   * @param chunkX - Chunk X coordinate
   * @param chunkZ - Chunk Z coordinate
   * @param size - Chunk size in world units
   * @param scene - Scene to add mesh to
   * @param assetLoader - Asset loader for materials
   * @param debugMode - Debug mode flag
   * @param bvhAlreadyComputed - If true, skip BVH computation
   * @returns Created mesh and geometry reference
   */
  static createMeshFromGeometry(
    geometry: THREE.BufferGeometry,
    chunkX: number,
    chunkZ: number,
    size: number,
    scene: THREE.Scene,
    assetLoader: AssetLoader,
    debugMode: boolean,
    bvhAlreadyComputed: boolean = false
  ): { mesh: THREE.Mesh; geometry: THREE.BufferGeometry } {
    // Compute BVH for accurate collision detection (skip if already computed in worker)
    if (!bvhAlreadyComputed) {
      geometry.computeBoundsTree();
    }

    // Create material
    const material = ChunkMaterials.createTerrainMaterial(assetLoader, debugMode);

    // Create and position mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      chunkX * size + size / 2,
      0,
      chunkZ * size + size / 2
    );
    mesh.name = `chunk_${chunkX},${chunkZ}_terrain`;
    mesh.receiveShadow = true;

    scene.add(mesh);

    return { mesh, geometry };
  }
}
