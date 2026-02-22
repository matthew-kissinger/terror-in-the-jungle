/**
 * AmmoDisplay - Magazine and reserve ammo readout.
 *
 * Shows current magazine / reserve count with color-coded status:
 * - Normal: white text
 * - Low (<=10 rounds): amber warning
 * - Empty magazine (reserve available): red + "Press R to reload"
 * - No ammo (both zero): critical red + "No ammo!"
 *
 * Signal-driven: caller sets ammo via setAmmo(), DOM updates automatically.
 * Replaces: WeaponAmmoDisplay
 */

import { UIComponent } from '../engine/UIComponent';
import { isTouchDevice } from '../../utils/DeviceDetector';
import styles from './AmmoDisplay.module.css';

export class AmmoDisplay extends UIComponent {
  // --- Reactive state ---
  private magazine = this.signal(30);
  private reserve = this.signal(90);

  protected build(): void {
    this.root.className = styles.container;
    this.root.innerHTML = `
      <div class="${styles.counter}">
        <span class="${styles.magazine}" data-ref="magazine">30</span>
        <span class="${styles.separator}">/</span>
        <span class="${styles.reserve}" data-ref="reserve">90</span>
      </div>
      <div class="${styles.status} ${styles.statusHidden}" data-ref="status"></div>
    `;
  }

  protected onMount(): void {
    // Effect: update magazine count text
    this.effect(() => {
      this.text('[data-ref="magazine"]', String(this.magazine.value));
    });

    // Effect: update reserve count text
    this.effect(() => {
      this.text('[data-ref="reserve"]', String(this.reserve.value));
    });

    // Effect: status text + color coding
    this.effect(() => {
      const mag = this.magazine.value;
      const res = this.reserve.value;
      const statusEl = this.$('[data-ref="status"]');
      if (!statusEl) return;

      // Clear all state classes
      this.root.classList.remove(styles.low, styles.empty, styles.noAmmo);

      if (mag === 0 && res === 0) {
        // No ammo at all
        statusEl.textContent = 'No ammo!';
        statusEl.classList.remove(styles.statusHidden);
        this.root.classList.add(styles.noAmmo);
      } else if (mag === 0 && res > 0) {
        // Magazine empty, reserve available
        const reloadText = isTouchDevice() ? 'Tap reload' : 'Press R to reload';
        statusEl.textContent = reloadText;
        statusEl.classList.remove(styles.statusHidden);
        this.root.classList.add(styles.empty);
      } else if (mag <= 10 && mag > 0) {
        // Low ammo
        statusEl.textContent = 'Low ammo';
        statusEl.classList.remove(styles.statusHidden);
        this.root.classList.add(styles.low);
      } else {
        // Normal
        statusEl.textContent = '';
        statusEl.classList.add(styles.statusHidden);
      }
    });
  }

  // --- Public API ---

  /** Update ammo counts. Called by HUDElements per frame. */
  setAmmo(magazine: number, reserve: number): void {
    this.magazine.value = magazine;
    this.reserve.value = reserve;
  }
}
