// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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

interface BreathGaugeViewState {
  fillWidth: string;
  remainingText: string;
  critical: boolean;
}

function getBreathGaugeViewState(remainingSeconds: number, capacitySeconds: number): BreathGaugeViewState {
  const capacity = Math.max(0.001, capacitySeconds);
  const fraction = Math.max(0, Math.min(1, remainingSeconds / capacity));
  return {
    fillWidth: `${(fraction * 100).toFixed(1)}%`,
    remainingText: `${Math.max(0, Math.ceil(remainingSeconds))}s`,
    critical: fraction <= CRITICAL_FRACTION,
  };
}

function isSameBreathGaugeViewState(a: BreathGaugeViewState, b: BreathGaugeViewState): boolean {
  return a.fillWidth === b.fillWidth &&
    a.remainingText === b.remainingText &&
    a.critical === b.critical;
}

export class BreathGauge extends UIComponent {
  private viewState = this.signal(getBreathGaugeViewState(45, 45));
  private visible = this.signal(false);
  private fillEl?: HTMLElement;
  private textEl?: HTMLElement;
  private labelEl?: HTMLElement;

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
    this.fillEl = this.$('[data-ref="fill"]') ?? undefined;
    this.textEl = this.$('[data-ref="text"]') ?? undefined;
    this.labelEl = this.$('[data-ref="label"]') ?? undefined;

    // Effect: visibility.
    this.effect(() => {
      this.toggleClass(styles.visible, this.visible.value);
    });

    // Effect: fill width + text + critical state.
    this.effect(() => {
      const viewState = this.viewState.value;
      if (!this.fillEl || !this.textEl || !this.labelEl) return;

      if (this.fillEl.style.width !== viewState.fillWidth) {
        this.fillEl.style.width = viewState.fillWidth;
      }
      if (this.textEl.textContent !== viewState.remainingText) {
        this.textEl.textContent = viewState.remainingText;
      }

      this.fillEl.classList.toggle(styles.fillCritical, viewState.critical);
      this.labelEl.classList.toggle(styles.labelCritical, viewState.critical);
    });
  }

  protected onUnmount(): void {
    this.fillEl = undefined;
    this.textEl = undefined;
    this.labelEl = undefined;
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
    const nextViewState = getBreathGaugeViewState(remainingSeconds, capacitySeconds);
    if (isSameBreathGaugeViewState(this.viewState.value, nextViewState)) return;
    this.viewState.value = nextViewState;
  }
}
