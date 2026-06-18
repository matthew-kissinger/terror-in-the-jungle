// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three'
import { Combatant, CombatantState } from '../types'

const SUPPRESSION_TERRAIN_BLOCKED_REPATH_MS = 1500
const TERRAIN_BLOCKED_SUPPRESSION_MATCH_RADIUS_SQ = 8 * 8

export function enterSuppressionState(
  combatant: Combatant,
  targetPos: THREE.Vector3,
  burstLength: number,
  burstPauseMs: number
): void {
  combatant.lastKnownTargetPos = targetPos.clone()
  combatant.state = CombatantState.SUPPRESSING
  combatant.isFullAuto = true
  combatant.skillProfile.burstLength = burstLength
  combatant.skillProfile.burstPauseMs = burstPauseMs
  combatant.inCover = false
}

export function redirectTerrainBlockedSuppression(combatant: Combatant, targetPos: THREE.Vector3): void {
  combatant.state = CombatantState.ADVANCING
  combatant.isFullAuto = false
  combatant.currentBurst = 0
  combatant.suppressionTarget = undefined
  combatant.suppressionEndTime = undefined
  combatant.suppressionTerrainBlockedUntil = Date.now() + SUPPRESSION_TERRAIN_BLOCKED_REPATH_MS
  copyOrCloneSuppressionVector(combatant, 'suppressionTerrainBlockedPoint', targetPos)
  copyOrCloneSuppressionVector(combatant, 'destinationPoint', targetPos)
}

export function redirectRecentTerrainBlockedSuppression(combatant: Combatant, targetPos: THREE.Vector3): boolean {
  const blockedUntil = combatant.suppressionTerrainBlockedUntil
  const blockedPoint = combatant.suppressionTerrainBlockedPoint
  if (!blockedUntil || !blockedPoint) return false

  const now = Date.now()
  if (now > blockedUntil) {
    combatant.suppressionTerrainBlockedUntil = undefined
    combatant.suppressionTerrainBlockedPoint = undefined
    return false
  }
  if (blockedPoint.distanceToSquared(targetPos) > TERRAIN_BLOCKED_SUPPRESSION_MATCH_RADIUS_SQ) return false

  combatant.lastKnownTargetPos = targetPos.clone()
  combatant.state = CombatantState.ADVANCING
  combatant.isFullAuto = false
  combatant.suppressionTarget = undefined
  combatant.suppressionEndTime = undefined
  copyOrCloneSuppressionVector(combatant, 'destinationPoint', targetPos)
  return true
}

function copyOrCloneSuppressionVector(
  combatant: Combatant,
  key: 'destinationPoint' | 'suppressionTerrainBlockedPoint',
  value: THREE.Vector3
): void {
  if (combatant[key]) {
    combatant[key].copy(value)
  } else {
    combatant[key] = value.clone()
  }
}
