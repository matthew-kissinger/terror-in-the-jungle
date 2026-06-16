/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchTimer } from './MatchTimer';

describe('MatchTimer', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders a safe initial time before the first tick arrives', () => {
    const timer = new MatchTimer();
    timer.mount(container);

    expect(timer.element.textContent).toContain('0:00');
    expect(timer.element.textContent).not.toContain('Infinity');
    expect(timer.element.textContent).not.toContain('NaN');
  });

  it('formats finite match time as mm:ss', () => {
    const timer = new MatchTimer();
    timer.mount(container);

    timer.setTime(65);

    expect(timer.element.textContent).toContain('1:05');
  });

  it('does not rewrite timer text or classes while the visible timer state is unchanged', () => {
    const timer = new MatchTimer();
    timer.mount(container);

    timer.setTime(65.9);
    const display = timer.element.querySelector<HTMLElement>('[data-ref="display"]')!;
    const textWrites = trackTextWrites(display);
    const classToggle = vi.spyOn(timer.element.classList, 'toggle');

    timer.setTime(65.2);

    expect(textWrites).toEqual([]);
    expect(classToggle).not.toHaveBeenCalled();

    timer.setTime(64.9);

    expect(textWrites).toEqual(['1:04']);
  });

  it('still updates warning state when the threshold changes within the same displayed second', () => {
    const timer = new MatchTimer();
    timer.mount(container);

    timer.setTime(60.5);
    const classToggle = vi.spyOn(timer.element.classList, 'toggle');

    timer.setTime(60);

    expect(classToggle).toHaveBeenCalled();
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
