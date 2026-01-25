import * as THREE from 'three'
import { GameSystem } from '../../types'
import { TracerPool } from '../effects/TracerPool'
import { MuzzleFlashPool } from '../effects/MuzzleFlashPool'
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool'
import { CombatantSystem } from '../combat/CombatantSystem'
import { AssetLoader } from '../assets/AssetLoader'
import { PlayerController } from './PlayerController'
import { AudioManager } from '../audio/AudioManager'
import { AmmoManager } from '../weapons/AmmoManager'
import { ZoneManager } from '../world/ZoneManager'
import { InventoryManager, WeaponSlot } from './InventoryManager'
import { PlayerStatsTracker } from './PlayerStatsTracker'
import { WeaponRigManager } from './weapon/WeaponRigManager'
import { WeaponAnimations } from './weapon/WeaponAnimations'
import { WeaponFiring } from './weapon/WeaponFiring'
import { WeaponReload } from './weapon/WeaponReload'
import { ShotCommand, ShotCommandFactory } from './weapon/ShotCommand'

/**
 * Thin orchestrator for first-person weapon system
 * Delegates to focused modules: WeaponRigManager, WeaponAnimations, WeaponFiring, WeaponReload
 */
export class FirstPersonWeapon implements GameSystem {
  private scene: THREE.Scene
  private camera: THREE.Camera
  private assetLoader: AssetLoader
  private playerController?: PlayerController
  private gameStarted: boolean = false

  // Weapon rendering
  private weaponScene: THREE.Scene
  private weaponCamera: THREE.OrthographicCamera

  // Focused modules
  private rigManager: WeaponRigManager
  private animations: WeaponAnimations
  private firing: WeaponFiring
  private reload: WeaponReload

  // Effects pools
  private tracerPool: TracerPool
  private muzzleFlashPool: MuzzleFlashPool
  private impactEffectsPool: ImpactEffectsPool

  // Dependencies
  private combatantSystem?: CombatantSystem
  private hudSystem?: any
  private audioManager?: AudioManager
  private ammoManager: AmmoManager
  private zoneManager?: ZoneManager
  private inventoryManager?: InventoryManager
  private statsTracker?: PlayerStatsTracker

  // Firing state
  private isFiring = false
  private isEnabled = true

  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene
    this.camera = camera
    this.assetLoader = assetLoader

    // Create separate scene for weapon overlay
    this.weaponScene = new THREE.Scene()

    // Create orthographic camera for weapon rendering
    const aspect = window.innerWidth / window.innerHeight
    this.weaponCamera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10)
    this.weaponCamera.position.z = 1

    // Initialize modules
    this.rigManager = new WeaponRigManager(this.weaponScene)
    this.animations = new WeaponAnimations(camera)
    this.tracerPool = new TracerPool(this.scene, 96)
    this.muzzleFlashPool = new MuzzleFlashPool(this.scene, 32)
    this.impactEffectsPool = new ImpactEffectsPool(this.scene, 32)
    this.firing = new WeaponFiring(
      camera,
      this.rigManager.getCurrentCore(),
      this.tracerPool,
      this.muzzleFlashPool,
      this.impactEffectsPool
    )
    this.reload = new WeaponReload()

    // Initialize ammo manager
    this.ammoManager = new AmmoManager(30, 90) // 30 rounds per mag, 90 reserve
    this.ammoManager.setOnReloadComplete(() => this.onReloadComplete())
    this.ammoManager.setOnAmmoChange((state) => this.onAmmoChange(state))

    // Input handlers
    window.addEventListener('mousedown', this.onMouseDown.bind(this))
    window.addEventListener('mouseup', this.onMouseUp.bind(this))
    window.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('resize', this.onWindowResize.bind(this))
    window.addEventListener('keydown', this.onKeyDown.bind(this))
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
    this.onAmmoChange(this.ammoManager.getState())
  }

  update(deltaTime: number): void {
    const weaponRig = this.rigManager.getCurrentRig()
    if (!weaponRig || !this.isEnabled) return

    // Update ammo manager with player position for zone resupply
    const playerPos = this.playerController?.getPosition()
    this.ammoManager.update(deltaTime, playerPos)

    // Get player movement state
    const isMoving = this.playerController?.isMoving() || false
    const lookVelocity = this.playerController ? this.playerController.getVelocity() : new THREE.Vector3()

    // Update animations (ADS, recoil, idle bob, sway, pump)
    this.animations.update(deltaTime, isMoving, lookVelocity)

    // Update reload animation
    this.reload.update(deltaTime)

    // Update weapon switch animation
    if (this.rigManager.isSwitching()) {
      this.rigManager.updateSwitchAnimation(deltaTime, this.hudSystem, this.audioManager, this.ammoManager)
      // Update references after switch completes
      if (!this.rigManager.isSwitching()) {
        this.updateWeaponReferences()
      }
    }

    // Apply weapon transform
    this.updateWeaponTransform()

    // Gunplay cooldown
    const gunCore = this.rigManager.getCurrentCore()
    gunCore.cooldown(deltaTime)

    // Auto-fire while mouse is held
    if (this.isFiring) {
      this.tryFire()
    }

    // Update all effects
    this.tracerPool.update()
    this.muzzleFlashPool.update()
    this.impactEffectsPool.update(deltaTime)
  }

  dispose(): void {
    window.removeEventListener('mousedown', this.onMouseDown.bind(this))
    window.removeEventListener('mouseup', this.onMouseUp.bind(this))
    window.removeEventListener('resize', this.onWindowResize.bind(this))
    window.removeEventListener('keydown', this.onKeyDown.bind(this))
    this.tracerPool.dispose()
    this.muzzleFlashPool.dispose()
    this.impactEffectsPool.dispose()

    console.log('🧹 First Person Weapon disposed')
  }

  private onWindowResize(): void {
    const aspect = window.innerWidth / window.innerHeight
    this.weaponCamera.left = -aspect
    this.weaponCamera.right = aspect
    this.weaponCamera.updateProjectionMatrix()
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

    // Listen for weapon slot changes
    inventoryManager.onSlotChange((slot) => {
      if (slot === WeaponSlot.PRIMARY) {
        this.switchToRifle()
      } else if (slot === WeaponSlot.SHOTGUN) {
        this.switchToShotgun()
      } else if (slot === WeaponSlot.SMG) {
        this.switchToSMG()
      }
    })
  }

  private switchToRifle(): void {
    if (this.rigManager.startWeaponSwitch('rifle', this.hudSystem, this.audioManager, this.ammoManager)) {
      this.isFiring = false
      this.animations.setADS(false)
    }
  }

  private switchToShotgun(): void {
    if (this.rigManager.startWeaponSwitch('shotgun', this.hudSystem, this.audioManager, this.ammoManager)) {
      this.isFiring = false
      this.animations.setADS(false)
    }
  }

  private switchToSMG(): void {
    if (this.rigManager.startWeaponSwitch('smg', this.hudSystem, this.audioManager, this.ammoManager)) {
      this.isFiring = false
      this.animations.setADS(false)
    }
  }

  private onMouseDown(event: MouseEvent): void {
    // Don't process input until game has started and weapon is visible
    if (!this.gameStarted || !this.isEnabled || !this.rigManager.getCurrentRig()) return

    // Only handle gun input when PRIMARY, SHOTGUN, or SMG weapon is equipped
    const currentSlot = this.inventoryManager?.getCurrentSlot()
    if (this.inventoryManager && currentSlot !== WeaponSlot.PRIMARY && currentSlot !== WeaponSlot.SHOTGUN && currentSlot !== WeaponSlot.SMG) {
      return
    }

    if (event.button === 2) {
      // Right mouse - ADS toggle hold (can't ADS while reloading)
      if (!this.reload.isAnimating()) {
        this.animations.setADS(true)
      }
      return
    }
    if (event.button === 0) {
      // Left mouse - start firing (can't fire while reloading)
      if (!this.reload.isAnimating()) {
        this.isFiring = true
        this.tryFire()
      }
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button === 2) {
      this.animations.setADS(false)
    }
    if (event.button === 0) {
      // Stop firing when left mouse is released
      this.isFiring = false
    }
  }

  private updateWeaponTransform(): void {
    const weaponRig = this.rigManager.getCurrentRig()
    if (!weaponRig) return

    const adsProgress = this.animations.getADSProgress()
    const basePos = this.animations.getBasePosition()
    const adsPos = this.animations.getADSPosition()

    const px = THREE.MathUtils.lerp(basePos.x, adsPos.x, adsProgress)
    const py = THREE.MathUtils.lerp(basePos.y, adsPos.y, adsProgress)
    const pz = THREE.MathUtils.lerp(basePos.z, adsPos.z, adsProgress)

    // Get offsets from modules
    const recoilOffset = this.animations.getRecoilOffset()
    const bobOffset = this.animations.getBobOffset()
    const swayOffset = this.animations.getSwayOffset()
    const reloadTranslation = this.reload.getReloadTranslation()
    const switchOffset = this.rigManager.getSwitchOffset()

    // Apply position with all offsets
    weaponRig.position.set(
      px + bobOffset.x + swayOffset.x + recoilOffset.x + reloadTranslation.x,
      py + bobOffset.y + swayOffset.y + recoilOffset.y + reloadTranslation.y + switchOffset.y,
      pz + recoilOffset.z + reloadTranslation.z
    )

    // Set up base rotations to point barrel toward crosshair
    // Y rotation: turn gun to face forward and LEFT toward center
    const baseYRotation = Math.PI / 2 + THREE.MathUtils.degToRad(15) // ADD to rotate LEFT
    const adsYRotation = Math.PI / 2 // Straight forward for ADS
    weaponRig.rotation.y = THREE.MathUtils.lerp(baseYRotation, adsYRotation, adsProgress)

    // X rotation: tilt barrel UPWARD toward crosshair + reload animation + switch animation
    const baseXRotation = THREE.MathUtils.degToRad(18) // More upward tilt when not ADS
    const adsXRotation = 0 // Level for sight alignment
    const reloadRotation = this.reload.getReloadRotation()
    weaponRig.rotation.x = THREE.MathUtils.lerp(baseXRotation, adsXRotation, adsProgress) + recoilOffset.rotX + reloadRotation.x + switchOffset.rotX

    // Z rotation: cant the gun + reload tilt
    const baseCant = THREE.MathUtils.degToRad(-8) // Negative for proper cant
    const adsCant = 0 // No cant in ADS
    weaponRig.rotation.z = THREE.MathUtils.lerp(baseCant, adsCant, adsProgress) + reloadRotation.z
  }

  // Called by main game loop to render weapon overlay
  renderWeapon(renderer: THREE.WebGLRenderer): void {
    if (!this.rigManager.getCurrentRig()) return

    // Save current renderer state
    const currentAutoClear = renderer.autoClear
    renderer.autoClear = false

    // Clear depth buffer to render on top
    renderer.clearDepth()

    // Render weapon scene
    renderer.render(this.weaponScene, this.weaponCamera)

    // Restore renderer state
    renderer.autoClear = currentAutoClear
  }

  private tryFire(): void {
    const gunCore = this.rigManager.getCurrentCore()
    if (!this.combatantSystem || !gunCore.canFire() || !this.isEnabled) return

    // Check ammo
    if (!this.ammoManager.canFire()) {
      if (this.ammoManager.isEmpty()) {
        // Play empty click sound
        console.log('🔫 *click* - Empty magazine!')
        // Auto-reload if we have reserve ammo
        if (this.ammoManager.getState().reserveAmmo > 0) {
          this.startReload()
        }
      }
      return
    }

    // All validation passed - consume ammo and register shot BEFORE creating command
    if (!this.ammoManager.consumeRound()) return
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
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager
    this.firing.setAudioManager(audioManager)
    this.reload.setAudioManager(audioManager)
  }

  setStatsTracker(statsTracker: PlayerStatsTracker): void {
    this.statsTracker = statsTracker
    this.firing.setStatsTracker(statsTracker)
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager
    this.ammoManager.setZoneManager(zoneManager)
  }

  // Disable weapon (for death)
  disable(): void {
    this.isEnabled = false
    this.animations.setADS(false)
    this.animations.reset()
    this.rigManager.setWeaponVisibility(false)
  }

  // Enable weapon (for respawn)
  enable(): void {
    this.isEnabled = true
    this.rigManager.setWeaponVisibility(true)
    // Reset ammo on respawn
    this.ammoManager.reset()
  }

  setWeaponVisibility(visible: boolean): void {
    this.rigManager.setWeaponVisibility(visible)
  }

  // Set game started state
  setGameStarted(started: boolean): void {
    this.gameStarted = started
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.gameStarted || !this.isEnabled) return

    if (event.key.toLowerCase() === 'r') {
      this.startReload()
    }
  }

  private startReload(): void {
    // Can't reload while ADS
    if (this.animations.getADS()) {
      console.log('⚠️ Cannot reload while aiming')
      return
    }

    if (this.reload.startReload(() => this.ammoManager.startReload())) {
      this.isFiring = false // Stop firing during reload
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
    if (this.ammoManager.isLowAmmo()) {
      console.log('⚠️ Low ammo!')
    }
  }

  getAmmoState(): any {
    return this.ammoManager.getState()
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
    if (!enabled) {
      // Stop any current firing
      this.isFiring = false
      console.log('🚁 🔫 Firing disabled (in helicopter)')
    } else {
      console.log('🚁 🔫 Firing enabled (exited helicopter)')
    }
  }
}
