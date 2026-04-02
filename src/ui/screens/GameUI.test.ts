/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameUI } from './GameUI';

describe('GameUI', () => {
  let ui: GameUI;

  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost/'),
      configurable: true,
    });
    (document as Document & {
      startViewTransition?: ReturnType<typeof vi.fn>;
    }).startViewTransition = vi.fn((callback: () => void) => {
      callback();
      return { finished: Promise.resolve() };
    });

    ui = new GameUI();
    ui.mount(document.body);
  });

  afterEach(() => {
    ui.dispose();
    delete (document as Document & { startViewTransition?: unknown }).startViewTransition;
    delete (document as Document & { uiTransitionState?: unknown }).uiTransitionState;
    vi.useRealTimers();
  });

  it('bypasses document view transitions when hiding for live gameplay entry', () => {
    const startViewTransition = (document as Document & {
      startViewTransition?: ReturnType<typeof vi.fn>;
    }).startViewTransition;

    ui.hide();

    expect(startViewTransition).not.toHaveBeenCalled();
    expect((document as Document & { uiTransitionState?: unknown }).uiTransitionState).toMatchObject({
      enabled: false,
      reason: 'live-entry',
      supported: true,
    });
  });
});
