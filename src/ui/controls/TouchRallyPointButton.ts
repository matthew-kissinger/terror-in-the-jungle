/**
 * Contextual touch button for rally/squad controls.
 * Tap = place rally point.
 * Hold (300ms+) = open squad command radial menu.
 * Uses pointer events with setPointerCapture for unified input handling.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

/** Hold duration threshold to open squad command menu (ms). */
const HOLD_THRESHOLD_MS = 300;

export class TouchRallyPointButton extends UIComponent {
  private isVisible = false;
  private activePointerId: number | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private didOpenMenu = false;

  private onPlaceRallyPoint?: () => void;
  private onSquadCommand?: () => void;

  protected build(): void {
    this.root.className = styles.rallyBtn;
    this.root.id = 'touch-rally-point-btn';
    this.root.style.display = 'none'; // Start hidden
    this.root.textContent = 'RALLY';
  }

  /** Update the button label to reflect the active swarm control. */
  setLabel(label: string): void {
    this.root.textContent = label;
  }

  protected onMount(): void {
    this.listen(this.root, 'pointerdown', this.handlePointerDown, { passive: false });
    this.listen(this.root, 'pointerup', this.handlePointerUp, { passive: false });
    this.listen(this.root, 'pointercancel', this.handlePointerCancel, { passive: false });
  }

  setCallback(onPlaceRallyPoint: () => void): void {
    this.onPlaceRallyPoint = onPlaceRallyPoint;
  }

  setSquadCommandCallback(onSquadCommand: () => void): void {
    this.onSquadCommand = onSquadCommand;
  }

  private clearHoldTimer(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    this.didOpenMenu = false;
    if (typeof this.root.setPointerCapture === 'function') {
      this.root.setPointerCapture(e.pointerId);
    }
    this.root.classList.add(styles.pressed);

    // Start hold timer — if held long enough, open squad command menu
    this.clearHoldTimer();
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      this.didOpenMenu = true;
      this.root.classList.remove(styles.pressed);
      this.onSquadCommand?.();
    }, HOLD_THRESHOLD_MS);
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    e.stopPropagation();
    this.activePointerId = null;
    this.root.classList.remove(styles.pressed);
    this.clearHoldTimer();

    // If hold did NOT trigger the radial menu, treat as tap → place rally
    if (!this.didOpenMenu) {
      this.onPlaceRallyPoint?.();
    }

    if (typeof this.root.releasePointerCapture === 'function' && this.root.hasPointerCapture(e.pointerId)) {
      this.root.releasePointerCapture(e.pointerId);
    }
  };

  private handlePointerCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    this.activePointerId = null;
    this.root.classList.remove(styles.pressed);
    this.clearHoldTimer();
    this.didOpenMenu = false;
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
