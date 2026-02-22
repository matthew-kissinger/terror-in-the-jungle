/**
 * Touch button for contextual interactions (e.g., helicopter entry/exit).
 * Appears in the center-right area when an interaction is available.
 * Only visible on touch devices when interaction prompt is active.
 * Uses pointer events with setPointerCapture for unified input handling.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

export class TouchInteractionButton extends UIComponent {
  private activePointerId: number | null = null;
  private isVisible = false;

  private onInteract?: () => void;

  protected build(): void {
    this.root.className = styles.interactBtn;
    this.root.id = 'touch-interaction-btn';
    this.root.style.display = 'none'; // Start hidden
    this.root.textContent = 'E';
  }

  protected onMount(): void {
    this.listen(this.root, 'pointerdown', this.handlePointerDown, { passive: false });
    this.listen(this.root, 'pointerup', this.handlePointerUp, { passive: false });
    this.listen(this.root, 'pointercancel', this.handlePointerCancel, { passive: false });
  }

  setCallback(onInteract: () => void): void {
    this.onInteract = onInteract;
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
    this.onInteract?.();
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

  /** Show the button (called when interaction becomes available). */
  showButton(): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.root.style.display = 'flex';
  }

  /** Hide the button (called when interaction is no longer available). */
  hideButton(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.root.style.display = 'none';
    if (this.activePointerId !== null) {
      this.activePointerId = null;
    }
  }

  /** Don't auto-show - button is only shown when interaction is available. */
  show(): void {
    // no-op
  }

  hide(): void {
    this.hideButton();
  }
}
