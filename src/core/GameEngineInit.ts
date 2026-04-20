import * as THREE from 'three';
import { GameLaunchSelection, GameMode } from '../config/gameModeTypes';
import { Logger } from '../utils/Logger';
import { InitialDeployCancelledError } from '../systems/player/InitialDeployCancelledError';
import type { GameEngine } from './GameEngine';
import { markStartup } from './StartupTelemetry';
import { startLiveGame, logWelcomeMessage } from './LiveEntryActivator';

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
