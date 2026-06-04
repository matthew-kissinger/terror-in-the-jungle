import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WeaponSwitching } from './WeaponSwitching'

/**
 * L2 behavior tests for WeaponSwitching.
 *
 * WeaponSwitching coordinates four collaborators when the player changes
 * weapons. Its observable contract:
 *   - it asks the rig manager to begin the switch; if that is refused, nothing
 *     else changes and it reports failure
 *   - on success it cancels any in-progress firing, drops out of ADS, points
 *     the ammo subsystem at the new weapon's magazine, and reports the new
 *     ammo state to the caller's HUD callback
 *
 * The four collaborators are mocked at their public boundary. We assert on the
 * effects WeaponSwitching produces, not on internal weapon-name string maps.
 */
describe('WeaponSwitching', () => {
  let rigManager: any
  let input: any
  let animations: any
  let ammo: any
  let switching: WeaponSwitching

  // Distinct sentinel ammo managers so we can prove the right one is selected.
  const rifleMgr = { id: 'rifle-mgr' }
  const shotgunMgr = { id: 'shotgun-mgr' }
  const smgMgr = { id: 'smg-mgr' }
  const pistolMgr = { id: 'pistol-mgr' }
  const lmgMgr = { id: 'lmg-mgr' }
  const launcherMgr = { id: 'launcher-mgr' }

  beforeEach(() => {
    rigManager = {
      // Default: the rig manager accepts the switch.
      startWeaponSwitch: vi.fn(() => true),
    }
    input = { setFiringActive: vi.fn() }
    animations = { setADS: vi.fn() }
    ammo = {
      getRifleAmmo: vi.fn(() => rifleMgr),
      getShotgunAmmo: vi.fn(() => shotgunMgr),
      getSMGAmmo: vi.fn(() => smgMgr),
      getPistolAmmo: vi.fn(() => pistolMgr),
      getLMGAmmo: vi.fn(() => lmgMgr),
      getLauncherAmmo: vi.fn(() => launcherMgr),
      setCurrentAmmoManager: vi.fn(),
      setReserveAmmoFactor: vi.fn(),
      // Report a stable state object so we can check it is forwarded.
      getAmmoState: vi.fn(() => ({ currentMagazine: 7, reserveAmmo: 21 })),
    }

    switching = new WeaponSwitching(rigManager, input, animations, ammo)
  })

  describe('successful switch', () => {
    it('reports success and stops firing, leaves ADS, and updates the HUD ammo state', () => {
      const onAmmoChange = vi.fn()

      const result = switching.switchWeapon('shotgun', onAmmoChange)

      expect(result).toBe(true)
      expect(input.setFiringActive).toHaveBeenCalledWith(false)
      expect(animations.setADS).toHaveBeenCalledWith(false)
      expect(ammo.setCurrentAmmoManager).toHaveBeenCalledWith(shotgunMgr)
      expect(onAmmoChange).toHaveBeenCalledWith({ currentMagazine: 7, reserveAmmo: 21 })
    })

    it('selects the magazine matching the requested weapon type', () => {
      const cases: Array<[Parameters<WeaponSwitching['switchWeapon']>[0], object]> = [
        ['rifle', rifleMgr],
        ['shotgun', shotgunMgr],
        ['smg', smgMgr],
        ['pistol', pistolMgr],
        ['lmg', lmgMgr],
        ['launcher', launcherMgr],
      ]

      for (const [weaponType, expectedMgr] of cases) {
        ammo.setCurrentAmmoManager.mockClear()
        const ok = switching.switchWeapon(weaponType, vi.fn())
        expect(ok).toBe(true)
        expect(ammo.setCurrentAmmoManager).toHaveBeenCalledWith(expectedMgr)
      }
    })

    it('hands the chosen magazine to the rig manager when starting the switch', () => {
      switching.switchWeapon('smg', vi.fn())

      // The rig manager receives the runtime weapon and the matching magazine.
      const callArgs = rigManager.startWeaponSwitch.mock.calls[0]
      expect(callArgs[0]).toBe('smg')
      expect(callArgs[callArgs.length - 1]).toBe(smgMgr)
    })
  })

  describe('reserve ammo factor seam (selectable ammo load)', () => {
    it('routes the reserve factor through to the per-weapon ammo subsystem', () => {
      switching.setReserveAmmoFactor(1.5)

      expect(ammo.setReserveAmmoFactor).toHaveBeenCalledWith(1.5)
    })

    it('does not re-scale the reserve as a side effect of switching weapons', () => {
      // Switching must not touch the reserve factor: a load chosen at deploy
      // persists no matter how many times the player changes weapons.
      switching.switchWeapon('smg', vi.fn())
      switching.switchWeapon('pistol', vi.fn())

      expect(ammo.setReserveAmmoFactor).not.toHaveBeenCalled()
    })
  })

  describe('rejected switch', () => {
    beforeEach(() => {
      rigManager.startWeaponSwitch = vi.fn(() => false)
    })

    it('reports failure and changes nothing when the rig manager refuses', () => {
      const onAmmoChange = vi.fn()

      const result = switching.switchWeapon('shotgun', onAmmoChange)

      expect(result).toBe(false)
      expect(input.setFiringActive).not.toHaveBeenCalled()
      expect(animations.setADS).not.toHaveBeenCalled()
      expect(ammo.setCurrentAmmoManager).not.toHaveBeenCalled()
      expect(onAmmoChange).not.toHaveBeenCalled()
    })
  })
})
