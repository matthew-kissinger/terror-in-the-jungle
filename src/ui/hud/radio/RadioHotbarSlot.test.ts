/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behavior tests for the dedicated Radio HUD slot: clicking it opens the dial
 * (via its direct callback AND the broadcast DOM event the dial owner listens
 * for). Asserts the open affordance, not the icon markup.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RADIO_SLOT_OPEN_EVENT, RadioHotbarSlot } from './RadioHotbarSlot';

describe('RadioHotbarSlot', () => {
  let slot: RadioHotbarSlot;

  beforeEach(() => {
    document.body.innerHTML = '';
    slot = new RadioHotbarSlot();
    slot.mount(document.body);
  });

  it('fires the direct activate callback on click', () => {
    const onActivate = vi.fn();
    slot.setOnActivate(onActivate);
    slot.getElement().querySelector('button')?.click();
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('broadcasts the open event so the dial owner can react without glue', () => {
    const listener = vi.fn();
    document.addEventListener(RADIO_SLOT_OPEN_EVENT, listener);
    slot.getElement().querySelector('button')?.click();
    expect(listener).toHaveBeenCalledTimes(1);
    document.removeEventListener(RADIO_SLOT_OPEN_EVENT, listener);
  });

  it('ships a single inline icon representation (no external image)', () => {
    expect(slot.getElement().querySelector('svg')).toBeTruthy();
    expect(slot.getElement().querySelector('img')).toBeNull();
  });
});
