import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { RespawnManager } from './RespawnManager';
import { CombatantState, Faction, type Combatant, type Squad } from './types';
import { spatialGridManager } from './SpatialGridManager';

vi.mock('./SpatialGridManager', () => ({
  spatialGridManager: {
    removeEntity: vi.fn(),
    syncEntity: vi.fn(),
  },
}));

function createCombatant(id: string, faction: Faction, squadId?: string): Combatant {
  return {
    id,
    faction,
    squadId,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state: CombatantState.IDLE,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any,
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    reactionTimer: 0,
    suppressionLevel: 0,
    alertTimer: 0,
    isFullAuto: false,
    panicLevel: 0,
    lastHitTime: 0,
    consecutiveMisses: 0,
    wanderAngle: 0,
    timeToDirectionChange: 0,
    lastUpdateTime: 0,
    updatePriority: 0,
    lodLevel: 'high',
    kills: 0,
    deaths: 0,
  } as Combatant;
}

describe('RespawnManager spatial consistency', () => {
  let combatants: Map<string, Combatant>;
  let squadManager: { getSquad: ReturnType<typeof vi.fn>; removeSquadMember: ReturnType<typeof vi.fn> };
  let factory: { createCombatant: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    combatants = new Map();
    squadManager = {
      getSquad: vi.fn(() => null),
      removeSquadMember: vi.fn(),
    };
    factory = {
      createCombatant: vi.fn((faction: Faction, position: THREE.Vector3, opts?: { squadId?: string }) => {
        return createCombatant('new-member-1', faction, opts?.squadId);
      }),
    };
    vi.mocked(spatialGridManager.removeEntity).mockClear();
    vi.mocked(spatialGridManager.syncEntity).mockClear();
  });

  it('removes entity from SpatialGridManager on combatant removal', () => {
    const manager = new RespawnManager(
      combatants,
      squadManager as any,
      factory as any
    );
    combatants.set('dead-1', createCombatant('dead-1', Faction.US, 'squad-1'));

    manager.removeCombatant('dead-1');

    expect(spatialGridManager.removeEntity).toHaveBeenCalledWith('dead-1');
    expect(combatants.has('dead-1')).toBe(false);
  });

  it('syncs respawned member into SpatialGridManager immediately', () => {
    const manager = new RespawnManager(
      combatants,
      squadManager as any,
      factory as any
    );
    const squad: Squad = {
      id: 'squad-1',
      faction: Faction.US,
      members: [],
      currentCommand: 0 as any,
    };
    squadManager.getSquad.mockReturnValue(squad);

    manager.respawnSquadMember('squad-1');

    expect(factory.createCombatant).toHaveBeenCalled();
    expect(spatialGridManager.syncEntity).toHaveBeenCalledWith('new-member-1', expect.any(THREE.Vector3));
    expect(combatants.has('new-member-1')).toBe(true);
  });
});