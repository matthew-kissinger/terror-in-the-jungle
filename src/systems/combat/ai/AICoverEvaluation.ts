import * as THREE from 'three'
import { SandbagSystem } from '../../weapons/SandbagSystem'
import { objectPool } from '../../../utils/ObjectPoolManager'
import type { CoverSpot } from './AICoverSystem'

const _coverToThreat = new THREE.Vector3()
const _coverToCombatant = new THREE.Vector3()
const _sandbagCenter = new THREE.Vector3()
const _threatToSandbag = new THREE.Vector3()
const _sandbagOffset = new THREE.Vector3()

export function evaluateSandbagCover(
  sandbagSystem: SandbagSystem | undefined,
  combatantPos: THREE.Vector3,
  threatPos: THREE.Vector3,
  maxRadius: number
): CoverSpot[] {
  if (!sandbagSystem) return []

  const spots: CoverSpot[] = []
  const now = Date.now()
  const sandbagBounds = sandbagSystem.getSandbagBounds()

  for (const bounds of sandbagBounds) {
    const center = _sandbagCenter
    bounds.getCenter(center)

    if (combatantPos.distanceTo(center) > maxRadius) continue

    // Position behind sandbag relative to threat
    const threatToSandbag = _threatToSandbag.subVectors(center, threatPos).normalize()

    const coverPos = objectPool.getVector3().copy(
      _sandbagOffset.copy(center).add(threatToSandbag.multiplyScalar(2))
    )

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

export function evaluateCoverQuality(
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
  const coverToThreat = _coverToThreat.subVectors(threatPos, spot.position)
  const coverToCombatant = _coverToCombatant.subVectors(combatantPos, spot.position)

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
