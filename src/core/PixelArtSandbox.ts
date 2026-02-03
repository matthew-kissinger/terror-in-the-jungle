import * as THREE from 'three';
import '../style.css';

import { LoadingScreen } from '../ui/loading/LoadingScreen';
import { SandboxSystemManager } from './SandboxSystemManager';
import { SandboxRenderer } from './SandboxRenderer';
import { GameMode } from '../config/gameModes';
import { PerformanceOverlay } from '../ui/debug/PerformanceOverlay';
import { TimeIndicator } from '../ui/debug/TimeIndicator';
import { LogOverlay } from '../ui/debug/LogOverlay';
import { SandboxMetrics } from './SandboxMetrics';
import { SandboxConfig, getSandboxConfig, isSandboxMode } from './SandboxModeDetector';

// Import split modules
import * as Init from './PixelArtSandboxInit';
import * as Input from './PixelArtSandboxInput';
import * as Loop from './PixelArtSandboxLoop';

export class PixelArtSandbox {
  // Core components (Public for split module access)
  public loadingScreen: LoadingScreen;
  public sandboxRenderer: SandboxRenderer;
  public systemManager: SandboxSystemManager;
  public performanceOverlay: PerformanceOverlay;
  public timeIndicator: TimeIndicator;
  public logOverlay: LogOverlay;
  public sandboxMetrics: SandboxMetrics;
  public sandboxConfig: SandboxConfig | null;
  public readonly sandboxEnabled: boolean;

  // State (Public for split module access)
  public clock = new THREE.Clock();
  public isInitialized = false;
  public gameStarted = false;
  public lastFrameDelta = 1 / 60;
  public currentPixelSize = 1;

  constructor() {
    console.log('🎮 Initializing Pixel Art Sandbox Engine...');
    console.log('Three.js version:', THREE.REVISION);

    this.sandboxEnabled = isSandboxMode();
    this.sandboxConfig = this.sandboxEnabled ? getSandboxConfig() : null;

    // Create loading screen immediately
    this.loadingScreen = new LoadingScreen();

    // Create renderer and system manager
    this.sandboxRenderer = new SandboxRenderer();
    this.systemManager = new SandboxSystemManager();
    this.performanceOverlay = new PerformanceOverlay();
    this.timeIndicator = new TimeIndicator();
    this.logOverlay = new LogOverlay();
    this.sandboxMetrics = new SandboxMetrics();

    this.setupEventListeners();
    this.setupMenuCallbacks();

    // Start initialization process
    this.initializeSystems();
  }

  private setupEventListeners(): void {
    Input.setupEventListeners(this);
  }

  private setupMenuCallbacks(): void {
    // Play button starts the game with selected mode
    this.loadingScreen.onPlay((mode: GameMode) => {
      this.startGameWithMode(mode);
    });

    // Settings button (placeholder)
    this.loadingScreen.onSettings(() => {
      console.log('Settings menu not yet implemented');
    });

    // How to play button (placeholder)
    this.loadingScreen.onHowToPlay(() => {
      console.log('How to play not yet implemented');
    });
  }

  private async initializeSystems(): Promise<void> {
    return Init.initializeSystems(this);
  }

  public async loadGameAssets(): Promise<void> {
    return Init.loadGameAssets(this);
  }

  public startGameWithMode(mode: GameMode): void {
    return Init.startGameWithMode(this, mode);
  }

  public startGame(): void {
    return Init.startGame(this);
  }

  public showWelcomeMessage(): void {
    return Init.showWelcomeMessage(this);
  }

  public togglePerformanceStats(): void {
    return Input.togglePerformanceStats(this);
  }

  public toggleRealtimeStatsOverlay(): void {
    return Input.toggleRealtimeStatsOverlay(this);
  }

  public togglePostProcessing(): void {
    return Input.togglePostProcessing(this);
  }

  public toggleLogOverlay(): void {
    return Input.toggleLogOverlay(this);
  }

  public toggleTimeIndicator(): void {
    return Input.toggleTimeIndicator(this);
  }

  public adjustPixelSize(delta: number): void {
    return Input.adjustPixelSize(this, delta);
  }

  public start(): void {
    this.animate();
  }

  private animate(): void {
    Loop.animate(this);
  }

  public dispose(): void {
    this.loadingScreen.dispose();
    this.sandboxRenderer.dispose();
    this.systemManager.dispose();
    this.performanceOverlay.dispose();
    this.timeIndicator.dispose();
    this.logOverlay.dispose();
    console.log('🧹 Sandbox disposed');
  }
}