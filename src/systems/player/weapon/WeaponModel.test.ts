// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { WeaponModel } from './WeaponModel'
import type { WeaponRigManager } from './WeaponRigManager'
import type { WeaponAnimations } from './WeaponAnimations'
import type { WeaponReload } from './WeaponReload'

function createModel(): WeaponModel {
  const animations = {
    getADSProgress: vi.fn(() => 0),
    getBasePosition: vi.fn(() => ({ x: 0.5, y: -0.45, z: -0.75 })),
    getADSPosition: vi.fn(() => ({ x: 0, y: -0.18, z: -0.55 })),
    getRecoilOffset: vi.fn(() => ({ x: 0, y: 0, z: 0, rotX: 0 })),
    getBobOffset: vi.fn(() => ({ x: 0, y: 0 })),
    getSwayOffset: vi.fn(() => ({ x: 0, y: 0 })),
  } as unknown as WeaponAnimations

  const reload = {
    getReloadTranslation: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
    getReloadRotation: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
  } as unknown as WeaponReload

  return new WeaponModel(animations, reload)
}

describe('WeaponModel', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      innerWidth: 1600,
      innerHeight: 900,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opts the overlay scene out of automatic full-scene matrix walks', () => {
    const model = createModel()

    expect(model.getWeaponScene().matrixWorldAutoUpdate).toBe(false)

    model.dispose()
  })

  it('updates the active rig world matrix after applying viewmodel transforms', () => {
    const model = createModel()
    const rig = new THREE.Group()
    const updateMatrixWorld = vi.spyOn(rig, 'updateMatrixWorld')
    const rigManager = {
      getCurrentRig: vi.fn(() => rig),
      getSwitchOffset: vi.fn(() => ({ y: 0, rotX: 0 })),
    } as unknown as WeaponRigManager

    model.updateTransform(rigManager)

    expect(updateMatrixWorld).toHaveBeenCalledWith(true)
    model.dispose()
  })

  it('updates only the active visible rig before rendering the overlay', () => {
    const model = createModel()
    const rig = new THREE.Group()
    const updateMatrixWorld = vi.spyOn(rig, 'updateMatrixWorld')
    const rigManager = {
      getCurrentRig: vi.fn(() => rig),
    } as unknown as WeaponRigManager
    const renderer = {
      autoClear: true,
      clearDepth: vi.fn(),
      render: vi.fn(),
    } as unknown as THREE.WebGLRenderer

    model.render(renderer, rigManager)

    expect(updateMatrixWorld).toHaveBeenCalledWith(true)
    expect(renderer.clearDepth).toHaveBeenCalledOnce()
    expect(renderer.render).toHaveBeenCalledWith(model.getWeaponScene(), model.getWeaponCamera())
    expect(renderer.autoClear).toBe(true)
    model.dispose()
  })

  it('does not repeat the active rig matrix walk after updateTransform already refreshed it', () => {
    const model = createModel()
    const rig = new THREE.Group()
    const updateMatrixWorld = vi.spyOn(rig, 'updateMatrixWorld')
    const rigManager = {
      getCurrentRig: vi.fn(() => rig),
      getSwitchOffset: vi.fn(() => ({ y: 0, rotX: 0 })),
    } as unknown as WeaponRigManager
    const renderer = {
      autoClear: true,
      clearDepth: vi.fn(),
      render: vi.fn(),
    } as unknown as THREE.WebGLRenderer

    model.updateTransform(rigManager)
    updateMatrixWorld.mockClear()

    model.render(renderer, rigManager)

    expect(updateMatrixWorld).not.toHaveBeenCalled()
    expect(renderer.render).toHaveBeenCalledWith(model.getWeaponScene(), model.getWeaponCamera())
    model.dispose()
  })
})
