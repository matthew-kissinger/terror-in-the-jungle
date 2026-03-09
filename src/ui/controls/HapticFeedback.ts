/**
 * Haptic feedback for mobile touch controls.
 * Wraps navigator.vibrate() with predefined patterns for game events.
 * Gated by haptics.enabled (persisted in localStorage).
 */

const HAPTIC_STORAGE_KEY = 'terror_haptic_feedback';

function loadEnabled(): boolean {
  try {
    const stored = localStorage.getItem(HAPTIC_STORAGE_KEY);
    return stored !== 'false';
  } catch {
    return true;
  }
}

export const haptics = {
  fire: (): void => {
    if (!haptics.enabled) return;
    navigator.vibrate?.(10);
  },
  hit: (): void => {
    if (!haptics.enabled) return;
    navigator.vibrate?.(20);
  },
  kill: (): void => {
    if (!haptics.enabled) return;
    navigator.vibrate?.([30, 10, 30]);
  },
  headshot: (): void => {
    if (!haptics.enabled) return;
    navigator.vibrate?.(50);
  },
  enabled: loadEnabled(),

  /** Persist the enabled state to localStorage. */
  setEnabled(value: boolean): void {
    haptics.enabled = value;
    try {
      localStorage.setItem(HAPTIC_STORAGE_KEY, String(value));
    } catch {
      // localStorage unavailable
    }
  },
};
