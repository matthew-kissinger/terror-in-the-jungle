/**
 * MobileStatusBar - Compact merged status line for touch devices.
 *
 * Combines timer and tickets into a single horizontal pill:
 *   12:45 • US 300 | 300 OP
 *
 * K/D is displayed separately under the minimap via the 'stats' grid slot.
 * Hidden on desktop via CSS (where separate TicketDisplay/MatchTimer render).
 * Mounts into the 'status-bar' grid slot.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './MobileStatusBar.module.css';

export class MobileStatusBar extends UIComponent {
  private timeRemaining = this.signal(Infinity);
  private usTickets = this.signal(0);
  private opforTickets = this.signal(0);

  protected build(): void {
    this.root.className = styles.bar;
    this.root.innerHTML = `
      <span class="${styles.timer}" data-ref="timer">0:00</span>
      <span class="${styles.dot}">\u2022</span>
      <span class="${styles.tickets}">
        <span class="${styles.us}" data-ref="us">0</span>
        <span class="${styles.sep}">|</span>
        <span class="${styles.opfor}" data-ref="opfor">0</span>
      </span>
    `;
  }

  protected onMount(): void {
    // Timer formatting + warning/critical states
    this.effect(() => {
      const t = this.timeRemaining.value;
      const m = Math.floor(Math.max(0, t) / 60);
      const s = Math.floor(Math.max(0, t) % 60);
      const timerEl = this.$('[data-ref="timer"]');
      if (timerEl) {
        timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        timerEl.classList.toggle(styles.timerWarning, t <= 60 && t > 30);
        timerEl.classList.toggle(styles.timerCritical, t <= 30);
      }
    });

    this.effect(() => {
      this.text('[data-ref="us"]', String(Math.round(this.usTickets.value)));
    });

    this.effect(() => {
      this.text('[data-ref="opfor"]', String(Math.round(this.opforTickets.value)));
    });
  }

  // --- Public API ---

  setTime(t: number): void {
    this.timeRemaining.value = t;
  }

  setTickets(us: number, opfor: number): void {
    this.usTickets.value = us;
    this.opforTickets.value = opfor;
  }
}
