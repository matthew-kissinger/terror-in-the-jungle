// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { VehicleSessionController, type VehicleSeatBinder } from './VehicleSessionController';
import { VehicleManager } from './VehicleManager';
import { GroundVehicle } from './GroundVehicle';
import { HelicopterVehicleAdapter } from './HelicopterVehicleAdapter';
import type { PlayerVehicleAdapter, VehicleTransitionContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';
import { Faction } from '../combat/types';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Behavior tests for the centralized seat lifecycle the session controller
 * owns. The session controller is the single chokepoint every player
 * enter/exit path funnels through (F, Escape, requestVehicleExit, heli /
 * fixed-wing), so binding the IVehicle seat here is what guarantees no path
 * leaves a seat ghost. These assert observable seat truth (`getPilotId()`,
 * occupant counts) — not the controller's internal state shape.
 */

function makeInput() {
  return {
    setInHelicopter: vi.fn(),
    setFlightVehicleMode: vi.fn(),
    setInputContext: vi.fn(),
    clearTransientInputState: vi.fn(),
  } as any;
}

function makePlayerState(): PlayerState {
  return {
    position: new THREE.Vector3(),
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

function makeCtx(playerState: PlayerState, vehicleId: string): VehicleTransitionContext {
  return {
    playerState,
    vehicleId,
    position: playerState.position.clone(),
    setPosition: (p) => playerState.position.copy(p),
    input: makeInput(),
    cameraController: {} as any,
  };
}

/** Minimal adapter that records nothing beyond satisfying the interface. */
function makeAdapter(vehicleType: string): PlayerVehicleAdapter {
  return {
    vehicleType,
    inputContext: 'vehicle' as any,
    onEnter: vi.fn(),
    onExit: vi.fn(),
    update: vi.fn(),
    resetControlState: vi.fn(),
  };
}

function makeJeep(id: string): GroundVehicle {
  const obj = new THREE.Group();
  obj.position.set(0, 0, 0);
  return new GroundVehicle(id, obj, Faction.US);
}

function makeHeli(id: string): HelicopterVehicleAdapter {
  const heliPos = new THREE.Vector3(0, 5, 0);
  const modelStub = {
    getHelicopterPositionTo: (_id: string, target: THREE.Vector3) => {
      target.copy(heliPos);
      return true;
    },
    getHelicopterQuaternionTo: (_id: string, target: THREE.Quaternion) => {
      target.identity();
      return true;
    },
    getFlightData: () => null,
    isHelicopterDestroyed: () => false,
    getHealthPercent: () => 1,
  } as any;
  return new HelicopterVehicleAdapter(id, 'UH1_HUEY', Faction.US, modelStub);
}

describe('VehicleSessionController seat lifecycle', () => {
  it('locks the pilot seat on enter and releases it on exit', () => {
    const jeep = makeJeep('jeep_1');
    const manager = new VehicleManager();
    manager.register(jeep);

    const session = new VehicleSessionController();
    session.setSeatBinder(manager);
    session.registerAdapter(makeAdapter('ground'));
    const playerState = makePlayerState();

    expect(jeep.getPilotId()).toBeNull();

    expect(session.enterVehicle('ground', 'jeep_1', makeCtx(playerState, 'jeep_1'))).toBe(true);
    expect(jeep.getPilotId()).toBe('player');

    const result = session.exitVehicle(makeCtx(playerState, 'jeep_1'), { reason: 'escape' });
    expect(result.exited).toBe(true);
    expect(jeep.getPilotId()).toBeNull();
  });

  it('releases the helicopter pilot seat on exit (heli Escape path, no seat ghost)', () => {
    const heli = makeHeli('heli_1');
    const manager = new VehicleManager();
    manager.register(heli);

    const session = new VehicleSessionController();
    session.setSeatBinder(manager);
    session.registerAdapter(makeAdapter('helicopter'));
    const playerState = makePlayerState();

    session.enterVehicle('helicopter', 'heli_1', makeCtx(playerState, 'heli_1'));
    expect(heli.getPilotId()).toBe('player');

    session.exitVehicle(makeCtx(playerState, 'heli_1'), { reason: 'escape' });
    expect(heli.getPilotId()).toBeNull();
  });

  it('does not double-lock when the seat was pre-locked (boarding factory path)', () => {
    const jeep = makeJeep('jeep_1');
    const manager = new VehicleManager();
    manager.register(jeep);

    const session = new VehicleSessionController();
    session.setSeatBinder(manager);
    session.registerAdapter(makeAdapter('ground'));
    const playerState = makePlayerState();

    // The boarding factory pre-locks the seat to compute the seat world pose,
    // then calls session.enterVehicle. The session lock must be idempotent so
    // the player never ends up in two seats.
    jeep.enterVehicle('player', 'pilot');
    session.enterVehicle('ground', 'jeep_1', makeCtx(playerState, 'jeep_1'));

    const playerSeats = jeep.getSeats().filter((s) => s.occupantId === 'player');
    expect(playerSeats).toHaveLength(1);
  });

  it('releases the seat exactly once (a redundant external release is a harmless no-op)', () => {
    const jeep = makeJeep('jeep_1');
    const manager = new VehicleManager();
    manager.register(jeep);

    const session = new VehicleSessionController();
    session.setSeatBinder(manager);
    session.registerAdapter(makeAdapter('ground'));
    const playerState = makePlayerState();

    session.enterVehicle('ground', 'jeep_1', makeCtx(playerState, 'jeep_1'));
    // An NPC takes a passenger seat alongside the player.
    jeep.enterVehicle('npc', 'passenger');

    session.exitVehicle(makeCtx(playerState, 'jeep_1'), { reason: 'escape' });
    // A second (stale) external release must not disturb the NPC's seat.
    jeep.exitVehicle('player');

    expect(jeep.getPilotId()).toBeNull();
    expect(jeep.getSeats().find((s) => s.occupantId === 'npc')).toBeTruthy();
  });

  it('is a graceful no-op when no seat binder is wired (unit-test fallback)', () => {
    const session = new VehicleSessionController();
    session.registerAdapter(makeAdapter('ground'));
    const playerState = makePlayerState();

    // No binder: enter/exit must still succeed at the session level.
    expect(session.enterVehicle('ground', 'jeep_1', makeCtx(playerState, 'jeep_1'))).toBe(true);
    expect(session.isInVehicle()).toBe(true);
    const result = session.exitVehicle(makeCtx(playerState, 'jeep_1'), { reason: 'escape' });
    expect(result.exited).toBe(true);
    expect(session.isInVehicle()).toBe(false);
  });

  it('accepts a plain VehicleSeatBinder shape (not just VehicleManager)', () => {
    const jeep = makeJeep('jeep_1');
    const binder: VehicleSeatBinder = {
      getVehicle: (id) => (id === 'jeep_1' ? jeep : null),
    };
    const session = new VehicleSessionController();
    session.setSeatBinder(binder);
    session.registerAdapter(makeAdapter('ground'));
    const playerState = makePlayerState();

    session.enterVehicle('ground', 'jeep_1', makeCtx(playerState, 'jeep_1'));
    expect(jeep.getPilotId()).toBe('player');
    session.exitVehicle(makeCtx(playerState, 'jeep_1'), { reason: 'escape' });
    expect(jeep.getPilotId()).toBeNull();
  });
});
