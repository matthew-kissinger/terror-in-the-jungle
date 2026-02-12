import { Logger } from '../utils/Logger';
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
import { SettingsManager } from '../config/SettingsManager';
import { MobilePauseOverlay } from '../ui/MobilePauseOverlay';
import { WebGLContextRecovery } from './WebGLContextRecovery';

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
  private settingsUnsubscribe?: () => void;
  private mobilePauseOverlay?: MobilePauseOverlay;
  private contextRecovery: WebGLContextRecovery;

  constructor() {
    Logger.info('core', ' Initializing Pixel Art Sandbox Engine...');
    Logger.info('core', 'Three.js version:', THREE.REVISION);

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

    this.contextRecovery = new WebGLContextRecovery(this.sandboxRenderer);
    this.setupEventListeners();
    this.setupMenuCallbacks();
    this.mobilePauseOverlay = new MobilePauseOverlay(this);
    this.mobilePauseOverlay.setup();
  }

  /**
   * Async initialization - must be awaited before start().
   * Extracted from constructor since constructors cannot be async.
   */
  public async initialize(): Promise<void> {
    await this.initializeSystems();
  }

  private setupEventListeners(): void {
    Input.setupEventListeners(this);
  }

  private setupMenuCallbacks(): void {
    // Play button starts the game with selected mode
    this.loadingScreen.onPlay((mode: GameMode) => {
      this.startGameWithMode(mode);
    });

    // Settings button opens settings panel (handled in LoadingScreen)
    this.loadingScreen.onSettings(() => {
      // Panel show/hide handled by LoadingScreen.handleSettingsClick
    });

    // How to play button opens how-to-play panel (handled in LoadingScreen)
    this.loadingScreen.onHowToPlay(() => {
      // Panel show/hide handled by LoadingScreen.handleHowToPlayClick
    });

    // Subscribe to settings changes and apply to game systems in real time
    const settings = SettingsManager.getInstance();
    this.settingsUnsubscribe = settings.onChange((key, value) => {
      this.applySettingChange(key, value);
    });

    // Apply initial settings that affect pre-game state
    this.applyInitialSettings();
  }

  private applyInitialSettings(): void {
    const settings = SettingsManager.getInstance();

    // Apply shadow setting to renderer immediately
    const shadowsEnabled = settings.get('enableShadows');
    this.sandboxRenderer.renderer.shadowMap.enabled = shadowsEnabled;

    // Apply FPS overlay visibility
    if (settings.get('showFPS')) {
      // Will be shown when game starts; default state handled in togglePerformanceStats
    }
  }

  private applySettingChange(key: string, value: unknown): void {
    switch (key) {
      case 'masterVolume': {
        const settings = SettingsManager.getInstance();
        if (this.systemManager.audioManager) {
          this.systemManager.audioManager.setMasterVolume(settings.getMasterVolumeNormalized());
        }
        break;
      }
      case 'enableShadows': {
        const enabled = value as boolean;
        this.sandboxRenderer.renderer.shadowMap.enabled = enabled;
        // Mark all materials as needing update for shadow change
        this.sandboxRenderer.renderer.shadowMap.needsUpdate = true;
        if (this.sandboxRenderer.moonLight) {
          this.sandboxRenderer.moonLight.castShadow = enabled;
        }
        Logger.info('settings', `Shadows ${enabled ? 'enabled' : 'disabled'}`);
        break;
      }
      case 'showFPS': {
        const show = value as boolean;
        if (show && !this.performanceOverlay.isVisible()) {
          this.performanceOverlay.toggle();
        } else if (!show && this.performanceOverlay.isVisible()) {
          this.performanceOverlay.toggle();
        }
        break;
      }
      case 'graphicsQuality': {
        this.applyGraphicsQuality(value as string);
        break;
      }
      // mouseSensitivity is read directly by PlayerInput each frame
    }
  }

  private applyGraphicsQuality(quality: string): void {
    const renderer = this.sandboxRenderer.renderer;
    const moonLight = this.sandboxRenderer.moonLight;

    switch (quality) {
      case 'low':
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
        if (moonLight) {
          moonLight.shadow.mapSize.width = 512;
          moonLight.shadow.mapSize.height = 512;
        }
        break;
      case 'medium':
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        if (moonLight) {
          moonLight.shadow.mapSize.width = 2048;
          moonLight.shadow.mapSize.height = 2048;
        }
        break;
      case 'high':
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        if (moonLight) {
          moonLight.shadow.mapSize.width = 4096;
          moonLight.shadow.mapSize.height = 4096;
        }
        break;
      case 'ultra':
        renderer.setPixelRatio(window.devicePixelRatio);
        if (moonLight) {
          moonLight.shadow.mapSize.width = 4096;
          moonLight.shadow.mapSize.height = 4096;
        }
        break;
    }

    // Force shadow map update
    if (moonLight) {
      moonLight.shadow.map?.dispose();
      moonLight.shadow.map = null;
    }
    renderer.shadowMap.needsUpdate = true;

    Logger.info('settings', `Graphics quality set to: ${quality}`);
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

  /** True while WebGL context is lost (checked by game loop to skip rendering) */
  public get contextLost(): boolean {
    return this.contextRecovery.contextLost;
  }

  public dispose(): void {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
    }
    this.contextRecovery.dispose();
    this.mobilePauseOverlay?.dispose();
    Input.disposeEventListeners();
    this.loadingScreen.dispose();
    this.sandboxRenderer.dispose();
    this.systemManager.dispose();
    this.performanceOverlay.dispose();
    this.timeIndicator.dispose();
    this.logOverlay.dispose();
    Logger.info('core', 'Sandbox disposed');
  }
}
