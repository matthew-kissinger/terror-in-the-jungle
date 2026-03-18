export type InputContext = 'gameplay' | 'map' | 'menu' | 'modal' | 'spectator';

type InputContextListener = (context: InputContext) => void;

/**
 * Shared input context state used to prevent gameplay actions from firing
 * while UI-focused contexts (map/menu/modal) are active.
 */
export interface InputContextOptions {
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
    return this.context === 'gameplay';
  }

  /** Movement allowed in gameplay or when input is decoupled (e.g. scoreboard overlay). */
  isMovementAllowed(): boolean {
    return this.context === 'gameplay' || this._decoupledInput;
  }

  /** Firing is only allowed in full gameplay context - never through UI overlays. */
  isFireAllowed(): boolean {
    return this.context === 'gameplay';
  }

  /** Whether input is currently in decoupled mode. */
  isDecoupled(): boolean {
    return this._decoupledInput;
  }
}

