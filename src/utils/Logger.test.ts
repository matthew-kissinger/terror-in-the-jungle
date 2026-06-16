// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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

  it('keeps the latest buffered entries in chronological order', () => {
    for (let index = 0; index < 210; index++) {
      Logger.info(`logger-ring-${index}`, `message-${index}`);
    }

    const stats = Logger.getStats();
    expect(stats.recent).toHaveLength(200);
    expect(stats.recent[0].category).toBe('logger-ring-10');
    expect(stats.recent.at(-1)?.category).toBe('logger-ring-209');

    const recent = Logger.getRecent(3);
    expect(recent.map(entry => entry.message)).toEqual([
      'message-207',
      'message-208',
      'message-209',
    ]);
  });

  it('clearBuffer drops retained entries without changing the configured level', () => {
    Logger.warn('logger-ring-clear', 'retained');
    expect(Logger.getRecent()).toHaveLength(1);

    Logger.clearBuffer();

    expect(Logger.getStats().recent).toEqual([]);
    expect(Logger.getMinLevel()).toBe('debug');
  });

  it('allows a category to log again after its rate-limit window expires', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const category = `logger-window-${Date.now()}`;

    for (let index = 0; index < 6; index++) {
      Logger.warn(category, `burst-${index}`);
    }

    expect(Logger.getRecent(10).filter(entry => entry.category === category)).toHaveLength(5);
    expect(console.warn).toHaveBeenCalledTimes(5);

    now += 1001;
    Logger.warn(category, 'after-window');

    const categoryEntries = Logger.getRecent(10).filter(entry => entry.category === category);
    expect(categoryEntries.map(entry => entry.message)).toEqual([
      'burst-0',
      'burst-1',
      'burst-2',
      'burst-3',
      'burst-4',
      'after-window',
    ]);
    expect(console.warn).toHaveBeenCalledTimes(6);
  });
});
