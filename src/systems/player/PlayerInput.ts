import { Logger } from '../../utils/Logger';
import { SettingsManager } from '../../config/SettingsManager';
import { WeaponSlot } from './InventoryManager';

export interface InputCallbacks {
  onJump?: () => void;
  onRunStart?: () => void;
  onRunStop?: () => void;
  onEscape?: () => void;
  onScoreboardToggle?: (visible: boolean) => void;
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

  constructor() {
    this.setupEventListeners();
  }

  setCallbacks(callbacks: InputCallbacks): void {
    this.callbacks = callbacks;
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
    return this.mouseResult;
  }

  clearMouseMovement(): void {
    this.mouseMovement.x = 0;
    this.mouseMovement.y = 0;
  }

  getIsPointerLocked(): boolean {
    return this.isPointerLocked;
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
