import type { GameLaunchSelection, GameMode } from '../config/gameModeTypes';

export type StartupPhase =
  | 'booting'
  | 'menu_ready'
  | 'mode_preparing'
  | 'deploy_select'
  | 'spawn_warming'
  | 'live'
  | 'startup_error';

export interface StartupState {
  phase: StartupPhase;
  mode: GameMode | null;
  selection: GameLaunchSelection | null;
  errorMessage: string | null;
}

export class StartupFlowController {
  private state: StartupState = {
    phase: 'booting',
    mode: null,
    selection: null,
    errorMessage: null,
  };

  getState(): StartupState {
    return { ...this.state, selection: this.state.selection ? { ...this.state.selection } : null };
  }

  resetBoot(): void {
    this.state = {
      phase: 'booting',
      mode: null,
      selection: null,
      errorMessage: null,
    };
  }

  showMenu(): void {
    this.transition('menu_ready');
  }

  beginModePreparation(selection: GameLaunchSelection): boolean {
    if (this.state.phase !== 'menu_ready') {
      return false;
    }

    this.state = {
      phase: 'mode_preparing',
      mode: selection.mode,
      selection: { ...selection },
      errorMessage: null,
    };
    return true;
  }

  enterDeploySelect(): void {
    if (this.state.phase === 'mode_preparing') {
      this.transition('deploy_select');
    }
  }

  enterSpawnWarming(): void {
    if (this.state.phase === 'mode_preparing' || this.state.phase === 'deploy_select') {
      this.transition('spawn_warming');
    }
  }

  enterLive(): void {
    if (this.state.phase === 'spawn_warming') {
      this.transition('live');
    }
  }

  cancelToMenu(): void {
    this.transition('menu_ready');
  }

  fail(errorMessage: string): void {
    this.state = {
      phase: 'startup_error',
      mode: this.state.mode,
      selection: this.state.selection ? { ...this.state.selection } : null,
      errorMessage,
    };
  }

  private transition(phase: StartupPhase): void {
    this.state = {
      phase,
      mode: phase === 'booting' || phase === 'menu_ready' ? null : this.state.mode,
      selection: phase === 'booting' || phase === 'menu_ready'
        ? null
        : this.state.selection ? { ...this.state.selection } : null,
      errorMessage: null,
    };
  }
}
