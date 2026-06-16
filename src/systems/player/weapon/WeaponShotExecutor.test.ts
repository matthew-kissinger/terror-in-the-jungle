// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { WeaponShotExecutor } from './WeaponShotExecutor'
import type { ShotCommand } from './ShotCommand'

function createCommand(overrides: Partial<ShotCommand> = {}): ShotCommand {
  return {
    ray: new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)),
    weaponType: 'rifle',
    damage: vi.fn().mockReturnValue(30),
    timestamp: 0,
    isADS: false,
    ...overrides,
  }
}

function createExecutor(
  handlePlayerShot: ReturnType<typeof vi.fn>,
  camera = new THREE.PerspectiveCamera()
): {
  executor: WeaponShotExecutor
  impactEffectsPool: { spawn: ReturnType<typeof vi.fn> }
  statsTracker: { addDamage: ReturnType<typeof vi.fn>; addHeadshot: ReturnType<typeof vi.fn>; updateLongestKill: ReturnType<typeof vi.fn> }
  hudSystem: { showHitMarker: ReturnType<typeof vi.fn>; spawnDamageNumber: ReturnType<typeof vi.fn> }
  audioManager: { playHitFeedback: ReturnType<typeof vi.fn> }
} {
  camera.position.set(0, 0, 0)
  const impactEffectsPool = { spawn: vi.fn() }
  const statsTracker = {
    addDamage: vi.fn(),
    addHeadshot: vi.fn(),
    updateLongestKill: vi.fn(),
  }
  const hudSystem = {
    showHitMarker: vi.fn(),
    spawnDamageNumber: vi.fn(),
  }
  const audioManager = {
    playHitFeedback: vi.fn(),
  }

  return {
    executor: new WeaponShotExecutor(
      { handlePlayerShot } as any,
      impactEffectsPool as any,
      camera,
      audioManager as any,
      statsTracker as any,
      hudSystem as any
    ),
    impactEffectsPool,
    statsTracker,
    hudSystem,
    audioManager,
  }
}

describe('WeaponShotExecutor', () => {
  it('uses one camera distance for kill stats and the returned single-shot result', () => {
    const hitPoint = new THREE.Vector3(0, 0, -32)
    const handlePlayerShot = vi.fn().mockReturnValue({
      hit: true,
      point: hitPoint,
      damage: 30,
      killed: true,
      headshot: true,
    })
    const camera = new THREE.PerspectiveCamera()
    const distanceSpy = vi.spyOn(camera.position, 'distanceTo')
    const { executor, statsTracker } = createExecutor(handlePlayerShot, camera)

    const result = executor.executeSingleShot(createCommand())

    expect(distanceSpy).toHaveBeenCalledTimes(1)
    expect(result.distance).toBeCloseTo(32)
    expect(statsTracker.updateLongestKill).toHaveBeenCalledWith(result.distance)
    expect(statsTracker.addDamage).toHaveBeenCalledWith(30)
    expect(statsTracker.addHeadshot).toHaveBeenCalled()
  })

  it('uses one camera distance for a miss result', () => {
    const missPoint = new THREE.Vector3(0, 0, -80)
    const handlePlayerShot = vi.fn().mockReturnValue({
      hit: false,
      point: missPoint,
      damage: 0,
      killed: false,
      headshot: false,
    })
    const camera = new THREE.PerspectiveCamera()
    const distanceSpy = vi.spyOn(camera.position, 'distanceTo')
    const { executor, impactEffectsPool, statsTracker } = createExecutor(handlePlayerShot, camera)

    const result = executor.executeSingleShot(createCommand())

    expect(distanceSpy).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      hit: false,
      killed: false,
      headshot: false,
      damageDealt: 0,
      distance: 80,
    })
    expect(impactEffectsPool.spawn).not.toHaveBeenCalled()
    expect(statsTracker.addDamage).not.toHaveBeenCalled()
  })

  it('uses the selected best-hit distance for shotgun stats and result', () => {
    const firstHit = new THREE.Vector3(0, 0, -12)
    const killHit = new THREE.Vector3(0, 0, -28)
    const handlePlayerShot = vi.fn()
      .mockReturnValueOnce({
        hit: true,
        point: firstHit,
        damage: 8,
        killed: false,
        headshot: false,
      })
      .mockReturnValueOnce({
        hit: true,
        point: killHit,
        damage: 12,
        killed: true,
        headshot: false,
      })
    const camera = new THREE.PerspectiveCamera()
    const distanceSpy = vi.spyOn(camera.position, 'distanceTo')
    const { executor, statsTracker } = createExecutor(handlePlayerShot, camera)
    const command = createCommand({
      weaponType: 'shotgun',
      pelletRays: [
        new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0.1, 0, -1).normalize()),
        new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(-0.1, 0, -1).normalize()),
      ],
    })

    const result = executor.executeShotgunShot(command)

    expect(distanceSpy).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      hit: true,
      killed: true,
      damageDealt: 20,
      distance: 28,
    })
    expect(statsTracker.updateLongestKill).toHaveBeenCalledWith(result.distance)
  })
})
