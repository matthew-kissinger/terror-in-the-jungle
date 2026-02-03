import * as THREE from 'three'
import { Combatant } from '../types'
import { ImprovedChunkManager } from '../../terrain/ImprovedChunkManager'
import { objectPool } from '../../../utils/ObjectPoolManager'
import { getHeightQueryCache } from '../../terrain/HeightQueryCache'

// Module-level scratch vectors for tactical calculations
const _leftDir = new THREE.Vector3()
const _rightDir = new THREE.Vector3()
const _leftPos = new THREE.Vector3()
const _rightPos = new THREE.Vector3()
const _centroidCopy = new THREE.Vector3()

/**
 * Tactical resolver for flanking direction and waypoint calculations
 */
export class FlankingTacticsResolver {
  private chunkManager?: ImprovedChunkManager
  private readonly FLANK_ANGLE_DEG = 60  // Angle offset for flanking position
  private readonly FLANK_DISTANCE = 25  // Distance from target for flanking position

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager
  }

  /**
   * Choose the best flank direction based on terrain and squad position
   */
  chooseBestFlankDirection(
    squadMembers: Combatant[],
    targetPosition: THREE.Vector3
  ): 'left' | 'right' {
    if (squadMembers.length === 0) return 'left'

    // Calculate squad centroid
    const centroid = objectPool.getVector3()
    for (const member of squadMembers) {
      centroid.add(member.position)
    }
    centroid.divideScalar(squadMembers.length)

    // Get direction to target
    const toTarget = objectPool.getVector3()
    toTarget.subVectors(targetPosition, centroid).normalize()

    // Check terrain heights on both sides
    _leftDir.set(-toTarget.z, 0, toTarget.x)
    _rightDir.set(toTarget.z, 0, -toTarget.x)

    let leftScore = 0
    let rightScore = 0

    if (this.chunkManager) {
      // Sample terrain along flank routes
      for (let dist = 10; dist <= this.FLANK_DISTANCE; dist += 10) {
        _leftPos.copy(centroid).add(_centroidCopy.copy(_leftDir).multiplyScalar(dist))
        _rightPos.copy(centroid).add(_centroidCopy.copy(_rightDir).multiplyScalar(dist))

        const leftHeight = getHeightQueryCache().getHeightAt(_leftPos.x, _leftPos.z)
        const rightHeight = getHeightQueryCache().getHeightAt(_rightPos.x, _rightPos.z)

        // Prefer elevated positions
        leftScore += leftHeight
        rightScore += rightHeight
      }
    }

    objectPool.releaseVector3(centroid)
    objectPool.releaseVector3(toTarget)

    // Add some randomness to prevent predictable behavior
    leftScore += Math.random() * 5
    rightScore += Math.random() * 5

    return leftScore >= rightScore ? 'left' : 'right'
  }

  /**
   * Calculate the flanking waypoint position
   */
  calculateFlankWaypoint(
    squadPosition: THREE.Vector3,
    targetPosition: THREE.Vector3,
    flankDirection: 'left' | 'right'
  ): THREE.Vector3 {
    // Calculate flanking angle (perpendicular + offset toward target)
    const toTarget = objectPool.getVector3()
    toTarget.subVectors(targetPosition, squadPosition)
    const currentAngle = Math.atan2(toTarget.z, toTarget.x)
    objectPool.releaseVector3(toTarget)

    // Flank angle offset
    const flankAngleRad = THREE.MathUtils.degToRad(this.FLANK_ANGLE_DEG)
    const offsetAngle = flankDirection === 'left' ? flankAngleRad : -flankAngleRad
    const flankAngle = currentAngle + Math.PI + offsetAngle  // Go around to side

    // Calculate waypoint
    const waypoint = new THREE.Vector3(
      targetPosition.x + Math.cos(flankAngle) * this.FLANK_DISTANCE,
      0,
      targetPosition.z + Math.sin(flankAngle) * this.FLANK_DISTANCE
    )

    // Set terrain height
    if (this.chunkManager) {
      waypoint.y = getHeightQueryCache().getHeightAt(waypoint.x, waypoint.z)
    }

    return waypoint
  }
}
