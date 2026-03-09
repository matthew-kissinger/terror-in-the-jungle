import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { VehicleManager } from './VehicleManager';
import type { IVehicle, VehicleCategory, VehicleSeat, SeatRole } from './IVehicle';
import type { Faction } from '../combat/types';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function createMockVehicle(id: string, opts: {
  category?: VehicleCategory;
  position?: THREE.Vector3;
  faction?: Faction;
  seats?: VehicleSeat[];
} = {}): IVehicle {
  const position = opts.position ?? new THREE.Vector3(0, 0, 0);
  const seats: VehicleSeat[] = opts.seats ?? [
    { index: 0, role: 'pilot', occupantId: null, localOffset: new THREE.Vector3(), exitOffset: new THREE.Vector3(-2, 0, 0) },
    { index: 1, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(), exitOffset: new THREE.Vector3(2, 0, 0) },
  ];

  return {
    vehicleId: id,
    category: opts.category ?? 'helicopter',
    faction: opts.faction ?? ('US' as Faction),
    getSeats: () => seats,
    enterVehicle: vi.fn((occupantId: string, _role?: SeatRole) => {
      const seat = seats.find(s => s.occupantId === null);
      if (!seat) return null;
      seat.occupantId = occupantId;
      return seat.index;
    }),
    exitVehicle: vi.fn((occupantId: string) => {
      const seat = seats.find(s => s.occupantId === occupantId);
      if (!seat) return null;
      seat.occupantId = null;
      return position.clone().add(seat.exitOffset);
    }),
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

describe('VehicleManager', () => {
  let manager: VehicleManager;

  beforeEach(async () => {
    manager = new VehicleManager();
    await manager.init();
  });

  it('initializes empty', () => {
    expect(manager.getVehicleCount()).toBe(0);
    expect(manager.getAllVehicles()).toHaveLength(0);
  });

  it('registers and retrieves vehicles', () => {
    const v1 = createMockVehicle('heli_1');
    const v2 = createMockVehicle('heli_2');

    manager.register(v1);
    manager.register(v2);

    expect(manager.getVehicleCount()).toBe(2);
    expect(manager.getVehicle('heli_1')).toBe(v1);
    expect(manager.getVehicle('heli_2')).toBe(v2);
    expect(manager.getVehicle('nonexistent')).toBeNull();
  });

  it('unregisters vehicles', () => {
    const v1 = createMockVehicle('heli_1');
    manager.register(v1);
    expect(manager.getVehicleCount()).toBe(1);

    manager.unregister('heli_1');
    expect(manager.getVehicleCount()).toBe(0);
    expect(manager.getVehicle('heli_1')).toBeNull();
  });

  it('does not duplicate registrations', () => {
    const v1 = createMockVehicle('heli_1');
    manager.register(v1);
    manager.register(v1); // should warn but not duplicate
    expect(manager.getVehicleCount()).toBe(1);
  });

  it('queries vehicles in radius', () => {
    const v1 = createMockVehicle('heli_1', { position: new THREE.Vector3(10, 0, 10) });
    const v2 = createMockVehicle('heli_2', { position: new THREE.Vector3(100, 0, 100) });
    const v3 = createMockVehicle('heli_3', { position: new THREE.Vector3(500, 0, 500) });

    manager.register(v1);
    manager.register(v2);
    manager.register(v3);

    const near = manager.getVehiclesInRadius(new THREE.Vector3(0, 0, 0), 50);
    expect(near).toHaveLength(1);
    expect(near[0].vehicleId).toBe('heli_1');

    const medium = manager.getVehiclesInRadius(new THREE.Vector3(0, 0, 0), 200);
    expect(medium).toHaveLength(2);
  });

  it('queries vehicles by category', () => {
    const heli = createMockVehicle('heli_1', { category: 'helicopter' });
    const ground = createMockVehicle('jeep_1', { category: 'ground' });

    manager.register(heli);
    manager.register(ground);

    const helis = manager.getVehiclesByCategory('helicopter');
    expect(helis).toHaveLength(1);
    expect(helis[0].vehicleId).toBe('heli_1');

    const grounds = manager.getVehiclesByCategory('ground');
    expect(grounds).toHaveLength(1);
    expect(grounds[0].vehicleId).toBe('jeep_1');

    const boats = manager.getVehiclesByCategory('watercraft');
    expect(boats).toHaveLength(0);
  });

  it('finds vehicle by occupant', () => {
    const v1 = createMockVehicle('heli_1');
    manager.register(v1);

    // Board occupant
    v1.enterVehicle('npc_1');

    const found = manager.getVehicleByOccupant('npc_1');
    expect(found).toBe(v1);

    const notFound = manager.getVehicleByOccupant('npc_2');
    expect(notFound).toBeNull();
  });

  it('disposes cleanly', () => {
    manager.register(createMockVehicle('heli_1'));
    manager.register(createMockVehicle('heli_2'));
    expect(manager.getVehicleCount()).toBe(2);

    manager.dispose();
    expect(manager.getVehicleCount()).toBe(0);
  });
});
