/**
 * GrenadeMeter - Throw power bar with distance estimate and cooking timer.
 *
 * Signal-driven: caller sets power via setPower(), color/width/text auto-update.
 * Replaces: GrenadePowerMeter (old factory class)
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './GrenadeMeter.module.css';

/** Fuse time constant matching GrenadeSystem */
const FUSE_TIME = 3.5;

export class GrenadeMeter extends UIComponent {
  // --- Reactive state ---
  private power = this.signal(0.3);
  private estimatedDistance = this.signal<number | undefined>(undefined);
  private cookingTime = this.signal<number | undefined>(undefined);
  private visible = this.signal(false);

  protected build(): void {
    this.root.className = styles.container;
    this.root.innerHTML = `
      <div class="${styles.label}" data-ref="label">THROW POWER</div>
      <div class="${styles.barContainer}">
        <div class="${styles.fill}" data-ref="fill"></div>
        <div class="${styles.text}" data-ref="text">30%</div>
      </div>
      <div class="${styles.cooking}" data-ref="cooking">COOKING: 0.0s</div>
    `;
  }

  protected onMount(): void {
    // Effect: visibility
    this.effect(() => {
      this.toggleClass(styles.visible, this.visible.value);
    });

    // Effect: power bar width + text + color
    this.effect(() => {
      const pwr = this.power.value;
      const dist = this.estimatedDistance.value;
      const fill = this.$('[data-ref="fill"]');
      const text = this.$('[data-ref="text"]');
      const label = this.$('[data-ref="label"]');
      if (!fill || !text || !label) return;

      // Normalize 0.3-1.0 to 0-100%
      const normalized = ((pwr - 0.3) / 0.7) * 100;
      fill.style.width = `${normalized}%`;

      // Display text
      if (dist !== undefined) {
        text.textContent = `~${Math.round(dist)}m`;
      } else {
        text.textContent = `${Math.round(pwr * 100)}%`;
      }

      // Color gradient + label color
      label.classList.remove(styles.powerLow, styles.powerMid, styles.powerHigh);
      if (normalized < 40) {
        fill.style.background = `linear-gradient(to right, var(--success), var(--heal))`;
        label.classList.add(styles.powerLow);
      } else if (normalized < 75) {
        fill.style.background = `linear-gradient(to right, var(--accent), var(--accent))`;
        label.classList.add(styles.powerMid);
      } else {
        fill.style.background = `linear-gradient(to right, var(--danger), var(--faction-opfor))`;
        label.classList.add(styles.powerHigh);
      }

      // Pulse at max
      fill.classList.toggle(styles.fillMax, normalized >= 95);
    });

    // Effect: cooking timer
    this.effect(() => {
      const ct = this.cookingTime.value;
      const cookEl = this.$('[data-ref="cooking"]');
      if (!cookEl) return;

      if (ct !== undefined && ct > 0) {
        const timeLeft = FUSE_TIME - ct;
        cookEl.textContent = `COOKING: ${timeLeft.toFixed(1)}s`;
        cookEl.classList.add(styles.cookingVisible);

        // Urgency colors
        cookEl.classList.remove(styles.cookingCritical, styles.cookingDanger, styles.cookingWarning);
        if (timeLeft <= 1.0) {
          cookEl.classList.add(styles.cookingCritical);
        } else if (timeLeft <= 2.0) {
          cookEl.classList.add(styles.cookingDanger);
        } else {
          cookEl.classList.add(styles.cookingWarning);
        }
      } else {
        cookEl.classList.remove(styles.cookingVisible);
      }
    });
  }

  // --- Public API ---

  show(): void {
    this.visible.value = true;
  }

  hide(): void {
    this.visible.value = false;
  }

  setPower(power: number, estimatedDistance?: number, cookingTime?: number): void {
    this.power.value = power;
    this.estimatedDistance.value = estimatedDistance;
    this.cookingTime.value = cookingTime;
  }
}
