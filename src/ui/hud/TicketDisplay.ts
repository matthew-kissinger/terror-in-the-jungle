// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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

type TicketUrgencyBucket = 'normal' | 'low' | 'critical';

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
  private headerEl?: HTMLElement;
  private usFactionEl?: HTMLElement;
  private opforFactionEl?: HTMLElement;
  private usLabelEl?: HTMLElement;
  private opforLabelEl?: HTMLElement;
  private usCountEl?: HTMLElement;
  private opforCountEl?: HTMLElement;
  private usBleedEl?: HTMLElement;
  private opforBleedEl?: HTMLElement;
  private displayedUsTickets = Math.round(this.usTickets.value);
  private displayedOpforTickets = Math.round(this.opforTickets.value);
  private urgencyKey = this.getUrgencyKey(this.usTickets.value, this.opforTickets.value);
  private bleedVisualKey = this.getBleedVisualKey(this.bleedSide.value, this.bleedRate.value);

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
    this.headerEl = this.$('[data-ref="header"]') ?? undefined;
    this.usFactionEl = this.$('[data-ref="us-faction"]') ?? undefined;
    this.opforFactionEl = this.$('[data-ref="opfor-faction"]') ?? undefined;
    this.usLabelEl = this.$('[data-ref="us-label"]') ?? undefined;
    this.opforLabelEl = this.$('[data-ref="opfor-label"]') ?? undefined;
    this.usCountEl = this.$('[data-ref="us-count"]') ?? undefined;
    this.opforCountEl = this.$('[data-ref="opfor-count"]') ?? undefined;
    this.usBleedEl = this.$('[data-ref="us-bleed"]') ?? undefined;
    this.opforBleedEl = this.$('[data-ref="opfor-bleed"]') ?? undefined;

    // Effect: update US ticket count
    this.effect(() => {
      this.setTextIfChanged(this.usCountEl, String(Math.round(this.usTickets.value)));
    });

    // Effect: update OPFOR ticket count
    this.effect(() => {
      this.setTextIfChanged(this.opforCountEl, String(Math.round(this.opforTickets.value)));
    });

    // Effect: mode switch (TDM vs standard) + faction labels
    this.effect(() => {
      const tdm = this.isTDM.value;
      const bLabel = this.bluforLabel.value;
      const oLabel = this.opforLabel.value;

      this.setTextIfChanged(this.usLabelEl, tdm ? `${bLabel} Kills` : bLabel);
      this.setTextIfChanged(this.opforLabelEl, tdm ? `${oLabel} Kills` : oLabel);

      if (this.headerEl) {
        if (tdm) {
          this.headerEl.classList.remove(styles.headerHidden);
        } else {
          this.headerEl.classList.add(styles.headerHidden);
        }
      }
    });

    // Effect: TDM header text
    this.effect(() => {
      const target = this.killTarget.value;
      if (target > 0) {
        this.setTextIfChanged(this.headerEl, `FIRST TO ${target} KILLS`);
      }
    });

    // Effect: bleed indicator (conquest only)
    this.effect(() => {
      const side = this.bleedSide.value;
      const rate = this.bleedRate.value;
      const tdm = this.isTDM.value;
      if (!this.usBleedEl || !this.opforBleedEl) return;

      if (tdm || side === null || rate <= 0) {
        this.setTextIfChanged(this.usBleedEl, '');
        this.setTextIfChanged(this.opforBleedEl, '');
        return;
      }

      const arrow = rate >= 2 ? '\u25bc\u25bc' : '\u25bc';
      if (side === 'us') {
        this.setTextIfChanged(this.usBleedEl, arrow);
        this.setTextIfChanged(this.opforBleedEl, '');
      } else {
        this.setTextIfChanged(this.usBleedEl, '');
        this.setTextIfChanged(this.opforBleedEl, arrow);
      }
    });

    // Effect: urgency warnings (conquest: low tickets, TDM: approaching kill target)
    this.effect(() => {
      const us = this.usTickets.value;
      const opfor = this.opforTickets.value;
      const tdm = this.isTDM.value;
      const target = this.killTarget.value;

      if (tdm && target > 0) {
        // TDM: urgency when either team approaches the kill target
        const leadKills = Math.max(us, opfor);
        const ratio = leadKills / target;
        const approaching = ratio >= 0.75;
        const imminent = ratio >= 0.9;
        // Highlight the leading team
        const usLeads = us >= opfor;
        if (this.usFactionEl) {
          this.usFactionEl.classList.toggle(styles.critical, imminent && usLeads);
          this.usFactionEl.classList.toggle(styles.low, approaching && !imminent && usLeads);
        }
        if (this.opforFactionEl) {
          this.opforFactionEl.classList.toggle(styles.critical, imminent && !usLeads);
          this.opforFactionEl.classList.toggle(styles.low, approaching && !imminent && !usLeads);
        }
      } else {
        // Conquest: low ticket warning
        if (this.usFactionEl) {
          this.usFactionEl.classList.toggle(styles.critical, us <= this.CRITICAL_THRESHOLD);
          this.usFactionEl.classList.toggle(styles.low, us > this.CRITICAL_THRESHOLD && us <= this.LOW_THRESHOLD);
        }
        if (this.opforFactionEl) {
          this.opforFactionEl.classList.toggle(styles.critical, opfor <= this.CRITICAL_THRESHOLD);
          this.opforFactionEl.classList.toggle(styles.low, opfor > this.CRITICAL_THRESHOLD && opfor <= this.LOW_THRESHOLD);
        }
      }
    });
  }

  protected onUnmount(): void {
    this.headerEl = undefined;
    this.usFactionEl = undefined;
    this.opforFactionEl = undefined;
    this.usLabelEl = undefined;
    this.opforLabelEl = undefined;
    this.usCountEl = undefined;
    this.opforCountEl = undefined;
    this.usBleedEl = undefined;
    this.opforBleedEl = undefined;
  }

  // --- Public API ---

  /**
   * Update ticket counts. Called by HUDUpdater per frame.
   * Only triggers DOM updates when values actually change (signal dedup).
   */
  setTickets(us: number, opfor: number): void {
    const nextUsTickets = Math.round(us);
    const nextOpforTickets = Math.round(opfor);
    const nextUrgencyKey = this.getUrgencyKey(us, opfor);
    if (
      nextUsTickets === this.displayedUsTickets &&
      nextOpforTickets === this.displayedOpforTickets &&
      nextUrgencyKey === this.urgencyKey
    ) {
      return;
    }

    this.displayedUsTickets = nextUsTickets;
    this.displayedOpforTickets = nextOpforTickets;
    this.urgencyKey = nextUrgencyKey;
    this.usTickets.value = us;
    this.opforTickets.value = opfor;
  }

  /**
   * Switch between standard (conquest) and TDM mode.
   */
  setMode(isTDM: boolean, killTarget: number = 0): void {
    this.isTDM.value = isTDM;
    this.killTarget.value = killTarget;
    this.urgencyKey = this.getUrgencyKey(this.usTickets.value, this.opforTickets.value, isTDM, killTarget);
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
    const nextBleedVisualKey = this.getBleedVisualKey(side, rate);
    if (nextBleedVisualKey === this.bleedVisualKey) {
      return;
    }

    this.bleedVisualKey = nextBleedVisualKey;
    this.bleedSide.value = side;
    this.bleedRate.value = rate;
  }

  private getUrgencyKey(
    us: number,
    opfor: number,
    isTDM = this.isTDM.value,
    killTarget = this.killTarget.value,
  ): string {
    if (isTDM && killTarget > 0) {
      const leadKills = Math.max(us, opfor);
      const ratio = leadKills / killTarget;
      const bucket: TicketUrgencyBucket = ratio >= 0.9
        ? 'critical'
        : ratio >= 0.75
          ? 'low'
          : 'normal';
      const leader = us >= opfor ? 'us' : 'opfor';
      return `tdm:${leader}:${bucket}`;
    }

    return `conquest:${this.getConquestBucket(us)}:${this.getConquestBucket(opfor)}`;
  }

  private getConquestBucket(tickets: number): TicketUrgencyBucket {
    if (tickets <= this.CRITICAL_THRESHOLD) return 'critical';
    if (tickets <= this.LOW_THRESHOLD) return 'low';
    return 'normal';
  }

  private getBleedVisualKey(side: 'us' | 'opfor' | null, rate: number): string {
    if (side === null || rate <= 0) return 'none';
    return `${side}:${rate >= 2 ? 'double' : 'single'}`;
  }

  private setTextIfChanged(element: HTMLElement | undefined, text: string): void {
    if (element && element.textContent !== text) {
      element.textContent = text;
    }
  }
}
