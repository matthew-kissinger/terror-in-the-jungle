import * as THREE from 'three';

/**
 * GPU Terrain Geometry Generation
 * 
 * Creates concentric LOD ring geometry for GPU-accelerated terrain rendering.
 * The geometry uses exponential spacing for better detail near the camera.
 */

/**
 * Creates a buffer geometry with concentric LOD rings for terrain rendering.
 * 
 * @param terrainRadius - Maximum visible terrain radius
 * @param lodRings - Number of LOD rings (more rings = smoother transitions)
 * @param ringSegments - Base number of segments per ring (reduces with distance)
 * @returns BufferGeometry with position, UV, and index attributes
 */
export function createLODRingGeometry(
  terrainRadius: number,
  lodRings: number,
  ringSegments: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Create concentric rings with increasing vertex spacing (LOD)
  let vertexIndex = 0;
  const ringRadii: number[] = [];

  // Calculate ring radii with exponential spacing
  for (let ring = 0; ring <= lodRings; ring++) {
    const t = ring / lodRings;
    // Exponential spacing: more detail near camera
    const radius = terrainRadius * Math.pow(t, 1.5);
    ringRadii.push(radius);
  }

  // Generate vertices for each ring
  for (let ring = 0; ring <= lodRings; ring++) {
    const radius = ringRadii[ring];
    const segments = Math.max(8, Math.floor(ringSegments / (ring + 1)));

    for (let seg = 0; seg <= segments; seg++) {
      const theta = (seg / segments) * Math.PI * 2;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;

      positions.push(x, 0, z); // Y will be set by vertex shader
      uvs.push(x, z); // World-space UVs for heightmap lookup
    }
  }

  // Generate indices connecting rings
  let ringStartIndex = 0;
  for (let ring = 0; ring < lodRings; ring++) {
    const innerSegments = Math.max(8, Math.floor(ringSegments / (ring + 1)));
    const outerSegments = Math.max(8, Math.floor(ringSegments / (ring + 2)));

    const innerStart = ringStartIndex;
    const outerStart = ringStartIndex + innerSegments + 1;

    // Connect inner ring to outer ring
    // This is tricky because rings have different segment counts
    for (let i = 0; i < innerSegments; i++) {
      const innerCurrent = innerStart + i;
      const innerNext = innerStart + i + 1;

      // Find corresponding outer vertices
      const outerRatio = i / innerSegments;
      const outerIndex = Math.floor(outerRatio * outerSegments);
      const outerCurrent = outerStart + outerIndex;
      const outerNext = outerStart + Math.min(outerIndex + 1, outerSegments);

      // Triangle 1
      indices.push(innerCurrent, outerCurrent, innerNext);
      // Triangle 2
      indices.push(innerNext, outerCurrent, outerNext);
    }

    ringStartIndex += innerSegments + 1;
  }

  // Also fill the center with a simple disc
  const centerSegments = ringSegments;
  const centerVertexStart = positions.length / 3;

  // Center vertex
  positions.push(0, 0, 0);
  uvs.push(0, 0);

  // First ring vertices for center disc
  const firstRingRadius = ringRadii[1] || 10;
  for (let i = 0; i <= centerSegments; i++) {
    const theta = (i / centerSegments) * Math.PI * 2;
    positions.push(
      Math.cos(theta) * firstRingRadius,
      0,
      Math.sin(theta) * firstRingRadius
    );
    uvs.push(
      Math.cos(theta) * firstRingRadius,
      Math.sin(theta) * firstRingRadius
    );
  }

  // Center disc triangles
  for (let i = 0; i < centerSegments; i++) {
    indices.push(
      centerVertexStart,
      centerVertexStart + 1 + i,
      centerVertexStart + 1 + i + 1
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  return geometry;
}
