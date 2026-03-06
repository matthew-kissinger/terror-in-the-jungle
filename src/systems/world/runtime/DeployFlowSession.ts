import {
  DeployFlow,
  DeployMapVariant,
  GameMode,
  GameModeDefinition
} from '../../../config/gameModeTypes';

export type DeploySessionKind = 'menu' | 'initial' | 'respawn';

export interface DeploySessionModel {
  kind: DeploySessionKind;
  mode: GameMode;
  modeName: string;
  modeDescription: string;
  flow: DeployFlow;
  mapVariant: DeployMapVariant;
  flowLabel: string;
  headline: string;
  subheadline: string;
  mapTitle: string;
  selectedSpawnTitle: string;
  emptySelectionText: string;
  readySelectionText: string;
  countdownLabel: string;
  readyLabel: string;
  actionLabel: string;
  secondaryActionLabel: string | null;
  allowSpawnSelection: boolean;
  allowLoadoutEditing: boolean;
  sequenceTitle: string;
  sequenceSteps: string[];
}

function getFlowLabel(flow: DeployFlow): string {
  switch (flow) {
    case 'frontier':
      return 'Frontier insertion';
    case 'air_assault':
      return 'Air assault insertion';
    case 'sandbox':
      return 'Sandbox reset';
    case 'standard':
    default:
      return 'Frontline deployment';
  }
}

function getMenuSubheadline(flow: DeployFlow): string {
  switch (flow) {
    case 'frontier':
      return 'Stage from controlled sectors and push across a wider battlefield.';
    case 'air_assault':
      return 'Insert by helicopter and fight across a living campaign front.';
    case 'sandbox':
      return 'Free-form simulation with simplified deployment rules.';
    case 'standard':
    default:
      return 'Pick a mode and deploy into a focused frontline engagement.';
  }
}

function getRespawnSubheadline(flow: DeployFlow): string {
  switch (flow) {
    case 'frontier':
      return 'Choose a foothold or main base before returning to the wider front.';
    case 'air_assault':
      return 'Select an insertion zone and rejoin the campaign near the active front.';
    case 'sandbox':
      return 'Reset to a valid simulation entry point.';
    case 'standard':
    default:
      return 'Choose a controlled position and return to the fight.';
  }
}

function getInitialSubheadline(flow: DeployFlow): string {
  switch (flow) {
    case 'frontier':
      return 'Review the front, choose a foothold, and insert into the wider battlefield.';
    case 'air_assault':
      return 'Choose an insertion zone before the first lift carries you into the campaign.';
    case 'sandbox':
      return 'Confirm a simulation entry point before starting free-play.';
    case 'standard':
    default:
      return 'Choose a starting position before the match goes live.';
  }
}

function getRespawnHeadline(flow: DeployFlow): string {
  switch (flow) {
    case 'frontier':
      return 'FRONTIER REDEPLOYMENT';
    case 'air_assault':
      return 'AIR ASSAULT REINSERTION';
    case 'sandbox':
      return 'SIMULATION RESET';
    case 'standard':
    default:
      return 'RETURN TO BATTLE';
  }
}

function getInitialHeadline(flow: DeployFlow): string {
  switch (flow) {
    case 'frontier':
      return 'FRONTIER INSERTION';
    case 'air_assault':
      return 'AIR ASSAULT STAGING';
    case 'sandbox':
      return 'SIMULATION ENTRY';
    case 'standard':
    default:
      return 'BATTLEFIELD INSERTION';
  }
}

function getMapTitle(flow: DeployFlow): string {
  switch (flow) {
    case 'frontier':
      return 'OPERATIONAL MAP - SELECT INSERTION';
    case 'air_assault':
      return 'ASSAULT MAP - SELECT INSERTION';
    case 'sandbox':
      return 'SIMULATION MAP - SELECT ENTRY POINT';
    case 'standard':
    default:
      return 'TACTICAL MAP - SELECT DEPLOYMENT';
  }
}

function getSelectedSpawnTitle(flow: DeployFlow): string {
  switch (flow) {
    case 'air_assault':
      return 'SELECTED INSERTION ZONE';
    case 'sandbox':
      return 'SELECTED ENTRY POINT';
    case 'frontier':
    case 'standard':
    default:
      return 'SELECTED SPAWN POINT';
  }
}

function getReadySelectionText(flow: DeployFlow): string {
  switch (flow) {
    case 'air_assault':
      return 'Insertion route confirmed';
    case 'sandbox':
      return 'Simulation entry point confirmed';
    case 'frontier':
    case 'standard':
    default:
      return 'Ready to deploy';
  }
}

function getActionLabel(kind: DeploySessionKind, flow: DeployFlow): string {
  if (kind === 'menu') {
    switch (flow) {
      case 'frontier':
        return 'STAGE INSERTION';
      case 'air_assault':
        return 'PLAN INSERTION';
      case 'sandbox':
        return 'START SIMULATION';
      case 'standard':
      default:
        return 'CONTINUE TO DEPLOY';
    }
  }

  if (kind === 'initial') {
    switch (flow) {
      case 'air_assault':
        return 'INSERT';
      case 'sandbox':
        return 'START SIM';
      case 'frontier':
      case 'standard':
      default:
        return 'DEPLOY';
    }
  }

  switch (flow) {
    case 'air_assault':
      return 'REINSERT';
    case 'sandbox':
      return 'RESET POSITION';
    case 'frontier':
    case 'standard':
    default:
      return 'DEPLOY';
  }
}

function getSecondaryActionLabel(kind: DeploySessionKind): string | null {
  if (kind === 'initial') {
    return 'BACK TO MODE SELECT';
  }

  return null;
}

function getSequenceTitle(kind: DeploySessionKind): string {
  switch (kind) {
    case 'menu':
      return 'Launch Sequence';
    case 'initial':
      return 'Deployment Checklist';
    case 'respawn':
    default:
      return 'Redeploy Checklist';
  }
}

function getPreparationStep(flow: DeployFlow): string {
  switch (flow) {
    case 'frontier':
      return 'Prepare the frontier battlefield, sectors, and route options.';
    case 'air_assault':
      return 'Prepare helicopter staging, front-line pressure, and insertion routes.';
    case 'sandbox':
      return 'Prepare the simulation sandbox and entry conditions.';
    case 'standard':
    default:
      return 'Prepare the battlefield, objectives, and frontline state.';
  }
}

function getSpawnStep(
  flow: DeployFlow,
  allowSpawnSelection: boolean,
  kind: DeploySessionKind
): string {
  const spawnLabel =
    flow === 'air_assault'
      ? 'insertion zone'
      : flow === 'sandbox'
        ? 'entry point'
        : 'spawn point';

  if (!allowSpawnSelection) {
    return `Mode rules assign the ${spawnLabel} automatically.`;
  }

  if (kind === 'respawn') {
    return `Choose a ${spawnLabel} before returning to the fight.`;
  }

  return `Choose a ${spawnLabel} before deployment begins.`;
}

function getLoadoutStep(allowLoadoutEditing: boolean, kind: DeploySessionKind): string {
  if (!allowLoadoutEditing) {
    return kind === 'menu'
      ? 'Review the mission loadout before entering the deploy screen.'
      : 'Mission loadout is locked for this deployment.';
  }

  return 'Configure 2 weapons and 1 equipment slot before deployment.';
}

function getFinalStep(kind: DeploySessionKind, flow: DeployFlow): string {
  if (kind === 'respawn') {
    return flow === 'air_assault'
      ? 'Redeploy as soon as the reinsert timer clears.'
      : 'Redeploy as soon as the timer clears.';
  }

  if (kind === 'initial') {
    return flow === 'air_assault'
      ? 'Insert once the staging plan and loadout are confirmed.'
      : 'Deploy once staging and loadout are confirmed.';
  }

  return 'Open the deploy screen, confirm insertion, then enter the live match.';
}

function getSequenceSteps(
  kind: DeploySessionKind,
  flow: DeployFlow,
  allowSpawnSelection: boolean,
  allowLoadoutEditing: boolean
): string[] {
  const steps: string[] = [];

  if (kind === 'menu') {
    steps.push(getPreparationStep(flow));
  }

  steps.push(getSpawnStep(flow, allowSpawnSelection, kind));
  steps.push(getLoadoutStep(allowLoadoutEditing, kind));
  steps.push(getFinalStep(kind, flow));

  return steps;
}

function getModeSpecificSessionOverrides(
  definition: GameModeDefinition,
  kind: DeploySessionKind
): Partial<DeploySessionModel> {
  switch (definition.id) {
    case GameMode.ZONE_CONTROL:
      return {
        subheadline:
          kind === 'menu'
            ? 'Hold the majority of the line and bleed the enemy out through zone control.'
            : kind === 'initial'
              ? 'Choose a controlled sector, then push into the live frontline.'
              : 'Choose a controlled sector and reinforce the contested line.',
        mapTitle: 'FRONTLINE MAP - SELECT DEPLOYMENT',
        readySelectionText: 'Frontline spawn confirmed',
        readyLabel: 'Ready for frontline deploy'
      };
    case GameMode.TEAM_DEATHMATCH:
      return {
        subheadline:
          kind === 'menu'
            ? 'Pure firefight mode with no capture baggage. Reach the kill target first.'
            : kind === 'initial'
              ? 'Pick a combat spawn and get into the kill race immediately.'
              : 'Choose a combat spawn and get back into the firefight fast.',
        mapTitle: 'COMBAT MAP - SELECT SPAWN',
        selectedSpawnTitle: 'SELECTED COMBAT SPAWN',
        emptySelectionText: 'Select a combat spawn on the map',
        readySelectionText: 'Combat spawn confirmed',
        countdownLabel: 'Combat redeploy available in',
        readyLabel: 'Ready for combat redeploy'
      };
    case GameMode.OPEN_FRONTIER:
      return {
        subheadline:
          kind === 'menu'
            ? 'Stage from helipads and footholds, then maneuver across a wider operational front.'
            : kind === 'initial'
              ? 'Choose a foothold, review the route, and insert into the frontier fight.'
              : 'Select a forward foothold or main base before re-entering the wider battle.',
        mapTitle: 'FRONTIER OPERATIONS MAP - SELECT INSERTION',
        selectedSpawnTitle: 'SELECTED FOOTHOLD',
        readySelectionText: 'Frontier insertion confirmed',
        readyLabel: 'Ready for insertion'
      };
    case GameMode.A_SHAU_VALLEY:
      return {
        subheadline:
          kind === 'menu'
            ? 'Insert into a battalion-scale war zone with tactical contacts and strategic front pressure.'
            : kind === 'initial'
              ? 'Choose an insertion zone before the first lift carries you into the valley fight.'
              : 'Select a pressure-front insertion zone and rejoin the live campaign.',
        mapTitle: 'A SHAU OPERATIONS MAP - SELECT INSERTION',
        readySelectionText: 'Reinsert route confirmed',
        countdownLabel: 'Reinsertion available in',
        readyLabel: 'Ready for reinsertion'
      };
    case GameMode.AI_SANDBOX:
    default:
      return {};
  }
}

export function createDeploySession(
  definition: GameModeDefinition,
  kind: DeploySessionKind
): DeploySessionModel {
  const { deploy } = definition.policies;
  const flow = deploy.flow;
  const allowLoadoutEditing = kind !== 'menu' && deploy.allowLoadoutEditingOnRespawn;

  return {
    kind,
    mode: definition.id,
    modeName: definition.config.name,
    modeDescription: definition.config.description,
    flow,
    mapVariant: deploy.mapVariant,
    flowLabel: getFlowLabel(flow),
    headline:
      kind === 'menu'
        ? definition.config.name.toUpperCase()
        : kind === 'initial'
          ? getInitialHeadline(flow)
          : getRespawnHeadline(flow),
    subheadline:
      kind === 'menu'
        ? getMenuSubheadline(flow)
        : kind === 'initial'
          ? getInitialSubheadline(flow)
          : getRespawnSubheadline(flow),
    mapTitle: getMapTitle(flow),
    selectedSpawnTitle: getSelectedSpawnTitle(flow),
    emptySelectionText: deploy.allowSpawnSelection
      ? 'Select a spawn point on the map'
      : 'Default insertion will be used',
    readySelectionText: getReadySelectionText(flow),
    countdownLabel: 'Deployment available in',
    readyLabel: 'Ready for deployment',
    actionLabel: getActionLabel(kind, flow),
    secondaryActionLabel: getSecondaryActionLabel(kind),
    allowSpawnSelection: deploy.allowSpawnSelection,
    allowLoadoutEditing,
    sequenceTitle: getSequenceTitle(kind),
    sequenceSteps: getSequenceSteps(kind, flow, deploy.allowSpawnSelection, allowLoadoutEditing),
    ...getModeSpecificSessionOverrides(definition, kind)
  };
}
