// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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

export class MobileStatusBar extends UIComponent {
  private timeRemaining = this.signal(Infinity);
  private usTickets = this.signal(0);
  private opforTickets = this.signal(0);
  private timerEl?: HTMLElement;
  private usEl?: HTMLElement;
  private opforEl?: HTMLElement;
  private displayedSeconds = getDisplaySeconds(this.timeRemaining.value);
  private statusBucket = getStatusBucket(this.timeRemaining.value);
  private displayedUsTickets = Math.round(this.usTickets.value);
  private displayedOpforTickets = Math.round(this.opforTickets.value);

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
    this.timerEl = this.$('[data-ref="timer"]') ?? undefined;
    this.usEl = this.$('[data-ref="us"]') ?? undefined;
    this.opforEl = this.$('[data-ref="opfor"]') ?? undefined;

    // Timer formatting + warning/critical states
    this.effect(() => {
      const t = sanitizeTimeRemaining(this.timeRemaining.value);
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      if (this.timerEl) {
        this.timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        this.timerEl.classList.toggle(styles.timerWarning, t <= 60 && t > 30);
        this.timerEl.classList.toggle(styles.timerCritical, t <= 30);
      }
    });

    this.effect(() => {
      if (this.usEl) {
        this.usEl.textContent = String(Math.round(this.usTickets.value));
      }
    });

    this.effect(() => {
      if (this.opforEl) {
        this.opforEl.textContent = String(Math.round(this.opforTickets.value));
      }
    });
  }

  protected onUnmount(): void {
    this.timerEl = undefined;
    this.usEl = undefined;
    this.opforEl = undefined;
  }

  // --- Public API ---

  setTime(t: number): void {
    const nextDisplayedSeconds = getDisplaySeconds(t);
    const nextStatusBucket = getStatusBucket(t);
    if (nextDisplayedSeconds === this.displayedSeconds && nextStatusBucket === this.statusBucket) {
      return;
    }

    this.displayedSeconds = nextDisplayedSeconds;
    this.statusBucket = nextStatusBucket;
    this.timeRemaining.value = sanitizeTimeRemaining(t);
  }

  setTickets(us: number, opfor: number): void {
    const nextUsTickets = Math.round(us);
    const nextOpforTickets = Math.round(opfor);
    if (nextUsTickets === this.displayedUsTickets && nextOpforTickets === this.displayedOpforTickets) {
      return;
    }

    this.displayedUsTickets = nextUsTickets;
    this.displayedOpforTickets = nextOpforTickets;
    this.usTickets.value = nextUsTickets;
    this.opforTickets.value = nextOpforTickets;
  }
}
