/**
 * Contextual touch buttons for sandbag rotation (R/T keys).
 * Only visible when sandbag weapon is selected.
 * Uses pointer events with setPointerCapture for unified input handling.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

export class TouchSandbagButtons extends UIComponent {
  private leftButton!: HTMLDivElement;
  private rightButton!: HTMLDivElement;
  private isVisible = false;

  private onRotateLeft?: () => void;
  private onRotateRight?: () => void;

  // Track active pointers per button for proper release
  private leftPointerId: number | null = null;
  private rightPointerId: number | null = null;

  protected build(): void {
    this.root.className = styles.sandbagContainer;
    this.root.id = 'touch-sandbag-buttons';

    this.leftButton = this.createButton('\u25C4', 'rotate-left');
    this.rightButton = this.createButton('\u25BA', 'rotate-right');

    this.root.appendChild(this.leftButton);
    this.root.appendChild(this.rightButton);
  }

  protected onMount(): void {
    this.bindButton(this.leftButton, true);
    this.bindButton(this.rightButton, false);
  }

  private createButton(label: string, id: string): HTMLDivElement {
    const btn = document.createElement('div');
    btn.id = `sandbag-${id}`;
    btn.className = styles.sandbagBtn;
    btn.textContent = label;
    return btn;
  }

  private bindButton(btn: HTMLDivElement, isLeft: boolean): void {
    this.listen(btn, 'pointerdown', (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (isLeft) {
        if (this.leftPointerId !== null) return;
        this.leftPointerId = e.pointerId;
      } else {
        if (this.rightPointerId !== null) return;
        this.rightPointerId = e.pointerId;
      }
      if (typeof btn.setPointerCapture === 'function') btn.setPointerCapture(e.pointerId);
      btn.classList.add(styles.pressed);
      if (isLeft) this.onRotateLeft?.();
      else this.onRotateRight?.();
    }, { passive: false });

    this.listen(btn, 'pointerup', (e: PointerEvent) => {
      const activeId = isLeft ? this.leftPointerId : this.rightPointerId;
      if (e.pointerId !== activeId) return;
      e.preventDefault();
      e.stopPropagation();
      if (isLeft) this.leftPointerId = null;
      else this.rightPointerId = null;
      btn.classList.remove(styles.pressed);
      if (typeof btn.releasePointerCapture === 'function' && btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    }, { passive: false });

    this.listen(btn, 'pointercancel', (e: PointerEvent) => {
      const activeId = isLeft ? this.leftPointerId : this.rightPointerId;
      if (e.pointerId !== activeId) return;
      e.preventDefault();
      if (isLeft) this.leftPointerId = null;
      else this.rightPointerId = null;
      btn.classList.remove(styles.pressed);
      if (typeof btn.releasePointerCapture === 'function' && btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    }, { passive: false });
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
