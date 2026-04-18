/**
 * AgentController behavior tests. See docs/TESTING.md — behavior-oriented,
 * not implementation-mirror. Each `it()` expresses a caller-observable
 * outcome: "given an observation / action, what does the player see?"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentController } from './AgentController';
import type {
  AgentControllerDeps,
  PlayerControlPort,
  PortCombatant,
  PortZone,
  ReadVec3,
} from './AgentPlayerPort';
import { Faction } from '../combat/types';

/** Test double for PlayerControlPort. Records all mutating calls. */
class FakePlayer implements PlayerControlPort {
  position: ReadVec3 = { x: 0, y: 0, z: 0 };
  velocity: ReadVec3 = { x: 0, y: 0, z: 0 };
  yaw = 0;
  pitch = 0;
  dead = false;
  inVehicle = false;
  faction = Faction.US;
  ammo = { magazine: 30, reserve: 90 };
  health = { hp: 100, maxHp: 100 };
  running = false;
  crouching = false;
  grounded = true;
  nearbyVehicleId: string | null = null;

  movementIntents: Array<{ forward: number; strafe: number; sprint: boolean }> = [];
  fireStartCount = 0;
  fireStopCount = 0;
  reloadCount = 0;
  enterVehicleCount = 0;
  exitVehicleCount = 0;

  isPlayerDead(): boolean { return this.dead; }
  getPosition(): ReadVec3 { return this.position; }
  getVelocity(): ReadVec3 { return this.velocity; }
  getYaw(): number { return this.yaw; }
  getPitch(): number { return this.pitch; }
  setViewAngles(yaw: number, pitch: number): void { this.yaw = yaw; this.pitch = pitch; }
  applyMovementIntent(intent: { forward: number; strafe: number; sprint: boolean }): void {
    this.movementIntents.push({ ...intent });
  }
  fireStart(): void { this.fireStartCount++; }
  fireStop(): void { this.fireStopCount++; }
  reload(): void { this.reloadCount++; }
  isInVehicle(): boolean { return this.inVehicle; }
  tryEnterNearbyVehicle(): string | null {
    if (this.nearbyVehicleId === null) return null;
    this.enterVehicleCount++;
    this.inVehicle = true;
    return this.nearbyVehicleId;
  }
  tryExitVehicle(): boolean {
    if (!this.inVehicle) return false;
    this.exitVehicleCount++;
    this.inVehicle = false;
    return true;
  }
  getFaction(): Faction { return this.faction; }
  getAmmoState(): { magazine: number; reserve: number } { return this.ammo; }
  getHealth(): { hp: number; maxHp: number } { return this.health; }
  isGrounded(): boolean { return this.grounded; }
  isRunning(): boolean { return this.running; }
  isCrouching(): boolean { return this.crouching; }
}

function makeDeps(opts: { combatants?: PortCombatant[]; zones?: PortZone[]; player?: FakePlayer } = {}): {
  deps: AgentControllerDeps; player: FakePlayer;
} {
  const combatants = opts.combatants ?? [];
  const player = opts.player ?? new FakePlayer();
  const deps: AgentControllerDeps = {
    player,
    combatants: {
      getAllCombatants: () => combatants,
      getCombatantById: (id) => combatants.find((c) => c.id === id) ?? null,
    },
    zones: { getZones: () => opts.zones ?? [] },
    now: () => 1234,
  };
  return { deps, player };
}

function makeEnemy(id: string, x: number, z: number, o: Partial<PortCombatant> = {}): PortCombatant {
  return {
    id, faction: Faction.NVA,
    position: { x, y: 0, z },
    velocity: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, state: 'idle', ...o,
  };
}

describe('AgentController — action surface', () => {
  let agent: AgentController;
  let player: FakePlayer;

  beforeEach(() => {
    const { deps, player: p } = makeDeps();
    agent = new AgentController(deps);
    player = p;
  });

  it('move-to produces a forward movement intent toward a target ahead', () => {
    player.yaw = 0; // +z forward
    const handle = agent.apply({ kind: 'move-to', target: { x: 0, y: 0, z: 50 } });

    expect(handle.accepted).toBe(true);
    const last = player.movementIntents.at(-1)!;
    expect(last.forward).toBeCloseTo(1, 2);
    expect(Math.abs(last.strafe)).toBeLessThan(0.01);
  });

  it('move-to with sprint stance sets sprint flag', () => {
    agent.apply({ kind: 'move-to', target: { x: 10, y: 0, z: 10 }, stance: 'sprint' });
    expect(player.movementIntents.at(-1)!.sprint).toBe(true);
  });

  it('move-to to the right produces rightward strafe', () => {
    player.yaw = 0;
    agent.apply({ kind: 'move-to', target: { x: 50, y: 0, z: 0 } });
    expect(player.movementIntents.at(-1)!.strafe).toBeGreaterThan(0.5);
  });

  it('move-to completes when within tolerance and zeros the intent', () => {
    agent.apply({ kind: 'move-to', target: { x: 1, y: 0, z: 1 }, tolerance: 2 });
    const last = player.movementIntents.at(-1)!;
    expect(last.forward).toBe(0);
    expect(last.strafe).toBe(0);
  });

  it('stop-moving zeroes the movement intent', () => {
    agent.apply({ kind: 'move-to', target: { x: 100, y: 0, z: 0 } });
    agent.apply({ kind: 'stop-moving' });
    const last = player.movementIntents.at(-1)!;
    expect(last.forward).toBe(0);
    expect(last.strafe).toBe(0);
    expect(last.sprint).toBe(false);
  });

  it('face-bearing sets view angles; preserves pitch if omitted', () => {
    agent.apply({ kind: 'face-bearing', yawRad: 1.25, pitchRad: -0.3 });
    expect(player.yaw).toBeCloseTo(1.25, 3);
    expect(player.pitch).toBeCloseTo(-0.3, 3);

    player.pitch = 0.4;
    agent.apply({ kind: 'face-bearing', yawRad: 0.8 });
    expect(player.yaw).toBeCloseTo(0.8, 3);
    expect(player.pitch).toBeCloseTo(0.4, 3);
  });

  it('look-at points the camera at a world-space target', () => {
    agent.apply({ kind: 'look-at', target: { x: 0, y: 0, z: 10 } });
    expect(player.yaw).toBeCloseTo(0, 3); // atan2(0, 10) = 0
  });

  it('fire-at with a valid enemy id starts firing', () => {
    const enemies = [makeEnemy('e1', 10, 10)];
    const { deps, player: p } = makeDeps({ combatants: enemies });
    const a = new AgentController(deps);
    const h = a.apply({ kind: 'fire-at', target: 'e1', mode: 'hold' });
    expect(h.accepted).toBe(true);
    expect(p.fireStartCount).toBeGreaterThan(0);
  });

  it('fire-at with a dead enemy id is rejected', () => {
    const enemies = [makeEnemy('e1', 10, 0, { health: 0, state: 'dead' })];
    const { deps } = makeDeps({ combatants: enemies });
    const h = new AgentController(deps).apply({ kind: 'fire-at', target: 'e1', mode: 'single' });
    expect(h.accepted).toBe(false);
    expect(h.reason).toBe('rejected_invalid_target');
  });

  it('fire-at single mode fires once then stops', () => {
    const { deps, player: p } = makeDeps();
    new AgentController(deps).apply({ kind: 'fire-at', target: { x: 5, y: 0, z: 5 }, mode: 'single' });
    expect(p.fireStartCount).toBe(1);
    expect(p.fireStopCount).toBe(1);
  });

  it('cease-fire stops an ongoing fire', () => {
    agent.apply({ kind: 'fire-at', target: { x: 5, y: 0, z: 5 }, mode: 'hold' });
    const before = player.fireStopCount;
    agent.apply({ kind: 'cease-fire' });
    expect(player.fireStopCount).toBe(before + 1);
  });

  it('reload forwards to the player', () => {
    agent.apply({ kind: 'reload' });
    expect(player.reloadCount).toBe(1);
  });

  it('enter-vehicle when on foot and near a vehicle toggles vehicle mode', () => {
    player.nearbyVehicleId = 'heli-1';
    const h = agent.apply({ kind: 'enter-vehicle' });
    expect(h.accepted).toBe(true);
    expect(player.inVehicle).toBe(true);
  });

  it('enter-vehicle with no nearby vehicle is rejected as invalid target', () => {
    const h = agent.apply({ kind: 'enter-vehicle' });
    expect(h.accepted).toBe(false);
    expect(h.reason).toBe('rejected_invalid_target');
  });

  it('enter-vehicle while already in a vehicle is rejected', () => {
    player.inVehicle = true;
    const h = agent.apply({ kind: 'enter-vehicle' });
    expect(h.accepted).toBe(false);
    expect(h.reason).toBe('rejected_in_vehicle');
  });

  it('exit-vehicle while in a vehicle leaves it; rejected when on foot', () => {
    player.inVehicle = true;
    expect(agent.apply({ kind: 'exit-vehicle' }).accepted).toBe(true);
    expect(player.inVehicle).toBe(false);

    const h = agent.apply({ kind: 'exit-vehicle' });
    expect(h.accepted).toBe(false);
    expect(h.reason).toBe('rejected_not_in_vehicle');
  });

  it('any action while dead is rejected', () => {
    player.dead = true;
    const h = agent.apply({ kind: 'move-to', target: { x: 1, y: 0, z: 1 } });
    expect(h.accepted).toBe(false);
    expect(h.reason).toBe('rejected_player_dead');
  });
});

describe('AgentController — observation surface', () => {
  it('ownState reports player position, angles, health fraction, ammo', () => {
    const { deps, player } = makeDeps();
    player.position = { x: 10, y: 2, z: -3 };
    player.yaw = 1.1;
    player.health = { hp: 50, maxHp: 100 };
    player.ammo = { magazine: 12, reserve: 60 };

    const obs = new AgentController(deps).observe();

    expect(obs.ownState.position).toEqual({ x: 10, y: 2, z: -3 });
    expect(obs.ownState.yawRad).toBeCloseTo(1.1, 3);
    expect(obs.ownState.healthFrac).toBeCloseTo(0.5, 3);
    expect(obs.ownState.ammoInMag).toBe(12);
    expect(obs.ownState.ammoReserve).toBe(60);
  });

  it('visibleEntities omits dead, distant, and out-of-cone combatants', () => {
    const enemies = [
      makeEnemy('near', 0, 10),
      makeEnemy('far', 0, 5000),
      makeEnemy('dead', 0, 20, { health: 0, state: 'dead' }),
      makeEnemy('behind', 0, -50),
    ];
    const { deps, player } = makeDeps({ combatants: enemies });
    player.yaw = 0;
    const agent = new AgentController(deps);
    agent.setPerception({ visionRangeM: 500, visionConeRad: Math.PI / 3 });

    const ids = agent.observe().visibleEntities.map((v) => v.id);
    expect(ids).toContain('near');
    expect(ids).not.toContain('far');
    expect(ids).not.toContain('dead');
    expect(ids).not.toContain('behind');
  });

  it('visibleEntities is capped at maxVisibleEntities', () => {
    const enemies: PortCombatant[] = [];
    for (let i = 0; i < 100; i++) enemies.push(makeEnemy(`e${i}`, i * 0.1, i * 0.1));
    const { deps } = makeDeps({ combatants: enemies });
    const agent = new AgentController(deps);
    agent.setPerception({ maxVisibleEntities: 5 });
    expect(agent.observe().visibleEntities.length).toBeLessThanOrEqual(5);
  });

  it('zones are reported as objectives with home-base kind preserved', () => {
    const zones: PortZone[] = [
      { id: 'z1', owner: 'contested', position: { x: 0, y: 0, z: 0 }, radius: 25, captureProgress: 0.4 },
      { id: 'home', isHomeBase: true, owner: Faction.US, position: { x: 100, y: 0, z: 0 }, radius: 40 },
    ];
    const { deps } = makeDeps({ zones });
    const obs = new AgentController(deps).observe();
    expect(obs.objectives).toHaveLength(2);
    expect(obs.objectives[0].kind).toBe('zone');
    expect(obs.objectives[0].captureProgress).toBe(0.4);
    expect(obs.objectives[1].kind).toBe('homebase');
  });

  it('bearing is zero when target is directly ahead', () => {
    const enemies = [makeEnemy('ahead', 0, 100)];
    const { deps, player } = makeDeps({ combatants: enemies });
    player.yaw = 0;
    const obs = new AgentController(deps).observe();
    expect(obs.visibleEntities[0].bearingRad).toBeCloseTo(0, 2);
  });
});

describe('AgentController — intent persistence', () => {
  it('step() re-evaluates active move-to against the updated player position', () => {
    const { deps, player } = makeDeps();
    const agent = new AgentController(deps);
    agent.apply({ kind: 'move-to', target: { x: 0, y: 0, z: 100 }, tolerance: 2 });

    player.position = { x: 0, y: 0, z: 50 };
    agent.step();
    expect(player.movementIntents.at(-1)!.forward).toBeCloseTo(1, 2);

    player.position = { x: 0, y: 0, z: 99 };
    agent.step();
    expect(player.movementIntents.at(-1)!.forward).toBe(0);
  });

  it('release() zeros movement and stops fire', () => {
    const { deps, player } = makeDeps();
    const agent = new AgentController(deps);
    agent.apply({ kind: 'move-to', target: { x: 100, y: 0, z: 0 } });
    agent.apply({ kind: 'fire-at', target: { x: 10, y: 0, z: 10 }, mode: 'hold' });
    const beforeStop = player.fireStopCount;

    agent.release();

    const last = player.movementIntents.at(-1)!;
    expect(last.forward).toBe(0);
    expect(last.strafe).toBe(0);
    expect(player.fireStopCount).toBe(beforeStop + 1);
  });
});
