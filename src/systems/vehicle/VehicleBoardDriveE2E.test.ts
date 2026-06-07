// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * End-to-end (L3) vehicle pass — board → drive → steer → dismount.
 *
 * Task: docs/tasks/vehicle-board-drive-e2e.md (VEKHIKL-5). The owner report
 * was three jeep symptoms: press-to-board snapped the player BEHIND/inside the
 * chassis instead of into the driver seat; the jeep spawned clipped under the
 * terrain; and throttle/steer produced no motion. This scenario wires the real
 * factory + session controller + a real GroundVehicle against a mock terrain
 * and asserts the observable player experience for the whole round-trip:
 *
 *   1. Press-to-board puts the player at the DRIVER seat (forward-of-center),
 *      not the chassis center or rear.
 *   2. The vehicle rests ON the surface (chassis Y ≈ terrain + axle offset),
 *      not clipped under it, and reports grounded from frame 0.
 *   3. Holding throttle drives the vehicle FORWARD along its facing.
 *   4. Holding steer changes the heading.
 *   5. Dismount places the player BESIDE the vehicle and frees the seat.
 *
 * Two or three systems wired together with a gameplay slice → L3 per
 * docs/TESTING.md. Assertions are observable outcomes (did it move forward, did
 * heading change, is the player beside the chassis) — not tuning constants or
 * internal phase/state names. The M48 tank is covered for the board/rest/seat
 * slice too; skid-steer drive dynamics already have dedicated coverage in
 * TrackedVehiclePhysics.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { GroundVehicle } from './GroundVehicle';
import { GroundVehiclePlayerAdapter } from './GroundVehiclePlayerAdapter';
import { GroundVehicleProximityChecker } from './GroundVehicleProximityChecker';
import {
  PlayerVehicleAdapterFactory,
  type PlayerVehicleAdapterFactoryDeps,
} from './PlayerVehicleAdapterFactory';
import { Tank } from './Tank';
import { VehicleManager } from './VehicleManager';
import { VehicleSessionController } from './VehicleSessionController';
import type { IVehicle } from './IVehicle';
import type { VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';
import type { IHUDSystem, ITerrainRuntime } from '../../types/SystemInterfaces';
import { Faction } from '../combat/types';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ───────────────────────────── Terrain mock ─────────────────────────────

/** Flat playable terrain at a constant height (the surface the jeep rests on). */
function makeFlatTerrain(height: number): ITerrainRuntime {
  return {
    getHeightAt: () => height,
    getEffectiveHeightAt: () => height,
    getSlopeAt: () => 0,
    getNormalAt: (_x, _z, target) => (target ?? new THREE.Vector3()).set(0, 1, 0),
    getPlayableWorldSize: () => 4000,
    getWorldSize: () => 4000,
    isTerrainReady: () => true,
    hasTerrainAt: () => true,
    getActiveTerrainTileCount: () => 1,
    setSurfaceWetness: () => {},
    updatePlayerPosition: () => {},
    registerCollisionObject: () => {},
    unregisterCollisionObject: () => {},
    raycastTerrain: () => ({ hit: false }),
  };
}

// ───────────────────────────── Fixtures ─────────────────────────────

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

/** Input mock whose held keys are controlled by a mutable set. */
function createDrivingInput(held: Set<string>) {
  return {
    setInHelicopter: vi.fn(),
    setFlightVehicleMode: vi.fn(),
    setInputContext: vi.fn(),
    isKeyPressed: vi.fn((k: string) => held.has(k)),
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
    setVehicleFollowCamera: vi.fn(),
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

function makeObject(position: THREE.Vector3): THREE.Group {
  const obj = new THREE.Group();
  obj.position.copy(position);
  return obj;
}

interface Harness {
  factory: PlayerVehicleAdapterFactory;
  session: VehicleSessionController;
  proximityChecker: GroundVehicleProximityChecker;
  playerState: PlayerState;
  held: Set<string>;
  input: ReturnType<typeof createDrivingInput>;
  hud: IHUDSystem;
  vehicleManager: VehicleManager;
}

async function buildHarness(vehicle: IVehicle): Promise<Harness> {
  const vehicleManager = new VehicleManager();
  await vehicleManager.init();
  vehicleManager.register(vehicle as never);

  const session = new VehicleSessionController();
  const playerState = createPlayerState(new THREE.Vector3(0, 0, 0));
  const hud = createHud();

  const proximityChecker = new GroundVehicleProximityChecker(
    vehicleManager,
    () => playerState.position,
    () => session.isInVehicle(),
  );
  proximityChecker.setHUDSystem(hud);

  const held = new Set<string>();
  const input = createDrivingInput(held);

  const deps: PlayerVehicleAdapterFactoryDeps = {
    vehicleManager,
    vehicleSessionController: session,
    proximityChecker,
    playerState,
    input: input as never,
    cameraController: createCameraController() as never,
    hudSystem: hud,
    setPosition: (pos, _reason) => {
      playerState.position.copy(pos);
    },
  };
  const factory = new PlayerVehicleAdapterFactory(deps);

  return { factory, session, proximityChecker, playerState, held, input, hud, vehicleManager };
}

/** Prime the proximity-prompt cache so the factory has a vehicle to board. */
function primePrompt(h: Harness, vehiclePos: THREE.Vector3): void {
  h.playerState.position.copy(vehiclePos).add(new THREE.Vector3(1, 0, 0));
  h.proximityChecker.checkPlayerProximity();
}

/**
 * Run one driving frame the way production does:
 *   1. The session controller ticks the active adapter, which reads input and
 *      forwards smoothed throttle/steer into the physics controls.
 *   2. The vehicle manager steps the chassis sim and writes the pose back to
 *      the scene object (`vehicle.update(dt)` → `physics.update(dt, terrain)`).
 * The vehicle holds its own terrain reference (wired via `setTerrain`), so the
 * step here is terrain-aware without the adapter needing a terrain handle.
 */
function driveFrame(h: Harness, dt: number, vehicle: { update(dt: number): void }): void {
  const updateCtx: VehicleUpdateContext = {
    deltaTime: dt,
    input: h.input as never,
    cameraController: createCameraController() as never,
    hudSystem: h.hud,
  };
  h.session.update(updateCtx);
  vehicle.update(dt);
}

// ───────────────────────────── Jeep e2e ─────────────────────────────

describe('M151 jeep board → drive → steer → dismount (e2e)', () => {
  const DT = 1 / 60;
  const TERRAIN_HEIGHT = 12;

  it('seats the player at the driver offset, rests on the surface, drives forward, steers, and dismounts beside the vehicle', async () => {
    // Spawn the jeep deliberately clipped UNDER the terrain surface to
    // reproduce the owner's "spawns stuck inside the terrain" report.
    const spawn = new THREE.Vector3(100, TERRAIN_HEIGHT - 3, 100);
    const terrain = makeFlatTerrain(TERRAIN_HEIGHT);
    const jeep = new GroundVehicle('motor_pool_small_m151', makeObject(spawn), Faction.US);

    const h = await buildHarness(jeep);

    // Wire terrain — this is the moment the chassis should conform to rest.
    jeep.setTerrain(terrain);

    // ── 1. Rests on the surface (not clipped under it) ──
    const restY = jeep.getPosition().y;
    expect(restY).toBeGreaterThan(TERRAIN_HEIGHT); // chassis sits above the surface
    expect(restY).toBeLessThan(TERRAIN_HEIGHT + 2); // by a small axle offset, not floating
    expect(jeep.getPhysics().getState().isGrounded).toBe(true); // grounded from frame 0

    // ── 2. Board → player at the DRIVER seat (forward of center, not the rear) ──
    primePrompt(h, jeep.getPosition());
    expect(h.factory.tryBoardNearest()).toBe(true);
    expect(h.session.isInVehicle()).toBe(true);
    expect(jeep.getPilotId()).toBe('player');

    const driverSeat = jeep.getSeats()[0];
    expect(driverSeat.role).toBe('pilot');
    const expectedSeatWorld = driverSeat.localOffset
      .clone()
      .applyQuaternion(jeep.getQuaternion())
      .add(jeep.getPosition());
    // The player snapped onto the driver seat world pose, not the chassis
    // center (the regression dropped the seat offset and used center).
    expect(h.playerState.position.distanceTo(expectedSeatWorld)).toBeLessThan(0.01);
    expect(h.playerState.position.distanceTo(jeep.getPosition())).toBeGreaterThan(0.1);

    // The integration layer also exposes a terrain-aware step on the adapter
    // (used by alternative wiring / probes); confirm it steps the same physics.
    const activeAdapter = h.session.getActiveAdapter() as GroundVehiclePlayerAdapter;
    expect(activeAdapter.getActivePhysics()).toBe(jeep.getPhysics());
    expect(typeof activeAdapter.stepPhysics).toBe('function');

    // ── 3. Throttle drives the jeep FORWARD along its facing ──
    const startPos = jeep.getPosition().clone();
    const facing = new THREE.Vector3(0, 0, -1).applyQuaternion(jeep.getQuaternion());
    h.held.clear();
    h.held.add('keyw');
    for (let i = 0; i < 180; i++) driveFrame(h, DT, jeep);

    const afterDrivePos = jeep.getPosition().clone();
    const travel = afterDrivePos.clone().sub(startPos);
    // Moved a meaningful distance...
    expect(travel.length()).toBeGreaterThan(2);
    // ...and that motion is along the chassis forward axis (not sideways/back).
    const forwardProgress = travel.dot(facing);
    expect(forwardProgress).toBeGreaterThan(1);
    // Forward speed reported by the physics is positive while throttling.
    expect(jeep.getPhysics().getForwardSpeed()).toBeGreaterThan(0);

    // ── 4. Steer changes the heading ──
    const headingBeforeSteer = jeep.getPhysics().getHeading();
    h.held.clear();
    h.held.add('keyw');
    h.held.add('keyd');
    for (let i = 0; i < 120; i++) driveFrame(h, DT, jeep);
    const headingAfterSteer = jeep.getPhysics().getHeading();
    expect(headingAfterSteer).not.toBeCloseTo(headingBeforeSteer, 1);

    // ── 5. Dismount beside the vehicle, seat freed ──
    h.held.clear();
    const chassisAtExit = jeep.getPosition().clone();
    expect(h.factory.tryExit()).toBe(true);
    expect(h.session.isInVehicle()).toBe(false);
    expect(jeep.getPilotId()).toBeNull();

    const dismountDist = h.playerState.position.distanceTo(chassisAtExit);
    // Beside the chassis: clear of the body, but not flung across the map.
    expect(dismountDist).toBeGreaterThan(1);
    expect(dismountDist).toBeLessThan(6);
    // Dropped beside, not buried under the chassis — Y near the chassis pose.
    expect(Math.abs(h.playerState.position.y - chassisAtExit.y)).toBeLessThan(3);
  });

  it('keeps the jeep on the surface even when spawned far below it (no under-terrain clip)', async () => {
    const terrain = makeFlatTerrain(50);
    const jeep = new GroundVehicle(
      'motor_pool_small_m151',
      makeObject(new THREE.Vector3(0, -20, 0)),
      Faction.US,
    );

    jeep.setTerrain(terrain);

    // Conformed straight to the surface, not left buried 70m down.
    expect(jeep.getPosition().y).toBeGreaterThan(50);
    expect(jeep.getPosition().y).toBeLessThan(52);
  });
});

// ───────────────────────────── Tank board/rest slice ─────────────────────────────

describe('M48 tank board → driver seat → dismount (e2e)', () => {
  it('boards the player into the driver seat and frees the seat on exit', async () => {
    const terrain = makeFlatTerrain(8);
    const tank = new Tank(
      'm48_tank_of_us_fob',
      makeObject(new THREE.Vector3(60, -20, 60)),
      Faction.US,
    );
    tank.setTerrain(terrain);
    expect(tank.getPosition().y).toBeGreaterThan(8);
    expect(tank.getPosition().y).toBeLessThan(9);

    const h = await buildHarness(tank);

    // Board through the same factory path the jeep uses.
    primePrompt(h, tank.getPosition());
    expect(h.factory.tryBoardNearest()).toBe(true);
    expect(h.session.getVehicleType()).toBe('tank');
    expect(tank.getPilotId()).toBe('player');

    // Player snapped to the driver seat, not the chassis center.
    const driverSeat = tank.getSeats()[0];
    expect(driverSeat.role).toBe('pilot');
    const expectedSeatWorld = driverSeat.localOffset
      .clone()
      .applyQuaternion(tank.getQuaternion())
      .add(tank.getPosition());
    expect(h.playerState.position.distanceTo(expectedSeatWorld)).toBeLessThan(0.01);

    // Dismount frees the seat for an NPC driver.
    expect(h.factory.tryExit()).toBe(true);
    expect(h.session.isInVehicle()).toBe(false);
    expect(tank.getPilotId()).toBeNull();
  });
});
