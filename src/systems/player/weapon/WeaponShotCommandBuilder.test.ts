// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { WeaponShotCommandBuilder } from './WeaponShotCommandBuilder'

describe('WeaponShotCommandBuilder', () => {
  it('reuses the same damage adapter for repeated commands from the same gun core', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.updateMatrixWorld(true)
    const gunCore = {
      getSpreadDeg: vi.fn(() => 0),
      computeShotRay: vi.fn(() => new THREE.Ray(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
      )),
      computeDamage: vi.fn((distance: number, headshot: boolean) => distance + (headshot ? 10 : 0)),
    }

    const first = WeaponShotCommandBuilder.createShotCommand(gunCore, camera, 'rifle', false, false)
    const second = WeaponShotCommandBuilder.createShotCommand(gunCore, camera, 'rifle', false, true)

    expect(second.damage).toBe(first.damage)
    expect(second.damage(15, true)).toBe(25)
    expect(gunCore.computeDamage).toHaveBeenCalledWith(15, true)
  })

  it('keeps damage adapters isolated per gun core', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.updateMatrixWorld(true)
    const makeGunCore = (baseDamage: number) => ({
      getSpreadDeg: vi.fn(() => 0),
      computeShotRay: vi.fn(() => new THREE.Ray(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
      )),
      computeDamage: vi.fn(() => baseDamage),
    })
    const rifle = makeGunCore(10)
    const smg = makeGunCore(7)

    const rifleCommand = WeaponShotCommandBuilder.createShotCommand(rifle, camera, 'rifle', false, false)
    const smgCommand = WeaponShotCommandBuilder.createShotCommand(smg, camera, 'smg', false, false)

    expect(smgCommand.damage).not.toBe(rifleCommand.damage)
    expect(rifleCommand.damage(0, false)).toBe(10)
    expect(smgCommand.damage(0, false)).toBe(7)
  })

  it('builds shotgun commands without cloning pellet direction vectors', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(1, 2, 3)
    camera.lookAt(1, 2, 2)
    camera.updateMatrixWorld(true)

    const pelletA = new THREE.Ray(
      new THREE.Vector3(1, 2, 3),
      new THREE.Vector3(0.1, 0, -1).normalize()
    )
    const pelletB = new THREE.Ray(
      new THREE.Vector3(1, 2, 3),
      new THREE.Vector3(-0.1, 0, -1).normalize()
    )
    const cloneA = vi.spyOn(pelletA.direction, 'clone')
    const cloneB = vi.spyOn(pelletB.direction, 'clone')
    const gunCore = {
      getSpreadDeg: vi.fn(() => 8),
      computePelletRays: vi.fn(() => [pelletA, pelletB]),
      computeDamage: vi.fn((distance: number) => distance),
    }

    const command = WeaponShotCommandBuilder.createShotCommand(
      gunCore,
      camera,
      'shotgun',
      true,
      false
    )

    expect(command.weaponType).toBe('shotgun')
    expect(gunCore.computePelletRays).toHaveBeenCalledWith(camera, expect.any(Array))
    expect(gunCore.getSpreadDeg).not.toHaveBeenCalled()
    expect(command.pelletRays).toHaveLength(2)
    expect(command.pelletRays![0].direction.x).toBeCloseTo(pelletA.direction.x)
    expect(command.pelletRays![1].direction.x).toBeCloseTo(pelletB.direction.x)
    expect(command.pelletRays![0].direction).not.toBe(pelletA.direction)
    expect(command.pelletRays![1].direction).not.toBe(pelletB.direction)
    expect(cloneA).not.toHaveBeenCalled()
    expect(cloneB).not.toHaveBeenCalled()
  })
})
