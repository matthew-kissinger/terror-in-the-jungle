/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameMode } from '../../config/gameModeTypes';
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

  it('renders all mode cards with key metadata', () => {
    expect(document.querySelectorAll('[data-mode]')).toHaveLength(4);

    const text = document.body.textContent ?? '';
    expect(text).toContain('SELECT MODE');
    expect(text).toContain('Platoon / 60 AI');
    expect(text).toContain('Battalion / 3000 AI');
  });

  it('emits the selected mode on click', () => {
    const callback = vi.fn();
    screen.setOnModeSelect(callback);

    const card = document.querySelector(`[data-mode="${GameMode.OPEN_FRONTIER}"]`) as HTMLElement;
    card.click();

    expect(callback).toHaveBeenCalledWith(GameMode.OPEN_FRONTIER);
  });

  it('fires the back callback', () => {
    const callback = vi.fn();
    screen.setOnBack(callback);

    const backButton = document.querySelector('[data-ref="back"]') as HTMLButtonElement;
    backButton.click();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
