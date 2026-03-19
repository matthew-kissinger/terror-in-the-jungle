/**
 * Contextual touch button for rally/squad controls.
 * Tap = place rally point.
 * Hold (300ms+) = open squad command radial menu.
 * Uses pointer events with setPointerCapture for unified input handling.
 */

import { BaseTouchButton } from './BaseTouchButton';
import styles from './TouchControls.module.css';

/** Hold duration threshold to open squad command menu (ms). */
const HOLD_THRESHOLD_MS = 300;

export class TouchRallyPointButton extends BaseTouchButton {
  private isVisible = false;
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
    this.bindPress(this.root, {
      onDown: () => {
        this.didOpenMenu = false;
        this.clearHoldTimer();
        this.holdTimer = setTimeout(() => {
          this.holdTimer = null;
          this.didOpenMenu = true;
          this.root.classList.remove(styles.pressed);
          this.onSquadCommand?.();
        }, HOLD_THRESHOLD_MS);
      },
      onUp: () => {
        this.clearHoldTimer();
        if (!this.didOpenMenu) {
          this.onPlaceRallyPoint?.();
        }
      },
      onCancel: () => {
        this.clearHoldTimer();
        this.didOpenMenu = false;
      },
    });
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
    this.cancelActivePress();
  }

  cancelActivePress(): void {
    this.clearHoldTimer();
    this.didOpenMenu = false;
  }
}
