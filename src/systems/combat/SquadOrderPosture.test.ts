// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveOrderIntent, isWithinLeash } from './SquadOrderPosture';
import { Combatant, Faction, Squad, SquadCommand } from './types';
import { SquadCommandConfig } from '../../config/SquadCommandConfig';

function makeCombatant(): Combatant {
  return {
    id: 'c1',
    faction: Faction.US,
    position: new THREE.Vector3(),
    squadId: 'squad-1',
  } as Combatant;
}

function makeSquad(overrides: Partial<Squad> = {}): Squad {
  return {
    id: 'squad-1',
    faction: Faction.US,
    members: ['c1'],
    formation: 'line',
    ...overrides,
  };
}

describe('SquadOrderPosture.resolveOrderIntent', () => {
  it('allows autonomous acquisition when there is no squad', () => {
    const intent = resolveOrderIntent(makeCombatant(), undefined);
    expect(intent.acquisitionAllowed).toBe(true);
    expect(intent.hasActiveOrder).toBe(false);
  });

  it('allows autonomous acquisition for a non-player squad even with a command set', () => {
    const squad = makeSquad({
      isPlayerControlled: false,
      currentCommand: SquadCommand.HOLD_POSITION,
      commandPosition: new THREE.Vector3(10, 0, 0),
    });
    const intent = resolveOrderIntent(makeCombatant(), squad);
    expect(intent.acquisitionAllowed).toBe(true);
    expect(intent.hasActiveOrder).toBe(false);
  });

  it('allows autonomous acquisition for a player squad with no active order', () => {
    const squad = makeSquad({ isPlayerControlled: true, currentCommand: SquadCommand.NONE });
    const intent = resolveOrderIntent(makeCombatant(), squad);
    expect(intent.acquisitionAllowed).toBe(true);
    expect(intent.hasActiveOrder).toBe(false);
  });

  it('does not anchor a leashed order with no marked point (no order intent)', () => {
    const squad = makeSquad({
      isPlayerControlled: true,
      currentCommand: SquadCommand.HOLD_POSITION,
      commandPosition: undefined,
    });
    const intent = resolveOrderIntent(makeCombatant(), squad);
    expect(intent.hasActiveOrder).toBe(false);
    expect(intent.anchor).toBeNull();
  });

  it('produces an anchored leashed intent for a player squad holding a marked point', () => {
    const anchor = new THREE.Vector3(5, 0, 5);
    const squad = makeSquad({
      isPlayerControlled: true,
      currentCommand: SquadCommand.HOLD_POSITION,
      commandPosition: anchor,
    });
    const intent = resolveOrderIntent(makeCombatant(), squad);
    expect(intent.hasActiveOrder).toBe(true);
    expect(intent.acquisitionAllowed).toBe(false);
    expect(intent.mode).toBe('hold');
    expect(intent.anchor).toBe(anchor);
    expect(intent.leashRadius).toBeGreaterThan(0);
  });

  it('prefers the squad-resolved commandLeashRadius over the config fallback', () => {
    const squad = makeSquad({
      isPlayerControlled: true,
      currentCommand: SquadCommand.ATTACK_HERE,
      commandPosition: new THREE.Vector3(),
      commandLeashRadius: 99,
    });
    const intent = resolveOrderIntent(makeCombatant(), squad);
    expect(intent.leashRadius).toBe(99);
  });

  it('distinguishes attack and patrol postures', () => {
    const attack = resolveOrderIntent(
      makeCombatant(),
      makeSquad({
        isPlayerControlled: true,
        currentCommand: SquadCommand.ATTACK_HERE,
        commandPosition: new THREE.Vector3(),
      }),
    );
    const patrol = resolveOrderIntent(
      makeCombatant(),
      makeSquad({
        isPlayerControlled: true,
        currentCommand: SquadCommand.PATROL_HERE,
        commandPosition: new THREE.Vector3(),
      }),
    );
    expect(attack.mode).toBe('attack');
    expect(patrol.mode).toBe('patrol');
  });

  it('is deterministic: identical inputs yield identical intent across calls', () => {
    const squad = makeSquad({
      isPlayerControlled: true,
      currentCommand: SquadCommand.HOLD_POSITION,
      commandPosition: new THREE.Vector3(3, 0, 4),
    });
    const a = resolveOrderIntent(makeCombatant(), squad);
    const b = resolveOrderIntent(makeCombatant(), squad);
    expect(a.mode).toBe(b.mode);
    expect(a.leashRadius).toBe(b.leashRadius);
    expect(a.acquisitionAllowed).toBe(b.acquisitionAllowed);
  });
});

describe('SquadOrderPosture.isWithinLeash', () => {
  it('treats an in-leash enemy as reachable on a HOLD order', () => {
    const anchor = new THREE.Vector3(0, 0, 0);
    const squad = makeSquad({
      isPlayerControlled: true,
      currentCommand: SquadCommand.HOLD_POSITION,
      commandPosition: anchor,
    });
    const intent = resolveOrderIntent(makeCombatant(), squad);
    // Comfortably inside leashRadius.
    const enemy = new THREE.Vector3(intent.leashRadius - 2, 0, 0);
    expect(isWithinLeash(intent, enemy)).toBe(true);
  });

  it('rejects a bait enemy beyond leash + engage band on a HOLD order', () => {
    const anchor = new THREE.Vector3(0, 0, 0);
    const squad = makeSquad({
      isPlayerControlled: true,
      currentCommand: SquadCommand.HOLD_POSITION,
      commandPosition: anchor,
    });
    const intent = resolveOrderIntent(makeCombatant(), squad);
    const reach = intent.leashRadius + SquadCommandConfig.engageBandPastLeash;
    const bait = new THREE.Vector3(reach + 5, 0, 0);
    expect(isWithinLeash(intent, bait)).toBe(false);
  });

  it('still engages a threat inside the engage band but past the leash radius', () => {
    const anchor = new THREE.Vector3(0, 0, 0);
    const squad = makeSquad({
      isPlayerControlled: true,
      currentCommand: SquadCommand.HOLD_POSITION,
      commandPosition: anchor,
    });
    const intent = resolveOrderIntent(makeCombatant(), squad);
    // Past the leash radius but inside the engage band -> still reachable.
    const edge = new THREE.Vector3(intent.leashRadius + 1, 0, 0);
    expect(isWithinLeash(intent, edge)).toBe(true);
  });

  it('ignores vertical offset (horizontal leash only)', () => {
    const anchor = new THREE.Vector3(0, 0, 0);
    const squad = makeSquad({
      isPlayerControlled: true,
      currentCommand: SquadCommand.HOLD_POSITION,
      commandPosition: anchor,
    });
    const intent = resolveOrderIntent(makeCombatant(), squad);
    // Same XZ as a reachable point but lifted far in Y -> still reachable.
    const lifted = new THREE.Vector3(intent.leashRadius - 2, 500, 0);
    expect(isWithinLeash(intent, lifted)).toBe(true);
  });

  it('never gates when there is no active order', () => {
    const intent = resolveOrderIntent(makeCombatant(), undefined);
    const faraway = new THREE.Vector3(10_000, 0, 10_000);
    expect(isWithinLeash(intent, faraway)).toBe(true);
  });
});
