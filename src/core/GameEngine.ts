import { Logger } from '../utils/Logger';
import * as THREE from 'three';
import '../style.css';

import { GameUI } from '../ui/screens/GameUI';
import { SystemManager } from './SystemManager';
import { GameRenderer } from './GameRenderer';
import { GameLaunchSelection, GameMode } from '../config/gameModeTypes';
import { PerformanceOverlay } from '../ui/debug/PerformanceOverlay';
import { TimeIndicator } from '../ui/debug/TimeIndicator';
import { LogOverlay } from '../ui/debug/LogOverlay';
import { RuntimeMetrics } from './RuntimeMetrics';
import { SandboxConfig, getSandboxConfig, isSandboxMode } from './SandboxModeDetector';
import { SettingsManager } from '../config/SettingsManager';
import { MobilePauseOverlay } from '../ui/MobilePauseOverlay';
import { WebGLContextGuard } from './WebGLContextGuard';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import { StartupFlowController } from './StartupFlowController';
import { GameEventBus } from './GameEventBus';
import { objectPool } from '../utils/ObjectPoolManager';
import { resetHeightQueryCache } from '../systems/terrain/HeightQueryCache';
import { spatialGridManager } from '../systems/combat/SpatialGridManager';
import { InputContextManager } from '../systems/input/InputContextManager';

// Import split modules
import * as Init from './GameEngineInit';
import * as Input from './GameEngineInput';
import * as Loop from './GameEngineLoop';
import { markStartup } from './StartupTelemetry';
import { isPerfDiagnosticsEnabled } from './PerfDiagnostics';

export class GameEngine {
  // Core components (Public for split module access)
  public loadingScreen: GameUI;
  public renderer: GameRenderer;
  public systemManager: SystemManager;
  public performanceOverlay: PerformanceOverlay;
  public timeIndicator: TimeIndicator;
  public logOverlay: LogOverlay;
  public runtimeMetrics?: RuntimeMetrics;
  public sandboxConfig: SandboxConfig | null;
  public readonly sandboxEnabled: boolean;
  public readonly startupFlow = new StartupFlowController();

  // State (Public for split module access)
  public clock = new THREE.Timer();
  public isInitialized = false;
  public gameStarted = false;
  public gameStartPending = false;
  public lastFrameDelta = 1 / 60;
  public currentPixelSize = 1;
  public animationFrameId: number | null = null;
  public isLoopRunning = false;
  public isDisposed = false;
  private settingsUnsubscribe?: () => void;
  private mobilePauseOverlay?: MobilePauseOverlay;
  private contextRecovery: WebGLContextGuard;

  constructor() {
    Logger.info('core', ' Initializing engine...');
    Logger.info('core', 'Three.js version:', THREE.REVISION);

    this.sandboxEnabled = isSandboxMode();
    this.sandboxConfig = this.sandboxEnabled ? getSandboxConfig() : null;

    // Create UI screen state machine (replaces old StartScreen)
    this.loadingScreen = new GameUI();
    this.loadingScreen.mount(document.body);

    // Create renderer and system manager
    this.renderer = new GameRenderer();
    this.systemManager = new SystemManager();
    this.performanceOverlay = new PerformanceOverlay();
    this.timeIndicator = new TimeIndicator();
    this.logOverlay = new LogOverlay();
    if (import.meta.env.DEV && isPerfDiagnosticsEnabled()) {
      this.runtimeMetrics = new RuntimeMetrics();
    }

    this.contextRecovery = new WebGLContextGuard(this.renderer);
    this.setupEventListeners();
    this.setupMenuCallbacks();
    this.clock.connect(document);
    this.mobilePauseOverlay = new MobilePauseOverlay(this);
    this.mobilePauseOverlay.setup();
  }

  /**
   * Async initialization - must be awaited before start().
   * Extracted from constructor since constructors cannot be async.
   */
  public async initialize(): Promise<void> {
    markStartup('engine.initialize.begin');
    await this.initializeSystems();
    markStartup('engine.initialize.end');
  }

  private setupEventListeners(): void {
    Input.setupEventListeners(this);
  }

  private setupMenuCallbacks(): void {
    // Play button starts the game with selected mode
    this.loadingScreen.onPlay((selection: GameLaunchSelection) => {
      this.startGameWithMode(selection);
    });

    // Settings button opens settings panel (handled in StartScreen)
    this.loadingScreen.onSettings(() => {
      // Panel show/hide handled by StartScreen.handleSettingsClick
    });

    // How to play button opens how-to-play panel (handled in StartScreen)
    this.loadingScreen.onHowToPlay(() => {
      // Panel show/hide handled by StartScreen.handleHowToPlayClick
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
    this.renderer.renderer.shadowMap.enabled = shadowsEnabled;

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
        this.renderer.renderer.shadowMap.enabled = enabled;
        // Mark all materials as needing update for shadow change
        this.renderer.renderer.shadowMap.needsUpdate = true;
        if (this.renderer.moonLight) {
          this.renderer.moonLight.castShadow = enabled;
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
        performanceTelemetry.setEnabled(
          this.performanceOverlay.isVisible()
          || this.sandboxEnabled
          || (import.meta.env.DEV && isPerfDiagnosticsEnabled())
        );
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
    const renderer = this.renderer.renderer;
    const moonLight = this.renderer.moonLight;
    const pp = this.renderer.postProcessing;

    switch (quality) {
      case 'low':
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
        renderer.shadowMap.enabled = false;
        if (moonLight) {
          moonLight.castShadow = false;
          moonLight.shadow.mapSize.width = 512;
          moonLight.shadow.mapSize.height = 512;
        }
        if (pp) pp.setPixelSize(4);
        break;
      case 'medium':
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.shadowMap.enabled = true;
        if (moonLight) {
          moonLight.castShadow = true;
          moonLight.shadow.mapSize.width = 2048;
          moonLight.shadow.mapSize.height = 2048;
        }
        if (pp) pp.setPixelSize(3);
        break;
      case 'high':
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        if (moonLight) {
          moonLight.castShadow = true;
          moonLight.shadow.mapSize.width = 4096;
          moonLight.shadow.mapSize.height = 4096;
        }
        if (pp) pp.setPixelSize(1.5);
        break;
      case 'ultra':
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        if (moonLight) {
          moonLight.castShadow = true;
          moonLight.shadow.mapSize.width = 4096;
          moonLight.shadow.mapSize.height = 4096;
        }
        if (pp) pp.setPixelSize(1);
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

  public startGameWithMode(selection: GameLaunchSelection | GameMode): Promise<void> {
    return Init.startGameWithMode(this, selection);
  }

  public startGame(initialSpawnPosition?: THREE.Vector3): void {
    return Init.startGame(this, initialSpawnPosition);
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
    Loop.start(this);
  }

  /** True while WebGL context is lost (checked by game loop to skip rendering) */
  public get contextLost(): boolean {
    return this.contextRecovery.contextLost;
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    Loop.stop(this);
    Loop.resetState();
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
    }
    this.clock.dispose();
    this.contextRecovery.dispose();
    this.mobilePauseOverlay?.dispose();
    Input.disposeEventListeners();
    this.loadingScreen.dispose();
    this.systemManager.dispose();
    this.renderer.dispose();
    this.performanceOverlay.dispose();
    this.timeIndicator.dispose();
    this.logOverlay.dispose();
    GameEventBus.clear();
    performanceTelemetry.reset();
    objectPool.reset();
    resetHeightQueryCache();
    spatialGridManager.reset();
    InputContextManager.getInstance().reset();
    Logger.info('core', 'Engine disposed');
  }
}
