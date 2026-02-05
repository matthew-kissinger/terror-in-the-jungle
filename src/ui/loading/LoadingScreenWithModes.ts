import { Logger } from '../../utils/Logger';
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
          margin-top: 30px;
          margin-bottom: 20px;
        }

        .mode-selection-container.visible {
          display: block;
        }

        .mode-cards {
          display: flex;
          gap: 20px;
          justify-content: center;
          margin-bottom: 20px;
        }

        .mode-card {
          background: rgba(0, 0, 0, 0.5);
          border: 2px solid rgba(74, 124, 78, 0.3);
          border-radius: 10px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.3s ease;
          width: 250px;
        }

        .mode-card:hover {
          border-color: rgba(74, 124, 78, 0.6);
          background: rgba(74, 124, 78, 0.1);
          transform: translateY(-5px);
        }

        .mode-card.selected {
          border-color: #4a7c4e;
          background: rgba(74, 124, 78, 0.2);
          box-shadow: 0 0 20px rgba(74, 124, 78, 0.4);
        }

        .mode-card-title {
          color: #8fbc8f;
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 10px;
          text-transform: uppercase;
        }

        .mode-card-subtitle {
          color: #708070;
          font-size: 12px;
          margin-bottom: 15px;
          text-transform: uppercase;
        }

        .mode-card-description {
          color: #c4b5a0;
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 15px;
        }

        .mode-card-features {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .mode-feature {
          background: rgba(74, 124, 78, 0.2);
          border: 1px solid rgba(74, 124, 78, 0.4);
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          color: #8fbc8f;
        }

        .selected-mode-display {
          text-align: center;
          color: #708070;
          font-size: 14px;
          margin-top: 10px;
        }

        .selected-mode-display strong {
          color: #8fbc8f;
        }
      </style>

      <div class="loading-content">
        <h1 class="game-title">TERROR IN THE JUNGLE</h1>
        <div class="subtitle">US Forces vs OPFOR</div>

        <div class="loading-bar">
          <div class="progress-fill" style="width: 0%"></div>
          <span class="percent-text">0%</span>
        </div>

        <div class="phase-text">Initializing...</div>

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
                Fast-paced combat over 3 strategic zones. Quick 3-minute matches.
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
                Massive 2x2 mile battlefield with 10 zones. Epic 15-minute campaigns.
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
      Logger.info('loading', `Loading started: ${loaded}/${total} items`);
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

      Logger.info('loading', `Loading: ${url} (${loaded}/${total})`);
    };

    manager.onLoad = () => {
      Logger.info('loading', 'All items loaded!');
    };

    manager.onError = (url) => {
      Logger.error('loading', `Error loading: ${url}`);
    };

    return manager;
  }
}