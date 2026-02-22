/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GamepadManager, GamepadButton, GamepadAxis } from './GamepadManager';

// ---------- Mock helpers ----------

function mockButton(pressed = false, value?: number): GamepadButton_API {
  return { pressed, touched: pressed, value: value ?? (pressed ? 1 : 0) };
}

/** Build a fake Gamepad with given axes and button overrides. */
function buildGamepad(
  axes: number[] = [0, 0, 0, 0],
  buttonOverrides: Partial<Record<number, GamepadButton_API>> = {},
  index = 0,
): Gamepad {
  const buttons: GamepadButton_API[] = Array.from({ length: 17 }, () => mockButton());
  for (const [idx, btn] of Object.entries(buttonOverrides)) {
    buttons[Number(idx)] = btn;
  }
  return {
    axes,
    buttons,
    connected: true,
    id: 'Mock Controller',
    index,
    mapping: 'standard',
    timestamp: performance.now(),
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

// Type alias for the browser GamepadButton interface to avoid collision with our enum
type GamepadButton_API = { pressed: boolean; touched: boolean; value: number };

// ---------- GamepadEvent polyfill for jsdom ----------
if (typeof globalThis.GamepadEvent === 'undefined') {
  (globalThis as any).GamepadEvent = class GamepadEvent extends Event {
    readonly gamepad: Gamepad;
    constructor(type: string, init: { gamepad: Gamepad }) {
      super(type);
      this.gamepad = init.gamepad;
    }
  };
}

// ---------- navigator.getGamepads stub ----------

let gamepads: (Gamepad | null)[] = [null, null, null, null];

function setGamepad(gp: Gamepad | null, index = 0): void {
  gamepads[index] = gp;
}

// ---------- Tests ----------

describe('GamepadManager', () => {
  let mgr: GamepadManager;

  beforeEach(() => {
    gamepads = [null, null, null, null];
    // Define navigator.getGamepads if it doesn't exist (jsdom)
    if (typeof navigator.getGamepads !== 'function') {
      Object.defineProperty(navigator, 'getGamepads', {
        value: () => gamepads,
        writable: true,
        configurable: true,
      });
    }
    vi.spyOn(navigator, 'getGamepads').mockImplementation(() => gamepads as any);
    mgr = new GamepadManager();
  });

  it('starts inactive with no gamepad', () => {
    expect(mgr.isConnected()).toBe(false);
    expect(mgr.isActive()).toBe(false);
  });

  it('detects gamepad on connect event', () => {
    const gp = buildGamepad();
    setGamepad(gp);
    window.dispatchEvent(new GamepadEvent('gamepadconnected', { gamepad: gp }));

    expect(mgr.isConnected()).toBe(true);
    // Not active until input is received
    expect(mgr.isActive()).toBe(false);
  });

  it('goes inactive on disconnect', () => {
    const gp = buildGamepad();
    setGamepad(gp);
    window.dispatchEvent(new GamepadEvent('gamepadconnected', { gamepad: gp }));
    expect(mgr.isConnected()).toBe(true);

    setGamepad(null);
    window.dispatchEvent(new GamepadEvent('gamepaddisconnected', { gamepad: gp }));
    expect(mgr.isConnected()).toBe(false);
    expect(mgr.isActive()).toBe(false);
  });

  describe('sticks', () => {
    beforeEach(() => {
      const gp = buildGamepad();
      setGamepad(gp);
      window.dispatchEvent(new GamepadEvent('gamepadconnected', { gamepad: gp }));
    });

    it('left stick within dead zone returns zero', () => {
      setGamepad(buildGamepad([0.1, -0.1, 0, 0]));
      mgr.poll();
      const mv = mgr.getMovementVector();
      expect(mv.x).toBe(0);
      expect(mv.z).toBe(0);
    });

    it('left stick outside dead zone returns remapped value', () => {
      setGamepad(buildGamepad([0.8, 0, 0, 0]));
      mgr.poll();
      const mv = mgr.getMovementVector();
      expect(mv.x).toBeGreaterThan(0.5);
      expect(mv.z).toBe(0);
    });

    it('right stick accumulates look delta and becomes active', () => {
      setGamepad(buildGamepad([0, 0, 0.5, -0.3]));
      mgr.poll();
      expect(mgr.isActive()).toBe(true);
      const delta = mgr.consumeLookDelta();
      expect(delta.x).not.toBe(0);
      expect(delta.y).not.toBe(0);
    });

    it('consumeLookDelta resets after read', () => {
      setGamepad(buildGamepad([0, 0, 0.5, 0.5]));
      mgr.poll();
      mgr.consumeLookDelta();
      const second = mgr.consumeLookDelta();
      expect(second.x).toBe(0);
      expect(second.y).toBe(0);
    });
  });

  describe('buttons', () => {
    beforeEach(() => {
      const gp = buildGamepad();
      setGamepad(gp);
      window.dispatchEvent(new GamepadEvent('gamepadconnected', { gamepad: gp }));
      // First poll to set baseline button state
      mgr.poll();
    });

    it('fires onJump on A button press', () => {
      const cb = { onJump: vi.fn() };
      mgr.setCallbacks(cb);
      // Press A
      setGamepad(buildGamepad([0, 0, 0, 0], { [GamepadButton.A]: mockButton(true) }));
      mgr.poll();
      expect(cb.onJump).toHaveBeenCalledOnce();
    });

    it('does not re-fire on held button', () => {
      const cb = { onJump: vi.fn() };
      mgr.setCallbacks(cb);
      setGamepad(buildGamepad([0, 0, 0, 0], { [GamepadButton.A]: mockButton(true) }));
      mgr.poll();
      mgr.poll(); // second poll with same state
      expect(cb.onJump).toHaveBeenCalledOnce();
    });

    it('fires onReload on B button press', () => {
      const cb = { onReload: vi.fn() };
      mgr.setCallbacks(cb);
      setGamepad(buildGamepad([0, 0, 0, 0], { [GamepadButton.B]: mockButton(true) }));
      mgr.poll();
      expect(cb.onReload).toHaveBeenCalledOnce();
    });

    it('fires onGrenade on LB press', () => {
      const cb = { onGrenade: vi.fn() };
      mgr.setCallbacks(cb);
      setGamepad(buildGamepad([0, 0, 0, 0], { [GamepadButton.LB]: mockButton(true) }));
      mgr.poll();
      expect(cb.onGrenade).toHaveBeenCalledOnce();
    });

    it('fires sprint start/stop on RB press/release', () => {
      const cb = { onSprintStart: vi.fn(), onSprintStop: vi.fn() };
      mgr.setCallbacks(cb);

      // Press RB
      setGamepad(buildGamepad([0, 0, 0, 0], { [GamepadButton.RB]: mockButton(true) }));
      mgr.poll();
      expect(cb.onSprintStart).toHaveBeenCalledOnce();

      // Release RB
      setGamepad(buildGamepad([0, 0, 0, 0], { [GamepadButton.RB]: mockButton(false) }));
      mgr.poll();
      expect(cb.onSprintStop).toHaveBeenCalledOnce();
    });

    it('fires onEscape on Start button', () => {
      const cb = { onEscape: vi.fn() };
      mgr.setCallbacks(cb);
      setGamepad(buildGamepad([0, 0, 0, 0], { [GamepadButton.START]: mockButton(true) }));
      mgr.poll();
      expect(cb.onEscape).toHaveBeenCalledOnce();
    });

    it('fires weapon slot on D-pad press', () => {
      const cb = { onWeaponSlot: vi.fn() };
      mgr.setCallbacks(cb);

      setGamepad(buildGamepad([0, 0, 0, 0], { [GamepadButton.DPAD_UP]: mockButton(true) }));
      mgr.poll();
      expect(cb.onWeaponSlot).toHaveBeenCalledWith(0);

      // Release, then press right
      setGamepad(buildGamepad());
      mgr.poll();
      setGamepad(buildGamepad([0, 0, 0, 0], { [GamepadButton.DPAD_RIGHT]: mockButton(true) }));
      mgr.poll();
      expect(cb.onWeaponSlot).toHaveBeenCalledWith(1);
    });
  });

  describe('analog triggers', () => {
    beforeEach(() => {
      const gp = buildGamepad();
      setGamepad(gp);
      window.dispatchEvent(new GamepadEvent('gamepadconnected', { gamepad: gp }));
      mgr.poll();
    });

    it('fires onFireStart/Stop on RT analog trigger', () => {
      const cb = { onFireStart: vi.fn(), onFireStop: vi.fn() };
      mgr.setCallbacks(cb);

      // Pull RT past threshold
      setGamepad(buildGamepad([0, 0, 0, 0], {
        [GamepadButton.RT]: { pressed: true, touched: true, value: 0.8 },
      }));
      mgr.poll();
      expect(cb.onFireStart).toHaveBeenCalledOnce();

      // Release RT
      setGamepad(buildGamepad([0, 0, 0, 0], {
        [GamepadButton.RT]: { pressed: false, touched: false, value: 0 },
      }));
      mgr.poll();
      expect(cb.onFireStop).toHaveBeenCalledOnce();
    });

    it('fires onADSStart/Stop on LT analog trigger', () => {
      const cb = { onADSStart: vi.fn(), onADSStop: vi.fn() };
      mgr.setCallbacks(cb);

      setGamepad(buildGamepad([0, 0, 0, 0], {
        [GamepadButton.LT]: { pressed: true, touched: true, value: 0.9 },
      }));
      mgr.poll();
      expect(cb.onADSStart).toHaveBeenCalledOnce();

      setGamepad(buildGamepad([0, 0, 0, 0], {
        [GamepadButton.LT]: { pressed: false, touched: false, value: 0.1 },
      }));
      mgr.poll();
      expect(cb.onADSStop).toHaveBeenCalledOnce();
    });

    it('RT below threshold does not fire', () => {
      const cb = { onFireStart: vi.fn() };
      mgr.setCallbacks(cb);

      setGamepad(buildGamepad([0, 0, 0, 0], {
        [GamepadButton.RT]: { pressed: false, touched: true, value: 0.3 },
      }));
      mgr.poll();
      expect(cb.onFireStart).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('cleans up state on dispose', () => {
      const gp = buildGamepad();
      setGamepad(gp);
      window.dispatchEvent(new GamepadEvent('gamepadconnected', { gamepad: gp }));
      expect(mgr.isConnected()).toBe(true);

      mgr.dispose();
      expect(mgr.isConnected()).toBe(false);
    });
  });
});
