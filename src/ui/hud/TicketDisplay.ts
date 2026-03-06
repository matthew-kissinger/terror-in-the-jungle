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
  private bluforLabel = this.signal('US Forces');
  private opforLabel = this.signal('OPFOR');
  private bleedSide = this.signal<'us' | 'opfor' | null>(null);
  private bleedRate = this.signal(0);

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
        <span class="${styles.bleed}" data-ref="us-bleed"></span>
      </div>
      <span class="${styles.separator}">|</span>
      <div class="${styles.faction} ${styles.opfor}" data-ref="opfor-faction">
        <span class="${styles.label}" data-ref="opfor-label">OPFOR</span>
        <span class="${styles.count}" data-ref="opfor-count">0</span>
        <span class="${styles.bleed}" data-ref="opfor-bleed"></span>
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

    // Effect: mode switch (TDM vs standard) + faction labels
    this.effect(() => {
      const tdm = this.isTDM.value;
      const bLabel = this.bluforLabel.value;
      const oLabel = this.opforLabel.value;
      const header = this.$('[data-ref="header"]');
      const usLabelEl = this.$('[data-ref="us-label"]');
      const opforLabelEl = this.$('[data-ref="opfor-label"]');

      if (usLabelEl) usLabelEl.textContent = tdm ? `${bLabel} Kills` : bLabel;
      if (opforLabelEl) opforLabelEl.textContent = tdm ? `${oLabel} Kills` : oLabel;

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

    // Effect: bleed indicator (conquest only)
    this.effect(() => {
      const side = this.bleedSide.value;
      const rate = this.bleedRate.value;
      const tdm = this.isTDM.value;
      const usBleed = this.$('[data-ref="us-bleed"]');
      const opforBleed = this.$('[data-ref="opfor-bleed"]');
      if (!usBleed || !opforBleed) return;

      if (tdm || side === null || rate <= 0) {
        usBleed.textContent = '';
        opforBleed.textContent = '';
        return;
      }

      const arrow = rate >= 2 ? '\u25bc\u25bc' : '\u25bc';
      if (side === 'us') {
        usBleed.textContent = arrow;
        opforBleed.textContent = '';
      } else {
        usBleed.textContent = '';
        opforBleed.textContent = arrow;
      }
    });

    // Effect: urgency warnings (conquest: low tickets, TDM: approaching kill target)
    this.effect(() => {
      const us = this.usTickets.value;
      const opfor = this.opforTickets.value;
      const tdm = this.isTDM.value;
      const target = this.killTarget.value;
      const usEl = this.$('[data-ref="us-faction"]');
      const opforEl = this.$('[data-ref="opfor-faction"]');

      if (tdm && target > 0) {
        // TDM: urgency when either team approaches the kill target
        const leadKills = Math.max(us, opfor);
        const ratio = leadKills / target;
        const approaching = ratio >= 0.75;
        const imminent = ratio >= 0.9;
        // Highlight the leading team
        const usLeads = us >= opfor;
        if (usEl) {
          usEl.classList.toggle(styles.critical, imminent && usLeads);
          usEl.classList.toggle(styles.low, approaching && !imminent && usLeads);
        }
        if (opforEl) {
          opforEl.classList.toggle(styles.critical, imminent && !usLeads);
          opforEl.classList.toggle(styles.low, approaching && !imminent && !usLeads);
        }
      } else {
        // Conquest: low ticket warning
        if (usEl) {
          usEl.classList.toggle(styles.critical, us <= this.CRITICAL_THRESHOLD);
          usEl.classList.toggle(styles.low, us > this.CRITICAL_THRESHOLD && us <= this.LOW_THRESHOLD);
        }
        if (opforEl) {
          opforEl.classList.toggle(styles.critical, opfor <= this.CRITICAL_THRESHOLD);
          opforEl.classList.toggle(styles.low, opfor > this.CRITICAL_THRESHOLD && opfor <= this.LOW_THRESHOLD);
        }
      }
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

  /**
   * Set faction display names (e.g. "ARVN" / "VC" instead of default "US Forces" / "OPFOR").
   */
  setFactionLabels(blufor: string, opfor: string): void {
    this.bluforLabel.value = blufor;
    this.opforLabel.value = opfor;
  }

  /**
   * Show which side is bleeding tickets and at what rate.
   * rate >= 2 shows double arrow (strong bleed), rate > 0 shows single arrow.
   * Pass null/0 to hide.
   */
  setBleedIndicator(side: 'us' | 'opfor' | null, rate: number = 0): void {
    this.bleedSide.value = side;
    this.bleedRate.value = rate;
  }
}
