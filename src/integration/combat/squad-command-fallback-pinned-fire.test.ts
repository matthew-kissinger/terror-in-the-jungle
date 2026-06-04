// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { GameScenario } from '../harness/GameScenario';
import { CombatantAI } from '../../systems/combat/CombatantAI';
import { Combatant, CombatantState, Faction, Squad, SquadCommand } from '../../systems/combat/types';
import { SquadCommandConfig } from '../../config/SquadCommandConfig';

// L3 small-scenario test (per docs/TESTING.md): wires the real CombatantAI
// per-tick state machine (which runs applySquadCommandOverride BEFORE the state
// handler) against a real player-commanded Squad + the live SquadCommandConfig
// and asserts the SVYAZ-4 Stage 4 FALL BACK "fire only if pinned" contract from
// the caller's perspective, across MULTIPLE ticks:
//
//   1. A PINNED FALL BACK unit (hit inside the panic window) is NOT yanked out
//      of combat every tick — it promotes ALERT -> ENGAGING and fires back.
//   2. A NOT-pinned FALL BACK unit IS interrupted and redirected to rally; it
//      never reaches ENGAGING (it runs rather than turning to fight).
//   3. Non-FALL-BACK / non-player combat is byte-identical (FOLLOW_ME still
//      always interrupts; the pin ages out and the fall-back resumes).
//
// Behavior test: the in/out timings are derived from the live config (the panic
// window), so a retune does not break the test — only a behavior regression does.

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

const PLAYER_POSITION = new THREE.Vector3(500, 0, 500);

describe('Squad-command FALL BACK fire-only-if-pinned (SVYAZ-4 Stage 4)', () => {
  let scenario: GameScenario;
  let ai: CombatantAI;

  beforeEach(() => {
    scenario = new GameScenario(2000);
    ai = new CombatantAI();
    ai.setSquads(scenario.squadManager.getAllSquads());
  });

  afterEach(() => {
    scenario.dispose();
  });

  function fallBackOrder(squad: Squad): void {
    squad.isPlayerControlled = true;
    squad.currentCommand = SquadCommand.RETREAT;
    // No marked point -> rally to the live player.
    squad.commandPosition = undefined;
  }

  // Drive the real per-tick AI for a unit already in a combat state with a
  // target (the perception scan having already acquired). For ALERT, the small
  // reactionTimer lets a couple of ticks promote it to ENGAGING — IF the per-tick
  // override does not yank it.
  function tickAI(npc: Combatant, frames: number): void {
    for (let i = 0; i < frames; i++) {
      ai.beginFrame();
      ai.updateAI(npc, 1 / 60, PLAYER_POSITION, scenario.combatants, scenario.spatialGrid);
    }
  }

  function commandedNpc(state: CombatantState): { squad: Squad; npc: Combatant; enemy: Combatant } {
    const anchor = new THREE.Vector3(100, 0, 100);
    const { squad, members } = scenario.spawnSquad(Faction.US, anchor, 3);
    fallBackOrder(squad);

    const npc = members[0];
    npc.position.copy(anchor);
    npc.simLane = 'high';

    // A close enemy the unit has already acquired.
    const enemy = scenario.spawnCombatant(Faction.NVA, anchor.clone().add(new THREE.Vector3(4, 0, 0)));
    npc.state = state;
    npc.target = enemy;
    if (state === CombatantState.ALERT) {
      npc.reactionTimer = 1 / 60;
      npc.alertTimer = 1.5;
    }
    return { squad, npc, enemy };
  }

  it('a PINNED FALL BACK unit reaches ENGAGING and fires back', () => {
    const { npc } = commandedNpc(CombatantState.ALERT);
    // Pinned: hit just now (well inside the panic window).
    npc.lastHitTime = Date.now();

    tickAI(npc, 8);

    // The pinned unit was NOT interrupted out of combat — it stood and fought.
    expect(npc.state).toBe(CombatantState.ENGAGING);
    expect(npc.target).toBeTruthy();
  });

  it('a NOT-pinned FALL BACK unit runs to rally without acquiring (never ENGAGING)', () => {
    const { npc } = commandedNpc(CombatantState.ALERT);
    // Not pinned: never hit.
    npc.lastHitTime = 0;

    tickAI(npc, 8);

    // Interrupted every tick: pulled out of combat, redirected to rally (player).
    expect(npc.state).not.toBe(CombatantState.ENGAGING);
    expect(npc.target).toBeNull();
    expect(npc.destinationPoint).toBeDefined();
    // Rally is the live player (no marked point) — the redirect points the goal
    // at the player, confirming the fall-back fired rather than chasing the enemy.
    expect(npc.destinationPoint!.x).toBeCloseTo(PLAYER_POSITION.x, 5);
    expect(npc.destinationPoint!.z).toBeCloseTo(PLAYER_POSITION.z, 5);
  });

  it('keeps a pinned unit ENGAGING (does not get dropped mid-fight)', () => {
    const { npc } = commandedNpc(CombatantState.ENGAGING);
    npc.lastHitTime = Date.now();

    tickAI(npc, 4);

    // A pinned unit already engaging keeps its target through the override.
    expect(npc.state).toBe(CombatantState.ENGAGING);
    expect(npc.target).toBeTruthy();
  });

  it('FOLLOW_ME always interrupts combat regardless of pin (no fire-back posture)', () => {
    const anchor = new THREE.Vector3(100, 0, 100);
    const { squad, members } = scenario.spawnSquad(Faction.US, anchor, 3);
    squad.isPlayerControlled = true;
    squad.currentCommand = SquadCommand.FOLLOW_ME;

    const npc = members[0];
    npc.position.copy(anchor);
    npc.simLane = 'high';
    // Pinned — but FOLLOW_ME has no fire-back exemption.
    npc.lastHitTime = Date.now();

    const enemy = scenario.spawnCombatant(Faction.NVA, anchor.clone().add(new THREE.Vector3(4, 0, 0)));
    npc.state = CombatantState.ENGAGING;
    npc.target = enemy;

    tickAI(npc, 1);

    // FOLLOW_ME pulls the unit OUT of ENGAGING regardless of the pin — unlike a
    // pinned RETREAT unit, it has no fire-back posture and breaks off to form up.
    // (It may autonomously re-detect the close enemy on the same tick's patrol
    // scan; the point is the combat interrupt fired, not that it stays unaware.)
    expect(npc.state).not.toBe(CombatantState.ENGAGING);
  });

  it('once the pin ages out of the panic window, the unit resumes the fall-back', () => {
    const { npc } = commandedNpc(CombatantState.ENGAGING);
    // Last hit is older than the panic window -> no longer pinned.
    npc.lastHitTime = Date.now() - (SquadCommandConfig.fallBackPinnedWindowSeconds * 1000 + 5000);

    tickAI(npc, 2);

    // Pin aged out -> treated as not pinned -> interrupted + redirected to rally.
    expect(npc.state).not.toBe(CombatantState.ENGAGING);
    expect(npc.target).toBeNull();
    expect(npc.destinationPoint).toBeDefined();
  });
});
