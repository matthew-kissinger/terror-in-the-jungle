/**
 * TicketDisplay - Shows faction ticket/kill counts.
 *
 * Supports two modes:
 * - Standard (conquest): "US Forces 300 | 300 OPFOR"
 * - TDM (team deathmatch): "US Kills 15 | 15 OPFOR Kills" with target header
 *
 * Design: Bare text with text-shadow, no glass panel. Follows P1 principle --
 * in-combat HUD feels etched into the viewport, not floating on top.
 *
 * Reactive: Signal-driven updates. Callers set values via setTickets(),
 * DOM updates happen automatically through effects.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TicketDisplay.module.css';

export class TicketDisplay extends UIComponent {
  // --- Reactive state ---
  private usTickets = this.signal(0);
  private opforTickets = this.signal(0);
  private isTDM = this.signal(false);
  private killTarget = this.signal(0);

  /** Threshold below which tickets pulse (conquest only) */
  private readonly LOW_THRESHOLD = 50;
  private readonly CRITICAL_THRESHOLD = 20;

  protected build(): void {
    this.root.className = styles.container;
    this.root.innerHTML = `
      <div data-ref="header" class="${styles.header} ${styles.headerHidden}"></div>
      <div class="${styles.faction} ${styles.us}" data-ref="us-faction">
        <span class="${styles.label}" data-ref="us-label">US Forces</span>
        <span class="${styles.count}" data-ref="us-count">0</span>
      </div>
      <span class="${styles.separator}">|</span>
      <div class="${styles.faction} ${styles.opfor}" data-ref="opfor-faction">
        <span class="${styles.label}" data-ref="opfor-label">OPFOR</span>
        <span class="${styles.count}" data-ref="opfor-count">0</span>
      </div>
    `;
  }

  protected onMount(): void {
    // Effect: update US ticket count
    this.effect(() => {
      this.text('[data-ref="us-count"]', String(Math.round(this.usTickets.value)));
    });

    // Effect: update OPFOR ticket count
    this.effect(() => {
      this.text('[data-ref="opfor-count"]', String(Math.round(this.opforTickets.value)));
    });

    // Effect: mode switch (TDM vs standard)
    this.effect(() => {
      const tdm = this.isTDM.value;
      const header = this.$('[data-ref="header"]');
      const usLabel = this.$('[data-ref="us-label"]');
      const opforLabel = this.$('[data-ref="opfor-label"]');

      if (usLabel) usLabel.textContent = tdm ? 'US Kills' : 'US Forces';
      if (opforLabel) opforLabel.textContent = tdm ? 'OPFOR Kills' : 'OPFOR';

      if (header) {
        if (tdm) {
          header.classList.remove(styles.headerHidden);
        } else {
          header.classList.add(styles.headerHidden);
        }
      }
    });

    // Effect: TDM header text
    this.effect(() => {
      const target = this.killTarget.value;
      if (target > 0) {
        this.text('[data-ref="header"]', `FIRST TO ${target} KILLS`);
      }
    });

    // Effect: low ticket warning (conquest only)
    this.effect(() => {
      const us = this.usTickets.value;
      const tdm = this.isTDM.value;
      const el = this.$('[data-ref="us-faction"]');
      if (!el || tdm) return;

      el.classList.toggle(styles.critical, us <= this.CRITICAL_THRESHOLD);
      el.classList.toggle(styles.low, us > this.CRITICAL_THRESHOLD && us <= this.LOW_THRESHOLD);
    });

    this.effect(() => {
      const opfor = this.opforTickets.value;
      const tdm = this.isTDM.value;
      const el = this.$('[data-ref="opfor-faction"]');
      if (!el || tdm) return;

      el.classList.toggle(styles.critical, opfor <= this.CRITICAL_THRESHOLD);
      el.classList.toggle(styles.low, opfor > this.CRITICAL_THRESHOLD && opfor <= this.LOW_THRESHOLD);
    });
  }

  // --- Public API ---

  /**
   * Update ticket counts. Called by HUDUpdater per frame.
   * Only triggers DOM updates when values actually change (signal dedup).
   */
  setTickets(us: number, opfor: number): void {
    this.usTickets.value = us;
    this.opforTickets.value = opfor;
  }

  /**
   * Switch between standard (conquest) and TDM mode.
   */
  setMode(isTDM: boolean, killTarget: number = 0): void {
    this.isTDM.value = isTDM;
    this.killTarget.value = killTarget;
  }
}
