/**
 * Device detection utilities for mobile/touch support.
 */

let _isTouchDevice: boolean | null = null;

/**
 * Detect whether the current device supports touch input.
 * Result is cached after the first call.
 */
export function isTouchDevice(): boolean {
  if (_isTouchDevice !== null) return _isTouchDevice;
  _isTouchDevice =
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0;
  return _isTouchDevice;
}

/**
 * Check if the viewport is small enough to be considered mobile.
 */
export function isMobileViewport(): boolean {
  return window.innerWidth <= 1024 && window.innerHeight <= 900;
}

/**
 * Returns true when touch controls should be active.
 * Touch capability is required; small viewport is optional
 * but used as a heuristic.
 */
export function shouldUseTouchControls(): boolean {
  return isTouchDevice();
}
