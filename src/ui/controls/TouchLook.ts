/**
 * Touch-based camera look control.
 * Uses the right half of the screen (excluding button areas) for drag-to-look.
 * Produces camera delta {x, y} each frame similar to mouse movement.
 * Uses pointer events with setPointerCapture for reliable multi-touch.
 *
 * QoL features:
 * - Dead zone: ignores sub-pixel jitter (configurable, default 1.5px)
 * - Acceleration curve: sub-linear for fine aim, amplified for fast swipes
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

export class TouchLook extends UIComponent {
  private activePointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  /** Accumulated delta since last read - consumed by PlayerInput */
  readonly delta = { x: 0, y: 0 };

  private sensitivity = 0.004;

  /** Dead zone in CSS pixels - movements below this are ignored to prevent jitter */
  private deadZone = 1.5;

  /**
   * Acceleration exponent. 1.0 = linear (raw), <1.0 = sub-linear (fine aim boost).
   * Default 0.75 gives sqrt-like curve: small swipes are finer, fast swipes feel natural.
   */
  private accelExponent = 0.75;

  protected build(): void {
    this.root.className = styles.lookZone;
    this.root.id = 'touch-look-zone';
  }

  protected onMount(): void {
    this.listen(this.root, 'pointerdown', this.handlePointerDown, { passive: false });
    this.listen(this.root, 'pointermove', this.handlePointerMove, { passive: false });
    this.listen(this.root, 'pointerup', this.handlePointerUp, { passive: false });
    this.listen(this.root, 'pointercancel', this.handlePointerCancel, { passive: false });
  }

  setSensitivity(s: number): void {
    this.sensitivity = s;
  }

  setDeadZone(px: number): void {
    this.deadZone = Math.max(0, px);
  }

  setAcceleration(exponent: number): void {
    this.accelExponent = Math.max(0.1, Math.min(2.0, exponent));
  }

  private handlePointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.activePointerId !== null) return;

    this.activePointerId = e.pointerId;
    if (typeof this.root.setPointerCapture === 'function') {
      this.root.setPointerCapture(e.pointerId);
    }
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private handlePointerMove = (e: PointerEvent): void => {
    e.preventDefault();
    if (e.pointerId !== this.activePointerId) return;

    let dx = e.clientX - this.lastX;
    let dy = e.clientY - this.lastY;

    // Dead zone: ignore sub-pixel jitter
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude < this.deadZone) {
      return;
    }

    // Apply non-linear acceleration curve (preserves direction)
    if (this.accelExponent !== 1.0 && magnitude > 0) {
      const scaled = Math.pow(magnitude, this.accelExponent);
      const factor = scaled / magnitude;
      dx *= factor;
      dy *= factor;
    }

    // Accumulate deltas (consumed by PlayerInput)
    this.delta.x += dx * this.sensitivity;
    this.delta.y += dy * this.sensitivity;

    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private handlePointerUp = (e: PointerEvent): void => {
    e.preventDefault();
    if (e.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    if (typeof this.root.releasePointerCapture === 'function' && this.root.hasPointerCapture(e.pointerId)) {
      this.root.releasePointerCapture(e.pointerId);
    }
  };

  private handlePointerCancel = (e: PointerEvent): void => {
    e.preventDefault();
    if (e.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    if (typeof this.root.releasePointerCapture === 'function' && this.root.hasPointerCapture(e.pointerId)) {
      this.root.releasePointerCapture(e.pointerId);
    }
  };

  /** Read and clear accumulated delta */
  consumeDelta(): { x: number; y: number } {
    const x = this.delta.x;
    const y = this.delta.y;
    this.delta.x = 0;
    this.delta.y = 0;
    return { x, y };
  }

  show(): void {
    this.root.style.display = 'block';
  }

  hide(): void {
    this.root.style.display = 'none';
    this.activePointerId = null;
    this.delta.x = 0;
    this.delta.y = 0;
  }
}
