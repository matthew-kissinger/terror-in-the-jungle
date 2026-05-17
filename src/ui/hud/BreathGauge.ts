/**
 * BreathGauge - Breath remaining bar shown while the player's head is
 * submerged. Signal-driven: caller sets remaining + capacity, color/width/
 * text auto-update. Goes critical (red + pulse) below the warn threshold
 * so the player knows the drowning trigger is imminent.
 *
 * Mirrors the GrenadeMeter pattern (UIComponent + signals + reactive
 * effects) so HUD consistency holds. Mounted into the `center` grid slot
 * by HUDElements alongside the other transient meters.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './BreathGauge.module.css';

/** Below this fraction of capacity, the gauge turns critical (red + pulse). */
const CRITICAL_FRACTION = 0.25;

export class BreathGauge extends UIComponent {
  private remainingSeconds = this.signal(45);
  private capacitySeconds = this.signal(45);
  private visible = this.signal(false);

  protected build(): void {
    this.root.className = styles.container;
    this.root.innerHTML = `
      <div class="${styles.label}" data-ref="label">BREATH</div>
      <div class="${styles.barContainer}">
        <div class="${styles.fill}" data-ref="fill"></div>
        <div class="${styles.text}" data-ref="text">45s</div>
      </div>
    `;
  }

  protected onMount(): void {
    // Effect: visibility.
    this.effect(() => {
      this.toggleClass(styles.visible, this.visible.value);
    });

    // Effect: fill width + text + critical state.
    this.effect(() => {
      const remaining = this.remainingSeconds.value;
      const capacity = Math.max(0.001, this.capacitySeconds.value);
      const fraction = Math.max(0, Math.min(1, remaining / capacity));
      const fillEl = this.$('[data-ref="fill"]');
      const textEl = this.$('[data-ref="text"]');
      const labelEl = this.$('[data-ref="label"]');
      if (!fillEl || !textEl || !labelEl) return;

      fillEl.style.width = `${(fraction * 100).toFixed(1)}%`;
      textEl.textContent = `${Math.max(0, Math.ceil(remaining))}s`;

      const critical = fraction <= CRITICAL_FRACTION;
      fillEl.classList.toggle(styles.fillCritical, critical);
      labelEl.classList.toggle(styles.labelCritical, critical);
    });
  }

  // --- Public API ---

  show(): void {
    this.visible.value = true;
  }

  hide(): void {
    this.visible.value = false;
  }

  isVisible(): boolean {
    return this.visible.value;
  }

  /**
   * Set the breath remaining + capacity in seconds. Capacity drives the
   * 0-100% fill; capacity is exposed so future upgrades (lung-capacity
   * perks, suit upgrades) can resize the gauge without touching this
   * component.
   */
  setBreath(remainingSeconds: number, capacitySeconds: number): void {
    this.remainingSeconds.value = remainingSeconds;
    this.capacitySeconds.value = capacitySeconds;
  }
}
