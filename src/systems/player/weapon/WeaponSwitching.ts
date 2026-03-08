import { WeaponRigManager } from './WeaponRigManager'
import { WeaponInput } from './WeaponInput'
import { WeaponAnimations } from './WeaponAnimations'
import { WeaponAmmo } from './WeaponAmmo'
import { AmmoManager, AmmoState } from '../../weapons/AmmoManager'
import type { HUDSystem } from '../../../ui/hud/HUDSystem'
import type { AudioManager } from '../../audio/AudioManager'
import type { LoadoutWeapon } from '../../../ui/loadout/LoadoutTypes'

/**
 * Handles weapon switching logic for rifle, shotgun, and SMG
 * Unified implementation to eliminate duplication
 */
export class WeaponSwitching {
  private static readonly RUNTIME_WEAPON_MAP: Record<LoadoutWeapon | 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher', 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher'> = {
    rifle: 'rifle',
    shotgun: 'shotgun',
    smg: 'smg',
    pistol: 'pistol',
    lmg: 'lmg',
    launcher: 'launcher'
  }
  private rigManager: WeaponRigManager
  private input: WeaponInput
  private animations: WeaponAnimations
  private ammo: WeaponAmmo
  private hudSystem?: HUDSystem
  private audioManager?: AudioManager

  // Weapon type to ammo manager mapping
  private readonly weaponAmmoMap: Record<'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher', () => AmmoManager> = {
    rifle: () => this.ammo.getRifleAmmo(),
    shotgun: () => this.ammo.getShotgunAmmo(),
    smg: () => this.ammo.getSMGAmmo(),
    pistol: () => this.ammo.getPistolAmmo(),
    lmg: () => this.ammo.getLMGAmmo(),
    launcher: () => this.ammo.getLauncherAmmo()
  }

  constructor(
    rigManager: WeaponRigManager,
    input: WeaponInput,
    animations: WeaponAnimations,
    ammo: WeaponAmmo
  ) {
    this.rigManager = rigManager
    this.input = input
    this.animations = animations
    this.ammo = ammo
  }

  setHUDSystem(hudSystem: HUDSystem): void {
    this.hudSystem = hudSystem
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager
  }

  /**
   * Switch to the specified weapon type
   * @param weaponType - 'rifle', 'shotgun', 'smg', 'pistol', 'lmg', or 'launcher'
   * @param onAmmoChange - Callback to update HUD with new ammo state
   * @returns true if switch was initiated, false if already on that weapon or switching
   */
  switchWeapon(
    weaponType: LoadoutWeapon | 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher',
    onAmmoChange: (state: AmmoState) => void
  ): boolean {
    const runtimeWeaponType = WeaponSwitching.RUNTIME_WEAPON_MAP[weaponType]
    const ammoManager = this.weaponAmmoMap[runtimeWeaponType]()
    
    if (this.rigManager.startWeaponSwitch(runtimeWeaponType, this.hudSystem, this.audioManager, ammoManager)) {
      this.input.setFiringActive(false)
      this.animations.setADS(false)
      this.ammo.setCurrentAmmoManager(ammoManager)
      // Update HUD with new weapon's ammo
      onAmmoChange(this.ammo.getAmmoState())
      return true
    }
    
    return false
  }
}
