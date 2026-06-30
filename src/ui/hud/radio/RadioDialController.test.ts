// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behavior tests for the radio dial controller: drill navigation, intent
 * emission for every channel, and the gating rules (squad availability,
 * cooldown). These assert observable outcomes — what intent fires, whether the
 * dial dismisses — not internal state names.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RadioDialController } from './RadioDialController';
import type { RadioIntent, RadioOption } from './RadioDialModel';

function optionIn(controller: RadioDialController, categoryId: string, predicate: (o: RadioOption) => boolean): RadioOption {
  const category = controller.getCategories().find((c) => c.id === categoryId)!;
  const option = category.options.find(predicate)!;
  expect(option, `option not found in ${categoryId}`).toBeTruthy();
  return option;
}

describe('RadioDialController', () => {
  let controller: RadioDialController;
  let intents: Array<{ intent: RadioIntent; closesDial: boolean }>;

  beforeEach(() => {
    controller = new RadioDialController();
    intents = [];
    controller.setIntentSink((intent, closesDial) => intents.push({ intent, closesDial }));
  });

  it('starts at the category level and drills into a focused category', () => {
    expect(controller.getFocusedCategory()).toBeNull();
    controller.focusCategory('fire-support');
    expect(controller.getFocusedCategory()?.id).toBe('fire-support');
    controller.clearFocus();
    expect(controller.getFocusedCategory()).toBeNull();
  });

  it('issues a fire-support intent that dismisses the dial, carrying the active mark', () => {
    controller.setSelectedMarking('willie_pete');
    const asset = optionIn(controller, 'fire-support', (o) => o.kind === 'fire-support');
    controller.selectOption(asset);

    expect(intents).toHaveLength(1);
    expect(intents[0].closesDial).toBe(true);
    expect(intents[0].intent).toMatchObject({ kind: 'fire-support', marking: 'willie_pete' });
  });

  it('issues a squad intent that dismisses the dial', () => {
    const order = optionIn(controller, 'squad', (o) => o.kind === 'squad');
    controller.selectOption(order);
    expect(intents).toHaveLength(1);
    expect(intents[0].intent.kind).toBe('squad');
    expect(intents[0].closesDial).toBe(true);
  });

  it('keeps the dial open for sticky marking and station toggles', () => {
    const mark = optionIn(controller, 'markings', (o) => o.kind === 'marking');
    controller.selectOption(mark);
    const station = optionIn(controller, 'stations', (o) => o.kind === 'station');
    controller.selectOption(station);

    expect(intents).toHaveLength(2);
    expect(intents.every((i) => i.closesDial === false)).toBe(true);
    expect(intents[0].intent.kind).toBe('marking');
    expect(intents[1].intent.kind).toBe('station');
  });

  it('does not issue squad orders when the player has no squad', () => {
    controller.setSquadAvailable(false);
    const order = optionIn(controller, 'squad', (o) => o.kind === 'squad');
    controller.selectOption(order);
    expect(intents).toHaveLength(0);
  });

  it('does not issue a cooling-down fire-support call', () => {
    const asset = optionIn(controller, 'fire-support', (o) => o.kind === 'fire-support') as Extract<RadioOption, { kind: 'fire-support' }>;
    controller.setCooldowns({ [asset.assetId]: 30 });
    controller.selectOption(asset);
    expect(intents).toHaveLength(0);
  });

  it('notifies change subscribers when drill or selection state moves', () => {
    const listener = vi.fn();
    const dispose = controller.onChange(listener);
    controller.focusCategory('squad');
    controller.setSelectedMarking('smoke');
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
    dispose();
    listener.mockClear();
    controller.clearFocus();
    expect(listener).not.toHaveBeenCalled();
  });
});
