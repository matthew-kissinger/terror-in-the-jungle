/**
 * @vitest-environment jsdom
 */
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
