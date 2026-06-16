// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * MatchTimer - Countdown timer for match duration.
 *
 * Displays mm:ss format with warning (<=60s) and critical (<=30s) states.
 * Signal-driven: caller sets time via setTime(), DOM updates automatically.
 *
 * Replaces: GameStatusDisplay.timerElement + HUDUpdater.updateTimer()
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './MatchTimer.module.css';

function sanitizeTimeRemaining(timeRemaining: number): number {
  return Number.isFinite(timeRemaining) ? Math.max(0, timeRemaining) : 0;
}

type TimerStatusBucket = 'normal' | 'warning' | 'critical';

function getDisplaySeconds(timeRemaining: number): number {
  return Math.floor(sanitizeTimeRemaining(timeRemaining));
}

function getStatusBucket(timeRemaining: number): TimerStatusBucket {
  const t = sanitizeTimeRemaining(timeRemaining);
  if (t <= 30) return 'critical';
  if (t <= 60) return 'warning';
  return 'normal';
}

export class MatchTimer extends UIComponent {
  // --- Reactive state ---
  private timeRemaining = this.signal(Infinity);
  private displayEl?: HTMLElement;
  private displayedSeconds = getDisplaySeconds(this.timeRemaining.value);
  private statusBucket = getStatusBucket(this.timeRemaining.value);

  protected build(): void {
    this.root.className = styles.container;
    this.root.innerHTML = `<div data-ref="display" class="${styles.display}">0:00</div>`;
  }

  protected onMount(): void {
    this.displayEl = this.$('[data-ref="display"]') ?? undefined;

    // Effect: format and display time
    this.effect(() => {
      const t = sanitizeTimeRemaining(this.timeRemaining.value);
      const minutes = Math.floor(t / 60);
      const seconds = Math.floor(t % 60);
      if (this.displayEl) {
        this.displayEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
    });

    // Effect: warning/critical classes
    this.effect(() => {
      const t = sanitizeTimeRemaining(this.timeRemaining.value);
      const isCritical = t <= 30;
      const isWarning = !isCritical && t <= 60;

      this.toggleClass(styles.critical, isCritical);
      this.toggleClass(styles.warning, isWarning);
    });
  }

  protected onUnmount(): void {
    this.displayEl = undefined;
  }

  // --- Public API ---

  /** Update the remaining time. Called by HUDUpdater per tick. */
  setTime(timeRemaining: number): void {
    const nextDisplayedSeconds = getDisplaySeconds(timeRemaining);
    const nextStatusBucket = getStatusBucket(timeRemaining);
    if (nextDisplayedSeconds === this.displayedSeconds && nextStatusBucket === this.statusBucket) {
      return;
    }

    this.displayedSeconds = nextDisplayedSeconds;
    this.statusBucket = nextStatusBucket;
    this.timeRemaining.value = sanitizeTimeRemaining(timeRemaining);
  }
}
