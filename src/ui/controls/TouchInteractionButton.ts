/**
 * Touch button for contextual interactions (e.g., helicopter entry/exit).
 * Appears in the center-right area when an interaction is available.
 * Only visible on touch devices when interaction prompt is active.
 * Uses pointer events with setPointerCapture for unified input handling.
 */

import { BaseTouchButton } from './BaseTouchButton';
import { icon } from '../icons/IconRegistry';
import styles from './TouchControls.module.css';

export class TouchInteractionButton extends BaseTouchButton {
  private isVisible = false;

  private onInteract?: () => void;

  protected build(): void {
    this.root.className = styles.interactBtn;
    this.root.id = 'touch-interaction-btn';
    this.root.style.display = 'none'; // Start hidden
    const iconEl = document.createElement('img');
    iconEl.src = icon('icon-interact');
    iconEl.alt = 'Interact';
    iconEl.draggable = false;
    iconEl.style.cssText = 'width: 50%; height: 50%; object-fit: contain; pointer-events: none; image-rendering: pixelated;';
    this.root.appendChild(iconEl);
    this.root.setAttribute('aria-label', 'Interact');
  }

  protected onMount(): void {
    this.bindPress(this.root, {
      onDown: () => this.onInteract?.(),
    });
  }

  setCallback(onInteract: () => void): void {
    this.onInteract = onInteract;
  }

  /** Show the button (called when interaction becomes available). */
  showButton(): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.root.style.display = 'flex';
  }

  /** Hide the button (called when interaction is no longer available). */
  hideButton(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.root.style.display = 'none';
    this.releaseAllPointers();
  }

  /** Don't auto-show - button is only shown when interaction is available. */
  show(): void {
    // no-op
  }

  hide(): void {
    this.hideButton();
  }
}
