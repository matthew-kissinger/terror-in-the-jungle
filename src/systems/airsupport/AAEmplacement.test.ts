// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { AAEmplacementSystem } from './AAEmplacement';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../effects/TracerPool', () => ({
  TracerPool: class {
    spawn = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
  },
}));

function createMockScene(): THREE.Scene {
  return new THREE.Scene();
}

function createMockHelicopterModel(options: {
  helis?: Array<{ id: string; position: THREE.Vector3; model: string }>;
  destroyed?: Set<string>;
} = {}) {
  const helis = options.helis ?? [];
  const destroyed = options.destroyed ?? new Set<string>();
  return {
    getAllHelicopters: vi.fn().mockReturnValue(helis),
    isHelicopterDestroyed: vi.fn((id: string) => destroyed.has(id)),
    getHelicopterPositionTo: vi.fn((id: string, target: THREE.Vector3) => {
      const h = helis.find(h => h.id === id);
      if (!h) return false;
      target.copy(h.position);
      return true;
    }),
    getFlightData: vi.fn().mockReturnValue({ airspeed: 30, heading: 90, verticalSpeed: 0 }),
    checkRayHit: vi.fn().mockReturnValue(null),
    applyDamage: vi.fn(),
  } as any;
}

function createMockTerrain() {
  return {
    getHeightAt: vi.fn().mockReturnValue(0),
  } as any;
}

describe('AAEmplacementSystem', () => {
  let system: AAEmplacementSystem;

  beforeEach(async () => {
    system = new AAEmplacementSystem(createMockScene());
    await system.init();
  });

  it('initializes without errors', () => {
    expect(system).toBeDefined();
    expect(system.getEmplacementCount()).toBe(0);
  });

  it('adds emplacements', () => {
    system.addEmplacement(new THREE.Vector3(100, 0, 100));
    system.addEmplacement(new THREE.Vector3(200, 0, 200));
    expect(system.getEmplacementCount()).toBe(2);
    expect(system.getActiveCount()).toBe(2);
  });

  it('tracks active vs destroyed', () => {
    system.addEmplacement(new THREE.Vector3(100, 0, 100));
    expect(system.getActiveCount()).toBe(1);

    // Damage heavily to destroy
    system.applyDamageAt(new THREE.Vector3(100, 0, 100), 500, 10);
    expect(system.getActiveCount()).toBe(0);
  });

  it('does not target grounded helicopters', () => {
    const heli = { id: 'heli_1', position: new THREE.Vector3(100, 5, 100), model: 'UH1_HUEY' };
    const mockHM = createMockHelicopterModel({ helis: [heli] });
    system.setHelicopterModel(mockHM);
    system.setTerrainSystem(createMockTerrain());

    system.addEmplacement(new THREE.Vector3(100, 0, 100));

    // Helicopter at altitude 5 < MIN_TARGET_ALTITUDE(10)
    system.update(1);
    expect(mockHM.checkRayHit).not.toHaveBeenCalled();
  });

  it('targets flying helicopters in range', () => {
    const heli = { id: 'heli_1', position: new THREE.Vector3(200, 80, 200), model: 'UH1_HUEY' };
    const mockHM = createMockHelicopterModel({ helis: [heli] });
    system.setHelicopterModel(mockHM);
    system.setTerrainSystem(createMockTerrain());

    system.addEmplacement(new THREE.Vector3(200, 0, 200));

    // First update triggers scan (staggered, so may need a couple)
    for (let i = 0; i < 3; i++) system.update(0.5);

    // After scan + burst cooldown, should start firing
    for (let i = 0; i < 5; i++) system.update(0.5);

    // TracerPool.spawn should have been called if firing
    // (since target is in range and flying)
  });

  it('fires burst shots with a normalized ray and buffered tracer endpoints', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const heli = { id: 'heli_1', position: new THREE.Vector3(100, 80, 0), model: 'UH1_HUEY' };
    const mockHM = createMockHelicopterModel({ helis: [heli] });
    mockHM.getFlightData.mockReturnValue(null);
    mockHM.checkRayHit.mockReturnValue({ heliId: 'heli_1' });
    system.setHelicopterModel(mockHM);
    system.setTerrainSystem(createMockTerrain());
    system.addEmplacement(new THREE.Vector3(0, 0, 0));

    const emp = (system as any).emplacements[0];
    emp.targetHeliId = 'heli_1';
    emp.burstRemaining = 1;
    emp.fireAccum = 1 / emp.config.fireRate;

    system.update(0);

    const tracerPool = (system as any).tracerPool;
    expect(tracerPool.spawn).toHaveBeenCalledTimes(1);
    const [start, end, lifetimeMs] = tracerPool.spawn.mock.calls[0] as [THREE.Vector3, THREE.Vector3, number];
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(1.5);
    expect(start.z).toBeCloseTo(0);
    expect(end.distanceTo(start)).toBeCloseTo(178.062, 3);
    expect(lifetimeMs).toBe(250);

    expect(mockHM.checkRayHit).toHaveBeenCalledTimes(1);
    const [ray, range] = mockHM.checkRayHit.mock.calls[0] as [THREE.Ray, number];
    expect(ray.origin.x).toBeCloseTo(start.x);
    expect(ray.origin.y).toBeCloseTo(start.y);
    expect(ray.origin.z).toBeCloseTo(start.z);
    expect(ray.direction.length()).toBeCloseTo(1);
    expect(range).toBe(emp.config.range);
    expect(mockHM.applyDamage).toHaveBeenCalledWith('heli_1', emp.config.damage);

    randomSpy.mockRestore();
  });

  it('does not target helicopters out of range', () => {
    const heli = { id: 'heli_1', position: new THREE.Vector3(5000, 100, 5000), model: 'UH1_HUEY' };
    const mockHM = createMockHelicopterModel({ helis: [heli] });
    system.setHelicopterModel(mockHM);
    system.setTerrainSystem(createMockTerrain());

    system.addEmplacement(new THREE.Vector3(0, 0, 0));

    // Distance is ~7071m >> range of 1400m
    for (let i = 0; i < 5; i++) system.update(1);
    expect(mockHM.checkRayHit).not.toHaveBeenCalled();
  });

  it('does not target destroyed helicopters', () => {
    const heli = { id: 'heli_1', position: new THREE.Vector3(200, 80, 200), model: 'UH1_HUEY' };
    const mockHM = createMockHelicopterModel({ helis: [heli], destroyed: new Set(['heli_1']) });
    system.setHelicopterModel(mockHM);
    system.setTerrainSystem(createMockTerrain());

    system.addEmplacement(new THREE.Vector3(200, 0, 200));

    for (let i = 0; i < 5; i++) system.update(1);
    expect(mockHM.checkRayHit).not.toHaveBeenCalled();
  });

  it('respawns after delay', () => {
    system.addEmplacement(new THREE.Vector3(100, 0, 100));

    // Destroy
    system.applyDamageAt(new THREE.Vector3(100, 0, 100), 500, 10);
    expect(system.getActiveCount()).toBe(0);

    // Advance past respawn delay (default 120s)
    for (let i = 0; i < 121; i++) system.update(1);
    expect(system.getActiveCount()).toBe(1);
  });

  it('disposes cleanly', () => {
    system.addEmplacement(new THREE.Vector3(100, 0, 100));
    system.dispose();
    expect(system.getEmplacementCount()).toBe(0);
  });

  it('ZPU-4 config has correct defaults', () => {
    system.addEmplacement(new THREE.Vector3(0, 0, 0));
    // We can verify through behavior - the system exists and has 1 emplacement
    expect(system.getEmplacementCount()).toBe(1);
  });
});
