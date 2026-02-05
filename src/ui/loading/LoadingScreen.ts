import * as THREE from 'three';
import { LOADING_PHASES } from '../../config/loading';
import { LoadingStyles } from './LoadingStyles';
import { LoadingPanels } from './LoadingPanels';
import { LoadingProgress } from './LoadingProgress';
import { GameMode } from '../../config/gameModes';

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

  // Game mode selection elements
  private modeSelectionContainer: HTMLDivElement;
  private zoneControlCard: HTMLDivElement;
  private openFrontierCard: HTMLDivElement;
  private selectedModeDisplay: HTMLDivElement;

  // Refactored modules
  private panels: LoadingPanels;
  private progress: LoadingProgress;

  private isVisible: boolean = true;
  private selectedGameMode: GameMode = GameMode.ZONE_CONTROL;
  private onPlayCallback?: (mode: GameMode) => void;
  private onSettingsCallback?: () => void;
  private onHowToPlayCallback?: () => void;

  // Handler references for cleanup
  private handleZoneControlClick = () => this.selectGameMode(GameMode.ZONE_CONTROL);
  private handleOpenFrontierClick = () => this.selectGameMode(GameMode.OPEN_FRONTIER);
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
    this.zoneControlCard.addEventListener('click', this.handleZoneControlClick);
    this.openFrontierCard.addEventListener('click', this.handleOpenFrontierClick);

    // Play button
    this.playButton.addEventListener('click', this.handlePlayClick);

    this.settingsButton.addEventListener('click', this.handleSettingsClick);
    this.howToPlayButton.addEventListener('click', this.handleHowToPlayClick);
  }

  private selectGameMode(mode: GameMode): void {
    this.selectedGameMode = mode;

    // Update selected state
    this.zoneControlCard.classList.toggle('selected', mode === GameMode.ZONE_CONTROL);
    this.openFrontierCard.classList.toggle('selected', mode === GameMode.OPEN_FRONTIER);

    // Update display text
    const modeName = mode === GameMode.ZONE_CONTROL ? 'ZONE CONTROL' : 'OPEN FRONTIER';
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
    // Hide loading bar and show menu buttons
    const buttons = this.container.querySelector('.menu-buttons');
    if (buttons) {
      buttons.classList.add('visible');
    }

    // Show mode selection
    this.modeSelectionContainer.classList.add('visible');

    this.progress.showComplete();
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

  public dispose(): void {
    // Remove event listeners
    this.zoneControlCard.removeEventListener('click', this.handleZoneControlClick);
    this.openFrontierCard.removeEventListener('click', this.handleOpenFrontierClick);
    this.playButton.removeEventListener('click', this.handlePlayClick);
    this.settingsButton.removeEventListener('click', this.handleSettingsClick);
    this.howToPlayButton.removeEventListener('click', this.handleHowToPlayClick);

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