import * as THREE from 'three';

/**
 * Factory for creating terrain meshes from height data or worker geometry.
 * Accepts a pre-built shared material from BiomeTexturePool.
 */
export class TerrainMeshFactory {
  static createTerrainMesh(
    heightData: Float32Array,
    chunkX: number,
    chunkZ: number,
    size: number,
    segments: number,
    material: THREE.Material,
  ): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const vertices = geometry.attributes.position.array as Float32Array;
    for (let i = 0, j = 0; i < heightData.length; i++, j += 3) {
      vertices[j + 1] = heightData[i];
    }
    geometry.computeVertexNormals();
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundsTree();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(chunkX * size + size / 2, 0, chunkZ * size + size / 2);
    mesh.name = `chunk_${chunkX},${chunkZ}_terrain`;
    mesh.receiveShadow = true;
    return mesh;
  }

  static createTerrainMeshFromGeometry(
    geometry: THREE.BufferGeometry,
    chunkX: number,
    chunkZ: number,
    size: number,
    material: THREE.Material,
    bvhAlreadyComputed = false,
  ): THREE.Mesh {
    if (!bvhAlreadyComputed) geometry.computeBoundsTree();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(chunkX * size + size / 2, 0, chunkZ * size + size / 2);
    mesh.name = `chunk_${chunkX},${chunkZ}_terrain`;
    mesh.receiveShadow = true;
    return mesh;
  }
}
