import { AmmoManager } from '../../weapons/AmmoManager'
import { ZoneManager } from '../../world/ZoneManager'

/**
 * Manages per-weapon ammo state: rifle, shotgun, SMG
 */
export class WeaponAmmo {
  private rifleAmmo: AmmoManager
  private shotgunAmmo: AmmoManager
  private smgAmmo: AmmoManager
  private pistolAmmo: AmmoManager
  private lmgAmmo: AmmoManager
  private launcherAmmo: AmmoManager
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

    // Pistol: 12 round mag, 48 reserve
    this.pistolAmmo = new AmmoManager(12, 48)
    this.pistolAmmo.setOnReloadComplete(() => {
      if (this.onReloadComplete) this.onReloadComplete()
    })
    this.pistolAmmo.setOnAmmoChange((state) => {
      if (this.onAmmoChange) this.onAmmoChange(state)
    })

    // LMG (M60): 100 round belt, 200 reserve
    this.lmgAmmo = new AmmoManager(100, 200)
    this.lmgAmmo.setOnReloadComplete(() => {
      if (this.onReloadComplete) this.onReloadComplete()
    })
    this.lmgAmmo.setOnAmmoChange((state) => {
      if (this.onAmmoChange) this.onAmmoChange(state)
    })

    // Launcher (M79): 1 round (break-action), 10 reserve
    this.launcherAmmo = new AmmoManager(1, 10)
    this.launcherAmmo.setOnReloadComplete(() => {
      if (this.onReloadComplete) this.onReloadComplete()
    })
    this.launcherAmmo.setOnAmmoChange((state) => {
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

  getPistolAmmo(): AmmoManager {
    return this.pistolAmmo
  }

  getLMGAmmo(): AmmoManager {
    return this.lmgAmmo
  }

  getLauncherAmmo(): AmmoManager {
    return this.launcherAmmo
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
    this.pistolAmmo.setZoneManager(zoneManager)
    this.lmgAmmo.setZoneManager(zoneManager)
    this.launcherAmmo.setZoneManager(zoneManager)
  }

  resetAll(): void {
    this.rifleAmmo.reset()
    this.shotgunAmmo.reset()
    this.smgAmmo.reset()
    this.pistolAmmo.reset()
    this.lmgAmmo.reset()
    this.launcherAmmo.reset()
  }

  getAmmoState(): any {
    return this.currentAmmoManager.getState()
  }
}
