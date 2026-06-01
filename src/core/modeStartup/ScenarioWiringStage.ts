import { GameLaunchSelection, GameModeDefinition } from '../../config/gameModeTypes';
import { GameMode } from '../../config/gameModeTypes';
import { getGameModeConfig } from '../../config/gameModes';
import { getGameModeDefinition, resolveLaunchSelection } from '../../config/gameModeDefinitions';
import { Alliance, Faction } from '../../systems/combat/types';
import { PersistenceSystem } from '../../systems/strategy/PersistenceSystem';
import { Logger } from '../../utils/Logger';
import type { GameEngine } from '../GameEngine';

/**
 * Scenario / faction wiring stage extracted from the ModeStartupPreparer
 * facade (cycle phase4-godfiles split). Behavior-identical to the original
 * faction-label resolution, launch-selection application, launch-selection
 * normalization, and persistent war-state restore.
 */

const FACTION_DISPLAY_NAMES: Record<Faction, string> = {
  [Faction.US]: 'US Forces',
  [Faction.ARVN]: 'ARVN',
  [Faction.NVA]: 'NVA',
  [Faction.VC]: 'Viet Cong',
};

function resolveFactionLabels(definition: GameModeDefinition): { blufor: string; opfor: string } {
  const mix = definition.config.factionMix;
  if (mix) {
    const bluforFactions = mix[Alliance.BLUFOR];
    const opforFactions = mix[Alliance.OPFOR];
    const bluforLabel = bluforFactions?.length === 1
      ? FACTION_DISPLAY_NAMES[bluforFactions[0]]
      : 'BLUFOR';
    const opforLabel = opforFactions?.length === 1
      ? FACTION_DISPLAY_NAMES[opforFactions[0]]
      : 'OPFOR';
    return { blufor: bluforLabel, opfor: opforLabel };
  }
  return { blufor: 'US Forces', opfor: 'OPFOR' };
}

export function applyLaunchSelection(engine: GameEngine, definition: GameModeDefinition, selection: GameLaunchSelection): void {
  engine.systemManager.loadoutService.setContextFromDefinition(
    definition,
    selection.alliance,
    selection.faction
  );
  engine.systemManager.playerController.setPlayerFaction(selection.faction);
  engine.systemManager.playerHealthSystem.setPlayerFaction(selection.faction);
  engine.systemManager.firstPersonWeapon.setPlayerFaction(selection.faction);
  engine.systemManager.combatantSystem.setPlayerFaction(selection.faction);
  engine.systemManager.zoneManager.setPlayerAlliance(selection.alliance);

  const labels = resolveFactionLabels(definition);
  engine.systemManager.hudSystem.setFactionLabels(labels.blufor, labels.opfor);
}

export function normalizeLaunchSelection(
  modeOrSelection: GameMode | GameLaunchSelection
): GameLaunchSelection {
  if (typeof modeOrSelection === 'string') {
    const definition = getGameModeDefinition(modeOrSelection);
    const resolved = resolveLaunchSelection(definition);
    return {
      mode: modeOrSelection,
      alliance: resolved.alliance,
      faction: resolved.faction,
    };
  }

  const definition = getGameModeDefinition(modeOrSelection.mode);
  const resolved = resolveLaunchSelection(definition, modeOrSelection);
  return {
    mode: modeOrSelection.mode,
    alliance: resolved.alliance,
    faction: resolved.faction,
  };
}

export function restorePersistentWarState(
  engine: GameEngine,
  mode: GameMode,
  config: ReturnType<typeof getGameModeConfig>
): void {
  if (!config.warSimulator?.enabled || !engine.systemManager.warSimulator.isEnabled()) {
    return;
  }

  const persistence = new PersistenceSystem();
  const existingSave = persistence.getAutoSave(mode);
  if (!existingSave) {
    return;
  }

  Logger.info(
    'engine-init',
    `Restoring war state: ${existingSave.agents.length} agents, ${existingSave.elapsedTime.toFixed(0)}s elapsed`
  );
  engine.systemManager.warSimulator.loadWarState(existingSave);
}
