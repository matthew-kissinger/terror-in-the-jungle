/**
 * Small action buttons for mobile: Jump, Reload, Grenade.
 * Positioned in a column above the fire button on the right side.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

interface ActionButton {
  element: HTMLDivElement;
  key: string;
  label: string;
}

export class TouchActionButtons extends UIComponent {
  private buttons: ActionButton[] = [];

  private onAction?: (action: string) => void;

  protected build(): void {
    this.root.className = styles.actionContainer;
    this.root.id = 'touch-action-buttons';

    // Create buttons from bottom to top (most-used closest to thumb)
    this.addButton('jump', 'JUMP');
    this.addButton('reload', 'R');
    this.addButton('grenade', 'G');
  }

  protected onMount(): void {
    for (const { element, key } of this.buttons) {
      this.listen(element, 'pointerdown', (e: PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        element.classList.add(styles.pressed);
        if (typeof element.setPointerCapture === 'function') element.setPointerCapture(e.pointerId);
        this.onAction?.(key);
      }, { passive: false });

      this.listen(element, 'pointerup', (e: PointerEvent) => {
        e.preventDefault();
        element.classList.remove(styles.pressed);
        if (typeof element.releasePointerCapture === 'function' && element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
      }, { passive: false });

      this.listen(element, 'pointercancel', (e: PointerEvent) => {
        e.preventDefault();
        element.classList.remove(styles.pressed);
        if (typeof element.releasePointerCapture === 'function' && element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
      }, { passive: false });
    }
  }

  setOnAction(callback: (action: string) => void): void {
    this.onAction = callback;
  }

  private addButton(key: string, label: string): void {
    const btn = document.createElement('div');
    btn.className = styles.actionBtn;
    btn.textContent = label;
    this.buttons.push({ element: btn, key, label });
    this.root.appendChild(btn);
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
  }
}
