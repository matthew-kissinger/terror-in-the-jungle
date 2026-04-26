import * as THREE from 'three'
import { Combatant, CombatantState, Faction, isAlly } from './types'
import { SpatialGridManager, spatialGridManager } from './SpatialGridManager'
import { performanceTelemetry } from '../debug/PerformanceTelemetry'
import { Logger } from '../../utils/Logger'
import {
  createCombatantHitProxyScratch,
  writeCharacterHitProxies,
  writeCombatantHitProxies,
  type CombatantHitProxy,
  type CombatantHitProxyPositionMode,
} from './CombatantBodyMetrics'

export interface CombatantRaycastOptions {
  positionMode?: CombatantHitProxyPositionMode
}

export class CombatantHitDetection {
  private readonly MAX_ENGAGEMENT_RANGE = 280

  // Spatial grid manager reference (uses singleton by default)
  private gridManager: SpatialGridManager
  private queryProvider: ((center: THREE.Vector3, radius: number) => string[]) | null = null

  // Pre-allocated scratch vectors to avoid allocations in hot path
  private scratchVec1 = new THREE.Vector3()
  private scratchVec2 = new THREE.Vector3()
  private scratchVec3 = new THREE.Vector3()
  private scratchVec4 = new THREE.Vector3()
  private scratchVec5 = new THREE.Vector3()
  private scratchVec6 = new THREE.Vector3()
  private readonly hitProxyScratch = createCombatantHitProxyScratch()
  private readonly playerHitProxyScratch = createCombatantHitProxyScratch()
  private readonly combatantHitPoint = new THREE.Vector3()
  private readonly playerHitPoint = new THREE.Vector3()
  private readonly playerClosestHitPoint = new THREE.Vector3()
  private readonly playerMissPoint = new THREE.Vector3()
  private static loggedUninitializedGrid = false

  constructor(gridManager?: SpatialGridManager) {
    // Use provided grid manager or singleton
    this.gridManager = gridManager || spatialGridManager
  }

  /**
   * Set custom grid manager (for testing or custom configurations)
   */
  setGridManager(manager: SpatialGridManager): void {
    this.gridManager = manager
  }

  /**
   * Optional spatial query provider.
   * When set, this is preferred over SpatialGridManager and enables single-owner spatial paths.
   */
  setQueryProvider(provider: (center: THREE.Vector3, radius: number) => string[]): void {
    this.queryProvider = provider
  }

  checkPlayerHit(
    ray: THREE.Ray,
    playerPosition: THREE.Vector3
  ): { hit: boolean; point: THREE.Vector3; headshot: boolean } {
    const proxies = writeCharacterHitProxies(this.playerHitProxyScratch, { anchor: playerPosition })
    let closestDistance = Number.POSITIVE_INFINITY
    let closestHeadshot = false

    for (const proxy of proxies) {
      const distance = this.intersectCombatantHitProxy(ray, proxy, this.playerHitPoint)
      if (distance === null || distance > this.MAX_ENGAGEMENT_RANGE) continue

      if (distance < closestDistance) {
        closestDistance = distance
        closestHeadshot = proxy.isHead
        this.playerClosestHitPoint.copy(this.playerHitPoint)
      }
    }

    if (Number.isFinite(closestDistance)) {
      this.playerHitPoint.copy(this.playerClosestHitPoint)
      return {
        hit: true,
        point: this.playerHitPoint,
        headshot: closestHeadshot
      }
    }

    return { hit: false, point: this.playerMissPoint.set(0, 0, 0), headshot: false }
  }

  /**
   * Raycast against combatants using spatial grid.
   * REQUIRES grid to be initialized - no fallback to full scan.
   */
  raycastCombatants(
    ray: THREE.Ray,
    shooterFaction: Faction,
    allCombatants: Map<string, Combatant>,
    options: CombatantRaycastOptions = {}
  ): { combatant: Combatant; distance: number; point: THREE.Vector3; headshot: boolean } | null {
    let closest: { combatant: Combatant; distance: number; point: THREE.Vector3; headshot: boolean } | null = null

    // Query radius around ray origin - prefer injected primary spatial owner query.
    let candidateIds: string[] = []
    if (this.queryProvider) {
      candidateIds = this.queryProvider(ray.origin, this.MAX_ENGAGEMENT_RANGE)
    } else {
      if (!this.gridManager.getIsInitialized()) {
        if (!CombatantHitDetection.loggedUninitializedGrid) {
          CombatantHitDetection.loggedUninitializedGrid = true
          Logger.error('combat', '[HitDetection] Grid not initialized! Call spatialGridManager.initialize() first.')
        }
        performanceTelemetry.recordFallback()
        return null
      }
      candidateIds = this.gridManager.queryRadius(ray.origin, this.MAX_ENGAGEMENT_RANGE)
    }

    for (const id of candidateIds) {
      const combatant = allCombatants.get(id)
      if (!combatant) continue
      if (isAlly(combatant.faction, shooterFaction)) continue
      if (combatant.state === CombatantState.DEAD) continue

      const proxies = writeCombatantHitProxies(
        this.hitProxyScratch,
        combatant,
        options.positionMode ?? 'logical'
      )

      for (const proxy of proxies) {
        const distance = this.intersectCombatantHitProxy(ray, proxy, this.combatantHitPoint)
        if (distance === null || distance > this.MAX_ENGAGEMENT_RANGE) continue

        if (!closest || distance < closest.distance) {
          closest = {
            combatant,
            distance,
            point: this.combatantHitPoint.clone(),
            headshot: proxy.isHead
          }
        }
      }
    }

    return closest
  }

  private intersectCombatantHitProxy(
    ray: THREE.Ray,
    proxy: CombatantHitProxy,
    outPoint: THREE.Vector3
  ): number | null {
    if (proxy.kind === 'sphere') {
      return this.intersectSphereProxy(ray, proxy.center, proxy.radius, outPoint)
    }
    return this.intersectCapsuleProxy(ray, proxy.start, proxy.end, proxy.radius, outPoint)
  }

  private intersectSphereProxy(
    ray: THREE.Ray,
    center: THREE.Vector3,
    radius: number,
    outPoint: THREE.Vector3
  ): number | null {
    const tmp = this.scratchVec1
    const closestPoint = this.scratchVec2
    const hitDir = this.scratchVec3
    tmp.subVectors(center, ray.origin)
    const t = tmp.dot(ray.direction)
    if (t < 0) return null

    closestPoint.copy(ray.origin).addScaledVector(ray.direction, t)
    const distSq = closestPoint.distanceToSquared(center)
    if (distSq > radius * radius) return null

    hitDir.copy(closestPoint).sub(center)
    if (hitDir.lengthSq() > 0.000001) {
      outPoint.copy(center).addScaledVector(hitDir.normalize(), radius)
    } else {
      outPoint.copy(closestPoint)
    }
    return t
  }

  private intersectCapsuleProxy(
    ray: THREE.Ray,
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number,
    outPoint: THREE.Vector3
  ): number | null {
    const segment = this.scratchVec1.subVectors(end, start)
    const originToStart = this.scratchVec2.subVectors(ray.origin, start)
    const rayClosest = this.scratchVec3
    const segmentClosest = this.scratchVec4
    const delta = this.scratchVec5
    const direction = this.scratchVec6.copy(ray.direction)

    const segmentLengthSq = segment.lengthSq()
    if (segmentLengthSq <= 0.000001) {
      return this.intersectSphereProxy(ray, start, radius, outPoint)
    }

    const b = direction.dot(segment)
    const d = direction.dot(originToStart)
    const e = segment.dot(originToStart)
    const denom = segmentLengthSq - b * b

    let rayT = 0
    let segmentT = 0
    if (Math.abs(denom) > 0.000001) {
      rayT = (b * e - segmentLengthSq * d) / denom
      segmentT = (e + b * rayT) / segmentLengthSq
    } else {
      rayT = 0
      segmentT = e / segmentLengthSq
    }

    if (rayT < 0) {
      rayT = 0
      segmentT = e / segmentLengthSq
    }

    segmentT = THREE.MathUtils.clamp(segmentT, 0, 1)
    if (segmentT === 0) {
      rayT = Math.max(0, -d)
    } else if (segmentT === 1) {
      rayT = Math.max(0, b - d)
    }

    rayClosest.copy(ray.origin).addScaledVector(direction, rayT)
    segmentClosest.copy(start).addScaledVector(segment, segmentT)
    delta.subVectors(rayClosest, segmentClosest)
    if (delta.lengthSq() > radius * radius) return null

    outPoint.copy(rayClosest)
    return rayT
  }
}
