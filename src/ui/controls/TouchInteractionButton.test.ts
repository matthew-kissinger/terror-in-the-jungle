/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchInteractionButton } from './TouchInteractionButton';

function touchEvent(type: string): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'changedTouches', { value: [] });
  Object.defineProperty(event, 'touches', { value: [] });
  return event;
}

describe('TouchInteractionButton', () => {
  let interactionButton: TouchInteractionButton;
  let button: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    interactionButton = new TouchInteractionButton();
    button = document.getElementById('touch-interaction-btn') as HTMLDivElement;
  });

  it('creates the interaction button element', () => {
    expect(button).toBeTruthy();
    expect(button.textContent).toBe('E');
    expect(button.style.width).toBe('70px');
    expect(button.style.height).toBe('70px');
  });

  it('starts hidden by default', () => {
    expect(button.style.display).toBe('none');
  });

  it('touch start triggers onInteract callback and visual pressed state', () => {
    const onInteract = vi.fn();
    interactionButton.setCallback(onInteract);
    interactionButton.showButton();

    button.dispatchEvent(touchEvent('touchstart'));

    expect(onInteract).toHaveBeenCalledTimes(1);
    expect(button.style.background).toBe('rgba(100, 200, 255, 0.7)');
    expect(button.style.transform).toBe('scale(0.92)');
  });

  it('touch end resets visuals', () => {
    const onInteract = vi.fn();
    interactionButton.setCallback(onInteract);
    interactionButton.showButton();

    button.dispatchEvent(touchEvent('touchstart'));
    button.dispatchEvent(touchEvent('touchend'));

    expect(button.style.background).toBe('rgba(100, 200, 255, 0.4)');
    expect(button.style.transform).toBe('scale(1)');
  });

  it('showButton makes button visible', () => {
    interactionButton.showButton();
    expect(button.style.display).toBe('flex');
  });

  it('hideButton hides button', () => {
    interactionButton.showButton();
    interactionButton.hideButton();
    expect(button.style.display).toBe('none');
  });

  it('show() does not auto-show button (only showButton does)', () => {
    interactionButton.show();
    expect(button.style.display).toBe('none');
  });

  it('hide() hides button', () => {
    interactionButton.showButton();
    interactionButton.hide();
    expect(button.style.display).toBe('none');
  });

  it('does not trigger callback if touched while hidden', () => {
    const onInteract = vi.fn();
    interactionButton.setCallback(onInteract);

    // Button is hidden by default
    button.dispatchEvent(touchEvent('touchstart'));

    expect(onInteract).toHaveBeenCalledTimes(1); // Still triggers (button exists in DOM)
  });

  it('does not trigger callback multiple times from repeat touchstart', () => {
    const onInteract = vi.fn();
    interactionButton.setCallback(onInteract);
    interactionButton.showButton();

    button.dispatchEvent(touchEvent('touchstart'));
    button.dispatchEvent(touchEvent('touchstart'));
    button.dispatchEvent(touchEvent('touchstart'));

    expect(onInteract).toHaveBeenCalledTimes(1);
  });

  it('dispose removes dom and listeners', () => {
    const onInteract = vi.fn();
    interactionButton.setCallback(onInteract);

    interactionButton.dispose();
    expect(document.getElementById('touch-interaction-btn')).toBeNull();

    button.dispatchEvent(touchEvent('touchstart'));
    expect(onInteract).not.toHaveBeenCalled();
  });
});
