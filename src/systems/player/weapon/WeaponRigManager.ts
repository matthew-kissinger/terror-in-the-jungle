// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Logger } from '../../../utils/Logger';
import * as THREE from 'three'
import { GunplayCore, WeaponSpec } from '../../weapons/GunplayCore'
import type { IAmmoManager, IAudioManager, IHUDSystem } from '../../../types/SystemInterfaces'
import { modelLoader } from '../../assets/ModelLoader'
import { WeaponModels, warAssetCatalog } from '../../assets/modelPaths'
import { Faction, isBlufor } from '../../combat/types'

/**
 * Per-rig catalog slug, so magazine/muzzle node discovery reads the normalized
 * repaint metadata (warAssetCatalog) instead of fuzzy substring matching. The
 * repaint weapon node vocabulary drifted per asset (e.g. m16 magazine is
 * Mesh_MagSeg1-3 + decals + Mesh_MagFloor, NOT Mesh_Magazine; a loose 'mag'
 * search would wrongly capture Mesh_Magwell), so the catalog is the single
 * source of truth for which nodes the reload animation may move. Weapons with
 * no catalog magazine/muzzle metadata fall back to the bbox max-Z marker.
 */
type WeaponRigSlug = 'm16a1' | 'ak47' | 'ithaca37' | 'm3-grease-gun' | 'm1911' | 'm60' | 'm79'

/**
 * Manages weapon model creation and switching between rifle/shotgun/SMG
 */
export class WeaponRigManager {
  private weaponScene: THREE.Scene
  private m16RifleRig?: THREE.Group
  private akRifleRig?: THREE.Group
  private shotgunRig?: THREE.Group
  private smgRig?: THREE.Group
  private pistolRig?: THREE.Group
  private m60Rig?: THREE.Group
  private m79Rig?: THREE.Group
  private weaponRig?: THREE.Group // Current active weapon rig root
  private muzzleRef?: THREE.Object3D
  private magazineRef?: THREE.Object3D
  private pumpGripRef?: THREE.Object3D
  private activeRifleFaction: Faction = Faction.US
  private currentWeaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher' = 'rifle'

  // Weapon cores
  private rifleCore: GunplayCore
  private shotgunCore: GunplayCore
  private smgCore: GunplayCore
  private pistolCore: GunplayCore
  private lmgCore: GunplayCore
  private launcherCore: GunplayCore
  private gunCore: GunplayCore // Current active weapon core

  // Base position (relative to screen)
  private readonly basePosition = { x: 0.5, y: -0.6, z: -0.82 }

  // Weapon switch animation state
  private isSwitchingWeapon = false
  private switchAnimationProgress = 0
  private readonly SWITCH_ANIMATION_TIME = 0.4 // 400ms total switch time
  private switchOffset = { y: 0, rotX: 0 }
  private pendingWeaponSwitch?: 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher'

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

    const lmgSpec: WeaponSpec = {
      name: 'LMG', rpm: 550, adsTime: 0.3,
      baseSpreadDeg: 1.5, bloomPerShotDeg: 0.12,
      recoilPerShotDeg: 0.8, recoilHorizontalDeg: 0.5,
      damageNear: 38, damageFar: 28, falloffStart: 25, falloffEnd: 80,
      headshotMultiplier: 1.5, penetrationPower: 1.2
    }

    const launcherSpec: WeaponSpec = {
      name: 'Grenade Launcher', rpm: 30, adsTime: 0.25,
      baseSpreadDeg: 0.5, bloomPerShotDeg: 0,
      recoilPerShotDeg: 3.0, recoilHorizontalDeg: 0.5,
      damageNear: 0, damageFar: 0, falloffStart: 0, falloffEnd: 0,
      headshotMultiplier: 1.0, penetrationPower: 0
    }

    // Initialize all weapon cores
    this.rifleCore = new GunplayCore(rifleSpec)
    this.shotgunCore = new GunplayCore(shotgunSpec)
    this.smgCore = new GunplayCore(smgSpec)
    this.pistolCore = new GunplayCore(pistolSpec)
    this.lmgCore = new GunplayCore(lmgSpec)
    this.launcherCore = new GunplayCore(launcherSpec)
    this.gunCore = this.rifleCore // Start with rifle
  }

  async init(): Promise<void> {
    // Load GLB weapon models in parallel
    const [m16Scene, akScene, shotgunScene, smgScene, pistolScene, m60Scene, m79Scene] = await Promise.all([
      modelLoader.loadModel(WeaponModels.M16A1),
      modelLoader.loadModel(WeaponModels.AK47),
      modelLoader.loadModel(WeaponModels.ITHACA37),
      modelLoader.loadModel(WeaponModels.M3_GREASE_GUN),
      modelLoader.loadModel(WeaponModels.M1911),
      modelLoader.loadModel(WeaponModels.M60),
      modelLoader.loadModel(WeaponModels.M79),
    ])

    this.m16RifleRig = this.prepareWeaponRig(m16Scene, 1.5, false, 'm16a1')
    this.m16RifleRig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z)
    this.weaponScene.add(this.m16RifleRig)

    this.akRifleRig = this.prepareWeaponRig(akScene, 1.5, false, 'ak47')
    this.akRifleRig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z)
    this.akRifleRig.visible = false
    this.weaponScene.add(this.akRifleRig)

    this.shotgunRig = this.prepareWeaponRig(shotgunScene, 1.5, true, 'ithaca37')
    this.shotgunRig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z)
    this.shotgunRig.visible = false
    this.weaponScene.add(this.shotgunRig)

    this.smgRig = this.prepareWeaponRig(smgScene, 1.5, false, 'm3-grease-gun')
    this.smgRig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z)
    this.smgRig.visible = false
    this.weaponScene.add(this.smgRig)

    this.pistolRig = this.prepareWeaponRig(pistolScene, 1.7, false, 'm1911')
    this.pistolRig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z)
    this.pistolRig.visible = false
    this.weaponScene.add(this.pistolRig)

    this.m60Rig = this.prepareWeaponRig(m60Scene, 1.5, false, 'm60')
    this.m60Rig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z)
    this.m60Rig.visible = false
    this.weaponScene.add(this.m60Rig)

    this.m79Rig = this.prepareWeaponRig(m79Scene, 1.5, false, 'm79')
    this.m79Rig.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z)
    this.m79Rig.visible = false
    this.weaponScene.add(this.m79Rig)

    // Start with the BLUFOR rifle active
    this.currentWeaponType = 'rifle'
    this.weaponRig = this.getActiveRifleRig()
    if (!this.weaponRig) {
      throw new Error('Active rifle rig was not initialized')
    }
    this.setRifleRigVisibility(true)
    this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined
    this.magazineRef = this.weaponRig.getObjectByName('magazine') || undefined
    this.pumpGripRef = undefined
  }

  /**
   * Prepare a loaded GLB scene for first-person weapon display.
   * GLB models face +Z (importer-normalized convention), weapon scene expects
   * barrel along +X. Converts MeshStandardMaterial to MeshBasicMaterial for
   * unlit FPS overlay. Adds named markers (muzzle, magazine) for animations.
   *
   * Magazine + muzzle nodes come from the generated `warAssetCatalog`
   * (`magazineNodes` / `muzzleNodes`) keyed by the weapon's catalog slug, so the
   * reload group contains exactly the per-asset magazine meshes and the muzzle
   * marker rides the per-asset flash hider / muzzle device. Weapons without
   * catalog node metadata (ithaca37, m3-grease-gun, m1911, m79) fall back to a
   * barrel-tip bbox marker for the muzzle and skip the detachable-mag group.
   */
  private prepareWeaponRig(scene: THREE.Group, scale: number, isShotgun: boolean, slug: WeaponRigSlug): THREE.Group {
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

    const catalogEntry = warAssetCatalog[slug]
    const magazineNodes = catalogEntry?.magazineNodes ?? []
    const muzzleNodes = catalogEntry?.muzzleNodes ?? []

    // Wire the catalog magazine meshes under a single 'magazine' group so the
    // reload animation moves exactly those nodes and nothing else. Belt-fed
    // (m60), break-action (m79), and the fixed-tube shotgun (ithaca37) have no
    // catalog magazine nodes, so no detachable-mag group is created for them.
    if (!isShotgun && magazineNodes.length > 0 && !rig.getObjectByName('magazine')) {
      const magParts: THREE.Object3D[] = []
      for (const nodeName of magazineNodes) {
        const part = scene.getObjectByName(nodeName)
        if (part) magParts.push(part)
      }
      // Some catalog magazine entries are CHILDREN of other magazine meshes
      // (e.g. the m16 MagSeg decals are children of MagSeg2 / MagSeg3 with a
      // ~9mm decal-local offset). Re-parenting a child whose ancestor is also
      // being re-parented double-moves it. Drop any entry that already has an
      // ancestor in the magazine set: it rides along with that ancestor when
      // the ancestor is attached, so its world pose stays exactly correct.
      const magSet = new Set(magParts)
      const topLevelMagParts = magParts.filter((part) => {
        for (let p = part.parent; p; p = p.parent) {
          if (magSet.has(p)) return false
        }
        return true
      })
      if (topLevelMagParts.length > 0) {
        // Build the magazine group INSIDE the mag parts' original parent (the
        // weapon body node, under the importer's TIJ_AxisNormalize wrapper) and
        // move the parts in with `attach()`, which preserves each part's WORLD
        // transform by baking the wrapper rotation + body offset into its new
        // local transform. The previous `scene.add(magGroup)` re-homed the mag
        // at the GLTF scene ROOT — outside the axis wrapper — and applied a
        // body-local pivot in scene-root space, leaving the magazine rotated
        // ~90deg and offset from the magwell from rig load. Same defect class
        // as the m48 turret fix (commit 38d98f7d).
        const parent = topLevelMagParts[0].parent ?? scene
        const magGroup = new THREE.Group()
        magGroup.name = 'magazine'
        // Seat the group pivot at the magazine's own location in the SAME
        // (body-node-local) space the parts live in, so the reload animation —
        // which offsets the group's local position around this base pose — drops
        // the mag along the body node's +Y (still up, pre-wrapper).
        magGroup.position.copy(topLevelMagParts[0].position)
        parent.add(magGroup)
        for (const part of topLevelMagParts) magGroup.attach(part)
      }
    }

    // Attach a muzzle marker at the actual barrel tip. The catalog muzzleNodes
    // name the per-asset flash hider / muzzle device meshes; the marker rides
    // the first one found. Weapons without catalog muzzle metadata fall back to
    // the barrel mesh, then to a fixed forward offset.
    if (!rig.getObjectByName('muzzle')) {
      const muzzleTipNames = [...muzzleNodes, 'Mesh_Barrel']
      const muzzle = new THREE.Object3D()
      muzzle.name = 'muzzle'

      let attached = false
      for (const name of muzzleTipNames) {
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

  getLMGCore(): GunplayCore {
    return this.lmgCore
  }

  getLauncherCore(): GunplayCore {
    return this.launcherCore
  }

  startWeaponSwitch(weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher', _hudSystem?: IHUDSystem, _audioManager?: IAudioManager, _ammoManager?: IAmmoManager): boolean {
    // A switch already in flight to a DIFFERENT target must be superseded, not
    // dropped. Dropping it desynced the equipped weapon from the selected
    // loadout at spawn: the deploy-apply path issues several switch requests in
    // a row (inventory slot reset + setPrimaryWeapon), and the stale first
    // request used to win while the authoritative primary request was rejected.
    // Re-pointing the pending switch makes the call idempotent: the last
    // requested weapon always wins. (loadout-deploy-equip-match)
    if (this.isSwitchingWeapon) {
      // The in-flight destination is `pendingWeaponSwitch` (which may already
      // have been applied to `currentWeaponType` past the animation midpoint).
      // Only a request for that same destination is a no-op; any other target,
      // including one matching the PRE-switch `currentWeaponType`, re-points the
      // switch. Comparing to `currentWeaponType` alone is unsafe here because it
      // has not yet caught up to the in-flight destination.
      const destination = this.pendingWeaponSwitch ?? this.currentWeaponType
      if (weaponType === destination) {
        return false
      }
      Logger.info('player', ` Re-targeting in-flight switch to ${weaponType}`)
      this.pendingWeaponSwitch = weaponType
      return true
    }

    // Don't switch if already the current weapon
    if (weaponType === this.currentWeaponType) {
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

  private performWeaponSwitch(weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher', hudSystem?: IHUDSystem, audioManager?: IAudioManager, ammoManager?: IAmmoManager): void {
    // The LOGICAL equipped weapon is authoritative regardless of whether the
    // rendered GLB rigs have loaded yet. Track it before the rig-null guard so
    // the equipped weapon always matches the requested one (the visible model
    // swap below is best-effort and resolves once rigs exist).
    this.currentWeaponType = weaponType

    // Actually switch the visible weapon models
    if (!this.m16RifleRig || !this.akRifleRig || !this.shotgunRig || !this.smgRig || !this.pistolRig || !this.m60Rig || !this.m79Rig) return

    this.setRifleRigVisibility(false)
    this.shotgunRig.visible = false
    this.smgRig.visible = false
    this.pistolRig.visible = false
    this.m60Rig.visible = false
    this.m79Rig.visible = false

    switch (weaponType) {
      case 'rifle':
        this.setRifleRigVisibility(true)
        this.weaponRig = this.getActiveRifleRig()
        if (!this.weaponRig) {
          throw new Error('Active rifle rig was not initialized')
        }
        this.gunCore = this.rifleCore
        this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined
        this.magazineRef = this.weaponRig.getObjectByName('magazine') || undefined
        this.pumpGripRef = undefined
        break
      case 'shotgun':
        this.shotgunRig.visible = true
        this.weaponRig = this.shotgunRig
        this.gunCore = this.shotgunCore
        this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined
        this.magazineRef = undefined // Ithaca 37 has fixed tubular mag - no reload animation
        this.pumpGripRef = undefined // No pump grip animation
        break
      case 'smg':
        this.smgRig.visible = true
        this.weaponRig = this.smgRig
        this.gunCore = this.smgCore
        this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined
        this.magazineRef = this.weaponRig.getObjectByName('magazine') || undefined
        this.pumpGripRef = undefined
        break
      case 'pistol':
        this.pistolRig.visible = true
        this.weaponRig = this.pistolRig
        this.gunCore = this.pistolCore
        this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined
        this.magazineRef = this.weaponRig.getObjectByName('magazine') || undefined
        this.pumpGripRef = undefined
        break
      case 'lmg':
        this.m60Rig.visible = true
        this.weaponRig = this.m60Rig
        this.gunCore = this.lmgCore
        this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined
        this.magazineRef = this.weaponRig.getObjectByName('magazine') || undefined
        this.pumpGripRef = undefined
        break
      case 'launcher':
        this.m79Rig.visible = true
        this.weaponRig = this.m79Rig
        this.gunCore = this.launcherCore
        this.muzzleRef = this.weaponRig.getObjectByName('muzzle') || undefined
        this.magazineRef = undefined // M79 is break-action, no detachable magazine
        this.pumpGripRef = undefined
        break
    }

    // Notify HUD about weapon switch
    if (hudSystem && hudSystem.showWeaponSwitch) {
      const weaponNames = { rifle: 'RIFLE', shotgun: 'SHOTGUN', smg: 'SMG', pistol: 'PISTOL', lmg: 'LMG', launcher: 'LAUNCHER' }
      const weaponIcons = { rifle: 'AR', shotgun: 'SG', smg: 'SM', pistol: 'PT', lmg: 'MG', launcher: 'GL' }
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

  /** The logical weapon currently equipped (independent of switch animation). */
  getCurrentWeaponType(): 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher' {
    return this.currentWeaponType
  }

  setRifleFaction(faction: Faction): void {
    this.activeRifleFaction = faction
    if (this.currentWeaponType === 'rifle') {
      const visible = this.weaponRig?.visible ?? true
      this.setRifleRigVisibility(visible)
      this.weaponRig = this.getActiveRifleRig()
      this.muzzleRef = this.weaponRig?.getObjectByName('muzzle') || undefined
      this.magazineRef = this.weaponRig?.getObjectByName('magazine') || undefined
      this.pumpGripRef = undefined
    }
  }

  setWeaponVisibility(visible: boolean): void {
    if (this.currentWeaponType === 'rifle') {
      this.setRifleRigVisibility(visible)
      return
    }

    if (this.weaponRig) {
      this.weaponRig.visible = visible
    }
  }

  setAllWeaponVisibility(visible: boolean): void {
    if (visible) {
      this.setWeaponVisibility(true)
      return
    }

    const rigs = [
      this.m16RifleRig,
      this.akRifleRig,
      this.shotgunRig,
      this.smgRig,
      this.pistolRig,
      this.m60Rig,
      this.m79Rig,
    ]
    for (const rig of rigs) {
      if (rig) {
        rig.visible = false
      }
    }
  }

  private getActiveRifleRig(): THREE.Group | undefined {
    return isBlufor(this.activeRifleFaction)
      ? this.m16RifleRig
      : this.akRifleRig
  }

  private setRifleRigVisibility(visible: boolean): void {
    const useBluforRifle = isBlufor(this.activeRifleFaction)
    if (this.m16RifleRig) {
      this.m16RifleRig.visible = useBluforRifle ? visible : false
    }
    if (this.akRifleRig) {
      this.akRifleRig.visible = useBluforRifle ? false : visible
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
