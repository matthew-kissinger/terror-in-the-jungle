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

    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('fine'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      configurable: true,
      writable: true,
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

  it('shouldUseTouchControls returns true for mobile-sized touch devices', async () => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 1,
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', {
      value: 390,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 844,
      configurable: true,
    });

    const { shouldUseTouchControls } = await loadDeviceDetector();
    expect(shouldUseTouchControls()).toBe(true);
  });

  it('shouldUseTouchControls returns false for hybrid desktop devices with a fine pointer', async () => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    });

    const { shouldUseTouchControls } = await loadDeviceDetector();
    expect(shouldUseTouchControls()).toBe(false);
  });

  it('shouldUseTouchControls returns true for touch-only coarse-pointer devices', async () => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 1,
      configurable: true,
    });
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('coarse'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      configurable: true,
      writable: true,
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

  it('shouldEnableShadows returns false for low tier', async () => {
    const { shouldEnableShadows } = await loadDeviceDetector();
    expect(typeof shouldEnableShadows()).toBe('boolean');
  });

  it('getShadowMapSize returns valid power-of-2 sizes', async () => {
    const { getShadowMapSize } = await loadDeviceDetector();
    const size = getShadowMapSize();
    expect([512, 1024, 2048]).toContain(size);
  });

  it('getRenderDistanceMultiplier returns value between 0.5 and 1.0', async () => {
    const { getRenderDistanceMultiplier } = await loadDeviceDetector();
    const multiplier = getRenderDistanceMultiplier();
    expect(multiplier).toBeGreaterThanOrEqual(0.5);
    expect(multiplier).toBeLessThanOrEqual(1.0);
  });

  it('getMaxPixelRatio returns capped value', async () => {
    const { getMaxPixelRatio } = await loadDeviceDetector();
    const ratio = getMaxPixelRatio();
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(2);
  });

  it('getMaxPixelRatio caps mobile devices at 1.0 to reduce WebGL2-fallback fragment cost', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      configurable: true,
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 3,
      configurable: true,
    });

    const { getMaxPixelRatio } = await loadDeviceDetector();
    expect(getMaxPixelRatio()).toBe(1);
  });

  it('getMaxPixelRatio honors window.devicePixelRatio on desktop (capped at 2)', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 1.5,
      configurable: true,
    });

    const { getMaxPixelRatio } = await loadDeviceDetector();
    expect(getMaxPixelRatio()).toBe(1.5);
  });

  it('getMaxPixelRatio caps desktop devicePixelRatio at 2', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 4,
      configurable: true,
    });

    const { getMaxPixelRatio } = await loadDeviceDetector();
    expect(getMaxPixelRatio()).toBe(2);
  });
});
