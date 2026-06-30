/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behavior tests for the touch radio bottom-sheet: the drill list reaches every
 * channel and selecting a row funnels through the shared controller (which is
 * the single intent sink). Asserts player-reachable behavior, not DOM shape.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RadioBottomSheet } from './RadioBottomSheet';
import { RadioDialController } from './RadioDialController';
import type { RadioIntent } from './RadioDialModel';

describe('RadioBottomSheet', () => {
  let controller: RadioDialController;
  let sheet: RadioBottomSheet;
  let intents: RadioIntent[];

  beforeEach(() => {
    document.body.innerHTML = '';
    controller = new RadioDialController();
    intents = [];
    controller.setIntentSink((intent) => intents.push(intent));
    sheet = new RadioBottomSheet();
    sheet.bindController(controller);
    document.body.appendChild(sheet.getElement());
    sheet.setVisible(true);
  });

  function chip(categoryId: string): HTMLButtonElement | null {
    return sheet.getElement().querySelector<HTMLButtonElement>(`[data-radio-category="${categoryId}"]`);
  }

  it('shows the four channels as chips when opened', () => {
    for (const id of ['fire-support', 'squad', 'markings', 'stations']) {
      expect(chip(id), `missing chip ${id}`).toBeTruthy();
    }
  });

  it('drills into a category and lists its options as rows', () => {
    chip('fire-support')?.click();
    const rows = sheet.getElement().querySelectorAll('[data-radio-option]');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('issues an intent when a fire-support row is tapped', () => {
    chip('fire-support')?.click();
    sheet.getElement().querySelector<HTMLButtonElement>('[data-radio-option]')?.click();
    expect(intents).toHaveLength(1);
    expect(intents[0].kind).toBe('fire-support');
  });

  it('requests close when the close button is tapped', () => {
    const onClose = vi.fn();
    sheet.setCallbacks({ onCloseRequested: onClose });
    sheet.getElement().querySelector<HTMLButtonElement>('button')?.click();
    // The first button is the back affordance (hidden at the top level); find close.
    const closeBtn = Array.from(sheet.getElement().querySelectorAll('button')).find(
      (b) => b.textContent === 'CLOSE',
    );
    closeBtn?.click();
    expect(onClose).toHaveBeenCalled();
  });
});
