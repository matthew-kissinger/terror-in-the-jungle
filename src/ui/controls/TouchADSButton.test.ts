/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchADSButton } from './TouchADSButton';

function touchEvent(type: string): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'changedTouches', { value: [] });
  Object.defineProperty(event, 'touches', { value: [] });
  return event;
}

describe('TouchADSButton', () => {
  let adsButton: TouchADSButton;
  let button: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    adsButton = new TouchADSButton();
    button = document.getElementById('touch-ads-btn') as HTMLDivElement;
  });

  it('creates the ADS button element with correct ID and styles', () => {
    expect(button).toBeTruthy();
    expect(button.id).toBe('touch-ads-btn');
    expect(button.textContent).toBe('ADS');
    expect(button.style.position).toBe('fixed');
    // Uses responsive CSS calc based on fire button size + edge inset
    expect(button.style.right).toContain('calc');
    expect(button.style.right).toContain('--tc-fire-size');
    expect(button.style.bottom).toContain('--tc-edge-inset');
  });

  it('setOnADSToggle stores and triggers callback on touchstart', () => {
    const onADSToggle = vi.fn();
    adsButton.setOnADSToggle(onADSToggle);

    // First tap: toggle ON
    button.dispatchEvent(touchEvent('touchstart'));
    expect(onADSToggle).toHaveBeenCalledWith(true);
    expect(onADSToggle).toHaveBeenCalledTimes(1);

    // Second tap: toggle OFF
    button.dispatchEvent(touchEvent('touchstart'));
    expect(onADSToggle).toHaveBeenCalledWith(false);
    expect(onADSToggle).toHaveBeenCalledTimes(2);
  });

  it('button shows active styling when toggled on', () => {
    // Initial state (OFF)
    expect(button.style.background).toBe('rgba(255, 255, 255, 0.15)');

    // Toggle ON
    button.dispatchEvent(touchEvent('touchstart'));
    expect(button.style.background).toBe('rgba(100, 180, 255, 0.45)');
    expect(button.style.borderColor).toBe('rgba(100, 180, 255, 0.8)');
    expect(button.style.color).toBe('rgb(255, 255, 255)');

    // Toggle OFF
    button.dispatchEvent(touchEvent('touchstart'));
    expect(button.style.background).toBe('rgba(255, 255, 255, 0.15)');
  });

  it('resetADS clears active state and triggers callback', () => {
    const onADSToggle = vi.fn();
    adsButton.setOnADSToggle(onADSToggle);

    // Toggle ON
    button.dispatchEvent(touchEvent('touchstart'));
    expect(onADSToggle).toHaveBeenCalledWith(true);

    // Reset
    adsButton.resetADS();
    expect(onADSToggle).toHaveBeenCalledWith(false);
    expect(button.style.background).toBe('rgba(255, 255, 255, 0.15)');
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

    button.dispatchEvent(touchEvent('touchstart'));
    adsButton.hide();

    expect(onADSToggle).toHaveBeenCalledWith(false);
  });

  it('dispose removes dom and listeners', () => {
    const onADSToggle = vi.fn();
    adsButton.setOnADSToggle(onADSToggle);

    adsButton.dispose();
    expect(document.getElementById('touch-ads-btn')).toBeNull();

    // Trigger event on the detached button to verify listener removal
    button.dispatchEvent(touchEvent('touchstart'));
    expect(onADSToggle).not.toHaveBeenCalled();
  });
});
