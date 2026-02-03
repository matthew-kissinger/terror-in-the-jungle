import { AmmoManager } from '../../weapons/AmmoManager'
import { ZoneManager } from '../../world/ZoneManager'

/**
 * Manages per-weapon ammo state: rifle, shotgun, SMG
 */
export class WeaponAmmo {
  private rifleAmmo: AmmoManager
  private shotgunAmmo: AmmoManager
  private smgAmmo: AmmoManager
  private currentAmmoManager: AmmoManager

  // Callbacks
  private onReloadComplete?: () => void
  private onAmmoChange?: (state: any) => void

  constructor(
    onReloadComplete: () => void,
    onAmmoChange: (state: any) => void
  ) {
    this.onReloadComplete = onReloadComplete
    this.onAmmoChange = onAmmoChange

    // Initialize per-weapon ammo managers
    // Rifle: 30 round mag, 90 reserve
    this.rifleAmmo = new AmmoManager(30, 90)
    this.rifleAmmo.setOnReloadComplete(() => {
      if (this.onReloadComplete) this.onReloadComplete()
    })
    this.rifleAmmo.setOnAmmoChange((state) => {
      if (this.onAmmoChange) this.onAmmoChange(state)
    })

    // Shotgun: 8 shell tube, 24 reserve
    this.shotgunAmmo = new AmmoManager(8, 24)
    this.shotgunAmmo.setOnReloadComplete(() => {
      if (this.onReloadComplete) this.onReloadComplete()
    })
    this.shotgunAmmo.setOnAmmoChange((state) => {
      if (this.onAmmoChange) this.onAmmoChange(state)
    })

    // SMG: 32 round mag, 128 reserve (high capacity)
    this.smgAmmo = new AmmoManager(32, 128)
    this.smgAmmo.setOnReloadComplete(() => {
      if (this.onReloadComplete) this.onReloadComplete()
    })
    this.smgAmmo.setOnAmmoChange((state) => {
      if (this.onAmmoChange) this.onAmmoChange(state)
    })

    // Start with rifle ammo active
    this.currentAmmoManager = this.rifleAmmo
  }

  getRifleAmmo(): AmmoManager {
    return this.rifleAmmo
  }

  getShotgunAmmo(): AmmoManager {
    return this.shotgunAmmo
  }

  getSMGAmmo(): AmmoManager {
    return this.smgAmmo
  }

  getCurrentAmmoManager(): AmmoManager {
    return this.currentAmmoManager
  }

  setCurrentAmmoManager(manager: AmmoManager): void {
    this.currentAmmoManager = manager
  }

  setZoneManager(zoneManager: ZoneManager): void {
    // Set zone manager for all ammo managers (for resupply)
    this.rifleAmmo.setZoneManager(zoneManager)
    this.shotgunAmmo.setZoneManager(zoneManager)
    this.smgAmmo.setZoneManager(zoneManager)
  }

  resetAll(): void {
    this.rifleAmmo.reset()
    this.shotgunAmmo.reset()
    this.smgAmmo.reset()
  }

  getAmmoState(): any {
    return this.currentAmmoManager.getState()
  }
}
