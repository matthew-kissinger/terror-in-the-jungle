/**
 * GameUI - Screen state machine wrapping TitleScreen + ModeSelectScreen.
 *
 * Drop-in replacement for StartScreen. Exposes the same public API
 * so GameEngine and GameEngineInit don't need structural changes.
 *
 * Flow: LOADING -> TITLE (START GAME) -> MODE SELECT -> (onPlayCallback) -> PREPARING -> HIDDEN
 */

import { UIComponent } from '../engine/UIComponent';
import { runUiTransition } from '../engine/UITransitions';
import { GameLaunchSelection, GameMode } from '../../config/gameModeTypes';
import { SettingsModal } from '../loading/SettingsModal';
import { TitleScreen } from './TitleScreen';
import { ModeSelectScreen } from './ModeSelectScreen';
import {
  getGameModeDefinition,
  resolveLaunchSelection,
} from '../../config/gameModeDefinitions';
import { GameEventBus } from '../../core/GameEventBus';

type UIState = 'loading' | 'title' | 'mode_select' | 'preparing' | 'hidden';

export class GameUI extends UIComponent {
  private titleScreen: TitleScreen;
  private modeSelectScreen: ModeSelectScreen;
  private settingsModal: SettingsModal;

  private state: UIState = 'loading';
  private onPlayCallback?: (selection: GameLaunchSelection) => void;
  private isLaunching = false;
  private launchMode: GameMode | null = null;
  private unsubModeProgress?: () => void;

  constructor() {
    super();
    this.titleScreen = new TitleScreen();
    this.modeSelectScreen = new ModeSelectScreen();
    this.settingsModal = new SettingsModal();
  }

  protected build(): void {
    // GameUI root is just a transparent container
    this.root.style.cssText = 'position:fixed;inset:0;z-index:9998;pointer-events:none;';
  }

  protected onMount(): void {
    // Fade out boot splash now that JS UI is ready
    const splash = document.getElementById('boot-splash');
    if (splash) {
      splash.style.transition = 'opacity 0.3s ease-out';
      splash.style.opacity = '0';
      setTimeout(() => splash.remove(), 300);
    }

    // Mount children to body (not to this.root)
    this.titleScreen.mount(document.body);
    this.modeSelectScreen.mount(document.body);
    this.settingsModal.mount(document.body);

    // Wire callbacks
    this.titleScreen.setOnStart(() => this.showModeSelect());
    this.titleScreen.setOnSettings(() => this.settingsModal.show());

    this.modeSelectScreen.setOnModeSelect((mode) => this.handleModeSelected(mode));
    this.modeSelectScreen.setOnBack(() => this.showTitle());
  }

  protected onUnmount(): void {
    // Children clean up via dispose
  }

  // --- Public API (matches old StartScreen) ---

  updateProgress(phaseId: string, progress: number): void {
    this.titleScreen.updateProgress(phaseId, progress);
  }

  setPhaseComplete(phaseId: string): void {
    this.titleScreen.setPhaseComplete(phaseId);
  }

  showMainMenu(): void {
    this.isLaunching = false;
    this.launchMode = null;
    this.state = 'title';
    this.titleScreen.showScreen();
    this.titleScreen.showMenu();
    this.titleScreen.cancelPreparing();
    this.modeSelectScreen.hide();
  }

  beginGameLaunch(selection: GameLaunchSelection): void {
    this.isLaunching = true;
    this.launchMode = selection.mode;
    this.state = 'preparing';
    // Return to title screen with preparing state
    this.modeSelectScreen.hide();
    this.titleScreen.showScreen();
    const definition = getGameModeDefinition(selection.mode);
    this.titleScreen.showPreparing(definition.config.name);

    // Wire mode startup progress into the loading bar
    this.titleScreen.initModeLoadProgress();
    this.unsubModeProgress?.();
    this.unsubModeProgress = GameEventBus.subscribe('mode_load_progress', (ev) => {
      this.titleScreen.updateModeLoadProgress(ev.phase, ev.progress, ev.label);
    });
  }

  cancelGameLaunch(): void {
    this.isLaunching = false;
    this.launchMode = null;
    this.unsubModeProgress?.();
    this.unsubModeProgress = undefined;
    this.titleScreen.cancelPreparing();
    this.showMainMenu();
  }

  hide(): void {
    runUiTransition('live-entry', () => {
      this.state = 'hidden';
      this.unsubModeProgress?.();
      this.unsubModeProgress = undefined;
      this.titleScreen.hideScreen();
      this.modeSelectScreen.hide();
    });
  }

  show(): void {
    this.showMainMenu();
  }

  onPlay(callback: (selection: GameLaunchSelection) => void): void {
    this.onPlayCallback = callback;
  }

  onSettings(_callback: () => void): void {
    // Settings handled internally by SettingsModal
  }

  onHowToPlay(_callback: () => void): void {
    // Absorbed into SettingsModal
  }

  showError(title: string, message: string): void {
    this.cancelGameLaunch();
    this.titleScreen.showError(title, message);
  }

  /** Expose settings modal for external ADS behavior wiring */
  getSettingsModal(): SettingsModal {
    return this.settingsModal;
  }

  override dispose(): void {
    this.unsubModeProgress?.();
    this.unsubModeProgress = undefined;
    this.titleScreen.dispose();
    this.modeSelectScreen.dispose();
    this.settingsModal.dispose();
    super.dispose();
  }

  // --- Private ---

  private showModeSelect(): void {
    runUiTransition('menu', () => {
      this.state = 'mode_select';
      this.titleScreen.hideScreen();
      this.modeSelectScreen.show();
    });
  }

  private showTitle(): void {
    runUiTransition('menu', () => {
      this.state = 'title';
      this.modeSelectScreen.hide();
      this.titleScreen.showScreen();
    });
  }

  private handleModeSelected(mode: GameMode): void {
    if (this.isLaunching) return;

    // Resolve default alliance/faction for this mode
    const definition = getGameModeDefinition(mode);
    const resolved = resolveLaunchSelection(definition);

    const selection: GameLaunchSelection = {
      mode,
      alliance: resolved.alliance,
      faction: resolved.faction,
    };

    this.onPlayCallback?.(selection);
  }
}
