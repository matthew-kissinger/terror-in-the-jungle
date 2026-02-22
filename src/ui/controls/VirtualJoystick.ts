/**
 * Virtual joystick overlay for mobile movement control.
 * Renders on the left side of the screen.
 * Outputs a normalised {x, z} vector in [-1, 1] range.
 * Uses pointer events with setPointerCapture for reliable multi-touch.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

export class VirtualJoystick extends UIComponent {
  private base!: HTMLDivElement;
  private thumb!: HTMLDivElement;

  private activePointerId: number | null = null;
  private baseX = 0;
  private baseY = 0;

  /** Normalised output - read every frame */
  readonly output = { x: 0, z: 0 };

  // Geometry
  private readonly FALLBACK_BASE = 120;
  private readonly THUMB_SIZE = 50;
  private maxDistance: number;

  /** Dead zone as fraction of maxDistance (0-1). */
  private readonly DEAD_ZONE = 0.1;

  // Sprint callbacks
  private onSprintStart?: () => void;
  private onSprintStop?: () => void;
  private isSprinting = false;
  private readonly SPRINT_THRESHOLD = 0.9;

  constructor() {
    super();
    this.maxDistance = this.FALLBACK_BASE / 2;
  }

  protected build(): void {
    this.root.className = styles.joystickZone;
    this.root.id = 'touch-joystick-zone';

    // Base circle
    this.base = document.createElement('div');
    this.base.className = styles.joystickBase;

    // Thumb
    this.thumb = document.createElement('div');
    this.thumb.className = styles.joystickThumb;
    this.thumb.style.left = `calc(50% - ${this.THUMB_SIZE / 2}px)`;
    this.thumb.style.top = `calc(50% - ${this.THUMB_SIZE / 2}px)`;

    this.base.appendChild(this.thumb);
    this.root.appendChild(this.base);
  }

  protected onMount(): void {
    this.listen(this.root, 'pointerdown', this.handlePointerDown, { passive: false });
    this.listen(this.root, 'pointermove', this.handlePointerMove, { passive: false });
    this.listen(this.root, 'pointerup', this.handlePointerUp, { passive: false });
    this.listen(this.root, 'pointercancel', this.handlePointerCancel, { passive: false });
  }

  setSprintCallbacks(onStart: () => void, onStop: () => void): void {
    this.onSprintStart = onStart;
    this.onSprintStop = onStop;
  }

  private handlePointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;

    if (typeof this.root.setPointerCapture === 'function') {
      this.root.setPointerCapture(e.pointerId);
    }

    const rect = this.base.getBoundingClientRect();
    this.baseX = rect.left + rect.width / 2;
    this.baseY = rect.top + rect.height / 2;
    this.maxDistance = rect.width / 2;

    this.updateThumb(e.clientX, e.clientY);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    e.preventDefault();
    if (e.pointerId !== this.activePointerId) return;
    this.updateThumb(e.clientX, e.clientY);
  };

  private handlePointerUp = (e: PointerEvent): void => {
    e.preventDefault();
    if (e.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    if (typeof this.root.releasePointerCapture === 'function' && this.root.hasPointerCapture(e.pointerId)) {
      this.root.releasePointerCapture(e.pointerId);
    }
    this.resetThumb();
  };

  private handlePointerCancel = (e: PointerEvent): void => {
    e.preventDefault();
    if (e.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    if (typeof this.root.releasePointerCapture === 'function' && this.root.hasPointerCapture(e.pointerId)) {
      this.root.releasePointerCapture(e.pointerId);
    }
    this.resetThumb();
  };

  private updateThumb(clientX: number, clientY: number): void {
    let dx = clientX - this.baseX;
    let dy = clientY - this.baseY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(distance, this.maxDistance);

    if (distance > 0) {
      dx = (dx / distance) * clamped;
      dy = (dy / distance) * clamped;
    }

    // Position thumb relative to base centre
    const baseSize = this.base.offsetWidth || this.FALLBACK_BASE;
    this.thumb.style.left = `${(baseSize - this.THUMB_SIZE) / 2 + dx}px`;
    this.thumb.style.top = `${(baseSize - this.THUMB_SIZE) / 2 + dy}px`;

    // Normalise output
    let normX = this.maxDistance > 0 ? dx / this.maxDistance : 0;
    let normY = this.maxDistance > 0 ? dy / this.maxDistance : 0;

    // Apply dead zone
    const rawMagnitude = Math.sqrt(normX * normX + normY * normY);
    if (rawMagnitude < this.DEAD_ZONE) {
      normX = 0;
      normY = 0;
    } else if (rawMagnitude > 0) {
      const remapped = (rawMagnitude - this.DEAD_ZONE) / (1 - this.DEAD_ZONE);
      const scale = remapped / rawMagnitude;
      normX *= scale;
      normY *= scale;
    }

    this.output.x = normX;
    this.output.z = normY;

    // Sprint detection
    const magnitude = Math.sqrt(normX * normX + normY * normY);
    if (magnitude >= this.SPRINT_THRESHOLD && !this.isSprinting) {
      this.isSprinting = true;
      this.onSprintStart?.();
    } else if (magnitude < this.SPRINT_THRESHOLD && this.isSprinting) {
      this.isSprinting = false;
      this.onSprintStop?.();
    }
  }

  private resetThumb(): void {
    this.thumb.style.left = `calc(50% - ${this.THUMB_SIZE / 2}px)`;
    this.thumb.style.top = `calc(50% - ${this.THUMB_SIZE / 2}px)`;
    this.output.x = 0;
    this.output.z = 0;

    if (this.isSprinting) {
      this.isSprinting = false;
      this.onSprintStop?.();
    }
  }

  show(): void {
    this.root.style.display = 'block';
  }

  hide(): void {
    this.root.style.display = 'none';
    this.resetThumb();
    this.activePointerId = null;
  }
}
