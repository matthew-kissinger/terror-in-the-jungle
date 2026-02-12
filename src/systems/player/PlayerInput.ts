import { Logger } from '../../utils/Logger';
import { SettingsManager } from '../../config/SettingsManager';
import { WeaponSlot } from './InventoryManager';
import { shouldUseTouchControls } from '../../utils/DeviceDetector';
import { TouchControls } from '../../ui/controls/TouchControls';

export interface InputCallbacks {
  onJump?: () => void;
  onRunStart?: () => void;
  onRunStop?: () => void;
  onEscape?: () => void;
  onScoreboardToggle?: (visible: boolean) => void;
  onScoreboardTap?: () => void;
  onEnterExitHelicopter?: () => void;
  onToggleAutoHover?: () => void;
  onToggleMouseControl?: () => void;
  onSandbagRotateLeft?: () => void;
  onSandbagRotateRight?: () => void;
  onRallyPointPlace?: () => void;
  onToggleMortarCamera?: () => void;
  onWeaponSlotChange?: (slot: WeaponSlot) => void;
  onMouseDown?: (button: number) => void;
  onMouseUp?: (button: number) => void;
  onReload?: () => void;
  onGrenadeSwitch?: () => void;
}

export class PlayerInput {
  private keys: Set<string> = new Set();
  private mouseMovement = { x: 0, y: 0 };
  private mouseResult = { x: 0, y: 0 }; // Cached return object to avoid per-frame allocation
  private isPointerLocked = false;
  private pointerLockEnabled = true;
  private gameStarted = false;
  private boundRequestPointerLock?: () => void;
  private boundOnKeyDown!: (event: KeyboardEvent) => void;
  private boundOnKeyUp!: (event: KeyboardEvent) => void;
  private boundOnPointerLockChange!: () => void;
  private boundOnMouseMove!: (event: MouseEvent) => void;
  private boundOnMouseDown!: (event: MouseEvent) => void;
  private boundOnMouseUp!: (event: MouseEvent) => void;
  private callbacks: InputCallbacks = {};
  private isControlsEnabled = true;
  private isInHelicopter = false;
  private currentWeaponMode: WeaponSlot = WeaponSlot.PRIMARY;

  /** Touch controls – only created on touch-capable devices */
  private touchControls: TouchControls | null = null;
  private readonly isTouchMode: boolean;

  /** Cached touch movement vector to avoid per-frame allocation */
  private touchMoveResult = { x: 0, z: 0 };

  constructor() {
    this.isTouchMode = shouldUseTouchControls();

    if (this.isTouchMode) {
      this.touchControls = new TouchControls();
      // Disable pointer lock on touch devices
      this.pointerLockEnabled = false;
      Logger.info('player', 'Touch device detected – touch controls enabled');

      // Initialize touch look sensitivity based on mouse sensitivity setting
      const rawMouseSensitivity = SettingsManager.getInstance().getMouseSensitivityRaw();
      const touchSensitivity = rawMouseSensitivity * 2; // Convert to touch range (approx 0.002-0.01)
      this.touchControls.look.setSensitivity(touchSensitivity);

      // Listen for changes to mouseSensitivity to update touch sensitivity
      SettingsManager.getInstance().onChange((key, value) => {
        if (key === 'mouseSensitivity' && this.touchControls) {
          const newRaw = SettingsManager.getInstance().getMouseSensitivityRaw();
          const newTouch = newRaw * 2;
          this.touchControls.look.setSensitivity(newTouch);
        }
      });
    }

    this.setupEventListeners();
  }

  setCallbacks(callbacks: InputCallbacks): void {
    this.callbacks = callbacks;

    // Wire touch controls to the same callbacks
    if (this.touchControls) {
      this.touchControls.setCallbacks({
        onFireStart: () => callbacks.onMouseDown?.(0),
        onFireStop: () => callbacks.onMouseUp?.(0),
        onJump: () => callbacks.onJump?.(),
        onReload: () => callbacks.onReload?.(),
        onGrenade: () => callbacks.onGrenadeSwitch?.(),
        onSprintStart: () => callbacks.onRunStart?.(),
        onSprintStop: () => callbacks.onRunStop?.(),
        onWeaponSelect: (slotIndex: number) => callbacks.onWeaponSlotChange?.(slotIndex as WeaponSlot),
        onADSToggle: (active: boolean) => {
          if (active) {
            callbacks.onMouseDown?.(2);
          } else {
            callbacks.onMouseUp?.(2);
          }
        },
        onScoreboardTap: () => callbacks.onScoreboardTap?.(),
        onEnterExitHelicopter: () => callbacks.onEnterExitHelicopter?.(),
        onSandbagRotateLeft: () => {
          const event = new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', bubbles: true });
          window.dispatchEvent(event);
        },
        onSandbagRotateRight: () => {
          const event = new KeyboardEvent('keydown', { code: 'KeyT', key: 't', bubbles: true });
          window.dispatchEvent(event);
        },
        onRallyPointPlace: () => {
          const event = new KeyboardEvent('keydown', { code: 'KeyV', key: 'v', bubbles: true });
          window.dispatchEvent(event);
        },
      });
    }
  }

  setControlsEnabled(enabled: boolean): void {
    this.isControlsEnabled = enabled;
    if (!enabled) {
      this.keys.clear();
    }
  }

  setPointerLockEnabled(enabled: boolean): void {
    this.pointerLockEnabled = enabled;

    if (!enabled) {
      if (this.boundRequestPointerLock) {
        document.removeEventListener('click', this.boundRequestPointerLock);
      }
      if (document.pointerLockElement === document.body) {
        document.exitPointerLock();
      }
    } else if (this.gameStarted && this.boundRequestPointerLock) {
      document.addEventListener('click', this.boundRequestPointerLock);
    }
  }

  setGameStarted(started: boolean): void {
    this.gameStarted = started;
    if (started && this.boundRequestPointerLock && this.pointerLockEnabled) {
      // Remove any existing listener first
      document.removeEventListener('click', this.boundRequestPointerLock);
      // Add click listener for pointer lock
      document.addEventListener('click', this.boundRequestPointerLock);
      Logger.info('player', ' Game started - click to enable mouse look');
    }

    // Show/hide touch controls when game starts/stops
    if (this.touchControls) {
      if (started) {
        this.touchControls.show();
        // Show rally point button when game starts (player is on foot)
        this.touchControls.rallyPointButton.showButton();
      } else {
        this.touchControls.hide();
      }
    }
  }

  setInHelicopter(inHelicopter: boolean): void {
    this.isInHelicopter = inHelicopter;
  }

  setCurrentWeaponMode(mode: WeaponSlot): void {
    this.currentWeaponMode = mode;
  }

  isKeyPressed(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  getMouseMovement(): { x: number; y: number } {
    this.mouseResult.x = this.mouseMovement.x;
    this.mouseResult.y = this.mouseMovement.y;

    // Add touch look delta on touch devices
    if (this.touchControls) {
      const touchDelta = this.touchControls.consumeLookDelta();
      this.mouseResult.x += touchDelta.x;
      this.mouseResult.y += touchDelta.y;
    }

    return this.mouseResult;
  }

  clearMouseMovement(): void {
    this.mouseMovement.x = 0;
    this.mouseMovement.y = 0;
  }

  getIsPointerLocked(): boolean {
    // On touch devices, always report as "locked" so camera updates apply
    if (this.isTouchMode && this.gameStarted) return true;
    return this.isPointerLocked;
  }

  /** Whether touch controls are active */
  getIsTouchMode(): boolean {
    return this.isTouchMode;
  }

  /** Touch controls instance (null on desktop) */
  getTouchControls(): TouchControls | null {
    return this.touchControls;
  }

  /**
   * Get touch joystick movement vector.
   * Returns {x, z} in [-1, 1] range, or {0, 0} on desktop / no input.
   */
  getTouchMovementVector(): { x: number; z: number } {
    if (!this.touchControls) {
      this.touchMoveResult.x = 0;
      this.touchMoveResult.z = 0;
    } else {
      const v = this.touchControls.getMovementVector();
      this.touchMoveResult.x = v.x;
      this.touchMoveResult.z = v.z;
    }
    return this.touchMoveResult;
  }

  private setupEventListeners(): void {
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);

    // Keyboard events
    document.addEventListener('keydown', this.boundOnKeyDown);
    document.addEventListener('keyup', this.boundOnKeyUp);

    // Mouse events
    document.addEventListener('pointerlockchange', this.boundOnPointerLockChange);
    document.addEventListener('mousemove', this.boundOnMouseMove);
    document.addEventListener('mousedown', this.boundOnMouseDown);
    document.addEventListener('mouseup', this.boundOnMouseUp);

    // Store bound function to avoid duplicate listeners
    this.boundRequestPointerLock = this.requestPointerLock.bind(this);

    // Instructions for user
    this.showControls();
  }

  dispose(): void {
    document.removeEventListener('keydown', this.boundOnKeyDown);
    document.removeEventListener('keyup', this.boundOnKeyUp);
    document.removeEventListener('mousedown', this.boundOnMouseDown);
    document.removeEventListener('mouseup', this.boundOnMouseUp);
    if (this.boundRequestPointerLock) {
      document.removeEventListener('click', this.boundRequestPointerLock);
    }
    document.removeEventListener('pointerlockchange', this.boundOnPointerLockChange);
    document.removeEventListener('mousemove', this.boundOnMouseMove);

    if (this.touchControls) {
      this.touchControls.dispose();
      this.touchControls = null;
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.isControlsEnabled) return;
    this.keys.add(event.code.toLowerCase());

    // Handle special keys
    if (event.code === 'Tab') {
      event.preventDefault();
      if (!event.repeat) {
        this.callbacks.onScoreboardToggle?.(true);
      }
    }

    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.callbacks.onRunStart?.();
    }

    if (event.code === 'Space') {
      if (this.isInHelicopter) {
        this.callbacks.onToggleAutoHover?.();
      } else {
        this.callbacks.onJump?.();
      }
    }

    if (event.code === 'Escape') {
      this.callbacks.onEscape?.();
    }

    // Handle helicopter entry/exit with E key
    if (event.code === 'KeyE') {
      this.callbacks.onEnterExitHelicopter?.();
    }

    // Helicopter-specific controls
    if (this.isInHelicopter) {
      // Engine boost already handled by Shift above

      // Toggle mouse control mode with Right Ctrl
      if (event.code === 'ControlRight') {
        this.callbacks.onToggleMouseControl?.();
      }
    }

    // Sandbag rotation controls (when not in helicopter)
    if (!this.isInHelicopter && this.currentWeaponMode === WeaponSlot.SANDBAG) {
      if (event.code === 'KeyR') {
        this.callbacks.onSandbagRotateLeft?.();
      } else if (event.code === 'KeyT') {
        this.callbacks.onSandbagRotateRight?.();
      }
    }

    // Rally point placement with V key (when not in helicopter)
    if (!this.isInHelicopter && event.code === 'KeyV') {
      this.callbacks.onRallyPointPlace?.();
    }

    // Mortar camera toggle with M key (when not in helicopter)
    if (!this.isInHelicopter && event.code === 'KeyM') {
      this.callbacks.onToggleMortarCamera?.();
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.code.toLowerCase());

    if (event.code === 'Tab') {
      event.preventDefault();
      this.callbacks.onScoreboardToggle?.(false);
    }

    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.callbacks.onRunStop?.();
    }
  }

  private requestPointerLock(): void {
    // Don't lock if controls are disabled (dead/respawning)
    if (!this.pointerLockEnabled) return;
    if (this.gameStarted && !this.isPointerLocked && this.isControlsEnabled) {
      document.body.requestPointerLock();
    }
  }

  private onPointerLockChange(): void {
    this.isPointerLocked = document.pointerLockElement === document.body;

    if (this.isPointerLocked) {
      Logger.info('player', 'Pointer locked - mouse look enabled');
    } else {
      Logger.info('player', 'Pointer lock released - click to re-enable mouse look');
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isPointerLocked) return;

    const sensitivity = SettingsManager.getInstance().getMouseSensitivityRaw();
    this.mouseMovement.x = event.movementX * sensitivity;
    this.mouseMovement.y = event.movementY * sensitivity;
  }

  private onMouseDown(event: MouseEvent): void {
    if (!this.isPointerLocked || !this.isControlsEnabled) return;
    this.callbacks.onMouseDown?.(event.button);
  }

  private onMouseUp(event: MouseEvent): void {
    if (!this.isPointerLocked || !this.isControlsEnabled) return;
    this.callbacks.onMouseUp?.(event.button);
  }

  private showControls(): void {
    const pointerLockHint = this.pointerLockEnabled
      ? 'Mouse - Look around (click to enable pointer lock)'
      : 'Mouse - Look around (pointer lock disabled)';
    Logger.info('player', `
 CONTROLS:
WASD - Move / Helicopter Controls (W/S = Collective, A/D = Yaw)
Arrow Keys - Helicopter Cyclic (↑↓ = Pitch, ←→ = Roll)
Shift - Run / Engine Boost (in helicopter)
Space - Jump / Toggle Auto-Hover (in helicopter)
Right Ctrl - Toggle Mouse Control Mode (helicopter: control vs free look)
E - Enter/Exit Helicopter
M - Toggle Mortar Camera View (when mortar deployed)
${pointerLockHint}
Escape - Release pointer lock / Exit helicopter
    `);
  }

  // Unlock mouse cursor for respawn UI
  unlockPointer(): void {
    if (document.pointerLockElement === document.body) {
      document.exitPointerLock();
    }
  }

  // Re-lock mouse cursor after respawn
  relockPointer(): void {
    if (this.gameStarted && this.pointerLockEnabled && !document.pointerLockElement) {
      // Small delay to avoid conflict with UI interaction
      setTimeout(() => {
        document.body.requestPointerLock();
      }, 100);
    }
  }
}
