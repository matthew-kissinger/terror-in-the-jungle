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
    localStorage.removeItem('terror_ads_mode');
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

  describe('toggle mode (default)', () => {
    it('first tap activates, second tap deactivates', () => {
      const onADSToggle = vi.fn();
      adsButton.setOnADSToggle(onADSToggle);

      // First tap: pointerdown then pointerup = ADS ON
      button.dispatchEvent(pointerEvent('pointerdown'));
      button.dispatchEvent(pointerEvent('pointerup'));
      expect(onADSToggle).toHaveBeenCalledWith(true);
      expect(onADSToggle).toHaveBeenCalledTimes(1);

      // Second tap: pointerdown then pointerup = ADS OFF
      button.dispatchEvent(pointerEvent('pointerdown'));
      button.dispatchEvent(pointerEvent('pointerup'));
      expect(onADSToggle).toHaveBeenCalledWith(false);
      expect(onADSToggle).toHaveBeenCalledTimes(2);
    });

    it('pointerdown alone does not toggle', () => {
      const onADSToggle = vi.fn();
      adsButton.setOnADSToggle(onADSToggle);

      button.dispatchEvent(pointerEvent('pointerdown'));
      expect(onADSToggle).not.toHaveBeenCalled();
    });

    it('pointercancel does not toggle state', () => {
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
      expect(onADSToggle).toHaveBeenCalledWith(true);

      button.dispatchEvent(pointerEvent('pointerup'));
      expect(onADSToggle).toHaveBeenCalledWith(false);
    });

    it('deactivates on pointercancel', () => {
      adsButton.setADSBehavior('hold');
      const onADSToggle = vi.fn();
      adsButton.setOnADSToggle(onADSToggle);

      button.dispatchEvent(pointerEvent('pointerdown'));
      expect(onADSToggle).toHaveBeenCalledWith(true);

      button.dispatchEvent(pointerEvent('pointercancel'));
      expect(onADSToggle).toHaveBeenCalledWith(false);
    });

    it('persists setting to localStorage', () => {
      adsButton.setADSBehavior('hold');
      expect(localStorage.getItem('terror_ads_mode')).toBe('hold');
      expect(adsButton.getADSBehavior()).toBe('hold');

      adsButton.setADSBehavior('toggle');
      expect(localStorage.getItem('terror_ads_mode')).toBe('toggle');
    });
  });

  it('button shows active styling when toggled on', () => {
    // Initial state (OFF)
    expect(button.classList.contains('adsActive')).toBe(false);

    // Toggle ON
    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));
    expect(button.classList.contains('adsActive')).toBe(true);

    // Toggle OFF
    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));
    expect(button.classList.contains('adsActive')).toBe(false);
  });

  it('resetADS clears active state and triggers callback', () => {
    const onADSToggle = vi.fn();
    adsButton.setOnADSToggle(onADSToggle);

    // Toggle ON
    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointerup'));
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
    button.dispatchEvent(pointerEvent('pointerup'));
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
    button.dispatchEvent(pointerEvent('pointerup'));
    expect(onADSToggle).not.toHaveBeenCalled();
  });
});
