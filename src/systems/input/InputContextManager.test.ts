import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InputContextManager, InputContext } from './InputContextManager';

describe('InputContextManager', () => {
  let manager: InputContextManager;

  beforeEach(() => {
    // Reset singleton so each test gets a fresh instance
    (InputContextManager as any).instance = null;
    manager = InputContextManager.getInstance();
  });

  describe('singleton', () => {
    it('returns the same instance on repeated calls', () => {
      const a = InputContextManager.getInstance();
      const b = InputContextManager.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('default context', () => {
    it('defaults to gameplay', () => {
      expect(manager.getContext()).toBe('gameplay');
    });

    it('isGameplay returns true for the default context', () => {
      expect(manager.isGameplay()).toBe(true);
    });
  });

  describe('setContext', () => {
    it('changes the context to map', () => {
      manager.setContext('map');
      expect(manager.getContext()).toBe('map');
    });

    it('changes the context to menu', () => {
      manager.setContext('menu');
      expect(manager.getContext()).toBe('menu');
    });

    it('changes the context to modal', () => {
      manager.setContext('modal');
      expect(manager.getContext()).toBe('modal');
    });

    it('updates isGameplay when context changes away from gameplay', () => {
      manager.setContext('menu');
      expect(manager.isGameplay()).toBe(false);
    });

    it('updates isGameplay when context returns to gameplay', () => {
      manager.setContext('menu');
      manager.setContext('gameplay');
      expect(manager.isGameplay()).toBe(true);
    });
  });

  describe('no-op on same context', () => {
    it('does not fire listeners when setting the same context', () => {
      const listener = vi.fn();
      manager.onChange(listener);
      listener.mockClear(); // clear the immediate invocation

      manager.setContext('gameplay'); // same as default
      expect(listener).not.toHaveBeenCalled();
    });

    it('does not fire listeners when setting the same non-default context twice', () => {
      manager.setContext('map');

      const listener = vi.fn();
      manager.onChange(listener);
      listener.mockClear();

      manager.setContext('map');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('onChange', () => {
    it('invokes the listener immediately with the current context', () => {
      const listener = vi.fn();
      manager.onChange(listener);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('gameplay');
    });

    it('invokes the listener immediately with a non-default context', () => {
      manager.setContext('modal');
      const listener = vi.fn();
      manager.onChange(listener);
      expect(listener).toHaveBeenCalledWith('modal');
    });

    it('fires on subsequent context changes', () => {
      const listener = vi.fn();
      manager.onChange(listener);
      listener.mockClear();

      manager.setContext('menu');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('menu');
    });

    it('fires for every distinct context change', () => {
      const contexts: InputContext[] = [];
      manager.onChange((ctx) => contexts.push(ctx));

      // First call is the immediate invocation: 'gameplay'
      manager.setContext('map');
      manager.setContext('modal');
      manager.setContext('gameplay');

      expect(contexts).toEqual(['gameplay', 'map', 'modal', 'gameplay']);
    });

    it('supports multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      manager.onChange(listener1);
      manager.onChange(listener2);
      listener1.mockClear();
      listener2.mockClear();

      manager.setContext('map');
      expect(listener1).toHaveBeenCalledWith('map');
      expect(listener2).toHaveBeenCalledWith('map');
    });

    it('returns an unsubscribe function that stops future notifications', () => {
      const listener = vi.fn();
      const unsub = manager.onChange(listener);
      listener.mockClear();

      unsub();
      manager.setContext('menu');
      expect(listener).not.toHaveBeenCalled();
    });

    it('unsubscribing one listener does not affect others', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const unsub1 = manager.onChange(listener1);
      manager.onChange(listener2);
      listener1.mockClear();
      listener2.mockClear();

      unsub1();
      manager.setContext('map');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith('map');
    });

    it('calling unsubscribe twice is harmless', () => {
      const listener = vi.fn();
      const unsub = manager.onChange(listener);
      unsub();
      unsub(); // should not throw
      listener.mockClear();

      manager.setContext('menu');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('isGameplay', () => {
    it.each<[InputContext, boolean]>([
      ['gameplay', true],
      ['map', false],
      ['menu', false],
      ['modal', false],
      ['spectator', false],
    ])('returns %s for context "%s"', (context, expected) => {
      manager.setContext(context);
      expect(manager.isGameplay()).toBe(expected);
    });
  });
});
