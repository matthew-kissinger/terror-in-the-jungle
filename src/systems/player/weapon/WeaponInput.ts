import { WeaponAnimations } from './WeaponAnimations'
import { WeaponReload } from './WeaponReload'
import { WeaponRigManager } from './WeaponRigManager'
import { InventoryManager, WeaponSlot } from '../InventoryManager'

/**
 * Handles weapon input: mouse/keyboard events, firing state, ADS
 */
export class WeaponInput {
  private isFiring = false
  private gameStarted = false
  private isEnabled = true

  private animations: WeaponAnimations
  private reload: WeaponReload
  private rigManager: WeaponRigManager
  private inventoryManager?: InventoryManager

  // Callbacks
  private onFireStart?: () => void
  private onFireStop?: () => void
  private onReloadStart?: () => void
  private boundOnMouseDown!: (event: MouseEvent) => void
  private boundOnMouseUp!: (event: MouseEvent) => void
  private boundOnKeyDown!: (event: KeyboardEvent) => void
  private boundOnContextMenu!: (event: Event) => void

  constructor(
    animations: WeaponAnimations,
    reload: WeaponReload,
    rigManager: WeaponRigManager
  ) {
    this.animations = animations
    this.reload = reload
    this.rigManager = rigManager

    // Input handlers
    this.boundOnMouseDown = this.onMouseDown.bind(this)
    this.boundOnMouseUp = this.onMouseUp.bind(this)
    this.boundOnKeyDown = this.onKeyDown.bind(this)
    this.boundOnContextMenu = (e: Event) => e.preventDefault()

    window.addEventListener('mousedown', this.boundOnMouseDown)
    window.addEventListener('mouseup', this.boundOnMouseUp)
    window.addEventListener('contextmenu', this.boundOnContextMenu)
    window.addEventListener('keydown', this.boundOnKeyDown)
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager
  }

  setGameStarted(started: boolean): void {
    this.gameStarted = started
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
    if (!enabled) {
      this.isFiring = false
    }
  }

  isFiringActive(): boolean {
    return this.isFiring
  }

  setFiringActive(active: boolean): void {
    this.isFiring = active
  }

  setOnFireStart(callback: () => void): void {
    this.onFireStart = callback
  }

  setOnFireStop(callback: () => void): void {
    this.onFireStop = callback
  }

  setOnReloadStart(callback: () => void): void {
    this.onReloadStart = callback
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
        if (this.onFireStart) {
          this.onFireStart()
        }
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
      if (this.onFireStop) {
        this.onFireStop()
      }
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.gameStarted || !this.isEnabled) return

    if (event.key.toLowerCase() === 'r') {
      if (this.onReloadStart) {
        this.onReloadStart()
      }
    }
  }

  /** Programmatic fire start – used by touch controls */
  triggerFireStart(): void {
    if (!this.gameStarted || !this.isEnabled || !this.rigManager.getCurrentRig()) return

    const currentSlot = this.inventoryManager?.getCurrentSlot()
    if (this.inventoryManager && currentSlot !== WeaponSlot.PRIMARY && currentSlot !== WeaponSlot.SHOTGUN && currentSlot !== WeaponSlot.SMG) {
      return
    }

    if (!this.reload.isAnimating()) {
      this.isFiring = true
      this.onFireStart?.()
    }
  }

  /** Programmatic fire stop – used by touch controls */
  triggerFireStop(): void {
    this.isFiring = false
    this.onFireStop?.()
  }

  /** Programmatic reload – used by touch controls */
  triggerReload(): void {
    if (!this.gameStarted || !this.isEnabled) return
    this.onReloadStart?.()
  }

  dispose(): void {
    window.removeEventListener('mousedown', this.boundOnMouseDown)
    window.removeEventListener('mouseup', this.boundOnMouseUp)
    window.removeEventListener('contextmenu', this.boundOnContextMenu)
    window.removeEventListener('keydown', this.boundOnKeyDown)
  }
}
