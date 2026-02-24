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
      onRunStop: () => this.runGameplay(callbacks.onRunStop),
      onScoreboardToggle: (visible) => this.runGameplay(() => callbacks.onScoreboardToggle?.(visible)),
      onScoreboardTap: () => this.runGameplay(callbacks.onScoreboardTap),
      onEnterExitHelicopter: () => this.runGameplay(callbacks.onEnterExitHelicopter),
      onToggleAutoHover: () => this.runGameplay(callbacks.onToggleAutoHover),
      onToggleMouseControl: () => this.runGameplay(callbacks.onToggleMouseControl),
      onSandbagRotateLeft: () => this.runGameplay(callbacks.onSandbagRotateLeft),
      onSandbagRotateRight: () => this.runGameplay(callbacks.onSandbagRotateRight),
      onRallyPointPlace: () => this.runGameplay(callbacks.onRallyPointPlace),
      onToggleMortarCamera: () => this.runGameplay(callbacks.onToggleMortarCamera),
      onDeployMortar: () => this.runGameplay(callbacks.onDeployMortar),
      onMortarFire: () => this.runGameplay(callbacks.onMortarFire),
      onMortarAdjustPitch: (delta) => this.runGameplay(() => callbacks.onMortarAdjustPitch?.(delta)),
      onMortarAdjustYaw: (delta) => this.runGameplay(() => callbacks.onMortarAdjustYaw?.(delta)),
      onWeaponSlotChange: (slot) => this.runGameplay(() => callbacks.onWeaponSlotChange?.(slot)),
      onMouseDown: (button) => this.runGameplay(() => callbacks.onMouseDown?.(button)),
      onMouseUp: (button) => this.runGameplay(() => callbacks.onMouseUp?.(button)),
      onReload: () => this.runGameplay(callbacks.onReload),
      onGrenadeSwitch: () => this.runGameplay(callbacks.onGrenadeSwitch),
      onSquadCommand: () => this.runGameplay(callbacks.onSquadCommand),
      onSquadQuickCommand: (slot) => this.runGameplay(() => callbacks.onSquadQuickCommand?.(slot)),
      // Escape/menu callbacks are always allowed so the player can recover from UI traps.
      onEscape: () => callbacks.onEscape?.(),
      onMenuPause: () => callbacks.onMenuPause?.(),
      onMenuResume: () => callbacks.onMenuResume?.(),
    };
  }

  private runGameplay(action: (() => void) | undefined): void {
    if (!action) return;
    if (!this.contextManager.isGameplay()) return;
    action();
  }
}

