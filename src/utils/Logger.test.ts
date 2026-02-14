import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from './Logger';

describe('Logger', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Logger.clearBuffer();
    Logger.setMinLevel('debug');
  });

  afterEach(() => {
    Logger.setMinLevel('warn');
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
    vi.restoreAllMocks();
  });

  it('should have log level methods', () => {
    expect(typeof Logger.debug).toBe('function');
    expect(typeof Logger.info).toBe('function');
    expect(typeof Logger.warn).toBe('function');
    expect(typeof Logger.error).toBe('function');
  });

  it('should call console methods when logging', () => {
    Logger.info('test', 'hello');
    expect(console.info).toHaveBeenCalled();
  });

  it('uses error level default on github pages host', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { location: { hostname: 'mygame.github.io', search: '' }, localStorage: undefined },
      configurable: true
    });

    expect((Logger as unknown as { readRuntimeDefaultLevel: () => string | null }).readRuntimeDefaultLevel()).toBe('error');
  });

  it('does not force production level on localhost', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { location: { hostname: 'localhost', search: '' }, localStorage: undefined },
      configurable: true
    });

    expect((Logger as unknown as { readRuntimeDefaultLevel: () => string | null }).readRuntimeDefaultLevel()).toBeNull();
  });
});
