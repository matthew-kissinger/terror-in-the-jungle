import { Logger } from '../../../utils/Logger';
import * as THREE from 'three'
import { GunplayCore, WeaponSpec } from '../../weapons/GunplayCore'
import type { IAmmoManager, IAudioManager, IHUDSystem } from '../../../types/SystemInterfaces'
import { modelLoader } from '../../assets/ModelLoader'
import { WeaponModels } from '../../assets/modelPaths'

/**
 * Manages weapon model creation and switching between rifle/shotgun/SMG
 */
export class WeaponRigManager {
  private weaponScene: THREE.Scene
  private rifleRig?: THREE.Group
  private shotgunRig?: THREE.Group
  private smgRig?: THREE.Group
  private pistolRig?: THREE.Group
  private weaponRig?: THREE.Group // Current active weapon rig root
  private muzzleRef?: THREE.Object3D
  private magazineRef?: THREE.Object3D
  private pumpGripRef?: THREE.Object3D

  // Weapon cores
  private rifleCore: GunplayCore
  private shotgunCore: GunplayCore
  private smgCore: GunplayCore
  private pistolCore: GunplayCore
  private gunCore: GunplayCore // Current active weapon core

  // Base position (relative to screen)
  private readonly basePosition = { x: 0.5, y: -0.45, z: -0.75 }

  // Weapon switch animation state
  private isSwitchingWeapon = false
  private switchAnimationProgress = 0
  private readonly SWITCH_ANIMATION_TIME = 0.4 // 400ms total switch time
  private switchOffset = { y: 0, rotX: 0 }
  private pendingWeaponSwitch?: 'rifle' | 'shotgun' | 'smg' | 'pistol'

  constructor(weaponScene: THREE.Scene) {
    this.weaponScene = weaponScene

    // Initialize weapon specs
    const rifleSpec: WeaponSpec = {
      name: 'Rifle', rpm: 700, adsTime: 0.18,
      baseSpreadDeg: 0.8, bloomPerShotDeg: 0.25,
      recoilPerShotDeg: 0.65, recoilHorizontalDeg: 0.35,
      damageNear: 34, damageFar: 24, falloffStart: 20, falloffEnd: 60,
      headshotMultiplier: 1.7, penetrationPower: 1
    }

    const shotgunSpec: WeaponSpec = {
      name: 'Shotgun', rpm: 75, adsTime: 0.22,
      baseSpreadDeg: 2.5, bloomPerShotDeg: 1.0,
      recoilPerShotDeg: 2.5, recoilHorizontalDeg: 0.8,
      damageNear: 15, damageFar: 4, falloffStart: 8, falloffEnd: 25,
      headshotMultiplier: 1.5, penetrationPower: 0.5,
      pelletCount: 10, pelletSpreadDeg: 8
    }

    const smgSpec: WeaponSpec = {
      name: 'SMG', rpm: 900, adsTime: 0.15,
      baseSpreadDeg: 1.2, bloomPerShotDeg: 0.15,
      recoilPerShotDeg: 0.35, recoilHorizontalDeg: 0.25,
      damageNear: 22, damageFar: 12, falloffStart: 15, falloffEnd: 40,
      headshotMultiplier: 1.4, penetrationPower: 0.8
    }

    const pistolSpec: WeaponSpec = {
      name: 'Pistol', rpm: 300, adsTime: 0.1,
      baseSpreadDeg: 0.6, bloomPerShotDeg: 0.2,
      recoilPerShotDeg: 0.5, recoilHorizontalDeg: 0.3,
      damageNear: 25, damageFar: 15, falloffStart: 12, falloffEnd: 35,
      headshotMultiplier: 1.6, penetrationPower: 0.7
    }

    // Initialize all weapon cores
    this.rifleCore = new GunplayCore(rifleSpec)
    this.shotgunCore = new GunplayCore(shotgunSpec)
    this.smgCore = new GunplayCore(smgSpec)
    this.pistolCore = new GunplayCore(pistolSpec)
    this.gunCore = this.rifleCore // Start with rifle
  }

  async init(): Promise<void> {
    // Load GLB weapon models in parallel
    const [rifleScene, shotgunScene, smgScene, pistolScene] = await Promise.all([
      modelLoader.loadModel(WeaponModels.M16A1),
      modelLoader.loadModel(WeaponModels.ITHACA37),
      modelLoader.loadModel(WeaponModels.M3_GREASE_GUN),
      modelLoader.loadModel(WeaponModels.M1911),
    ])

    // Configure each weapon rig: barrel along +X, use MeshBasicMaterial for
    // first-person overlay (unlit, matches weapon scene rendering)
    this.rifleRig = this.prepareWeaponRig(rifleScene, 1.5, false)
    this.rifleRig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z)
    this.weaponScene.add(this.rifleRig)

    this.shotgunRig = this.prepareWeaponRig(shotgunScene, 1.5, true)
    this.shotgunRig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z)
    this.shotgunRig.visible = false
    this.weaponScene.add(this.shotgunRig)

    this.smgRig = this.prepareWeaponRig(smgScene, 1.5, false)
    this.smgRig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z)
    this.smgRig.visible = false
    this.weaponScene.add(this.smgRig)

    this.pistolRig = this.prepareWeaponRig(pistolScene, 1.7, false)
    this.pistolRig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z)
    this.pistolRig.visible = false
    this.weaponScene.add(this.pistolRig)

    // Start with rifle active
    this.weaponRig = this.rifleRig
    this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined
    this.magazineRef = this.weaponRig.getObjectByName('magazine') || undefined
    this.pumpGripRef = undefined
  }

  /**
   * Prepare a loaded GLB scene for first-person weapon display.
   * GLB models face +Z (convention), weapon scene expects barrel along +X.
   * Converts MeshStandardMaterial to MeshBasicMaterial for unlit FPS overlay.
   * Adds fallback named markers (muzzle, magazine, pumpGrip) for animations.
   */
  private prepareWeaponRig(scene: THREE.Group, scale: number, isShotgun: boolean): THREE.Group {
    const rig = new THREE.Group()

    // Rotate so +Z-facing GLB barrel points along +X (rig-local barrel axis)
    // +π/2 around Y: +Z → +X, then updateTransform's +π/2 sends +X → -Z (away from player)
    scene.rotation.y = Math.PI / 2

    // Convert to unlit materials for weapon overlay scene
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const std = child.material
        child.material = new THREE.MeshBasicMaterial({
          color: std.color,
          map: std.map,
          transparent: std.transparent,
          opacity: std.opacity,
        })
        std.dispose()
      }
    })

    rig.add(scene)
    rig.scale.set(scale, scale, scale)

    // Wire GLB magazine meshes under a 'magazine' group for reload animation.
    // Shotgun (Ithaca 37) has a fixed tubular magazine - no detachable mag animation.
    // GLB nodes: Mesh_Magazine, Mesh_MagFloorPlate, Mesh_MagFeedLips, Mesh_MagBase, Mesh_MagazineBase
    if (!isShotgun && !rig.getObjectByName('magazine')) {
      const magParts: THREE.Object3D[] = []
      scene.traverse((child) => {
        const n = child.name.toLowerCase()
        if (n.includes('magazine') || n === 'mesh_magfloorplate' || n === 'mesh_magfeedlips' || n === 'mesh_magbase') {
          magParts.push(child)
        }
      })
      if (magParts.length > 0) {
        // Group magazine parts under a single parent so reload moves them all
        const magGroup = new THREE.Group()
        magGroup.name = 'magazine'
        // Use first part's position as pivot
        const pivot = magParts[0].position.clone()
        magGroup.position.copy(pivot)
        for (const part of magParts) {
          part.removeFromParent()
          part.position.sub(pivot)
          magGroup.add(part)
        }
        scene.add(magGroup)
      } else {
        // Fallback invisible marker
        const magazine = new THREE.Object3D()
        magazine.name = 'magazine'
        magazine.position.set(0.2, -0.25, 0)
        magazine.rotation.set(0, 0, 0.1)
        rig.add(magazine)
      }
    }

    // Attach a muzzle marker at the actual barrel tip.
    // Priority list matches the four weapon GLBs:
    //   Mesh_FlashHider  → M16A1  (flash hider at barrel end)
    //   Mesh_Muzzle      → M3 Grease Gun (dedicated muzzle node)
    //   Mesh_FrontBead   → Ithaca37 (front bead at muzzle end)
    //   Mesh_BarrelBushing → M1911 (bushing at barrel muzzle end)
    //   Mesh_Barrel      → universal fallback
    if (!rig.getObjectByName('muzzle')) {
      const MUZZLE_TIP_NAMES = [
        'Mesh_FlashHider',
        'Mesh_Muzzle',
        'Mesh_FrontBead',
        'Mesh_BarrelBushing',
        'Mesh_Barrel',
      ]
      const muzzle = new THREE.Object3D()
      muzzle.name = 'muzzle'

      let attached = false
      for (const name of MUZZLE_TIP_NAMES) {
        const tipNode = rig.getObjectByName(name)
        if (tipNode instanceof THREE.Mesh && tipNode.geometry) {
          tipNode.geometry.computeBoundingBox()
          const bbox = tipNode.geometry.boundingBox
          if (bbox) {
            // In GLB convention the barrel faces +Z; bbox.max.z is the forward tip.
            // The GLB scene is rotated π/2 around Y so +Z → +X in rig space,
            // meaning this offset moves the marker to the physical muzzle tip.
            muzzle.position.set(0, 0, bbox.max.z)
          }
          tipNode.add(muzzle)
          attached = true
          break
        }
      }

      if (!attached) {
        muzzle.position.set(1.7, 0, 0)
        rig.add(muzzle)
      }
    }

    return rig
  }

  getCurrentRig(): THREE.Group | undefined {
    return this.weaponRig
  }

  getMuzzleRef(): THREE.Object3D | undefined {
    return this.muzzleRef
  }

  getMagazineRef(): THREE.Object3D | undefined {
    return this.magazineRef
  }

  getPumpGripRef(): THREE.Object3D | undefined {
    return this.pumpGripRef
  }

  getCurrentCore(): GunplayCore {
    return this.gunCore
  }

  getRifleCore(): GunplayCore {
    return this.rifleCore
  }

  getShotgunCore(): GunplayCore {
    return this.shotgunCore
  }

  getSMGCore(): GunplayCore {
    return this.smgCore
  }

  getPistolCore(): GunplayCore {
    return this.pistolCore
  }

  startWeaponSwitch(weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol', _hudSystem?: IHUDSystem, _audioManager?: IAudioManager, _ammoManager?: IAmmoManager): boolean {
    // Don't switch if already the current weapon
    if ((weaponType === 'rifle' && this.weaponRig === this.rifleRig) ||
        (weaponType === 'shotgun' && this.weaponRig === this.shotgunRig) ||
        (weaponType === 'smg' && this.weaponRig === this.smgRig) ||
        (weaponType === 'pistol' && this.weaponRig === this.pistolRig)) {
      return false
    }

    // Can't switch while already switching
    if (this.isSwitchingWeapon) {
      return false
    }

    Logger.info('player', ` Switching to ${weaponType}`)
    this.isSwitchingWeapon = true
    this.switchAnimationProgress = 0
    this.pendingWeaponSwitch = weaponType
    return true
  }

  updateSwitchAnimation(deltaTime: number, hudSystem?: IHUDSystem, audioManager?: IAudioManager, ammoManager?: IAmmoManager): void {
    if (!this.isSwitchingWeapon) return

    // Update switch animation progress
    this.switchAnimationProgress += deltaTime / this.SWITCH_ANIMATION_TIME

    if (this.switchAnimationProgress >= 1) {
      // Animation complete
      this.switchAnimationProgress = 1
      this.isSwitchingWeapon = false
      this.switchOffset = { y: 0, rotX: 0 }
      return
    }

    // Calculate switch animation based on progress
    this.calculateSwitchAnimation(this.switchAnimationProgress, hudSystem, audioManager, ammoManager)
  }

  private calculateSwitchAnimation(progress: number, hudSystem?: IHUDSystem, audioManager?: IAudioManager, ammoManager?: IAmmoManager): void {
    // Two-stage switch animation:
    // Stage 1 (0-50%): Lower current weapon (move down and rotate forward)
    // Stage 2 (50-100%): Raise new weapon (move up from below)

    if (progress < 0.5) {
      // Stage 1: Lower weapon
      const t = progress / 0.5
      const ease = this.easeInCubic(t)
      this.switchOffset.y = -0.8 * ease // Move down
      this.switchOffset.rotX = THREE.MathUtils.degToRad(30) * ease // Tilt forward
    } else {
      // At midpoint (when we first cross 0.5), perform the actual weapon switch
      if (this.pendingWeaponSwitch) {
        this.performWeaponSwitch(this.pendingWeaponSwitch, hudSystem, audioManager, ammoManager)
        this.pendingWeaponSwitch = undefined
      }

      // Stage 2: Raise new weapon
      const t = (progress - 0.5) / 0.5
      const ease = this.easeOutCubic(t)
      this.switchOffset.y = -0.8 * (1 - ease) // Move up from below
      this.switchOffset.rotX = THREE.MathUtils.degToRad(30) * (1 - ease) // Straighten
    }
  }

  private performWeaponSwitch(weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol', hudSystem?: IHUDSystem, audioManager?: IAudioManager, ammoManager?: IAmmoManager): void {
    // Actually switch the visible weapon models
    if (!this.rifleRig || !this.shotgunRig || !this.smgRig || !this.pistolRig) return

    switch (weaponType) {
      case 'rifle':
        this.rifleRig.visible = true
        this.shotgunRig.visible = false
        this.smgRig.visible = false
        this.pistolRig.visible = false
        this.weaponRig = this.rifleRig
        this.gunCore = this.rifleCore
        this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined
        this.magazineRef = this.weaponRig.getObjectByName('magazine') || undefined
        this.pumpGripRef = undefined
        break
      case 'shotgun':
        this.rifleRig.visible = false
        this.shotgunRig.visible = true
        this.smgRig.visible = false
        this.pistolRig.visible = false
        this.weaponRig = this.shotgunRig
        this.gunCore = this.shotgunCore
        this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined
        this.magazineRef = undefined // Ithaca 37 has fixed tubular mag - no reload animation
        this.pumpGripRef = undefined // No pump grip animation
        break
      case 'smg':
        this.rifleRig.visible = false
        this.shotgunRig.visible = false
        this.smgRig.visible = true
        this.pistolRig.visible = false
        this.weaponRig = this.smgRig
        this.gunCore = this.smgCore
        this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined
        this.magazineRef = this.weaponRig.getObjectByName('magazine') || undefined
        this.pumpGripRef = undefined
        break
      case 'pistol':
        this.rifleRig.visible = false
        this.shotgunRig.visible = false
        this.smgRig.visible = false
        this.pistolRig.visible = true
        this.weaponRig = this.pistolRig
        this.gunCore = this.pistolCore
        this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined
        this.magazineRef = this.weaponRig.getObjectByName('magazine') || undefined
        this.pumpGripRef = undefined
        break
    }

    // Notify HUD about weapon switch
    if (hudSystem && hudSystem.showWeaponSwitch) {
      const weaponNames = { rifle: 'RIFLE', shotgun: 'SHOTGUN', smg: 'SMG', pistol: 'PISTOL' }
      const weaponIcons = { rifle: 'AR', shotgun: 'SG', smg: 'SM', pistol: 'PT' }
      const ammoState = ammoManager?.getState() || { currentMagazine: 0, reserveAmmo: 0 }
      hudSystem.showWeaponSwitch(
        weaponNames[weaponType],
        weaponIcons[weaponType],
        `${ammoState.currentMagazine} / ${ammoState.reserveAmmo}`
      )
    }

    // Play weapon switch sound
    if (audioManager && audioManager.playWeaponSwitchSound) {
      audioManager.playWeaponSwitchSound()
    }
  }

  getSwitchOffset(): { y: number; rotX: number } {
    return this.switchOffset
  }

  isSwitching(): boolean {
    return this.isSwitchingWeapon
  }

  setWeaponVisibility(visible: boolean): void {
    if (this.weaponRig) {
      this.weaponRig.visible = visible
    }
  }

  // Easing functions
  private easeInCubic(t: number): number {
    return t * t * t
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }
}
