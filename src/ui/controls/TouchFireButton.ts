/**
 * Large fire button for mobile touch controls.
 * Uses pointer events with setPointerCapture for unified input handling.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

export class TouchFireButton extends UIComponent {
  private activePointerId: number | null = null;

  private onFireStart?: () => void;
  private onFireStop?: () => void;

  protected build(): void {
    this.root.className = styles.fireBtn;
    this.root.id = 'touch-fire-btn';
    this.root.textContent = 'FIRE';
  }

  protected onMount(): void {
    this.listen(this.root, 'pointerdown', this.handlePointerDown, { passive: false });
    this.listen(this.root, 'pointerup', this.handlePointerUp, { passive: false });
    this.listen(this.root, 'pointercancel', this.handlePointerCancel, { passive: false });
  }

  setCallbacks(onStart: () => void, onStop: () => void): void {
    this.onFireStart = onStart;
    this.onFireStop = onStop;
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
    this.onFireStart?.();
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
    this.onFireStop?.();
  };

  private handlePointerCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    this.activePointerId = null;
    this.root.classList.remove(styles.pressed);
    if (typeof this.root.releasePointerCapture === 'function' && this.root.hasPointerCapture(e.pointerId)) {
      this.root.releasePointerCapture(e.pointerId);
    }
    this.onFireStop?.();
  };

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
    if (this.activePointerId !== null) {
      this.activePointerId = null;
      this.root.classList.remove(styles.pressed);
      this.onFireStop?.();
    }
  }
}
