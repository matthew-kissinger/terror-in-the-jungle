// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { VehicleSessionController } from './VehicleSessionController';
import { GroundVehicle } from './GroundVehicle';
import {
  GroundVehiclePlayerAdapter,
  type IGroundVehicleModel,
} from './GroundVehiclePlayerAdapter';
import { Emplacement } from './Emplacement';
import { EmplacementPlayerAdapter } from './EmplacementPlayerAdapter';
import type {
  VehicleTransitionContext,
  VehicleUpdateContext,
} from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';
import { Faction } from '../combat/types';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Behavior tests for the player-position-to-chassis sync the session
 * controller performs while the player drives a ground / water /
 * emplacement vehicle.
 *
 * The gap these guard against: world streaming, AI targeting, zone capture
 * and the minimap all read `playerState.position`. The heli / fixed-wing
 * sessions already keep that position glued to their chassis each frame; the
 * ground / water / emplacement sessions used to leave it parked at the
 * boarding spot, so driving 500 m stranded every consumer at the start point.
 *
 * Assertions are observable-outcome only: where does `playerState.position`
 * (and a consumer that reads it) end up — never the controller's internal
 * state shape.
 */

function makeInput() {
  return {
    setInHelicopter: vi.fn(),
    setFlightVehicleMode: vi.fn(),
    setInputContext: vi.fn(),
    clearTransientInputState: vi.fn(),
    isKeyPressed: vi.fn(() => false),
    isMouseButtonPressed: vi.fn(() => false),
    getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })),
    clearMouseMovement: vi.fn(),
    getIsPointerLocked: vi.fn(() => false),
    getTouchControls: vi.fn(() => null),
    getTouchMovementVector: vi.fn(() => ({ x: 0, z: 0 })),
    relockPointer: vi.fn(),
  } as any;
}

function makePlayerState(spawn: THREE.Vector3): PlayerState {
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

function makeTransitionCtx(playerState: PlayerState, vehicleId: string, position: THREE.Vector3): VehicleTransitionContext {
  return {
    playerState,
    vehicleId,
    position: position.clone(),
    setPosition: (p) => playerState.position.copy(p),
    input: makeInput(),
    cameraController: { saveInfantryAngles: vi.fn(), restoreInfantryAngles: vi.fn() } as any,
    hudSystem: { setVehicleContext: vi.fn(), updateElevation: vi.fn() } as any,
  };
}

function makeUpdateCtx(): VehicleUpdateContext {
  return {
    deltaTime: 1 / 60,
    input: makeInput(),
    cameraController: {} as any,
    hudSystem: { setVehicleContext: vi.fn(), updateElevation: vi.fn() } as any,
  };
}

/** Bridges a real GroundVehicle into the adapter's IGroundVehicleModel surface. */
function makeGroundModel(vehicle: GroundVehicle): IGroundVehicleModel {
  return {
    getVehiclePositionTo(_id, target) {
      target.copy(vehicle.getPosition());
      return true;
    },
    getVehicleQuaternionTo(_id, target) {
      target.copy(vehicle.getQuaternion());
      return true;
    },
    getPhysics(_id) {
      return vehicle.getPhysics();
    },
    setEngineActive() {},
  };
}

function makeEmplacement(id: string, object: THREE.Object3D): Emplacement {
  return new Emplacement(id, object, Faction.US);
}

describe('VehicleSessionController player position sync', () => {
  it('tracks the chassis as the jeep drives 500 m from the boarding spot', () => {
    const chassisObject = new THREE.Group();
    chassisObject.position.set(40, 1, 60);
    const jeep = new GroundVehicle('motor_pool_small_m151', chassisObject, Faction.US);

    const session = new VehicleSessionController();
    const adapter = new GroundVehiclePlayerAdapter(makeGroundModel(jeep));
    session.registerAdapter(adapter);

    const boardingSpot = new THREE.Vector3(41, 1, 60);
    const playerState = makePlayerState(boardingSpot);

    expect(session.enterVehicle('ground', jeep.vehicleId, makeTransitionCtx(playerState, jeep.vehicleId, boardingSpot))).toBe(true);

    // Drive the chassis 500 m down-range (simulate the integrated pose the
    // physics writes back to the scene object each frame).
    chassisObject.position.set(40, 1, 560);
    session.update(makeUpdateCtx());

    // The player position must follow the chassis, not stay parked at the
    // boarding spot. A consumer reading playerState.position (terrain
    // streaming, AI targeting, zone presence, minimap) now sees the driven
    // location.
    expect(playerState.position.z).toBeCloseTo(560, 1);
    expect(playerState.position.x).toBeCloseTo(40, 1);
    expect(playerState.position.distanceTo(boardingSpot)).toBeGreaterThan(400);
  });

  it('keeps a streaming-center consumer glued to the moving chassis', () => {
    const chassisObject = new THREE.Group();
    chassisObject.position.set(0, 1, 0);
    const jeep = new GroundVehicle('motor_pool_small_m151', chassisObject, Faction.US);

    const session = new VehicleSessionController();
    session.registerAdapter(new GroundVehiclePlayerAdapter(makeGroundModel(jeep)));

    const playerState = makePlayerState(new THREE.Vector3(1, 1, 0));
    session.enterVehicle('ground', jeep.vehicleId, makeTransitionCtx(playerState, jeep.vehicleId, new THREE.Vector3(1, 1, 0)));

    // A streaming system polls playerState.position to recentre chunks.
    const streamingCenter = new THREE.Vector3();
    const pollStreamingCenter = () => streamingCenter.copy(playerState.position);

    for (let step = 1; step <= 5; step++) {
      chassisObject.position.set(0, 1, step * 100);
      session.update(makeUpdateCtx());
      pollStreamingCenter();
    }

    expect(streamingCenter.z).toBeCloseTo(500, 1);
  });

  it('leaves the player at the dismount point on exit, not the boarding spot', () => {
    const chassisObject = new THREE.Group();
    chassisObject.position.set(0, 1, 0);
    const jeep = new GroundVehicle('motor_pool_small_m151', chassisObject, Faction.US);

    const session = new VehicleSessionController();
    session.registerAdapter(new GroundVehiclePlayerAdapter(makeGroundModel(jeep)));

    const boardingSpot = new THREE.Vector3(1, 1, 0);
    const playerState = makePlayerState(boardingSpot);
    session.enterVehicle('ground', jeep.vehicleId, makeTransitionCtx(playerState, jeep.vehicleId, boardingSpot));

    // Drive 300 m, then dismount.
    chassisObject.position.set(0, 1, 300);
    session.update(makeUpdateCtx());

    const exitCtx = makeTransitionCtx(playerState, jeep.vehicleId, playerState.position.clone());
    const result = session.exitVehicle(exitCtx, { reason: 'input' });
    expect(result.exited).toBe(true);

    // Dismount point is beside the driven chassis (~300 m down-range), not the
    // boarding spot at the origin.
    expect(playerState.position.z).toBeGreaterThan(290);
    expect(playerState.position.distanceTo(boardingSpot)).toBeGreaterThan(200);
  });

  it('tracks the mount for a seated gunner session (incl. a vehicle-mounted gun)', () => {
    // A vehicle-mounted emplacement rides a moving hull: the mount object is
    // re-positioned as the carrier drives, and the seated gunner must track it.
    const object = new THREE.Group();
    object.position.set(120, 5, 80);
    const emplacement = makeEmplacement('m2hb_pbr', object);

    const session = new VehicleSessionController();
    session.registerAdapter(new EmplacementPlayerAdapter(emplacement));

    // Player boards from a step beside the gun.
    const boardingSpot = new THREE.Vector3(122, 5, 80);
    const playerState = makePlayerState(boardingSpot);
    session.enterVehicle('emplacement', emplacement.vehicleId, makeTransitionCtx(playerState, emplacement.vehicleId, object.position.clone()));

    // Carrier drives the mounted gun 250 m down-range.
    object.position.set(120, 5, 330);
    session.update(makeUpdateCtx());

    // The seated gunner's tracked position is the gun mount, so AI/zone
    // consumers see the gunner where the weapon is — not the boarding spot.
    expect(playerState.position.distanceTo(emplacement.getPosition())).toBeLessThan(0.01);
    expect(playerState.position.distanceTo(boardingSpot)).toBeGreaterThan(200);
  });

  it('does not sync flight-vehicle sessions through this path (heli/fixed-wing own their own loop)', () => {
    // A flight adapter that exposes no chassis accessor must not be moved by
    // the session controller; the heli/fixed-wing model loops own that sync.
    const flightAdapter = {
      vehicleType: 'helicopter',
      inputContext: 'helicopter' as any,
      onEnter: vi.fn(),
      onExit: vi.fn(),
      update: vi.fn(),
      resetControlState: vi.fn(),
    };

    const session = new VehicleSessionController();
    session.registerAdapter(flightAdapter as any);

    const spawn = new THREE.Vector3(10, 50, 10);
    const playerState = makePlayerState(spawn);
    session.enterVehicle('helicopter', 'heli_1', makeTransitionCtx(playerState, 'heli_1', spawn));

    const before = playerState.position.clone();
    session.update(makeUpdateCtx());

    // No chassis accessor → session controller leaves the position untouched.
    expect(playerState.position.distanceTo(before)).toBeLessThan(0.01);
  });
});
