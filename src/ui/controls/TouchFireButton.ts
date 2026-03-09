/**
 * Large fire button for mobile touch controls.
 * Uses pointer events with setPointerCapture for unified input handling.
 */

import { BaseTouchButton } from './BaseTouchButton';
import { haptics } from './HapticFeedback';
import styles from './TouchControls.module.css';

export class TouchFireButton extends BaseTouchButton {
  private onFireStart?: () => void;
  private onFireStop?: () => void;
  private wasPressed = false;

  protected build(): void {
    this.root.className = styles.fireBtn;
    this.root.id = 'touch-fire-btn';
    this.root.textContent = 'FIRE';
  }

  protected onMount(): void {
    this.bindPress(this.root, {
      onDown: () => {
        this.wasPressed = true;
        haptics.fire();
        this.onFireStart?.();
      },
      onUp: () => {
        this.wasPressed = false;
        this.onFireStop?.();
      },
      onCancel: () => {
        this.wasPressed = false;
        this.onFireStop?.();
      },
    });
  }

  setCallbacks(onStart: () => void, onStop: () => void): void {
    this.onFireStart = onStart;
    this.onFireStop = onStop;
  }

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
    if (this.wasPressed) {
      this.wasPressed = false;
      this.releaseAllPointers();
      this.onFireStop?.();
    }
  }
}
