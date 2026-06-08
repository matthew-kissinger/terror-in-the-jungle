// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { Emplacement } from './Emplacement';
import { GroundVehicle } from './GroundVehicle';
import { GroundVehicleProximityChecker } from './GroundVehicleProximityChecker';
import { PBR } from './PBR';
import {
  PlayerVehicleAdapterFactory,
  resolveAdapterFamily,
  type PlayerVehicleAdapterFactoryDeps,
} from './PlayerVehicleAdapterFactory';
import { Sampan } from './Sampan';
import { Tank } from './Tank';
import { VehicleManager } from './VehicleManager';
import { VehicleSessionController } from './VehicleSessionController';
import type { PlayerState } from '../../types';
import type { IHUDSystem } from '../../types/SystemInterfaces';
import { Faction } from '../combat/types';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Behavior tests for the player vehicle adapter factory.
 *
 * Split A of `vekhikl-board-controller-factory` — the factory module +
 * tests only; the PlayerController handler and composer wire live in
 * split B. Tests assert observable behavior at the factory's public
 * surface (`tryBoardNearest`, `tryExit`, `resolveAdapterFamily`) and the
 * `vehicleType` that flows into the session controller — not any internal
 * caching or adapter construction order.
 */

// ───────────────────────────── Test fixtures ─────────────────────────────

function createPlayerState(spawn: THREE.Vector3): PlayerState {
  return {
    position: spawn.clone(),
    velocity: new THREE.Vector3(),
    speed: 10,
    runSpeed: 20,
    isRunning: false,
    isGrounded: true,
    isJumping: false,
    jumpForce: 12,
    gravity: -25,
    isCrouching: false,
    isInHelicopter: false,
    helicopterId: null,
    isInFixedWing: false,
    fixedWingId: null,
  };
}

function createPlayerInput() {
  return {
    setInHelicopter: vi.fn(),
    setFlightVehicleMode: vi.fn(),
    setInputContext: vi.fn(),
    isKeyPressed: vi.fn(() => false),
    getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })),
    clearMouseMovement: vi.fn(),
    getIsPointerLocked: vi.fn(() => false),
    getTouchControls: vi.fn(() => null),
    getTouchMovementVector: vi.fn(() => ({ x: 0, z: 0 })),
    relockPointer: vi.fn(),
    clearTransientInputState: vi.fn(),
  };
}

function createCameraController() {
  return {
    saveInfantryAngles: vi.fn(),
    restoreInfantryAngles: vi.fn(),
  };
}

function createHud(): IHUDSystem {
  return {
    showInteractionPrompt: vi.fn(),
    hideInteractionPrompt: vi.fn(),
    setVehicleContext: vi.fn(),
    updateElevation: vi.fn(),
    showMessage: vi.fn(),
  } as unknown as IHUDSystem;
}

/**
 * Set the proximity-prompt cache to `vehicleId` by running a single
 * proximity check with the vehicle placed inside the prompt radius. This
 * is the same path the production wire takes (proximity checker → HUD
 * prompt → factory reads the prompted id).
 */
function primePrompt(
  checker: GroundVehicleProximityChecker,
  playerPos: THREE.Vector3,
  vehiclePos: THREE.Vector3,
): void {
  playerPos.copy(vehiclePos).add(new THREE.Vector3(1, 0, 0));
  checker.checkPlayerProximity();
}

interface Harness {
  factory: PlayerVehicleAdapterFactory;
  vehicleManager: VehicleManager;
  session: VehicleSessionController;
  proximityChecker: GroundVehicleProximityChecker;
  playerState: PlayerState;
  hud: IHUDSystem;
  enterSpy: ReturnType<typeof vi.spyOn>;
  exitSpy: ReturnType<typeof vi.spyOn>;
}

async function buildHarness(vehicles: Array<{ vehicle: any; position: THREE.Vector3 }>): Promise<Harness> {
  const vehicleManager = new VehicleManager();
  await vehicleManager.init();
  for (const { vehicle } of vehicles) {
    vehicleManager.register(vehicle);
  }

  const session = new VehicleSessionController();
  const playerState = createPlayerState(new THREE.Vector3(0, 0, 0));
  const hud = createHud();

  const proximityChecker = new GroundVehicleProximityChecker(
    vehicleManager,
    () => playerState.position,
    () => session.isInVehicle(),
  );
  proximityChecker.setHUDSystem(hud);

  const deps: PlayerVehicleAdapterFactoryDeps = {
    vehicleManager,
    vehicleSessionController: session,
    proximityChecker,
    playerState,
    input: createPlayerInput() as any,
    cameraController: createCameraController() as any,
    hudSystem: hud,
  };
  const factory = new PlayerVehicleAdapterFactory(deps);

  const enterSpy = vi.spyOn(session, 'enterVehicle');
  const exitSpy = vi.spyOn(session, 'exitVehicle');

  return {
    factory,
    vehicleManager,
    session,
    proximityChecker,
    playerState,
    hud,
    enterSpy,
    exitSpy,
  };
}

function makeObject(position: THREE.Vector3): THREE.Group {
  const obj = new THREE.Group();
  obj.position.copy(position);
  return obj;
}

function makeJeep(id: string, position: THREE.Vector3): GroundVehicle {
  return new GroundVehicle(id, makeObject(position), Faction.US);
}

function makeTank(id: string, position: THREE.Vector3): Tank {
  return new Tank(id, makeObject(position), Faction.US);
}

function makeSampan(id: string, position: THREE.Vector3): Sampan {
  return new Sampan(id, makeObject(position), Faction.NVA);
}

function makePBR(id: string, position: THREE.Vector3): PBR {
  return new PBR(id, makeObject(position), Faction.US);
}

function makeEmplacement(id: string, position: THREE.Vector3): Emplacement {
  return new Emplacement(id, makeObject(position), Faction.US);
}

// ───────────────────────────── Tests ─────────────────────────────

describe('PlayerVehicleAdapterFactory.tryBoardNearest', () => {
  it('returns false when no proximity prompt is showing', async () => {
    const jeep = makeJeep('motor_pool_small_m151', new THREE.Vector3(50, 0, 50));
    const h = await buildHarness([{ vehicle: jeep, position: jeep.getPosition() }]);

    // No prompt primed → the proximity checker's last-shown id is null.
    expect(h.proximityChecker.getLastShownVehicleId()).toBeNull();

    const boarded = h.factory.tryBoardNearest();

    expect(boarded).toBe(false);
    expect(h.enterSpy).not.toHaveBeenCalled();
    expect(h.session.isInVehicle()).toBe(false);
  });

  it('dispatches an M151 prompt through the ground adapter', async () => {
    const jeep = makeJeep('motor_pool_small_m151', new THREE.Vector3(10, 0, 10));
    const h = await buildHarness([{ vehicle: jeep, position: jeep.getPosition() }]);

    primePrompt(h.proximityChecker, h.playerState.position, jeep.getPosition());
    expect(h.proximityChecker.getLastShownVehicleId()).toBe('motor_pool_small_m151');

    const boarded = h.factory.tryBoardNearest();

    expect(boarded).toBe(true);
    expect(h.enterSpy).toHaveBeenCalledTimes(1);
    const [vehicleType, vehicleId] = h.enterSpy.mock.calls[0];
    expect(vehicleType).toBe('ground');
    expect(vehicleId).toBe('motor_pool_small_m151');
    expect(h.session.getVehicleType()).toBe('ground');
    expect(jeep.getPilotId()).toBe('player');
  });

  it('dispatches an M48 prompt through the tank adapter', async () => {
    const tank = makeTank('m48_tank_of_us_fob', new THREE.Vector3(10, 0, 10));
    const h = await buildHarness([{ vehicle: tank, position: tank.getPosition() }]);

    primePrompt(h.proximityChecker, h.playerState.position, tank.getPosition());

    const boarded = h.factory.tryBoardNearest();

    expect(boarded).toBe(true);
    const [vehicleType, vehicleId] = h.enterSpy.mock.calls[0];
    expect(vehicleType).toBe('tank');
    expect(vehicleId).toBe('m48_tank_of_us_fob');
    expect(h.session.getVehicleType()).toBe('tank');
  });

  it('dispatches a Sampan prompt through the watercraft adapter', async () => {
    const sampan = makeSampan('sampan_open_frontier_river', new THREE.Vector3(10, 0, 10));
    const h = await buildHarness([{ vehicle: sampan, position: sampan.getPosition() }]);

    primePrompt(h.proximityChecker, h.playerState.position, sampan.getPosition());

    const boarded = h.factory.tryBoardNearest();

    expect(boarded).toBe(true);
    const [vehicleType, vehicleId] = h.enterSpy.mock.calls[0];
    expect(vehicleType).toBe('watercraft');
    expect(vehicleId).toBe('sampan_open_frontier_river');
  });

  it('dispatches a PBR prompt through the watercraft adapter', async () => {
    const pbr = makePBR('pbr_us_open_frontier', new THREE.Vector3(10, 0, 10));
    const h = await buildHarness([{ vehicle: pbr, position: pbr.getPosition() }]);

    primePrompt(h.proximityChecker, h.playerState.position, pbr.getPosition());

    const boarded = h.factory.tryBoardNearest();

    expect(boarded).toBe(true);
    const [vehicleType, vehicleId] = h.enterSpy.mock.calls[0];
    expect(vehicleType).toBe('watercraft');
    expect(vehicleId).toBe('pbr_us_open_frontier');
  });

  it('dispatches an M2HB prompt through the emplacement adapter', async () => {
    const emp = makeEmplacement('m2hb_emp_of_us_fob', new THREE.Vector3(10, 0, 10));
    const h = await buildHarness([{ vehicle: emp, position: emp.getPosition() }]);

    primePrompt(h.proximityChecker, h.playerState.position, emp.getPosition());

    const boarded = h.factory.tryBoardNearest();

    expect(boarded).toBe(true);
    const [vehicleType, vehicleId] = h.enterSpy.mock.calls[0];
    expect(vehicleType).toBe('emplacement');
    expect(vehicleId).toBe('m2hb_emp_of_us_fob');
  });

  it('returns false when the prompted vehicle was unregistered between prompt and board', async () => {
    const jeep = makeJeep('motor_pool_small_m151', new THREE.Vector3(10, 0, 10));
    const h = await buildHarness([{ vehicle: jeep, position: jeep.getPosition() }]);

    primePrompt(h.proximityChecker, h.playerState.position, jeep.getPosition());
    // Pull the jeep out of the manager while the prompt id is still cached.
    h.vehicleManager.unregister('motor_pool_small_m151');

    const boarded = h.factory.tryBoardNearest();

    expect(boarded).toBe(false);
    expect(h.enterSpy).not.toHaveBeenCalled();
  });
});

describe('PlayerVehicleAdapterFactory.tryExit', () => {
  it('returns false when the player is not seated', async () => {
    const jeep = makeJeep('motor_pool_small_m151', new THREE.Vector3(10, 0, 10));
    const h = await buildHarness([{ vehicle: jeep, position: jeep.getPosition() }]);

    const exited = h.factory.tryExit();

    expect(exited).toBe(false);
    expect(h.exitSpy).not.toHaveBeenCalled();
  });

  it('fires a voluntary exit through the session controller while seated', async () => {
    const jeep = makeJeep('motor_pool_small_m151', new THREE.Vector3(10, 0, 10));
    const h = await buildHarness([{ vehicle: jeep, position: jeep.getPosition() }]);

    primePrompt(h.proximityChecker, h.playerState.position, jeep.getPosition());
    h.factory.tryBoardNearest();
    expect(h.session.isInVehicle()).toBe(true);

    const exited = h.factory.tryExit();

    expect(exited).toBe(true);
    expect(h.session.isInVehicle()).toBe(false);
    expect(h.exitSpy).toHaveBeenCalledTimes(1);
    // Sanity-check the exit options carry the voluntary `'input'` reason
    // — the helicopter handler shape this is mirroring uses the same tag,
    // and the session controller surfaces it to adapters via the exit ctx.
    const exitOptions = h.exitSpy.mock.calls[0][1];
    expect(exitOptions?.reason).toBe('input');
    // The seat is released so an NPC can mount it after the player walks
    // off (regression guard for cycle-vekhikl-4 NPC re-mount).
    expect(jeep.getPilotId()).toBeNull();
  });

  it('boards a tank, then exits cleanly leaving the chassis empty', async () => {
    const tank = makeTank('m48_tank_of_us_fob', new THREE.Vector3(10, 0, 10));
    const h = await buildHarness([{ vehicle: tank, position: tank.getPosition() }]);

    primePrompt(h.proximityChecker, h.playerState.position, tank.getPosition());
    expect(h.factory.tryBoardNearest()).toBe(true);

    const exited = h.factory.tryExit();

    expect(exited).toBe(true);
    expect(h.session.isInVehicle()).toBe(false);
    // The tank's pilot seat is released — sibling NPC-driver task can
    // re-occupy it without colliding with a stale 'player' lock.
    expect(tank.getPilotId()).toBeNull();
  });
});

describe('PlayerVehicleAdapterFactory.trySwapSeat', () => {
  it('swaps the active tank adapter between driver and gunner seats', async () => {
    const tank = makeTank('m48_tank_of_us_fob', new THREE.Vector3(10, 0, 10));
    const h = await buildHarness([{ vehicle: tank, position: tank.getPosition() }]);

    primePrompt(h.proximityChecker, h.playerState.position, tank.getPosition());
    expect(h.factory.tryBoardNearest()).toBe(true);
    expect(tank.getPilotId()).toBe('player');

    expect(h.factory.trySwapSeat()).toBe(true);

    expect(tank.getPilotId()).toBeNull();
    expect(tank.getSeats().find((seat) => seat.role === 'gunner')?.occupantId).toBe('player');
  });

  it('does not consume the input for a non-swappable active vehicle', async () => {
    const jeep = makeJeep('motor_pool_small_m151', new THREE.Vector3(10, 0, 10));
    const h = await buildHarness([{ vehicle: jeep, position: jeep.getPosition() }]);

    primePrompt(h.proximityChecker, h.playerState.position, jeep.getPosition());
    expect(h.factory.tryBoardNearest()).toBe(true);

    expect(h.factory.trySwapSeat()).toBe(false);
  });
});

describe('resolveAdapterFamily', () => {
  it('returns the correct family for each drivable category', async () => {
    const jeep = makeJeep('motor_pool_small_m151', new THREE.Vector3(0, 0, 0));
    const tank = makeTank('m48_tank_of_us_fob', new THREE.Vector3(0, 0, 0));
    const sampan = makeSampan('sampan_open_frontier_river', new THREE.Vector3(0, 0, 0));
    const pbr = makePBR('pbr_us_open_frontier', new THREE.Vector3(0, 0, 0));
    const emp = makeEmplacement('m2hb_emp_of_us_fob', new THREE.Vector3(0, 0, 0));

    expect(resolveAdapterFamily(jeep)).toBe('ground');
    expect(resolveAdapterFamily(tank)).toBe('tank');
    expect(resolveAdapterFamily(sampan)).toBe('watercraft');
    expect(resolveAdapterFamily(pbr)).toBe('watercraft');
    expect(resolveAdapterFamily(emp)).toBe('emplacement');
  });

  it('returns null for aircraft (those have dedicated boarding paths)', () => {
    const helicopter = {
      vehicleId: 'uh1_heli',
      category: 'helicopter' as const,
    } as any;
    const plane = {
      vehicleId: 'ac47_plane',
      category: 'fixed_wing' as const,
    } as any;

    expect(resolveAdapterFamily(helicopter)).toBeNull();
    expect(resolveAdapterFamily(plane)).toBeNull();
  });
});
