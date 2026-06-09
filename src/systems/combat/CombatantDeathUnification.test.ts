// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * L3 cross-path repro suite for combat-death-unification.
 *
 * The keystone guarantee: a combatant that dies by rifle fire and a combatant
 * that dies by explosion in the SAME squad configuration end up with IDENTICAL
 * squad bookkeeping — member removed, leader promoted if needed, empty squad
 * deleted. Before unification the rifle path spliced the member array directly
 * (no promotion, no deletion) while the explosion path went through
 * SquadManager.removeSquadMember (which did both), so the two diverged.
 *
 * Also asserts the explosion route only damages combatants the spatial grid
 * reports in-radius, not every combatant via an O(N) scan.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CombatantDamage } from './CombatantDamage';
import { CombatantSystemDamage } from './CombatantSystemDamage';
import { Combatant, Faction, Squad } from './types';
import { createTestCombatant } from '../../test-utils';
import { spatialGridManager } from './SpatialGridManager';
import type { SquadManager } from './SquadManager';
import type { CombatantSpawnManager } from './CombatantSpawnManager';
import { GameEventBus } from '../../core/GameEventBus';

vi.mock('./SpatialGridManager', () => ({
  spatialGridManager: {
    getIsInitialized: vi.fn(() => true),
    queryRadius: vi.fn(() => [] as string[]),
    removeEntity: vi.fn(),
    syncEntity: vi.fn(),
  },
}));

function makeSquad(id: string, members: string[], leaderId: string): Squad {
  return { id, faction: Faction.US, members: [...members], leaderId, formation: 'line' };
}

/**
 * Minimal SquadManager surface the unified death handler / explosion route use:
 * a live squad registry plus per-id lookup. Promotion + deletion are done by the
 * pipeline against the same map, so a real SquadManager is not required here.
 */
function makeSquadRegistry(squads: Map<string, Squad>): SquadManager {
  return {
    getAllSquads: () => squads,
    getSquad: (id: string) => squads.get(id),
    removeSquadMember: vi.fn(),
  } as unknown as SquadManager;
}

describe('combat-death-unification: rifle vs explosion squad bookkeeping', () => {
  let rifle: CombatantDamage;

  beforeEach(() => {
    GameEventBus.flush();
    GameEventBus.clear();
    rifle = new CombatantDamage();
    vi.clearAllMocks();
    (spatialGridManager.queryRadius as unknown as vi.Mock).mockReturnValue([]);
  });

  afterEach(() => {
    GameEventBus.flush();
    GameEventBus.clear();
  });

  function explosionDamage(combatants: Map<string, Combatant>, squads: Map<string, Squad>): CombatantSystemDamage {
    return new CombatantSystemDamage(
      combatants,
      makeSquadRegistry(squads),
      { queueRespawn: vi.fn() } as unknown as CombatantSpawnManager,
    );
  }

  it('produces identical squad state whether the leader dies by rifle or by explosion', () => {
    // --- Rifle path ---
    const rifleLeader = createTestCombatant({ id: 'L', faction: Faction.US, health: 10, squadId: 'sq' });
    const rifleSquads = new Map<string, Squad>([['sq', makeSquad('sq', ['L', 'M2', 'M3'], 'L')]]);
    rifle.applyDamage(rifleLeader, 50, undefined, rifleSquads);
    const rifleSquad = rifleSquads.get('sq');

    // --- Explosion path ---
    const expLeader = createTestCombatant({ id: 'L', faction: Faction.US, health: 10, squadId: 'sq', position: new THREE.Vector3(0, 0, 0) });
    const expCombatants = new Map<string, Combatant>([['L', expLeader]]);
    const expSquads = new Map<string, Squad>([['sq', makeSquad('sq', ['L', 'M2', 'M3'], 'L')]]);
    (spatialGridManager.queryRadius as unknown as vi.Mock).mockReturnValue(['L']);
    explosionDamage(expCombatants, expSquads).applyExplosionDamage(new THREE.Vector3(0, 0, 0), 5, 100, 'PLAYER');
    const expSquad = expSquads.get('sq');

    // Both removed the dead leader, promoted a survivor, and kept the squad.
    expect(rifleSquad).toBeDefined();
    expect(expSquad).toBeDefined();
    expect(rifleSquad!.members).toEqual(expSquad!.members);
    expect(rifleSquad!.members).not.toContain('L');
    expect(rifleSquad!.leaderId).toBe(expSquad!.leaderId);
    expect(rifleSquad!.leaderId).not.toBe('L');
    expect(rifleSquad!.members).toContain(rifleSquad!.leaderId!);
  });

  it('deletes the squad on the last death by either route', () => {
    // Rifle
    const rifleLast = createTestCombatant({ id: 'X', faction: Faction.US, health: 10, squadId: 'solo' });
    const rifleSquads = new Map<string, Squad>([['solo', makeSquad('solo', ['X'], 'X')]]);
    rifle.applyDamage(rifleLast, 50, undefined, rifleSquads);

    // Explosion
    const expLast = createTestCombatant({ id: 'X', faction: Faction.US, health: 10, squadId: 'solo', position: new THREE.Vector3(0, 0, 0) });
    const expCombatants = new Map<string, Combatant>([['X', expLast]]);
    const expSquads = new Map<string, Squad>([['solo', makeSquad('solo', ['X'], 'X')]]);
    (spatialGridManager.queryRadius as unknown as vi.Mock).mockReturnValue(['X']);
    explosionDamage(expCombatants, expSquads).applyExplosionDamage(new THREE.Vector3(0, 0, 0), 5, 100, 'PLAYER');

    expect(rifleSquads.has('solo')).toBe(false);
    expect(expSquads.has('solo')).toBe(false);
  });
});

describe('combat-death-unification: explosion radius query', () => {
  beforeEach(() => {
    GameEventBus.flush();
    GameEventBus.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    GameEventBus.flush();
    GameEventBus.clear();
  });

  it('only damages combatants the spatial grid reports in-radius, not every combatant', () => {
    const inRadius = createTestCombatant({ id: 'near', faction: Faction.NVA, health: 100, position: new THREE.Vector3(2, 0, 0) });
    // Out-of-radius combatant: a full O(N) scan would still distance-test it,
    // but a spatial-grid query must never even consider it.
    const farAway = createTestCombatant({ id: 'far', faction: Faction.NVA, health: 100, position: new THREE.Vector3(500, 0, 0) });
    const combatants = new Map<string, Combatant>([
      ['near', inRadius],
      ['far', farAway],
    ]);

    const queryRadius = spatialGridManager.queryRadius as unknown as vi.Mock;
    queryRadius.mockReturnValue(['near']);

    const damage = new CombatantSystemDamage(
      combatants,
      { getAllSquads: () => new Map(), getSquad: vi.fn(), removeSquadMember: vi.fn() } as unknown as SquadManager,
      { queueRespawn: vi.fn() } as unknown as CombatantSpawnManager,
    );

    damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 5, 100, 'PLAYER');

    // The grid was consulted with the explosion center + radius.
    expect(queryRadius).toHaveBeenCalledWith(expect.any(THREE.Vector3), 5);
    // In-radius combatant took damage; out-of-radius one is untouched.
    expect(inRadius.health).toBeLessThan(100);
    expect(farAway.health).toBe(100);
  });
});
