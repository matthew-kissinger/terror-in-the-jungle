import * as THREE from 'three'
import { GameSystem } from '../../types'
import { TracerPool } from '../effects/TracerPool'
import { MuzzleFlashPool } from '../effects/MuzzleFlashPool'
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool'
import { CombatantSystem } from '../combat/CombatantSystem'
import { AssetLoader } from '../assets/AssetLoader'
import { PlayerController } from './PlayerController'
import { AudioManager } from '../audio/AudioManager'
import { ZoneManager } from '../world/ZoneManager'
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
import { ShotCommand, ShotCommandFactory } from './weapon/ShotCommand'

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
  private muzzleFlashPool: MuzzleFlashPool
  private impactEffectsPool: ImpactEffectsPool

  // Dependencies
  private combatantSystem?: CombatantSystem
  private hudSystem?: any
  private audioManager?: AudioManager
  private zoneManager?: ZoneManager
  private inventoryManager?: InventoryManager
  private statsTracker?: PlayerStatsTracker

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
    this.muzzleFlashPool = new MuzzleFlashPool(this.scene, 32)
    this.impactEffectsPool = new ImpactEffectsPool(this.scene, 32)
    
    // Initialize firing module
    this.firing = new WeaponFiring(
      camera,
      this.rigManager.getCurrentCore(),
      this.tracerPool,
      this.muzzleFlashPool,
      this.impactEffectsPool
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
    console.log('⚔️ Initializing First Person Weapon...')

    // Initialize rig manager (creates weapon models)
    await this.rigManager.init()

    // Update references after initialization
    this.animations.setPumpGripRef(this.rigManager.getPumpGripRef())
    this.reload.setMagazineRef(this.rigManager.getMagazineRef())
    this.firing.setMuzzleRef(this.rigManager.getMuzzleRef())
    this.firing.setGunCore(this.rigManager.getCurrentCore())

    console.log('✅ First Person Weapon initialized (rifle + shotgun + SMG)')

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
    const lookVelocity = this.playerController ? this.playerController.getVelocity() : new THREE.Vector3()

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
    this.muzzleFlashPool.update()
    this.impactEffectsPool.update(deltaTime)
  }

  dispose(): void {
    this.input.dispose()
    this.model.dispose()
    this.tracerPool.dispose()
    this.muzzleFlashPool.dispose()
    this.impactEffectsPool.dispose()

    console.log('🧹 First Person Weapon disposed')
  }

  setPlayerController(controller: PlayerController): void {
    this.playerController = controller
  }

  // Deprecated: Use setCombatantSystem instead
  setEnemySystem(enemy: any): void {
    console.warn('setEnemySystem is deprecated, use setCombatantSystem')
  }

  setCombatantSystem(combatantSystem: CombatantSystem): void {
    this.combatantSystem = combatantSystem
    this.firing.setCombatantSystem(combatantSystem)
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
      }
    })
  }

  // Called by main game loop to render weapon overlay
  renderWeapon(renderer: THREE.WebGLRenderer): void {
    this.model.render(renderer, this.rigManager)
  }

  private tryFire(): void {
    const gunCore = this.rigManager.getCurrentCore()
    if (!this.combatantSystem || !gunCore.canFire() || !this.isEnabled) return

    const currentAmmo = this.ammo.getCurrentAmmoManager()
    
    // Check ammo
    if (!currentAmmo.canFire()) {
      if (currentAmmo.isEmpty()) {
        // Play empty click sound
        console.log('🔫 *click* - Empty magazine!')
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
    let weaponType: 'rifle' | 'shotgun' | 'smg' = 'rifle'
    if (isShotgun) {
      weaponType = 'shotgun'
    } else if (gunCore === this.rigManager.getSMGCore()) {
      weaponType = 'smg'
    }

    // Create shot command with all needed data
    const isADS = this.animations.getADS()
    const command = this.createShotCommand(gunCore, weaponType, isShotgun, isADS)

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

  /**
   * Create a ShotCommand with all firing data captured at validation time
   */
  private createShotCommand(
    gunCore: any,
    weaponType: 'rifle' | 'shotgun' | 'smg',
    isShotgun: boolean,
    isADS: boolean
  ): ShotCommand {
    const spread = gunCore.getSpreadDeg()

    if (isShotgun) {
      // Get pellet rays from gunplay core
      const pelletRays = gunCore.computePelletRays(this.camera)
      const origin = new THREE.Vector3()
      this.camera.getWorldPosition(origin)
      const direction = new THREE.Vector3()
      this.camera.getWorldDirection(direction)

      return ShotCommandFactory.createShotgunShot(
        origin,
        direction,
        pelletRays.map((r: THREE.Ray) => r.direction.clone()),
        (d: number, head: boolean) => gunCore.computeDamage(d, head),
        isADS
      )
    } else {
      // Single shot - compute ray with spread
      const ray = gunCore.computeShotRay(this.camera, spread)

      return ShotCommandFactory.createSingleShot(
        ray.origin.clone(),
        ray.direction.clone(),
        weaponType === 'shotgun' ? 'rifle' : weaponType,
        (d: number, head: boolean) => gunCore.computeDamage(d, head),
        isADS
      )
    }
  }

  setHUDSystem(hudSystem: any): void {
    this.hudSystem = hudSystem
    this.firing.setHUDSystem(hudSystem)
    this.switching.setHUDSystem(hudSystem)
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

  private startReload(): void {
    // Can't reload while ADS
    if (this.animations.getADS()) {
      console.log('⚠️ Cannot reload while aiming')
      return
    }

    if (this.reload.startReload(() => this.ammo.getCurrentAmmoManager().startReload())) {
      this.input.setFiringActive(false) // Stop firing during reload
    }
  }

  private onReloadComplete(): void {
    console.log('✅ Weapon reloaded!')
    // Reload animation will finish independently
  }

  private onAmmoChange(state: any): void {
    // Update HUD if available
    if (this.hudSystem) {
      this.hudSystem.updateAmmoDisplay(state.currentMagazine, state.reserveAmmo)
    }

    // Check for low ammo warning
    if (this.ammo.getCurrentAmmoManager().isLowAmmo()) {
      console.log('⚠️ Low ammo!')
    }
  }

  getAmmoState(): any {
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
    console.log('🚁 🔫 Weapon hidden (in helicopter)')
  }

  showWeapon(): void {
    this.rigManager.setWeaponVisibility(true)
    console.log('🚁 🔫 Weapon shown (exited helicopter)')
  }

  setFireingEnabled(enabled: boolean): void {
    this.isEnabled = enabled
    this.input.setEnabled(enabled)
    if (!enabled) {
      // Stop any current firing
      this.input.setFiringActive(false)
      console.log('🚁 🔫 Firing disabled (in helicopter)')
    } else {
      console.log('🚁 🔫 Firing enabled (exited helicopter)')
    }
  }
}
