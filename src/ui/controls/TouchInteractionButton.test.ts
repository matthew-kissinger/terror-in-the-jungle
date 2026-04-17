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

/**
 * Behavior-focused tests for the interaction prompt button.
 *
 * Preserves: show/hide lifecycle (critical per A5 brief), callback wiring,
 * and safe disposal. We don't assert on icon file names or CSS class names.
 */
describe('TouchInteractionButton', () => {
  let interactionButton: TouchInteractionButton;
  let button: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    interactionButton = new TouchInteractionButton();
    interactionButton.mount(document.body);
    button = document.getElementById('touch-interaction-btn') as HTMLDivElement;
  });

  it('mounts hidden by default', () => {
    expect(button).toBeTruthy();
    expect(button.style.display).toBe('none');
  });

  it('showButton reveals the prompt and hideButton hides it cleanly', () => {
    interactionButton.showButton();
    expect(button.style.display).not.toBe('none');

    interactionButton.hideButton();
    expect(button.style.display).toBe('none');
  });

  it('top-level show() alone does not reveal the prompt (showButton controls visibility)', () => {
    interactionButton.show();
    expect(button.style.display).toBe('none');
  });

  it('tapping the button invokes the interact callback', () => {
    const onInteract = vi.fn();
    interactionButton.setCallback(onInteract);
    interactionButton.showButton();

    button.dispatchEvent(pointerEvent('pointerdown'));
    expect(onInteract).toHaveBeenCalledTimes(1);
  });

  it('repeated pointerdown events without release only fire once', () => {
    const onInteract = vi.fn();
    interactionButton.setCallback(onInteract);
    interactionButton.showButton();

    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerdown'));

    expect(onInteract).toHaveBeenCalledTimes(1);
  });

  it('dispose removes the button and detaches listeners', () => {
    const onInteract = vi.fn();
    interactionButton.setCallback(onInteract);

    interactionButton.dispose();
    expect(document.getElementById('touch-interaction-btn')).toBeNull();

    button.dispatchEvent(pointerEvent('pointerdown'));
    expect(onInteract).not.toHaveBeenCalled();
  });
});
