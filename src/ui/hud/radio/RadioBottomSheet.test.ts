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

  it('shows the three inner channels as chips when opened', () => {
    for (const id of ['fire-support', 'squad', 'signals']) {
      expect(chip(id), `missing chip ${id}`).toBeTruthy();
    }
  });

  it('drills into a category and lists its options as rows', () => {
    chip('fire-support')?.click();
    const rows = sheet.getElement().querySelectorAll('[data-radio-option]');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('issues an intent after tapping a fire-support asset and target row', () => {
    chip('fire-support')?.click();
    sheet.getElement().querySelector<HTMLButtonElement>('[data-radio-option]')?.click();
    const targetRows = Array.from(sheet.getElement().querySelectorAll<HTMLButtonElement>('[data-radio-option]'));
    expect(targetRows.some((row) => row.textContent?.includes('Aim Mark'))).toBe(true);
    expect(targetRows.some((row) => row.textContent?.includes('Reticle/Grid'))).toBe(false);
    targetRows.find((row) => row.textContent?.includes('Aim Mark'))?.click();
    expect(intents).toHaveLength(1);
    expect(intents[0].kind).toBe('fire-support');
  });

  it('keeps active-smoke disabled until a smoke mark exists on touch', () => {
    chip('fire-support')?.click();
    sheet.getElement().querySelector<HTMLButtonElement>('[data-radio-option]')?.click();
    const disabledSmoke = Array.from(sheet.getElement().querySelectorAll<HTMLButtonElement>('[data-radio-option]'))
      .find((row) => row.textContent?.includes('Use Active Smoke'));
    expect(disabledSmoke?.disabled).toBe(true);

    controller.setHasSmokeMark(true);
    const enabledSmoke = Array.from(sheet.getElement().querySelectorAll<HTMLButtonElement>('[data-radio-option]'))
      .find((row) => row.textContent?.includes('Use Active Smoke'));
    expect(enabledSmoke?.disabled).toBe(false);
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
