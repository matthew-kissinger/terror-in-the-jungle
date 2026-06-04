// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { GameScenario } from '../harness/GameScenario';
import { AIStatePatrol } from '../../systems/combat/ai/AIStatePatrol';
import { AIStateDefend } from '../../systems/combat/ai/AIStateDefend';
import { CombatantState, Faction, ITargetable, Squad, SquadCommand } from '../../systems/combat/types';
import { SquadCommandConfig } from '../../config/SquadCommandConfig';

// L3 small-scenario test (per docs/TESTING.md): wires the real persistence-leash
// path end-to-end — a real player-commanded Squad (SquadManager), the real
// AIStatePatrol + AIStateDefend acquisition scans, the real SquadOrderPosture
// helper, and the live SquadCommandConfig — and asserts the SVYAZ-4 Stage 2
// product contract from the caller's perspective:
//
//   1. A commanded NPC on HOLD engages an enemy INSIDE its leash.
//   2. It does NOT get baited into chasing an enemy OUTSIDE
//      (leash + engageBandPastLeash) of the anchor.
//   3. With no enemy in reach it drifts back toward the anchor (the standing
//      order persists rather than dying the moment combat starts).
//
// This is a behavior test: it never asserts on tuning constants directly — the
// in/out positions are derived from the live config so a retune of the leash
// does not break the test, only a regression of the *behavior* does.

// Stub HeightQueryCache so SquadManager doesn't depend on noise generation.
vi.mock('../../systems/terrain/HeightQueryCache', () => ({
  getHeightQueryCache: () => ({
    getHeightAt: (_x: number, _z: number) => 0,
  }),
}));

vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const PLAYER_POSITION = new THREE.Vector3(0, 0, 0);

describe('Squad-command persistence leash (SVYAZ-4 Stage 2)', () => {
  let scenario: GameScenario;
  let patrol: AIStatePatrol;
  let defend: AIStateDefend;

  beforeEach(() => {
    scenario = new GameScenario(2000);
    patrol = new AIStatePatrol();
    defend = new AIStateDefend();
    patrol.setSquads(scenario.squadManager.getAllSquads());
    defend.setSquads(scenario.squadManager.getAllSquads());
  });

  afterEach(() => {
    scenario.dispose();
  });

  // findNearestEnemy stand-in: nearest living enemy of the opposing alliance.
  // Mirrors the real acquisition contract (closest hostile) without dragging in
  // the full LOS/visual-range pipeline, which is not what this test exercises.
  function nearestEnemy(self: { faction: Faction; position: THREE.Vector3 }): ITargetable | null {
    let best: ITargetable | null = null;
    let bestDistSq = Infinity;
    for (const c of scenario.getLiving()) {
      if (c.faction === self.faction) continue;
      const d = c.position.distanceToSquared(self.position);
      if (d < bestDistSq) {
        bestDistSq = d;
        best = c;
      }
    }
    return best;
  }

  const alwaysSee = () => true;
  const alwaysEngage = () => true;

  function holdAt(squad: Squad, anchor: THREE.Vector3): void {
    squad.isPlayerControlled = true;
    squad.currentCommand = SquadCommand.HOLD_POSITION;
    squad.commandPosition = anchor.clone();
    squad.commandLeashRadius = SquadCommandConfig.holdLeashRadius;
  }

  it('engages an enemy inside the HOLD leash', () => {
    const anchor = new THREE.Vector3(100, 0, 100);
    const { squad, members } = scenario.spawnSquad(Faction.US, anchor, 4);
    holdAt(squad, anchor);

    const npc = members[0];
    npc.position.copy(anchor);
    npc.state = CombatantState.PATROLLING;

    // Enemy comfortably inside the leash radius.
    const inLeash = anchor.clone().add(new THREE.Vector3(SquadCommandConfig.holdLeashRadius - 4, 0, 0));
    scenario.spawnCombatant(Faction.NVA, inLeash);

    patrol.handlePatrolling(
      npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid,
      (self) => nearestEnemy(self), alwaysSee, alwaysEngage,
    );

    // Observable: the NPC acquired the in-leash threat and is reacting to it.
    expect(npc.state).toBe(CombatantState.ALERT);
    expect(npc.target).toBeTruthy();
  });

  it('does NOT chase a bait enemy beyond leash + engage band', () => {
    const anchor = new THREE.Vector3(100, 0, 100);
    const { squad, members } = scenario.spawnSquad(Faction.US, anchor, 4);
    holdAt(squad, anchor);

    const npc = members[0];
    npc.position.copy(anchor);
    npc.state = CombatantState.PATROLLING;

    // Bait enemy well beyond the engage band from the anchor.
    const reach = SquadCommandConfig.holdLeashRadius + SquadCommandConfig.engageBandPastLeash;
    const bait = anchor.clone().add(new THREE.Vector3(reach + 15, 0, 0));
    scenario.spawnCombatant(Faction.NVA, bait);

    patrol.handlePatrolling(
      npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid,
      (self) => nearestEnemy(self), alwaysSee, alwaysEngage,
    );

    // Observable: the standing order persists — the NPC ignores the bait and
    // stays on patrol rather than promoting to ALERT and chasing.
    expect(npc.state).toBe(CombatantState.PATROLLING);
    expect(npc.target).toBeFalsy();
  });

  it('returns toward the anchor when no enemy is in reach (order persists)', () => {
    const anchor = new THREE.Vector3(100, 0, 100);
    const { squad, members } = scenario.spawnSquad(Faction.US, anchor, 4);
    holdAt(squad, anchor);

    const npc = members[0];
    // NPC has drifted off the anchor (e.g. after an earlier engagement).
    npc.position.copy(anchor.clone().add(new THREE.Vector3(10, 0, 0)));
    npc.state = CombatantState.PATROLLING;

    // Only a far bait enemy exists — out of reach, must not be chased.
    const reach = SquadCommandConfig.holdLeashRadius + SquadCommandConfig.engageBandPastLeash;
    const bait = anchor.clone().add(new THREE.Vector3(reach + 40, 0, 0));
    scenario.spawnCombatant(Faction.NVA, bait);

    patrol.handlePatrolling(
      npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid,
      (self) => nearestEnemy(self), alwaysSee, alwaysEngage,
    );

    // The HOLD command handler sets the destination back to the anchor, and the
    // bait did not drag the NPC into combat.
    expect(npc.state).toBe(CombatantState.PATROLLING);
    expect(npc.destinationPoint).toBeDefined();
    const distBefore = npc.position.distanceTo(anchor);
    const distGoal = npc.destinationPoint!.distanceTo(anchor);
    expect(distGoal).toBeLessThan(distBefore);
  });

  it('a DEFENDING commanded NPC fires inside the leash but ignores the out-of-leash bait', () => {
    const anchor = new THREE.Vector3(100, 0, 100);
    const { squad, members } = scenario.spawnSquad(Faction.US, anchor, 4);
    holdAt(squad, anchor);

    const npc = members[0];
    npc.position.copy(anchor);
    npc.state = CombatantState.DEFENDING;
    npc.defensePosition = anchor.clone();

    const reach = SquadCommandConfig.holdLeashRadius + SquadCommandConfig.engageBandPastLeash;
    const bait = anchor.clone().add(new THREE.Vector3(reach + 20, 0, 0));
    const baitEnemy = scenario.spawnCombatant(Faction.NVA, bait);

    // Only the bait exists -> defender holds, does not flip to ALERT.
    defend.handleDefending(
      npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid,
      (self) => nearestEnemy(self), alwaysSee,
    );
    expect(npc.state).toBe(CombatantState.DEFENDING);
    expect(npc.target).toBeFalsy();

    // Now add an in-leash threat -> defender engages it.
    scenario.killCombatant(baitEnemy.id);
    const inLeash = anchor.clone().add(new THREE.Vector3(SquadCommandConfig.holdLeashRadius - 5, 0, 0));
    scenario.spawnCombatant(Faction.NVA, inLeash);

    defend.handleDefending(
      npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid,
      (self) => nearestEnemy(self), alwaysSee,
    );
    expect(npc.state).toBe(CombatantState.ALERT);
    expect(npc.target).toBeTruthy();
  });

  it('leaves a non-player squad byte-identical: it chases an out-of-leash enemy', () => {
    const anchor = new THREE.Vector3(100, 0, 100);
    const { squad, members } = scenario.spawnSquad(Faction.US, anchor, 4);
    // NOT player-controlled, but with a command set + far enemy: the leash must
    // be inert (off the commanded path), so the NPC reacts normally.
    squad.isPlayerControlled = false;
    squad.currentCommand = SquadCommand.HOLD_POSITION;
    squad.commandPosition = anchor.clone();
    squad.commandLeashRadius = SquadCommandConfig.holdLeashRadius;

    const npc = members[0];
    npc.position.copy(anchor);
    npc.state = CombatantState.PATROLLING;

    const reach = SquadCommandConfig.holdLeashRadius + SquadCommandConfig.engageBandPastLeash;
    const far = anchor.clone().add(new THREE.Vector3(reach + 15, 0, 0));
    scenario.spawnCombatant(Faction.NVA, far);

    patrol.handlePatrolling(
      npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid,
      (self) => nearestEnemy(self), alwaysSee, alwaysEngage,
    );

    // No leash for a non-player squad -> the NPC acquires the far enemy.
    expect(npc.state).toBe(CombatantState.ALERT);
    expect(npc.target).toBeTruthy();
  });
});
