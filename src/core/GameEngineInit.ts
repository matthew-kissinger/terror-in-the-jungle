import * as THREE from 'three';
import { GameLaunchSelection, GameMode } from '../config/gameModeTypes';
import { Logger } from '../utils/Logger';
import { InitialDeployCancelledError } from '../systems/player/InitialDeployCancelledError';
import type { GameEngine } from './GameEngine';
import { markStartup } from './StartupTelemetry';
import { startLiveGame, logWelcomeMessage } from './LiveEntryActivator';
import { createNavmeshWireframeOverlay } from '../ui/debug/worldOverlays/navmeshWireframeOverlay';
import { createLodTierOverlay } from '../ui/debug/worldOverlays/lodTierOverlay';
import { createAircraftContactOverlay } from '../ui/debug/worldOverlays/aircraftContactOverlay';
import { createLosRayOverlay } from '../ui/debug/worldOverlays/losRayOverlay';
import { createSquadInfluenceOverlay } from '../ui/debug/worldOverlays/squadInfluenceOverlay';
import { createTerrainChunkOverlay } from '../ui/debug/worldOverlays/terrainChunkOverlay';
import { WorldOverlayControlPanel } from '../ui/debug/WorldOverlayControlPanel';

type StartGamePipeline = {
  normalizeLaunchSelection: typeof import('./ModeStartupPreparer').normalizeLaunchSelection;
  prepareModeStartup: typeof import('./ModeStartupPreparer').prepareModeStartup;
  prepareInitialDeploy: typeof import('./InitialDeployStartup').prepareInitialDeploy;
};

let startGamePipelinePromise: Promise<StartGamePipeline> | undefined;

async function loadStartGamePipeline(): Promise<StartGamePipeline> {
  startGamePipelinePromise ??= Promise.all([
    import('./ModeStartupPreparer'),
    import('./InitialDeployStartup'),
  ]).then(([modeStartup, initialDeployStartup]) => ({
    normalizeLaunchSelection: modeStartup.normalizeLaunchSelection,
    prepareModeStartup: modeStartup.prepareModeStartup,
    prepareInitialDeploy: initialDeployStartup.prepareInitialDeploy,
  }));

  return startGamePipelinePromise;
}

/**
 * Handles initialization of game systems and assets
 */
export async function initializeSystems(engine: GameEngine): Promise<void> {
  try {
    engine.startupFlow.resetBoot();
    markStartup('engine-init.initialize-systems.begin');
    await engine.systemManager.initializeSystems(
      engine.renderer.scene,
      engine.renderer.camera,
      (phase: string, progress: number) => engine.loadingScreen.updateProgress(phase, progress),
      engine.renderer
    );
    engine.systemManager.playerController.setSettingsModal(engine.loadingScreen.getSettingsModal());

    engine.loadingScreen.updateProgress('entities', 0);
    Logger.info('engine-init', 'Systems initialized, loading assets...');
    await loadGameAssets(engine);

    // `AtmosphereSystem` applies the `combat120` bootstrap preset in its
    // constructor so the analytic dome is up before any mode is selected
    // (menu / loading background still gets a real sky). Per-mode presets
    // are reapplied in `SystemManager.setGameMode`.

    engine.systemManager.globalBillboardSystem.configure('denseJungle');

    Logger.info('engine-init', 'World system ready!');
    engine.loadingScreen.updateProgress('entities', 1);
    engine.isInitialized = true;
    Logger.info('engine-init', 'Engine ready!');

    engine.systemManager.hudSystem.setPlayAgainCallback(() => restartMatch(engine));

    wireDebugPanels(engine);
    wireWorldOverlays(engine);

    markStartup('engine-init.initialize-systems.end');

    if (engine.sandboxEnabled && engine.sandboxConfig?.autoStart) {
      engine.startupFlow.showMenu();
      markStartup('engine-init.autostart.begin');
      void startGameWithMode(engine, GameMode.AI_SANDBOX);
      return;
    }

    engine.startupFlow.showMenu();
    engine.loadingScreen.showMainMenu();
  } catch (error) {
    Logger.error('engine-init', 'Failed to initialize engine:', error);
    const errorMessage = error instanceof Error
      ? error.message
      : 'An unexpected error occurred during initialization';
    engine.loadingScreen.showError('Initialization Failed', errorMessage);
  }
}

/**
 * Minimal asset check before starting
 */
export async function loadGameAssets(_engine: GameEngine): Promise<void> {
  Logger.info('engine-init', 'Asset check complete');
}

/**
 * Restarts the current match in-place (same mode). Resets tickets, combatants, player, day/night, weather.
 * Used by the Match End "Play Again" button.
 */
function restartMatch(engine: GameEngine): void {
  const mode = engine.systemManager.gameModeManager.getCurrentMode();
  Logger.info('engine-init', `Restarting match with mode: ${mode}`);
  engine.systemManager.setGameMode(mode, { createPlayerSquad: true });
  engine.systemManager.ticketSystem.restartMatch();
  engine.systemManager.hudSystem.startMatch();
}

/**
 * Sets game mode and prepares for game start
 */
export async function startGameWithMode(
  engine: GameEngine,
  modeOrSelection: GameMode | GameLaunchSelection
): Promise<void> {
  const startGamePipeline = await loadStartGamePipeline();
  const launchSelection = startGamePipeline.normalizeLaunchSelection(modeOrSelection);
  const mode = launchSelection.mode;
  if (!engine.isInitialized || engine.gameStarted || engine.gameStartPending) {
    return;
  }
  if (!engine.startupFlow.beginModePreparation(launchSelection)) {
    return;
  }
  engine.gameStartPending = true;

  try {
    markStartup(`engine-init.start-game.${mode}.begin`);
    Logger.info('engine-init', `Starting game with mode: ${mode}`);
    engine.loadingScreen.beginGameLaunch(launchSelection);

    const preparedMode = await startGamePipeline.prepareModeStartup(engine, launchSelection);
    const initialDeployPosition = await startGamePipeline.prepareInitialDeploy(
      engine,
      preparedMode.definition,
      preparedMode.launchSelection,
      preparedMode.mode
    );

    startGame(engine, initialDeployPosition);
    markStartup(`engine-init.start-game.${mode}.end`);
  } catch (error) {
    if (error instanceof InitialDeployCancelledError) {
      engine.gameStartPending = false;
      engine.gameStarted = false;
      engine.startupFlow.cancelToMenu();
      engine.loadingScreen.showMainMenu();
      Logger.info('engine-init', 'Initial deploy cancelled; returned to mode selection');
      return;
    }

    engine.gameStartPending = false;
    engine.gameStarted = false;
    engine.loadingScreen.cancelGameLaunch();
    Logger.error('engine-init', 'Failed to start game mode:', error);
    const errorMessage = error instanceof Error
      ? error.message
      : 'An unexpected error occurred while preparing the selected mode.';
    engine.startupFlow.fail(errorMessage);
    engine.loadingScreen.showError('Mode Startup Failed', errorMessage);
  }
}

/**
 * Main game start logic, pointer lock, shader compilation, and spawn positioning
 */
export function startGame(engine: GameEngine, initialSpawnPosition?: THREE.Vector3): void {
  startLiveGame(engine, initialSpawnPosition);
}

/**
 * Displays welcome message with controls in console
 */
export function showWelcomeMessage(engine: GameEngine): void {
  logWelcomeMessage(engine);
}

/**
 * Connects the new debug panels to their data sources. Called after the
 * SystemManager has finished initializing. Safe no-op if any panel is absent
 * (e.g. unit-test engine stubs that only mock the subset they exercise).
 */
function wireDebugPanels(engine: GameEngine): void {
  if (
    !engine.vehicleStatePanel ||
    !engine.combatStatePanel ||
    !engine.currentModePanel ||
    !engine.frameBudgetPanel
  ) {
    return;
  }
  const sm = engine.systemManager;
  const terrain = sm.terrainSystem;
  engine.vehicleStatePanel.setSources(
    sm.playerController,
    (x, z) => (terrain && typeof terrain.getHeightAt === 'function' ? terrain.getHeightAt(x, z) : NaN),
  );
  engine.combatStatePanel.setSource(sm.combatantSystem);
  engine.currentModePanel.setSource({
    getMode: () => sm.gameModeManager.getCurrentMode(),
    getWeather: () => {
      const ws = sm.weatherSystem as unknown as { currentState?: string };
      return ws?.currentState ?? 'unknown';
    },
    getTimeOfDaySeconds: () => sm.atmosphereSystem.getSimulationTimeSeconds(),
    getScenarioName: () => sm.atmosphereSystem.getCurrentScenario(),
  });
  engine.frameBudgetPanel.setSource(() => sm.getSystemTimings());

  if (engine.entityInspectorPanel) {
    engine.entityInspectorPanel.setSources({
      combatants: sm.combatantSystem,
      vehicles: sm.vehicleManager,
      player: sm.playerController,
    });
    engine.entityInspectorPanel.setFollowController({
      startFollow: (kind, id) => {
        if (kind === 'combatant') {
          const combatant = sm.combatantSystem.getAllCombatants().find(c => c.id === id);
          if (!combatant) return false;
          engine.freeFlyCamera.setFollowTarget({
            getPosition: (tgt) => {
              const live = sm.combatantSystem.getAllCombatants().find(c => c.id === id);
              return live ? tgt.copy(live.position) : null;
            },
          });
          return true;
        }
        if (kind === 'vehicle') {
          engine.freeFlyCamera.setFollowTarget({
            getPosition: (tgt) => {
              const v = sm.vehicleManager.getVehicle(id);
              return v ? tgt.copy(v.getPosition()) : null;
            },
          });
          return true;
        }
        return false;
      },
      stopFollow: () => engine.freeFlyCamera.setFollowTarget(null),
      isFollowing: () => engine.freeFlyCamera.hasFollowTarget(),
    });
  }
}

/**
 * Register the six scene-space debug overlays and mount the control panel.
 * Called after `wireDebugPanels` so all source systems are ready. Overlays
 * are lazy — they allocate GPU resources only on first toggle-on.
 */
function wireWorldOverlays(engine: GameEngine): void {
  const overlays = engine.renderer.worldOverlays;
  if (!overlays) return;
  const sm = engine.systemManager;
  const combatantSystem = sm.combatantSystem;
  const terrainSystem = sm.terrainSystem;
  const navmeshSystem = sm.navmeshSystem;
  const influenceMap = combatantSystem.influenceMap;
  const cameraPos = () => engine.renderer.getActiveCamera().position;

  overlays.register(createNavmeshWireframeOverlay({
    getNavMesh: () => (navmeshSystem as unknown as { navMesh?: unknown }).navMesh ?? null,
    isReady: () => navmeshSystem.isReady?.() ?? false,
  }));
  overlays.register(createLodTierOverlay({ combatants: combatantSystem.combatants }));
  overlays.register(createAircraftContactOverlay({
    getLOSAccelerator: () => terrainSystem.getLOSAccelerator?.() ?? null,
    sampleActiveAircraft: () => {
      const vehicles = sm.vehicleManager?.getAllVehicles?.() ?? [];
      for (const v of vehicles) {
        const anyV = v as unknown as {
          getPosition?: () => THREE.Vector3;
          getVelocity?: () => THREE.Vector3;
        };
        if (typeof anyV.getPosition === 'function' && typeof anyV.getVelocity === 'function') {
          return { position: anyV.getPosition(), velocity: anyV.getVelocity() };
        }
      }
      return null;
    },
  }));
  overlays.register(createLosRayOverlay({
    combatants: combatantSystem.combatants,
    getCameraPosition: cameraPos,
  }));
  overlays.register(createSquadInfluenceOverlay({
    getInfluenceGrid: () => influenceMap?.getGridForDebug?.() ?? null,
    getCameraPosition: cameraPos,
  }));
  overlays.register(createTerrainChunkOverlay({
    getActiveTiles: () => terrainSystem.getActiveTilesForDebug?.() ?? [],
    getHeightAt: (x, z) => (typeof terrainSystem.getHeightAt === 'function' ? terrainSystem.getHeightAt(x, z) : 0),
  }));

  engine.worldOverlayControlPanel = new WorldOverlayControlPanel(overlays);
  engine.debugHud.register(engine.worldOverlayControlPanel);
}
