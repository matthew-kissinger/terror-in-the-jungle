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

  private sensitivity = 0.006;

  /** Dead zone in CSS pixels - movements below this are ignored to prevent jitter */
  private deadZone = 1.5;

  /**
   * Acceleration exponent. 1.0 = linear (raw), >1.0 = super-linear (fast swipe boost).
   * 1.15 provides gentle acceleration: precise aim at low speed, moderate boost on flicks.
   */
  private accelExponent = 1.15;

  /** ADS (aim-down-sight) sensitivity multiplier. Applied on top of base sensitivity. */
  private adsSensitivityMultiplier = 0.45;
  private isADS = false;

  /** Timestamp of last pointer activity - for stuck-pointer safety */
  private lastPointerActivityMs = 0;

  /** Safety check interval id */
  private safetyIntervalId: ReturnType<typeof setInterval> | null = null;

  /** Max time (ms) a pointer can be active without movement before force-reset */
  private readonly STUCK_POINTER_TIMEOUT = 2000;

  /** Max accumulated delta magnitude per consume cycle.
   *  Prevents camera snap from coordinate-space changes (e.g. fullscreen transition). */
  private readonly MAX_DELTA_PER_CONSUME = 0.15;

  protected build(): void {
    this.root.className = styles.lookZone;
    this.root.id = 'touch-look-zone';
  }

  protected onMount(): void {
    this.listen(this.root, 'pointerdown', this.handlePointerDown, { passive: false });
    this.listen(this.root, 'pointermove', this.handlePointerMove, { passive: false });
    this.listen(this.root, 'pointerup', this.handlePointerUp, { passive: false });
    this.listen(this.root, 'pointercancel', this.handlePointerCancel, { passive: false });

    // Global pointerup safety: catch missed pointerup when overlays steal events
    this.listen(window, 'pointerup', this.handleGlobalPointerUp, { passive: false });

    // Safety listeners: reset on tab switch, notification overlay, or app backgrounding
    this.listen(window, 'blur', this.handleSafetyReset);
    this.listen(window, 'pagehide', this.handleSafetyReset);
    this.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.forceReset();
    });

    // Reset on fullscreen transition (viewport resize invalidates zone bounds)
    this.listen(document, 'fullscreenchange' as keyof DocumentEventMap, () => this.forceReset());

    // Periodic safety check for stuck pointer (overlay steals focus, missed events)
    this.safetyIntervalId = setInterval(() => {
      if (this.activePointerId !== null && Date.now() - this.lastPointerActivityMs > this.STUCK_POINTER_TIMEOUT) {
        this.forceReset();
      }
    }, 500);
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

  /** Enable/disable ADS sensitivity reduction. */
  setADS(active: boolean): void {
    this.isADS = active;
  }

  /** Global safety: catch pointerup events missed on the look zone */
  private handleGlobalPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.activePointerId) {
      this.activePointerId = null;
    }
  };

  private handleSafetyReset = (): void => {
    this.forceReset();
  };

  /** Force-reset all pointer state (stuck-pointer recovery) */
  private forceReset(): void {
    this.activePointerId = null;
    this.delta.x = 0;
    this.delta.y = 0;
  }

  private handlePointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.activePointerId !== null) return;

    this.activePointerId = e.pointerId;
    this.lastPointerActivityMs = Date.now();
    if (typeof this.root.setPointerCapture === 'function') {
      this.root.setPointerCapture(e.pointerId);
    }
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private handlePointerMove = (e: PointerEvent): void => {
    e.preventDefault();
    if (e.pointerId !== this.activePointerId) return;
    this.lastPointerActivityMs = Date.now();

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
    const effectiveSensitivity = this.isADS
      ? this.sensitivity * this.adsSensitivityMultiplier
      : this.sensitivity;
    this.delta.x += dx * effectiveSensitivity;
    this.delta.y += dy * effectiveSensitivity;

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

  /** Read and clear accumulated delta, clamped to prevent camera snap */
  consumeDelta(): { x: number; y: number } {
    let x = this.delta.x;
    let y = this.delta.y;
    this.delta.x = 0;
    this.delta.y = 0;

    // Clamp magnitude to prevent camera snap from coordinate-space glitches
    const mag = Math.sqrt(x * x + y * y);
    if (mag > this.MAX_DELTA_PER_CONSUME) {
      const scale = this.MAX_DELTA_PER_CONSUME / mag;
      x *= scale;
      y *= scale;
    }

    return { x, y };
  }

  show(): void {
    this.root.style.display = 'block';
  }

  hide(): void {
    this.root.style.display = 'none';
    this.cancelActiveLook();
  }

  cancelActiveLook(): void {
    this.activePointerId = null;
    this.delta.x = 0;
    this.delta.y = 0;
  }

  override dispose(): void {
    if (this.safetyIntervalId !== null) {
      clearInterval(this.safetyIntervalId);
      this.safetyIntervalId = null;
    }
    super.dispose();
  }
}
