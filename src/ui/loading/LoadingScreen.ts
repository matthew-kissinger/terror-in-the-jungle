import * as THREE from 'three';
import { LOADING_PHASES } from '../../config/loading';
import { LoadingStyles } from './LoadingStyles';
import { LoadingPanels } from './LoadingPanels';
import { LoadingProgress } from './LoadingProgress';
import { GameMode } from '../../config/gameModes';
import { isTouchDevice, isMobileViewport } from '../../utils/DeviceDetector';
import { isPortraitViewport, tryLockLandscapeOrientation } from '../../utils/Orientation';

let landscapePromptDismissedForSession = false;

export class LoadingScreen {
  private container: HTMLDivElement;
  private progressBar: HTMLDivElement;
  private progressFill: HTMLDivElement;
  private percentText: HTMLSpanElement;
  private phaseText: HTMLDivElement;
  private tipText: HTMLDivElement;
  private playButton: HTMLButtonElement;
  private settingsButton: HTMLButtonElement;
  private howToPlayButton: HTMLButtonElement;

  // Error panel elements
  private errorPanel: HTMLDivElement | null = null;

  // Game mode selection elements
  private modeSelectionContainer: HTMLDivElement;
  private zoneControlCard: HTMLDivElement;
  private openFrontierCard: HTMLDivElement;
  private teamDeathmatchCard: HTMLDivElement;
  private selectedModeDisplay: HTMLDivElement;

  // Mobile fullscreen prompt (shown after main menu on touch devices)
  private fullscreenPrompt: HTMLDivElement | null = null;
  private landscapePrompt: HTMLDivElement | null = null;
  private readonly handleOrientationOrResize = () => {
    if (!this.landscapePrompt) return;
    if (!isPortraitViewport()) {
      this.dismissLandscapePrompt();
    }
  };

  // Refactored modules
  private panels: LoadingPanels;
  private progress: LoadingProgress;

  private isVisible: boolean = true;
  private selectedGameMode: GameMode = GameMode.ZONE_CONTROL;
  private onPlayCallback?: (mode: GameMode) => void;
  private onSettingsCallback?: () => void;
  private onHowToPlayCallback?: () => void;
  private initTimeoutId: number | null = null;

  // Handler references for cleanup
  private handleZoneControlClick = () => this.selectGameMode(GameMode.ZONE_CONTROL);
  private handleOpenFrontierClick = () => this.selectGameMode(GameMode.OPEN_FRONTIER);
  private handleTeamDeathmatchClick = () => this.selectGameMode(GameMode.TEAM_DEATHMATCH);
  private handlePlayClick = () => {
    if (this.onPlayCallback) {
      this.onPlayCallback(this.selectedGameMode);
    }
  };
  private handleSettingsClick = () => this.panels.showSettingsPanel();
  private handleHowToPlayClick = () => this.panels.showHowToPlayPanel();

  constructor() {
    this.container = this.createLoadingScreen();
    this.progressBar = this.container.querySelector('.loading-bar') as HTMLDivElement;
    this.progressFill = this.container.querySelector('.progress-fill') as HTMLDivElement;
    this.percentText = this.container.querySelector('.percent-text') as HTMLSpanElement;
    this.phaseText = this.container.querySelector('.phase-text') as HTMLDivElement;
    this.tipText = this.container.querySelector('.tip-text') as HTMLDivElement;
    this.playButton = this.container.querySelector('.play-button') as HTMLButtonElement;
    this.settingsButton = this.container.querySelector('.settings-button') as HTMLButtonElement;
    this.howToPlayButton = this.container.querySelector('.how-to-play-button') as HTMLButtonElement;

    // Game mode elements
    this.modeSelectionContainer = this.container.querySelector('.mode-selection-container') as HTMLDivElement;
    this.zoneControlCard = this.container.querySelector('.zone-control-card') as HTMLDivElement;
    this.openFrontierCard = this.container.querySelector('.open-frontier-card') as HTMLDivElement;
    this.teamDeathmatchCard = this.container.querySelector('.team-deathmatch-card') as HTMLDivElement;
    this.selectedModeDisplay = this.container.querySelector('.selected-mode-display') as HTMLDivElement;

    // Initialize modules
    this.panels = new LoadingPanels();
    this.progress = new LoadingProgress(
      this.progressFill,
      this.percentText,
      this.phaseText,
      this.tipText
    );

    this.initializePhases();
    this.setupEventListeners();
    this.progress.initializeTips();

    // Start initialization timeout
    this.startInitTimeout();
  }

  private createLoadingScreen(): HTMLDivElement {
    const container = document.createElement('div');
    container.id = 'loading-screen';
    container.innerHTML = `
      <style>
        ${LoadingStyles.getStyles()}

        /* Game Mode Selection Styles */
        .mode-selection-container {
          display: none;
          margin: 0.75rem 0;
          animation: fadeInUp 0.6s ease-out 0.3s backwards;
        }

        .mode-selection-container.visible {
          display: block;
        }

        .mode-cards {
          display: flex;
          gap: 1rem;
          justify-content: center;
          margin-bottom: 0.75rem;
          flex-wrap: wrap;
        }

        .mode-card {
          background: rgba(20, 35, 50, 0.3);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(127, 180, 217, 0.2);
          border-radius: 12px;
          padding: 1rem;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          width: 240px;
          min-height: 44px;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          position: relative;
          overflow: hidden;
          flex: 0 1 240px;
        }

        .mode-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, transparent, rgba(127, 180, 217, 0.05));
          opacity: 0;
          transition: opacity 0.3s;
        }

        .mode-card:hover {
          border-color: var(--primary-color);
          transform: translateY(-4px) scale(1.01);
          box-shadow: 0 10px 30px rgba(127, 180, 217, 0.15);
        }

        .mode-card:hover::before {
          opacity: 1;
        }

        .mode-card.selected {
          border-color: var(--primary-color);
          background: rgba(127, 180, 217, 0.1);
          box-shadow: 0 0 30px rgba(127, 180, 217, 0.2);
        }

        .mode-card-title {
          color: var(--primary-color);
          font-size: 1.1rem;
          font-weight: 500;
          margin-bottom: 0.25rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .mode-card-subtitle {
          color: var(--text-secondary);
          font-size: 0.7rem;
          margin-bottom: 0.5rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          opacity: 0.7;
        }

        .mode-card-description {
          color: var(--text-secondary);
          font-size: 0.8rem;
          line-height: 1.4;
          margin-bottom: 0.75rem;
        }

        .mode-card-features {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .mode-feature {
          background: rgba(127, 180, 217, 0.15);
          border: 1px solid rgba(127, 180, 217, 0.3);
          padding: 0.15rem 0.5rem;
          border-radius: 15px;
          font-size: 0.65rem;
          color: var(--text-primary);
          letter-spacing: 0.03em;
        }

        /* Team Deathmatch card - red/aggressive accent */
        .mode-card.team-deathmatch-card .mode-card-title { color: #e85a5a; }
        .mode-card.team-deathmatch-card { border-color: rgba(232, 90, 90, 0.25); }
        .mode-card.team-deathmatch-card::before { background: linear-gradient(135deg, transparent, rgba(232, 90, 90, 0.06)); }
        .mode-card.team-deathmatch-card:hover { border-color: #e85a5a; box-shadow: 0 10px 30px rgba(232, 90, 90, 0.15); }
        .mode-card.team-deathmatch-card.selected { border-color: #e85a5a; background: rgba(232, 90, 90, 0.08); box-shadow: 0 0 30px rgba(232, 90, 90, 0.2); }
        .mode-card.team-deathmatch-card .mode-feature { background: rgba(232, 90, 90, 0.15); border-color: rgba(232, 90, 90, 0.3); }

        .selected-mode-display {
          text-align: center;
          color: var(--text-secondary);
          font-size: 0.875rem;
          margin-top: 0.5rem;
          letter-spacing: 0.05em;
        }

        .selected-mode-display strong {
          color: var(--primary-color);
          font-weight: 500;
        }

        .landscape-orientation-prompt {
          position: absolute;
          inset: 0;
          z-index: 9;
          display: none;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .landscape-orientation-card {
          pointer-events: auto;
          width: min(92vw, 360px);
          background: rgba(12, 22, 34, 0.92);
          border: 1px solid rgba(127, 180, 217, 0.45);
          border-radius: 14px;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
          padding: 0.9rem 1rem;
          text-align: center;
          color: var(--text-primary);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .landscape-orientation-icon {
          font-size: 1.4rem;
          line-height: 1;
          color: var(--primary-color);
          margin-bottom: 0.4rem;
          text-shadow: 0 0 12px rgba(127, 180, 217, 0.35);
        }

        .landscape-orientation-text {
          font-size: 0.85rem;
          letter-spacing: 0.04em;
          margin-bottom: 0.6rem;
        }

        .landscape-orientation-dismiss {
          appearance: none;
          border: 1px solid rgba(127, 180, 217, 0.45);
          background: rgba(127, 180, 217, 0.15);
          color: var(--primary-color);
          border-radius: 999px;
          min-height: 44px;
          padding: 0.35rem 0.95rem;
          cursor: pointer;
          touch-action: manipulation;
          font: inherit;
          font-size: 0.78rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        @media (orientation: portrait) and (max-width: 768px) {
          .landscape-orientation-prompt.visible {
            display: flex;
          }
        }

        /* Error Panel Styles */
        .error-panel {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(20, 35, 50, 0.95);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 2px solid #ff6b6b;
          border-radius: 20px;
          padding: 2rem;
          max-width: 500px;
          width: 90%;
          z-index: 10001;
          box-shadow: 0 20px 60px rgba(255, 107, 107, 0.3);
          animation: errorFadeIn 0.3s ease-out;
        }

        @keyframes errorFadeIn {
          from {
            opacity: 0;
            transform: translate(-50%, -45%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }

        .error-panel-title {
          color: #ff6b6b;
          font-size: 1.5rem;
          font-weight: 500;
          margin-bottom: 1rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          text-align: center;
        }

        .error-panel-message {
          color: var(--text-primary);
          font-size: 0.95rem;
          line-height: 1.6;
          margin-bottom: 1.5rem;
          text-align: center;
        }

        .error-panel-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .error-panel-button {
          background: rgba(127, 180, 217, 0.2);
          border: 1px solid var(--primary-color);
          color: var(--primary-color);
          padding: 0.75rem 1.5rem;
          border-radius: 15px;
          cursor: pointer;
          font-family: inherit;
          font-size: 0.9rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .error-panel-button:hover {
          background: rgba(127, 180, 217, 0.3);
          border-color: #ffffff;
          color: #ffffff;
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(127, 180, 217, 0.2);
        }

        .error-panel-button.primary {
          background: rgba(255, 107, 107, 0.2);
          border-color: #ff6b6b;
          color: #ff6b6b;
        }

        .error-panel-button.primary:hover {
          background: rgba(255, 107, 107, 0.3);
          border-color: #ff8787;
          color: #ff8787;
        }
      </style>

      <div class="loading-content">
        <div class="header-section">
          <h1 class="game-title">TERROR IN THE JUNGLE</h1>
          <div class="subtitle">US Forces vs OPFOR</div>
        </div>

        <div class="loading-section">
          <div class="loading-bar">
            <div class="progress-fill" style="width: 0%"></div>
            <span class="percent-text">0%</span>
          </div>
          <div class="phase-text">Initializing...</div>
        </div>

        <div class="tip-container">
          <div class="tip-label">TIP</div>
          <div class="tip-text"></div>
        </div>

        <!-- Game Mode Selection -->
        <div class="mode-selection-container">
          <div class="mode-cards">
            <div class="mode-card zone-control-card selected" data-mode="zone_control">
              <div class="mode-card-title">Zone Control</div>
              <div class="mode-card-subtitle">Classic</div>
              <div class="mode-card-description">
                Strategic 3-zone combat
              </div>
              <div class="mode-card-features">
                <div class="mode-feature">3 Zones</div>
                <div class="mode-feature">60 Units</div>
                <div class="mode-feature">3 Min</div>
                <div class="mode-feature">300 Tickets</div>
              </div>
            </div>

            <div class="mode-card open-frontier-card" data-mode="open_frontier">
              <div class="mode-card-title">Open Frontier</div>
              <div class="mode-card-subtitle">Large Scale</div>
              <div class="mode-card-description">
                Massive 10-zone battlefield
              </div>
              <div class="mode-card-features">
                <div class="mode-feature">10 Zones</div>
                <div class="mode-feature">120+ Units</div>
                <div class="mode-feature">15 Min</div>
                <div class="mode-feature">1000 Tickets</div>
              </div>
            </div>

            <div class="mode-card team-deathmatch-card" data-mode="tdm">
              <div class="mode-card-title">Team Deathmatch</div>
              <div class="mode-card-subtitle">Pure Combat</div>
              <div class="mode-card-description">
                Eliminate the enemy team - pure combat, no objectives
              </div>
              <div class="mode-card-features">
                <div class="mode-feature">400x400</div>
                <div class="mode-feature">15v15</div>
                <div class="mode-feature">5 Min</div>
              </div>
            </div>
          </div>

          <div class="selected-mode-display">
            Selected Mode: <strong>ZONE CONTROL</strong>
          </div>
        </div>

        <div class="menu-buttons">
          <button class="menu-button play-button">PLAY ZONE CONTROL</button>
          <button class="menu-button secondary-button settings-button">SETTINGS</button>
          <button class="menu-button secondary-button how-to-play-button">HOW TO PLAY</button>
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
    // Game mode selection
    this.zoneControlCard.addEventListener('pointerdown', this.handleZoneControlClick);
    this.zoneControlCard.addEventListener('click', (e) => e.preventDefault());
    this.openFrontierCard.addEventListener('pointerdown', this.handleOpenFrontierClick);
    this.openFrontierCard.addEventListener('click', (e) => e.preventDefault());
    this.teamDeathmatchCard.addEventListener('pointerdown', this.handleTeamDeathmatchClick);
    this.teamDeathmatchCard.addEventListener('click', (e) => e.preventDefault());

    // Play button
    this.playButton.addEventListener('pointerdown', this.handlePlayClick);
    this.playButton.addEventListener('click', (e) => e.preventDefault());

    this.settingsButton.addEventListener('pointerdown', this.handleSettingsClick);
    this.settingsButton.addEventListener('click', (e) => e.preventDefault());
    this.howToPlayButton.addEventListener('pointerdown', this.handleHowToPlayClick);
    this.howToPlayButton.addEventListener('click', (e) => e.preventDefault());
  }

  private selectGameMode(mode: GameMode): void {
    this.selectedGameMode = mode;

    // Update selected state
    this.zoneControlCard.classList.toggle('selected', mode === GameMode.ZONE_CONTROL);
    this.openFrontierCard.classList.toggle('selected', mode === GameMode.OPEN_FRONTIER);
    this.teamDeathmatchCard.classList.toggle('selected', mode === GameMode.TEAM_DEATHMATCH);

    // Update display text
    const modeName =
      mode === GameMode.ZONE_CONTROL
        ? 'ZONE CONTROL'
        : mode === GameMode.OPEN_FRONTIER
          ? 'OPEN FRONTIER'
          : 'TEAM DEATHMATCH';
    this.selectedModeDisplay.innerHTML = `Selected Mode: <strong>${modeName}</strong>`;
    this.playButton.textContent = `PLAY ${modeName}`;
  }

  public updateProgress(phaseId: string, progress: number): void {
    this.progress.updateProgress(phaseId, progress);
  }

  public setPhaseComplete(phaseId: string): void {
    this.progress.setPhaseComplete(phaseId);
  }

  public showMainMenu(): void {
    // Mark initialization as complete
    this.markInitialized();

    // Hide loading bar and show menu buttons
    const buttons = this.container.querySelector('.menu-buttons');
    if (buttons) {
      buttons.classList.add('visible');
    }

    // Show mode selection
    this.modeSelectionContainer.classList.add('visible');

    this.progress.showComplete();

    // On touch devices, show optional fullscreen prompt (does not block game start)
    if (isTouchDevice()) {
      this.showFullscreenPrompt();
    }

    if (isTouchDevice() && isMobileViewport() && isPortraitViewport()) {
      this.showLandscapePrompt();
    }
  }

  /**
   * Show a "Tap to go fullscreen" prompt on touch devices. Tapping requests fullscreen
   * but does not block starting the game if the user declines.
   */
  private showFullscreenPrompt(): void {
    if (this.fullscreenPrompt) return;
    const prompt = document.createElement('div');
    prompt.className = 'fullscreen-prompt';
    prompt.setAttribute('role', 'button');
    prompt.tabIndex = 0;
    prompt.innerHTML = `
      <span class="fullscreen-prompt-text">Tap to go fullscreen</span>
      <span class="fullscreen-prompt-hint">(optional — fullscreen + landscape works best)</span>
    `;
    prompt.style.cssText = `
      position: absolute;
      bottom: 1rem;
      left: 50%;
      transform: translateX(-50%);
      padding: 0.6rem 1.2rem;
      min-height: 44px;
      min-width: 160px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(20, 35, 50, 0.85);
      border: 1px solid rgba(127, 180, 217, 0.4);
      border-radius: 12px;
      color: var(--primary-color);
      font-size: 0.85rem;
      cursor: pointer;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      z-index: 10;
      transition: opacity 0.2s, background 0.2s;
    `;
    const hint = prompt.querySelector('.fullscreen-prompt-hint') as HTMLElement;
    if (hint) hint.style.cssText = 'font-size: 0.7rem; opacity: 0.8; margin-top: 0.2rem;';
    const handleTap = () => {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen()
          .then(() => {
            tryLockLandscapeOrientation();
          })
          .catch(() => { /* user declined or not allowed */ })
          .finally(() => {
            this.dismissFullscreenPrompt();
          });
      } else {
        this.dismissFullscreenPrompt();
      }
    };
    prompt.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handleTap();
    });
    prompt.addEventListener('click', (e) => e.preventDefault());
    this.container.appendChild(prompt);
    this.fullscreenPrompt = prompt;
  }

  private showLandscapePrompt(): void {
    if (landscapePromptDismissedForSession || this.landscapePrompt || !isPortraitViewport()) return;

    const prompt = document.createElement('div');
    prompt.className = 'landscape-orientation-prompt visible';
    prompt.innerHTML = `
      <div class="landscape-orientation-card" role="status" aria-live="polite">
        <div class="landscape-orientation-icon" aria-hidden="true">↻ 📱</div>
        <div class="landscape-orientation-text">Rotate your device for the best experience</div>
        <button class="landscape-orientation-dismiss" type="button">Continue anyway</button>
      </div>
    `;

    const dismissButton = prompt.querySelector('.landscape-orientation-dismiss');
    dismissButton?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      landscapePromptDismissedForSession = true;
      this.dismissLandscapePrompt();
    });
    dismissButton?.addEventListener('click', (e) => e.preventDefault());

    window.addEventListener('orientationchange', this.handleOrientationOrResize);
    window.addEventListener('resize', this.handleOrientationOrResize);
    this.container.appendChild(prompt);
    this.landscapePrompt = prompt;
  }

  private dismissLandscapePrompt(): void {
    window.removeEventListener('orientationchange', this.handleOrientationOrResize);
    window.removeEventListener('resize', this.handleOrientationOrResize);
    if (this.landscapePrompt && this.landscapePrompt.parentElement) {
      this.landscapePrompt.remove();
      this.landscapePrompt = null;
    }
  }

  private dismissFullscreenPrompt(): void {
    if (this.fullscreenPrompt && this.fullscreenPrompt.parentElement) {
      this.fullscreenPrompt.remove();
      this.fullscreenPrompt = null;
    }
  }

  public hide(): void {
    // Hide immediately with fade
    this.container.classList.add('hidden');
    setTimeout(() => {
      this.isVisible = false;
    }, 500);
  }

  public show(): void {
    this.container.classList.remove('hidden');
    this.isVisible = true;
  }

  public onPlay(callback: (mode: GameMode) => void): void {
    this.onPlayCallback = callback;
  }

  public onSettings(callback: () => void): void {
    this.onSettingsCallback = callback;
  }

  public onHowToPlay(callback: () => void): void {
    this.onHowToPlayCallback = callback;
  }

  /**
   * Show an error panel with title, message, and actions
   */
  public showError(title: string, message: string): void {
    // Clear any existing error panel
    if (this.errorPanel) {
      this.errorPanel.remove();
    }

    // Clear initialization timeout if running
    if (this.initTimeoutId !== null) {
      clearTimeout(this.initTimeoutId);
      this.initTimeoutId = null;
    }

    // Create error panel
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

    // Add event listeners
    const retryButton = this.errorPanel.querySelector('.retry-button');
    const reportButton = this.errorPanel.querySelector('.report-button');

    retryButton?.addEventListener('pointerdown', () => {
      window.location.reload();
    });
    retryButton?.addEventListener('click', (e) => e.preventDefault());

    reportButton?.addEventListener('pointerdown', () => {
      window.open('https://github.com/matthew-kissinger/terror-in-the-jungle/issues', '_blank');
    });
    reportButton?.addEventListener('click', (e) => e.preventDefault());

    // Add to DOM
    document.body.appendChild(this.errorPanel);
  }

  /**
   * Start a timeout that warns the user if initialization takes too long
   */
  public startInitTimeout(): void {
    // Clear any existing timeout
    if (this.initTimeoutId !== null) {
      clearTimeout(this.initTimeoutId);
    }

    // Set 30 second timeout
    this.initTimeoutId = window.setTimeout(() => {
      if (!this.isInitialized) {
        this.showError(
          'Initialization Taking Too Long',
          'The game is taking longer than expected to initialize. This may be due to slow network, browser issues, or device limitations. You can try refreshing the page.'
        );
      }
    }, 30000);
  }

  /**
   * Clear the initialization timeout (called when init succeeds)
   */
  public clearInitTimeout(): void {
    if (this.initTimeoutId !== null) {
      clearTimeout(this.initTimeoutId);
      this.initTimeoutId = null;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Track initialization state for timeout
  private isInitialized = false;
  public markInitialized(): void {
    this.isInitialized = true;
    this.clearInitTimeout();
  }

  public dispose(): void {
    this.dismissFullscreenPrompt();
    this.dismissLandscapePrompt();
    // Remove event listeners
    this.zoneControlCard.removeEventListener('pointerdown', this.handleZoneControlClick);
    this.openFrontierCard.removeEventListener('pointerdown', this.handleOpenFrontierClick);
    this.teamDeathmatchCard.removeEventListener('pointerdown', this.handleTeamDeathmatchClick);
    this.playButton.removeEventListener('pointerdown', this.handlePlayClick);
    this.settingsButton.removeEventListener('pointerdown', this.handleSettingsClick);
    this.howToPlayButton.removeEventListener('pointerdown', this.handleHowToPlayClick);

    // Clear timeout
    this.clearInitTimeout();

    // Remove error panel if exists
    if (this.errorPanel) {
      this.errorPanel.remove();
      this.errorPanel = null;
    }

    if (this.container?.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
    this.panels.dispose();
  }

  // Helper method for LoadingManager integration
  public createLoadingManager(): THREE.LoadingManager {
    const manager = new THREE.LoadingManager();

    manager.onStart = (_url, loaded, total) => {
      void loaded;
      void total;
    };

    manager.onProgress = (url, loaded, total) => {
      void loaded;
      void total;

      // Update texture loading phase
      const currentPhase = this.progress.getCurrentPhase();
      if (currentPhase === 'textures' || url.includes('.png') || url.includes('.jpg')) {
        this.updateProgress('textures', loaded / total);
      } else if (url.includes('.wav') || url.includes('.ogg')) {
        this.updateProgress('audio', loaded / total);
      }
    };

    manager.onLoad = () => {
    };

    manager.onError = (_url) => {
    };

    return manager;
  }
}
