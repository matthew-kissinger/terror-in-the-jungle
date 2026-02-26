import * as THREE from 'three'
import { GameSystem } from '../../types'
import { TracerPool } from '../effects/TracerPool'
import { MuzzleFlashSystem } from '../effects/MuzzleFlashSystem'
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool'
import { CombatantSystem } from '../combat/CombatantSystem'
import { AssetLoader } from '../assets/AssetLoader'
import { PlayerController } from './PlayerController'
import { AudioManager } from '../audio/AudioManager'
import { ZoneManager } from '../world/ZoneManager'
import { TicketSystem } from '../world/TicketSystem'
import { InventoryManager, WeaponSlot } from './InventoryManager'
import { PlayerStatsTracker } from './PlayerStatsTracker'
import { WeaponRigManager } from './weapon/WeaponRigManager'
import { WeaponAnimations } from './weapon/WeaponAnimations'
import { WeaponFiring } from './weapon/WeaponFiring'
import { WeaponReload } from './weapon/WeaponReload'
import { WeaponModel } from './weapon/WeaponModel'
import { WeaponInput } from './weapon/WeaponInput'
import { WeaponAmmo } from './weapon/WeaponAmmo'
import { WeaponSwitching } from './weapon/WeaponSwitching'

import { WeaponShotCommandBuilder } from './weapon/WeaponShotCommandBuilder'
import { Logger } from '../../utils/Logger'
import type { HUDSystem } from '../../ui/hud/HUDSystem'
import { AmmoState } from '../weapons/AmmoManager'

const _zeroVelocity = new THREE.Vector3()

/**
 * Thin orchestrator for first-person weapon system
 * Delegates to focused modules: WeaponRigManager, WeaponAnimations, WeaponFiring, WeaponReload,
 * WeaponModel, WeaponInput, WeaponAmmo
 */
export class FirstPersonWeapon implements GameSystem {
  private scene: THREE.Scene
  private camera: THREE.Camera
  private assetLoader: AssetLoader
  private playerController?: PlayerController
  private isEnabled = true

  // Focused modules
  private rigManager: WeaponRigManager
  private animations: WeaponAnimations
  private firing: WeaponFiring
  private reload: WeaponReload
  private model: WeaponModel
  private input: WeaponInput
  private ammo: WeaponAmmo
  private switching: WeaponSwitching

  // Effects pools
  private tracerPool: TracerPool
  private muzzleFlashSystem: MuzzleFlashSystem
  private impactEffectsPool: ImpactEffectsPool

  // Dependencies
  private combatantSystem?: CombatantSystem
  private ticketSystem?: TicketSystem
  private hudSystem?: HUDSystem
  private audioManager?: AudioManager
  private zoneManager?: ZoneManager;
  private inventoryManager?: InventoryManager;
  private statsTracker?: PlayerStatsTracker;

  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene
    this.camera = camera
    this.assetLoader = assetLoader

    // Initialize animations and reload first
    this.animations = new WeaponAnimations(camera)
    this.reload = new WeaponReload()
    
    // Create model (which creates weapon scene/camera)
    this.model = new WeaponModel(this.animations, this.reload)

    // Initialize rig manager with model's scene
    this.rigManager = new WeaponRigManager(this.model.getWeaponScene())

    // Initialize effects pools
    this.tracerPool = new TracerPool(this.scene, 96)
    this.muzzleFlashSystem = new MuzzleFlashSystem(this.scene)
    this.impactEffectsPool = new ImpactEffectsPool(this.scene, 32)
    
    // Initialize firing module
    this.firing = new WeaponFiring(
      camera,
      this.rigManager.getCurrentCore(),
      this.tracerPool,
      this.muzzleFlashSystem,
      this.impactEffectsPool,
      this.model.getWeaponScene()
    )

    // Initialize ammo management
    this.ammo = new WeaponAmmo(
      () => this.onReloadComplete(),
      (state) => this.onAmmoChange(state)
    )

    // Initialize input handling
    this.input = new WeaponInput(this.animations, this.reload, this.rigManager)
    this.input.setOnFireStart(() => this.tryFire())
    this.input.setOnReloadStart(() => this.startReload())

    // Initialize weapon switching
    this.switching = new WeaponSwitching(this.rigManager, this.input, this.animations, this.ammo)
  }

  async init(): Promise<void> {
    Logger.info('weapon', ' Initializing First Person Weapon...')

    // Initialize rig manager (creates weapon models)
    await this.rigManager.init()

    // Update references after initialization
    this.animations.setPumpGripRef(this.rigManager.getPumpGripRef())
    this.reload.setMagazineRef(this.rigManager.getMagazineRef())
    this.firing.setMuzzleRef(this.rigManager.getMuzzleRef())
    this.firing.setGunCore(this.rigManager.getCurrentCore())

    Logger.info('weapon', ' First Person Weapon initialized (rifle + shotgun + SMG)')

    // Trigger initial ammo display
    this.onAmmoChange(this.ammo.getAmmoState())
  }

  update(deltaTime: number): void {
    const weaponRig = this.rigManager.getCurrentRig()
    if (!weaponRig || !this.isEnabled) return

    // Update ammo manager with player position for zone resupply
    const playerPos = this.playerController?.getPosition()
    this.ammo.getCurrentAmmoManager().update(deltaTime, playerPos)

    // Get player movement state
    const isMoving = this.playerController?.isMoving() || false
    const lookVelocity = this.playerController ? this.playerController.getVelocity() : _zeroVelocity

    // Update animations (ADS, recoil, idle bob, sway, pump)
    this.animations.update(deltaTime, isMoving, lookVelocity)

    // Update reload animation
    this.reload.update(deltaTime)

    // Update weapon switch animation
    if (this.rigManager.isSwitching()) {
      this.rigManager.updateSwitchAnimation(deltaTime, this.hudSystem, this.audioManager, this.ammo.getCurrentAmmoManager())
      // Update references after switch completes
      if (!this.rigManager.isSwitching()) {
        this.updateWeaponReferences()
      }
    }

    // Apply weapon transform
    this.model.updateTransform(this.rigManager)

    // Gunplay cooldown
    const gunCore = this.rigManager.getCurrentCore()
    gunCore.cooldown(deltaTime)

    // Auto-fire while mouse is held
    if (this.input.isFiringActive()) {
      this.tryFire()
    }

    // Update all effects
    this.tracerPool.update()
    this.muzzleFlashSystem.update(deltaTime)
    this.impactEffectsPool.update(deltaTime)
  }

  dispose(): void {
    this.input.dispose()
    this.model.dispose()
    this.tracerPool.dispose()
    this.muzzleFlashSystem.dispose()
    this.impactEffectsPool.dispose()

    Logger.info('weapon', 'First Person Weapon disposed')
  }

  setPlayerController(controller: PlayerController): void {
    this.playerController = controller
  }

  setCombatantSystem(combatantSystem: CombatantSystem): void {
    this.combatantSystem = combatantSystem
    this.firing.setCombatantSystem(combatantSystem)
  }

  setTicketSystem(ticketSystem: TicketSystem): void {
    this.ticketSystem = ticketSystem
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager
    this.input.setInventoryManager(inventoryManager)
    inventoryManager.onSlotChange((slot) => {
      if (slot === WeaponSlot.PRIMARY) {
        this.switching.switchWeapon('rifle', (state) => this.onAmmoChange(state))
      } else if (slot === WeaponSlot.SHOTGUN) {
        this.switching.switchWeapon('shotgun', (state) => this.onAmmoChange(state))
      } else if (slot === WeaponSlot.SMG) {
        this.switching.switchWeapon('smg', (state) => this.onAmmoChange(state))
      } else if (slot === WeaponSlot.PISTOL) {
        this.switching.switchWeapon('pistol', (state) => this.onAmmoChange(state))
      }
    })
  }

  // Called by main game loop to render weapon overlay
  renderWeapon(renderer: THREE.WebGLRenderer): void {
    this.model.render(renderer, this.rigManager)
  }

  private tryFire(): void {
    if (this.rigManager.isSwitching()) return

    const gunCore = this.rigManager.getCurrentCore()
    const isGameActive = this.ticketSystem ? this.ticketSystem.isGameActive() : true
    if (!this.combatantSystem || !gunCore.canFire() || !this.isEnabled || !isGameActive) return

    const currentAmmo = this.ammo.getCurrentAmmoManager()
    
    // Check ammo
    if (!currentAmmo.canFire()) {
      if (currentAmmo.isEmpty()) {
        // Play empty click sound
        Logger.info('weapon', '*click* - Empty magazine!')
        // Auto-reload if we have reserve ammo
        if (currentAmmo.getState().reserveAmmo > 0) {
          this.startReload()
        }
      }
      return
    }

    // All validation passed - consume ammo and register shot BEFORE creating command
    if (!currentAmmo.consumeRound()) return
    gunCore.registerShot()

    // Determine weapon type
    const isShotgun = gunCore.isShotgun()
    let weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol' = 'rifle'
    if (isShotgun) {
      weaponType = 'shotgun'
    } else if (gunCore === this.rigManager.getSMGCore()) {
      weaponType = 'smg'
    } else if (gunCore === this.rigManager.getPistolCore()) {
      weaponType = 'pistol'
    }

    // Create shot command with all needed data
    const isADS = this.animations.getADS()
    const command = WeaponShotCommandBuilder.createShotCommand(gunCore, this.camera, weaponType, isShotgun, isADS)

    // Execute shot - NO RE-VALIDATION inside executeShot
    this.firing.setGunCore(gunCore)
    this.firing.executeShot(command)

    // Start pump animation for shotgun
    if (isShotgun) {
      this.animations.startPumpAnimation()
    }

    // Visual recoil: kick weapon and camera slightly, and persist kick via controller
    const kick = gunCore.getRecoilOffsetDeg()
    if (this.playerController) {
      this.playerController.applyRecoil(THREE.MathUtils.degToRad(kick.pitch), THREE.MathUtils.degToRad(kick.yaw))
      this.playerController.applyRecoilShake()
    }

    // Apply recoil impulse to weapon spring system
    const recoilMultiplier = gunCore.isShotgun() ? 1.8 : 1.0
    this.animations.applyRecoilImpulse(recoilMultiplier)
  }

  setHUDSystem(hudSystem: HUDSystem): void {
    this.hudSystem = hudSystem
    this.firing.setHUDSystem(hudSystem)
    this.switching.setHUDSystem(hudSystem)
    // Wire ADS state to HUD visibility
    this.animations.onADSChange = (ads: boolean) => hudSystem.setADS(ads)
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager
    this.firing.setAudioManager(audioManager)
    this.reload.setAudioManager(audioManager)
    this.switching.setAudioManager(audioManager)
  }

  setStatsTracker(statsTracker: PlayerStatsTracker): void {
    this.statsTracker = statsTracker
    this.firing.setStatsTracker(statsTracker)
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager
    this.ammo.setZoneManager(zoneManager)
  }

  // Disable weapon (for death)
  disable(): void {
    this.isEnabled = false
    this.input.setEnabled(false)
    this.animations.setADS(false)
    this.animations.reset()
    this.rigManager.setWeaponVisibility(false)
  }

  // Enable weapon (for respawn)
  enable(): void {
    this.isEnabled = true
    this.input.setEnabled(true)
    this.rigManager.setWeaponVisibility(true)
    // Reset all ammo on respawn
    this.ammo.resetAll()
    // Update HUD with current weapon's ammo
    this.onAmmoChange(this.ammo.getAmmoState())
  }

  setWeaponVisibility(visible: boolean): void {
    this.rigManager.setWeaponVisibility(visible)
  }

  // Set game started state
  setGameStarted(started: boolean): void {
    this.input.setGameStarted(started)
  }

  /**
   * Set the primary weapon (rifle, shotgun, SMG, or pistol)
   * Used for loadout selection at game start
   */
  setPrimaryWeapon(weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol'): void {
    this.switching.switchWeapon(weaponType, (state) => this.onAmmoChange(state))
  }

  private startReload(): void {
    // Auto-exit ADS if aiming to allow reload
    if (this.animations.getADS()) {
      this.animations.setADS(false)
    }

    if (this.reload.startReload(() => this.ammo.getCurrentAmmoManager().startReload())) {
      this.input.setFiringActive(false) // Stop firing during reload
    }
  }

  private onReloadComplete(): void {
    Logger.info('weapon', ' Weapon reloaded!')
    // Reload animation will finish independently
  }

  private onAmmoChange(state: AmmoState): void {
    // Update HUD if available
    if (this.hudSystem) {
      this.hudSystem.updateAmmoDisplay(state.currentMagazine, state.reserveAmmo)
    }

    // Check for low ammo warning
    if (this.ammo.getCurrentAmmoManager().isLowAmmo()) {
      Logger.info('weapon', ' Low ammo!')
    }
  }

  getAmmoState(): AmmoState {
    return this.ammo.getAmmoState()
  }

  // Update weapon references after switch
  private updateWeaponReferences(): void {
    this.animations.setPumpGripRef(this.rigManager.getPumpGripRef())
    this.reload.setMagazineRef(this.rigManager.getMagazineRef())
    this.firing.setMuzzleRef(this.rigManager.getMuzzleRef())
    this.firing.setGunCore(this.rigManager.getCurrentCore())
  }

  // Helicopter integration methods
  hideWeapon(): void {
    this.rigManager.setWeaponVisibility(false)
    Logger.info('weapon', 'Weapon hidden (in helicopter)')
  }

  showWeapon(): void {
    this.rigManager.setWeaponVisibility(true)
    Logger.info('weapon', 'Weapon shown (exited helicopter)')
  }

  setFireingEnabled(enabled: boolean): void {
    this.isEnabled = enabled
    this.input.setEnabled(enabled)
    if (!enabled) {
      // Stop any current firing
      this.input.setFiringActive(false)
      Logger.info('weapon', 'Firing disabled (in helicopter)')
    } else {
      Logger.info('weapon', 'Firing enabled (exited helicopter)')
    }
  }

  /** Expose WeaponInput for touch control wiring */
  getWeaponInput(): WeaponInput {
    return this.input
  }
}
