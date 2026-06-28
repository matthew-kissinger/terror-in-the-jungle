// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import {
  AIR_SUPPORT_RADIO_ASSETS,
  AIR_SUPPORT_TARGET_MARKINGS,
  getCooldownRemaining,
  type AirSupportRadioAssetId,
  type AirSupportRadioCooldowns,
  type AirSupportTargetMarking
} from '../../systems/airsupport/AirSupportRadioCatalog';

interface FireSupportRowRefs {
  button: HTMLButtonElement;
  status: HTMLSpanElement;
}

/**
 * FIRE SUPPORT section of the unified radio menu: the smoke/WP/grid mark toggle
 * plus the seven call-in assets, each with a plain label and a live cooldown.
 * Pure presentation — selecting an asset fires `onAssetSelected`; the owner
 * (`CommandInputManager`) drives the real `AirSupportManager.requestSupport`
 * path. Extracted from `CommandModeOverlay` to keep that file within budget.
 */
export class CommandRadioFireSupportPanel {
  static readonly STYLE_ID = 'command-radio-fire-support-styles';

  private readonly element: HTMLDivElement;
  private readonly readyValue: HTMLSpanElement;
  private readonly markingButtons = new Map<AirSupportTargetMarking, HTMLButtonElement>();
  private readonly rows = new Map<AirSupportRadioAssetId, FireSupportRowRefs>();
  private cooldowns: AirSupportRadioCooldowns = {};
  private selectedMarking: AirSupportTargetMarking = 'smoke';
  private onAssetSelected?: (assetId: AirSupportRadioAssetId) => void;
  private onMarkingSelected?: (marking: AirSupportTargetMarking) => void;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'command-radio-fire';

    const head = document.createElement('div');
    head.className = 'command-radio-fire__head';

    const title = document.createElement('span');
    title.className = 'command-radio-fire__title';
    title.textContent = 'Fire Support';

    this.readyValue = document.createElement('span');
    this.readyValue.className = 'command-radio-fire__ready';

    head.appendChild(title);
    head.appendChild(this.readyValue);
    this.element.appendChild(head);

    const sub = document.createElement('span');
    sub.className = 'command-radio-fire__sub';
    sub.textContent = 'Radio (T) — pick a mark, then call a strike where you look.';
    this.element.appendChild(sub);

    const markingRow = document.createElement('div');
    markingRow.className = 'command-radio-fire__marks';
    for (const marking of AIR_SUPPORT_TARGET_MARKINGS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'command-radio-fire__mark';
      button.dataset.radioMarking = marking.id;
      button.textContent = marking.shortLabel;
      button.title = marking.label;
      button.addEventListener('click', () => this.onMarkingSelected?.(marking.id));
      this.markingButtons.set(marking.id, button);
      markingRow.appendChild(button);
    }
    this.element.appendChild(markingRow);

    const list = document.createElement('div');
    list.className = 'command-radio-fire__list';
    for (const asset of AIR_SUPPORT_RADIO_ASSETS) {
      const refs = this.createRow(asset.id, asset.label, `${asset.aircraft} / ${asset.payload}`);
      this.rows.set(asset.id, refs);
      list.appendChild(refs.button);
    }
    this.element.appendChild(list);

    this.injectStyles();
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setCallbacks(callbacks: {
    onAssetSelected?: (assetId: AirSupportRadioAssetId) => void;
    onMarkingSelected?: (marking: AirSupportTargetMarking) => void;
  }): void {
    this.onAssetSelected = callbacks.onAssetSelected;
    this.onMarkingSelected = callbacks.onMarkingSelected;
  }

  setCooldowns(cooldowns: AirSupportRadioCooldowns): void {
    this.cooldowns = cooldowns;
    this.render();
  }

  setSelectedMarking(marking: AirSupportTargetMarking): void {
    this.selectedMarking = marking;
    this.render();
  }

  dispose(): void {
    document.getElementById(CommandRadioFireSupportPanel.STYLE_ID)?.remove();
  }

  private createRow(
    assetId: AirSupportRadioAssetId,
    label: string,
    detail: string
  ): FireSupportRowRefs {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'command-radio-fire__row';
    button.dataset.radioAsset = assetId;
    button.title = `${label} — ${detail}`;
    button.addEventListener('click', () => this.onAssetSelected?.(assetId));

    const text = document.createElement('span');
    text.className = 'command-radio-fire__text';

    const name = document.createElement('span');
    name.className = 'command-radio-fire__name';
    name.textContent = label;

    const meta = document.createElement('span');
    meta.className = 'command-radio-fire__meta';
    meta.textContent = detail;

    text.appendChild(name);
    text.appendChild(meta);

    const status = document.createElement('span');
    status.className = 'command-radio-fire__status';

    button.appendChild(text);
    button.appendChild(status);
    return { button, status };
  }

  private render(): void {
    let ready = 0;
    for (const asset of AIR_SUPPORT_RADIO_ASSETS) {
      const refs = this.rows.get(asset.id);
      if (!refs) continue;
      const remaining = getCooldownRemaining(this.cooldowns, asset.id);
      const coolingDown = remaining > 0;
      if (!coolingDown) ready += 1;
      refs.button.disabled = coolingDown;
      refs.status.textContent = coolingDown ? formatCooldown(remaining) : 'READY';
      refs.button.classList.toggle('command-radio-fire__row--cooling', coolingDown);
    }
    this.readyValue.textContent = `${ready}/${AIR_SUPPORT_RADIO_ASSETS.length} ready`;

    for (const marking of AIR_SUPPORT_TARGET_MARKINGS) {
      this.markingButtons.get(marking.id)?.setAttribute(
        'aria-pressed',
        marking.id === this.selectedMarking ? 'true' : 'false'
      );
    }
  }

  private injectStyles(): void {
    if (document.getElementById(CommandRadioFireSupportPanel.STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = CommandRadioFireSupportPanel.STYLE_ID;
    style.textContent = `
      .command-radio-fire {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .command-radio-fire__head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
      }

      .command-radio-fire__title {
        font-family: var(--font-primary);
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: rgba(231, 217, 186, 0.95);
      }

      .command-radio-fire__ready {
        font-family: var(--font-primary);
        font-size: 11px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: rgba(125, 154, 90, 0.95);
      }

      .command-radio-fire__sub {
        font-family: var(--font-primary);
        font-size: 11px;
        line-height: 1.3;
        color: rgba(182, 164, 135, 0.78);
      }

      .command-radio-fire__marks {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      .command-radio-fire__mark {
        padding: 8px;
        border: 1px solid rgba(231, 217, 186, 0.2);
        border-radius: 10px;
        background: rgba(43, 38, 32, 0.76);
        color: rgba(231, 217, 186, 0.92);
        font-family: var(--font-primary);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: pointer;
      }

      .command-radio-fire__mark[aria-pressed="true"] {
        border-color: rgba(79, 107, 58, 0.5);
        background: rgba(58, 79, 42, 0.9);
      }

      .command-radio-fire__list {
        display: grid;
        grid-template-columns: 1fr;
        gap: 6px;
      }

      .command-radio-fire__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 12px;
        border: 1px solid rgba(231, 217, 186, 0.2);
        border-radius: 10px;
        background: rgba(43, 38, 32, 0.76);
        text-align: left;
        cursor: pointer;
        transition: border-color 120ms ease, background 120ms ease;
      }

      .command-radio-fire__row:hover:not(:disabled) {
        border-color: rgba(168, 116, 42, 0.38);
        background: rgba(43, 38, 32, 0.9);
      }

      .command-radio-fire__row:disabled {
        cursor: default;
        opacity: 0.6;
      }

      .command-radio-fire__text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .command-radio-fire__name {
        font-family: var(--font-primary);
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: rgba(231, 217, 186, 0.96);
      }

      .command-radio-fire__meta {
        font-family: var(--font-primary);
        font-size: 11px;
        color: rgba(182, 164, 135, 0.75);
      }

      .command-radio-fire__status {
        font-family: var(--font-primary);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        white-space: nowrap;
        color: rgba(125, 154, 90, 0.95);
      }

      .command-radio-fire__row--cooling .command-radio-fire__status {
        color: rgba(168, 116, 42, 0.95);
      }
    `;
    document.head.appendChild(style);
  }
}

function formatCooldown(seconds: number): string {
  const safeSeconds = Math.ceil(Math.max(0, seconds));
  return safeSeconds >= 60 ? `${Math.ceil(safeSeconds / 60)}M` : `${safeSeconds}S`;
}
