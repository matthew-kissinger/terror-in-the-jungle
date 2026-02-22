/**
 * StartScreen - main orchestrator for the start/menu screen.
 * Title + mode cards + play button. Delegates to SettingsModal and HowToPlayModal.
 */

import { GameMode } from '../../config/gameModes';
import { isTouchDevice } from '../../utils/DeviceDetector';
import { isPortraitViewport, tryLockLandscapeOrientation } from '../../utils/Orientation';
import { getStartScreenStyles } from './StartScreenStyles';
import { createModeCardHTML, MODE_CARD_CONFIGS } from './ModeCard';
import { SettingsModal } from './SettingsModal';
import { HowToPlayModal } from './HowToPlayModal';
import { LoadingProgress } from './LoadingProgress';
import { LOADING_PHASES } from '../../config/loading';

export class StartScreen {
  private container: HTMLDivElement;
  private progressBar: HTMLDivElement;
  private progressFill: HTMLDivElement;
  private percentText: HTMLSpanElement;
  private phaseText: HTMLDivElement;
  private tipText: HTMLDivElement;
  private playButton: HTMLButtonElement;
  private settingsButton: HTMLButtonElement;
  private howToPlayButton: HTMLButtonElement;
  private modeSelectionContainer: HTMLDivElement;
  private modeCards: HTMLDivElement[];
  private selectedModeDisplay: HTMLDivElement;

  private errorPanel: HTMLDivElement | null = null;
  private fullscreenPrompt: HTMLDivElement | null = null;

  private settingsModal: SettingsModal;
  private howToPlayModal: HowToPlayModal;
  private progress: LoadingProgress;

  private isVisible = true;
  private selectedGameMode: GameMode = GameMode.ZONE_CONTROL;
  private onPlayCallback?: (mode: GameMode) => void;
  private initTimeoutId: number | null = null;
  private isInitialized = false;

  private handlePlayClick = () => {
    // On touch devices, auto-enter fullscreen + landscape on play (no separate prompt needed)
    if (isTouchDevice() && !document.fullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen()
          .then(() => tryLockLandscapeOrientation())
          .catch(() => {});
      }
    }
    this.dismissFullscreenPrompt();
    if (this.onPlayCallback) this.onPlayCallback(this.selectedGameMode);
  };
  private handleSettingsClick = () => this.settingsModal.show();
  private handleHowToPlayClick = () => this.howToPlayModal.show();

  constructor() {
    this.container = this.buildDOM();
    this.progressBar = this.container.querySelector('.loading-bar') as HTMLDivElement;
    this.progressFill = this.container.querySelector('.progress-fill') as HTMLDivElement;
    this.percentText = this.container.querySelector('.percent-text') as HTMLSpanElement;
    this.phaseText = this.container.querySelector('.phase-text') as HTMLDivElement;
    this.tipText = this.container.querySelector('.tip-text') as HTMLDivElement;
    this.playButton = this.container.querySelector('.play-button') as HTMLButtonElement;
    this.settingsButton = this.container.querySelector('.settings-button') as HTMLButtonElement;
    this.howToPlayButton = this.container.querySelector('.how-to-play-button') as HTMLButtonElement;
    this.modeSelectionContainer = this.container.querySelector('.mode-selection-container') as HTMLDivElement;
    this.selectedModeDisplay = this.container.querySelector('.selected-mode-display') as HTMLDivElement;
    this.modeCards = Array.from(this.container.querySelectorAll('.mode-card')) as HTMLDivElement[];

    this.settingsModal = new SettingsModal();
    this.howToPlayModal = new HowToPlayModal();
    this.progress = new LoadingProgress(
      this.progressFill, this.percentText, this.phaseText, this.tipText
    );

    this.initializePhases();
    this.setupEventListeners();
    this.progress.initializeTips();
    this.startInitTimeout();
  }

  private buildDOM(): HTMLDivElement {
    const container = document.createElement('div');
    container.id = 'loading-screen';

    const modeCardsHTML = Object.keys(MODE_CARD_CONFIGS)
      .map((mode, i) => createModeCardHTML(mode, i === 0))
      .join('');

    container.innerHTML = `
      <style>${getStartScreenStyles()}</style>

      <div class="loading-content">
        <div class="header-section">
          <h1 class="game-title">TERROR IN THE JUNGLE</h1>
          <div class="subtitle">US FORCES vs OPFOR</div>
        </div>

        <div class="loading-section">
          <div class="loading-bar">
            <div class="progress-fill" style="width: 0%"></div>
            <span class="percent-text">0%</span>
          </div>
          <div class="phase-text">Initializing...</div>
        </div>

        <div class="tip-container">
          <div class="tip-label">INTEL</div>
          <div class="tip-text"></div>
        </div>

        <div class="mode-selection-container">
          <div class="mode-cards">${modeCardsHTML}</div>
          <div class="selected-mode-display">
            Selected: <strong>ZONE CONTROL</strong>
          </div>
        </div>

        <div class="menu-buttons">
          <button class="menu-button play-button">DEPLOY -- ZONE CONTROL</button>
          <div class="button-row">
            <button class="menu-button secondary-button settings-button">SETTINGS</button>
            <button class="menu-button secondary-button how-to-play-button">CONTROLS</button>
          </div>
        </div>
      </div>

      <div class="loading-stats">
        <span class="load-time"></span>
      </div>
    `;

    document.body.appendChild(container);
    return container;
  }

  private initializePhases(): void {
    for (const phase of LOADING_PHASES) {
      this.progress.addPhase(phase.id, phase.weight, phase.label);
    }
  }

  private setupEventListeners(): void {
    // Mode card selection
    for (const card of this.modeCards) {
      const mode = card.dataset.mode;
      if (!mode) continue;
      const gameMode = this.resolveGameMode(mode);
      card.addEventListener('pointerdown', () => this.selectGameMode(gameMode));
      card.addEventListener('click', (e) => e.preventDefault());
    }

    this.playButton.addEventListener('pointerdown', this.handlePlayClick);
    this.playButton.addEventListener('click', (e) => e.preventDefault());
    this.settingsButton.addEventListener('pointerdown', this.handleSettingsClick);
    this.settingsButton.addEventListener('click', (e) => e.preventDefault());
    this.howToPlayButton.addEventListener('pointerdown', this.handleHowToPlayClick);
    this.howToPlayButton.addEventListener('click', (e) => e.preventDefault());
  }

  private resolveGameMode(mode: string): GameMode {
    switch (mode) {
      case 'zone_control': return GameMode.ZONE_CONTROL;
      case 'open_frontier': return GameMode.OPEN_FRONTIER;
      case 'tdm': return GameMode.TEAM_DEATHMATCH;
      case 'a_shau_valley': return GameMode.A_SHAU_VALLEY;
      default: return GameMode.ZONE_CONTROL;
    }
  }

  private selectGameMode(mode: GameMode): void {
    this.selectedGameMode = mode;

    for (const card of this.modeCards) {
      card.classList.toggle('selected', this.resolveGameMode(card.dataset.mode || '') === mode);
    }

    const modeName =
      mode === GameMode.ZONE_CONTROL ? 'ZONE CONTROL'
      : mode === GameMode.OPEN_FRONTIER ? 'OPEN FRONTIER'
      : mode === GameMode.A_SHAU_VALLEY ? 'A SHAU VALLEY'
      : 'TEAM DEATHMATCH';

    this.selectedModeDisplay.innerHTML = `Selected: <strong>${modeName}</strong>`;
    this.playButton.textContent = `DEPLOY -- ${modeName}`;
  }

  // --- Public API (same as old LoadingScreen) ---

  updateProgress(phaseId: string, progress: number): void {
    this.progress.updateProgress(phaseId, progress);
  }

  setPhaseComplete(phaseId: string): void {
    this.progress.setPhaseComplete(phaseId);
  }

  showMainMenu(): void {
    this.markInitialized();

    const buttons = this.container.querySelector('.menu-buttons');
    if (buttons) buttons.classList.add('visible');

    this.modeSelectionContainer.classList.add('visible');
    this.progress.showComplete();

    if (isTouchDevice()) this.showFullscreenPrompt();
  }

  hide(): void {
    // Autostart/sandbox flows can skip showMainMenu; ensure init timeout cannot fire mid-match.
    this.markInitialized();
    this.container.classList.add('hidden');
    setTimeout(() => { this.isVisible = false; }, 500);
  }

  show(): void {
    this.container.classList.remove('hidden');
    this.isVisible = true;
  }

  onPlay(callback: (mode: GameMode) => void): void {
    this.onPlayCallback = callback;
  }

  onSettings(_callback: () => void): void {
    // Settings handled internally by SettingsModal
  }

  onHowToPlay(_callback: () => void): void {
    // HowToPlay handled internally by HowToPlayModal
  }

  showError(title: string, message: string): void {
    if (this.errorPanel) this.errorPanel.remove();
    if (this.initTimeoutId !== null) {
      clearTimeout(this.initTimeoutId);
      this.initTimeoutId = null;
    }

    this.errorPanel = document.createElement('div');
    this.errorPanel.className = 'error-panel';
    this.errorPanel.innerHTML = `
      <div class="error-panel-title">${this.escapeHtml(title)}</div>
      <div class="error-panel-message">${this.escapeHtml(message)}</div>
      <div class="error-panel-actions">
        <button class="error-panel-button primary retry-button">Retry</button>
        <button class="error-panel-button report-button">Report Issue</button>
      </div>
    `;

    const retryBtn = this.errorPanel.querySelector('.retry-button');
    retryBtn?.addEventListener('pointerdown', () => window.location.reload());
    retryBtn?.addEventListener('click', (e) => e.preventDefault());

    const reportBtn = this.errorPanel.querySelector('.report-button');
    reportBtn?.addEventListener('pointerdown', () => {
      window.open('https://github.com/matthew-kissinger/terror-in-the-jungle/issues', '_blank');
    });
    reportBtn?.addEventListener('click', (e) => e.preventDefault());

    document.body.appendChild(this.errorPanel);
  }

  startInitTimeout(): void {
    if (this.initTimeoutId !== null) clearTimeout(this.initTimeoutId);

    this.initTimeoutId = window.setTimeout(() => {
      if (!this.isInitialized) {
        this.showError(
          'Initialization Taking Too Long',
          'The game is taking longer than expected to initialize. This may be due to slow network, browser issues, or device limitations. You can try refreshing the page.'
        );
      }
    }, 30000);
  }

  clearInitTimeout(): void {
    if (this.initTimeoutId !== null) {
      clearTimeout(this.initTimeoutId);
      this.initTimeoutId = null;
    }
  }

  markInitialized(): void {
    this.isInitialized = true;
    this.clearInitTimeout();
  }

  // --- Fullscreen / Landscape prompts ---

  private showFullscreenPrompt(): void {
    if (this.fullscreenPrompt) return;
    const prompt = document.createElement('div');
    prompt.setAttribute('role', 'button');
    prompt.tabIndex = 0;
    const isPortrait = isPortraitViewport();
    prompt.innerHTML = isPortrait
      ? `<span style="font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em;">TAP FOR FULLSCREEN + LANDSCAPE</span>`
      : `<span style="font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em;">TAP FOR FULLSCREEN</span>`;
    Object.assign(prompt.style, {
      position: 'absolute',
      bottom: '0.6rem',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '0.35rem 0.8rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(8, 16, 24, 0.7)',
      border: '1px solid rgba(127, 180, 217, 0.2)',
      borderRadius: '8px',
      color: 'rgba(127, 180, 217, 0.8)',
      cursor: 'pointer',
      touchAction: 'manipulation',
      WebkitTapHighlightColor: 'transparent',
      zIndex: '10',
      transition: 'opacity 0.3s',
      opacity: '1',
    } as Partial<CSSStyleDeclaration>);

    const handleTap = () => {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen()
          .then(() => tryLockLandscapeOrientation())
          .catch(() => {})
          .finally(() => this.dismissFullscreenPrompt());
      } else {
        this.dismissFullscreenPrompt();
      }
    };
    prompt.addEventListener('pointerdown', (e) => { e.preventDefault(); handleTap(); });
    prompt.addEventListener('click', (e) => e.preventDefault());
    this.container.appendChild(prompt);
    this.fullscreenPrompt = prompt;

    // Auto-fade after 6 seconds so it doesn't nag
    setTimeout(() => {
      if (this.fullscreenPrompt) {
        this.fullscreenPrompt.style.opacity = '0';
        setTimeout(() => this.dismissFullscreenPrompt(), 300);
      }
    }, 6000);
  }

  private dismissFullscreenPrompt(): void {
    if (this.fullscreenPrompt?.parentElement) {
      this.fullscreenPrompt.remove();
      this.fullscreenPrompt = null;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  dispose(): void {
    this.dismissFullscreenPrompt();
    this.dismissLandscapePrompt();
    this.clearInitTimeout();

    this.playButton.removeEventListener('pointerdown', this.handlePlayClick);
    this.settingsButton.removeEventListener('pointerdown', this.handleSettingsClick);
    this.howToPlayButton.removeEventListener('pointerdown', this.handleHowToPlayClick);

    if (this.errorPanel) {
      this.errorPanel.remove();
      this.errorPanel = null;
    }

    this.settingsModal.dispose();
    this.howToPlayModal.dispose();

    if (this.container?.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
