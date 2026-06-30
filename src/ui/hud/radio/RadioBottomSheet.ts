// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * RadioBottomSheet — the TOUCH presentation of the radio dial. A drill list
 * bottom-sheet: category chips at the top, the focused category's options as a
 * scrollable list of ≥44px rows, plus a segmented marking control. It is driven
 * entirely by a shared `RadioDialController`; it issues NOTHING itself.
 *
 * Mobile-first: large tap targets, safe-area insets, and a drill-back affordance
 * so the whole tree is reachable one-handed.
 */

import {
  formatRadioCooldown,
  radioOptionCooldown,
  type RadioCategory,
  type RadioOption,
} from './RadioDialModel';
import type { RadioDialController } from './RadioDialController';
import styles from './RadioBottomSheet.module.css';

export class RadioBottomSheet {
  private readonly root: HTMLDivElement;
  private readonly chipRow: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private readonly titleEl: HTMLSpanElement;
  private readonly backButton: HTMLButtonElement;
  private controller?: RadioDialController;
  private unsubscribe?: () => void;
  private onCloseRequested?: () => void;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = styles.sheet;
    this.root.dataset.visible = 'false';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Field radio');

    const panel = document.createElement('div');
    panel.className = styles.panel;
    this.root.appendChild(panel);

    const header = document.createElement('div');
    header.className = styles.header;

    this.backButton = document.createElement('button');
    this.backButton.type = 'button';
    this.backButton.className = styles.back;
    this.backButton.textContent = '‹';
    this.backButton.setAttribute('aria-label', 'Back to categories');
    this.backButton.addEventListener('click', () => this.controller?.clearFocus());

    this.titleEl = document.createElement('span');
    this.titleEl.className = styles.title;
    this.titleEl.textContent = 'Radio';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = styles.close;
    close.textContent = 'CLOSE';
    close.addEventListener('click', () => this.onCloseRequested?.());

    header.appendChild(this.backButton);
    header.appendChild(this.titleEl);
    header.appendChild(close);
    panel.appendChild(header);

    this.chipRow = document.createElement('div');
    this.chipRow.className = styles.chips;
    panel.appendChild(this.chipRow);

    this.listEl = document.createElement('div');
    this.listEl.className = styles.list;
    panel.appendChild(this.listEl);

    // Tap the dimmed backdrop to dismiss.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.onCloseRequested?.();
    });
  }

  getElement(): HTMLElement {
    return this.root;
  }

  setCallbacks(callbacks: { onCloseRequested?: () => void }): void {
    this.onCloseRequested = callbacks.onCloseRequested;
  }

  bindController(controller: RadioDialController): void {
    this.unsubscribe?.();
    this.controller = controller;
    this.unsubscribe = controller.onChange(() => this.render());
    this.render();
  }

  setVisible(visible: boolean): void {
    this.root.dataset.visible = visible ? 'true' : 'false';
  }

  isVisible(): boolean {
    return this.root.dataset.visible === 'true';
  }

  dispose(): void {
    this.unsubscribe?.();
    this.root.remove();
  }

  private render(): void {
    if (!this.controller) return;
    const focused = this.controller.getFocusedCategory();
    this.backButton.dataset.show = focused ? 'true' : 'false';
    this.titleEl.textContent = focused ? focused.label : 'Field Radio';

    this.renderChips(this.controller.getCategories(), focused?.id ?? null);
    if (focused) {
      this.renderOptions(focused);
    } else {
      this.renderCategoryHint();
    }
  }

  private renderChips(categories: ReadonlyArray<RadioCategory>, focusedId: string | null): void {
    this.chipRow.replaceChildren();
    for (const category of categories) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = styles.chip;
      chip.textContent = category.label;
      chip.dataset.radioCategory = category.id;
      chip.setAttribute('aria-pressed', category.id === focusedId ? 'true' : 'false');
      chip.addEventListener('click', () => this.controller?.focusCategory(category.id));
      this.chipRow.appendChild(chip);
    }
  }

  private renderCategoryHint(): void {
    this.listEl.replaceChildren();
    const hint = document.createElement('p');
    hint.className = styles.hint;
    hint.textContent = 'Pick a channel above: fire support, squad orders, target mark, or radio stations.';
    this.listEl.appendChild(hint);
  }

  private renderOptions(category: RadioCategory): void {
    if (!this.controller) return;
    this.listEl.replaceChildren();

    if (category.id === 'markings') {
      this.listEl.appendChild(this.buildSegmentedMarking(category));
      return;
    }

    for (const option of category.options) {
      this.listEl.appendChild(this.buildOptionRow(option));
    }
  }

  private buildSegmentedMarking(category: RadioCategory): HTMLElement {
    const group = document.createElement('div');
    group.className = styles.segmented;
    group.setAttribute('role', 'group');
    const active = this.controller?.getSelectedMarking();
    for (const option of category.options) {
      if (option.kind !== 'marking') continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = styles.segment;
      button.textContent = option.label;
      button.title = option.detail;
      button.dataset.radioMarking = option.marking;
      button.setAttribute('aria-pressed', option.marking === active ? 'true' : 'false');
      button.addEventListener('click', () => this.controller?.selectOption(option));
      group.appendChild(button);
    }
    return group;
  }

  private buildOptionRow(option: RadioOption): HTMLElement {
    const enabled = this.controller?.isOptionEnabled(option) ?? true;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = styles.row;
    button.disabled = !enabled;
    button.dataset.radioOption = option.id;

    const text = document.createElement('span');
    text.className = styles.rowText;

    const name = document.createElement('span');
    name.className = styles.rowName;
    name.textContent = option.label;

    const detail = document.createElement('span');
    detail.className = styles.rowDetail;
    detail.textContent = option.detail;

    text.appendChild(name);
    text.appendChild(detail);

    const status = document.createElement('span');
    status.className = styles.rowStatus;
    status.textContent = this.statusFor(option);

    button.appendChild(text);
    button.appendChild(status);
    button.addEventListener('click', () => this.controller?.selectOption(option));
    return button;
  }

  private statusFor(option: RadioOption): string {
    if (option.kind === 'fire-support') {
      const remaining = radioOptionCooldown(option, this.controller?.getCooldowns() ?? {});
      return remaining > 0 ? formatRadioCooldown(remaining) : 'READY';
    }
    if (option.kind === 'station') {
      return option.stationId === this.controller?.getSelectedStationId() ? 'TUNED' : 'TUNE';
    }
    if (option.kind === 'squad') {
      return this.controller?.isOptionEnabled(option) ? 'ORDER' : 'NO SQUAD';
    }
    return '';
  }
}
