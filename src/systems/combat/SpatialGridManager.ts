import * as THREE from 'three'
import { SpatialOctree } from './SpatialOctree'
import { Combatant, CombatantState } from './types'
import { performanceTelemetry } from '../debug/PerformanceTelemetry'
import { Logger } from '../../utils/Logger'

/**
 * LOD-based sync frequency for spatial grid updates.
 * Higher LOD (closer entities) sync more frequently.
 */
export enum SyncFrequency {
  EVERY_FRAME = 1,   // HIGH LOD (<150m)
  EVERY_2_FRAMES = 2, // MEDIUM LOD (150-300m)
  EVERY_5_FRAMES = 5, // LOW LOD (300-500m)
  EVERY_30_FRAMES = 30 // CULLED (>500m)
}

export interface SpatialGridTelemetry {
  initialized: boolean
  entityCount: number
  queriesThisFrame: number
  avgQueryTimeMs: number
  fallbackCount: number
  lastSyncMs: number
  lastRebuildMs: number
}

/**
 * Single owner of spatial grid with explicit initialization,
 * LOD-based sync strategy, built-in telemetry, and no silent fallbacks.
 */
export class SpatialGridManager {
  private grid: SpatialOctree | null = null
  private isInitialized = false
  private worldSize = 0
  private frameCounter = 0

  private telemetry: SpatialGridTelemetry = {
    initialized: false,
    entityCount: 0,
    queriesThisFrame: 0,
    avgQueryTimeMs: 0,
    fallbackCount: 0,
    lastSyncMs: 0,
    lastRebuildMs: 0
  }

  // Scratch vector for distance calculations
  private readonly scratchVec = new THREE.Vector3()

  // Query timing for EMA
  private queryTimesMs: number[] = []
  private queryTimesSumMs = 0
  private readonly MAX_QUERY_SAMPLES = 100
  private loggedUninitializedMethods: Set<string> = new Set()

  /**
   * Initialize the spatial grid with known world size.
   * Called ONCE when game mode is set.
   */
  initialize(worldSize: number): void {
    if (this.isInitialized && this.worldSize === worldSize) {
      Logger.info('spatial-grid', `Already initialized with world size ${worldSize}`)
      return
    }

    const start = performance.now()

    this.worldSize = worldSize
    this.grid = new SpatialOctree(worldSize, 12, 6) // 12 entities per node, 6 max depth
    this.isInitialized = true

    const duration = performance.now() - start
    this.telemetry.initialized = true
    this.telemetry.lastRebuildMs = duration
    this.loggedUninitializedMethods.clear()

    Logger.info('spatial-grid', `Initialized with world size ${worldSize} in ${duration.toFixed(1)}ms`)

    // Update performance telemetry
    performanceTelemetry.updateSpatialGridTelemetry({
      initialized: true,
      entityCount: 0,
      fallbackCount: 0
    })
  }

  /**
   * Reinitialize with new world size (e.g., on game mode change)
   */
  reinitialize(worldSize: number): void {
    Logger.info('spatial-grid', `Reinitializing with new world size ${worldSize}`)
    this.isInitialized = false
    this.grid = null
    this.telemetry.entityCount = 0
    this.loggedUninitializedMethods.clear()
    this.initialize(worldSize)
  }

  /**
   * Check if grid is initialized
   */
  getIsInitialized(): boolean {
    return this.isInitialized
  }

  /**
   * Sync all entity positions. Call from CombatantSystem.update()
   * Uses LOD-based frequency to reduce overhead.
   */
  syncAllPositions(
    combatants: Map<string, Combatant>,
    playerPosition: THREE.Vector3
  ): void {
    if (!this.isInitialized || !this.grid) {
      this.recordUninitializedFallback('syncAllPositions')
      return
    }

    const start = performance.now()
    this.frameCounter++

    combatants.forEach((combatant, id) => {
      if (combatant.state === CombatantState.DEAD) {
        // Remove dead entities from grid
        this.grid!.remove(id)
        return
      }

      // Determine sync frequency based on distance
      const distance = this.scratchVec
        .copy(combatant.position)
        .sub(playerPosition)
        .length()

      let syncFreq: number
      if (distance < 150) {
        syncFreq = SyncFrequency.EVERY_FRAME
      } else if (distance < 300) {
        syncFreq = SyncFrequency.EVERY_2_FRAMES
      } else if (distance < 500) {
        syncFreq = SyncFrequency.EVERY_5_FRAMES
      } else {
        syncFreq = SyncFrequency.EVERY_30_FRAMES
      }

      // Only sync if this frame matches the frequency
      if (this.frameCounter % syncFreq === 0) {
        this.grid!.updatePosition(id, combatant.position)
      }
    })

    const duration = performance.now() - start
    this.telemetry.lastSyncMs = duration
    this.telemetry.entityCount = combatants.size

    // Update performance telemetry
    performanceTelemetry.updateSpatialGridTelemetry({
      entityCount: combatants.size,
      lastSyncMs: duration
    })
  }

  /**
   * Force sync a specific entity immediately
   */
  syncEntity(id: string, position: THREE.Vector3): void {
    if (!this.isInitialized || !this.grid) {
      this.recordUninitializedFallback('syncEntity')
      return
    }

    this.grid.updatePosition(id, position)
  }

  /**
   * Remove entity from grid
   */
  removeEntity(id: string): void {
    if (!this.isInitialized || !this.grid) return
    this.grid.remove(id)
  }

  /**
   * Query entities within radius. Fails loudly if not initialized.
   */
  queryRadius(center: THREE.Vector3, radius: number): string[] {
    if (!this.isInitialized || !this.grid) {
      this.recordUninitializedFallback('queryRadius')
      return []
    }

    const start = performance.now()
    const results = this.grid.queryRadius(center, radius)
    const duration = performance.now() - start

    // Update query timing
    this.queryTimesMs.push(duration)
    this.queryTimesSumMs += duration
    if (this.queryTimesMs.length > this.MAX_QUERY_SAMPLES) {
      const removed = this.queryTimesMs.shift() ?? 0
      this.queryTimesSumMs -= removed
    }

    // Calculate EMA
    const avgQueryTime = this.queryTimesSumMs / this.queryTimesMs.length
    this.telemetry.avgQueryTimeMs = avgQueryTime
    this.telemetry.queriesThisFrame++

    // Update performance telemetry
    performanceTelemetry.updateSpatialGridTelemetry({
      queriesThisFrame: this.telemetry.queriesThisFrame,
      avgQueryTimeMs: avgQueryTime
    })

    return results
  }

  /**
   * Query k-nearest entities
   */
  queryNearestK(center: THREE.Vector3, k: number, maxDistance: number = Infinity): string[] {
    if (!this.isInitialized || !this.grid) {
      this.recordUninitializedFallback('queryNearestK')
      return []
    }

    const start = performance.now()
    const results = this.grid.queryNearestK(center, k, maxDistance)
    const duration = performance.now() - start

    this.queryTimesMs.push(duration)
    this.queryTimesSumMs += duration
    if (this.queryTimesMs.length > this.MAX_QUERY_SAMPLES) {
      const removed = this.queryTimesMs.shift() ?? 0
      this.queryTimesSumMs -= removed
    }

    this.telemetry.queriesThisFrame++
    return results
  }

  /**
   * Query entities along ray
   */
  queryRay(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): string[] {
    if (!this.isInitialized || !this.grid) {
      this.recordUninitializedFallback('queryRay')
      return []
    }

    const start = performance.now()
    const results = this.grid.queryRay(origin, direction, maxDistance)
    const duration = performance.now() - start

    this.queryTimesMs.push(duration)
    this.queryTimesSumMs += duration
    if (this.queryTimesMs.length > this.MAX_QUERY_SAMPLES) {
      const removed = this.queryTimesMs.shift() ?? 0
      this.queryTimesSumMs -= removed
    }

    this.telemetry.queriesThisFrame++
    return results
  }

  /**
   * Clear the grid
   */
  clear(): void {
    if (this.grid) {
      this.grid.clear()
    }
    this.telemetry.entityCount = 0
    this.queryTimesMs = []
    this.queryTimesSumMs = 0
  }

  /**
   * Reset frame counters (call at start of each frame)
   */
  resetFrameTelemetry(): void {
    this.telemetry.queriesThisFrame = 0
  }

  /**
   * Get telemetry data
   */
  getTelemetry(): SpatialGridTelemetry {
    return { ...this.telemetry }
  }

  /**
   * Get octree stats for debugging
   */
  getOctreeStats(): {
    totalNodes: number
    totalEntities: number
    maxDepth: number
    avgEntitiesPerLeaf: number
  } | null {
    if (!this.grid) return null
    return this.grid.getStats()
  }

  /**
   * Get the underlying grid for advanced queries (use sparingly)
   */
  getGrid(): SpatialOctree | null {
    return this.grid
  }

  private recordUninitializedFallback(method: string): void {
    this.telemetry.fallbackCount++
    performanceTelemetry.recordFallback()
    if (this.loggedUninitializedMethods.has(method)) return
    this.loggedUninitializedMethods.add(method)
    Logger.error('spatial-grid', `${method} called before initialization!`)
  }
}

// Export singleton instance
export const spatialGridManager = new SpatialGridManager()
