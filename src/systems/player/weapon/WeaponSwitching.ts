import { WeaponRigManager } from './WeaponRigManager'
import { WeaponInput } from './WeaponInput'
import { WeaponAnimations } from './WeaponAnimations'
import { WeaponAmmo } from './WeaponAmmo'
import { AmmoManager } from '../../weapons/AmmoManager'

/**
 * Handles weapon switching logic for rifle, shotgun, and SMG
 * Unified implementation to eliminate duplication
 */
export class WeaponSwitching {
  private rigManager: WeaponRigManager
  private input: WeaponInput
  private animations: WeaponAnimations
  private ammo: WeaponAmmo
  private hudSystem?: any
  private audioManager?: any

  // Weapon type to ammo manager mapping
  private readonly weaponAmmoMap: Record<'rifle' | 'shotgun' | 'smg' | 'pistol', () => AmmoManager> = {
    rifle: () => this.ammo.getRifleAmmo(),
    shotgun: () => this.ammo.getShotgunAmmo(),
    smg: () => this.ammo.getSMGAmmo(),
    pistol: () => this.ammo.getPistolAmmo()
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

  setHUDSystem(hudSystem: any): void {
    this.hudSystem = hudSystem
  }

  setAudioManager(audioManager: any): void {
    this.audioManager = audioManager
  }

  /**
   * Switch to the specified weapon type
   * @param weaponType - 'rifle', 'shotgun', 'smg', or 'pistol'
   * @param onAmmoChange - Callback to update HUD with new ammo state
   * @returns true if switch was initiated, false if already on that weapon or switching
   */
  switchWeapon(
    weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol',
    onAmmoChange: (state: any) => void
  ): boolean {
    const ammoManager = this.weaponAmmoMap[weaponType]()
    
    if (this.rigManager.startWeaponSwitch(weaponType, this.hudSystem, this.audioManager, ammoManager)) {
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
