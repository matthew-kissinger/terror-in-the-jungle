import * as THREE from 'three'
import { WeaponRigManager } from './WeaponRigManager'
import { WeaponAnimations } from './WeaponAnimations'
import { WeaponReload } from './WeaponReload'

/**
 * Handles weapon 3D model rendering, camera setup, and transform calculations
 */
export class WeaponModel {
  private weaponScene: THREE.Scene
  private weaponCamera: THREE.OrthographicCamera
  private animations: WeaponAnimations
  private reload: WeaponReload

  constructor(
    animations: WeaponAnimations,
    reload: WeaponReload
  ) {
    this.animations = animations
    this.reload = reload

    // Create separate scene for weapon overlay
    this.weaponScene = new THREE.Scene()

    // Create orthographic camera for weapon rendering
    const aspect = window.innerWidth / window.innerHeight
    this.weaponCamera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10)
    this.weaponCamera.position.z = 1

    // Handle window resize
    window.addEventListener('resize', this.onWindowResize.bind(this))
  }

  getWeaponScene(): THREE.Scene {
    return this.weaponScene
  }

  getWeaponCamera(): THREE.OrthographicCamera {
    return this.weaponCamera
  }

  private onWindowResize(): void {
    const aspect = window.innerWidth / window.innerHeight
    this.weaponCamera.left = -aspect
    this.weaponCamera.right = aspect
    this.weaponCamera.updateProjectionMatrix()
  }

  /**
   * Update weapon transform based on ADS, recoil, bob, sway, reload, and switch animations
   */
  updateTransform(rigManager: WeaponRigManager): void {
    const weaponRig = rigManager.getCurrentRig()
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
    const switchOffset = rigManager.getSwitchOffset()

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

  /**
   * Render weapon overlay on top of main scene
   */
  render(renderer: THREE.WebGLRenderer, rigManager: WeaponRigManager): void {
    if (!rigManager.getCurrentRig()) return

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

  dispose(): void {
    window.removeEventListener('resize', this.onWindowResize.bind(this))
  }
}
