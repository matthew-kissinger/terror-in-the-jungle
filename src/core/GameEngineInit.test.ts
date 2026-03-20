import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Alliance, Faction } from '../systems/combat/types';
import { GameMode } from '../config/gameModeTypes';
import { StartupFlowController } from './StartupFlowController';
import { initializeSystems } from './GameEngineInit';

const mocks = vi.hoisted(() => ({
  prepareModeStartup: vi.fn(async (_engine: unknown, launchSelection: any) => ({
    definition: { id: launchSelection.mode },
    launchSelection,
    mode: launchSelection.mode,
  })),
  prepareInitialDeploy: vi.fn(async () => ({ x: 0, y: 0, z: 0 })),
  startLiveGame: vi.fn(),
}));

vi.mock('./ModeStartupPreparer', () => ({
  normalizeLaunchSelection: (modeOrSelection: any) => (
    typeof modeOrSelection === 'string'
      ? {
          mode: modeOrSelection,
          alliance: Alliance.BLUFOR,
          faction: Faction.US,
        }
      : modeOrSelection
  ),
  prepareModeStartup: mocks.prepareModeStartup,
}));

vi.mock('./InitialDeployStartup', () => ({
  prepareInitialDeploy: mocks.prepareInitialDeploy,
}));

vi.mock('./LiveEntryActivator', () => ({
  startLiveGame: mocks.startLiveGame,
  logWelcomeMessage: vi.fn(),
}));

function createEngineStub() {
  const settingsModal = {
    show: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => false),
    setOnVisibilityChange: vi.fn(),
  };

  return {
    renderer: {
      scene: {},
      camera: {},
    },
    startupFlow: new StartupFlowController(),
    sandboxEnabled: true,
    sandboxConfig: {
      autoStart: true,
      enableCombat: true,
    },
    isInitialized: false,
    gameStarted: false,
    gameStartPending: false,
    loadingScreen: {
      updateProgress: vi.fn(),
      beginGameLaunch: vi.fn(),
      cancelGameLaunch: vi.fn(),
      getSettingsModal: vi.fn(() => settingsModal),
      showMainMenu: vi.fn(),
      showError: vi.fn(),
    },
    systemManager: {
      initializeSystems: vi.fn().mockResolvedValue(undefined),
      assetLoader: { getTexture: vi.fn().mockReturnValue(undefined) },
      globalBillboardSystem: { configure: vi.fn() },
      hudSystem: { setPlayAgainCallback: vi.fn() },
      playerController: { setSettingsModal: vi.fn() },
    },
  } as any;
}

describe('GameEngineInit sandbox autostart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves startup flow to menu-ready before sandbox autostart begins mode preparation', async () => {
    const engine = createEngineStub();

    await initializeSystems(engine);

    await vi.waitFor(() => {
      expect(mocks.prepareModeStartup).toHaveBeenCalledTimes(1);
    });

    expect(engine.startupFlow.getState().phase).toBe('mode_preparing');
    expect(engine.loadingScreen.showMainMenu).not.toHaveBeenCalled();
    expect(engine.loadingScreen.beginGameLaunch).toHaveBeenCalledTimes(1);
    expect(engine.systemManager.playerController.setSettingsModal).toHaveBeenCalledWith(
      engine.loadingScreen.getSettingsModal(),
    );
    expect(mocks.prepareModeStartup).toHaveBeenCalledWith(
      engine,
      expect.objectContaining({
        mode: GameMode.AI_SANDBOX,
        alliance: Alliance.BLUFOR,
        faction: Faction.US,
      }),
    );
  });
});
