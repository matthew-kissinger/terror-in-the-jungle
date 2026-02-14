/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchFireButton } from './TouchFireButton';

function touchEvent(type: string): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'changedTouches', { value: [] });
  Object.defineProperty(event, 'touches', { value: [] });
  return event;
}

describe('TouchFireButton', () => {
  let fireButton: TouchFireButton;
  let button: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    fireButton = new TouchFireButton();
    button = document.getElementById('touch-fire-btn') as HTMLDivElement;
  });

  it('creates the fire button element', () => {
    expect(button).toBeTruthy();
    expect(button.textContent).toBe('FIRE');
    expect(button.style.width).toBe('var(--tc-fire-size, 80px)');
    expect(button.style.height).toBe('var(--tc-fire-size, 80px)');
  });

  it('touch start triggers onFireStart and visual pressed state', () => {
    const onFireStart = vi.fn();
    const onFireStop = vi.fn();
    fireButton.setCallbacks(onFireStart, onFireStop);

    button.dispatchEvent(touchEvent('touchstart'));

    expect(onFireStart).toHaveBeenCalledTimes(1);
    expect(button.style.background).toBe('rgba(255, 60, 60, 0.7)');
    expect(button.style.transform).toBe('scale(0.92)');
  });

  it('touch end triggers onFireStop and resets visuals', () => {
    const onFireStart = vi.fn();
    const onFireStop = vi.fn();
    fireButton.setCallbacks(onFireStart, onFireStop);

    button.dispatchEvent(touchEvent('touchstart'));
    button.dispatchEvent(touchEvent('touchend'));

    expect(onFireStop).toHaveBeenCalledTimes(1);
    expect(button.style.background).toBe('rgba(255, 60, 60, 0.4)');
    expect(button.style.transform).toBe('scale(1)');
  });

  it('show and hide toggle visibility', () => {
    fireButton.hide();
    expect(button.style.display).toBe('none');

    fireButton.show();
    expect(button.style.display).toBe('flex');
  });

  it('hide while pressed triggers onFireStop', () => {
    const onFireStart = vi.fn();
    const onFireStop = vi.fn();
    fireButton.setCallbacks(onFireStart, onFireStop);

    button.dispatchEvent(touchEvent('touchstart'));
    fireButton.hide();

    expect(onFireStop).toHaveBeenCalledTimes(1);
  });

  it('dispose removes dom and listeners', () => {
    const onFireStart = vi.fn();
    const onFireStop = vi.fn();
    fireButton.setCallbacks(onFireStart, onFireStop);

    fireButton.dispose();
    expect(document.getElementById('touch-fire-btn')).toBeNull();

    button.dispatchEvent(touchEvent('touchstart'));
    button.dispatchEvent(touchEvent('touchend'));
    expect(onFireStart).not.toHaveBeenCalled();
    expect(onFireStop).not.toHaveBeenCalled();
  });
});
