import * as THREE from 'three'

/**
 * Octree node for spatial partitioning of combatants in 3D space.
 * Provides efficient O(log n) queries for radius, frustum, ray, and k-nearest searches.
 */
export class OctreeNode {
  bounds: THREE.Box3
  entities: string[] = []
  children: OctreeNode[] | null = null
  depth: number

  constructor(bounds: THREE.Box3, depth: number = 0) {
    this.bounds = bounds
    this.depth = depth
  }

  /**
   * Check if this node is a leaf (has no children)
   */
  isLeaf(): boolean {
    return this.children === null
  }

  /**
   * Subdivide this node into 8 octants
   */
  subdivide(): void {
    if (!this.isLeaf()) return

    const center = this.bounds.getCenter(new THREE.Vector3())
    const min = this.bounds.min
    const max = this.bounds.max

    this.children = [
      // Bottom quadrants (y < center.y)
      new OctreeNode(new THREE.Box3(
        new THREE.Vector3(min.x, min.y, min.z),
        new THREE.Vector3(center.x, center.y, center.z)
      ), this.depth + 1),
      new OctreeNode(new THREE.Box3(
        new THREE.Vector3(center.x, min.y, min.z),
        new THREE.Vector3(max.x, center.y, center.z)
      ), this.depth + 1),
      new OctreeNode(new THREE.Box3(
        new THREE.Vector3(min.x, min.y, center.z),
        new THREE.Vector3(center.x, center.y, max.z)
      ), this.depth + 1),
      new OctreeNode(new THREE.Box3(
        new THREE.Vector3(center.x, min.y, center.z),
        new THREE.Vector3(max.x, center.y, max.z)
      ), this.depth + 1),
      // Top quadrants (y >= center.y)
      new OctreeNode(new THREE.Box3(
        new THREE.Vector3(min.x, center.y, min.z),
        new THREE.Vector3(center.x, max.y, center.z)
      ), this.depth + 1),
      new OctreeNode(new THREE.Box3(
        new THREE.Vector3(center.x, center.y, min.z),
        new THREE.Vector3(max.x, max.y, center.z)
      ), this.depth + 1),
      new OctreeNode(new THREE.Box3(
        new THREE.Vector3(min.x, center.y, center.z),
        new THREE.Vector3(center.x, max.y, max.z)
      ), this.depth + 1),
      new OctreeNode(new THREE.Box3(
        new THREE.Vector3(center.x, center.y, center.z),
        new THREE.Vector3(max.x, max.y, max.z)
      ), this.depth + 1)
    ]

    // Redistribute entities to children
    for (const id of this.entities) {
      // Children will handle insertion
    }
    this.entities = []
  }

  /**
   * Find which child octant contains a point
   */
  getOctantIndex(position: THREE.Vector3): number {
    const center = this.bounds.getCenter(new THREE.Vector3())
    let index = 0
    if (position.x >= center.x) index |= 1
    if (position.z >= center.z) index |= 2
    if (position.y >= center.y) index |= 4
    return index
  }
}
