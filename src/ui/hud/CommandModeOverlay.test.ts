/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandModeOverlay } from './CommandModeOverlay';
import { SquadCommand } from '../../systems/combat/types';

describe('CommandModeOverlay', () => {
  let overlay: CommandModeOverlay;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => createCanvasContextStub() as never);
    overlay = new CommandModeOverlay();
    overlay.mount(document.body);
  });

  it('stays hidden until explicitly opened', () => {
    const root = document.querySelector<HTMLElement>('.command-mode-overlay');
    expect(root?.dataset.visible).toBe('false');
    expect(root?.textContent).toContain('NO SQUAD');
  });

  it('renders squad state and active command when visible', () => {
    overlay.setState({
      hasSquad: true,
      currentCommand: SquadCommand.PATROL_HERE,
      memberCount: 9,
      commandPosition: { x: 120, z: -80 },
      pendingCommand: SquadCommand.HOLD_POSITION
    });
    overlay.setVisible(true);

    const patrolButton = document.querySelector<HTMLButtonElement>('[data-action="slot-3"]');
    const holdButton = document.querySelector<HTMLButtonElement>('[data-action="slot-2"]');
    expect(document.body.textContent).toContain('PATROL HERE');
    expect(document.body.textContent).toContain('9 TROOPS');
    expect(document.body.textContent).toContain('120 / -80');
    expect(holdButton?.classList.contains('command-mode-overlay__button--active')).toBe(true);
    expect(patrolButton?.classList.contains('command-mode-overlay__button--active')).toBe(false);
  });

  it('shows direct orders as active when no placement order is armed', () => {
    overlay.setState({
      hasSquad: true,
      currentCommand: SquadCommand.FOLLOW_ME,
      memberCount: 6,
      commandPosition: null,
      pendingCommand: null
    });
    overlay.setVisible(true);

    const followButton = document.querySelector<HTMLButtonElement>('[data-action="slot-1"]');
    const holdButton = document.querySelector<HTMLButtonElement>('[data-action="slot-2"]');
    expect(followButton?.classList.contains('command-mode-overlay__button--active')).toBe(true);
    expect(holdButton?.classList.contains('command-mode-overlay__button--active')).toBe(false);
  });

  it('emits command, map selection, and close callbacks from the overlay controls', () => {
    const onQuickCommandSelected = vi.fn();
    const onCloseRequested = vi.fn();
    const onMapPointSelected = vi.fn();
    overlay.setCallbacks({ onQuickCommandSelected, onCloseRequested, onMapPointSelected });
    overlay.setState({
      hasSquad: true,
      currentCommand: SquadCommand.NONE,
      memberCount: 6,
      commandPosition: null,
      pendingCommand: SquadCommand.RETREAT
    });
    overlay.setVisible(true);

    document.querySelector<HTMLButtonElement>('[data-action="slot-4"]')?.click();
    const canvas = document.querySelector<HTMLCanvasElement>('.command-tactical-map__canvas');
    Object.defineProperty(canvas!, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 320,
        right: 320,
        bottom: 320,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }),
      configurable: true
    });
    canvas?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 160, clientY: 160, button: 0 }));
    document.querySelector<HTMLButtonElement>('.command-mode-overlay__close')?.click();

    expect(onQuickCommandSelected).toHaveBeenCalledWith(4);
    expect(onMapPointSelected).toHaveBeenCalledWith(expect.objectContaining({ x: 0, y: 0, z: 0 }));
    expect(onCloseRequested).toHaveBeenCalledTimes(1);
  });
});

function createCanvasContextStub() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    closePath: vi.fn()
  };
}
