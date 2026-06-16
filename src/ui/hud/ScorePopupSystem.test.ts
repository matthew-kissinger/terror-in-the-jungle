/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../../utils/Logger';
import { playElementAnimation } from '../engine/playElementAnimation';
import { ScorePopupSystem } from './ScorePopupSystem';

vi.mock('../../utils/Logger', () => ({
  Logger: {
    warn: vi.fn(),
  },
}));

vi.mock('../engine/playElementAnimation', () => ({
  playElementAnimation: vi.fn(),
}));

describe('ScorePopupSystem', () => {
  let system: ScorePopupSystem;
  let parent: HTMLElement;
  let now = 1000;

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    system = new ScorePopupSystem();
    parent = document.createElement('div');
    document.body.appendChild(parent);
    system.attachToDOM(parent);
  });

  afterEach(() => {
    system.dispose();
    vi.restoreAllMocks();
  });

  function visiblePopups(): HTMLElement[] {
    return Array.from(parent.querySelectorAll<HTMLElement>('.score-popup'))
      .filter((element) => element.style.display === 'block');
  }

  it('renders a kill popup from the reusable pool', () => {
    system.spawn('kill', 100);

    const visible = visiblePopups();
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toBe('+100 KILL');
    expect(visible[0].classList.contains('kill')).toBe(true);
    expect(playElementAnimation).toHaveBeenCalledTimes(1);
  });

  it('compacts expired popups so the next popup starts at the base stack position', () => {
    system.spawn('kill', 100);
    now += 100;
    system.spawn('assist', 25);

    let visible = visiblePopups();
    expect(visible).toHaveLength(2);
    expect(visible[0].style.bottom).toBe('calc(50% + 0px)');
    expect(visible[1].style.bottom).toBe('calc(50% + 45px)');

    now += 2000;
    system.update();
    expect(visiblePopups()).toHaveLength(0);

    system.spawn('headshot', 50);

    visible = visiblePopups();
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toBe('+50 HEADSHOT BONUS');
    expect(visible[0].style.bottom).toBe('calc(50% + 0px)');
  });

  it('returns expired popups to the pool without exhausting later bursts', () => {
    for (let i = 0; i < 20; i++) {
      system.spawn('kill', 10 + i);
    }

    expect(visiblePopups()).toHaveLength(20);

    now += 2000;
    system.update();

    for (let i = 0; i < 20; i++) {
      system.spawn('defend', 5 + i);
    }

    expect(visiblePopups()).toHaveLength(20);
    expect(Logger.warn).not.toHaveBeenCalled();
  });

  it('warns and preserves active popups when the pool is exhausted', () => {
    for (let i = 0; i < 20; i++) {
      system.spawn('kill', 10 + i);
    }

    system.spawn('assist', 5);

    expect(visiblePopups()).toHaveLength(20);
    expect(Logger.warn).toHaveBeenCalledTimes(1);
  });

  it('attaches and disposes its container and injected style', () => {
    expect(parent.querySelector('.score-popups-container')).not.toBeNull();
    expect(document.getElementById('score-popup-styles')).not.toBeNull();

    system.dispose();

    expect(parent.querySelector('.score-popups-container')).toBeNull();
    expect(document.getElementById('score-popup-styles')).toBeNull();
  });
});
