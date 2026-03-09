/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchCrouchButton } from './TouchCrouchButton';

function pointerEvent(type: string, pointerId = 1): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId,
    pointerType: 'touch',
  });
}

describe('TouchCrouchButton', () => {
  let crouchButton: TouchCrouchButton;
  let button: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    crouchButton = new TouchCrouchButton();
    crouchButton.mount(document.body);
    button = document.getElementById('touch-crouch-btn') as HTMLDivElement;
  });

  it('creates the crouch button element', () => {
    expect(button).toBeTruthy();
    const img = button.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('icon-crouch.png');
    expect(button.className).toContain('crouchBtn');
  });

  it('first tap activates crouch, second tap deactivates', () => {
    const onToggle = vi.fn();
    crouchButton.setOnCrouchToggle(onToggle);

    // First tap: crouch ON
    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(crouchButton.getCrouched()).toBe(true);

    // Second tap: crouch OFF
    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(crouchButton.getCrouched()).toBe(false);
  });

  it('applies crouched CSS class when active', () => {
    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));
    expect(button.classList.contains('crouched')).toBe(true);

    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));
    expect(button.classList.contains('crouched')).toBe(false);
  });

  it('resetCrouch clears state and fires callback', () => {
    const onToggle = vi.fn();
    crouchButton.setOnCrouchToggle(onToggle);

    // Activate
    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));
    expect(crouchButton.getCrouched()).toBe(true);

    // Reset
    crouchButton.resetCrouch();
    expect(crouchButton.getCrouched()).toBe(false);
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('resetCrouch is no-op when not crouched', () => {
    const onToggle = vi.fn();
    crouchButton.setOnCrouchToggle(onToggle);

    crouchButton.resetCrouch();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('hide resets crouch state', () => {
    const onToggle = vi.fn();
    crouchButton.setOnCrouchToggle(onToggle);

    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));
    crouchButton.hide();

    expect(crouchButton.getCrouched()).toBe(false);
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('show and hide toggle visibility', () => {
    crouchButton.hide();
    expect(button.style.display).toBe('none');

    crouchButton.show();
    expect(button.style.display).toBe('flex');
  });
});
