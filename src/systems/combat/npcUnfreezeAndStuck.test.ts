import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CombatantLODManager } from './CombatantLODManager';
import { updatePatrolMovement } from './CombatantMovementStates';
import { handleRejoiningMovement, beginRejoiningSquad } from './CombatantMovementCommands';
import { Combatant, Faction, Squad } from './types';
import { ZoneState } from '../world/ZoneManager';
import { NpcLodConfig } from '../../config/CombatantConfig';
import { createTestCombatant } from '../../test-utils';
import { spatialGridManager } from './SpatialGridManager';

vi.mock('./SpatialGridManager', () => ({
  spatialGridManager: { syncEntity: vi.fn(), removeEntity: vi.fn() },
}));
vi.mock('../../utils/Logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn() } }));

/**
 * Behavior tests for docs/tasks/npc-unfreeze-and-stuck.md. Each `describe`
 * block targets one layer of the contract; assertions are on observable
 * position / flag transitions, not internal state names or tuning constants.
 */

const followerDefaults = { squadId: 'squad-1', squadRole: 'follower' as const };
const makeSquad = (o: Partial<Squad> = {}): Squad => ({
  id: 'squad-1', faction: Faction.US, members: ['leader', 'follower'],
  leaderId: 'leader', formation: 'line', ...o,
} as Squad);

const originalConfig = { ...NpcLodConfig };
beforeEach(() => Object.assign(NpcLodConfig, originalConfig));
afterEach(() => { Object.assign(NpcLodConfig, originalConfig); vi.restoreAllMocks(); });

describe('Layer 1: visual-only velocity integration on degraded LOD ticks', () => {
  function makeManager() {
    const combatants = new Map<string, Combatant>();
    // updateMovement is a no-op so the safeguard's effect on position is the
    // sole driver — without it, position must not advance.
    const movement = {
      updateMovement: vi.fn(), updateRotation: vi.fn(),
      syncTerrainHeight: vi.fn(() => true),
      resetPathQueryBudget: vi.fn(), removePathCache: vi.fn(),
    } as any;
    const m = new CombatantLODManager(
      combatants, new THREE.Vector3(),
      { updateAI: vi.fn(), clearLOSCache: vi.fn() } as any,
      { updateCombat: vi.fn() } as any,
      movement,
      { updateCombatantTexture: vi.fn() } as any,
      { getAllSquads: vi.fn().mockReturnValue([]) } as any,
      spatialGridManager as any,
    );
    m.setGameModeManager({ getWorldSize: vi.fn().mockReturnValue(400) } as any);
    return { manager: m, combatants };
  }

  it('walks NPC forward when velocity points at an unreached destination, otherwise stays put', () => {
    NpcLodConfig.visualOnlyIntegrateVelocity = true;
    const { manager, combatants } = makeManager();
    const walker = createTestCombatant({ id: 'walker', position: new THREE.Vector3(10, 0, 0) });
    walker.velocity.set(3, 0, 0);
    walker.destinationPoint = new THREE.Vector3(120, 0, 0);
    const idle = createTestCombatant({ id: 'idle', position: new THREE.Vector3(0, 0, 0) });
    idle.destinationPoint = new THREE.Vector3(120, 0, 0);
    const arrived = createTestCombatant({ id: 'arrived', position: new THREE.Vector3(0, 0, 0) });
    arrived.velocity.set(3, 0, 0);
    arrived.destinationPoint = new THREE.Vector3(1, 0, 0);
    for (const c of [walker, idle, arrived]) combatants.set(c.id, c);

    for (let i = 0; i < 6; i++) manager.updateCombatants(0.05, { enableAI: false });

    expect(walker.position.x).toBeGreaterThan(10);
    expect(walker.position.y).toBe(0);
    expect(idle.position.x).toBe(0);
    expect(arrived.position.x).toBe(0);
  });

  it('does not advance when the safeguard is disabled', () => {
    NpcLodConfig.visualOnlyIntegrateVelocity = false;
    const { manager, combatants } = makeManager();
    const c = createTestCombatant({ id: 'frozen', position: new THREE.Vector3(0, 0, 0) });
    c.velocity.set(3, 0, 0);
    c.destinationPoint = new THREE.Vector3(120, 0, 0);
    combatants.set(c.id, c);
    for (let i = 0; i < 4; i++) manager.updateCombatants(0.05, { enableAI: false });
    expect(c.position.x).toBe(0);
  });
});

describe('Layer 2a: rejoin watchdog', () => {
  it('beginRejoiningSquad stamps the timestamp; handleRejoiningMovement clears the gate after timeout', () => {
    NpcLodConfig.rejoinTimeoutMs = 5000;
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);

    const follower = createTestCombatant({ id: 'follower', ...followerDefaults });
    beginRejoiningSquad(follower);
    expect(follower.isRejoiningSquad).toBe(true);
    expect(follower.rejoinStartedAtMs).toBe(1000);

    // Squad centroid intentionally far so only the watchdog can clear the flag.
    const leader = createTestCombatant({ id: 'leader', squadRole: 'leader', position: new THREE.Vector3(500, 0, 0) });
    const combatants = new Map<string, Combatant>([['leader', leader], [follower.id, follower]]);

    nowSpy.mockReturnValue(2000);
    handleRejoiningMovement(follower, makeSquad(), combatants);
    expect(follower.isRejoiningSquad).toBe(true);

    nowSpy.mockReturnValue(20_000);
    handleRejoiningMovement(follower, makeSquad(), combatants);
    expect(follower.isRejoiningSquad).toBe(false);
    expect(follower.rejoinStartedAtMs).toBeUndefined();
  });
});

describe('Layer 2b: follower watchdog promotes squad-leader-stuck followers', () => {
  it('clamps when leader is briefly idle, promotes after stale threshold, reverts when leader resumes', () => {
    NpcLodConfig.squadFollowStaleMs = 4000;
    const leader = createTestCombatant({ id: 'leader', squadRole: 'leader', position: new THREE.Vector3(2, 0, 0) });
    leader.velocity.set(0, 0, 0);
    const follower = createTestCombatant({ id: 'follower', ...followerDefaults });
    const squad = makeSquad();
    const squads = new Map<string, Squad>([[squad.id, squad]]);
    const combatants = new Map<string, Combatant>([['leader', leader], ['follower', follower]]);
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);

    updatePatrolMovement(follower, 0.016, squads, combatants, {
      getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0),
    });
    expect(follower.velocity.length()).toBe(0);
    expect(squad.leaderIdleSinceMs).toBe(1000);

    nowSpy.mockReturnValue(20_000);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const zoneManager = {
      getAllZones: vi.fn(() => [{
        id: 'z', position: new THREE.Vector3(80, 0, 0),
        owner: Faction.NVA, state: ZoneState.CONTESTED, isHomeBase: false, ticketBleedRate: 3,
      }]),
    };
    updatePatrolMovement(follower, 0.016, squads, combatants, {
      zoneManager: zoneManager as any,
      getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0),
    });
    expect(follower.destinationPoint?.x).toBe(80);
    expect(follower.velocity.length()).toBeGreaterThan(0);

    leader.velocity.set(2.5, 0, 0);
    updatePatrolMovement(follower, 0.016, squads, combatants, {
      getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0),
    });
    expect(squad.leaderIdleSinceMs).toBeUndefined();
  });
});

describe('Integration: stuck-leader squad does not freeze followers', () => {
  it('after 600 ticks at 16ms a stuck leader still produces follower movement >2m', () => {
    NpcLodConfig.squadFollowStaleMs = 4000;
    const leader = createTestCombatant({ id: 'leader', squadRole: 'leader', position: new THREE.Vector3(0, 0, 0) });
    leader.destinationPoint = new THREE.Vector3(9999, 0, 9999); // unreachable
    const followers = ['f1', 'f2', 'f3'].map((id, i) => {
      const c = createTestCombatant({ id, ...followerDefaults });
      c.position.set([1, 0, -1][i], 0, [0, 1, 0][i]);
      return c;
    });
    const squad: Squad = {
      id: 'squad-1', faction: Faction.US, members: ['leader', 'f1', 'f2', 'f3'],
      leaderId: 'leader', formation: 'line',
    };
    const combatants = new Map<string, Combatant>([['leader', leader]]);
    for (const f of followers) combatants.set(f.id, f);
    const squads = new Map<string, Squad>([[squad.id, squad]]);
    const zoneManager = {
      getAllZones: vi.fn(() => [{
        id: 'z', position: new THREE.Vector3(60, 0, 0),
        owner: Faction.NVA, state: ZoneState.CONTESTED, isHomeBase: false, ticketBleedRate: 3,
      }]),
    };
    const start = followers.map(f => f.position.clone());
    let nowMs = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const dt = 0.016;
    for (let tick = 0; tick < 600; tick++) {
      leader.velocity.set(0, 0, 0);
      for (const f of followers) {
        updatePatrolMovement(f, dt, squads, combatants, {
          zoneManager: zoneManager as any,
          getEnemyBasePosition: () => new THREE.Vector3(200, 0, 0),
        });
        f.position.x += f.velocity.x * dt;
        f.position.z += f.velocity.z * dt;
      }
      nowMs += dt * 1000;
    }
    const moved = followers.filter((f, i) => {
      const dx = f.position.x - start[i].x, dz = f.position.z - start[i].z;
      return Math.sqrt(dx * dx + dz * dz) > 2;
    });
    expect(moved.length).toBeGreaterThanOrEqual(1);
  });
});
