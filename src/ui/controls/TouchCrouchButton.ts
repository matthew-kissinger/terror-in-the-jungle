/**
 * Crouch toggle button for mobile touch controls.
 * Tap to crouch, tap again to stand. Positioned bottom-left above the joystick.
 */

import { BaseTouchButton } from './BaseTouchButton';
import styles from './TouchCrouchButton.module.css';

export class TouchCrouchButton extends BaseTouchButton {
  private isCrouched = false;

  private onCrouchToggle?: (crouching: boolean) => void;

  protected build(): void {
    this.root.className = styles.crouchBtn;
    this.root.id = 'touch-crouch-btn';
    this.root.textContent = 'CRCH';
  }

  protected onMount(): void {
    this.bindPress(this.root, {
      onUp: () => {
        this.isCrouched = !this.isCrouched;
        this.updateVisual();
        this.onCrouchToggle?.(this.isCrouched);
      },
    });
  }

  setOnCrouchToggle(callback: (crouching: boolean) => void): void {
    this.onCrouchToggle = callback;
  }

  /** Reset crouch state (e.g. on respawn) */
  resetCrouch(): void {
    if (this.isCrouched) {
      this.isCrouched = false;
      this.releaseAllPointers();
      this.updateVisual();
      this.onCrouchToggle?.(false);
    }
  }

  getCrouched(): boolean {
    return this.isCrouched;
  }

  private updateVisual(): void {
    this.root.classList.toggle(styles.crouched, this.isCrouched);
  }

  /** Re-parent into a grid slot. */
  mountTo(parent: HTMLElement): void {
    this.root.classList.add(styles.slotted);
    this.reparentTo(parent);
  }

  show(): void {
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
    this.resetCrouch();
  }
}
