/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileStatusBar } from './MobileStatusBar';

describe('MobileStatusBar', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders a safe initial timer before HUD updates begin', () => {
    const bar = new MobileStatusBar();
    bar.mount(container);

    expect(bar.element.textContent).toContain('0:00');
    expect(bar.element.textContent).not.toContain('Infinity');
    expect(bar.element.textContent).not.toContain('NaN');
  });

  it('formats countdown text when time is set', () => {
    const bar = new MobileStatusBar();
    bar.mount(container);

    bar.setTime(125);

    expect(bar.element.textContent).toContain('2:05');
  });

  it('does not rewrite timer text or classes while the visible timer state is unchanged', () => {
    const bar = new MobileStatusBar();
    bar.mount(container);

    bar.setTime(125.9);
    const timer = bar.element.querySelector<HTMLElement>('[data-ref="timer"]')!;
    const textWrites = trackTextWrites(timer);
    const classToggle = vi.spyOn(timer.classList, 'toggle');

    bar.setTime(125.1);

    expect(textWrites).toEqual([]);
    expect(classToggle).not.toHaveBeenCalled();

    bar.setTime(124.9);

    expect(textWrites).toEqual(['2:04']);
  });

  it('still updates mobile warning state when the threshold changes within the same displayed second', () => {
    const bar = new MobileStatusBar();
    bar.mount(container);

    bar.setTime(60.5);
    const timer = bar.element.querySelector<HTMLElement>('[data-ref="timer"]')!;
    const classToggle = vi.spyOn(timer.classList, 'toggle');

    bar.setTime(60);

    expect(classToggle).toHaveBeenCalled();
  });

  it('does not rewrite ticket text while rounded ticket counts are unchanged', () => {
    const bar = new MobileStatusBar();
    bar.mount(container);

    bar.setTickets(100.2, 88.2);
    const us = bar.element.querySelector<HTMLElement>('[data-ref="us"]')!;
    const opfor = bar.element.querySelector<HTMLElement>('[data-ref="opfor"]')!;
    const usWrites = trackTextWrites(us);
    const opforWrites = trackTextWrites(opfor);

    bar.setTickets(100.4, 88.4);

    expect(usWrites).toEqual([]);
    expect(opforWrites).toEqual([]);

    bar.setTickets(100.5, 88.4);

    expect(usWrites).toEqual(['101']);
    expect(opforWrites).toEqual([]);
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
