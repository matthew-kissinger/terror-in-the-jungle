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

  it('mounts into the document', () => {
    expect(button).toBeTruthy();
  });

  it('pointerdown triggers onFireStart, pointerup triggers onFireStop', () => {
    const onFireStart = vi.fn();
    const onFireStop = vi.fn();
    fireButton.setCallbacks(onFireStart, onFireStop);

    button.dispatchEvent(pointerEvent('pointerdown'));
    expect(onFireStart).toHaveBeenCalledTimes(1);

    button.dispatchEvent(pointerEvent('pointerup'));
    expect(onFireStop).toHaveBeenCalledTimes(1);
  });

  it('show / hide toggle visibility', () => {
    fireButton.hide();
    expect(button.style.display).toBe('none');

    fireButton.show();
    expect(button.style.display).not.toBe('none');
  });

  it('hide while pressed triggers onFireStop so the weapon stops firing', () => {
    const onFireStart = vi.fn();
    const onFireStop = vi.fn();
    fireButton.setCallbacks(onFireStart, onFireStop);

    button.dispatchEvent(pointerEvent('pointerdown'));
    fireButton.hide();

    expect(onFireStop).toHaveBeenCalledTimes(1);
  });

  it('dispose removes the button and detaches listeners', () => {
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
