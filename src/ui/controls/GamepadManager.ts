/**
 * Gamepad input manager - polls the Gamepad API each frame.
 *
 * Standard mapping (Xbox / PS layout):
 *   Left stick  -> movement vector {x, z} in [-1, 1]
 *   Right stick -> look delta {x, y} (accumulated per frame)
 *   LT / L2     -> ADS
 *   RT / R2     -> Fire
 *   A / Cross   -> Jump
 *   B / Circle  -> Reload
 *   X / Square  -> Interact (E)
 *   Y / Triangle-> Switch weapon
 *   LB / L1     -> Grenade
 *   RB / R1     -> Sprint (held)
 *   D-pad       -> Weapon slots 1-4
 *   Start       -> Menu / Escape
 *   Back/Select -> Scoreboard
 *   L3          -> Sprint toggle
 *   R3          -> Squad command
 *
 * The manager tracks per-frame button edges (justPressed / justReleased) so
 * callbacks fire exactly once per press and release.
 */

import { SettingsManager } from '../../config/SettingsManager';

// Standard Gamepad button indices
export const enum GamepadButton {
  A = 0,
  B = 1,
  X = 2,
  Y = 3,
  LB = 4,
  RB = 5,
  LT = 6,
  RT = 7,
  BACK = 8,
  START = 9,
  L3 = 10,
  R3 = 11,
  DPAD_UP = 12,
  DPAD_DOWN = 13,
  DPAD_LEFT = 14,
  DPAD_RIGHT = 15,
}

// Standard Gamepad axis indices
export const enum GamepadAxis {
  LEFT_X = 0,
  LEFT_Y = 1,
  RIGHT_X = 2,
  RIGHT_Y = 3,
}

export interface GamepadCallbacks {
  onJump?: () => void;
  onReload?: () => void;
  onInteract?: () => void;
  onWeaponSwitch?: () => void;
  onGrenade?: () => void;
  onSprintStart?: () => void;
  onSprintStop?: () => void;
  onFireStart?: () => void;
  onFireStop?: () => void;
  onADSStart?: () => void;
  onADSStop?: () => void;
  onEscape?: () => void;
  onScoreboardToggle?: (visible: boolean) => void;
  onSquadCommand?: () => void;
  onWeaponSlot?: (slot: number) => void;
  onSquadQuickCommand?: (slot: number) => void;
}

export class GamepadManager {
  private gamepadIndex: number | null = null;
  private prevButtons: boolean[] = [];
  private callbacks: GamepadCallbacks = {};

  /** Accumulated right-stick look delta since last consume */
  private lookDelta = { x: 0, y: 0 };

  /** Cached movement vector (left stick) */
  private moveVector = { x: 0, z: 0 };

  /** Whether any gamepad input has been received this session */
  private hasReceivedInput = false;

  /** Stick dead zones (fraction of axis range, 0-1). Movements below these are zeroed. */
  private moveDeadZone = 0.15;
  private lookDeadZone = 0.15;

  /** Right-stick sensitivity - radians per unit per poll. */
  private lookSensitivity = 0.04;

  /** Non-linear exponent for right stick. <1 = sub-linear (precision aim). */
  private lookExponent = 0.85;

  /** Southpaw swaps movement and look sticks. */
  private useSouthpaw = false;

  /** Invert vertical look axis for controller right stick. */
  private invertLookY = false;

  /** D-pad behavior mode from settings. */
  private dpadMode: 'weapons' | 'quickCommands' = 'weapons';

  /** Sprint is held via RB, not toggled */
  private isSprinting = false;

  /** Trigger threshold for fire/ADS (analog triggers on Xbox/PS) */
  private readonly TRIGGER_THRESHOLD = 0.5;

  /** Previous trigger states (for edge detection on analog triggers) */
  private prevRT = false;
  private prevLT = false;

  constructor() {
    // Listen for connect/disconnect
    window.addEventListener('gamepadconnected', this.onConnected);
    window.addEventListener('gamepaddisconnected', this.onDisconnected);

    // Check if a gamepad is already connected (guard for envs without Gamepad API)
    if (typeof navigator.getGamepads === 'function') {
      const gamepads = navigator.getGamepads();
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
          this.gamepadIndex = i;
          this.initButtonState(gamepads[i]!);
          break;
        }
      }
    }
    this.loadControllerSettings();
  }

  setCallbacks(callbacks: GamepadCallbacks): void {
    this.callbacks = callbacks;
  }

  /** Returns true if a gamepad is connected and has provided input */
  isActive(): boolean {
    return this.gamepadIndex !== null && this.hasReceivedInput;
  }

  /** Returns true if a gamepad is connected (regardless of input) */
  isConnected(): boolean {
    return this.gamepadIndex !== null;
  }

  /**
   * Poll the gamepad and process input. Call once per frame.
   * Must be called before reading moveVector or consuming lookDelta.
   */
  poll(): void {
    if (this.gamepadIndex === null) return;
    if (typeof navigator.getGamepads !== 'function') return;
    this.loadControllerSettings();

    const gamepads = navigator.getGamepads();
    const gp = gamepads[this.gamepadIndex];
    if (!gp) {
      this.gamepadIndex = null;
      return;
    }

    // --- Sticks ---
    this.processSticks(gp);

    // --- Buttons ---
    this.processButtons(gp);
  }

  /** Left stick movement vector. {x, z} in [-1, 1]. */
  getMovementVector(): { x: number; z: number } {
    return this.moveVector;
  }

  /** Read and clear right-stick look delta. */
  consumeLookDelta(): { x: number; y: number } {
    const x = this.lookDelta.x;
    const y = this.lookDelta.y;
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    return { x, y };
  }

  /** Update look sensitivity from settings */
  updateSensitivity(): void {
    this.lookSensitivity = SettingsManager.getInstance().getMouseSensitivityRaw() * 14;
    this.loadControllerSettings();
  }
  private loadControllerSettings(): void {
    const settings = SettingsManager.getInstance();
    this.moveDeadZone = settings.getControllerMoveDeadZoneRaw();
    this.lookDeadZone = settings.getControllerLookDeadZoneRaw();
    this.lookExponent = settings.get('controllerLookCurve') === 'linear' ? 1.0 : 0.85;
    this.useSouthpaw = settings.get('controllerPreset') === 'southpaw';
    this.invertLookY = settings.get('controllerInvertY');
    this.dpadMode = settings.get('controllerDpadMode');
  }


  dispose(): void {
    window.removeEventListener('gamepadconnected', this.onConnected);
    window.removeEventListener('gamepaddisconnected', this.onDisconnected);
    this.gamepadIndex = null;
    this.prevButtons = [];
  }

  // --- Private ---

  private onConnected = (e: GamepadEvent): void => {
    if (this.gamepadIndex !== null) return; // Already have one
    this.gamepadIndex = e.gamepad.index;
    this.initButtonState(e.gamepad);
  };

  private onDisconnected = (e: GamepadEvent): void => {
    if (e.gamepad.index === this.gamepadIndex) {
      this.gamepadIndex = null;
      this.prevButtons = [];
      this.moveVector.x = 0;
      this.moveVector.z = 0;
      this.lookDelta.x = 0;
      this.lookDelta.y = 0;
      this.hasReceivedInput = false;

      // Release sprint if held
      if (this.isSprinting) {
        this.isSprinting = false;
        this.callbacks.onSprintStop?.();
      }
    }
  };

  private initButtonState(gp: Gamepad): void {
    this.prevButtons = new Array(gp.buttons.length);
    for (let i = 0; i < gp.buttons.length; i++) {
      this.prevButtons[i] = gp.buttons[i].pressed;
    }
    this.prevRT = gp.buttons[GamepadButton.RT]?.value > this.TRIGGER_THRESHOLD;
    this.prevLT = gp.buttons[GamepadButton.LT]?.value > this.TRIGGER_THRESHOLD;
  }

  private applyDeadZone(value: number, deadZone: number): number {
    const abs = Math.abs(value);
    if (abs < deadZone) return 0;
    // Remap from [deadZone, 1] -> [0, 1] preserving sign
    const remapped = (abs - deadZone) / (1 - deadZone);
    return Math.sign(value) * remapped;
  }

  private processSticks(gp: Gamepad): void {
    const movementAxisX = this.useSouthpaw ? GamepadAxis.RIGHT_X : GamepadAxis.LEFT_X;
    const movementAxisY = this.useSouthpaw ? GamepadAxis.RIGHT_Y : GamepadAxis.LEFT_Y;
    const lookAxisX = this.useSouthpaw ? GamepadAxis.LEFT_X : GamepadAxis.RIGHT_X;
    const lookAxisY = this.useSouthpaw ? GamepadAxis.LEFT_Y : GamepadAxis.RIGHT_Y;

    // Movement stick -> movement
    const lx = this.applyDeadZone(gp.axes[movementAxisX] ?? 0, this.moveDeadZone);
    const ly = this.applyDeadZone(gp.axes[movementAxisY] ?? 0, this.moveDeadZone);
    this.moveVector.x = lx;
    this.moveVector.z = ly; // Forward on stick (negative Y) maps to -z in game

    // Look stick -> look delta
    const rx = this.applyDeadZone(gp.axes[lookAxisX] ?? 0, this.lookDeadZone);
    const ryInput = this.applyDeadZone(gp.axes[lookAxisY] ?? 0, this.lookDeadZone);
    const ry = this.invertLookY ? -ryInput : ryInput;

    if (rx !== 0 || ry !== 0) {
      this.hasReceivedInput = true;

      // Apply non-linear curve for precision
      const mag = Math.sqrt(rx * rx + ry * ry);
      let scaledMag = mag;
      if (this.lookExponent !== 1.0 && mag > 0) {
        scaledMag = Math.pow(mag, this.lookExponent);
      }
      const factor = mag > 0 ? (scaledMag / mag) : 0;

      this.lookDelta.x += rx * factor * this.lookSensitivity;
      this.lookDelta.y += ry * factor * this.lookSensitivity;
    }

    // Mark active on stick movement
    if (lx !== 0 || ly !== 0) {
      this.hasReceivedInput = true;
    }
  }

  private processButtons(gp: Gamepad): void {
    const btns = gp.buttons;

    // Edge detection helper
    const justPressed = (idx: number): boolean => {
      const pressed = btns[idx]?.pressed ?? false;
      const was = this.prevButtons[idx] ?? false;
      return pressed && !was;
    };
    const justReleased = (idx: number): boolean => {
      const pressed = btns[idx]?.pressed ?? false;
      const was = this.prevButtons[idx] ?? false;
      return !pressed && was;
    };

    // Mark active on any button press
    for (let i = 0; i < btns.length; i++) {
      if (btns[i]?.pressed) {
        this.hasReceivedInput = true;
        break;
      }
    }

    // --- Fire (RT) - analog trigger with threshold ---
    const rtActive = (btns[GamepadButton.RT]?.value ?? 0) > this.TRIGGER_THRESHOLD;
    if (rtActive && !this.prevRT) {
      this.callbacks.onFireStart?.();
    } else if (!rtActive && this.prevRT) {
      this.callbacks.onFireStop?.();
    }
    this.prevRT = rtActive;

    // --- ADS (LT) - analog trigger with threshold ---
    const ltActive = (btns[GamepadButton.LT]?.value ?? 0) > this.TRIGGER_THRESHOLD;
    if (ltActive && !this.prevLT) {
      this.callbacks.onADSStart?.();
    } else if (!ltActive && this.prevLT) {
      this.callbacks.onADSStop?.();
    }
    this.prevLT = ltActive;

    // --- Face buttons ---
    if (justPressed(GamepadButton.A)) this.callbacks.onJump?.();
    if (justPressed(GamepadButton.B)) this.callbacks.onReload?.();
    if (justPressed(GamepadButton.X)) this.callbacks.onInteract?.();
    if (justPressed(GamepadButton.Y)) this.callbacks.onWeaponSwitch?.();

    // --- Bumpers ---
    if (justPressed(GamepadButton.LB)) this.callbacks.onGrenade?.();

    // RB = Sprint (held)
    if (justPressed(GamepadButton.RB)) {
      if (!this.isSprinting) {
        this.isSprinting = true;
        this.callbacks.onSprintStart?.();
      }
    }
    if (justReleased(GamepadButton.RB)) {
      if (this.isSprinting) {
        this.isSprinting = false;
        this.callbacks.onSprintStop?.();
      }
    }

    // L3 = Sprint toggle (alternative)
    if (justPressed(GamepadButton.L3)) {
      this.isSprinting = !this.isSprinting;
      if (this.isSprinting) {
        this.callbacks.onSprintStart?.();
      } else {
        this.callbacks.onSprintStop?.();
      }
    }

    // R3 = Squad command
    if (justPressed(GamepadButton.R3)) this.callbacks.onSquadCommand?.();

    // --- Meta ---
    if (justPressed(GamepadButton.START)) this.callbacks.onEscape?.();
    if (justPressed(GamepadButton.BACK)) this.callbacks.onScoreboardToggle?.(true);
    if (justReleased(GamepadButton.BACK)) this.callbacks.onScoreboardToggle?.(false);

    // --- D-pad -> configurable (weapon slots or squad quick commands) ---
    if (justPressed(GamepadButton.DPAD_UP)) {
      if (this.dpadMode === 'quickCommands') this.callbacks.onSquadQuickCommand?.(1);
      else this.callbacks.onWeaponSlot?.(0);
    }
    if (justPressed(GamepadButton.DPAD_RIGHT)) {
      if (this.dpadMode === 'quickCommands') this.callbacks.onSquadQuickCommand?.(2);
      else this.callbacks.onWeaponSlot?.(1);
    }
    if (justPressed(GamepadButton.DPAD_DOWN)) {
      if (this.dpadMode === 'quickCommands') this.callbacks.onSquadQuickCommand?.(3);
      else this.callbacks.onWeaponSlot?.(2);
    }
    if (justPressed(GamepadButton.DPAD_LEFT)) {
      if (this.dpadMode === 'quickCommands') this.callbacks.onSquadQuickCommand?.(4);
      else this.callbacks.onWeaponSlot?.(3);
    }

    // Update previous button state
    for (let i = 0; i < btns.length; i++) {
      this.prevButtons[i] = btns[i]?.pressed ?? false;
    }
  }
}
