import { describe, expect, it } from 'vitest';
import { Alliance, Faction } from '../systems/combat/types';
import { GameMode } from '../config/gameModeTypes';
import { normalizeLaunchSelection } from './ModeStartupPreparer';
import { resolveModeSpawnPosition } from './ModeSpawnPosition';
import { getGameModeDefinition } from '../config/gameModeDefinitions';

describe('ModeStartupPreparer', () => {
  it('normalizes string mode launches into a full launch selection', () => {
    const selection = normalizeLaunchSelection(GameMode.ZONE_CONTROL);

    expect(selection.mode).toBe(GameMode.ZONE_CONTROL);
    expect(selection.alliance).toBeDefined();
    expect(selection.faction).toBeDefined();
  });

  it('resolves alliance-specific fallback spawn positions', () => {
    const definition = getGameModeDefinition(GameMode.ZONE_CONTROL);

    const bluforSpawn = resolveModeSpawnPosition(definition, Alliance.BLUFOR);
    const opforSpawn = resolveModeSpawnPosition(definition, Alliance.OPFOR);

    expect(bluforSpawn.equals(opforSpawn)).toBe(false);
  });

  it('preserves an explicit valid launch selection', () => {
    const selection = normalizeLaunchSelection({
      mode: GameMode.AI_SANDBOX,
      alliance: Alliance.BLUFOR,
      faction: Faction.US,
    });

    expect(selection).toEqual({
      mode: GameMode.AI_SANDBOX,
      alliance: Alliance.BLUFOR,
      faction: Faction.US,
    });
  });
});
