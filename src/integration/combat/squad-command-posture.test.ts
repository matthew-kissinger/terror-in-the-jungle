// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { GameScenario } from '../harness/GameScenario';
import { CombatantAI } from '../../systems/combat/CombatantAI';
import { AIStatePatrol } from '../../systems/combat/ai/AIStatePatrol';
import { AIStateMovement } from '../../systems/combat/ai/AIStateMovement';
import { CombatantState, Faction, ITargetable, Squad, SquadCommand } from '../../systems/combat/types';
import { SquadCommandConfig } from '../../config/SquadCommandConfig';

// L3 small-scenario test (per docs/TESTING.md): wires the real per-order posture
// path — a real player-commanded Squad, the real CombatantAI command override,
// the real AIStatePatrol / AIStateMovement acquisition scans, the real
// SquadOrderPosture helper, and the live SquadCommandConfig — and asserts the
// SVYAZ-4 Stage 3 product contract from the caller's perspective:
//
//   1. ATTACK pushes a not-yet-arrived unit onto the anchor via ADVANCING, and
//      that unit engages an enemy it meets en route.
//   2. FALL BACK breaks contact, heads to rally, and will NOT re-acquire an
//      enemy unless it was recently hit (fire-only-if-pinned).
//   3. The faction-gate fix lets a player-controlled OPFOR squad follow orders.
//   4. PATROL roam stays within the configured radius of the anchor.
//
// Behavior test: positions are derived from the live config, so a retune of the
// leash / radii does not break the test — only a regression of behavior does.

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

describe('Squad-command per-order posture (SVYAZ-4 Stage 3)', () => {
  let scenario: GameScenario;
  let ai: CombatantAI;
  let patrol: AIStatePatrol;
  let movement: AIStateMovement;

  beforeEach(() => {
    scenario = new GameScenario(2000);
    ai = new CombatantAI();
    ai.setSquads(scenario.squadManager.getAllSquads());
    patrol = new AIStatePatrol();
    patrol.setSquads(scenario.squadManager.getAllSquads());
    movement = new AIStateMovement();
    movement.setSquads(scenario.squadManager.getAllSquads());
  });

  afterEach(() => {
    scenario.dispose();
  });

  // Nearest living enemy of the opposing alliance — mirrors the real acquisition
  // contract (closest hostile) without the full LOS pipeline.
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

  function command(squad: Squad, cmd: SquadCommand, anchor?: THREE.Vector3): void {
    squad.isPlayerControlled = true;
    squad.currentCommand = cmd;
    squad.commandPosition = anchor ? anchor.clone() : undefined;
    if (cmd === SquadCommand.ATTACK_HERE) squad.commandLeashRadius = SquadCommandConfig.attackLeashRadius;
    if (cmd === SquadCommand.HOLD_POSITION) squad.commandLeashRadius = SquadCommandConfig.holdLeashRadius;
    if (cmd === SquadCommand.PATROL_HERE) squad.commandLeashRadius = SquadCommandConfig.patrolRoamRadius;
  }

  describe('ATTACK -> ADVANCING (push the objective)', () => {
    it('routes a not-yet-arrived unit through ADVANCING onto the anchor', () => {
      const start = new THREE.Vector3(100, 0, 100);
      const anchor = new THREE.Vector3(180, 0, 100); // 80 m away -> not arrived
      const { squad, members } = scenario.spawnSquad(Faction.US, start, 3);
      command(squad, SquadCommand.ATTACK_HERE, anchor);

      const npc = members[0];
      npc.position.copy(start);
      npc.state = CombatantState.PATROLLING;

      ai.updateAI(npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid);

      // The override pushed it into ADVANCING with the anchor as destination.
      expect(npc.state).toBe(CombatantState.ADVANCING);
      expect(npc.destinationPoint).toBeDefined();
      expect(npc.destinationPoint!.distanceTo(anchor)).toBeLessThan(1);
    });

    it('engages an enemy met en route while advancing on the anchor', () => {
      const start = new THREE.Vector3(100, 0, 100);
      const anchor = new THREE.Vector3(180, 0, 100);
      const { squad, members } = scenario.spawnSquad(Faction.US, start, 3);
      command(squad, SquadCommand.ATTACK_HERE, anchor);

      const npc = members[0];
      npc.position.copy(start);
      npc.state = CombatantState.ADVANCING;
      npc.destinationPoint = anchor.clone();

      // Enemy a few metres ahead on the push — inside the close-range react band.
      const enemy = scenario.spawnCombatant(Faction.NVA, start.clone().add(new THREE.Vector3(8, 0, 0)));

      movement.handleAdvancing(
        npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid,
        (self) => nearestEnemy(self), alwaysSee,
      );

      // It drops to ENGAGING and takes the en-route enemy as its target.
      expect(npc.state).toBe(CombatantState.ENGAGING);
      expect(npc.target?.id).toBe(enemy.id);
    });
  });

  describe('FALL BACK posture (break contact, fire only if pinned)', () => {
    it('breaks contact and heads to the marked rally point', () => {
      const anchor = new THREE.Vector3(50, 0, 50);
      const rally = new THREE.Vector3(-120, 0, -120);
      const { squad, members } = scenario.spawnSquad(Faction.US, anchor, 3);
      command(squad, SquadCommand.RETREAT, rally);

      const npc = members[0];
      npc.position.copy(anchor);
      npc.state = CombatantState.ENGAGING;
      npc.target = scenario.spawnCombatant(Faction.NVA, anchor.clone().add(new THREE.Vector3(10, 0, 0)));

      ai.updateAI(npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid);

      // Combat interrupted (target dropped) and destination set to the rally.
      expect(npc.state).toBe(CombatantState.PATROLLING);
      expect(npc.target).toBeNull();
      expect(npc.destinationPoint).toBeDefined();
      expect(npc.destinationPoint!.distanceTo(rally)).toBeLessThan(1);
    });

    it('will NOT re-acquire an enemy while falling back un-pinned', () => {
      const rally = new THREE.Vector3(-120, 0, -120);
      const { squad, members } = scenario.spawnSquad(Faction.US, new THREE.Vector3(50, 0, 50), 3);
      command(squad, SquadCommand.RETREAT, rally);

      const npc = members[0];
      npc.position.set(50, 0, 50);
      npc.state = CombatantState.PATROLLING;
      npc.lastHitTime = 0; // never hit -> not pinned

      // A close enemy that an autonomous NPC would normally acquire.
      scenario.spawnCombatant(Faction.NVA, new THREE.Vector3(55, 0, 50));

      patrol.handlePatrolling(
        npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid,
        (self) => nearestEnemy(self), alwaysSee, alwaysEngage,
      );

      // Suppressed acquisition: it keeps falling back rather than turning to fight.
      expect(npc.state).toBe(CombatantState.PATROLLING);
      expect(npc.target).toBeFalsy();
    });

    it('DOES re-acquire when pinned (hit inside the panic window)', () => {
      const rally = new THREE.Vector3(-120, 0, -120);
      const { squad, members } = scenario.spawnSquad(Faction.US, new THREE.Vector3(50, 0, 50), 3);
      command(squad, SquadCommand.RETREAT, rally);

      const npc = members[0];
      npc.position.set(50, 0, 50);
      npc.state = CombatantState.PATROLLING;
      // Pinned: hit within the panic window -> may fire back.
      npc.lastHitTime = Date.now() - (SquadCommandConfig.fallBackPinnedWindowSeconds * 1000) / 2;

      scenario.spawnCombatant(Faction.NVA, new THREE.Vector3(55, 0, 50));

      patrol.handlePatrolling(
        npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid,
        (self) => nearestEnemy(self), alwaysSee, alwaysEngage,
      );

      // A pinned unit reacts to the threat rather than being cut down fleeing.
      expect(npc.state).toBe(CombatantState.ALERT);
      expect(npc.target).toBeTruthy();
    });
  });

  describe('faction-gate fix (player-control, not faction)', () => {
    it('lets a player-controlled OPFOR squad follow an ATTACK order', () => {
      const start = new THREE.Vector3(100, 0, 100);
      const anchor = new THREE.Vector3(180, 0, 100);
      const { squad, members } = scenario.spawnSquad(Faction.NVA, start, 3);
      command(squad, SquadCommand.ATTACK_HERE, anchor);

      const npc = members[0];
      npc.position.copy(start);
      npc.state = CombatantState.PATROLLING;

      ai.updateAI(npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid);

      // OPFOR, but player-commanded -> the order is honored (was a silent no-op).
      expect(npc.state).toBe(CombatantState.ADVANCING);
      expect(npc.destinationPoint).toBeDefined();
    });

    it('lets a player-controlled OPFOR squad break contact on FALL BACK', () => {
      const rally = new THREE.Vector3(-120, 0, -120);
      const { squad, members } = scenario.spawnSquad(Faction.NVA, new THREE.Vector3(50, 0, 50), 3);
      command(squad, SquadCommand.RETREAT, rally);

      const npc = members[0];
      npc.position.set(50, 0, 50);
      npc.state = CombatantState.ENGAGING;
      npc.target = scenario.spawnCombatant(Faction.US, new THREE.Vector3(60, 0, 50));

      ai.updateAI(npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid);

      expect(npc.state).toBe(CombatantState.PATROLLING);
      expect(npc.target).toBeNull();
      expect(npc.destinationPoint!.distanceTo(rally)).toBeLessThan(1);
    });

    it('leaves a NON-player OPFOR squad byte-identical (no override)', () => {
      const start = new THREE.Vector3(100, 0, 100);
      const anchor = new THREE.Vector3(180, 0, 100);
      const { squad, members } = scenario.spawnSquad(Faction.NVA, start, 3);
      // Command set but NOT player-controlled -> override must be inert.
      squad.isPlayerControlled = false;
      squad.currentCommand = SquadCommand.ATTACK_HERE;
      squad.commandPosition = anchor.clone();

      const npc = members[0];
      npc.position.copy(start);
      npc.state = CombatantState.PATROLLING;

      ai.updateAI(npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid);

      // No player control -> no ATTACK push; it stays in its autonomous state.
      expect(npc.state).not.toBe(CombatantState.ADVANCING);
    });
  });

  describe('PATROL leash (roam stays within radius)', () => {
    it('keeps the roam destination within the configured radius of the anchor', () => {
      const anchor = new THREE.Vector3(100, 0, 100);
      const { squad, members } = scenario.spawnSquad(Faction.US, anchor, 3);
      command(squad, SquadCommand.PATROL_HERE, anchor);

      const npc = members[0];
      npc.position.copy(anchor);
      npc.state = CombatantState.PATROLLING;

      // Drive the roam generator several times; every destination must stay inside
      // the roam radius so the squad holds the area rather than wandering off.
      for (let i = 0; i < 25; i++) {
        // Force a re-roll by clearing the destination each iteration.
        npc.destinationPoint = undefined;
        patrol.handlePatrolling(
          npc, 0.016, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid,
          () => null, alwaysSee, alwaysEngage,
        );
        expect(npc.destinationPoint).toBeDefined();
        expect(npc.destinationPoint!.distanceTo(anchor)).toBeLessThanOrEqual(SquadCommandConfig.patrolRoamRadius + 1e-6);
      }
    });
  });
});
