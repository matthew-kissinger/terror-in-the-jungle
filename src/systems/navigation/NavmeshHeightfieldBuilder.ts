import * as THREE from 'three';

/**
 * Builds an indexed Three.js BufferGeometry from a height provider callback.
 * The resulting mesh is suitable for Recast navmesh generation.
 */
export function buildHeightfieldMesh(
  getHeightAt: (x: number, z: number) => number,
  originX: number,
  originZ: number,
  extentX: number,
  extentZ: number,
  cellSize: number
): THREE.BufferGeometry {
  const cols = Math.ceil(extentX / cellSize) + 1;
  const rows = Math.ceil(extentZ / cellSize) + 1;
  const vertexCount = cols * rows;

  const positions = new Float32Array(vertexCount * 3);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = originX + col * cellSize;
      const z = originZ + row * cellSize;
      const y = getHeightAt(x, z);
      const idx = (row * cols + col) * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
    }
  }

  // Build index buffer (two triangles per quad)
  const quads = (cols - 1) * (rows - 1);
  const indices = new Uint32Array(quads * 6);
  let ptr = 0;

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const topLeft = row * cols + col;
      const topRight = topLeft + 1;
      const bottomLeft = (row + 1) * cols + col;
      const bottomRight = bottomLeft + 1;

      // Triangle 1
      indices[ptr++] = topLeft;
      indices[ptr++] = bottomLeft;
      indices[ptr++] = topRight;

      // Triangle 2
      indices[ptr++] = topRight;
      indices[ptr++] = bottomLeft;
      indices[ptr++] = bottomRight;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  return geometry;
}
