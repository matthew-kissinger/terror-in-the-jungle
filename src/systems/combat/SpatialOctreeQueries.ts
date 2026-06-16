// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three'
import { OctreeNode } from './SpatialOctreeNode'

/**
 * Query methods for spatial octree.
 * Handles radius, frustum, ray, and k-nearest queries.
 */
export class SpatialOctreeQueries {
  private entityPositions: Map<string, THREE.Vector3>
  private readonly scratchVector = new THREE.Vector3()
  private readonly scratchSphere = new THREE.Sphere()
  private readonly scratchRay = new THREE.Ray()

  constructor(entityPositions: Map<string, THREE.Vector3>) {
    this.entityPositions = entityPositions
  }

  /**
   * Query entities within radius (sphere query)
   */
  queryRadius(root: OctreeNode, center: THREE.Vector3, radius: number): string[] {
    const results: string[] = []
    this.scratchSphere.set(center, radius)
    const radiusSq = radius * radius
    this.queryRadiusRecursive(root, this.scratchSphere, radiusSq, results)
    return results
  }

  /**
   * Recursively query radius in octree
   */
  private queryRadiusRecursive(node: OctreeNode, sphere: THREE.Sphere, radiusSq: number, results: string[]): void {
    // Early exit if sphere doesn't intersect node bounds
    if (!sphere.intersectsBox(node.bounds)) {
      return
    }

    // Add all entities in this node that are within radius
    for (const id of node.entities) {
      const pos = this.entityPositions.get(id)
      if (pos && pos.distanceToSquared(sphere.center) <= radiusSq) {
        results.push(id)
      }
    }

    // Recurse into children
    if (!node.isLeaf() && node.children) {
      for (const child of node.children) {
        this.queryRadiusRecursive(child, sphere, radiusSq, results)
      }
    }
  }

  /**
   * Query entities visible to frustum
   */
  queryFrustum(root: OctreeNode, frustum: THREE.Frustum): string[] {
    const results: string[] = []
    this.queryFrustumRecursive(root, frustum, results)
    return results
  }

  /**
   * Recursively query frustum in octree
   */
  private queryFrustumRecursive(node: OctreeNode, frustum: THREE.Frustum, results: string[]): void {
    // Early exit if frustum doesn't intersect node bounds
    if (!frustum.intersectsBox(node.bounds)) {
      return
    }

    // Add all entities in this node that are within frustum
    for (const id of node.entities) {
      const pos = this.entityPositions.get(id)
      if (pos && frustum.containsPoint(pos)) {
        results.push(id)
      }
    }

    // Recurse into children
    if (!node.isLeaf() && node.children) {
      for (const child of node.children) {
        this.queryFrustumRecursive(child, frustum, results)
      }
    }
  }

  /**
   * Query entities along ray
   */
  queryRay(root: OctreeNode, origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): string[] {
    const results: string[] = []
    this.scratchRay.set(origin, direction)
    const maxDistanceSq = maxDistance * maxDistance
    this.queryRayRecursive(root, this.scratchRay, maxDistanceSq, results)
    return results
  }

  /**
   * Recursively query ray in octree
   */
  private queryRayRecursive(
    node: OctreeNode,
    ray: THREE.Ray,
    maxDistanceSq: number,
    results: string[]
  ): void {
    // Early exit if ray doesn't intersect node bounds
    const intersection = ray.intersectBox(node.bounds, this.scratchVector)
    if (!intersection || intersection.distanceToSquared(ray.origin) > maxDistanceSq) {
      return
    }

    // Check all entities in this node
    for (const id of node.entities) {
      const pos = this.entityPositions.get(id)
      if (pos) {
        const distance = ray.distanceToPoint(pos)
        if (distance < 2.0 && ray.origin.distanceToSquared(pos) <= maxDistanceSq) {
          results.push(id)
        }
      }
    }

    // Recurse into children
    if (!node.isLeaf() && node.children) {
      for (const child of node.children) {
        this.queryRayRecursive(child, ray, maxDistanceSq, results)
      }
    }
  }

  /**
   * Query k nearest entities to a point
   */
  queryNearestK(root: OctreeNode, center: THREE.Vector3, k: number, maxDistance: number = Infinity): string[] {
    if (k <= 0) return []

    const nearestIds: string[] = []
    const nearestDistancesSq: number[] = []
    const maxDistanceSq = maxDistance * maxDistance

    this.queryNearestKRecursive(root, center, nearestIds, nearestDistancesSq, k, maxDistanceSq)

    return nearestIds.slice(0, k)
  }

  /**
   * Recursively query k-nearest in octree
   */
  private queryNearestKRecursive(
    node: OctreeNode,
    center: THREE.Vector3,
    nearestIds: string[],
    nearestDistancesSq: number[],
    k: number,
    maxDistanceSq: number
  ): void {
    // Check distance to node bounds
    const distanceSq = node.bounds.distanceToPoint(center)
    const effectiveMaxDistanceSq = nearestDistancesSq.length >= k
      ? Math.min(maxDistanceSq, nearestDistancesSq[k - 1])
      : maxDistanceSq
    if (distanceSq > effectiveMaxDistanceSq) {
      return
    }

    // Add all entities in this node
    for (const id of node.entities) {
      const pos = this.entityPositions.get(id)
      if (pos) {
        const distSq = pos.distanceToSquared(center)
        if (distSq <= maxDistanceSq) {
          this.insertNearestCandidate(nearestIds, nearestDistancesSq, k, id, distSq)
        }
      }
    }

    // Recurse into children directly. Sorting child bounds each call adds extra
    // allocations and compare work without changing correctness here.
    if (!node.isLeaf() && node.children) {
      for (const child of node.children) {
        this.queryNearestKRecursive(child, center, nearestIds, nearestDistancesSq, k, maxDistanceSq)
      }
    }
  }

  private insertNearestCandidate(
    nearestIds: string[],
    nearestDistancesSq: number[],
    k: number,
    id: string,
    distanceSq: number
  ): void {
    if (nearestIds.length >= k && distanceSq >= nearestDistancesSq[k - 1]) {
      return
    }

    const insertLimit = Math.min(nearestIds.length, k - 1)
    let insertIndex = insertLimit
    while (insertIndex > 0 && nearestDistancesSq[insertIndex - 1] > distanceSq) {
      insertIndex--
    }

    if (nearestIds.length < k) {
      nearestIds.push(id)
      nearestDistancesSq.push(distanceSq)
    }

    for (let index = Math.min(nearestIds.length - 1, k - 1); index > insertIndex; index--) {
      nearestIds[index] = nearestIds[index - 1]
      nearestDistancesSq[index] = nearestDistancesSq[index - 1]
    }

    nearestIds[insertIndex] = id
    nearestDistancesSq[insertIndex] = distanceSq
  }
}
