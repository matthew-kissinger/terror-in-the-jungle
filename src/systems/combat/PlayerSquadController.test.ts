/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Faction, Squad, SquadCommand } from './types';
import { PlayerSquadController } from './PlayerSquadController';
import { SQUAD_COMMAND_WORLD_MARKER_NAME } from './SquadCommandWorldMarker';

describe('PlayerSquadController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('keeps targeted command positions for directed orders', () => {
    const squad = createSquad();
    const controller = new PlayerSquadController(createSquadManagerStub(squad) as any);
    controller.assignPlayerSquad(squad.id);

    const holdPosition = new THREE.Vector3(40, 0, -18);
    controller.issueCommandAtPosition(SquadCommand.HOLD_POSITION, holdPosition);

    expect(squad.currentCommand).toBe(SquadCommand.HOLD_POSITION);
    expect(squad.commandPosition).not.toBe(holdPosition);
    expect(squad.commandPosition).toEqual(holdPosition);
  });

  it('drops a target command issued without a marked point (no player-feet anchor)', () => {
    const squad = createSquad();
    const controller = new PlayerSquadController(createSquadManagerStub(squad) as any);
    controller.assignPlayerSquad(squad.id);
    // Player standing somewhere non-trivial — the old bug anchored HOLD here.
    controller.updatePlayerPosition(new THREE.Vector3(5, 0, 5));

    // Hotkey path with no resolved point (slot 2 = HOLD_POSITION).
    controller.issueQuickCommand(2);

    // Dropped, not silently anchored on the player's feet.
    expect(squad.currentCommand).not.toBe(SquadCommand.HOLD_POSITION);
    expect(squad.commandPosition).toBeUndefined();
  });

  it('stores attack-here as a directed command point', () => {
    const squad = createSquad();
    const controller = new PlayerSquadController(createSquadManagerStub(squad) as any);
    controller.assignPlayerSquad(squad.id);

    const attackPosition = new THREE.Vector3(90, 0, 16);
    controller.issueCommandAtPosition(SquadCommand.ATTACK_HERE, attackPosition);

    expect(squad.currentCommand).toBe(SquadCommand.ATTACK_HERE);
    expect(squad.commandPosition).not.toBe(attackPosition);
    expect(squad.commandPosition).toEqual(attackPosition);
  });

  it('shows an in-world marker for directed squad commands', () => {
    const scene = new THREE.Scene();
    const squad = createSquad();
    const controller = new PlayerSquadController(createSquadManagerStub(squad) as any, {
      scene,
      terrainHeightAt: () => 7,
    });
    controller.assignPlayerSquad(squad.id);

    controller.issueCommandAtPosition(SquadCommand.ATTACK_HERE, new THREE.Vector3(90, 0, 16));

    const marker = scene.getObjectByName(SQUAD_COMMAND_WORLD_MARKER_NAME);
    expect(marker).toBeDefined();
    expect(marker?.visible).toBe(true);
    expect(marker?.position.x).toBe(90);
    expect(marker?.position.y).toBeGreaterThan(7);
    expect(marker?.position.z).toBe(16);
  });

  it('snaps a HOLD anchor to the nearest reachable navmesh point (Stage 4)', () => {
    const squad = createSquad();
    // Snapper relocates the marked point to a reachable spot (e.g. off a cliff).
    const reachable = new THREE.Vector3(38, 2, -15);
    const snapToNavmesh = vi.fn(() => reachable);
    const controller = new PlayerSquadController(createSquadManagerStub(squad) as any, {
      snapToNavmesh,
    });
    controller.assignPlayerSquad(squad.id);

    const marked = new THREE.Vector3(40, 0, -18);
    controller.issueCommandAtPosition(SquadCommand.HOLD_POSITION, marked);

    expect(snapToNavmesh).toHaveBeenCalledTimes(1);
    // Stored anchor is the snapped point, not the raw marked point.
    expect(squad.commandPosition).toEqual(reachable);
    // Stored as a clone — mutating the squad's anchor must not feed back.
    expect(squad.commandPosition).not.toBe(reachable);
  });

  it('stores the raw marked point when the navmesh snap fails (fail-open)', () => {
    const squad = createSquad();
    // Navmesh not ready / nothing reachable within radius -> null.
    const snapToNavmesh = vi.fn(() => null);
    const controller = new PlayerSquadController(createSquadManagerStub(squad) as any, {
      snapToNavmesh,
    });
    controller.assignPlayerSquad(squad.id);

    const marked = new THREE.Vector3(60, 0, 12);
    controller.issueCommandAtPosition(SquadCommand.ATTACK_HERE, marked);

    expect(snapToNavmesh).toHaveBeenCalledTimes(1);
    // Command is NOT dropped — the raw point is kept rather than losing the order.
    expect(squad.currentCommand).toBe(SquadCommand.ATTACK_HERE);
    expect(squad.commandPosition).toEqual(marked);
  });

  it('does not snap non-leashed FALL BACK to navmesh (rally is a posture, not an anchor)', () => {
    const squad = createSquad();
    const snapToNavmesh = vi.fn(() => new THREE.Vector3(999, 0, 999));
    const controller = new PlayerSquadController(createSquadManagerStub(squad) as any, {
      snapToNavmesh,
    });
    controller.assignPlayerSquad(squad.id);

    const marked = new THREE.Vector3(7, 0, -3);
    controller.issueCommandAtPosition(SquadCommand.RETREAT, marked);

    // FALL BACK carries no leash anchor -> snapper untouched, raw point honored.
    expect(snapToNavmesh).not.toHaveBeenCalled();
    expect(squad.commandPosition).toEqual(marked);
  });

  it('leaves anchors untouched when no snapper is wired (byte-identical off-path)', () => {
    const squad = createSquad();
    const controller = new PlayerSquadController(createSquadManagerStub(squad) as any);
    controller.assignPlayerSquad(squad.id);

    const marked = new THREE.Vector3(40, 0, -18);
    controller.issueCommandAtPosition(SquadCommand.HOLD_POSITION, marked);

    expect(squad.commandPosition).toEqual(marked);
    expect(squad.commandPosition).not.toBe(marked);
  });

  it('issues stand down without retaining the prior command point or changing formation', () => {
    const squad = createSquad();
    const scene = new THREE.Scene();
    const controller = new PlayerSquadController(createSquadManagerStub(squad) as any, { scene });
    controller.assignPlayerSquad(squad.id);

    controller.issueCommandAtPosition(SquadCommand.HOLD_POSITION, new THREE.Vector3(80, 0, 30));
    controller.issueQuickCommand(5);
    const marker = scene.getObjectByName(SQUAD_COMMAND_WORLD_MARKER_NAME);

    expect(squad.currentCommand).toBe(SquadCommand.FREE_ROAM);
    expect(squad.commandPosition).toBeUndefined();
    expect(marker?.visible).toBe(false);
    expect(squad.formation).toBe('wedge');
    expect(controller.getCommandState()).toMatchObject({
      currentCommand: SquadCommand.FREE_ROAM,
      selectedFormation: 'wedge',
    });
    expect(controller.getCommandState().commandPosition).toBeUndefined();
  });
});

function createSquad(): Squad {
  return {
    id: 'squad-player',
    faction: Faction.US,
    members: ['leader-player', 'rifleman-1', 'rifleman-2'],
    leaderId: 'leader-player',
    formation: 'wedge',
    isPlayerControlled: true,
    currentCommand: SquadCommand.NONE,
  };
}

function createSquadManagerStub(squad: Squad) {
  return {
    getSquad: vi.fn((squadId: string) => (squadId === squad.id ? squad : undefined)),
  };
}
