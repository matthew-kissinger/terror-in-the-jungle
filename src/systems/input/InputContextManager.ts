export type InputContext = 'gameplay' | 'map' | 'menu' | 'modal';

type InputContextListener = (context: InputContext) => void;

/**
 * Shared input context state used to prevent gameplay actions from firing
 * while UI-focused contexts (map/menu/modal) are active.
 */
export class InputContextManager {
  private static instance: InputContextManager | null = null;

  private context: InputContext = 'gameplay';
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

  setContext(next: InputContext): void {
    if (this.context === next) return;
    this.context = next;
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
}

