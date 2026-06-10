// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * TankGunnerPanel - M48 main-gun station readout (Field Journal language).
 *
 * A small, self-contained HUD chip for the tank gunner seat (R2
 * tank-gunner-sight). Owned + lifecycle-driven by `TankGunnerAdapter`: mounted
 * on gunner-seat entry, updated each frame with the live weapon + turret state,
 * unmounted on exit. It deliberately does NOT live inside `HUDVehicleHud` — it
 * is a craft-specific panel that flows through the gunner adapter, mirroring how
 * the helicopter / fixed-wing instruments flow through their own components.
 *
 * Three readouts:
 *   1. MAIN GUN state — READY (field green) / RELOADING (stamp red), driven
 *      straight from the adapter's fire-gate. There is no ammo economy here:
 *      the M48 has no stowage count in the model, so the panel shows STATE
 *      ONLY (per the cycle brief), never a round counter.
 *   2. Reload progress — a hatched bar fills as the gate cools, so the gunner
 *      can time the next shot.
 *   3. Turret azimuth — a dial with a rotated needle showing turret yaw
 *      relative to the hull, plus the magnification step (1x / zoom).
 *
 * Field Journal: dark manila chip (`rgba(43,38,32,...)`) with paper-light
 * Special Elite numerals/labels, stamp red for the reloading state, field green
 * for ready. No fallbacks — CSS custom properties are used bare.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TankGunnerPanel.module.css';

export type MainGunState = 'ready' | 'reloading';

export class TankGunnerPanel extends UIComponent {
  private gunState = this.signal<MainGunState>('ready');
  /** Reload completion 0..1 (1 = loaded / ready). */
  private reloadProgress = this.signal(1);
  /** Turret yaw relative to the hull, radians. 0 = barrel over the bow. */
  private turretAzimuth = this.signal(0);
  /** Current sight magnification (e.g. 1 = 1x, 3 = 3x zoom). */
  private magnification = this.signal(1);

  protected build(): void {
    this.root.className = styles.panel;
    this.root.innerHTML = `
      <div class="${styles.gunRow}">
        <div class="${styles.label}">MAIN GUN</div>
        <div data-ref="state" class="${styles.state}">READY</div>
      </div>
      <div class="${styles.reloadBarOuter}">
        <div data-ref="reloadFill" class="${styles.reloadFill}"></div>
      </div>
      <div class="${styles.azimuthRow}">
        <div class="${styles.dial}">
          <div class="${styles.dialBow}"></div>
          <div data-ref="needle" class="${styles.needle}"></div>
          <div class="${styles.dialHub}"></div>
        </div>
        <div class="${styles.azimuthMeta}">
          <div class="${styles.label}">TRAVERSE</div>
          <div data-ref="azDeg" class="${styles.azValue}">0&deg;</div>
          <div data-ref="zoom" class="${styles.zoom}">1.0x</div>
        </div>
      </div>
    `;
  }

  protected onMount(): void {
    // MAIN GUN state text + ready/reloading styling.
    this.effect(() => {
      const reloading = this.gunState.value === 'reloading';
      const el = this.$('[data-ref="state"]');
      if (el) {
        el.textContent = reloading ? 'RELOADING' : 'READY';
        el.classList.toggle(styles.stateReloading, reloading);
        el.classList.toggle(styles.stateReady, !reloading);
      }
    });

    // Reload bar fill.
    this.effect(() => {
      const fill = this.$('[data-ref="reloadFill"]');
      if (fill) {
        const pct = Math.max(0, Math.min(1, this.reloadProgress.value)) * 100;
        fill.style.width = `${pct}%`;
      }
    });

    // Turret azimuth needle + degree readout.
    this.effect(() => {
      const rad = this.turretAzimuth.value;
      const needle = this.$('[data-ref="needle"]');
      if (needle) {
        // Needle points along the barrel: 0 rad is straight up (over the bow).
        const deg = (rad * 180) / Math.PI;
        needle.style.transform = `translate(-50%, -100%) rotate(${deg}deg)`;
      }
      const azEl = this.$('[data-ref="azDeg"]');
      if (azEl) {
        // Display as a signed bearing off the bow, rounded to whole degrees.
        const deg = Math.round((rad * 180) / Math.PI);
        azEl.textContent = `${deg}°`;
      }
    });

    // Magnification readout.
    this.effect(() => {
      const zoom = this.$('[data-ref="zoom"]');
      if (zoom) zoom.textContent = `${this.magnification.value.toFixed(1)}x`;
    });
  }

  // --- Public API (driven by the gunner adapter each frame) ---

  /** Set the main-gun fire-gate state (drives READY / RELOADING). */
  setMainGunState(state: MainGunState): void {
    this.gunState.value = state;
  }

  /** Set reload completion 0..1 (1 = loaded). Clamped on read. */
  setReloadProgress(progress01: number): void {
    this.reloadProgress.value = progress01;
  }

  /** Set turret yaw relative to the hull (radians). */
  setTurretAzimuth(yawRad: number): void {
    this.turretAzimuth.value = yawRad;
  }

  /** Set the current sight magnification factor (1 = 1x). */
  setMagnification(factor: number): void {
    this.magnification.value = factor;
  }

  getMainGunState(): MainGunState {
    return this.gunState.value;
  }
}
