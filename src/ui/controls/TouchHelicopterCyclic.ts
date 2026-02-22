/**
 * Touch cyclic control pad for helicopter pitch/roll on mobile.
 * A drag pad that maps finger position to cyclicPitch (vertical) and cyclicRoll (horizontal).
 * Auto-centers when not dragging. Positioned on the LEFT side of screen above the joystick.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

export class TouchHelicopterCyclic extends UIComponent {
  private indicator!: HTMLDivElement;

  private isVisible = false;
  private pointerId: number | null = null;
  private padCenterX = 0;
  private padCenterY = 0;

  /** Current normalized cyclic values: pitch [-1,1] (up=forward), roll [-1,1] (right=bank right) */
  private cyclicPitch = 0;
  private cyclicRoll = 0;

  private readonly FALLBACK_PAD_SIZE = 120;
  private readonly INDICATOR_SIZE = 20;
  /** Dead zone as fraction of half-pad (0-1). */
  private readonly DEAD_ZONE = 0.08;

  private halfPad = 60;

  protected build(): void {
    this.root.className = styles.cyclicPad;
    this.root.id = 'touch-helicopter-cyclic';

    // Crosshair lines
    const crosshair = document.createElement('div');
    crosshair.className = styles.cyclicCrosshair;

    const hLine = document.createElement('div');
    hLine.className = styles.cyclicLineH;

    const vLine = document.createElement('div');
    vLine.className = styles.cyclicLineV;

    crosshair.appendChild(hLine);
    crosshair.appendChild(vLine);
    this.root.appendChild(crosshair);

    // Label
    const label = document.createElement('div');
    label.className = styles.cyclicLabel;
    label.textContent = 'CYCLIC';
    this.root.appendChild(label);

    // Movable indicator dot
    this.indicator = document.createElement('div');
    this.indicator.className = styles.cyclicIndicator;
    this.indicator.style.left = `calc(50% - ${this.INDICATOR_SIZE / 2}px)`;
    this.indicator.style.top = `calc(50% - ${this.INDICATOR_SIZE / 2}px)`;
    this.root.appendChild(this.indicator);
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

    const rect = this.root.getBoundingClientRect();
    this.halfPad = rect.width / 2;
    this.padCenterX = rect.left + this.halfPad;
    this.padCenterY = rect.top + this.halfPad;

    this.updateFromPointer(e.clientX, e.clientY);
    this.root.classList.add(styles.active);
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
    this.updateIndicatorPosition(0, 0);
    this.root.classList.remove(styles.active);
  };

  private updateFromPointer(clientX: number, clientY: number): void {
    const dx = clientX - this.padCenterX;
    const dy = clientY - this.padCenterY;
    const hp = this.halfPad || this.FALLBACK_PAD_SIZE / 2;

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

    this.updateIndicatorPosition(
      Math.max(-1, Math.min(1, dx / hp)),
      Math.max(-1, Math.min(1, -dy / hp))
    );
  }

  private updateIndicatorPosition(rollNorm: number, pitchNorm: number): void {
    const halfIndicator = this.INDICATOR_SIZE / 2;
    const hp = this.halfPad || this.FALLBACK_PAD_SIZE / 2;
    const maxOffset = hp - halfIndicator;
    const px = hp + rollNorm * maxOffset - halfIndicator;
    const py = hp - pitchNorm * maxOffset - halfIndicator;
    this.indicator.style.left = `${px}px`;
    this.indicator.style.top = `${py}px`;
  }

  /** Get current cyclic input. pitch: [-1,1] (positive=forward), roll: [-1,1] (positive=right bank) */
  getCyclicInput(): { pitch: number; roll: number } {
    return { pitch: this.cyclicPitch, roll: this.cyclicRoll };
  }

  show(): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.root.style.display = 'flex';
  }

  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.root.style.display = 'none';
    this.pointerId = null;
    this.cyclicPitch = 0;
    this.cyclicRoll = 0;
    this.updateIndicatorPosition(0, 0);
  }
}
