import { describe, expect, it } from 'vitest';
import { StartupFlowController } from './StartupFlowController';
import { Alliance, Faction } from '../systems/combat/types';
import { GameMode } from '../config/gameModeTypes';

describe('StartupFlowController', () => {
  const selection = {
    mode: GameMode.ZONE_CONTROL,
    alliance: Alliance.BLUFOR,
    faction: Faction.US,
  };

  it('tracks the startup flow phases in order', () => {
    const controller = new StartupFlowController();

    controller.showMenu();
    expect(controller.beginModePreparation(selection)).toBe(true);
    controller.enterDeploySelect();
    controller.enterSpawnWarming();
    controller.enterLive();

    expect(controller.getState()).toEqual({
      phase: 'live',
      mode: GameMode.ZONE_CONTROL,
      selection,
      errorMessage: null,
    });
  });

  it('rejects a second launch while already preparing', () => {
    const controller = new StartupFlowController();

    controller.showMenu();
    expect(controller.beginModePreparation(selection)).toBe(true);
    expect(controller.beginModePreparation(selection)).toBe(false);
  });

  it('returns to menu on cancel and preserves error state when failing', () => {
    const controller = new StartupFlowController();

    controller.showMenu();
    controller.beginModePreparation(selection);
    controller.fail('Mode startup failed');

    expect(controller.getState().phase).toBe('startup_error');
    expect(controller.getState().errorMessage).toBe('Mode startup failed');

    controller.cancelToMenu();
    expect(controller.getState()).toEqual({
      phase: 'menu_ready',
      mode: null,
      selection: null,
      errorMessage: null,
    });
  });
});
