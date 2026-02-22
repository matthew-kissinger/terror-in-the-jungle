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

export class MatchTimer extends UIComponent {
  // --- Reactive state ---
  private timeRemaining = this.signal(Infinity);

  protected build(): void {
    this.root.className = styles.container;
    this.root.innerHTML = `<div data-ref="display" class="${styles.display}">0:00</div>`;
  }

  protected onMount(): void {
    // Effect: format and display time
    this.effect(() => {
      const t = this.timeRemaining.value;
      const minutes = Math.floor(Math.max(0, t) / 60);
      const seconds = Math.floor(Math.max(0, t) % 60);
      this.text('[data-ref="display"]', `${minutes}:${seconds.toString().padStart(2, '0')}`);
    });

    // Effect: warning/critical classes
    this.effect(() => {
      const t = this.timeRemaining.value;
      const isCritical = t <= 30;
      const isWarning = !isCritical && t <= 60;

      this.toggleClass(styles.critical, isCritical);
      this.toggleClass(styles.warning, isWarning);
    });
  }

  // --- Public API ---

  /** Update the remaining time. Called by HUDUpdater per tick. */
  setTime(timeRemaining: number): void {
    this.timeRemaining.value = timeRemaining;
  }
}
