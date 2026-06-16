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

interface AzimuthViewState {
  needleTransform: string;
  azimuthText: string;
}

function getReloadWidth(progress01: number): string {
  const pct = Math.max(0, Math.min(1, progress01)) * 100;
  return `${pct}%`;
}

function getAzimuthViewState(yawRad: number): AzimuthViewState {
  const deg = (yawRad * 180) / Math.PI;
  return {
    needleTransform: `translate(-50%, -100%) rotate(${deg}deg)`,
    azimuthText: `${Math.round(deg)}°`,
  };
}

function isSameAzimuthViewState(a: AzimuthViewState, b: AzimuthViewState): boolean {
  return a.needleTransform === b.needleTransform && a.azimuthText === b.azimuthText;
}

function getMagnificationText(factor: number): string {
  return `${factor.toFixed(1)}x`;
}

export class TankGunnerPanel extends UIComponent {
  private gunState = this.signal<MainGunState>('ready');
  /** Reload completion 0..1 (1 = loaded / ready). */
  private reloadWidth = this.signal(getReloadWidth(1));
  /** Turret yaw relative to the hull, radians. 0 = barrel over the bow. */
  private azimuthViewState = this.signal(getAzimuthViewState(0));
  /** Current sight magnification (e.g. 1 = 1x, 3 = 3x zoom). */
  private magnificationText = this.signal(getMagnificationText(1));
  private stateEl?: HTMLElement;
  private reloadFillEl?: HTMLElement;
  private needleEl?: HTMLElement;
  private azimuthEl?: HTMLElement;
  private zoomEl?: HTMLElement;

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
    this.stateEl = this.$('[data-ref="state"]') ?? undefined;
    this.reloadFillEl = this.$('[data-ref="reloadFill"]') ?? undefined;
    this.needleEl = this.$('[data-ref="needle"]') ?? undefined;
    this.azimuthEl = this.$('[data-ref="azDeg"]') ?? undefined;
    this.zoomEl = this.$('[data-ref="zoom"]') ?? undefined;

    // MAIN GUN state text + ready/reloading styling.
    this.effect(() => {
      const reloading = this.gunState.value === 'reloading';
      if (this.stateEl) {
        this.setTextIfChanged(this.stateEl, reloading ? 'RELOADING' : 'READY');
        this.stateEl.classList.toggle(styles.stateReloading, reloading);
        this.stateEl.classList.toggle(styles.stateReady, !reloading);
      }
    });

    // Reload bar fill.
    this.effect(() => {
      if (this.reloadFillEl && this.reloadFillEl.style.width !== this.reloadWidth.value) {
        this.reloadFillEl.style.width = this.reloadWidth.value;
      }
    });

    // Turret azimuth needle + degree readout.
    this.effect(() => {
      const viewState = this.azimuthViewState.value;
      if (this.needleEl && this.needleEl.style.transform !== viewState.needleTransform) {
        // Needle points along the barrel: 0 rad is straight up (over the bow).
        this.needleEl.style.transform = viewState.needleTransform;
      }
      if (this.azimuthEl) {
        // Display as a signed bearing off the bow, rounded to whole degrees.
        this.setTextIfChanged(this.azimuthEl, viewState.azimuthText);
      }
    });

    // Magnification readout.
    this.effect(() => {
      this.setTextIfChanged(this.zoomEl, this.magnificationText.value);
    });
  }

  protected onUnmount(): void {
    this.stateEl = undefined;
    this.reloadFillEl = undefined;
    this.needleEl = undefined;
    this.azimuthEl = undefined;
    this.zoomEl = undefined;
  }

  // --- Public API (driven by the gunner adapter each frame) ---

  /** Set the main-gun fire-gate state (drives READY / RELOADING). */
  setMainGunState(state: MainGunState): void {
    if (this.gunState.value === state) return;
    this.gunState.value = state;
  }

  /** Set reload completion 0..1 (1 = loaded). Clamped on read. */
  setReloadProgress(progress01: number): void {
    const nextReloadWidth = getReloadWidth(progress01);
    if (this.reloadWidth.value === nextReloadWidth) return;
    this.reloadWidth.value = nextReloadWidth;
  }

  /** Set turret yaw relative to the hull (radians). */
  setTurretAzimuth(yawRad: number): void {
    const nextViewState = getAzimuthViewState(yawRad);
    if (isSameAzimuthViewState(this.azimuthViewState.value, nextViewState)) return;
    this.azimuthViewState.value = nextViewState;
  }

  /** Set the current sight magnification factor (1 = 1x). */
  setMagnification(factor: number): void {
    const nextMagnificationText = getMagnificationText(factor);
    if (this.magnificationText.value === nextMagnificationText) return;
    this.magnificationText.value = nextMagnificationText;
  }

  getMainGunState(): MainGunState {
    return this.gunState.value;
  }

  private setTextIfChanged(element: HTMLElement | undefined, text: string): void {
    if (element && element.textContent !== text) {
      element.textContent = text;
    }
  }
}
