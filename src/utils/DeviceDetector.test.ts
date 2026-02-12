/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadDeviceDetector() {
  vi.resetModules();
  return import('./DeviceDetector');
}

describe('DeviceDetector', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'ontouchstart', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      configurable: true,
    });

    Object.defineProperty(window, 'innerWidth', {
      value: 1280,
      configurable: true,
    });

    Object.defineProperty(window, 'innerHeight', {
      value: 720,
      configurable: true,
    });
  });

  it('isTouchDevice detects touch capability via ontouchstart', async () => {
    Object.defineProperty(window, 'ontouchstart', {
      value: () => {},
      configurable: true,
    });

    const { isTouchDevice } = await loadDeviceDetector();
    expect(isTouchDevice()).toBe(true);
  });

  it('isTouchDevice detects touch capability via navigator.maxTouchPoints', async () => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 3,
      configurable: true,
    });

    const { isTouchDevice } = await loadDeviceDetector();
    expect(isTouchDevice()).toBe(true);
  });

  it('isTouchDevice caches the first computed value', async () => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 1,
      configurable: true,
    });

    const { isTouchDevice } = await loadDeviceDetector();
    expect(isTouchDevice()).toBe(true);

    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      configurable: true,
    });
    expect(isTouchDevice()).toBe(true);
  });

  it('shouldUseTouchControls returns true for touch devices', async () => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 1,
      configurable: true,
    });

    const { shouldUseTouchControls } = await loadDeviceDetector();
    expect(shouldUseTouchControls()).toBe(true);
  });

  it('isMobileViewport checks viewport dimensions', async () => {
    const { isMobileViewport } = await loadDeviceDetector();

    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    expect(isMobileViewport()).toBe(true);

    Object.defineProperty(window, 'innerWidth', { value: 1300, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    expect(isMobileViewport()).toBe(false);
  });
});
