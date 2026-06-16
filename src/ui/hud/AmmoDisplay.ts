// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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

type AmmoStatusBucket = 'normal' | 'low' | 'empty' | 'noAmmo';

interface AmmoViewState {
  magazineText: string;
  reserveText: string;
  statusBucket: AmmoStatusBucket;
  statusText: string;
  statusHidden: boolean;
}

function getAmmoViewState(magazine: number, reserve: number): AmmoViewState {
  let statusBucket: AmmoStatusBucket = 'normal';
  let statusText = '';

  if (magazine === 0 && reserve === 0) {
    statusBucket = 'noAmmo';
    statusText = 'No ammo!';
  } else if (magazine === 0 && reserve > 0) {
    statusBucket = 'empty';
    statusText = isTouchDevice() ? 'Tap reload' : 'Press R to reload';
  } else if (magazine <= 10 && magazine > 0) {
    statusBucket = 'low';
    statusText = 'Low ammo';
  }

  return {
    magazineText: String(magazine),
    reserveText: String(reserve),
    statusBucket,
    statusText,
    statusHidden: statusText === '',
  };
}

function isSameAmmoViewState(a: AmmoViewState, b: AmmoViewState): boolean {
  return a.magazineText === b.magazineText
    && a.reserveText === b.reserveText
    && a.statusBucket === b.statusBucket
    && a.statusText === b.statusText
    && a.statusHidden === b.statusHidden;
}

export class AmmoDisplay extends UIComponent {
  // --- Reactive state ---
  private ammoViewState = this.signal(getAmmoViewState(30, 90));
  private magazineEl?: HTMLElement;
  private reserveEl?: HTMLElement;
  private statusEl?: HTMLElement;
  private statusBucket: AmmoStatusBucket = 'normal';

  private readonly statusClassByBucket: Partial<Record<AmmoStatusBucket, string>> = {
    low: styles.low,
    empty: styles.empty,
    noAmmo: styles.noAmmo,
  };

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
    this.magazineEl = this.$('[data-ref="magazine"]') ?? undefined;
    this.reserveEl = this.$('[data-ref="reserve"]') ?? undefined;
    this.statusEl = this.$('[data-ref="status"]') ?? undefined;

    // Effect: apply one coherent visible ammo/status state per logical update.
    this.effect(() => {
      this.applyViewState(this.ammoViewState.value);
    });
  }

  protected onUnmount(): void {
    this.magazineEl = undefined;
    this.reserveEl = undefined;
    this.statusEl = undefined;
  }

  // --- Public API ---

  /** Update ammo counts. Called by HUDElements per frame. */
  setAmmo(magazine: number, reserve: number): void {
    const nextViewState = getAmmoViewState(magazine, reserve);
    if (isSameAmmoViewState(this.ammoViewState.value, nextViewState)) return;
    this.ammoViewState.value = nextViewState;
  }

  private applyViewState(viewState: AmmoViewState): void {
    this.setTextIfChanged(this.magazineEl, viewState.magazineText);
    this.setTextIfChanged(this.reserveEl, viewState.reserveText);
    if (!this.statusEl) return;

    if (viewState.statusBucket !== this.statusBucket) {
      const previousClass = this.statusClassByBucket[this.statusBucket];
      const nextClass = this.statusClassByBucket[viewState.statusBucket];
      if (previousClass) this.root.classList.remove(previousClass);
      if (nextClass) this.root.classList.add(nextClass);
      this.statusBucket = viewState.statusBucket;
    }

    this.setTextIfChanged(this.statusEl, viewState.statusText);
    if (this.statusEl.classList.contains(styles.statusHidden) !== viewState.statusHidden) {
      this.statusEl.classList.toggle(styles.statusHidden, viewState.statusHidden);
    }
  }

  private setTextIfChanged(element: HTMLElement | undefined, text: string): void {
    if (element && element.textContent !== text) {
      element.textContent = text;
    }
  }
}
