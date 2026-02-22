/**
 * Contextual touch button for rally point placement (V key).
 * Visible when player is alive and on foot.
 * Uses pointer events with setPointerCapture for unified input handling.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

export class TouchRallyPointButton extends UIComponent {
  private isVisible = false;
  private activePointerId: number | null = null;

  private onPlaceRallyPoint?: () => void;

  protected build(): void {
    this.root.className = styles.rallyBtn;
    this.root.id = 'touch-rally-point-btn';
    this.root.style.display = 'none'; // Start hidden
    this.root.textContent = 'V';
  }

  protected onMount(): void {
    this.listen(this.root, 'pointerdown', this.handlePointerDown, { passive: false });
    this.listen(this.root, 'pointerup', this.handlePointerUp, { passive: false });
    this.listen(this.root, 'pointercancel', this.handlePointerCancel, { passive: false });
  }

  setCallback(onPlaceRallyPoint: () => void): void {
    this.onPlaceRallyPoint = onPlaceRallyPoint;
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    if (typeof this.root.setPointerCapture === 'function') {
      this.root.setPointerCapture(e.pointerId);
    }
    this.root.classList.add(styles.pressed);
    this.onPlaceRallyPoint?.();
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    e.stopPropagation();
    this.activePointerId = null;
    this.root.classList.remove(styles.pressed);
    if (typeof this.root.releasePointerCapture === 'function' && this.root.hasPointerCapture(e.pointerId)) {
      this.root.releasePointerCapture(e.pointerId);
    }
  };

  private handlePointerCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    this.activePointerId = null;
    this.root.classList.remove(styles.pressed);
    if (typeof this.root.releasePointerCapture === 'function' && this.root.hasPointerCapture(e.pointerId)) {
      this.root.releasePointerCapture(e.pointerId);
    }
  };

  showButton(): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.root.style.display = 'flex';
  }

  hideButton(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.root.style.display = 'none';
  }

  /** Don't auto-show - only shown when player can place rally points */
  show(): void {}

  hide(): void {
    this.hideButton();
  }
}
