/**
 * Touch menu button (hamburger icon) for mobile pause/settings access.
 * The button only launches the shared gameplay pause/settings surface.
 */

import { UIComponent } from '../engine/UIComponent';
import { icon } from '../icons/IconRegistry';
import styles from './TouchControls.module.css';

export class TouchMenuButton extends UIComponent {
  private onOpenCallback?: () => void;

  protected build(): void {
    this.root.className = styles.menuBtn;
    this.root.id = 'touch-menu-btn';
    this.root.dataset.ready = 'false';
    this.root.setAttribute('aria-disabled', 'true');

    const iconEl = document.createElement('img');
    iconEl.src = icon('icon-menu');
    iconEl.alt = 'Menu';
    iconEl.draggable = false;
    iconEl.style.cssText = 'width: 60%; height: 60%; object-fit: contain; pointer-events: none; image-rendering: pixelated;';
    this.root.appendChild(iconEl);
    this.root.setAttribute('aria-label', 'Menu');
  }

  protected onMount(): void {
    this.listen(this.root, 'pointerdown', this.onButtonTap, { passive: false });
  }

  setOpenCallback(callback: () => void): void {
    this.onOpenCallback = callback;
    this.root.dataset.ready = 'true';
    this.root.setAttribute('aria-disabled', 'false');
  }

  private onButtonTap = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    this.onOpenCallback?.();
  };

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
