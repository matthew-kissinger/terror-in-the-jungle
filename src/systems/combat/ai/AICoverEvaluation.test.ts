// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { objectPool } from '../../../utils/ObjectPoolManager'
import { evaluateCoverQuality, evaluateSandbagCover } from './AICoverEvaluation'
import type { CoverSpot } from './AICoverSystem'
import type { SandbagSystem } from '../../weapons/SandbagSystem'

function makeSandbagSystem(bounds: THREE.Box3[]): SandbagSystem {
  return {
    getSandbagBounds: vi.fn(() => bounds),
  } as unknown as SandbagSystem
}

describe('AICoverEvaluation', () => {
  it('keeps sandbag search radius boundary inclusive without exact distance checks', () => {
    const sandbag = new THREE.Box3(
      new THREE.Vector3(4, -1, -1),
      new THREE.Vector3(6, 1, 1)
    )
    const combatantPos = new THREE.Vector3(0, 0, 0)
    const exactDistanceSpy = vi.spyOn(combatantPos, 'distanceTo')

    const spots = evaluateSandbagCover(
      makeSandbagSystem([sandbag]),
      combatantPos,
      new THREE.Vector3(10, 0, 0),
      5
    )

    expect(exactDistanceSpy).not.toHaveBeenCalled()
    expect(spots).toHaveLength(1)
    expect(spots[0].position.x).toBeCloseTo(3.65, 2)
    objectPool.releaseVector3(spots[0].position)
  })

  it('rejects sandbags outside the search radius without exact distance checks', () => {
    const sandbag = new THREE.Box3(
      new THREE.Vector3(39, -1, -1),
      new THREE.Vector3(41, 1, 1)
    )
    const combatantPos = new THREE.Vector3(0, 0, 0)
    const exactDistanceSpy = vi.spyOn(combatantPos, 'distanceTo')

    const spots = evaluateSandbagCover(
      makeSandbagSystem([sandbag]),
      combatantPos,
      new THREE.Vector3(10, 0, 0),
      30
    )

    expect(exactDistanceSpy).not.toHaveBeenCalled()
    expect(spots).toHaveLength(0)
  })

  it('scores threat-distance buckets without calling Vector3.distanceTo', () => {
    const spot: CoverSpot = {
      position: new THREE.Vector3(30, 0, 0),
      score: 0,
      coverType: 'terrain',
      height: 1.5,
      lastEvaluatedTime: 0,
    }
    const exactThreatDistanceSpy = vi.spyOn(spot.position, 'distanceTo')

    const score = evaluateCoverQuality(
      spot,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
      10
    )

    expect(score).toBeGreaterThan(0)
    expect(exactThreatDistanceSpy).not.toHaveBeenCalled()
  })
})
