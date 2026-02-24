import * as THREE from 'three';

/**
 * Builds terrain geometry and meshes for chunks.
 */
export class ChunkGeometryBuilder {
  static createGeometryFromHeightData(
    heightData: Float32Array,
    size: number,
    segments: number
  ): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const vertices = geometry.attributes.position.array as Float32Array;
    for (let i = 0, j = 0; i < heightData.length; i++, j += 3) {
      vertices[j + 1] = heightData[i];
    }
    geometry.computeVertexNormals();
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundsTree();
    return geometry;
  }

  static createMeshFromGeometry(
    geometry: THREE.BufferGeometry,
    chunkX: number,
    chunkZ: number,
    size: number,
    scene: THREE.Scene,
    material: THREE.Material,
    bvhAlreadyComputed = false
  ): { mesh: THREE.Mesh; geometry: THREE.BufferGeometry } {
    if (!bvhAlreadyComputed) geometry.computeBoundsTree();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(chunkX * size + size / 2, 0, chunkZ * size + size / 2);
    mesh.name = `chunk_${chunkX},${chunkZ}_terrain`;
    mesh.receiveShadow = true;
    scene.add(mesh);

    return { mesh, geometry };
  }
}
