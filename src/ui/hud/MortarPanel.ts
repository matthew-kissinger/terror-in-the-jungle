/**
 * MortarPanel - Mortar deployment HUD with elevation, bearing, and power stats.
 *
 * Signal-driven: caller sets state via setState(), DOM updates automatically.
 * Replaces: MortarIndicator (old factory class)
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './MortarPanel.module.css';

export class MortarPanel extends UIComponent {
  // --- Reactive state ---
  private pitch = this.signal(65.0);
  private yaw = this.signal(0);
  private power = this.signal(0.5);
  private isAiming = this.signal(false);
  private visible = this.signal(false);

  protected build(): void {
    this.root.className = styles.container;
    this.root.innerHTML = `
      <div class="${styles.header}">MORTAR</div>
      <div class="${styles.status}" data-ref="status">DEPLOYED</div>
      <div class="${styles.grid}">
        <div class="${styles.statLabel}">ELEV</div>
        <div class="${styles.statValue}" data-ref="elev">65.0\u00B0</div>
        <div class="${styles.statLabel}">BRG</div>
        <div class="${styles.statValue}" data-ref="brg">000\u00B0</div>
        <div class="${styles.statLabel}">PWR</div>
        <div class="${styles.statValue}" data-ref="pwr">50%</div>
      </div>
      <div class="${styles.barContainer}">
        <div class="${styles.barFill}" data-ref="fill"></div>
      </div>
    `;
  }

  protected onMount(): void {
    // Effect: visibility
    this.effect(() => {
      this.toggleClass(styles.visible, this.visible.value);
    });

    // Effect: status text + color
    this.effect(() => {
      const aiming = this.isAiming.value;
      const statusEl = this.$('[data-ref="status"]');
      if (!statusEl) return;

      statusEl.textContent = aiming ? 'AIMING' : 'DEPLOYED';
      statusEl.classList.toggle(styles.statusAiming, aiming);
      statusEl.classList.toggle(styles.statusDeployed, !aiming);
    });

    // Effect: elevation
    this.effect(() => {
      this.text('[data-ref="elev"]', `${this.pitch.value.toFixed(1)}\u00B0`);
    });

    // Effect: bearing
    this.effect(() => {
      const normalized = ((this.yaw.value % 360) + 360) % 360;
      this.text('[data-ref="brg"]', `${normalized.toFixed(0).padStart(3, '0')}\u00B0`);
    });

    // Effect: power value + bar
    this.effect(() => {
      const pwr = this.power.value;
      this.text('[data-ref="pwr"]', `${Math.round(pwr * 100)}%`);
      const fill = this.$('[data-ref="fill"]');
      if (fill) fill.style.width = `${pwr * 100}%`;
    });
  }

  // --- Public API ---

  show(): void {
    this.visible.value = true;
  }

  hide(): void {
    this.visible.value = false;
  }

  setState(pitch: number, yaw: number, power: number, isAiming: boolean): void {
    this.pitch.value = pitch;
    this.yaw.value = yaw;
    this.power.value = power;
    this.isAiming.value = isAiming;
  }
}
