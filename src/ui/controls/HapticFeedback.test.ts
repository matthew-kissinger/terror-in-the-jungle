/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { haptics } from './HapticFeedback';

/**
 * Behavior-focused tests for HapticFeedback.
 *
 * Intentionally does NOT assert on exact vibration magnitudes (10ms, 20ms, etc.).
 * Those are feel/tuning constants that will change and should not break tests.
 * We assert on the observable contract: when enabled, vibrate() is called; when
 * disabled, it isn't; and the enabled flag persists to localStorage.
 */
describe('HapticFeedback', () => {
  beforeEach(() => {
    haptics.enabled = true;
    Object.defineProperty(navigator, 'vibrate', {
      value: vi.fn(() => true),
      writable: true,
      configurable: true,
    });
  });

  it('calls navigator.vibrate for each feedback cue when enabled', () => {
    haptics.fire();
    haptics.hit();
    haptics.kill();
    haptics.headshot();
    expect((navigator.vibrate as ReturnType<typeof vi.fn>).mock.calls.length).toBe(4);
  });

  it('does not call navigator.vibrate when disabled', () => {
    haptics.enabled = false;
    haptics.fire();
    haptics.hit();
    haptics.kill();
    haptics.headshot();
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it('setEnabled flips the flag and persists to localStorage', () => {
    haptics.setEnabled(false);
    expect(haptics.enabled).toBe(false);
    expect(localStorage.getItem('terror_haptic_feedback')).toBe('false');

    haptics.setEnabled(true);
    expect(haptics.enabled).toBe(true);
    expect(localStorage.getItem('terror_haptic_feedback')).toBe('true');
  });
});
