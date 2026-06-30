/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameMode } from '../../config/gameModeTypes';
import { Alliance } from '../../systems/combat/types';
import { ModeSelectScreen } from './ModeSelectScreen';

describe('ModeSelectScreen', () => {
  let screen: ModeSelectScreen;

  beforeEach(() => {
    document.body.innerHTML = '';
    screen = new ModeSelectScreen();
    screen.mount(document.body);
  });

  afterEach(() => {
    screen.dispose();
  });

  function clickMode(mode: GameMode): void {
    (document.querySelector(`[data-mode="${mode}"]`) as HTMLElement).click();
  }

  it('renders all mode cards with key metadata', () => {
    expect(document.querySelectorAll('[data-mode]')).toHaveLength(4);

    const text = document.body.textContent ?? '';
    expect(text).toContain('SELECT MODE');
    expect(text).toContain('Platoon / 60 AI');
    expect(text).toContain('Battalion / 3000 AI');
  });

  it('launches a standard mode straight from the card with no side picker', () => {
    const callback = vi.fn();
    screen.setOnModeSelect(callback);

    clickMode(GameMode.OPEN_FRONTIER);

    // Standard mode: emits immediately, no alliance choice (default side kept).
    expect(callback).toHaveBeenCalledWith({ mode: GameMode.OPEN_FRONTIER });
  });

  it('shows the side picker for A Shau instead of launching immediately', () => {
    const callback = vi.fn();
    screen.setOnModeSelect(callback);

    clickMode(GameMode.A_SHAU_VALLEY);

    // Premiere mode: defers launch and offers a side choice.
    expect(callback).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-alliance]').length).toBeGreaterThan(1);
  });

  it('feeds the chosen side through to the launch selection for A Shau', () => {
    const callback = vi.fn();
    screen.setOnModeSelect(callback);

    clickMode(GameMode.A_SHAU_VALLEY);
    (document.querySelector(`[data-alliance="${Alliance.OPFOR}"]`) as HTMLElement).click();

    expect(callback).toHaveBeenCalledWith({
      mode: GameMode.A_SHAU_VALLEY,
      alliance: Alliance.OPFOR,
    });
  });

  it('lets BACK step out of the side picker before leaving the screen', () => {
    const onBack = vi.fn();
    screen.setOnBack(onBack);

    clickMode(GameMode.A_SHAU_VALLEY);
    const backButton = document.querySelector('[data-ref="back"]') as HTMLButtonElement;

    // First BACK closes the picker, not the screen.
    backButton.click();
    expect(onBack).not.toHaveBeenCalled();
    expect(document.querySelector(`[data-mode="${GameMode.A_SHAU_VALLEY}"]`)).not.toBeNull();

    // Second BACK leaves the screen.
    backButton.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('fires the back callback from the mode grid', () => {
    const callback = vi.fn();
    screen.setOnBack(callback);

    const backButton = document.querySelector('[data-ref="back"]') as HTMLButtonElement;
    backButton.click();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
