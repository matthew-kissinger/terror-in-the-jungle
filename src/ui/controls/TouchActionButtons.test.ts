/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchActionButtons } from './TouchActionButtons';

function touchEvent(type: string): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'changedTouches', { value: [] });
  Object.defineProperty(event, 'touches', { value: [] });
  return event;
}

describe('TouchActionButtons', () => {
  let actions: TouchActionButtons;
  let container: HTMLDivElement;
  let buttons: HTMLDivElement[];

  beforeEach(() => {
    document.body.innerHTML = '';
    actions = new TouchActionButtons();
    container = document.getElementById('touch-action-buttons') as HTMLDivElement;
    buttons = Array.from(container.children) as HTMLDivElement[];
  });

  it('creates Squad, Scoreboard, Jump, Reload, and Grenade buttons', () => {
    expect(container).toBeTruthy();
    expect(buttons).toHaveLength(5);
    expect(buttons.map((b) => b.textContent)).toEqual(['SQUAD', 'SCORE', 'JUMP', 'R', 'G']);
  });

  it('arranges buttons in a column layout', () => {
    expect(container.style.display).toBe('flex');
    expect(container.style.flexDirection).toBe('column');
    expect(container.style.gap).toBe('12px');
  });

  it('triggers callbacks for squad, scoreboard, jump, reload, and grenade actions', () => {
    const onAction = vi.fn();
    actions.setOnAction(onAction);

    buttons[0].dispatchEvent(touchEvent('touchstart'));
    buttons[1].dispatchEvent(touchEvent('touchstart'));
    buttons[2].dispatchEvent(touchEvent('touchstart'));
    buttons[3].dispatchEvent(touchEvent('touchstart'));
    buttons[4].dispatchEvent(touchEvent('touchstart'));

    expect(onAction).toHaveBeenNthCalledWith(1, 'squad');
    expect(onAction).toHaveBeenNthCalledWith(2, 'scoreboard');
    expect(onAction).toHaveBeenNthCalledWith(3, 'jump');
    expect(onAction).toHaveBeenNthCalledWith(4, 'reload');
    expect(onAction).toHaveBeenNthCalledWith(5, 'grenade');
  });

  it('show and hide toggle visibility', () => {
    actions.hide();
    expect(container.style.display).toBe('none');

    actions.show();
    expect(container.style.display).toBe('flex');
  });

  it('dispose removes the container and all buttons', () => {
    actions.dispose();
    expect(document.getElementById('touch-action-buttons')).toBeNull();
  });
});
