// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  resolveOrderIntent,
  isWithinLeash,
  resolveFallbackRally,
  isFallbackAcquisitionSuppressed,
  isRecentlyHit,
} from './SquadOrderPosture';
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

describe('SquadOrderPosture FALL BACK posture (SVYAZ-4 Stage 3)', () => {
  function fallBackSquad(overrides: Partial<Squad> = {}): Squad {
    return makeSquad({
      isPlayerControlled: true,
      currentCommand: SquadCommand.RETREAT,
      ...overrides,
    });
  }

  it('resolves a fallback posture without engaging the leash band', () => {
    // FALL BACK is a posture, not a leash: it must not gate acquisition by
    // distance from an anchor (that is what makes a unit "fire only if pinned"
    // rather than "engage within the leash").
    const intent = resolveOrderIntent(makeCombatant(), fallBackSquad());
    expect(intent.mode).toBe('fallback');
    expect(intent.hasActiveOrder).toBe(false);
    // An enemy a kilometre away is still "within leash" because there is no leash.
    expect(isWithinLeash(intent, new THREE.Vector3(1000, 0, 1000))).toBe(true);
  });

  it('rallies to the marked point when FALL BACK carries one', () => {
    const mark = new THREE.Vector3(7, 0, -3);
    const squad = fallBackSquad({ commandPosition: mark });
    const rally = resolveFallbackRally(squad, new THREE.Vector3(100, 0, 100));
    expect(rally).not.toBeNull();
    expect(rally!.x).toBe(7);
    expect(rally!.z).toBe(-3);
  });

  it('rallies to the live player when FALL BACK has no marked point', () => {
    const squad = fallBackSquad({ commandPosition: undefined });
    const player = new THREE.Vector3(42, 0, 9);
    const rally = resolveFallbackRally(squad, player);
    expect(rally).not.toBeNull();
    expect(rally!.x).toBe(42);
    expect(rally!.z).toBe(9);
  });

  it('does not mutate the marked point or player position it returns', () => {
    const mark = new THREE.Vector3(1, 0, 1);
    const squad = fallBackSquad({ commandPosition: mark });
    const rally = resolveFallbackRally(squad, new THREE.Vector3())!;
    rally.set(999, 999, 999);
    // The order board's marked point is untouched (rally is a clone).
    expect(mark.x).toBe(1);
    expect(mark.z).toBe(1);
  });

  it('suppresses acquisition for an un-pinned FALL BACK unit', () => {
    const intent = resolveOrderIntent(makeCombatant(), fallBackSquad());
    // Never hit (lastHitTime 0) -> suppressed (runs to rally, does not fight).
    expect(isFallbackAcquisitionSuppressed(intent, 0, 10_000)).toBe(true);
  });

  it('lets a pinned FALL BACK unit re-acquire (hit inside the panic window)', () => {
    const intent = resolveOrderIntent(makeCombatant(), fallBackSquad());
    const now = 100_000;
    const windowMs = SquadCommandConfig.fallBackPinnedWindowSeconds * 1000;
    // Hit half a window ago -> pinned -> not suppressed -> may fire back.
    const recentHit = now - windowMs / 2;
    expect(isFallbackAcquisitionSuppressed(intent, recentHit, now)).toBe(false);
  });

  it('re-suppresses once the pin (last hit) ages out of the panic window', () => {
    const intent = resolveOrderIntent(makeCombatant(), fallBackSquad());
    const now = 100_000;
    const windowMs = SquadCommandConfig.fallBackPinnedWindowSeconds * 1000;
    const oldHit = now - windowMs * 2;
    expect(isFallbackAcquisitionSuppressed(intent, oldHit, now)).toBe(true);
  });

  it('never suppresses acquisition for a non-fallback posture', () => {
    // A HOLD intent is leashed, not fallback — suppression must be inert there so
    // the leash band stays the sole gate.
    const hold = resolveOrderIntent(
      makeCombatant(),
      makeSquad({
        isPlayerControlled: true,
        currentCommand: SquadCommand.HOLD_POSITION,
        commandPosition: new THREE.Vector3(),
      }),
    );
    expect(isFallbackAcquisitionSuppressed(hold, 0, 10_000)).toBe(false);
  });
});

describe('SquadOrderPosture.isRecentlyHit', () => {
  it('treats a never-hit unit (lastHitTime 0) as not recent', () => {
    expect(isRecentlyHit(0, 10_000, 3000)).toBe(false);
  });

  it('is true inside the window and false outside it', () => {
    expect(isRecentlyHit(9000, 10_000, 3000)).toBe(true);
    expect(isRecentlyHit(6000, 10_000, 3000)).toBe(false);
  });

  it('is deterministic given an explicit clock (no wall-clock read)', () => {
    const a = isRecentlyHit(8000, 10_000, 3000);
    const b = isRecentlyHit(8000, 10_000, 3000);
    expect(a).toBe(b);
  });
});
