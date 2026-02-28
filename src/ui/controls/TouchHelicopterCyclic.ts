/**
 * Touch cyclic joystick for helicopter pitch/roll on mobile.
 * A full right-side virtual joystick that maps to cyclicPitch (Y) and cyclicRoll (X).
 * Mirrors the left VirtualJoystick layout but positioned on the right side.
 * Auto-centers when not dragging. Only visible in helicopter mode.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

export class TouchHelicopterCyclic extends UIComponent {
  private base!: HTMLDivElement;
  private thumb!: HTMLDivElement;
  private label!: HTMLDivElement;

  private isVisible = false;
  private pointerId: number | null = null;
  private baseX = 0;
  private baseY = 0;

  /** Current normalized cyclic values: pitch [-1,1] (up=forward), roll [-1,1] (right=bank right) */
  private cyclicPitch = 0;
  private cyclicRoll = 0;

  private readonly FALLBACK_BASE = 120;
  private readonly THUMB_SIZE = 50;
  private maxDistance = 60;
  /** Dead zone as fraction of maxDistance (0-1). */
  private readonly DEAD_ZONE = 0.08;

  protected build(): void {
    this.root.className = styles.heliCyclicZone;
    this.root.id = 'touch-helicopter-cyclic';

    // Base circle
    this.base = document.createElement('div');
    this.base.className = styles.heliCyclicBase;

    // Label
    this.label = document.createElement('div');
    this.label.className = styles.heliCyclicLabel;
    this.label.textContent = 'CYCLIC';

    // Thumb
    this.thumb = document.createElement('div');
    this.thumb.className = styles.heliCyclicThumb;
    this.thumb.style.left = `calc(50% - ${this.THUMB_SIZE / 2}px)`;
    this.thumb.style.top = `calc(50% - ${this.THUMB_SIZE / 2}px)`;

    this.base.appendChild(this.label);
    this.base.appendChild(this.thumb);
    this.root.appendChild(this.base);
  }

  protected onMount(): void {
    this.listen(this.root, 'pointerdown', this.handlePointerDown, { passive: false });
    this.listen(this.root, 'pointermove', this.handlePointerMove, { passive: false });
    this.listen(this.root, 'pointerup', this.handlePointerUp, { passive: false });
    this.listen(this.root, 'pointercancel', this.handlePointerUp, { passive: false });
  }

  private handlePointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.root.setPointerCapture(e.pointerId);

    const rect = this.base.getBoundingClientRect();
    this.maxDistance = rect.width / 2;
    this.baseX = rect.left + this.maxDistance;
    this.baseY = rect.top + this.maxDistance;

    this.updateFromPointer(e.clientX, e.clientY);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerId !== this.pointerId) return;
    this.updateFromPointer(e.clientX, e.clientY);
  };

  private handlePointerUp = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.cyclicPitch = 0;
    this.cyclicRoll = 0;
    this.resetThumb();
  };

  private updateFromPointer(clientX: number, clientY: number): void {
    let dx = clientX - this.baseX;
    let dy = clientY - this.baseY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(distance, this.maxDistance);

    if (distance > 0) {
      dx = (dx / distance) * clamped;
      dy = (dy / distance) * clamped;
    }

    // Position thumb relative to base center
    const baseSize = this.base.offsetWidth || this.FALLBACK_BASE;
    this.thumb.style.left = `${(baseSize - this.THUMB_SIZE) / 2 + dx}px`;
    this.thumb.style.top = `${(baseSize - this.THUMB_SIZE) / 2 + dy}px`;

    // Normalize output
    const hp = this.maxDistance || this.FALLBACK_BASE / 2;
    let roll = Math.max(-1, Math.min(1, dx / hp));
    let pitch = Math.max(-1, Math.min(1, -dy / hp));

    const mag = Math.sqrt(roll * roll + pitch * pitch);
    if (mag < this.DEAD_ZONE) {
      roll = 0;
      pitch = 0;
    } else if (mag > 0) {
      const remapped = (mag - this.DEAD_ZONE) / (1 - this.DEAD_ZONE);
      const scale = remapped / mag;
      roll *= scale;
      pitch *= scale;
    }

    this.cyclicRoll = roll;
    this.cyclicPitch = pitch;
  }

  private resetThumb(): void {
    this.thumb.style.left = `calc(50% - ${this.THUMB_SIZE / 2}px)`;
    this.thumb.style.top = `calc(50% - ${this.THUMB_SIZE / 2}px)`;
  }

  /** Get current cyclic input. pitch: [-1,1] (positive=forward), roll: [-1,1] (positive=right bank) */
  getCyclicInput(): { pitch: number; roll: number } {
    return { pitch: this.cyclicPitch, roll: this.cyclicRoll };
  }

  show(): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.root.style.display = 'block';
  }

  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.root.style.display = 'none';
    this.pointerId = null;
    this.cyclicPitch = 0;
    this.cyclicRoll = 0;
    this.resetThumb();
  }
}
