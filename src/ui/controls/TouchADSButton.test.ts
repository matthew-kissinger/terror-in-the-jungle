/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchADSButton } from './TouchADSButton';

function pointerEvent(type: string, pointerId = 1): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId,
    pointerType: 'touch',
  });
}

describe('TouchADSButton', () => {
  let adsButton: TouchADSButton;
  let button: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    adsButton = new TouchADSButton();
    adsButton.mount(document.body);
    button = document.getElementById('touch-ads-btn') as HTMLDivElement;
  });

  it('creates the ADS button element with correct ID and styles', () => {
    expect(button).toBeTruthy();
    expect(button.id).toBe('touch-ads-btn');
    expect(button.textContent).toBe('ADS');
    expect(button.className).toContain('adsBtn');
  });

  it('hold-to-ADS: pointerdown activates, pointerup deactivates', () => {
    const onADSToggle = vi.fn();
    adsButton.setOnADSToggle(onADSToggle);

    // Hold: pointerdown = ADS ON
    button.dispatchEvent(pointerEvent('pointerdown'));
    expect(onADSToggle).toHaveBeenCalledWith(true);
    expect(onADSToggle).toHaveBeenCalledTimes(1);

    // Release: pointerup = ADS OFF
    button.dispatchEvent(pointerEvent('pointerup'));
    expect(onADSToggle).toHaveBeenCalledWith(false);
    expect(onADSToggle).toHaveBeenCalledTimes(2);
  });

  it('ignores duplicate pointerdown when already held', () => {
    const onADSToggle = vi.fn();
    adsButton.setOnADSToggle(onADSToggle);

    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerdown')); // duplicate
    expect(onADSToggle).toHaveBeenCalledTimes(1);
  });

  it('button shows active styling when held', () => {
    // Initial state (OFF)
    expect(button.classList.contains('adsActive')).toBe(false);

    // Hold ON
    button.dispatchEvent(pointerEvent('pointerdown'));
    expect(button.classList.contains('adsActive')).toBe(true);

    // Release OFF
    button.dispatchEvent(pointerEvent('pointerup'));
    expect(button.classList.contains('adsActive')).toBe(false);
  });

  it('resetADS clears active state and triggers callback', () => {
    const onADSToggle = vi.fn();
    adsButton.setOnADSToggle(onADSToggle);

    // Toggle ON
    button.dispatchEvent(pointerEvent('pointerdown'));
    expect(onADSToggle).toHaveBeenCalledWith(true);

    // Reset
    adsButton.resetADS();
    expect(onADSToggle).toHaveBeenCalledWith(false);
    expect(button.classList.contains('adsActive')).toBe(false);
  });

  it('show and hide toggle visibility', () => {
    adsButton.hide();
    expect(button.style.display).toBe('none');

    adsButton.show();
    expect(button.style.display).toBe('flex');
  });

  it('hide resets ADS state', () => {
    const onADSToggle = vi.fn();
    adsButton.setOnADSToggle(onADSToggle);

    button.dispatchEvent(pointerEvent('pointerdown'));
    adsButton.hide();

    expect(onADSToggle).toHaveBeenCalledWith(false);
  });

  it('dispose removes dom and listeners', () => {
    const onADSToggle = vi.fn();
    adsButton.setOnADSToggle(onADSToggle);

    adsButton.dispose();
    expect(document.getElementById('touch-ads-btn')).toBeNull();

    // Trigger event on the detached button to verify listener removal
    button.dispatchEvent(pointerEvent('pointerdown'));
    expect(onADSToggle).not.toHaveBeenCalled();
  });
});
