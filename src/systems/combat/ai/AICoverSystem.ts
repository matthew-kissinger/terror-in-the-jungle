import * as THREE from 'three'
import { Combatant, CombatantState, Faction } from '../types'
import { ImprovedChunkManager } from '../../terrain/ImprovedChunkManager'
import { SandbagSystem } from '../../weapons/SandbagSystem'
import { objectPool } from '../../../utils/ObjectPoolManager'
import { getHeightQueryCache } from '../../terrain/HeightQueryCache'

/**
 * Cover position with quality score and metadata
 */
export interface CoverSpot {
  position: THREE.Vector3
  score: number
  coverType: 'sandbag' | 'terrain' | 'vegetation'
  height: number
  occupiedBy?: string  // combatant ID
  lastEvaluatedTime: number
}

/**
 * Cached cover data per chunk
 */
interface ChunkCoverCache {
  spots: CoverSpot[]
  lastUpdated: number
}

/**
 * Advanced cover evaluation system for AI tactical behavior
 *
 * Evaluates cover quality based on:
 * - Direction to threat (cover should be between AI and threat)
 * - Height difference (elevated positions preferred)
 * - Angle of exposure (how exposed AI is from cover)
 * - Distance to reach cover
 * - Occupation status (don't stack AI on same cover)
 */
export class AICoverSystem {
  private chunkManager?: ImprovedChunkManager
  private sandbagSystem?: SandbagSystem

  // Cache cover spots per chunk key (x_z)
  private coverCache: Map<string, ChunkCoverCache> = new Map()
  private readonly CACHE_TTL_MS = 5000  // Re-evaluate every 5 seconds
  private readonly MAX_COVER_SPOTS_PER_CHUNK = 8
  private readonly CHUNK_SIZE = 32

  // Cover occupation tracking
  private coverOccupation: Map<string, string> = new Map()  // coverKey -> combatantId

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.sandbagSystem = sandbagSystem
  }

  /**
   * Find the best cover position for a combatant given a threat
   */
  findBestCover(
    combatant: Combatant,
    threatPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    maxSearchRadius: number = 30
  ): CoverSpot | null {
    const now = Date.now()
    const candidates: CoverSpot[] = []

    // Get chunks to search
    const chunkKeys = this.getChunksInRadius(combatant.position, maxSearchRadius)

    for (const chunkKey of chunkKeys) {
      const cachedSpots = this.getCachedCoverSpots(chunkKey, combatant.position)
      candidates.push(...cachedSpots)
    }

    // Also add dynamically placed sandbags
    if (this.sandbagSystem) {
      const sandbagSpots = this.evaluateSandbagCover(combatant.position, threatPosition, maxSearchRadius)
      candidates.push(...sandbagSpots)
    }

    // Filter and score candidates
    let bestSpot: CoverSpot | null = null
    let bestScore = -Infinity

    for (const spot of candidates) {
      // Skip if too far
      const distanceToCover = combatant.position.distanceTo(spot.position)
      if (distanceToCover > maxSearchRadius) continue

      // Skip if occupied by someone else
      const coverKey = this.getCoverKey(spot.position)
      const occupantId = this.coverOccupation.get(coverKey)
      if (occupantId && occupantId !== combatant.id) {
        // Check if occupant is still alive and using this cover
        const occupant = allCombatants.get(occupantId)
        if (occupant && occupant.state !== CombatantState.DEAD && occupant.inCover) {
          continue
        } else {
          // Clear stale occupation
          this.coverOccupation.delete(coverKey)
        }
      }

      // Evaluate cover quality against threat
      const score = this.evaluateCoverQuality(
        spot,
        combatant.position,
        threatPosition,
        distanceToCover
      )

      if (score > bestScore) {
        bestScore = score
        bestSpot = spot
      }
    }

    return bestSpot
  }

  /**
   * Claim a cover spot for a combatant
   */
  claimCover(combatant: Combatant, coverPosition: THREE.Vector3): void {
    const coverKey = this.getCoverKey(coverPosition)

    // Release any previous cover
    this.releaseCover(combatant.id)

    // Claim new cover
    this.coverOccupation.set(coverKey, combatant.id)
  }

  /**
   * Release cover claimed by a combatant
   */
  releaseCover(combatantId: string): void {
    for (const [key, occupantId] of this.coverOccupation.entries()) {
      if (occupantId === combatantId) {
        this.coverOccupation.delete(key)
        break
      }
    }
  }

  /**
   * Check if cover position is flanked by threat
   */
  isCoverFlanked(
    coverPosition: THREE.Vector3,
    combatantPosition: THREE.Vector3,
    threatPosition: THREE.Vector3
  ): boolean {
    // Calculate angles
    const coverToThreat = objectPool.getVector3()
    coverToThreat.subVectors(threatPosition, coverPosition)

    const coverToCombatant = objectPool.getVector3()
    coverToCombatant.subVectors(combatantPosition, coverPosition)

    // If the dot product is positive, the threat is on the same side
    // of the cover as the combatant - cover is flanked
    const dotProduct = coverToThreat.normalize().dot(coverToCombatant.normalize())

    objectPool.releaseVector3(coverToThreat)
    objectPool.releaseVector3(coverToCombatant)

    // Flanked if threat and combatant on same side of cover (dot > 0.3)
    return dotProduct > 0.3
  }

  /**
   * Evaluate if current cover is still effective
   */
  evaluateCurrentCover(
    combatant: Combatant,
    threatPosition: THREE.Vector3
  ): { effective: boolean; shouldReposition: boolean; newCover?: CoverSpot } {
    if (!combatant.coverPosition || !combatant.inCover) {
      return { effective: false, shouldReposition: false }
    }

    // Check if flanked
    if (this.isCoverFlanked(combatant.coverPosition, combatant.position, threatPosition)) {
      return {
        effective: false,
        shouldReposition: true
      }
    }

    // Check if threat has moved significantly
    const distanceToThreat = combatant.position.distanceTo(threatPosition)
    const distanceFromCoverToThreat = combatant.coverPosition.distanceTo(threatPosition)

    // If threat is closer to cover than we are to cover, reposition
    if (distanceFromCoverToThreat < combatant.position.distanceTo(combatant.coverPosition)) {
      return { effective: false, shouldReposition: true }
    }

    return { effective: true, shouldReposition: false }
  }

  /**
   * Get cover quality score for a position (0-1)
   */
  getCoverQuality(coverPosition: THREE.Vector3, threatPosition: THREE.Vector3): number {
    if (!this.chunkManager) return 0.5

    const coverHeight = getHeightQueryCache().getHeightAt(coverPosition.x, coverPosition.z)
    const threatHeight = getHeightQueryCache().getHeightAt(threatPosition.x, threatPosition.z)

    // Height advantage score
    const heightAdvantage = Math.max(0, Math.min(1, (coverHeight - threatHeight) / 5))

    // Distance score (prefer medium distance)
    const distance = coverPosition.distanceTo(threatPosition)
    const distanceScore = distance > 15 && distance < 60 ? 1.0 : 0.5

    return (heightAdvantage + distanceScore) / 2
  }

  // Private methods

  private getChunksInRadius(center: THREE.Vector3, radius: number): string[] {
    const keys: string[] = []
    const chunkRadius = Math.ceil(radius / this.CHUNK_SIZE)
    const centerChunkX = Math.floor(center.x / this.CHUNK_SIZE)
    const centerChunkZ = Math.floor(center.z / this.CHUNK_SIZE)

    for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
      for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
        keys.push(`${centerChunkX + dx}_${centerChunkZ + dz}`)
      }
    }

    return keys
  }

  private getCachedCoverSpots(chunkKey: string, searchOrigin: THREE.Vector3): CoverSpot[] {
    const now = Date.now()
    const cached = this.coverCache.get(chunkKey)

    if (cached && (now - cached.lastUpdated) < this.CACHE_TTL_MS) {
      return cached.spots
    }

    // Generate new cover spots for this chunk
    const spots = this.generateCoverSpotsForChunk(chunkKey)
    this.coverCache.set(chunkKey, {
      spots,
      lastUpdated: now
    })

    return spots
  }

  private generateCoverSpotsForChunk(chunkKey: string): CoverSpot[] {
    if (!this.chunkManager) return []

    const spots: CoverSpot[] = []
    const now = Date.now()
    const [chunkXStr, chunkZStr] = chunkKey.split('_')
    const chunkX = parseInt(chunkXStr) * this.CHUNK_SIZE
    const chunkZ = parseInt(chunkZStr) * this.CHUNK_SIZE

    // Sample terrain for height variations
    const SAMPLE_STEP = 8

    for (let x = 0; x < this.CHUNK_SIZE; x += SAMPLE_STEP) {
      for (let z = 0; z < this.CHUNK_SIZE; z += SAMPLE_STEP) {
        const worldX = chunkX + x
        const worldZ = chunkZ + z

        const height = getHeightQueryCache().getHeightAt(worldX, worldZ)

        // Check surrounding heights for elevation changes
        const heights = [
          getHeightQueryCache().getHeightAt(worldX + 3, worldZ),
          getHeightQueryCache().getHeightAt(worldX - 3, worldZ),
          getHeightQueryCache().getHeightAt(worldX, worldZ + 3),
          getHeightQueryCache().getHeightAt(worldX, worldZ - 3)
        ]

        const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length
        const heightVariation = height - avgHeight

        // Elevated positions (ridges, hills) make good cover
        if (heightVariation > 1.5) {
          spots.push({
            position: new THREE.Vector3(worldX, height, worldZ),
            score: 0,  // Will be calculated when evaluating
            coverType: 'terrain',
            height: heightVariation,
            lastEvaluatedTime: now
          })
        }

        // Depressions can also provide cover
        if (heightVariation < -1.5) {
          spots.push({
            position: new THREE.Vector3(worldX, height, worldZ),
            score: 0,
            coverType: 'terrain',
            height: Math.abs(heightVariation),
            lastEvaluatedTime: now
          })
        }
      }
    }

    // Limit spots per chunk
    if (spots.length > this.MAX_COVER_SPOTS_PER_CHUNK) {
      spots.sort((a, b) => b.height - a.height)
      spots.length = this.MAX_COVER_SPOTS_PER_CHUNK
    }

    return spots
  }

  private evaluateSandbagCover(
    combatantPos: THREE.Vector3,
    threatPos: THREE.Vector3,
    maxRadius: number
  ): CoverSpot[] {
    if (!this.sandbagSystem) return []

    const spots: CoverSpot[] = []
    const now = Date.now()
    const sandbagBounds = this.sandbagSystem.getSandbagBounds()

    for (const bounds of sandbagBounds) {
      const center = new THREE.Vector3()
      bounds.getCenter(center)

      if (combatantPos.distanceTo(center) > maxRadius) continue

      // Position behind sandbag relative to threat
      const threatToSandbag = new THREE.Vector3()
        .subVectors(center, threatPos)
        .normalize()

      const coverPos = center.clone().add(threatToSandbag.multiplyScalar(2))

      spots.push({
        position: coverPos,
        score: 0,
        coverType: 'sandbag',
        height: 1.2,  // Standard sandbag height
        lastEvaluatedTime: now
      })
    }

    return spots
  }

  private evaluateCoverQuality(
    spot: CoverSpot,
    combatantPos: THREE.Vector3,
    threatPos: THREE.Vector3,
    distanceToCover: number
  ): number {
    let score = 0

    // 1. Distance penalty - prefer closer cover
    const distanceScore = Math.max(0, 1 - distanceToCover / 30)
    score += distanceScore * 25

    // 2. Cover height bonus
    const heightScore = Math.min(1, spot.height / 3)
    score += heightScore * 20

    // 3. Angle of protection
    // Cover should be between combatant's current position and threat
    const coverToThreat = new THREE.Vector3().subVectors(threatPos, spot.position)
    const coverToCombatant = new THREE.Vector3().subVectors(combatantPos, spot.position)

    // Normalize and compute dot product
    coverToThreat.normalize()
    coverToCombatant.normalize()

    // Negative dot = cover is between combatant and threat (good)
    // Positive dot = combatant would be exposed (bad)
    const protectionAngle = -coverToThreat.dot(coverToCombatant)
    const angleScore = (protectionAngle + 1) / 2  // Map -1..1 to 0..1
    score += angleScore * 30

    // 4. Distance from threat (medium range preferred)
    const threatDistance = spot.position.distanceTo(threatPos)
    let threatDistanceScore = 0
    if (threatDistance > 20 && threatDistance < 50) {
      threatDistanceScore = 1.0
    } else if (threatDistance >= 10 && threatDistance <= 70) {
      threatDistanceScore = 0.5
    }
    score += threatDistanceScore * 15

    // 5. Cover type bonus
    if (spot.coverType === 'sandbag') {
      score += 10  // Sandbags are best cover
    } else if (spot.coverType === 'terrain') {
      score += 5
    }

    return score
  }

  private getCoverKey(position: THREE.Vector3): string {
    // Round to 2m grid for cover occupation tracking
    const x = Math.floor(position.x / 2) * 2
    const z = Math.floor(position.z / 2) * 2
    return `${x}_${z}`
  }

  /**
   * Clean up stale occupation entries
   */
  cleanupOccupation(allCombatants: Map<string, Combatant>): void {
    for (const [key, combatantId] of this.coverOccupation.entries()) {
      const combatant = allCombatants.get(combatantId)
      if (!combatant || combatant.state === CombatantState.DEAD || !combatant.inCover) {
        this.coverOccupation.delete(key)
      }
    }
  }

  /**
   * Clear all caches (call on game reset)
   */
  dispose(): void {
    this.coverCache.clear()
    this.coverOccupation.clear()
  }
}
