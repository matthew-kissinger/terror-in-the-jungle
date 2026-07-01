// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import styles from './SmokeMarkerPrompt.module.css';

/**
 * Low-chrome action prompt for the temporary smoke-marker tool armed by radio.
 * It is intentionally not a weapon-slot UI; it only explains the current modal
 * verb while keeping the center playfield clear for the throw arc.
 */
export class SmokeMarkerPrompt {
  private readonly root: HTMLDivElement;
  private readonly asset: HTMLSpanElement;
  private readonly action: HTMLSpanElement;
  private readonly hint: HTMLSpanElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = styles.root;
    this.root.dataset.visible = 'false';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.setAttribute('aria-live', 'polite');

    this.asset = document.createElement('span');
    this.asset.className = styles.asset;

    this.action = document.createElement('span');
    this.action.className = styles.action;
    this.action.textContent = 'SMOKE MARKER ARMED';

    this.hint = document.createElement('span');
    this.hint.className = styles.hint;
    this.hint.textContent = 'Hold LMB to throw / Esc cancel';

    this.root.append(this.asset, this.action, this.hint);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  unmount(): void {
    this.root.remove();
  }

  show(assetLabel: string): void {
    this.asset.textContent = assetLabel.toUpperCase();
    this.root.dataset.visible = 'true';
    this.root.setAttribute('aria-hidden', 'false');
  }

  hide(): void {
    this.root.dataset.visible = 'false';
    this.root.setAttribute('aria-hidden', 'true');
  }

  dispose(): void {
    this.unmount();
  }
}
