// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * RadioHotbarSlot — the dedicated, non-weapon Radio HUD affordance. It is a
 * sibling pill on the HUD (NOT a 7th `WeaponSlot`, NOT a carried loadout item):
 * tapping it opens the radio dial, exactly like the `KeyT` / hold-T path.
 *
 * Ships ONE icon representation: an inline SVG handheld-radio glyph (no PNG
 * asset). Works on both desktop and touch; the press target is ≥44px so it is
 * usable one-handed on phone.
 */

import styles from './RadioHotbarSlot.module.css';

/**
 * DOM event the slot fires on activation. `CommandInputManager` listens for it
 * so the slot (built by `HUDElements`) and the dial owner stay decoupled — no
 * composition-point glue needed to connect a HUD click to the dial.
 */
export const RADIO_SLOT_OPEN_EVENT = 'titj:radio-slot-open';

const RADIO_GLYPH = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="5" y="8" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <line x1="15" y1="8" x2="19" y2="3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="19" cy="3" r="1.4" fill="currentColor"/>
    <circle cx="9" cy="14" r="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <line x1="14" y1="12" x2="17" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <line x1="14" y1="15" x2="17" y2="15" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </svg>
`;

export class RadioHotbarSlot {
  private readonly root: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private onActivate?: () => void;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = styles.slot;

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = styles.button;
    this.button.setAttribute('aria-label', 'Open field radio');
    this.button.title = 'Field Radio (T)';
    this.button.innerHTML = `
      <span class="${styles.icon}">${RADIO_GLYPH}</span>
      <span class="${styles.label}">RADIO</span>
      <span class="${styles.key}" aria-hidden="true">T</span>
    `;
    this.button.addEventListener('click', () => this.activate());

    this.root.appendChild(this.button);
  }

  private activate(): void {
    this.onActivate?.();
    // Broadcast so the dial owner can open without composition-point glue.
    document.dispatchEvent(new CustomEvent(RADIO_SLOT_OPEN_EVENT));
  }

  getElement(): HTMLElement {
    return this.root;
  }

  setOnActivate(callback: () => void): void {
    this.onActivate = callback;
  }

  /** Reflect open/closed state for an active highlight. */
  setActive(active: boolean): void {
    this.button.dataset.active = active ? 'true' : 'false';
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  unmount(): void {
    this.root.remove();
  }

  dispose(): void {
    this.unmount();
  }
}
