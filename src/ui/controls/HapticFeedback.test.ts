/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { haptics } from './HapticFeedback';

describe('HapticFeedback', () => {
  beforeEach(() => {
    haptics.enabled = true;
    // Mock navigator.vibrate
    Object.defineProperty(navigator, 'vibrate', {
      value: vi.fn(() => true),
      writable: true,
      configurable: true,
    });
  });

  it('fire() calls vibrate(10) when enabled', () => {
    haptics.fire();
    expect(navigator.vibrate).toHaveBeenCalledWith(10);
  });

  it('hit() calls vibrate(20) when enabled', () => {
    haptics.hit();
    expect(navigator.vibrate).toHaveBeenCalledWith(20);
  });

  it('kill() calls vibrate pattern when enabled', () => {
    haptics.kill();
    expect(navigator.vibrate).toHaveBeenCalledWith([30, 10, 30]);
  });

  it('headshot() calls vibrate(50) when enabled', () => {
    haptics.headshot();
    expect(navigator.vibrate).toHaveBeenCalledWith(50);
  });

  it('does not call vibrate when disabled', () => {
    haptics.enabled = false;
    haptics.fire();
    haptics.hit();
    haptics.kill();
    haptics.headshot();
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it('setEnabled persists to localStorage', () => {
    haptics.setEnabled(false);
    expect(haptics.enabled).toBe(false);
    expect(localStorage.getItem('terror_haptic_feedback')).toBe('false');

    haptics.setEnabled(true);
    expect(haptics.enabled).toBe(true);
    expect(localStorage.getItem('terror_haptic_feedback')).toBe('true');
  });
});
