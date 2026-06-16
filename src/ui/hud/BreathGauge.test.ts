/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BreathGauge } from './BreathGauge';

vi.mock('./BreathGauge.module.css', () => ({
  default: new Proxy({}, {
    get: (_target, prop) => String(prop),
  }),
}));

describe('BreathGauge', () => {
  let gauge: BreathGauge;
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    gauge = new BreathGauge();
    gauge.mount(parent);
  });

  afterEach(() => {
    gauge.dispose();
    document.body.removeChild(parent);
  });

  it('starts hidden so dry play does not show the gauge', () => {
    expect(gauge.isVisible()).toBe(false);
  });

  it('becomes visible when submerged (show called by HUDSystem)', () => {
    gauge.show();
    expect(gauge.isVisible()).toBe(true);
    // Visible class toggles on the root element so the CSS .visible rule applies.
    expect(gauge.element.classList.contains('visible')).toBe(true);
  });

  it('hides again on surface', () => {
    gauge.show();
    gauge.hide();
    expect(gauge.isVisible()).toBe(false);
    expect(gauge.element.classList.contains('visible')).toBe(false);
  });

  it('renders remaining seconds in the readout text', () => {
    gauge.show();
    gauge.setBreath(30, 45);
    const text = gauge.element.querySelector('[data-ref="text"]') as HTMLElement;
    expect(text.textContent).toBe('30s');

    gauge.setBreath(5, 45);
    expect(text.textContent).toBe('5s');

    gauge.setBreath(0, 45);
    expect(text.textContent).toBe('0s');
  });

  it('does not rewrite while the rendered breath state is unchanged', () => {
    gauge.show();
    gauge.setBreath(29.01, 45);
    const fill = gauge.element.querySelector('[data-ref="fill"]') as HTMLElement;
    const text = gauge.element.querySelector('[data-ref="text"]') as HTMLElement;
    const label = gauge.element.querySelector('[data-ref="label"]') as HTMLElement;
    const widthBefore = fill.style.width;
    const textWrites = trackTextWrites(text);
    const fillToggle = vi.spyOn(fill.classList, 'toggle');
    const labelToggle = vi.spyOn(label.classList, 'toggle');

    gauge.setBreath(29.02, 45);

    expect(textWrites).toEqual([]);
    expect(fill.style.width).toBe(widthBefore);
    expect(fillToggle).not.toHaveBeenCalled();
    expect(labelToggle).not.toHaveBeenCalled();

    gauge.setBreath(29.08, 45);

    expect(fill.style.width).not.toBe(widthBefore);
    expect(fillToggle).toHaveBeenCalled();
    expect(labelToggle).toHaveBeenCalled();
  });
});

function trackTextWrites(element: HTMLElement): string[] {
  let current = element.textContent ?? '';
  const writes: string[] = [];
  Object.defineProperty(element, 'textContent', {
    configurable: true,
    get: () => current,
    set: (value: string | null) => {
      current = value ?? '';
      writes.push(current);
    },
  });
  return writes;
}
