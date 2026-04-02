/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

async function loadModule(search: string, supported = true) {
  vi.resetModules();
  const startViewTransition = supported
    ? vi.fn((callback: () => void) => {
        callback();
        return { finished: Promise.resolve() };
      })
    : undefined;

  Object.defineProperty(globalThis, 'window', {
    value: { location: { search } },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: {
      startViewTransition,
    },
    configurable: true,
  });

  const mod = await import('./UITransitions');
  return { ...mod, startViewTransition };
}

function readTransitionState() {
  return (document as Document & {
    uiTransitionState?: {
      enabled: boolean;
      reason: string;
      supported: boolean;
    };
  }).uiTransitionState;
}

describe('UITransitions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: originalDocument, configurable: true });
  });

  it('uses view transitions for menu flows when supported', async () => {
    const { runUiTransition, startViewTransition } = await loadModule('');
    const update = vi.fn();

    runUiTransition('menu', update);

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(readTransitionState()).toMatchObject({
      enabled: true,
      reason: 'default-enabled',
      supported: true,
    });
  });

  it('disables menu transitions for perf captures by default', async () => {
    const { runUiTransition, startViewTransition } = await loadModule('?perf=1');
    const update = vi.fn();

    runUiTransition('menu', update);

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(readTransitionState()).toMatchObject({
      enabled: false,
      reason: 'automation',
      supported: true,
    });
  });

  it('allows query opt-in for menu transitions but never for live entry', async () => {
    const { runUiTransition, startViewTransition } = await loadModule('?sandbox=true&uiTransitions=1');
    const menuUpdate = vi.fn();
    const liveUpdate = vi.fn();

    runUiTransition('menu', menuUpdate);
    expect(readTransitionState()).toMatchObject({
      enabled: true,
      reason: 'query-enabled',
      supported: true,
    });

    runUiTransition('live-entry', liveUpdate);

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(menuUpdate).toHaveBeenCalledTimes(1);
    expect(liveUpdate).toHaveBeenCalledTimes(1);
    expect(readTransitionState()).toMatchObject({
      enabled: false,
      reason: 'live-entry',
      supported: true,
    });
  });
});
