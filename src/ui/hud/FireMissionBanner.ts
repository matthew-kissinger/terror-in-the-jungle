// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * FireMissionBanner — the DESIGNATE / CONFIRM / INBOUND HUD for an air-support
 * call-in. A body-level overlay (like the radio dial / command overlay) with a
 * top status strip, a center designate reticle that pulses on a valid lock, and
 * a bottom action hint. Pure DOM + CSS module; reads its state from
 * `CommandInputManager` and emits nothing (no game logic here).
 */

import styles from './FireMissionBanner.module.css';

export type DesignateStatusKind = 'valid' | 'invalid' | 'danger';

export interface DesignateView {
  asset: string;
  statusLabel: string;       // e.g. "RANGE 412m" / "TOO FAR" / "DANGER CLOSE"
  statusKind: DesignateStatusKind;
  hint: string;              // e.g. "[LMB] mark   [Esc] back"
}

export interface ConfirmView {
  asset: string;
  gridText: string;          // e.g. "GRID 412 / -088"
  danger: boolean;
  override: boolean;         // true once the danger-close override is armed
}

export class FireMissionBanner {
  private readonly root: HTMLDivElement;
  private readonly strip: HTMLDivElement;
  private readonly reticle: HTMLDivElement;
  private readonly hint: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = styles.root;
    this.root.dataset.state = 'hidden';
    this.root.setAttribute('aria-hidden', 'true');

    this.strip = document.createElement('div');
    this.strip.className = styles.strip;

    this.reticle = document.createElement('div');
    this.reticle.className = styles.reticle;
    this.reticle.innerHTML = `<span class="${styles.reticleRing}"></span><span class="${styles.reticleDot}"></span>`;

    this.hint = document.createElement('div');
    this.hint.className = styles.hint;

    this.root.append(this.strip, this.reticle, this.hint);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  unmount(): void {
    this.root.remove();
  }

  showDesignate(view: DesignateView): void {
    this.root.dataset.state = 'designate';
    this.strip.innerHTML = `<span class="${styles.asset}">${view.asset}</span><span class="${styles.sep}">DESIGNATE</span><span class="${styles.status}" data-kind="${view.statusKind}">${view.statusLabel}</span>`;
    this.reticle.dataset.kind = view.statusKind;
    this.hint.textContent = view.hint;
  }

  showConfirm(view: ConfirmView): void {
    this.root.dataset.state = 'confirm';
    const lead = view.override ? 'CONFIRM AGAIN' : 'CLEARED HOT?';
    const danger = view.danger ? `<span class="${styles.danger}">⚠ DANGER CLOSE</span>` : '';
    this.strip.innerHTML = `<span class="${styles.lead}">${lead}</span><span class="${styles.asset}">${view.asset}</span><span class="${styles.grid}">${view.gridText}</span>${danger}`;
    this.reticle.dataset.kind = view.danger ? 'danger' : 'valid';
    this.hint.textContent = view.override
      ? 'Friendlies in radius — [LMB] confirm anyway   [Esc] abort'
      : '[LMB] confirm   [Esc] abort';
  }

  showInbound(asset: string, callsign: string): void {
    this.root.dataset.state = 'inbound';
    this.strip.innerHTML = `<span class="${styles.asset}">${asset}</span><span class="${styles.sep}">INBOUND</span><span class="${styles.status}" data-kind="valid">${callsign}</span>`;
    this.hint.textContent = '';
  }

  hide(): void {
    this.root.dataset.state = 'hidden';
  }

  dispose(): void {
    this.unmount();
  }
}
