/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behavior tests for the desktop radio wheel: outer-ring options remain
 * confirmable through redraws, and secondary click uses the same controller
 * selection path as left click.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { RadioDialController } from './RadioDialController';
import type { RadioIntent } from './RadioDialModel';
import { RadialDialView } from './RadialDialView';

describe('RadialDialView', () => {
  let controller: RadioDialController;
  let view: RadialDialView;
  let intents: RadioIntent[];

  beforeEach(() => {
    document.body.innerHTML = '';
    controller = new RadioDialController();
    intents = [];
    controller.setIntentSink((intent) => intents.push(intent));
    view = new RadialDialView();
    view.bindController(controller);
    view.setVisible(true);
    document.body.appendChild(view.getElement());
  });

  it('confirms an outer-ring option on right click and suppresses the browser menu', () => {
    drillCategory('squad');
    const option = firstOption();

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    const dispatched = option.dispatchEvent(event);

    expect(dispatched).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(intents).toHaveLength(1);
    expect(intents[0].kind).toBe('squad');
    expect(controller.getFocusedCategory()?.id).toBe('squad');
  });

  it('keeps the focused outer option confirmable after a controller redraw', () => {
    drillCategory('squad');
    firstOption().dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));

    controller.setCooldowns({ ac47_orbit: 20 });

    const wheel = view.getElement().querySelector<SVGSVGElement>('svg');
    expect(wheel).toBeTruthy();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    const dispatched = wheel!.dispatchEvent(event);

    expect(dispatched).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(intents).toHaveLength(1);
    expect(intents[0].kind).toBe('squad');
  });

  function drillCategory(categoryId: string): void {
    const category = view.getElement().querySelector<SVGElement>(`[data-radio-category="${categoryId}"]`);
    expect(category).toBeTruthy();
    category!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function firstOption(): SVGElement {
    const option = view.getElement().querySelector<SVGElement>('[data-radio-option]');
    expect(option).toBeTruthy();
    return option!;
  }
});
