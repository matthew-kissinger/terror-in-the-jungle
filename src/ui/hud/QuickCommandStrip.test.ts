/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickCommandStrip } from './QuickCommandStrip';
import { SquadCommand } from '../../systems/combat/types';

describe('QuickCommandStrip', () => {
  let strip: QuickCommandStrip;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    strip = new QuickCommandStrip();
    strip.mount(document.body);
  });

  it('starts disabled when the player has no squad', () => {
    const modeButton = document.querySelector<HTMLButtonElement>('[data-action="mode"]');
    const quickButtons = document.querySelectorAll<HTMLButtonElement>('.quick-command-strip__button');

    expect(modeButton?.disabled).toBe(true);
    expect(document.body.textContent).toContain('NO SQUAD');
    expect(Array.from(quickButtons).every((button) => button.disabled)).toBe(true);
  });

  it('renders active command state when squad state changes', () => {
    strip.setState({
      hasSquad: true,
      currentCommand: SquadCommand.HOLD_POSITION,
      isCommandModeOpen: false
    });

    const holdButton = document.querySelector<HTMLButtonElement>('[data-action="slot-2"]');
    expect(document.body.textContent).toContain('HOLD');
    expect(holdButton?.classList.contains('quick-command-strip__button--active')).toBe(true);
    expect(holdButton?.disabled).toBe(false);
  });

  it('updates hint text for gamepad and touch input modes', () => {
    const slotOneHint = document.querySelector<HTMLElement>('[data-action="slot-1"] .quick-command-strip__hint');
    expect(slotOneHint?.textContent).toBe('S+1');

    strip.setInputMode('gamepad');
    expect(slotOneHint?.textContent).toBe('D-UP');

    strip.setInputMode('touch');
    expect(slotOneHint?.textContent).toBe('TAP');
  });

  it('invokes command and quick-command callbacks from the buttons', () => {
    const onCommandModeRequested = vi.fn();
    const onQuickCommandSelected = vi.fn();
    strip.setCallbacks({
      onCommandModeRequested,
      onQuickCommandSelected
    });
    strip.setState({
      hasSquad: true,
      currentCommand: SquadCommand.NONE,
      isCommandModeOpen: false
    });

    document.querySelector<HTMLButtonElement>('[data-action="mode"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-action="slot-4"]')?.click();

    expect(onCommandModeRequested).toHaveBeenCalledTimes(1);
    expect(onQuickCommandSelected).toHaveBeenCalledWith(4);
  });
});
