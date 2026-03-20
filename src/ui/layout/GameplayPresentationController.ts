import type {
  ActorMode,
  GameplayInputMode,
  GameplayOverlay,
  InteractionContext,
  LayoutMode,
  UIState,
} from './types';
import { ViewportManager } from '../design/responsive';

function deriveLayoutMode(vp: { isTouch: boolean; isPortrait: boolean }): LayoutMode {
  if (!vp.isTouch) return 'desktop';
  return vp.isPortrait ? 'mobile-portrait' : 'mobile-landscape';
}

function defaultState(): UIState {
  const vp = ViewportManager.getInstance().info;
  const layout = deriveLayoutMode(vp);
  const device = vp.isTouch ? 'touch' : 'desktop';
  const inputMode: GameplayInputMode = device === 'touch' ? 'touch' : 'keyboardMouse';

  return {
    device,
    inputMode,
    phase: 'menu',
    vehicle: 'infantry',
    actorMode: 'infantry',
    overlay: 'none',
    scoreboardVisible: false,
    interaction: null,
    vehicleContext: null,
    ads: false,
    layout,
  };
}

export class GameplayPresentationController {
  private root: HTMLElement;
  private state: UIState;
  private viewportUnsubscribe?: () => void;
  private readonly listeners = new Set<(state: Readonly<UIState>) => void>();

  constructor(root: HTMLElement) {
    this.root = root;
    this.state = defaultState();

    this.applyAll();

    this.viewportUnsubscribe = ViewportManager.getInstance().subscribe((info) => {
      const nextLayout = deriveLayoutMode(info);
      const nextDevice = info.isTouch ? 'touch' : 'desktop';
      const nextInputMode = nextDevice === 'touch'
        ? 'touch'
        : this.state.inputMode === 'touch'
          ? 'keyboardMouse'
          : this.state.inputMode;

      this.setState({
        layout: nextLayout,
        device: nextDevice,
        inputMode: nextInputMode,
      });
    });
  }

  getState(): Readonly<UIState> {
    return {
      ...this.state,
      interaction: this.state.interaction ? { ...this.state.interaction } : null,
      vehicleContext: this.state.vehicleContext
        ? {
            ...this.state.vehicleContext,
            capabilities: { ...this.state.vehicleContext.capabilities },
          }
        : null,
    };
  }

  onChange(listener: (state: Readonly<UIState>) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  setState(partial: Partial<UIState>): void {
    let changed = false;
    const nextState = { ...this.state };

    for (const [key, value] of Object.entries(partial) as [keyof UIState, UIState[keyof UIState]][]) {
      if (value === undefined) continue;
      if (key === 'actorMode') {
        if (nextState.actorMode !== value) {
          nextState.actorMode = value as ActorMode;
          nextState.vehicle = value as ActorMode;
          changed = true;
        }
        continue;
      }
      if (key === 'vehicle') {
        if (nextState.vehicle !== value) {
          nextState.vehicle = value as ActorMode;
          nextState.actorMode = value as ActorMode;
          changed = true;
        }
        continue;
      }
      if (nextState[key] !== value) {
        (nextState as Record<string, unknown>)[key] = value;
        changed = true;
      }
    }

    if (!changed) return;

    if (nextState.overlay !== 'none') {
      nextState.scoreboardVisible = false;
    }

    this.state = nextState;
    this.applyAll();
    this.emit();
  }

  setPhase(phase: UIState['phase']): void {
    this.setState({ phase });
  }

  setVehicle(vehicle: ActorMode): void {
    this.setState({ actorMode: vehicle });
  }

  setActorMode(actorMode: ActorMode): void {
    this.setState({ actorMode });
  }

  setADS(ads: boolean): void {
    this.setState({ ads });
  }

  setOverlay(overlay: GameplayOverlay): void {
    this.setState({ overlay });
  }

  setInputMode(inputMode: GameplayInputMode): void {
    this.setState({ inputMode });
  }

  setScoreboardVisible(scoreboardVisible: boolean): void {
    this.setState({ scoreboardVisible });
  }

  setInteraction(interaction: InteractionContext | null): void {
    this.setState({ interaction });
  }

  private applyAll(): void {
    this.root.dataset.device = this.state.device;
    this.root.dataset.inputMode = this.state.inputMode;
    this.root.dataset.phase = this.state.phase;
    this.root.dataset.vehicle = this.state.vehicle;
    this.root.dataset.actorMode = this.state.actorMode;
    this.root.dataset.overlay = this.state.overlay;
    this.root.dataset.scoreboardVisible = String(this.state.scoreboardVisible);
    this.root.dataset.interaction = this.state.interaction?.kind ?? 'none';
    this.root.dataset.ads = String(this.state.ads);
    this.root.dataset.layout = this.state.layout;
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  dispose(): void {
    this.viewportUnsubscribe?.();
    this.listeners.clear();
  }
}
