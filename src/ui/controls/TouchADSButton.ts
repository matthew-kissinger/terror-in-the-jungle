/**
 * ADS (Aim Down Sights) button for mobile touch controls.
 * Hold to aim, release to stop aiming. Uses pointer events.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

export class TouchADSButton extends UIComponent {
  private isActive = false;
  private activePointerId: number | null = null;

  private onADSToggle?: (active: boolean) => void;

  protected build(): void {
    this.root.className = styles.adsBtn;
    this.root.id = 'touch-ads-btn';
    this.root.textContent = 'ADS';
  }

  protected onMount(): void {
    this.listen(this.root, 'pointerdown', this.handlePointerDown, { passive: false });
    this.listen(this.root, 'pointerup', this.handlePointerUp, { passive: false });
    this.listen(this.root, 'pointercancel', this.handlePointerCancel, { passive: false });
  }

  setOnADSToggle(callback: (active: boolean) => void): void {
    this.onADSToggle = callback;
  }

  /** Reset ADS state (e.g. on weapon switch) */
  resetADS(): void {
    if (this.isActive) {
      this.isActive = false;
      this.activePointerId = null;
      this.updateVisual();
      this.onADSToggle?.(false);
    }
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.isActive) return;
    this.activePointerId = e.pointerId;
    if (typeof this.root.setPointerCapture === 'function') {
      this.root.setPointerCapture(e.pointerId);
    }
    this.isActive = true;
    this.updateVisual();
    this.onADSToggle?.(true);
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    e.stopPropagation();
    if (!this.isActive) return;
    this.activePointerId = null;
    this.isActive = false;
    this.updateVisual();
    this.onADSToggle?.(false);
    if (typeof this.root.releasePointerCapture === 'function' && this.root.hasPointerCapture(e.pointerId)) {
      this.root.releasePointerCapture(e.pointerId);
    }
  };

  private handlePointerCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    if (!this.isActive) return;
    this.activePointerId = null;
    this.isActive = false;
    this.updateVisual();
    this.onADSToggle?.(false);
    if (typeof this.root.releasePointerCapture === 'function' && this.root.hasPointerCapture(e.pointerId)) {
      this.root.releasePointerCapture(e.pointerId);
    }
  };

  private updateVisual(): void {
    this.root.classList.toggle(styles.adsActive, this.isActive);
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
    this.resetADS();
  }
}
