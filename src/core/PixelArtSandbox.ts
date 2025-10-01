import * as THREE from 'three';
import '../style.css';

import { LoadingScreen } from '../ui/loading/LoadingScreen';
import { SandboxSystemManager } from './SandboxSystemManager';
import { SandboxRenderer } from './SandboxRenderer';
import { GameMode } from '../config/gameModes';
import { PerformanceOverlay } from '../ui/debug/PerformanceOverlay';

export class PixelArtSandbox {
  private loadingScreen: LoadingScreen;
  private sandboxRenderer: SandboxRenderer;
  private systemManager: SandboxSystemManager;
  private performanceOverlay: PerformanceOverlay;

  private clock = new THREE.Clock();
  private isInitialized = false;
  private gameStarted = false;
  private lastFrameDelta = 1 / 60;

  constructor() {
    console.log('🎮 Initializing Pixel Art Sandbox Engine...');
    console.log('Three.js version:', THREE.REVISION);

    // Create loading screen immediately
    this.loadingScreen = new LoadingScreen();

    // Create renderer and system manager
    this.sandboxRenderer = new SandboxRenderer();
    this.systemManager = new SandboxSystemManager();
    this.performanceOverlay = new PerformanceOverlay();

    this.setupEventListeners();
    this.setupMenuCallbacks();

    // Start initialization process
    this.initializeSystems();
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', () => this.sandboxRenderer.onWindowResize());

    // Performance monitoring and post-processing controls
    window.addEventListener('keydown', (event) => {
      if (event.key === 'F1') {
        this.togglePerformanceStats();
      } else if (event.key === 'p' || event.key === 'P') {
        this.togglePostProcessing();
      } else if (event.key === 'F2') {
        this.toggleRealtimeStatsOverlay();
      } else if (event.key === '[') {
        this.adjustPixelSize(-1);
      } else if (event.key === ']') {
        this.adjustPixelSize(1);
      } else if (event.key === 'k' || event.key === 'K') {
        // Voluntary respawn with K key
        if (this.gameStarted) {
          const healthSystem = (this.systemManager as any).playerHealthSystem;
          if (healthSystem && healthSystem.isAlive()) {
            console.log('🔄 Initiating voluntary respawn (K pressed)');
            healthSystem.voluntaryRespawn();
          }
        }
      }
    });
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
    try {
      // Initialize all systems
      await this.systemManager.initializeSystems(
        this.sandboxRenderer.scene,
        this.sandboxRenderer.camera,
        (phase, progress) => this.loadingScreen.updateProgress(phase, progress),
        this.sandboxRenderer
      );

      // Phase 5: Final setup
      this.loadingScreen.updateProgress('entities', 0);

      console.log('🎯 Systems initialized, loading assets...');
      await this.loadGameAssets();

      // Create skybox
      const skyboxTexture = this.systemManager.assetLoader.getTexture('skybox');
      if (skyboxTexture) {
        this.systemManager.skybox.createSkybox(skyboxTexture);
        console.log('☁️ Skybox created');
      }

      // Pre-generate spawn area chunks
      console.log('🌍 Pre-generating spawn area...');
      const spawnPosition = new THREE.Vector3(0, 5, -50);
      await this.systemManager.preGenerateSpawnArea(spawnPosition);

      console.log('🌍 World system ready!');
      this.loadingScreen.updateProgress('entities', 1);

      this.isInitialized = true;
      console.log('🚀 Pixel Art Sandbox ready!');

      // Show main menu
      this.loadingScreen.showMainMenu();

    } catch (error) {
      console.error('❌ Failed to initialize sandbox:', error);
    }
  }

  private async loadGameAssets(): Promise<void> {
    const skyboxTexture = this.systemManager.assetLoader.getTexture('skybox');
    if (!skyboxTexture) {
      console.warn('Skybox texture missing; proceeding without skybox.');
    }
    console.log('📦 Asset check complete');
  }

  private startGameWithMode(mode: GameMode): void {
    if (!this.isInitialized || this.gameStarted) return;

    console.log(`🎮 PixelArtSandbox: Starting game with mode: ${mode} (${mode === GameMode.OPEN_FRONTIER ? 'OPEN_FRONTIER' : 'ZONE_CONTROL'})`);
    this.gameStarted = true;

    // Set the game mode in the system manager
    console.log(`🎮 PixelArtSandbox: Calling systemManager.setGameMode(${mode})`);
    this.systemManager.setGameMode(mode);

    this.startGame();
  }

  private startGame(): void {
    if (!this.gameStarted) return;

    // Hide menu and show loading
    this.loadingScreen.hide();
    this.sandboxRenderer.showSpawnLoadingIndicator();
    this.sandboxRenderer.showRenderer();

    const startTime = performance.now();

    setTimeout(() => {
      console.log(`Game ready in ${performance.now() - startTime}ms`);

      // Hide loading indicator
      this.sandboxRenderer.hideSpawnLoadingIndicator();

      // Move player to mode HQ spawn before enabling controls
      try {
        const gm = (this.systemManager as any).gameModeManager;
        const cfg = gm.getCurrentConfig();
        const Faction = { US: 'US', OPFOR: 'OPFOR' } as any;
        const spawn = cfg.zones.find((z: any) => z.isHomeBase && z.owner === Faction.US && (z.id.includes('main') || z.id === 'us_base'));
        if (spawn) {
          const pos = spawn.position.clone();
          pos.y = 5;
          this.systemManager.playerController.setPosition(pos);
        }
      } catch { /* ignore */ }

      // Enable controls after brief delay
      setTimeout(() => {
        // Enable weapon input
        const weapon = this.systemManager.firstPersonWeapon as any;
        if (weapon && typeof weapon.setGameStarted === 'function') {
          weapon.setGameStarted(true);
        }

        // Enable player controller
        const controller = this.systemManager.playerController as any;
        if (controller && typeof controller.setGameStarted === 'function') {
          controller.setGameStarted(true);
        }

        console.log('🖱️ Click anywhere to enable mouse look!');

        // Start ambient audio
        if (this.systemManager.audioManager) {
          this.systemManager.audioManager.startAmbient();
        }

        // Enable AI combat
        if (this.systemManager.combatantSystem &&
            typeof this.systemManager.combatantSystem.enableCombat === 'function') {
          this.systemManager.combatantSystem.enableCombat();
          console.log('⚔️ Combat AI activated!');
        }
      }, 200);
    }, 300);

    // Show crosshair
    this.sandboxRenderer.showCrosshair();
    this.showWelcomeMessage();
  }

  private togglePerformanceStats(): void {
    if (!this.gameStarted) return;

    const debugInfo = this.systemManager.globalBillboardSystem.getDebugInfo();
    const perfStats = this.sandboxRenderer.getPerformanceStats();
    const combatStats = this.systemManager.combatantSystem.getCombatStats();

    console.log('📊 Performance Stats:');
    const fps = 1 / Math.max(0.0001, this.lastFrameDelta);
    console.log(`FPS: ${Math.round(fps)}`);
    console.log(`Draw calls: ${perfStats.drawCalls}`);
    console.log(`Triangles: ${perfStats.triangles}`);
    const vegetationActive = Object.entries(debugInfo)
      .filter(([key]) => key.endsWith('Active'))
      .reduce((sum, [, value]) => sum + (value as number), 0);
    const vegetationReserved = Object.entries(debugInfo)
      .filter(([key]) => key.endsWith('HighWater'))
      .reduce((sum, [, value]) => sum + (value as number), 0);
    console.log(`Vegetation: ${vegetationActive} active / ${vegetationReserved} reserved`);
    console.log(`Combatants - US: ${combatStats.us}, OPFOR: ${combatStats.opfor}`);
    console.log(`Chunks loaded: ${this.systemManager.chunkManager.getLoadedChunkCount()}, ` +
                `Queue: ${this.systemManager.chunkManager.getQueueSize()}, ` +
                `Loading: ${this.systemManager.chunkManager.getLoadingCount()}`);
    console.log(`Chunks tracked: ${debugInfo.chunksTracked}`);
  }

  private toggleRealtimeStatsOverlay(): void {
    if (!this.gameStarted) return;
    this.performanceOverlay.toggle();
  }

  private togglePostProcessing(): void {
    if (!this.gameStarted || !this.sandboxRenderer.postProcessing) return;

    const enabled = !this.sandboxRenderer.postProcessing.isEnabled();
    this.sandboxRenderer.postProcessing.setEnabled(enabled);
    console.log(`🎨 Post-processing ${enabled ? 'enabled' : 'disabled'}`);
  }

  private currentPixelSize = 1; // Start at 1 for best quality
  private adjustPixelSize(delta: number): void {
    if (!this.gameStarted || !this.sandboxRenderer.postProcessing) return;

    this.currentPixelSize = Math.max(1, Math.min(8, this.currentPixelSize + delta));
    this.sandboxRenderer.postProcessing.setPixelSize(this.currentPixelSize);
    console.log(`🎮 Pixel size: ${this.currentPixelSize}`);
  }

  private showWelcomeMessage(): void {
    const debugInfo = this.systemManager.globalBillboardSystem.getDebugInfo();
    const combatStats = this.systemManager.combatantSystem.getCombatStats();

    console.log(`
🎮 TERROR IN THE JUNGLE - GAME STARTED!

🌍 World Features:
- ${debugInfo.grassUsed} grass instances allocated
- ${debugInfo.treeUsed} tree instances allocated
- ${this.systemManager.chunkManager.getLoadedChunkCount()} chunks loaded
- ${combatStats.us} US, ${combatStats.opfor} OPFOR combatants in battle

🎯 Controls:
- WASD: Move around
- Shift: Run
- Mouse: Look around (click to enable)
- Left Click: Fire
- Right Click: Aim Down Sights
- F1: Performance stats
- F2: Toggle performance overlay
- Escape: Release mouse lock

Have fun!
    `);
  }

  public start(): void {
    this.animate();
  }

  private animate(): void {
    requestAnimationFrame(this.animate.bind(this));

    if (!this.isInitialized || !this.gameStarted) return;

    const deltaTime = this.clock.getDelta();
    this.lastFrameDelta = deltaTime;

    // Update all systems
    this.systemManager.updateSystems(deltaTime);

    // Update skybox position
    this.systemManager.skybox.updatePosition(this.sandboxRenderer.camera.position);

    // Check if mortar is deployed and using weapon camera
    const usingMortarCamera = this.systemManager.mortarSystem &&
                              this.systemManager.mortarSystem.isUsingWeaponCamera();

    // Render the main scene with appropriate camera
    if (usingMortarCamera) {
      const mortarCamera = this.systemManager.mortarSystem!.getWeaponCamera();
      this.sandboxRenderer.renderer.render(
        this.sandboxRenderer.scene,
        mortarCamera
      );
    } else {
      if (this.sandboxRenderer.postProcessing) {
        this.sandboxRenderer.postProcessing.render(deltaTime);
      } else {
        this.sandboxRenderer.renderer.render(
          this.sandboxRenderer.scene,
          this.sandboxRenderer.camera
        );
      }
    }

    // Render weapon overlay (after post-processing) - only when not using mortar camera
    if (this.systemManager.firstPersonWeapon && !usingMortarCamera) {
      this.systemManager.firstPersonWeapon.renderWeapon(this.sandboxRenderer.renderer);
    }

    // Render grenade overlays if equipped - only when not using mortar camera
    const renderer = this.sandboxRenderer.renderer;
    const currentAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    if (this.systemManager.grenadeSystem && this.systemManager.inventoryManager && !usingMortarCamera) {
      const grenadeScene = this.systemManager.grenadeSystem.getGrenadeOverlayScene();
      const grenadeCamera = this.systemManager.grenadeSystem.getGrenadeOverlayCamera();
      if (grenadeScene && grenadeCamera) {
        renderer.clearDepth();
        renderer.render(grenadeScene, grenadeCamera);
      }
    }

    renderer.autoClear = currentAutoClear;

    this.updatePerformanceOverlay(deltaTime);
  }

  private updatePerformanceOverlay(deltaTime: number): void {
    if (!this.performanceOverlay.isVisible()) return;

    const perfStats = this.sandboxRenderer.getPerformanceStats();
    const debugInfo = this.systemManager.globalBillboardSystem.getDebugInfo();
    const combatStats = this.systemManager.combatantSystem.getCombatStats();
    const chunkQueue = this.systemManager.chunkManager.getQueueSize();
    const loadedChunks = this.systemManager.chunkManager.getLoadedChunkCount();
    const fps = 1 / Math.max(0.0001, deltaTime);
    const vegetationActive = Object.entries(debugInfo)
      .filter(([key]) => key.endsWith('Active'))
      .reduce((sum, [, value]) => sum + (value as number), 0);
    const vegetationReserved = Object.entries(debugInfo)
      .filter(([key]) => key.endsWith('HighWater'))
      .reduce((sum, [, value]) => sum + (value as number), 0);

    this.performanceOverlay.update({
      fps,
      frameTimeMs: deltaTime * 1000,
      drawCalls: perfStats.drawCalls,
      triangles: perfStats.triangles,
      chunkQueueSize: chunkQueue,
      loadedChunks,
      usCombatants: combatStats.us,
      opforCombatants: combatStats.opfor,
      vegetationActive,
      vegetationReserved
    });
  }

  public dispose(): void {
    this.loadingScreen.dispose();
    this.sandboxRenderer.dispose();
    this.systemManager.dispose();
    this.performanceOverlay.dispose();
    console.log('🧹 Sandbox disposed');
  }
}
