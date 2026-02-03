import * as THREE from 'three';
import { AssetLoader } from '../assets/AssetLoader';
import { PixelPerfectUtils } from '../../utils/PixelPerfect';

/**
 * Factory for creating terrain meshes from height data or worker geometry.
 * Handles both main-thread generation and worker-provided geometry.
 */
export class TerrainMeshFactory {
  /**
   * Create terrain mesh from height data (main thread generation)
   * @param heightData Height data array (row-major: z * (segments + 1) + x)
   * @param chunkX Chunk X coordinate
   * @param chunkZ Chunk Z coordinate
   * @param size Chunk size in world units
   * @param segments Number of segments per chunk
   * @param assetLoader Asset loader for textures
   * @param debugMode Whether to use debug wireframe material
   * @returns Created terrain mesh
   */
  static createTerrainMesh(
    heightData: Float32Array,
    chunkX: number,
    chunkZ: number,
    size: number,
    segments: number,
    assetLoader: AssetLoader,
    debugMode: boolean = false
  ): THREE.Mesh {
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
    (geometry as any).computeBoundsTree();
    
    // Create material - use lit material so terrain responds to scene lighting
    const material = this.createTerrainMaterial(assetLoader, debugMode);
    
    // Create and position mesh (centered like legacy terrain)
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      chunkX * size + size / 2,
      0,
      chunkZ * size + size / 2
    );
    // Name the terrain mesh so other systems (e.g., ZoneManager) can raycast/find it
    mesh.name = `chunk_${chunkX},${chunkZ}_terrain`;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Create terrain mesh from worker-provided geometry
   * @param geometry Pre-computed geometry from web worker
   * @param chunkX Chunk X coordinate
   * @param chunkZ Chunk Z coordinate
   * @param size Chunk size in world units
   * @param assetLoader Asset loader for textures
   * @param debugMode Whether to use debug wireframe material
   * @param bvhAlreadyComputed Whether BVH was already computed in worker
   * @returns Created terrain mesh
   */
  static createTerrainMeshFromGeometry(
    geometry: THREE.BufferGeometry,
    chunkX: number,
    chunkZ: number,
    size: number,
    assetLoader: AssetLoader,
    debugMode: boolean = false,
    bvhAlreadyComputed: boolean = false
  ): THREE.Mesh {
    // Compute BVH for accurate collision detection (skip if already computed in worker)
    if (!bvhAlreadyComputed) {
      (geometry as any).computeBoundsTree();
    }

    // Create material
    const material = this.createTerrainMaterial(assetLoader, debugMode);

    // Create and position mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      chunkX * size + size / 2,
      0,
      chunkZ * size + size / 2
    );
    mesh.name = `chunk_${chunkX},${chunkZ}_terrain`;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Create terrain material (shared by both creation paths)
   */
  private static createTerrainMaterial(
    assetLoader: AssetLoader,
    debugMode: boolean
  ): THREE.Material {
    if (debugMode) {
      return new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
        side: THREE.DoubleSide
      });
    } else {
      const texture = assetLoader.getTexture('forestfloor');
      if (texture) {
        // Use lit material for natural shading based on scene lights
        const material = PixelPerfectUtils.createPixelPerfectLitMaterial(texture);
        texture.repeat.set(8, 8);
        return material;
      } else {
        // Fallback: lit material with color
        return new THREE.MeshLambertMaterial({
          color: 0x4a7c59,
          side: THREE.DoubleSide
        });
      }
    }
  }
}
