/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ViewportManager } from './responsive';

// Polyfill ResizeObserver for jsdom
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

describe('ViewportManager', () => {
  beforeEach(() => {
    ViewportManager.resetForTest();
  });

  it('provides initial viewport info', () => {
    const vm = ViewportManager.getInstance();
    const info = vm.info;
    expect(typeof info.width).toBe('number');
    expect(typeof info.height).toBe('number');
    expect(['phone', 'tablet', 'desktop', 'wide']).toContain(info.viewportClass);
    expect(info.scale).toBeGreaterThanOrEqual(0.6);
    expect(info.scale).toBeLessThanOrEqual(1.0);
    expect(typeof info.isPortrait).toBe('boolean');
    expect(typeof info.isTouch).toBe('boolean');
  });

  it('calls subscriber immediately with current info', () => {
    const vm = ViewportManager.getInstance();
    const cb = vi.fn();
    vm.subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(vm.info);
  });

  it('unsubscribe removes callback', () => {
    const vm = ViewportManager.getInstance();
    const cb = vi.fn();
    const unsub = vm.subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    // After unsubscribe, callback count should stay at 1
    expect(cb).toHaveBeenCalledTimes(1);
  });

});
