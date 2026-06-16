/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerStatsTracker } from '../../systems/player/PlayerStatsTracker';
import { StatsPanel } from './StatsPanel';

describe('StatsPanel', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('updates K/D text from scalar stat reads without cloning full stats', () => {
    let kills = 0;
    let deaths = 0;
    const tracker = {
      getKills: () => kills,
      getDeaths: () => deaths,
      getStats: () => {
        throw new Error('StatsPanel.update should not clone full stats');
      },
    } as unknown as PlayerStatsTracker;

    const panel = new StatsPanel(tracker);
    panel.mount(container);

    kills = 3;
    deaths = 2;
    panel.update();

    expect(text('[data-ref="dk"]')).toBe('3');
    expect(text('[data-ref="dd"]')).toBe('2');
    expect(text('[data-ref="dkd"]')).toBe('1.50');

    panel.dispose();
  });

  it('uses cached stat refs when syncing changed stats after mount', () => {
    let kills = 0;
    let deaths = 0;
    const tracker = {
      getKills: () => kills,
      getDeaths: () => deaths,
      getStats: () => {
        throw new Error('StatsPanel.update should not clone full stats');
      },
    } as unknown as PlayerStatsTracker;

    const panel = new StatsPanel(tracker);
    panel.mount(container);
    const querySelector = vi.spyOn(panel.element, 'querySelector');
    querySelector.mockImplementation(() => {
      throw new Error('StatsPanel.update should use cached stat refs');
    });

    kills = 4;
    deaths = 1;

    expect(() => panel.update()).not.toThrow();
    expect(text('[data-ref="dk"]')).toBe('4');
    expect(text('[data-ref="dd"]')).toBe('1');
    expect(text('[data-ref="dkd"]')).toBe('4.00');

    panel.dispose();
  });

  function text(selector: string): string {
    const element = container.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Expected ${selector} to exist`);
    return element.textContent ?? '';
  }
});
