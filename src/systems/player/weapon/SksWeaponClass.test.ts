// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { WeaponRigManager } from './WeaponRigManager'
import {
  getLoadoutPoolForFaction,
  LoadoutWeapon,
} from '../../../ui/loadout/LoadoutTypes'
import { Faction } from '../../combat/types'

// The SKS semi-auto OPFOR rifle wired in cycle-2026-06-28-arsenal-expansion.
// These are behavior tests: they assert what the weapon class DOES from a
// caller's perspective (who can pick it, that it shoots distinctly from BOTH the
// AK assault rifle and the marksman DMR, that you can actually switch to it) —
// not the raw tuning constants.

// --- Pure-data assertions: faction availability (no mocks needed) ----------

describe('SKS class faction availability', () => {
  it('is offered to OPFOR (NVA and VC) in the deploy pool', () => {
    expect(getLoadoutPoolForFaction(Faction.NVA).weapons).toContain(LoadoutWeapon.SKS)
    expect(getLoadoutPoolForFaction(Faction.VC).weapons).toContain(LoadoutWeapon.SKS)
  })

  it('is NOT offered to BLUFOR (US and ARVN)', () => {
    expect(getLoadoutPoolForFaction(Faction.US).weapons).not.toContain(LoadoutWeapon.SKS)
    expect(getLoadoutPoolForFaction(Faction.ARVN).weapons).not.toContain(LoadoutWeapon.SKS)
  })

  it('exposes at least one preset that deploys the SKS as the primary', () => {
    const nvaHasSksPreset = getLoadoutPoolForFaction(Faction.NVA)
      .presetTemplates.some(t => t.loadout.primaryWeapon === LoadoutWeapon.SKS)
    const vcHasSksPreset = getLoadoutPoolForFaction(Faction.VC)
      .presetTemplates.some(t => t.loadout.primaryWeapon === LoadoutWeapon.SKS)
    expect(nvaHasSksPreset).toBe(true)
    expect(vcHasSksPreset).toBe(true)
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
    SKS: 'weapons/sks.glb',
    M16A1_2: 'weapons/kiln/m16a1-2.glb', AK_47: 'weapons/kiln/ak-47.glb',
    ITHACA_37_PUMP_ACTION: 'weapons/kiln/ithaca-37.glb', M3A1_GREASE_GUN: 'weapons/kiln/m3a1.glb',
    M1911A1_COLT: 'weapons/kiln/m1911a1.glb', M60_PIG_GENERAL_PURPOSE: 'weapons/kiln/m60.glb',
    M79_THUMPER_40MM_GRENADE: 'weapons/kiln/m79.glb',
    DRAGUNOV_SVD_SNIPER_RIFLE: 'weapons/kiln/dragunov-svd-sniper-rifle.glb',
    SKS_CARBINE: 'weapons/kiln/sks-carbine.glb',
  },
  // Empty catalog slice: rigs fall back to bbox markers, which is fine here —
  // these tests assert gunplay/switching behavior, not node-graph wiring.
  warAssetCatalog: {},
}))

describe('SKS gunplay reads distinct from the rifle and the marksman', () => {
  let manager: WeaponRigManager

  beforeEach(() => {
    manager = new WeaponRigManager(new THREE.Scene())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hits harder than the full-auto rifle but softer than the marksman, near and far', () => {
    const rifle = manager.getRifleCore()
    const sks = manager.getSksCore()
    const marksman = manager.getMarksmanCore()
    // The SKS sits between the AK assault rifle and the precision DMR at both
    // close and long range — a distinct mid-range aimed-fire profile.
    expect(sks.computeDamage(0, false)).toBeGreaterThan(rifle.computeDamage(0, false))
    expect(sks.computeDamage(0, false)).toBeLessThan(marksman.computeDamage(0, false))
    expect(sks.computeDamage(70, false)).toBeGreaterThan(rifle.computeDamage(70, false))
    expect(sks.computeDamage(70, false)).toBeLessThan(marksman.computeDamage(70, false))
  })

  it('fires slower than the full-auto rifle but faster than the bolt-cadence marksman', () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    const rifle = manager.getRifleCore()
    const sks = manager.getSksCore()
    const marksman = manager.getMarksmanCore()
    rifle.registerShot()
    sks.registerShot()
    marksman.registerShot()

    // 120ms after a shot: the high-rpm rifle has already cycled; the
    // semi-auto SKS has NOT yet (slower than the rifle).
    now = 120
    expect(rifle.canFire()).toBe(true)
    expect(sks.canFire()).toBe(false)

    // 400ms after a shot: the SKS has cycled (faster than the marksman); the
    // slow-cadence marksman is still in its longer between-shots interval.
    now = 400
    expect(sks.canFire()).toBe(true)
    expect(marksman.canFire()).toBe(false)
  })

  it('can be switched to as its own runtime weapon, landing the SKS core', async () => {
    await manager.init()
    manager.startWeaponSwitch('sks')
    // Drive the switch animation to completion.
    for (let i = 0; i < 8 && manager.isSwitching(); i++) {
      manager.updateSwitchAnimation(0.1)
    }
    expect(manager.getCurrentWeaponType()).toBe('sks')
    expect(manager.getCurrentCore()).toBe(manager.getSksCore())
  })
})
