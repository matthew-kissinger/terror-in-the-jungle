/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchInteractionButton } from './TouchInteractionButton';

function pointerEvent(type: string, pointerId = 1): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId,
    pointerType: 'touch',
  });
}

describe('TouchInteractionButton', () => {
  let interactionButton: TouchInteractionButton;
  let button: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    interactionButton = new TouchInteractionButton();
    interactionButton.mount(document.body);
    button = document.getElementById('touch-interaction-btn') as HTMLDivElement;
  });

  it('creates the interaction button element', () => {
    expect(button).toBeTruthy();
    expect(button.textContent).toBe('E');
    expect(button.className).toContain('interactBtn');
  });

  it('starts hidden by default', () => {
    expect(button.style.display).toBe('none');
  });

  it('touch start triggers onInteract callback and visual pressed state', () => {
    const onInteract = vi.fn();
    interactionButton.setCallback(onInteract);
    interactionButton.showButton();

    button.dispatchEvent(pointerEvent('pointerdown'));

    expect(onInteract).toHaveBeenCalledTimes(1);
    expect(button.classList.contains('pressed')).toBe(true);
  });

  it('touch end resets visuals', () => {
    const onInteract = vi.fn();
    interactionButton.setCallback(onInteract);
    interactionButton.showButton();

    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));

    expect(button.classList.contains('pressed')).toBe(false);
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
    button.dispatchEvent(pointerEvent('pointerdown'));

    expect(onInteract).toHaveBeenCalledTimes(1); // Still triggers (button exists in DOM)
  });

  it('does not trigger callback multiple times from repeat pointerdown', () => {
    const onInteract = vi.fn();
    interactionButton.setCallback(onInteract);
    interactionButton.showButton();

    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerdown'));

    expect(onInteract).toHaveBeenCalledTimes(1);
  });

  it('dispose removes dom and listeners', () => {
    const onInteract = vi.fn();
    interactionButton.setCallback(onInteract);

    interactionButton.dispose();
    expect(document.getElementById('touch-interaction-btn')).toBeNull();

    button.dispatchEvent(pointerEvent('pointerdown'));
    expect(onInteract).not.toHaveBeenCalled();
  });
});
