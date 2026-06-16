/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketDisplay } from './TicketDisplay';

vi.mock('./TicketDisplay.module.css', () => ({
  default: new Proxy({}, {
    get: (_target, prop) => String(prop),
  }),
}));

describe('TicketDisplay', () => {
  let container: HTMLDivElement;
  let display: TicketDisplay;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    display = new TicketDisplay();
    display.mount(container);
  });

  afterEach(() => {
    display.dispose();
    container.remove();
  });

  it('renders rounded ticket counts', () => {
    display.setTickets(299.6, 120.2);

    expect(display.element.textContent).toContain('300');
    expect(display.element.textContent).toContain('120');
  });

  it('does not rewrite counts or urgency classes while visible ticket state is unchanged', () => {
    display.setTickets(100.2, 88.2);
    const usCount = display.element.querySelector<HTMLElement>('[data-ref="us-count"]')!;
    const opforCount = display.element.querySelector<HTMLElement>('[data-ref="opfor-count"]')!;
    const usFaction = display.element.querySelector<HTMLElement>('[data-ref="us-faction"]')!;
    const opforFaction = display.element.querySelector<HTMLElement>('[data-ref="opfor-faction"]')!;
    const usWrites = trackTextWrites(usCount);
    const opforWrites = trackTextWrites(opforCount);
    const usToggle = vi.spyOn(usFaction.classList, 'toggle');
    const opforToggle = vi.spyOn(opforFaction.classList, 'toggle');

    display.setTickets(100.4, 88.4);

    expect(usWrites).toEqual([]);
    expect(opforWrites).toEqual([]);
    expect(usToggle).not.toHaveBeenCalled();
    expect(opforToggle).not.toHaveBeenCalled();

    display.setTickets(100.5, 88.4);

    expect(usWrites).toEqual(['101']);
    expect(opforWrites).toEqual([]);
  });

  it('still updates conquest urgency when a threshold changes within the same rounded count', () => {
    display.setTickets(50.4, 100);
    const usFaction = display.element.querySelector<HTMLElement>('[data-ref="us-faction"]')!;
    const usToggle = vi.spyOn(usFaction.classList, 'toggle');

    display.setTickets(50, 100);

    expect(usToggle).toHaveBeenCalled();
  });

  it('still updates TDM urgency when a threshold changes within the same rounded count', () => {
    display.setMode(true, 100);
    display.setTickets(74.9, 50);
    const usFaction = display.element.querySelector<HTMLElement>('[data-ref="us-faction"]')!;
    const usToggle = vi.spyOn(usFaction.classList, 'toggle');

    display.setTickets(75, 50);

    expect(usToggle).toHaveBeenCalled();
  });

  it('does not rewrite bleed arrows while the visible bleed bucket is unchanged', () => {
    display.setBleedIndicator('us', 1.1);
    const usBleed = display.element.querySelector<HTMLElement>('[data-ref="us-bleed"]')!;
    const opforBleed = display.element.querySelector<HTMLElement>('[data-ref="opfor-bleed"]')!;
    const usWrites = trackTextWrites(usBleed);
    const opforWrites = trackTextWrites(opforBleed);

    display.setBleedIndicator('us', 1.9);

    expect(usWrites).toEqual([]);
    expect(opforWrites).toEqual([]);
  });

  it('still updates bleed arrows when the strength bucket or side changes', () => {
    display.setBleedIndicator('us', 1.1);
    const usBleed = display.element.querySelector<HTMLElement>('[data-ref="us-bleed"]')!;
    const opforBleed = display.element.querySelector<HTMLElement>('[data-ref="opfor-bleed"]')!;
    const usWrites = trackTextWrites(usBleed);
    const opforWrites = trackTextWrites(opforBleed);

    display.setBleedIndicator('us', 2);
    display.setBleedIndicator('opfor', 2);

    expect(usWrites).toEqual(['\u25bc\u25bc', '']);
    expect(opforWrites).toEqual(['\u25bc\u25bc']);
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
