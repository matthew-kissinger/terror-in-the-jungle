import { Logger } from '../../utils/Logger';
import { SettingsManager } from '../../config/SettingsManager';
import { WeaponSlot } from './InventoryManager';
import { shouldUseTouchControls, isTouchDevice } from '../../utils/DeviceDetector';
import { TouchControls } from '../../ui/controls/TouchControls';
import { GamepadManager } from '../../ui/controls/GamepadManager';

export type FlightVehicleMode = 'none' | 'helicopter' | 'plane';

export interface InputCallbacks {
  onJump?: () => void;
  onRunStart?: () => void;
  onRunStop?: () => void;
  onEscape?: () => void;
  onScoreboardToggle?: (visible: boolean) => void;
  onScoreboardTap?: () => void;
  onEnterExitVehicle?: () => void;
  onEnterExitHelicopter?: () => void;
  onToggleFlightAssist?: () => void;
  onToggleAutoHover?: () => void;
  onToggleAltitudeLock?: () => void;
  onToggleMouseControl?: () => void;
  onSandbagRotateLeft?: () => void;
  onSandbagRotateRight?: () => void;
  onRallyPointPlace?: () => void;
  onMapToggle?: () => void;
  onToggleMortarCamera?: () => void;
  onDeployMortar?: () => void;
  onMortarFire?: () => void;
  onMortarAdjustPitch?: (delta: number) => void;
  onMortarAdjustYaw?: (delta: number) => void;
  onWeaponSlotChange?: (slot: WeaponSlot) => void;
  onMouseDown?: (button: number) => void;
  onMouseUp?: (button: number) => void;
  onReload?: () => void;
  onGrenadeSwitch?: () => void;
  onSquadDeploy?: () => void;
  onSquadCommand?: () => void;
  onSquadQuickCommand?: (slot: number) => void;
  onHelicopterWeaponSwitch?: (index: number) => void;
  onAirSupportMenu?: () => void;
  onMenuOpen?: () => void;
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
  private boundOnWheel!: (event: WheelEvent) => void;
  private callbacks: InputCallbacks = {};
  private isControlsEnabled = true;
  private flightVehicleMode: FlightVehicleMode = 'none';
  private currentWeaponMode: WeaponSlot = WeaponSlot.PRIMARY;

  /** Touch controls - only created on touch-capable devices */
  private touchControls: TouchControls | null = null;
  private readonly isTouchMode: boolean;

  /** Gamepad manager - created on all non-touch devices */
  private gamepadManager: GamepadManager | null = null;

  /** Cached touch movement vector to avoid per-frame allocation */
  private touchMoveResult = { x: 0, z: 0 };

  constructor() {
    this.isTouchMode = shouldUseTouchControls();

    if (this.isTouchMode) {
      this.touchControls = new TouchControls();
      // Disable pointer lock on touch devices
      this.pointerLockEnabled = false;
      Logger.info('player', 'Touch device detected – touch controls enabled');

      // Initialize touch look sensitivity from dedicated touch sensitivity setting
      const touchSensitivity = SettingsManager.getInstance().getTouchSensitivityRaw();
      this.touchControls.look.setSensitivity(touchSensitivity);

      // Listen for changes to touchSensitivity
      SettingsManager.getInstance().onChange((key) => {
        if (key === 'touchSensitivity' && this.touchControls) {
          const newRaw = SettingsManager.getInstance().getTouchSensitivityRaw();
          this.touchControls.look.setSensitivity(newRaw);
        }
      });
    }

    // Gamepad support on all platforms (touch or desktop)
    this.gamepadManager = new GamepadManager();
    this.gamepadManager.updateSensitivity();

    // Sync gamepad sensitivity when mouse sensitivity changes
    SettingsManager.getInstance().onChange((key) => {
      if (key === 'mouseSensitivity' && this.gamepadManager) {
        this.gamepadManager.updateSensitivity();
      }
    });

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
        onEnterExitVehicle: () => (callbacks.onEnterExitVehicle ?? callbacks.onEnterExitHelicopter)?.(),
        onSandbagRotateLeft: () => callbacks.onSandbagRotateLeft?.(),
        onSandbagRotateRight: () => callbacks.onSandbagRotateRight?.(),
        onRallyPointPlace: () => callbacks.onRallyPointPlace?.(),
        onMapToggle: () => callbacks.onMapToggle?.(),
        onSquadCommand: () => callbacks.onSquadCommand?.(),
        onMenuOpen: () => callbacks.onMenuOpen?.(),
        onToggleFlightAssist: () => (callbacks.onToggleFlightAssist ?? callbacks.onToggleAutoHover)?.(),
        onVehicleFireStart: () => callbacks.onMouseDown?.(0),
        onVehicleFireStop: () => callbacks.onMouseUp?.(0),
        onHelicopterWeaponSwitch: (index: number) => callbacks.onHelicopterWeaponSwitch?.(index),
      });
    }

    // Wire gamepad to the same callbacks
    if (this.gamepadManager) {
      this.gamepadManager.setCallbacks({
        onJump: () => callbacks.onJump?.(),
        onReload: () => callbacks.onReload?.(),
        onInteract: () => (callbacks.onEnterExitVehicle ?? callbacks.onEnterExitHelicopter)?.(),
        onWeaponSwitch: () => {
          // Cycle through weapons: primary -> secondary -> throwable
          const next = ((this.currentWeaponMode + 1) % 3) as WeaponSlot;
          callbacks.onWeaponSlotChange?.(next);
        },
        onGrenade: () => callbacks.onGrenadeSwitch?.(),
        onSprintStart: () => callbacks.onRunStart?.(),
        onSprintStop: () => callbacks.onRunStop?.(),
        onFireStart: () => callbacks.onMouseDown?.(0),
        onFireStop: () => callbacks.onMouseUp?.(0),
        onADSStart: () => callbacks.onMouseDown?.(2),
        onADSStop: () => callbacks.onMouseUp?.(2),
        onEscape: () => callbacks.onEscape?.(),
        onScoreboardToggle: (visible: boolean) => callbacks.onScoreboardToggle?.(visible),
        onSquadCommand: () => callbacks.onSquadCommand?.(),
        onWeaponSlot: (slot: number) => callbacks.onWeaponSlotChange?.(slot as WeaponSlot),
        onSquadQuickCommand: (slot: number) => callbacks.onSquadQuickCommand?.(slot),
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
    // Never re-enable pointer lock on touch devices - pointer lock freezes
    // clientX/clientY to 0,0 (per W3C spec), breaking all joystick input.
    if (enabled && this.isTouchMode) return;

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
    this.flightVehicleMode = inHelicopter ? 'helicopter' : 'none';
  }

  setFlightVehicleMode(mode: FlightVehicleMode): void {
    this.flightVehicleMode = mode;
  }

  setCurrentWeaponMode(mode: WeaponSlot): void {
    this.currentWeaponMode = mode;
  }

  isKeyPressed(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  /** Poll the gamepad once per frame. Must be called before reading movement/look. */
  pollGamepad(): void {
    if (this.gamepadManager) {
      this.gamepadManager.poll();
    }
  }

  /** Whether a gamepad is connected and actively providing input */
  isGamepadActive(): boolean {
    return this.gamepadManager?.isActive() ?? false;
  }

  /** The GamepadManager instance (null if not created) */
  getGamepadManager(): GamepadManager | null {
    return this.gamepadManager;
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

    // Add gamepad right-stick look delta
    if (this.gamepadManager?.isActive()) {
      const gpDelta = this.gamepadManager.consumeLookDelta();
      this.mouseResult.x += gpDelta.x;
      this.mouseResult.y += gpDelta.y;
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
    // On gamepad, always report as "locked" so right-stick look works
    if (this.gamepadManager?.isActive() && this.gameStarted) return true;
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
   * Get analog movement vector from touch joystick or gamepad left stick.
   * Returns {x, z} in [-1, 1] range, or {0, 0} when no analog input.
   */
  getTouchMovementVector(): { x: number; z: number } {
    // Touch joystick takes priority
    if (this.touchControls) {
      const v = this.touchControls.getMovementVector();
      this.touchMoveResult.x = v.x;
      this.touchMoveResult.z = v.z;
      // If touch is providing input, use it
      if (Math.abs(v.x) > 0.01 || Math.abs(v.z) > 0.01) {
        return this.touchMoveResult;
      }
    }

    // Fall through to gamepad left stick
    if (this.gamepadManager?.isActive()) {
      const gv = this.gamepadManager.getMovementVector();
      this.touchMoveResult.x = gv.x;
      this.touchMoveResult.z = gv.z;
      return this.touchMoveResult;
    }

    this.touchMoveResult.x = 0;
    this.touchMoveResult.z = 0;
    return this.touchMoveResult;
  }

  /**
   * Get touch helicopter cyclic input.
   * Returns {pitch, roll} in [-1, 1] range, or {0, 0} on desktop / no input.
   */
  getTouchCyclicInput(): { pitch: number; roll: number } {
    if (!this.touchControls) {
      return { pitch: 0, roll: 0 };
    }
    return this.touchControls.helicopterCyclic.getCyclicInput();
  }

  getTouchFlightCyclicInput(): { pitch: number; roll: number } {
    return this.getTouchCyclicInput();
  }

  private setupEventListeners(): void {
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);

    // Keyboard events
    document.addEventListener('keydown', this.boundOnKeyDown);
    document.addEventListener('keyup', this.boundOnKeyUp);

    // Mouse events
    document.addEventListener('pointerlockchange', this.boundOnPointerLockChange);
    document.addEventListener('mousemove', this.boundOnMouseMove);
    document.addEventListener('mousedown', this.boundOnMouseDown);
    document.addEventListener('mouseup', this.boundOnMouseUp);
    document.addEventListener('wheel', this.boundOnWheel, { passive: false });

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
    document.removeEventListener('wheel', this.boundOnWheel);
    if (this.boundRequestPointerLock) {
      document.removeEventListener('click', this.boundRequestPointerLock);
    }
    document.removeEventListener('pointerlockchange', this.boundOnPointerLockChange);
    document.removeEventListener('mousemove', this.boundOnMouseMove);

    if (this.touchControls) {
      this.touchControls.dispose();
      this.touchControls = null;
    }

    if (this.gamepadManager) {
      this.gamepadManager.dispose();
      this.gamepadManager = null;
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
      if (this.isInFlightVehicle()) {
        (this.callbacks.onToggleFlightAssist ?? this.callbacks.onToggleAutoHover)?.();
      } else {
        this.callbacks.onJump?.();
      }
    }

    if (event.code === 'Escape') {
      this.callbacks.onEscape?.();
    }

    // Handle vehicle entry/exit with E key
    if (event.code === 'KeyE') {
      (this.callbacks.onEnterExitVehicle ?? this.callbacks.onEnterExitHelicopter)?.();
    }

    // Flight-vehicle controls
    if (this.isInFlightVehicle()) {
      // Toggle mouse control mode with Right Ctrl
      if (event.code === 'ControlRight') {
        this.callbacks.onToggleMouseControl?.();
      }
    }

    // Helicopter-specific controls
    if (this.isInHelicopterMode()) {
      // Squad deploy from helicopter with G key
      if (event.code === 'KeyG') {
        this.callbacks.onSquadDeploy?.();
      }

      // Altitude lock with H key
      if (event.code === 'KeyH') {
        this.callbacks.onToggleAltitudeLock?.();
      }

      // Weapon switching with 1/2 keys
      if (event.code === 'Digit1') {
        this.callbacks.onHelicopterWeaponSwitch?.(0);
      } else if (event.code === 'Digit2') {
        this.callbacks.onHelicopterWeaponSwitch?.(1);
      }
    }

    // Sandbag rotation controls (when not in a flight vehicle)
    if (!this.isInFlightVehicle() && this.currentWeaponMode === WeaponSlot.SANDBAG) {
      if (event.code === 'KeyR') {
        this.callbacks.onSandbagRotateLeft?.();
      } else if (event.code === 'KeyT') {
        this.callbacks.onSandbagRotateRight?.();
      }
    }

    // Reload with R key (when not rotating sandbag)
    if (!this.isInFlightVehicle() && this.currentWeaponMode !== WeaponSlot.SANDBAG && event.code === 'KeyR') {
      this.callbacks.onReload?.();
    }

    // Air support menu with T key (when not in a flight vehicle and not in sandbag mode)
    if (!this.isInFlightVehicle() && this.currentWeaponMode !== WeaponSlot.SANDBAG && event.code === 'KeyT') {
      this.callbacks.onAirSupportMenu?.();
    }

    // Rally point placement with V key (when not in a flight vehicle)
    if (!this.isInFlightVehicle() && event.code === 'KeyV') {
      this.callbacks.onRallyPointPlace?.();
    }

    if (event.code === 'KeyM' && this.isTouchMode) {
      this.callbacks.onMapToggle?.();
    }

    // Mortar camera toggle with M key (when not in a flight vehicle)
    if (!this.isInFlightVehicle() && event.code === 'KeyM' && !this.isTouchMode) {
      this.callbacks.onToggleMortarCamera?.();
    }

    // Mortar deploy/undeploy with B key (when not in a flight vehicle)
    if (!this.isInFlightVehicle() && event.code === 'KeyB') {
      this.callbacks.onDeployMortar?.();
    }

    // Mortar fire with F key (when not in a flight vehicle)
    if (!this.isInFlightVehicle() && event.code === 'KeyF') {
      this.callbacks.onMortarFire?.();
    }

    // Mortar aiming with arrow keys (when not in a flight vehicle)
    if (!this.isInFlightVehicle()) {
      if (event.code === 'ArrowUp') {
        this.callbacks.onMortarAdjustPitch?.(1);
      } else if (event.code === 'ArrowDown') {
        this.callbacks.onMortarAdjustPitch?.(-1);
      } else if (event.code === 'ArrowLeft') {
        this.callbacks.onMortarAdjustYaw?.(-1);
      } else if (event.code === 'ArrowRight') {
        this.callbacks.onMortarAdjustYaw?.(1);
      }
    }

    // Squad command menu (infantry + helicopter — digit 1/2 are heli weapons without Shift)
    if (event.code === 'KeyZ') {
      this.callbacks.onSquadCommand?.();
    }

    // Squad quick commands (Shift+1..5; helicopter digital weapons use plain 1/2 above)
    if (event.shiftKey) {
      if (event.code === 'Digit1') {
        this.callbacks.onSquadQuickCommand?.(1);
      } else if (event.code === 'Digit2') {
        this.callbacks.onSquadQuickCommand?.(2);
      } else if (event.code === 'Digit3') {
        this.callbacks.onSquadQuickCommand?.(3);
      } else if (event.code === 'Digit4') {
        this.callbacks.onSquadQuickCommand?.(4);
      } else if (event.code === 'Digit5') {
        this.callbacks.onSquadQuickCommand?.(5);
      }
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

    // KeyZ handled on keydown only to enforce one action per press.
  }

  private requestPointerLock(): void {
    // Never lock on touch devices (belt-and-suspenders with setPointerLockEnabled guard)
    if (this.isTouchMode) return;
    // Don't lock if controls are disabled (dead/respawning)
    if (!this.pointerLockEnabled) return;
    if (this.gameStarted && !this.isPointerLocked && this.isControlsEnabled) {
      // requestPointerLock returns a Promise; catch rejection when document
      // state doesn't allow locking (e.g. not focused, embedded iframe).
      Promise.resolve(document.body.requestPointerLock()).catch(() => {});
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

  private onWheel(event: WheelEvent): void {
    if (!this.isControlsEnabled || this.isInFlightVehicle()) return;

    // Only handle wheel for mortar pitch adjustment if mortar is deployed
    // The callback will check if mortar is deployed before applying
    const delta = event.deltaY > 0 ? -0.5 : 0.5; // Scroll down = decrease pitch, scroll up = increase pitch
    this.callbacks.onMortarAdjustPitch?.(delta);

    // Only prevent default if the callback consumed the event (mortar is deployed)
    // This check is done in PlayerController
  }

  private showControls(): void {
    // Skip keyboard hints on touch devices
    if (isTouchDevice()) {
      Logger.info('player', 'Touch controls enabled - use on-screen buttons');
      return;
    }

    const pointerLockHint = this.pointerLockEnabled
      ? 'Mouse - Look around (click to enable pointer lock)'
      : 'Mouse - Look around (pointer lock disabled)';
    Logger.info('player', `
 CONTROLS:
WASD - Move on foot / vehicle-specific flight controls
Shift - Run / Engine Boost (in helicopter)
Space - Jump / Flight Assist / AC-47 Orbit Hold
Right Ctrl - Toggle Flight Mouse Control
W/S - Plane throttle while boarded
A/D - Plane runway steering / rudder
Arrow Keys - Plane pitch and bank intent
E - Enter/Exit Vehicle
M - Toggle Mortar Camera View (when mortar deployed)
1-6 - Switch Weapons
R - Reload
G - Throw Grenade / Deploy Squad (in helicopter)
B - Deploy/Undeploy Mortar
F - Fire Mortar (when deployed)
Z - Squad Commands
Shift+1..5 - Squad Quick Commands
TAB - Scoreboard
${pointerLockHint}
Escape - Open settings (on foot) / Exit helicopter
    `);
  }

  private isInFlightVehicle(): boolean {
    return this.flightVehicleMode !== 'none';
  }

  private isInHelicopterMode(): boolean {
    return this.flightVehicleMode === 'helicopter';
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
        Promise.resolve(document.body.requestPointerLock()).catch(() => {});
      }, 100);
    }
  }
}
