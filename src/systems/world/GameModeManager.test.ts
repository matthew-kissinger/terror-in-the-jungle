import { afterEach, describe, expect, it } from 'vitest';
import { getGameModeDefinition } from '../../config/gameModeDefinitions';
import { GameMode } from '../../config/gameModeTypes';
import { GameModeManager } from './GameModeManager';

const MINIMAP_TACTICAL_RANGE_KEY = '__MINIMAP_TACTICAL_RANGE__';
const MINIMAP_SHOW_STRATEGIC_AGENTS_KEY = '__MINIMAP_SHOW_STRATEGIC_AGENTS__';

function getGlobalValue(key: string): unknown {
  return (globalThis as Record<string, unknown>)[key];
}

function setGlobalValue(key: string, value: unknown): void {
  (globalThis as Record<string, unknown>)[key] = value;
}

function clearGlobalValue(key: string): void {
  delete (globalThis as Record<string, unknown>)[key];
}

describe('GameModeManager', () => {
  const previousRange = getGlobalValue(MINIMAP_TACTICAL_RANGE_KEY);
  const previousStrategic = getGlobalValue(MINIMAP_SHOW_STRATEGIC_AGENTS_KEY);

  afterEach(() => {
    if (previousRange === undefined) {
      clearGlobalValue(MINIMAP_TACTICAL_RANGE_KEY);
    } else {
      setGlobalValue(MINIMAP_TACTICAL_RANGE_KEY, previousRange);
    }

    if (previousStrategic === undefined) {
      clearGlobalValue(MINIMAP_SHOW_STRATEGIC_AGENTS_KEY);
    } else {
      setGlobalValue(MINIMAP_SHOW_STRATEGIC_AGENTS_KEY, previousStrategic);
    }
  });

  it('applies map intel policy from the active runtime', () => {
    const manager = new GameModeManager();

    manager.setGameMode(GameMode.A_SHAU_VALLEY);
    expect(getGlobalValue(MINIMAP_TACTICAL_RANGE_KEY)).toBe(900);
    expect(getGlobalValue(MINIMAP_SHOW_STRATEGIC_AGENTS_KEY)).toBe(false);

    manager.setGameMode(GameMode.ZONE_CONTROL);
    expect(MINIMAP_TACTICAL_RANGE_KEY in (globalThis as Record<string, unknown>)).toBe(false);
    expect(getGlobalValue(MINIMAP_SHOW_STRATEGIC_AGENTS_KEY)).toBe(false);
  });

  it('runs runtime exit, enter, and reapply hooks in order', () => {
    const events: string[] = [];
    const manager = new GameModeManager(getGameModeDefinition, definition => ({
      definition,
      onEnter: context => {
        events.push(`enter:${context.mode}`);
      },
      onExit: context => {
        events.push(`exit:${context.mode}->${context.nextMode}`);
      },
      onReapply: context => {
        events.push(`reapply:${context.mode}`);
      }
    }));

    manager.setGameMode(GameMode.OPEN_FRONTIER);
    manager.setGameMode(GameMode.OPEN_FRONTIER);

    expect(events).toEqual([
      'exit:zone_control->open_frontier',
      'enter:open_frontier',
      'reapply:open_frontier'
    ]);
  });

  it('exposes current deploy and respawn policies', () => {
    const manager = new GameModeManager();
    manager.setGameMode(GameMode.OPEN_FRONTIER);

    expect(manager.getDeployPolicy().mapVariant).toBe('frontier');
    expect(manager.getDeploySession('respawn').flowLabel).toBe('Frontier insertion');
    expect(manager.getRespawnPolicy().allowControlledZoneSpawns).toBe(true);
    expect(manager.canPlayerSpawnAtZones()).toBe(true);
  });
});
