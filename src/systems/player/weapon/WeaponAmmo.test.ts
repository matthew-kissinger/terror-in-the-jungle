// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { WeaponAmmo } from './WeaponAmmo'

/**
 * L2 behavior tests for WeaponAmmo.
 *
 * WeaponAmmo is a composition/provisioning class: it owns one AmmoManager per
 * weapon, wires their reload/ammo-change callbacks back to the owner, tracks
 * which one is "current", and fans resets/zone-manager wiring across all of
 * them. We test that wiring against the real AmmoManager (one boundary), and
 * assert observable behavior - which manager is active, that callbacks are
 * forwarded, that managers are distinct, and that resets restore them - rather
 * than the specific magazine-size constants the class happens to configure.
 */
describe('WeaponAmmo', () => {
  let onReloadComplete: ReturnType<typeof vi.fn>
  let onAmmoChange: ReturnType<typeof vi.fn>
  let weaponAmmo: WeaponAmmo

  beforeEach(() => {
    onReloadComplete = vi.fn()
    onAmmoChange = vi.fn()
    weaponAmmo = new WeaponAmmo(onReloadComplete, onAmmoChange)
  })

  describe('per-weapon provisioning', () => {
    it('exposes a distinct ammo manager for each weapon type', () => {
      const managers = [
        weaponAmmo.getRifleAmmo(),
        weaponAmmo.getShotgunAmmo(),
        weaponAmmo.getSMGAmmo(),
        weaponAmmo.getPistolAmmo(),
        weaponAmmo.getLMGAmmo(),
        weaponAmmo.getLauncherAmmo(),
      ]

      // No two weapons share the same AmmoManager instance.
      expect(new Set(managers).size).toBe(managers.length)
    })

    it('gives each weapon a fully-loaded magazine on construction', () => {
      const managers = [
        weaponAmmo.getRifleAmmo(),
        weaponAmmo.getShotgunAmmo(),
        weaponAmmo.getSMGAmmo(),
        weaponAmmo.getPistolAmmo(),
        weaponAmmo.getLMGAmmo(),
        weaponAmmo.getLauncherAmmo(),
      ]

      for (const mgr of managers) {
        const state = mgr.getState()
        // Each weapon starts at its full magazine with positive reserve.
        expect(state.currentMagazine).toBe(state.maxMagazine)
        expect(state.maxMagazine).toBeGreaterThan(0)
        expect(state.isReloading).toBe(false)
      }
    })
  })

  describe('current weapon selection', () => {
    it('starts with the rifle as the active weapon', () => {
      expect(weaponAmmo.getCurrentAmmoManager()).toBe(weaponAmmo.getRifleAmmo())
    })

    it('reports the active weapon\'s state via getAmmoState', () => {
      weaponAmmo.setCurrentAmmoManager(weaponAmmo.getShotgunAmmo())

      expect(weaponAmmo.getCurrentAmmoManager()).toBe(weaponAmmo.getShotgunAmmo())
      // getAmmoState delegates to whichever manager is current.
      expect(weaponAmmo.getAmmoState()).toEqual(weaponAmmo.getShotgunAmmo().getState())
    })

    it('switches the reported magazine when the active weapon changes', () => {
      // Fire a couple of rifle rounds so its magazine diverges from a fresh one.
      weaponAmmo.getRifleAmmo().consumeRound()
      weaponAmmo.getRifleAmmo().consumeRound()

      weaponAmmo.setCurrentAmmoManager(weaponAmmo.getPistolAmmo())
      const pistolState = weaponAmmo.getAmmoState()

      // The current state reflects the pistol (full), not the depleted rifle.
      expect(pistolState.currentMagazine).toBe(pistolState.maxMagazine)
      expect(weaponAmmo.getRifleAmmo().getState().currentMagazine)
        .toBe(weaponAmmo.getRifleAmmo().getState().maxMagazine - 2)
    })
  })

  describe('callback forwarding', () => {
    it('forwards a reload completion from the active weapon to the owner', () => {
      const rifle = weaponAmmo.getRifleAmmo()

      // Empty the magazine so a reload has something to do, then run it.
      const fullMag = rifle.getState().maxMagazine
      for (let i = 0; i < fullMag; i++) rifle.consumeRound()
      expect(rifle.startReload()).toBe(true)

      // Drive the reload to completion (reload time is ~2.5s; advance well past).
      const realNow = performance.now.bind(performance)
      const start = realNow()
      vi.spyOn(performance, 'now').mockReturnValue(start + 10_000)
      try {
        rifle.update(10)
      } finally {
        vi.mocked(performance.now).mockRestore?.()
      }

      expect(onReloadComplete).toHaveBeenCalled()
    })

    it('forwards ammo-change notifications from a weapon to the owner', () => {
      // Consuming a round triggers the manager's onAmmoChange, which WeaponAmmo
      // must relay to the owner callback it was constructed with.
      weaponAmmo.getRifleAmmo().consumeRound()

      expect(onAmmoChange).toHaveBeenCalled()
    })
  })

  describe('zone manager fan-out', () => {
    it('wires the supplied zone manager into every weapon for resupply', () => {
      const zoneManager = {} as any
      const spies = [
        vi.spyOn(weaponAmmo.getRifleAmmo(), 'setZoneManager'),
        vi.spyOn(weaponAmmo.getShotgunAmmo(), 'setZoneManager'),
        vi.spyOn(weaponAmmo.getSMGAmmo(), 'setZoneManager'),
        vi.spyOn(weaponAmmo.getPistolAmmo(), 'setZoneManager'),
        vi.spyOn(weaponAmmo.getLMGAmmo(), 'setZoneManager'),
        vi.spyOn(weaponAmmo.getLauncherAmmo(), 'setZoneManager'),
      ]

      weaponAmmo.setZoneManager(zoneManager)

      for (const spy of spies) {
        expect(spy).toHaveBeenCalledWith(zoneManager)
      }
    })
  })

  describe('resetAll', () => {
    it('restores every weapon back to a full magazine', () => {
      // Deplete several weapons.
      weaponAmmo.getRifleAmmo().consumeRound()
      weaponAmmo.getShotgunAmmo().consumeRound()
      weaponAmmo.getPistolAmmo().consumeRound()

      weaponAmmo.resetAll()

      for (const mgr of [
        weaponAmmo.getRifleAmmo(),
        weaponAmmo.getShotgunAmmo(),
        weaponAmmo.getPistolAmmo(),
      ]) {
        const state = mgr.getState()
        expect(state.currentMagazine).toBe(state.maxMagazine)
        expect(state.reserveAmmo).toBe(state.maxReserve)
      }
    })
  })

  describe('setReserveAmmoFactor (selectable ammo load)', () => {
    it('scales every weapon\'s reserve relative to its base and re-provisions it', () => {
      // Capture each weapon's baseline reserve before scaling.
      const managers = [
        weaponAmmo.getRifleAmmo(),
        weaponAmmo.getShotgunAmmo(),
        weaponAmmo.getSMGAmmo(),
        weaponAmmo.getPistolAmmo(),
        weaponAmmo.getLMGAmmo(),
        weaponAmmo.getLauncherAmmo(),
      ]
      const baseReserves = managers.map(m => m.getState().maxReserve)

      weaponAmmo.setReserveAmmoFactor(1.5)

      managers.forEach((mgr, i) => {
        const state = mgr.getState()
        const expected = Math.round(baseReserves[i] * 1.5)
        expect(state.maxReserve).toBe(expected)
        // Re-provisioned: the spawn reserve reflects the new capacity.
        expect(state.reserveAmmo).toBe(expected)
      })

      // The rifle's documented 90 base becomes 135 at x1.5.
      expect(weaponAmmo.getRifleAmmo().getState().maxReserve).toBe(135)
    })

    it('does not change the magazine size', () => {
      const rifle = weaponAmmo.getRifleAmmo()
      const baseMag = rifle.getState().maxMagazine

      weaponAmmo.setReserveAmmoFactor(2.0)

      expect(rifle.getState().maxMagazine).toBe(baseMag)
      expect(rifle.getState().currentMagazine).toBe(baseMag)
    })

    it('computes from the base so repeated factor changes do not compound', () => {
      const rifle = weaponAmmo.getRifleAmmo()
      const base = rifle.getState().maxReserve // 90

      weaponAmmo.setReserveAmmoFactor(1.5)
      weaponAmmo.setReserveAmmoFactor(2.0)

      // Always relative to the base (90 -> 180), never to the previous scaled value.
      expect(rifle.getState().maxReserve).toBe(Math.round(base * 2.0))
      expect(rifle.getState().maxReserve).toBe(180)
    })

    it('keeps the scaled reserve after a resetAll (survives respawn provisioning)', () => {
      weaponAmmo.setReserveAmmoFactor(2.0)
      weaponAmmo.getRifleAmmo().consumeRound()

      weaponAmmo.resetAll()

      const state = weaponAmmo.getRifleAmmo().getState()
      expect(state.maxReserve).toBe(180)
      expect(state.reserveAmmo).toBe(180)
    })

    it('preserves the factored reserve across a weapon switch', () => {
      weaponAmmo.setReserveAmmoFactor(1.5)

      // A weapon switch in the runtime is `setCurrentAmmoManager`; it must not
      // disturb the already-scaled reserve of the newly-active weapon.
      weaponAmmo.setCurrentAmmoManager(weaponAmmo.getSMGAmmo())

      const smgState = weaponAmmo.getAmmoState()
      expect(smgState.maxReserve).toBe(Math.round(128 * 1.5))
      expect(smgState.reserveAmmo).toBe(Math.round(128 * 1.5))
    })
  })
})
