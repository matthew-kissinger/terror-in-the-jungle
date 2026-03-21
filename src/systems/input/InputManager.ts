import { PlayerInput, InputCallbacks } from '../player/PlayerInput';
import { InputContext, InputContextManager } from './InputContextManager';

export type InputMode = 'keyboardMouse' | 'touch' | 'gamepad';
type InputModeListener = (mode: InputMode) => void;

/**
 * InputManager wraps PlayerInput with:
 * - context-aware action gating (gameplay/map/menu/modal)
 * - last-active input mode tracking for prompt/UI adaptation
 */
export class InputManager extends PlayerInput {
  private readonly contextManager = InputContextManager.getInstance();
  private lastMode: InputMode = this.getIsTouchMode() ? 'touch' : 'keyboardMouse';
  private readonly modeListeners = new Set<InputModeListener>();

  private readonly onKeyboardActivity = (_event: KeyboardEvent): void => {
    this.setLastMode('keyboardMouse');
  };
  private readonly onMouseActivity = (_event: MouseEvent): void => {
    this.setLastMode('keyboardMouse');
  };
  private readonly onTouchActivity = (_event: TouchEvent | PointerEvent): void => {
    this.setLastMode('touch');
  };

  constructor() {
    super();
    document.addEventListener('keydown', this.onKeyboardActivity, { capture: true });
    document.addEventListener('mousemove', this.onMouseActivity, { capture: true });
    document.addEventListener('touchstart', this.onTouchActivity, { capture: true, passive: true });
    document.addEventListener('pointerdown', this.onTouchActivity, { capture: true, passive: true });
  }

  override setCallbacks(callbacks: InputCallbacks): void {
    super.setCallbacks(this.wrapCallbacks(callbacks));
  }

  override pollGamepad(): void {
    super.pollGamepad();
    if (super.isGamepadActive()) {
      this.setLastMode('gamepad');
    }
  }

  override isKeyPressed(key: string): boolean {
    if (!this.contextManager.isGameplay()) return false;
    return super.isKeyPressed(key);
  }

  setInputContext(context: InputContext): void {
    this.contextManager.setContext(context);
  }

  getInputContext(): InputContext {
    return this.contextManager.getContext();
  }

  onInputModeChange(listener: InputModeListener): () => void {
    this.modeListeners.add(listener);
    listener(this.lastMode);
    return () => this.modeListeners.delete(listener);
  }

  getLastInputMode(): InputMode {
    return this.lastMode;
  }

  override dispose(): void {
    document.removeEventListener('keydown', this.onKeyboardActivity, { capture: true } as EventListenerOptions);
    document.removeEventListener('mousemove', this.onMouseActivity, { capture: true } as EventListenerOptions);
    document.removeEventListener('touchstart', this.onTouchActivity, { capture: true } as EventListenerOptions);
    document.removeEventListener('pointerdown', this.onTouchActivity, { capture: true } as EventListenerOptions);
    this.modeListeners.clear();
    super.dispose();
  }

  private setLastMode(next: InputMode): void {
    if (this.lastMode === next) return;
    this.lastMode = next;
    for (const listener of this.modeListeners) {
      listener(this.lastMode);
    }
  }

  private wrapCallbacks(callbacks: InputCallbacks): InputCallbacks {
    return {
      ...callbacks,
      onJump: () => this.runGameplay(callbacks.onJump),
      onRunStart: () => this.runGameplay(callbacks.onRunStart),
      onRunStop: () => this.runRelease(callbacks.onRunStop),
      onScoreboardToggle: (visible) => this.runGameplay(() => callbacks.onScoreboardToggle?.(visible)),
      onScoreboardTap: () => this.runGameplay(callbacks.onScoreboardTap),
      onEnterExitHelicopter: () => this.runGameplay(callbacks.onEnterExitHelicopter),
      onToggleAutoHover: () => this.runGameplay(callbacks.onToggleAutoHover),
      onToggleAltitudeLock: () => this.runGameplay(callbacks.onToggleAltitudeLock),
      onToggleMouseControl: () => this.runGameplay(callbacks.onToggleMouseControl),
      onSandbagRotateLeft: () => this.runInfantry(callbacks.onSandbagRotateLeft),
      onSandbagRotateRight: () => this.runInfantry(callbacks.onSandbagRotateRight),
      onRallyPointPlace: () => this.runGameplay(callbacks.onRallyPointPlace),
      onMapToggle: () => this.runGameplay(callbacks.onMapToggle),
      onToggleMortarCamera: () => this.runInfantry(callbacks.onToggleMortarCamera),
      onDeployMortar: () => this.runInfantry(callbacks.onDeployMortar),
      onMortarFire: () => this.runInfantry(callbacks.onMortarFire),
      onMortarAdjustPitch: (delta) => this.runInfantry(() => callbacks.onMortarAdjustPitch?.(delta)),
      onMortarAdjustYaw: (delta) => this.runInfantry(() => callbacks.onMortarAdjustYaw?.(delta)),
      onWeaponSlotChange: (slot) => this.runGameplay(() => callbacks.onWeaponSlotChange?.(slot)),
      onMouseDown: (button) => this.runGameplay(() => callbacks.onMouseDown?.(button)),
      onMouseUp: (button) => this.runRelease(() => callbacks.onMouseUp?.(button)),
      onReload: () => this.runGameplay(callbacks.onReload),
      onGrenadeSwitch: () => this.runInfantry(callbacks.onGrenadeSwitch),
      onSquadDeploy: () => this.runGameplay(callbacks.onSquadDeploy),
      onSquadCommand: () => this.runGameplay(callbacks.onSquadCommand),
      onSquadQuickCommand: (slot) => this.runGameplay(() => callbacks.onSquadQuickCommand?.(slot)),
      onHelicopterWeaponSwitch: (index) => this.runGameplay(() => callbacks.onHelicopterWeaponSwitch?.(index)),
      onAirSupportMenu: () => this.runGameplay(callbacks.onAirSupportMenu),
      // Escape/menu callbacks are always allowed so the player can recover from UI traps.
      onEscape: () => callbacks.onEscape?.(),
      onMenuOpen: () => callbacks.onMenuOpen?.(),
    };
  }

  private runGameplay(action: (() => void) | undefined): void {
    if (!action) return;
    if (!this.contextManager.isGameplay()) return;
    action();
  }

  /** Release/stop callbacks must always fire regardless of context to prevent stuck state. */
  private runRelease(action: (() => void) | undefined): void {
    if (!action) return;
    action();
  }

  /** Infantry-only actions (equipment: grenades, sandbags, mortar) - blocked in helicopter context. */
  private runInfantry(action: (() => void) | undefined): void {
    if (!action) return;
    if (!this.contextManager.isInfantryGameplay()) return;
    action();
  }
}
