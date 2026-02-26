import * as THREE from 'three'
import { Combatant, CombatantState } from './types'
import { OctreeNode } from './SpatialOctreeNode'
import { SpatialOctreeQueries } from './SpatialOctreeQueries'

/** Minimal interface for spatial radius queries. Satisfied by both SpatialOctree and SpatialGridManager. */
export interface ISpatialQuery {
  queryRadius(center: THREE.Vector3, radius: number): string[];
}

export class SpatialOctree implements ISpatialQuery {
  private root: OctreeNode
  private entityPositions: Map<string, THREE.Vector3> = new Map()
  private entityNodes: Map<string, OctreeNode> = new Map()
  private readonly maxEntitiesPerNode: number
  private readonly maxDepth: number
  private worldBounds: THREE.Box3
  private queries: SpatialOctreeQueries

  constructor(worldSize: number = 4000, maxEntitiesPerNode: number = 12, maxDepth: number = 6) {
    this.maxEntitiesPerNode = maxEntitiesPerNode
    this.maxDepth = maxDepth

    const halfSize = worldSize / 2
    this.worldBounds = new THREE.Box3(
      new THREE.Vector3(-halfSize, -50, -halfSize),
      new THREE.Vector3(halfSize, 100, halfSize)
    )

    this.root = new OctreeNode(this.worldBounds.clone(), 0)
    this.queries = new SpatialOctreeQueries(this.entityPositions)
  }

  /**
   * Update world bounds dynamically
   */
  setWorldSize(worldSize: number): void {
    const halfSize = worldSize / 2
    this.worldBounds = new THREE.Box3(
      new THREE.Vector3(-halfSize, -50, -halfSize),
      new THREE.Vector3(halfSize, 100, halfSize)
    )

    // Rebuild tree with new bounds
    const entities = Array.from(this.entityPositions.entries())
    this.clear()
    this.root = new OctreeNode(this.worldBounds.clone(), 0)

    for (const [id, position] of entities) {
      this.insert(id, position)
    }
  }

  /**
   * Insert or update entity position in octree
   */
  updatePosition(id: string, position: THREE.Vector3): void {
    const oldPosition = this.entityPositions.get(id)

    // If position hasn't changed significantly, skip update
    if (oldPosition && oldPosition.distanceToSquared(position) < 1.0) {
      return
    }

    // Remove old position if exists
    if (oldPosition) {
      this.remove(id)
    }

    // Insert at new position
    this.insert(id, position)
  }

  /**
   * Insert entity into octree
   */
  private insert(id: string, position: THREE.Vector3): void {
    // Clamp position to world bounds (single clone, reused for both storage and insertion)
    const clampedPos = position.clone().clamp(this.worldBounds.min, this.worldBounds.max)
    this.entityPositions.set(id, clampedPos)
    this.insertIntoNode(this.root, id, clampedPos)
  }

  /**
   * Recursively insert entity into appropriate node
   */
  private insertIntoNode(node: OctreeNode, id: string, position: THREE.Vector3): void {
    // If not a leaf, insert into appropriate child
    if (!node.isLeaf()) {
      const octant = node.getOctantIndex(position)
      if (node.children && node.children[octant].bounds.containsPoint(position)) {
        this.insertIntoNode(node.children[octant], id, position)
      } else {
        // Position doesn't fit perfectly, store at this level
        node.entities.push(id)
        this.entityNodes.set(id, node)
      }
      return
    }

    // Add to leaf node
    node.entities.push(id)
    this.entityNodes.set(id, node)

    // Subdivide if over capacity and not at max depth
    if (node.entities.length > this.maxEntitiesPerNode && node.depth < this.maxDepth) {
      node.subdivide()

      // Redistribute entities to children
      const entitiesToRedistribute = [...node.entities]
      node.entities = []

      for (const entityId of entitiesToRedistribute) {
        const entityPos = this.entityPositions.get(entityId)
        if (entityPos && node.children) {
          const octant = node.getOctantIndex(entityPos)
          if (node.children[octant].bounds.containsPoint(entityPos)) {
            this.insertIntoNode(node.children[octant], entityId, entityPos)
          } else {
            node.entities.push(entityId)
          }
        }
      }
    }
  }

  /**
   * Remove entity from octree
   */
  remove(id: string): void {
    const position = this.entityPositions.get(id)
    if (!position) return
    const directNode = this.entityNodes.get(id)
    let removed = false
    if (directNode) {
      removed = this.removeFromExactNode(directNode, id)
    }
    if (!removed) {
      removed = this.removeFromNode(this.root, id, position)
    }
    this.entityPositions.delete(id)
    this.entityNodes.delete(id)
  }

  private removeFromExactNode(node: OctreeNode, id: string): boolean {
    const index = node.entities.indexOf(id)
    if (index === -1) return false
    const last = node.entities[node.entities.length - 1]
    node.entities[index] = last
    node.entities.pop()
    return true
  }

  /**
   * Recursively remove entity from node
   */
  private removeFromNode(node: OctreeNode, id: string, position: THREE.Vector3): boolean {
    if (node.isLeaf()) {
      const index = node.entities.indexOf(id)
      if (index !== -1) {
        // Swap-and-pop: O(1) instead of splice's O(n)
        const last = node.entities[node.entities.length - 1]
        node.entities[index] = last
        node.entities.pop()
        this.entityNodes.delete(id)
        return true
      }
      return false
    }

    // Check this node's entities first
    const index = node.entities.indexOf(id)
    if (index !== -1) {
      // Swap-and-pop: O(1) instead of splice's O(n)
      const last = node.entities[node.entities.length - 1]
      node.entities[index] = last
      node.entities.pop()
      this.entityNodes.delete(id)
      return true
    }

    // Check children
    if (node.children) {
      const octant = node.getOctantIndex(position)
      if (node.children[octant].bounds.containsPoint(position)) {
        return this.removeFromNode(node.children[octant], id, position)
      } else {
        // Search all children if position doesn't match
        for (const child of node.children) {
          if (this.removeFromNode(child, id, position)) {
            return true
          }
        }
      }
    }

    return false
  }

  /**
   * Query entities within radius (sphere query)
   */
  queryRadius(center: THREE.Vector3, radius: number): string[] {
    return this.queries.queryRadius(this.root, center, radius)
  }

  /**
   * Query entities visible to frustum
   */
  queryFrustum(frustum: THREE.Frustum): string[] {
    return this.queries.queryFrustum(this.root, frustum)
  }

  /**
   * Query entities along ray
   */
  queryRay(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): string[] {
    return this.queries.queryRay(this.root, origin, direction, maxDistance)
  }

  /**
   * Query k nearest entities to a point
   */
  queryNearestK(center: THREE.Vector3, k: number, maxDistance: number = Infinity): string[] {
    return this.queries.queryNearestK(this.root, center, k, maxDistance)
  }

  /**
   * Rebuild entire octree from scratch
   */
  rebuild(combatants: Map<string, Combatant>): void {
    this.clear()
    this.root = new OctreeNode(this.worldBounds.clone(), 0)

    combatants.forEach((combatant, id) => {
      if (combatant.state !== CombatantState.DEAD) {
        this.insert(id, combatant.position)
      }
    })
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.entityPositions.clear()
    this.entityNodes.clear()
    this.root = new OctreeNode(this.worldBounds.clone(), 0)
    // Recreate queries instance to update entityPositions reference
    this.queries = new SpatialOctreeQueries(this.entityPositions)
  }

  /**
   * Get statistics for debugging
   */
  getStats(): {
    totalNodes: number
    totalEntities: number
    maxDepth: number
    avgEntitiesPerLeaf: number
  } {
    let totalNodes = 0
    let leafNodes = 0
    let totalEntitiesInLeaves = 0
    let maxDepthFound = 0

    const traverse = (node: OctreeNode) => {
      totalNodes++
      maxDepthFound = Math.max(maxDepthFound, node.depth)

      if (node.isLeaf()) {
        leafNodes++
        totalEntitiesInLeaves += node.entities.length
      } else if (node.children) {
        for (const child of node.children) {
          traverse(child)
        }
      }
    }

    traverse(this.root)

    return {
      totalNodes,
      totalEntities: this.entityPositions.size,
      maxDepth: maxDepthFound,
      avgEntitiesPerLeaf: leafNodes > 0 ? totalEntitiesInLeaves / leafNodes : 0
    }
  }
}
