/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputManager } from './InputManager';
import { InputContextManager } from './InputContextManager';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock DeviceDetector - desktop mode
vi.mock('../../utils/DeviceDetector', () => ({
  shouldUseTouchControls: vi.fn().mockReturnValue(false),
  isTouchDevice: vi.fn().mockReturnValue(false),
  isMobileViewport: vi.fn().mockReturnValue(false),
}));

// Mock TouchControls
vi.mock('../../ui/controls/TouchControls', () => ({
  TouchControls: vi.fn(),
}));

// Mock GamepadManager
vi.mock('../../ui/controls/GamepadManager', () => {
  const MockGamepadManager = vi.fn(function (this: any) {
    this.setCallbacks = vi.fn();
    this.poll = vi.fn();
    this.isActive = vi.fn().mockReturnValue(false);
    this.isConnected = vi.fn().mockReturnValue(false);
    this.consumeLookDelta = vi.fn().mockReturnValue({ x: 0, y: 0 });
    this.getMovementVector = vi.fn().mockReturnValue({ x: 0, z: 0 });
    this.updateSensitivity = vi.fn();
    this.dispose = vi.fn();
  });
  return { GamepadManager: MockGamepadManager };
});

describe('InputManager', () => {
  let input: InputManager;
  let contextManager: InputContextManager;

  beforeEach(() => {
    // Reset the singleton so each test starts fresh
    (InputContextManager as any).instance = null;
    contextManager = InputContextManager.getInstance();

    input = new InputManager();
  });

  afterEach(() => {
    input.dispose();
    vi.restoreAllMocks();
  });

  // ---- Context-gated callbacks ----
  describe('gameplay context gating', () => {
    it('fires gameplay callbacks when context is gameplay', () => {
      const onJump = vi.fn();
      const onReload = vi.fn();
      input.setCallbacks({ onJump, onReload });
      contextManager.setContext('gameplay');

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      expect(onJump).toHaveBeenCalledTimes(1);

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
      expect(onReload).toHaveBeenCalledTimes(1);
    });

    it('blocks gameplay callbacks when context is menu', () => {
      const onJump = vi.fn();
      const onReload = vi.fn();
      input.setCallbacks({ onJump, onReload });
      contextManager.setContext('menu');

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
      expect(onJump).not.toHaveBeenCalled();
      expect(onReload).not.toHaveBeenCalled();
    });

    it('blocks gameplay callbacks when context is map', () => {
      const onJump = vi.fn();
      input.setCallbacks({ onJump });
      contextManager.setContext('map');

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      expect(onJump).not.toHaveBeenCalled();
    });

    it('blocks gameplay callbacks when context is modal', () => {
      const onJump = vi.fn();
      input.setCallbacks({ onJump });
      contextManager.setContext('modal');

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      expect(onJump).not.toHaveBeenCalled();
    });

    it('resumes gameplay callbacks after context returns to gameplay', () => {
      const onJump = vi.fn();
      input.setCallbacks({ onJump });

      contextManager.setContext('menu');
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      expect(onJump).not.toHaveBeenCalled();

      contextManager.setContext('gameplay');
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      expect(onJump).toHaveBeenCalledTimes(1);
    });

    it('gates onRunStart in non-gameplay context', () => {
      const onRunStart = vi.fn();
      input.setCallbacks({ onRunStart });
      contextManager.setContext('menu');

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
      expect(onRunStart).not.toHaveBeenCalled();
    });

    it('gates onEnterExitHelicopter', () => {
      const onEnterExitHelicopter = vi.fn();
      input.setCallbacks({ onEnterExitHelicopter });
      contextManager.setContext('modal');

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
      expect(onEnterExitHelicopter).not.toHaveBeenCalled();
    });

    it('gates onSquadCommand', () => {
      const onSquadCommand = vi.fn();
      input.setCallbacks({ onSquadCommand });
      contextManager.setContext('map');

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
      expect(onSquadCommand).not.toHaveBeenCalled();
    });
  });

  // ---- Escape / menu always fires ----
  describe('escape and menu callbacks bypass context gating', () => {
    it('fires onEscape in menu context', () => {
      const onEscape = vi.fn();
      input.setCallbacks({ onEscape });
      contextManager.setContext('menu');

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it('fires onEscape in map context', () => {
      const onEscape = vi.fn();
      input.setCallbacks({ onEscape });
      contextManager.setContext('map');

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it('fires onEscape in modal context', () => {
      const onEscape = vi.fn();
      input.setCallbacks({ onEscape });
      contextManager.setContext('modal');

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it('fires onEscape in gameplay context', () => {
      const onEscape = vi.fn();
      input.setCallbacks({ onEscape });
      contextManager.setContext('gameplay');

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it('fires onMenuPause regardless of context', () => {
      const onMenuPause = vi.fn();
      input.setCallbacks({ onMenuPause });
      contextManager.setContext('modal');

      // onMenuPause is wrapped as always-allowed in wrapCallbacks,
      // but the keydown for it originates from PlayerInput base class logic.
      // We verify the wrapped callback itself is not gated.
      const wrapped = (input as any).wrapCallbacks({ onMenuPause });
      wrapped.onMenuPause();
      expect(onMenuPause).toHaveBeenCalledTimes(1);
    });

    it('fires onMenuResume regardless of context', () => {
      const onMenuResume = vi.fn();
      input.setCallbacks({ onMenuResume });
      contextManager.setContext('map');

      const wrapped = (input as any).wrapCallbacks({ onMenuResume });
      wrapped.onMenuResume();
      expect(onMenuResume).toHaveBeenCalledTimes(1);
    });
  });

  // ---- isKeyPressed gating ----
  describe('isKeyPressed context gating', () => {
    it('returns true in gameplay context', () => {
      contextManager.setContext('gameplay');
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      expect(input.isKeyPressed('keyw')).toBe(true);
    });

    it('returns false in non-gameplay context even when key is held', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      contextManager.setContext('menu');
      expect(input.isKeyPressed('keyw')).toBe(false);
    });

    it('returns true again when context is restored to gameplay', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      contextManager.setContext('menu');
      expect(input.isKeyPressed('keyw')).toBe(false);
      contextManager.setContext('gameplay');
      expect(input.isKeyPressed('keyw')).toBe(true);
    });
  });

  // ---- Input mode tracking ----
  describe('input mode tracking', () => {
    it('defaults to keyboardMouse on desktop', () => {
      expect(input.getLastInputMode()).toBe('keyboardMouse');
    });

    it('tracks keyboard activity as keyboardMouse', () => {
      // Force mode to something else first so the change fires
      (input as any).lastMode = 'touch';

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
      expect(input.getLastInputMode()).toBe('keyboardMouse');
    });

    it('tracks mouse activity as keyboardMouse', () => {
      (input as any).lastMode = 'touch';

      document.dispatchEvent(new MouseEvent('mousemove'));
      expect(input.getLastInputMode()).toBe('keyboardMouse');
    });

    it('tracks touch activity as touch mode', () => {
      // Simulate a touchstart event
      document.dispatchEvent(new Event('touchstart'));
      expect(input.getLastInputMode()).toBe('touch');
    });

    it('tracks pointerdown activity as touch mode', () => {
      document.dispatchEvent(new PointerEvent('pointerdown'));
      expect(input.getLastInputMode()).toBe('touch');
    });

    it('fires mode change listener when mode switches', () => {
      const listener = vi.fn();
      input.onInputModeChange(listener);
      listener.mockClear();

      // Switch to touch
      document.dispatchEvent(new Event('touchstart'));
      expect(listener).toHaveBeenCalledWith('touch');
    });

    it('does not fire mode listener when mode stays the same', () => {
      const listener = vi.fn();
      input.onInputModeChange(listener);
      listener.mockClear();

      // keyboardMouse -> keyboardMouse (no change, should be silent)
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
      expect(listener).not.toHaveBeenCalled();
    });

    it('onInputModeChange invokes listener immediately with current mode', () => {
      const listener = vi.fn();
      input.onInputModeChange(listener);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('keyboardMouse');
    });

    it('onInputModeChange returns an unsubscribe function', () => {
      const listener = vi.fn();
      const unsub = input.onInputModeChange(listener);
      listener.mockClear();

      unsub();
      // Force a mode change
      document.dispatchEvent(new Event('touchstart'));
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple mode listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      input.onInputModeChange(listener1);
      input.onInputModeChange(listener2);
      listener1.mockClear();
      listener2.mockClear();

      document.dispatchEvent(new Event('touchstart'));
      expect(listener1).toHaveBeenCalledWith('touch');
      expect(listener2).toHaveBeenCalledWith('touch');
    });

    it('tracks gamepad mode via pollGamepad when gamepad is active', () => {
      const gamepadManager = (input as any).gamepadManager;
      if (!gamepadManager) return;

      gamepadManager.isActive.mockReturnValue(true);
      input.pollGamepad();
      expect(input.getLastInputMode()).toBe('gamepad');
    });

    it('does not switch to gamepad mode when gamepad is inactive', () => {
      const gamepadManager = (input as any).gamepadManager;
      if (!gamepadManager) return;

      gamepadManager.isActive.mockReturnValue(false);
      input.pollGamepad();
      expect(input.getLastInputMode()).toBe('keyboardMouse');
    });
  });

  // ---- setInputContext / getInputContext ----
  describe('setInputContext / getInputContext', () => {
    it('proxies setContext on the context manager', () => {
      input.setInputContext('map');
      expect(contextManager.getContext()).toBe('map');
      expect(input.getInputContext()).toBe('map');
    });

    it('proxies getContext on the context manager', () => {
      contextManager.setContext('modal');
      expect(input.getInputContext()).toBe('modal');
    });
  });

  // ---- Dispose ----
  describe('dispose', () => {
    it('removes keyboard activity listener', () => {
      const spy = vi.spyOn(document, 'removeEventListener');
      input.dispose();

      const removedTypes = spy.mock.calls.map((c) => c[0]);
      expect(removedTypes).toContain('keydown');
    });

    it('removes mousemove activity listener', () => {
      const spy = vi.spyOn(document, 'removeEventListener');
      input.dispose();

      const removedTypes = spy.mock.calls.map((c) => c[0]);
      expect(removedTypes).toContain('mousemove');
    });

    it('removes touchstart activity listener', () => {
      const spy = vi.spyOn(document, 'removeEventListener');
      input.dispose();

      const removedTypes = spy.mock.calls.map((c) => c[0]);
      expect(removedTypes).toContain('touchstart');
    });

    it('removes pointerdown activity listener', () => {
      const spy = vi.spyOn(document, 'removeEventListener');
      input.dispose();

      const removedTypes = spy.mock.calls.map((c) => c[0]);
      expect(removedTypes).toContain('pointerdown');
    });

    it('clears mode listeners', () => {
      const listener = vi.fn();
      input.onInputModeChange(listener);
      listener.mockClear();

      input.dispose();

      // After dispose, mode changes should not reach the listener
      // We manually trigger setLastMode to verify listener set was cleared
      (input as any).setLastMode('touch');
      expect(listener).not.toHaveBeenCalled();
    });

    it('calls super.dispose for base class cleanup', () => {
      const spy = vi.spyOn(document, 'removeEventListener');
      input.dispose();

      // Base class removes keydown, keyup, mousedown, mouseup, wheel, pointerlockchange, mousemove
      const removedTypes = spy.mock.calls.map((c) => c[0]);
      expect(removedTypes).toContain('keyup');
      expect(removedTypes).toContain('mousedown');
      expect(removedTypes).toContain('mouseup');
    });
  });

  // ---- wrapCallbacks coverage ----
  describe('wrapCallbacks gates parametric callbacks', () => {
    it('gates onWeaponSlotChange in non-gameplay context', () => {
      const onWeaponSlotChange = vi.fn();
      input.setCallbacks({ onWeaponSlotChange });
      contextManager.setContext('menu');

      const wrapped = (input as any).wrapCallbacks({ onWeaponSlotChange });
      wrapped.onWeaponSlotChange(2);
      expect(onWeaponSlotChange).not.toHaveBeenCalled();
    });

    it('allows onWeaponSlotChange in gameplay context', () => {
      const onWeaponSlotChange = vi.fn();
      contextManager.setContext('gameplay');

      const wrapped = (input as any).wrapCallbacks({ onWeaponSlotChange });
      wrapped.onWeaponSlotChange(2);
      expect(onWeaponSlotChange).toHaveBeenCalledWith(2);
    });

    it('gates onMouseDown in non-gameplay context', () => {
      const onMouseDown = vi.fn();
      contextManager.setContext('modal');

      const wrapped = (input as any).wrapCallbacks({ onMouseDown });
      wrapped.onMouseDown(0);
      expect(onMouseDown).not.toHaveBeenCalled();
    });

    it('gates onScoreboardToggle with parameter in non-gameplay context', () => {
      const onScoreboardToggle = vi.fn();
      contextManager.setContext('map');

      const wrapped = (input as any).wrapCallbacks({ onScoreboardToggle });
      wrapped.onScoreboardToggle(true);
      expect(onScoreboardToggle).not.toHaveBeenCalled();
    });

    it('allows onScoreboardToggle in gameplay context and forwards parameter', () => {
      const onScoreboardToggle = vi.fn();
      contextManager.setContext('gameplay');

      const wrapped = (input as any).wrapCallbacks({ onScoreboardToggle });
      wrapped.onScoreboardToggle(true);
      expect(onScoreboardToggle).toHaveBeenCalledWith(true);
    });

    it('allows onMouseUp in non-gameplay context (release callbacks bypass gating)', () => {
      const onMouseUp = vi.fn();
      contextManager.setContext('modal');

      const wrapped = (input as any).wrapCallbacks({ onMouseUp });
      wrapped.onMouseUp(0);
      expect(onMouseUp).toHaveBeenCalledWith(0);
    });

    it('allows onRunStop in non-gameplay context (release callbacks bypass gating)', () => {
      const onRunStop = vi.fn();
      contextManager.setContext('menu');

      const wrapped = (input as any).wrapCallbacks({ onRunStop });
      wrapped.onRunStop();
      expect(onRunStop).toHaveBeenCalledTimes(1);
    });

    it('handles undefined callbacks gracefully in runGameplay', () => {
      contextManager.setContext('gameplay');
      const wrapped = (input as any).wrapCallbacks({});
      // Should not throw when the callback is undefined
      expect(() => wrapped.onJump()).not.toThrow();
      expect(() => wrapped.onReload()).not.toThrow();
      expect(() => wrapped.onMouseDown(0)).not.toThrow();
    });
  });
});
