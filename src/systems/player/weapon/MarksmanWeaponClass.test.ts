// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { WeaponRigManager } from './WeaponRigManager'
import { WeaponAnimations } from './WeaponAnimations'
import {
  getLoadoutPoolForFaction,
  LoadoutWeapon,
} from '../../../ui/loadout/LoadoutTypes'
import { Faction } from '../../combat/types'

// The marksman/DMR class wired in cycle-2026-06-28-arsenal-expansion. These are
// behavior tests: they assert what the weapon class DOES from a caller's
// perspective (who can pick it, how it shoots vs the rifle, that ADS reads
// distinct, that you can actually switch to it) — not the raw tuning constants.

// --- Pure-data assertions: faction availability (no mocks needed) ----------

describe('marksman class faction availability', () => {
  it('is offered to OPFOR (NVA and VC) in the deploy pool', () => {
    expect(getLoadoutPoolForFaction(Faction.NVA).weapons).toContain(LoadoutWeapon.MARKSMAN)
    expect(getLoadoutPoolForFaction(Faction.VC).weapons).toContain(LoadoutWeapon.MARKSMAN)
  })

  it('is NOT offered to BLUFOR (US and ARVN)', () => {
    expect(getLoadoutPoolForFaction(Faction.US).weapons).not.toContain(LoadoutWeapon.MARKSMAN)
    expect(getLoadoutPoolForFaction(Faction.ARVN).weapons).not.toContain(LoadoutWeapon.MARKSMAN)
  })

  it('exposes at least one preset that deploys the marksman as the primary', () => {
    const nvaHasMarksmanPreset = getLoadoutPoolForFaction(Faction.NVA)
      .presetTemplates.some(t => t.loadout.primaryWeapon === LoadoutWeapon.MARKSMAN)
    expect(nvaHasMarksmanPreset).toBe(true)
  })
})

// --- ADS: the marksman reads distinct from the shared rifle default --------

describe('marksman ADS resolves distinct from the rifle default', () => {
  let animations: WeaponAnimations

  beforeEach(() => {
    animations = new WeaponAnimations(new THREE.PerspectiveCamera(75, 1, 0.1, 1000))
  })

  it('uses a different sight-line offset than the iron-sight default', () => {
    const marksman = animations.getADSPosition('marksman')
    const rifleDefault = animations.getADSPosition('rifle')
    expect(marksman).not.toEqual(rifleDefault)
  })

  it('zooms DEEPER (tighter FOV) than the shared iron-sight zoom', () => {
    // A larger divisor means the ADS target FOV is smaller, i.e. more zoom.
    const marksmanDivisor = animations.getADSFovDivisor('marksman')
    const defaultDivisor = animations.getADSFovDivisor('rifle')
    expect(marksmanDivisor).toBeGreaterThan(defaultDivisor)
  })
})

// --- Cores + switchability: needs the WeaponRigManager harness mocks --------

vi.mock('../../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../assets/ModelLoader', () => {
  const THREE = require('three')
  return {
    modelLoader: {
      loadModel: vi.fn(async () => {
        const group = new THREE.Group()
        const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; group.add(muzzle)
        const magazine = new THREE.Object3D(); magazine.name = 'magazine'; group.add(magazine)
        return group
      }),
    },
  }
})

vi.mock('../../assets/modelPaths', () => ({
  WeaponModels: {
    M16A1: 'weapons/m16a1.glb', AK47: 'weapons/ak47.glb', ITHACA37: 'weapons/ithaca37.glb',
    M3_GREASE_GUN: 'weapons/m3-grease-gun.glb', M1911: 'weapons/m1911.glb',
    M60: 'weapons/m60.glb', M79: 'weapons/m79.glb', DRAGUNOV_SVD: 'weapons/dragunov-svd.glb',
    M16A1_2: 'weapons/kiln/m16a1-2.glb', AK_47: 'weapons/kiln/ak-47.glb',
    ITHACA_37_PUMP_ACTION: 'weapons/kiln/ithaca-37.glb', M3A1_GREASE_GUN: 'weapons/kiln/m3a1.glb',
    M1911A1_COLT: 'weapons/kiln/m1911a1.glb', M60_PIG_GENERAL_PURPOSE: 'weapons/kiln/m60.glb',
    M79_THUMPER_40MM_GRENADE: 'weapons/kiln/m79.glb',
    DRAGUNOV_SVD_SNIPER_RIFLE: 'weapons/kiln/dragunov-svd-sniper-rifle.glb',
    SKS: 'weapons/sks.glb', SKS_CARBINE: 'weapons/kiln/sks-carbine.glb',
  },
  // Empty catalog slice: rigs fall back to bbox markers, which is fine here —
  // these tests assert gunplay/switching behavior, not node-graph wiring.
  warAssetCatalog: {},
}))

describe('marksman gunplay vs the assault rifle', () => {
  let manager: WeaponRigManager

  beforeEach(() => {
    manager = new WeaponRigManager(new THREE.Scene())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hits harder than the rifle at close AND long range', () => {
    const rifle = manager.getRifleCore()
    const marksman = manager.getMarksmanCore()
    // Near and far body shots both favour the DMR (a precision long-range tool).
    expect(marksman.computeDamage(0, false)).toBeGreaterThan(rifle.computeDamage(0, false))
    expect(marksman.computeDamage(80, false)).toBeGreaterThan(rifle.computeDamage(80, false))
  })

  it('fires at a slower cadence than the rifle', () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    const rifle = manager.getRifleCore()
    const marksman = manager.getMarksmanCore()
    rifle.registerShot()
    marksman.registerShot()

    // 200ms later: the high-rpm rifle has cycled and can fire again; the
    // slow-cadence marksman is still in its longer between-shots interval.
    now = 200
    expect(rifle.canFire()).toBe(true)
    expect(marksman.canFire()).toBe(false)
  })

  it('can be switched to as its own runtime weapon, landing the marksman core', async () => {
    await manager.init()
    manager.startWeaponSwitch('marksman')
    // Drive the switch animation to completion.
    for (let i = 0; i < 8 && manager.isSwitching(); i++) {
      manager.updateSwitchAnimation(0.1)
    }
    expect(manager.getCurrentWeaponType()).toBe('marksman')
    expect(manager.getCurrentCore()).toBe(manager.getMarksmanCore())
  })
})
