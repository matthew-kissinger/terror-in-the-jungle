import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { NPCVehicleController } from './NPCVehicleController';
import { VehicleManager } from './VehicleManager';
import { CombatantState } from '../combat/types';
import type { Combatant } from '../combat/types';
import type { IVehicle, VehicleSeat, SeatRole, VehicleCategory } from './IVehicle';
import type { Faction } from '../combat/types';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function createTestCombatant(id: string, position: THREE.Vector3, state = CombatantState.PATROLLING): Combatant {
  return {
    id,
    faction: 'US' as Faction,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state,
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
    updatePriority: 1,
    simLane: 'high',
    renderLane: 'culled',
    kills: 0,
    deaths: 0,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any,
  } as Combatant;
}

function createTestVehicle(id: string, position: THREE.Vector3): IVehicle {
  const seats: VehicleSeat[] = [
    { index: 0, role: 'pilot', occupantId: null, localOffset: new THREE.Vector3(0, 0.5, 1), exitOffset: new THREE.Vector3(-2, 0, 0) },
    { index: 1, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(1, 0.3, -0.5), exitOffset: new THREE.Vector3(2, 0, 0) },
    { index: 2, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(-1, 0.3, -0.5), exitOffset: new THREE.Vector3(-2, 0, 0) },
  ];

  return {
    vehicleId: id,
    category: 'helicopter' as VehicleCategory,
    faction: 'US' as Faction,
    getSeats: () => seats,
    enterVehicle: (occupantId: string, preferredRole?: SeatRole) => {
      let seat: VehicleSeat | undefined;
      if (preferredRole) seat = seats.find(s => s.role === preferredRole && !s.occupantId);
      if (!seat) seat = seats.find(s => !s.occupantId);
      if (!seat) return null;
      seat.occupantId = occupantId;
      return seat.index;
    },
    exitVehicle: (occupantId: string) => {
      const seat = seats.find(s => s.occupantId === occupantId);
      if (!seat) return null;
      seat.occupantId = null;
      return position.clone().add(seat.exitOffset);
    },
    getOccupant: (idx: number) => seats[idx]?.occupantId ?? null,
    getPilotId: () => seats.find(s => s.role === 'pilot')?.occupantId ?? null,
    hasFreeSeats: (role?: SeatRole) => {
      if (role) return seats.some(s => s.role === role && !s.occupantId);
      return seats.some(s => !s.occupantId);
    },
    getPosition: () => position.clone(),
    getQuaternion: () => new THREE.Quaternion(),
    getVelocity: () => new THREE.Vector3(),
    isDestroyed: () => false,
    getHealthPercent: () => 1.0,
    update: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('NPCVehicleController', () => {
  let controller: NPCVehicleController;
  let vehicleManager: VehicleManager;
  let combatants: Map<string, Combatant>;

  beforeEach(async () => {
    controller = new NPCVehicleController();
    vehicleManager = new VehicleManager();
    await vehicleManager.init();
    combatants = new Map();

    controller.setVehicleManager(vehicleManager);
    controller.setCombatantProvider(() => combatants);
  });

  it('orders NPC to board a vehicle', () => {
    const vehicle = createTestVehicle('heli_1', new THREE.Vector3(10, 0, 10));
    vehicleManager.register(vehicle);

    const npc = createTestCombatant('npc_1', new THREE.Vector3(10, 0, 10));
    combatants.set('npc_1', npc);

    const result = controller.orderBoard('npc_1', 'heli_1');
    expect(result).toBe(true);
    expect(npc.state).toBe(CombatantState.BOARDING);
  });

  it('NPC boards when close enough', () => {
    const vehicle = createTestVehicle('heli_1', new THREE.Vector3(10, 0, 10));
    vehicleManager.register(vehicle);

    // NPC is close to vehicle (within BOARD_RANGE of 5m)
    const npc = createTestCombatant('npc_1', new THREE.Vector3(12, 0, 10));
    combatants.set('npc_1', npc);

    controller.orderBoard('npc_1', 'heli_1');
    controller.update(0.1); // Process boarding

    expect(npc.state).toBe(CombatantState.IN_VEHICLE);
    expect(npc.vehicleId).toBe('heli_1');
    expect(npc.vehicleSeatIndex).toBeDefined();
  });

  it('NPC stays boarding when too far', () => {
    const vehicle = createTestVehicle('heli_1', new THREE.Vector3(100, 0, 100));
    vehicleManager.register(vehicle);

    const npc = createTestCombatant('npc_1', new THREE.Vector3(0, 0, 0));
    combatants.set('npc_1', npc);

    controller.orderBoard('npc_1', 'heli_1');
    controller.update(0.1);

    expect(npc.state).toBe(CombatantState.BOARDING);
  });

  it('rejects boarding dead NPC', () => {
    const vehicle = createTestVehicle('heli_1', new THREE.Vector3(10, 0, 10));
    vehicleManager.register(vehicle);

    const npc = createTestCombatant('npc_1', new THREE.Vector3(10, 0, 10), CombatantState.DEAD);
    combatants.set('npc_1', npc);

    expect(controller.orderBoard('npc_1', 'heli_1')).toBe(false);
  });

  it('orders NPC to dismount', () => {
    const vehicle = createTestVehicle('heli_1', new THREE.Vector3(10, 0, 10));
    vehicleManager.register(vehicle);

    const npc = createTestCombatant('npc_1', new THREE.Vector3(10, 0, 10));
    combatants.set('npc_1', npc);

    // Board first
    controller.orderBoard('npc_1', 'heli_1');
    controller.update(0.1);
    expect(npc.state).toBe(CombatantState.IN_VEHICLE);

    // Dismount
    const result = controller.orderDismount('npc_1');
    expect(result).toBe(true);
    expect(npc.state).toBe(CombatantState.DISMOUNTING);

    // After delay, NPC should be patrolling
    controller.update(1.0);
    expect(npc.state).toBe(CombatantState.PATROLLING);
    expect(npc.vehicleId).toBeUndefined();
  });

  it('dismounts all passengers', () => {
    const vehicle = createTestVehicle('heli_1', new THREE.Vector3(10, 0, 10));
    vehicleManager.register(vehicle);

    const npc1 = createTestCombatant('npc_1', new THREE.Vector3(10, 0, 10));
    const npc2 = createTestCombatant('npc_2', new THREE.Vector3(10, 0, 10));
    combatants.set('npc_1', npc1);
    combatants.set('npc_2', npc2);

    controller.orderBoard('npc_1', 'heli_1');
    controller.orderBoard('npc_2', 'heli_1');
    controller.update(0.1);

    expect(npc1.state).toBe(CombatantState.IN_VEHICLE);
    expect(npc2.state).toBe(CombatantState.IN_VEHICLE);

    const count = controller.orderDismountAll('heli_1');
    expect(count).toBe(2);
  });

  it('locks riding NPC position to vehicle', () => {
    const vehicle = createTestVehicle('heli_1', new THREE.Vector3(100, 50, 100));
    vehicleManager.register(vehicle);

    const npc = createTestCombatant('npc_1', new THREE.Vector3(100, 50, 100));
    combatants.set('npc_1', npc);

    controller.orderBoard('npc_1', 'heli_1');
    controller.update(0.1);

    // Vehicle position + seat local offset (identity quaternion so no rotation)
    expect(npc.position.x).toBeCloseTo(101, 0); // seat offset x=1
    expect(npc.position.z).toBeCloseTo(99.5, 0); // seat offset z=-0.5
  });

  it('checks if NPC is in vehicle', () => {
    const vehicle = createTestVehicle('heli_1', new THREE.Vector3(10, 0, 10));
    vehicleManager.register(vehicle);

    const npc = createTestCombatant('npc_1', new THREE.Vector3(10, 0, 10));
    combatants.set('npc_1', npc);

    expect(controller.isInVehicle('npc_1')).toBe(false);

    controller.orderBoard('npc_1', 'heli_1');
    controller.update(0.1);

    expect(controller.isInVehicle('npc_1')).toBe(true);
  });

  it('gets vehicle occupants', () => {
    const vehicle = createTestVehicle('heli_1', new THREE.Vector3(10, 0, 10));
    vehicleManager.register(vehicle);

    const npc = createTestCombatant('npc_1', new THREE.Vector3(10, 0, 10));
    combatants.set('npc_1', npc);

    controller.orderBoard('npc_1', 'heli_1');
    controller.update(0.1);

    const occupants = controller.getOccupants('heli_1');
    expect(occupants).toContain('npc_1');
  });
});
