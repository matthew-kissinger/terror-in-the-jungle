export type InputContext = 'gameplay' | 'helicopter' | 'map' | 'menu' | 'modal' | 'spectator';

type InputContextListener = (context: InputContext) => void;

/**
 * Shared input context state used to prevent gameplay actions from firing
 * while UI-focused contexts (map/menu/modal) are active.
 */
interface InputContextOptions {
  /** When true, pointer is unlocked but movement keys remain active. */
  decoupleInput?: boolean;
}

export class InputContextManager {
  private static instance: InputContextManager | null = null;

  private context: InputContext = 'gameplay';
  private _decoupledInput = false;
  private readonly listeners = new Set<InputContextListener>();

  static getInstance(): InputContextManager {
    if (!InputContextManager.instance) {
      InputContextManager.instance = new InputContextManager();
    }
    return InputContextManager.instance;
  }

  getContext(): InputContext {
    return this.context;
  }

  setContext(next: InputContext, options?: InputContextOptions): void {
    if (this.context === next && this._decoupledInput === (options?.decoupleInput ?? false)) return;
    this.context = next;
    this._decoupledInput = options?.decoupleInput ?? false;
    for (const listener of this.listeners) {
      listener(this.context);
    }
  }

  onChange(listener: InputContextListener): () => void {
    this.listeners.add(listener);
    listener(this.context);
    return () => this.listeners.delete(listener);
  }

  isGameplay(): boolean {
    return this.context === 'gameplay' || this.context === 'helicopter';
  }

  /** True only in infantry gameplay - equipment keys (grenades/sandbags/mortar) are blocked in helicopter. */
  isInfantryGameplay(): boolean {
    return this.context === 'gameplay';
  }

  /** Movement allowed in gameplay, helicopter, or when input is decoupled (e.g. scoreboard overlay). */
  isMovementAllowed(): boolean {
    return this.context === 'gameplay' || this.context === 'helicopter' || this._decoupledInput;
  }

  /** Firing is allowed in gameplay and helicopter contexts. */
  isFireAllowed(): boolean {
    return this.context === 'gameplay' || this.context === 'helicopter';
  }

  /** Whether input is currently in decoupled mode. */
  isDecoupled(): boolean {
    return this._decoupledInput;
  }

  /** Reset to initial state (used on engine dispose / game mode change). */
  reset(): void {
    this.context = 'gameplay';
    this._decoupledInput = false;
    this.listeners.clear();
  }

  /** Reset the singleton instance (for test isolation). */
  static resetInstance(): void {
    InputContextManager.instance = null;
  }
}
