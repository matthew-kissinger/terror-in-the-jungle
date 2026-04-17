/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchADSButton } from './TouchADSButton';

/**
 * Behavior-focused tests for the ADS (aim-down-sights) button.
 *
 * We assert on the toggle/hold behavior (what the caller sees), the persistence
 * of the mode preference, and show/hide correctness. We intentionally do not
 * assert on the specific icon file name or CSS class name.
 */
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
    localStorage.removeItem('terror_ads_mode');
    adsButton = new TouchADSButton();
    adsButton.mount(document.body);
    button = document.getElementById('touch-ads-btn') as HTMLDivElement;
  });

  it('renders into the document', () => {
    expect(button).toBeTruthy();
  });

  describe('toggle mode (default)', () => {
    it('first tap activates, second tap deactivates', () => {
      const onADSToggle = vi.fn();
      adsButton.setOnADSToggle(onADSToggle);

      button.dispatchEvent(pointerEvent('pointerdown'));
      button.dispatchEvent(pointerEvent('pointerup'));
      expect(onADSToggle).toHaveBeenLastCalledWith(true);

      button.dispatchEvent(pointerEvent('pointerdown'));
      button.dispatchEvent(pointerEvent('pointerup'));
      expect(onADSToggle).toHaveBeenLastCalledWith(false);
      expect(onADSToggle).toHaveBeenCalledTimes(2);
    });

    it('pointercancel does not toggle the ADS state', () => {
      const onADSToggle = vi.fn();
      adsButton.setOnADSToggle(onADSToggle);

      button.dispatchEvent(pointerEvent('pointerdown'));
      button.dispatchEvent(pointerEvent('pointercancel'));
      expect(onADSToggle).not.toHaveBeenCalled();
    });
  });

  describe('hold mode', () => {
    it('activates on pointerdown and deactivates on pointerup', () => {
      adsButton.setADSBehavior('hold');
      const onADSToggle = vi.fn();
      adsButton.setOnADSToggle(onADSToggle);

      button.dispatchEvent(pointerEvent('pointerdown'));
      expect(onADSToggle).toHaveBeenLastCalledWith(true);

      button.dispatchEvent(pointerEvent('pointerup'));
      expect(onADSToggle).toHaveBeenLastCalledWith(false);
    });

    it('deactivates on pointercancel', () => {
      adsButton.setADSBehavior('hold');
      const onADSToggle = vi.fn();
      adsButton.setOnADSToggle(onADSToggle);

      button.dispatchEvent(pointerEvent('pointerdown'));
      button.dispatchEvent(pointerEvent('pointercancel'));
      expect(onADSToggle).toHaveBeenLastCalledWith(false);
    });

    it('persists the mode to localStorage', () => {
      adsButton.setADSBehavior('hold');
      expect(adsButton.getADSBehavior()).toBe('hold');
      expect(localStorage.getItem('terror_ads_mode')).toBe('hold');

      adsButton.setADSBehavior('toggle');
      expect(adsButton.getADSBehavior()).toBe('toggle');
      expect(localStorage.getItem('terror_ads_mode')).toBe('toggle');
    });
  });

  it('resetADS clears active state and notifies the caller', () => {
    const onADSToggle = vi.fn();
    adsButton.setOnADSToggle(onADSToggle);

    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));
    expect(onADSToggle).toHaveBeenLastCalledWith(true);

    adsButton.resetADS();
    expect(onADSToggle).toHaveBeenLastCalledWith(false);
  });

  it('hide while active resets ADS state', () => {
    const onADSToggle = vi.fn();
    adsButton.setOnADSToggle(onADSToggle);

    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));
    adsButton.hide();

    expect(onADSToggle).toHaveBeenLastCalledWith(false);
  });

  it('dispose removes the button and detaches listeners', () => {
    const onADSToggle = vi.fn();
    adsButton.setOnADSToggle(onADSToggle);

    adsButton.dispose();
    expect(document.getElementById('touch-ads-btn')).toBeNull();

    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));
    expect(onADSToggle).not.toHaveBeenCalled();
  });
});
