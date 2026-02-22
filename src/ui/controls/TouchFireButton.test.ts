/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchFireButton } from './TouchFireButton';

function pointerEvent(type: string, pointerId = 1): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId,
    pointerType: 'touch',
  });
}

describe('TouchFireButton', () => {
  let fireButton: TouchFireButton;
  let button: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    fireButton = new TouchFireButton();
    fireButton.mount(document.body);
    button = document.getElementById('touch-fire-btn') as HTMLDivElement;
  });

  it('creates the fire button element', () => {
    expect(button).toBeTruthy();
    expect(button.textContent).toBe('FIRE');
    expect(button.className).toContain('fireBtn');
  });

  it('touch start triggers onFireStart and visual pressed state', () => {
    const onFireStart = vi.fn();
    const onFireStop = vi.fn();
    fireButton.setCallbacks(onFireStart, onFireStop);

    button.dispatchEvent(pointerEvent('pointerdown'));

    expect(onFireStart).toHaveBeenCalledTimes(1);
    expect(button.classList.contains('pressed')).toBe(true);
  });

  it('touch end triggers onFireStop and resets visuals', () => {
    const onFireStart = vi.fn();
    const onFireStop = vi.fn();
    fireButton.setCallbacks(onFireStart, onFireStop);

    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));

    expect(onFireStop).toHaveBeenCalledTimes(1);
    expect(button.classList.contains('pressed')).toBe(false);
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

    button.dispatchEvent(pointerEvent('pointerdown'));
    fireButton.hide();

    expect(onFireStop).toHaveBeenCalledTimes(1);
  });

  it('dispose removes dom and listeners', () => {
    const onFireStart = vi.fn();
    const onFireStop = vi.fn();
    fireButton.setCallbacks(onFireStart, onFireStop);

    fireButton.dispose();
    expect(document.getElementById('touch-fire-btn')).toBeNull();

    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));
    expect(onFireStart).not.toHaveBeenCalled();
    expect(onFireStop).not.toHaveBeenCalled();
  });
});
