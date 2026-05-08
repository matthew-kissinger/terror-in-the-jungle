import * as THREE from 'three'
import { Combatant, CombatantState, ITargetable } from './types'
import { SpatialGridManager } from './SpatialGridManager'

export interface TargetDistributionTelemetry {
  distributionCalls: number
  zeroTargetCalls: number
  singleTargetCalls: number
  multiTargetCalls: number
  potentialTargetsTotal: number
  targetCountRebuilds: number
  assignments: number
  assignmentChurn: number
  targeterCountSamples: number
  targeterCountTotal: number
  targeterCountMax: number
}

function createTargetDistributionTelemetry(): TargetDistributionTelemetry {
  return {
    distributionCalls: 0,
    zeroTargetCalls: 0,
    singleTargetCalls: 0,
    multiTargetCalls: 0,
    potentialTargetsTotal: 0,
    targetCountRebuilds: 0,
    assignments: 0,
    assignmentChurn: 0,
    targeterCountSamples: 0,
    targeterCountTotal: 0,
    targeterCountMax: 0
  }
}

/**
 * Manages clustered NPC behavior to improve performance and gameplay experience.
 *
 * When many NPCs bunch together:
 * - Applies spacing forces to spread them out
 * - Distributes targets so not everyone shoots the same enemy
 * - Staggers reaction times to prevent synchronized behavior
 * - Simplifies AI decisions for performance
 */
export class ClusterManager {
  // Configuration
  private readonly MIN_FRIENDLY_SPACING = 4.0      // Minimum meters between friendlies
  private readonly SPACING_FORCE_STRENGTH = 2.5    // How strongly to push apart
  private readonly CLUSTER_RADIUS = 15.0           // Radius to check for clustering
  private readonly CLUSTER_THRESHOLD = 4           // Number of nearby friendlies to be "clustered"
  private readonly TARGET_REASSIGN_INTERVAL = 2000 // ms between target distribution checks
  private readonly TARGET_STICKINESS_MS = 500      // Minimum time to hold a still-valid distributed target

  // Scratch vectors to avoid allocations
  private readonly scratchVec1 = new THREE.Vector3()
  private readonly scratchVec2 = new THREE.Vector3()
  private readonly scratchVec3 = new THREE.Vector3()

  // Target assignment tracking - which enemies are being targeted by how many
  private targetCounts: Map<string, number> = new Map()
  private lastAssignedTargetByCombatant: Map<string, string> = new Map()
  private lastAssignedAtByCombatant: Map<string, number> = new Map()
  private lastTargetDistribution = 0
  private telemetry: TargetDistributionTelemetry = createTargetDistributionTelemetry()

  /**
   * Calculate spacing force to push combatant away from nearby friendlies.
   * Returns a velocity offset to apply during movement.
   * Uses spatial grid for O(log n) instead of O(n) complexity.
   */
  calculateSpacingForce(
    combatant: Combatant,
    allCombatants: Map<string, Combatant>,
    spatialGrid: SpatialGridManager,
    outputVector?: THREE.Vector3
  ): THREE.Vector3 {
    const force = outputVector || this.scratchVec1
    force.set(0, 0, 0)
    let nearbyCount = 0

    // Use spatial grid to find only nearby combatants within spacing radius
    const nearbyIds = spatialGrid.queryRadius(combatant.position, this.MIN_FRIENDLY_SPACING)

    for (const id of nearbyIds) {
      if (id === combatant.id) continue

      const other = allCombatants.get(id)
      if (!other) continue
      if (other.faction !== combatant.faction) continue
      if (other.state === CombatantState.DEAD) continue

      // Use distanceToSquared for comparison (faster than distanceTo)
      const distanceSq = combatant.position.distanceToSquared(other.position)
      const minSpacingSq = this.MIN_FRIENDLY_SPACING * this.MIN_FRIENDLY_SPACING

      if (distanceSq < minSpacingSq && distanceSq > 0.01) {
        const distance = Math.sqrt(distanceSq)

        // Calculate repulsion direction (away from other)
        this.scratchVec2
          .subVectors(combatant.position, other.position)
          .normalize()

        // Stronger force when closer
        const strength = (1 - distance / this.MIN_FRIENDLY_SPACING) * this.SPACING_FORCE_STRENGTH
        force.addScaledVector(this.scratchVec2, strength)
        nearbyCount++
      }
    }

    // Normalize if multiple forces applied
    if (nearbyCount > 1) {
      force.divideScalar(nearbyCount)
    }

    return force
  }

  /**
   * Check if combatant is in a clustered situation.
   * Uses spatial grid for O(log n) instead of O(n) complexity.
   */
  isInCluster(
    combatant: Combatant,
    allCombatants: Map<string, Combatant>,
    spatialGrid: SpatialGridManager
  ): boolean {
    let nearbyFriendlies = 0
    const radiusSq = this.CLUSTER_RADIUS * this.CLUSTER_RADIUS

    // Use spatial grid to find only nearby combatants within cluster radius
    const nearbyIds = spatialGrid.queryRadius(combatant.position, this.CLUSTER_RADIUS)

    for (const id of nearbyIds) {
      if (id === combatant.id) continue

      const other = allCombatants.get(id)
      if (!other) continue
      if (other.faction !== combatant.faction) continue
      if (other.state === CombatantState.DEAD) continue

      // Use distanceToSquared for faster comparison
      const distanceSq = combatant.position.distanceToSquared(other.position)
      if (distanceSq < radiusSq) {
        nearbyFriendlies++
        // Early exit if we've found enough friendlies
        if (nearbyFriendlies >= this.CLUSTER_THRESHOLD) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Get cluster density (0-1) for performance scaling.
   * Higher density = more NPCs nearby = should simplify AI.
   * Uses spatial grid for O(log n) instead of O(n) complexity.
   */
  getClusterDensity(
    combatant: Combatant,
    allCombatants: Map<string, Combatant>,
    spatialGrid: SpatialGridManager
  ): number {
    let nearbyCount = 0
    const maxExpected = 10 // Normalize against this
    const radiusSq = this.CLUSTER_RADIUS * this.CLUSTER_RADIUS

    // Use spatial grid to find only nearby combatants within cluster radius
    const nearbyIds = spatialGrid.queryRadius(combatant.position, this.CLUSTER_RADIUS)

    for (const id of nearbyIds) {
      if (id === combatant.id) continue

      const other = allCombatants.get(id)
      if (!other) continue
      if (other.state === CombatantState.DEAD) continue

      // Use distanceToSquared for faster comparison
      const distanceSq = combatant.position.distanceToSquared(other.position)
      if (distanceSq < radiusSq) {
        nearbyCount++
      }
    }

    return Math.min(1, nearbyCount / maxExpected)
  }

  /**
   * Get a staggered reaction delay based on cluster density.
   * In clusters, NPCs react with more varied timing.
   */
  getStaggeredReactionDelay(baseDelayMs: number, clusterDensity: number): number {
    // Add 0-500ms random delay based on cluster density
    const maxExtraDelay = 500 * clusterDensity
    const extraDelay = Math.random() * maxExtraDelay
    return baseDelayMs + extraDelay
  }

  /**
   * Distribute targets among clustered friendlies.
   * Prevents everyone from shooting the same enemy.
   */
  assignDistributedTarget(
    combatant: Combatant,
    potentialTargets: ITargetable[],
    allCombatants: Map<string, Combatant>
  ): ITargetable | null {
    this.telemetry.distributionCalls++
    this.telemetry.potentialTargetsTotal += potentialTargets.length

    if (potentialTargets.length === 0) {
      this.telemetry.zeroTargetCalls++
      return null
    }
    if (potentialTargets.length === 1) {
      this.telemetry.singleTargetCalls++
      this.recordTargetAssignment(combatant.id, potentialTargets[0].id, Date.now())
      return potentialTargets[0]
    }

    this.telemetry.multiTargetCalls++

    // Rebuild target counts periodically
    const now = Date.now()
    const stickyTarget = this.getStickyTarget(combatant.id, potentialTargets, now)
    if (stickyTarget) {
      this.recordTargetAssignment(combatant.id, stickyTarget.id)
      return stickyTarget
    }

    if (now - this.lastTargetDistribution > this.TARGET_REASSIGN_INTERVAL) {
      this.rebuildTargetCounts(allCombatants)
      this.lastTargetDistribution = now
      this.telemetry.targetCountRebuilds++
    }

    // Score targets - prefer less-targeted enemies
    let bestTarget: ITargetable | null = null
    let bestScore = -Infinity

    for (const target of potentialTargets) {
      const targetId = target.id
      const currentTargeters = this.targetCounts.get(targetId) || 0
      const distance = combatant.position.distanceTo(target.position)
      this.telemetry.targeterCountSamples++
      this.telemetry.targeterCountTotal += currentTargeters
      this.telemetry.targeterCountMax = Math.max(this.telemetry.targeterCountMax, currentTargeters)

      // Score: prefer closer targets with fewer attackers
      // Lower targeter count = higher score
      // Closer distance = higher score
      const targeterPenalty = currentTargeters * 20 // Each existing targeter reduces score
      const distanceScore = 150 - distance // Closer is better (assuming 150m max range)

      const score = distanceScore - targeterPenalty + Math.random() * 10 // Small randomness

      if (score > bestScore) {
        bestScore = score
        bestTarget = target
      }
    }

    // Register this combatant's target choice
    if (bestTarget) {
      const count = this.targetCounts.get(bestTarget.id) || 0
      this.targetCounts.set(bestTarget.id, count + 1)
      this.recordTargetAssignment(combatant.id, bestTarget.id, now)
    }

    return bestTarget
  }

  /**
   * Rebuild the target count map from current combatant targets
   */
  private rebuildTargetCounts(allCombatants: Map<string, Combatant>): void {
    this.targetCounts.clear()

    allCombatants.forEach(combatant => {
      if (combatant.state === CombatantState.DEAD) return
      if (!combatant.target) return

      const targetId = combatant.target.id
      const count = this.targetCounts.get(targetId) || 0
      this.targetCounts.set(targetId, count + 1)
    })
  }

  /**
   * Should this combatant skip complex LOS checks? (performance optimization)
   * In dense clusters, simplify AI to maintain framerate.
   */
  shouldSimplifyAI(clusterDensity: number): boolean {
    // Above 50% cluster density, start simplifying
    // Use probability so not all NPCs simplify at once
    if (clusterDensity > 0.5) {
      return Math.random() < (clusterDensity - 0.5) * 2 // 0-100% chance
    }
    return false
  }

  /**
   * Get spread-out defense positions around a zone center.
   * Prevents all defenders from clumping at same spot.
   */
  getSpreadDefensePosition(
    zoneCenter: THREE.Vector3,
    zoneRadius: number,
    defenderIndex: number,
    totalDefenders: number
  ): THREE.Vector3 {
    // Distribute defenders in a circle around the zone perimeter
    const perimeterRadius = zoneRadius + 8 // Stand just outside capture radius
    const angleOffset = Math.PI / 6 // Slight offset so not perfectly symmetric
    const angle = (defenderIndex / Math.max(totalDefenders, 4)) * Math.PI * 2 + angleOffset

    return new THREE.Vector3(
      zoneCenter.x + Math.cos(angle) * perimeterRadius,
      zoneCenter.y,
      zoneCenter.z + Math.sin(angle) * perimeterRadius
    )
  }

  /**
   * Clear target tracking (call on match reset)
   */
  reset(): void {
    this.targetCounts.clear()
    this.lastAssignedTargetByCombatant.clear()
    this.lastAssignedAtByCombatant.clear()
    this.lastTargetDistribution = 0
    this.telemetry = createTargetDistributionTelemetry()
  }

  getTargetDistributionTelemetry(): TargetDistributionTelemetry {
    return { ...this.telemetry }
  }

  private getStickyTarget(combatantId: string, potentialTargets: ITargetable[], now: number): ITargetable | null {
    const previousTargetId = this.lastAssignedTargetByCombatant.get(combatantId)
    const assignedAt = this.lastAssignedAtByCombatant.get(combatantId)
    if (!previousTargetId || assignedAt === undefined || now - assignedAt >= this.TARGET_STICKINESS_MS) {
      return null
    }
    return potentialTargets.find(target => target.id === previousTargetId) ?? null
  }

  private recordTargetAssignment(combatantId: string, targetId: string, assignedAtMs?: number): void {
    const previousTarget = this.lastAssignedTargetByCombatant.get(combatantId)
    if (previousTarget && previousTarget !== targetId) {
      this.telemetry.assignmentChurn++
    }
    this.lastAssignedTargetByCombatant.set(combatantId, targetId)
    if (assignedAtMs !== undefined || !this.lastAssignedAtByCombatant.has(combatantId)) {
      this.lastAssignedAtByCombatant.set(combatantId, assignedAtMs ?? Date.now())
    }
    this.telemetry.assignments++
  }
}

// Export singleton instance
export const clusterManager = new ClusterManager()
