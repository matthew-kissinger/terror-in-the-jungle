// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * EmplacementGunPanel - M2HB heavy-MG station readout (Field Journal language).
 *
 * A small, self-contained HUD chip for the M2HB gunner seat (R2
 * m2hb-gun-experience). Owned + lifecycle-driven by `EmplacementPlayerAdapter`:
 * mounted on gunner-seat entry, updated each frame with the live weapon +
 * traverse state, unmounted on exit. It mirrors `TankGunnerPanel` (R2
 * tank-gunner-sight) in shape + FJ styling, but reads as a belt-fed MG station
 * rather than a crew-served cannon:
 *
 *   1. BELT readout — rounds remaining in the box, straight from
 *      `M2HBWeapon.getAmmo()`. The belt refills on dismount via the existing
 *      reload-on-dismount path; this panel is DISPLAY ONLY (no new ammo
 *      mechanics). Under a LOW threshold the count turns stamp red.
 *   2. Belt bar — a hatched fill that drains as the box empties, so the
 *      gunner can read remaining capacity at a glance.
 *   3. Traverse-stop cue — a directional tick (LEFT / RIGHT / UP / DOWN) that
 *      flashes when the barrel hits its mechanical stop, so the gunner feels
 *      the swing weight running out of travel.
 *
 * Field Journal: dark manila chip (`rgba(43,38,32,...)`) with paper-light
 * Special Elite numerals/labels, stamp red for the LOW belt + traverse stops,
 * field green for a full belt. No fallbacks — CSS custom properties are used
 * bare (a missing token must surface).
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './EmplacementGunPanel.module.css';

/** Which mechanical stop the barrel just hit (drives the directional cue). */
export type TraverseStop = 'left' | 'right' | 'up' | 'down';

/** Rounds at or below this are shown as a LOW (stamp-red) belt. */
export const BELT_LOW_THRESHOLD = 40;

export class EmplacementGunPanel extends UIComponent {
  /** Rounds remaining in the box. */
  private ammo = this.signal(0);
  /** Box capacity (full belt) — drives the belt-bar fill ratio. */
  private ammoMax = this.signal(1);
  /** The stop edge currently flashing, or null when no stop is active. */
  private traverseStop = this.signal<TraverseStop | null>(null);

  protected build(): void {
    this.root.className = styles.panel;
    this.root.innerHTML = `
      <div class="${styles.beltRow}">
        <div class="${styles.label}">BELT</div>
        <div data-ref="count" class="${styles.count}">000</div>
      </div>
      <div class="${styles.beltBarOuter}">
        <div data-ref="beltFill" class="${styles.beltFill}"></div>
      </div>
      <div class="${styles.stops}">
        <div data-ref="stopUp" class="${styles.stop} ${styles.stopUp}">UP</div>
        <div data-ref="stopLeft" class="${styles.stop} ${styles.stopLeft}">L</div>
        <div data-ref="stopRight" class="${styles.stop} ${styles.stopRight}">R</div>
        <div data-ref="stopDown" class="${styles.stop} ${styles.stopDown}">DN</div>
      </div>
    `;
  }

  protected onMount(): void {
    // Belt count text + LOW (stamp-red) styling under the threshold.
    this.effect(() => {
      const el = this.$('[data-ref="count"]');
      if (!el) return;
      const rounds = Math.max(0, Math.round(this.ammo.value));
      el.textContent = String(rounds).padStart(3, '0');
      const low = rounds <= BELT_LOW_THRESHOLD;
      el.classList.toggle(styles.countLow, low);
      el.classList.toggle(styles.countOk, !low);
    });

    // Belt bar fill (remaining fraction of the box).
    this.effect(() => {
      const fill = this.$('[data-ref="beltFill"]');
      if (!fill) return;
      const max = this.ammoMax.value > 0 ? this.ammoMax.value : 1;
      const pct = Math.max(0, Math.min(1, this.ammo.value / max)) * 100;
      fill.style.width = `${pct}%`;
    });

    // Directional traverse-stop cue — exactly one edge lit at a time.
    this.effect(() => {
      const active = this.traverseStop.value;
      const up = this.$('[data-ref="stopUp"]');
      const down = this.$('[data-ref="stopDown"]');
      const left = this.$('[data-ref="stopLeft"]');
      const right = this.$('[data-ref="stopRight"]');
      up?.classList.toggle(styles.stopActive, active === 'up');
      down?.classList.toggle(styles.stopActive, active === 'down');
      left?.classList.toggle(styles.stopActive, active === 'left');
      right?.classList.toggle(styles.stopActive, active === 'right');
    });
  }

  // --- Public API (driven by the emplacement adapter each frame) ---

  /** Set the live belt count + capacity (rounds remaining / box size). */
  setBelt(rounds: number, capacity: number): void {
    this.ammo.value = rounds;
    this.ammoMax.value = capacity;
  }

  /**
   * Flash a directional traverse-stop cue, or clear it with `null`. Called
   * each frame by the adapter: the stop edge that the barrel is currently
   * pinned against (or null when the barrel has travel in every direction).
   */
  setTraverseStop(stop: TraverseStop | null): void {
    this.traverseStop.value = stop;
  }

  getAmmo(): number {
    return this.ammo.value;
  }

  getTraverseStop(): TraverseStop | null {
    return this.traverseStop.value;
  }
}
