import * as THREE from 'three'
import { Combatant, CombatantState, Faction, isAlly } from './types'
import { SpatialGridManager, spatialGridManager } from './SpatialGridManager'
import { performanceTelemetry } from '../debug/PerformanceTelemetry'
import { Logger } from '../../utils/Logger'

const _tmp = new THREE.Vector3()
const _zoneCenter = new THREE.Vector3()
const _closestPoint = new THREE.Vector3()

/**
 * Hit zone definition for combatant body parts
 */
interface HitZone {
  offset: THREE.Vector3
  radius: number
  isHead: boolean
}

const PLAYER_HIT_ZONES: HitZone[] = [
  { offset: new THREE.Vector3(0, 0.0, 0), radius: 0.35, isHead: true },
  { offset: new THREE.Vector3(0.2, -1.1, 0), radius: 0.65, isHead: false },
  { offset: new THREE.Vector3(0, -2.1, 0), radius: 0.55, isHead: false },
  { offset: new THREE.Vector3(-0.2, -3.1, 0), radius: 0.35, isHead: false },
  { offset: new THREE.Vector3(0.2, -3.1, 0), radius: 0.35, isHead: false }
]

export class CombatantHitDetection {
  private readonly MAX_ENGAGEMENT_RANGE = 280
  private readonly FRIENDLY_FIRE_ENABLED = false

  // Spatial grid manager reference (uses singleton by default)
  private gridManager: SpatialGridManager
  private queryProvider: ((center: THREE.Vector3, radius: number) => string[]) | null = null

  // Pre-allocated scratch vectors to avoid allocations in hot path
  private scratchVec1 = new THREE.Vector3()
  private scratchVec2 = new THREE.Vector3()
  private scratchVec3 = new THREE.Vector3()
  private readonly playerHitPoint = new THREE.Vector3()
  private readonly playerMissPoint = new THREE.Vector3()
  private static loggedUninitializedGrid = false

  // Cached hit zones to avoid per-call allocations.
  // Billboard sprites are PlaneGeometry(5, 7) centered at combatant.position
  // (ground level). The visible character figure occupies roughly y=0 to y=+3.5.
  // Spheres are widened to better match the billboard visual width (~2.5m body).
  // Legs raised from below-ground to y=0+ so shots at visible feet register.
  private readonly hitZonesEngaging: HitZone[] = [
    { offset: new THREE.Vector3(0, 2.5, 0), radius: 0.4, isHead: true },
    { offset: new THREE.Vector3(0.15, 1.4, 0), radius: 0.8, isHead: false },
    { offset: new THREE.Vector3(0, 0.5, 0), radius: 0.7, isHead: false },
    { offset: new THREE.Vector3(-0.2, 0.0, 0), radius: 0.45, isHead: false },
    { offset: new THREE.Vector3(0.2, 0.0, 0), radius: 0.45, isHead: false }
  ]

  private readonly hitZonesAlert: HitZone[] = [
    { offset: new THREE.Vector3(0, 2.7, 0), radius: 0.4, isHead: true },
    { offset: new THREE.Vector3(0, 1.5, 0), radius: 0.8, isHead: false },
    { offset: new THREE.Vector3(0, 0.5, 0), radius: 0.7, isHead: false },
    { offset: new THREE.Vector3(-0.3, 0.0, 0), radius: 0.45, isHead: false },
    { offset: new THREE.Vector3(0.3, 0.0, 0), radius: 0.45, isHead: false }
  ]

  private readonly hitZonesDefault: HitZone[] = [
    { offset: new THREE.Vector3(0, 2.8, 0), radius: 0.4, isHead: true },
    { offset: new THREE.Vector3(0, 1.5, 0), radius: 0.8, isHead: false },
    { offset: new THREE.Vector3(0, 0.5, 0), radius: 0.7, isHead: false },
    { offset: new THREE.Vector3(-0.3, 0.0, 0), radius: 0.45, isHead: false },
    { offset: new THREE.Vector3(0.3, 0.0, 0), radius: 0.45, isHead: false }
  ]

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
    for (const zone of PLAYER_HIT_ZONES) {
      _zoneCenter.copy(playerPosition).add(zone.offset)
      _tmp.subVectors(_zoneCenter, ray.origin)
      const t = _tmp.dot(ray.direction)

      if (t < 0 || t > this.MAX_ENGAGEMENT_RANGE) continue

      _closestPoint.copy(ray.origin).addScaledVector(ray.direction, t)
      const distSq = _closestPoint.distanceToSquared(_zoneCenter)

      if (distSq <= zone.radius * zone.radius) {
        _tmp.copy(_closestPoint).sub(_zoneCenter).normalize()
        this.playerHitPoint.copy(_zoneCenter).addScaledVector(_tmp, zone.radius)

        return {
          hit: true,
          point: this.playerHitPoint,
          headshot: zone.isHead
        }
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
    allCombatants: Map<string, Combatant>
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

    // Use scratch vectors to avoid allocations
    const tmp = this.scratchVec1
    const closestPoint = this.scratchVec2
    const zoneCenter = this.scratchVec3

    for (const id of candidateIds) {
      const combatant = allCombatants.get(id)
      if (!combatant) continue
      if (!this.FRIENDLY_FIRE_ENABLED && isAlly(combatant.faction, shooterFaction)) continue
      if (combatant.state === CombatantState.DEAD) continue

      // Use cached hit zones (no allocation)
      const hitZones = this.getHitZonesForState(combatant.state)

      for (const zone of hitZones) {
        // Use scratch vector instead of clone
        zoneCenter.copy(combatant.position).add(zone.offset)
        tmp.subVectors(zoneCenter, ray.origin)
        const t = tmp.dot(ray.direction)

        if (t < 0 || t > this.MAX_ENGAGEMENT_RANGE) continue

        // Reuse scratch vector
        closestPoint.copy(ray.origin).addScaledVector(ray.direction, t)
        const distSq = closestPoint.distanceToSquared(zoneCenter)

        if (distSq <= zone.radius * zone.radius) {
          const distance = t

          if (!closest || distance < closest.distance) {
            // Only allocate when we have a hit (rare)
            const hitDir = closestPoint.clone().sub(zoneCenter).normalize()
            const actualHitPoint = zoneCenter.clone().add(hitDir.multiplyScalar(zone.radius))

            closest = {
              combatant,
              distance,
              point: actualHitPoint,
              headshot: zone.isHead
            }
            break
          }
        }
      }
    }

    return closest
  }

  /**
   * Get cached hit zones for state (no per-call allocation)
   */
  private getHitZonesForState(state: CombatantState): HitZone[] {
    if (state === CombatantState.ENGAGING || state === CombatantState.SUPPRESSING) {
      return this.hitZonesEngaging
    } else if (state === CombatantState.ALERT) {
      return this.hitZonesAlert
    } else {
      return this.hitZonesDefault
    }
  }
}
