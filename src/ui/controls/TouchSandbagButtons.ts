/**
 * Contextual touch buttons for sandbag rotation (R/T keys).
 * Only visible when sandbag weapon is selected.
 * Uses pointer events with setPointerCapture for unified input handling.
 */

import { BaseTouchButton } from './BaseTouchButton';
import styles from './TouchControls.module.css';

export class TouchSandbagButtons extends BaseTouchButton {
  private leftButton!: HTMLDivElement;
  private rightButton!: HTMLDivElement;
  private isVisible = false;

  private onRotateLeft?: () => void;
  private onRotateRight?: () => void;

  protected build(): void {
    this.root.className = styles.sandbagContainer;
    this.root.id = 'touch-sandbag-buttons';

    this.leftButton = this.createButton('\u25C4', 'rotate-left');
    this.rightButton = this.createButton('\u25BA', 'rotate-right');

    this.root.appendChild(this.leftButton);
    this.root.appendChild(this.rightButton);
  }

  protected onMount(): void {
    this.bindPress(this.leftButton, {
      onDown: () => this.onRotateLeft?.(),
    });
    this.bindPress(this.rightButton, {
      onDown: () => this.onRotateRight?.(),
    });
  }

  private createButton(label: string, id: string): HTMLDivElement {
    const btn = document.createElement('div');
    btn.id = `sandbag-${id}`;
    btn.className = styles.sandbagBtn;
    btn.textContent = label;
    return btn;
  }

  setCallbacks(onRotateLeft: () => void, onRotateRight: () => void): void {
    this.onRotateLeft = onRotateLeft;
    this.onRotateRight = onRotateRight;
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

  /** Don't auto-show - only shown when sandbag is active */
  show(): void {}

  hide(): void {
    this.hideButton();
  }
}
