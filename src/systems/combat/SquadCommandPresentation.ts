// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { SquadCommand } from './types';

export interface SquadQuickCommandOption {
  slot: number;
  command: SquadCommand;
  shortLabel: string;
  fullLabel: string;
  /** Plain one-line description of what the order does, for the radio menu. */
  effect: string;
}

export const SQUAD_QUICK_COMMAND_OPTIONS: SquadQuickCommandOption[] = [
  {
    slot: 1,
    command: SquadCommand.FOLLOW_ME,
    shortLabel: 'FOLLOW',
    fullLabel: 'FOLLOW ME',
    effect: 'Squad sticks with you and fights along the way.'
  },
  {
    slot: 2,
    command: SquadCommand.HOLD_POSITION,
    shortLabel: 'HOLD',
    fullLabel: 'HOLD POSITION',
    effect: 'Mark a point: squad digs in there and defends it.'
  },
  {
    slot: 3,
    command: SquadCommand.PATROL_HERE,
    shortLabel: 'PATROL',
    fullLabel: 'PATROL HERE',
    effect: 'Mark a point: squad patrols and screens that area.'
  },
  {
    slot: 4,
    command: SquadCommand.RETREAT,
    shortLabel: 'FALL BACK',
    fullLabel: 'FALL BACK',
    effect: 'Mark a point: squad breaks contact and rallies there.'
  },
  {
    slot: 5,
    command: SquadCommand.FREE_ROAM,
    shortLabel: 'STAND DOWN',
    fullLabel: 'STAND DOWN',
    effect: 'Release the squad to fight on its own initiative.'
  },
  {
    slot: 6,
    command: SquadCommand.ATTACK_HERE,
    shortLabel: 'ATTACK',
    fullLabel: 'ATTACK HERE',
    effect: 'Mark a point: squad pushes and assaults toward it.'
  }
];

/** Keyboard hint shown next to a squad order in the radio menu (Shift+N). */
export function getSquadCommandKeyHint(slot: number): string {
  return `SHIFT+${slot}`;
}

const COMMAND_LABELS: Record<SquadCommand, { short: string; full: string }> = {
  [SquadCommand.FOLLOW_ME]: { short: 'FOLLOW', full: 'FOLLOW ME' },
  [SquadCommand.HOLD_POSITION]: { short: 'HOLD', full: 'HOLD POSITION' },
  [SquadCommand.PATROL_HERE]: { short: 'PATROL', full: 'PATROL HERE' },
  [SquadCommand.ATTACK_HERE]: { short: 'ATTACK', full: 'ATTACK HERE' },
  [SquadCommand.RETREAT]: { short: 'FALL BACK', full: 'FALL BACK' },
  [SquadCommand.FREE_ROAM]: { short: 'STAND DOWN', full: 'STAND DOWN' },
  [SquadCommand.NONE]: { short: 'AUTO', full: 'AUTO (NPC)' }
};

export function getQuickCommandOption(slot: number): SquadQuickCommandOption | undefined {
  return SQUAD_QUICK_COMMAND_OPTIONS.find((option) => option.slot === slot);
}

export function requiresCommandTarget(command: SquadCommand): boolean {
  return command === SquadCommand.HOLD_POSITION
    || command === SquadCommand.PATROL_HERE
    || command === SquadCommand.ATTACK_HERE
    || command === SquadCommand.RETREAT;
}

export function getSquadCommandLabel(command: SquadCommand, variant: 'short' | 'full' = 'full'): string {
  return COMMAND_LABELS[command]?.[variant] ?? COMMAND_LABELS[SquadCommand.NONE][variant];
}
