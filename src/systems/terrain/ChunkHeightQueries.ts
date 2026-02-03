import * as THREE from 'three';

/**
 * Height query utilities for terrain chunks
 */
export class ChunkHeightQueries {
  /**
   * Get height at local chunk coordinates using direct height data lookup
   * @param heightData - Height data array
   * @param localX - Local X coordinate (0 to size)
   * @param localZ - Local Z coordinate (0 to size)
   * @param size - Chunk size in world units
   * @param segments - Grid resolution
   * @returns Height value
   */
  static getHeightAtLocal(
    heightData: Float32Array,
    localX: number,
    localZ: number,
    size: number,
    segments: number
  ): number {
    // Clamp to chunk bounds
    localX = Math.max(0, Math.min(size, localX));
    localZ = Math.max(0, Math.min(size, localZ));

    // Convert to grid coordinates
    const gridX = (localX / size) * segments;
    const gridZ = (localZ / size) * segments;

    // Get integer grid positions
    const x0 = Math.floor(gridX);
    const x1 = Math.min(x0 + 1, segments);
    const z0 = Math.floor(gridZ);
    const z1 = Math.min(z0 + 1, segments);

    // Get fractional parts for interpolation
    const fx = gridX - x0;
    const fz = gridZ - z0;

    // Get heights at corners - using correct indexing
    const getIndex = (x: number, z: number) => z * (segments + 1) + x;

    const h00 = heightData[getIndex(x0, z0)];
    const h10 = heightData[getIndex(x1, z0)];
    const h01 = heightData[getIndex(x0, z1)];
    const h11 = heightData[getIndex(x1, z1)];

    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;

    return h0 * (1 - fz) + h1 * fz;
  }

  /**
   * Get height at world coordinates using height data
   * @param heightData - Height data array
   * @param worldX - World X coordinate
   * @param worldZ - World Z coordinate
   * @param chunkX - Chunk X coordinate
   * @param chunkZ - Chunk Z coordinate
   * @param size - Chunk size in world units
   * @param segments - Grid resolution
   * @returns Height value (0 if out of bounds)
   */
  static getHeightAt(
    heightData: Float32Array,
    worldX: number,
    worldZ: number,
    chunkX: number,
    chunkZ: number,
    size: number,
    segments: number
  ): number {
    // Convert to local coordinates
    const localX = worldX - (chunkX * size);
    const localZ = worldZ - (chunkZ * size);

    // Check bounds
    if (localX < 0 || localX > size || localZ < 0 || localZ > size) {
      return 0;
    }

    // Use direct height data lookup (works even without terrain mesh)
    return ChunkHeightQueries.getHeightAtLocal(heightData, localX, localZ, size, segments);
  }

  /**
   * Alternative: Get height using raycasting (more accurate for complex terrain)
   * @param terrainMesh - Terrain mesh to raycast against
   * @param worldX - World X coordinate
   * @param worldZ - World Z coordinate
   * @returns Height value (0 if no intersection)
   */
  static getHeightAtRaycast(
    terrainMesh: THREE.Mesh | undefined,
    worldX: number,
    worldZ: number
  ): number {
    if (!terrainMesh) return 0;

    // Create downward ray from above the terrain
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3(worldX, 1000, worldZ);
    const direction = new THREE.Vector3(0, -1, 0);

    raycaster.set(origin, direction);

    // Intersect with terrain mesh (uses BVH for speed)
    const intersects = raycaster.intersectObject(terrainMesh);

    if (intersects.length > 0) {
      return intersects[0].point.y;
    }

    return 0;
  }
}
