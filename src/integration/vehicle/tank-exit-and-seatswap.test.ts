// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { GroundVehicleProximityChecker } from '../../systems/vehicle/GroundVehicleProximityChecker';
import { PlayerVehicleAdapterFactory } from '../../systems/vehicle/PlayerVehicleAdapterFactory';
import { Tank } from '../../systems/vehicle/Tank';
import { VehicleManager } from '../../systems/vehicle/VehicleManager';
import { VehicleSessionController } from '../../systems/vehicle/VehicleSessionController';
import { PlayerVehicleController } from '../../systems/player/PlayerVehicleController';
import type { PlayerState } from '../../types';
import type { IHUDSystem } from '../../types/SystemInterfaces';
import { Faction } from '../../systems/combat/types';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Repro-first L3 test for the unreachable-tank-exit bug (2026-06-28 owner
 * playtest: "you cannot get out of a tank").
 *
 * Root cause: the M48 has two crew seats (driver + gunner). The `F`-key
 * router tries the seat-swap FIRST and falls through to board/exit only when
 * the swap returns false — so on a two-seat tank `F` always swaps and the
 * dismount is never reached. The only exit was `Escape`, which is also the
 * pause-menu key. `E` had no ground-vehicle branch.
 *
 * The fix splits the binds: `F` stays the driver<->gunner seat-swap; `E`
 * exits any seated ground/tracked vehicle through the canonical session
 * dismount (`PlayerVehicleController.handleEnterExitVehicle` -> the wired
 * `requestVehicleExit`), which runs the adapter's `getExitPlan` so the player
 * ejects to the side of the hull.
 *
 * This test wires the real chain the production keys route through: the
 * `PlayerVehicleAdapterFactory` (F: trySwapSeat / tryExit) + the
 * `PlayerVehicleController` (E: requestVehicleExit), both against ONE shared
 * `VehicleSessionController`, a real `Tank`, and the real `TankPlayerAdapter`
 * the factory builds. No production internals are stubbed beyond the input /
 * camera / HUD boundary surfaces.
 */

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
    isMouseButtonPressed: vi.fn(() => false),
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
  tank: Tank;
  /** The F-key router: swap first, board/exit fallback (mirrors PlayerInput). */
  pressF: () => boolean;
  /** The E-key router: exit a seated ground/tracked vehicle. */
  pressE: () => void;
}

async function buildHarness(tankPos: THREE.Vector3): Promise<Harness> {
  const tank = new Tank('m48_tank_of_us_fob', makeObject(tankPos), Faction.US);

  const vehicleManager = new VehicleManager();
  await vehicleManager.init();
  vehicleManager.register(tank);

  const session = new VehicleSessionController();
  const playerState = createPlayerState(new THREE.Vector3(0, 0, 0));
  const hud = createHud();

  const proximityChecker = new GroundVehicleProximityChecker(
    vehicleManager,
    () => playerState.position,
    () => session.isInVehicle(),
    {},
  );
  proximityChecker.setHUDSystem(hud);

  const factory = new PlayerVehicleAdapterFactory({
    vehicleManager,
    vehicleSessionController: session,
    proximityChecker,
    playerState,
    input: createPlayerInput() as any,
    cameraController: createCameraController() as any,
    hudSystem: hud,
    setPosition: (p) => {
      playerState.position.copy(p);
    },
  });

  // The E-key vehicle controller, wired exactly as PlayerController wires it:
  // `requestVehicleExit` runs the canonical session dismount with side-eject.
  const vehicleController = new PlayerVehicleController();
  vehicleController.configure({
    requestVehicleExit: () =>
      session.exitVehicle(
        {
          playerState,
          vehicleId: session.getVehicleId() ?? '',
          position: playerState.position.clone(),
          setPosition: (p) => {
            playerState.position.copy(p);
          },
          input: createPlayerInput() as any,
          cameraController: createCameraController() as any,
          hudSystem: hud,
        },
        { allowEject: true, reason: 'input' },
      ).exited,
  });

  // PlayerInput.consumeVehicleBoardOrSeatSwap: swap first, then board/exit.
  const pressF = (): boolean =>
    factory.trySwapSeat() || (session.isInVehicle() ? factory.tryExit() : factory.tryBoardNearest());

  const pressE = (): void => vehicleController.handleEnterExitVehicle(playerState);

  return { factory, session, proximityChecker, playerState, tank, pressF, pressE };
}

function primePrompt(h: Harness): void {
  h.playerState.position.copy(h.tank.getPosition()).add(new THREE.Vector3(1, 0, 0));
  h.proximityChecker.checkPlayerProximity();
}

describe('tank exit + seat-swap routing (2026-06-28 owner playtest bug)', () => {
  it('REPRO: F only swaps seats on a two-seat tank — it never dismounts the player', async () => {
    const h = await buildHarness(new THREE.Vector3(10, 0, 10));

    primePrompt(h);
    expect(h.pressF()).toBe(true); // board
    expect(h.session.isInVehicle()).toBe(true);
    expect(h.tank.getPilotId()).toBe('player');

    // Hammer F. Every press swaps driver<->gunner; the player is NEVER
    // returned to infantry, because the seat-swap consumes F before the
    // exit fallback can run. This is the bug the owner hit.
    for (let i = 0; i < 6; i++) {
      expect(h.pressF()).toBe(true);
      expect(h.session.isInVehicle()).toBe(true);
    }
    // Still trapped in the tank — F alone can't get you out.
    expect(h.session.isInVehicle()).toBe(true);
  });

  it('FIX: E dismounts the seated tank and ejects the player to the side of the hull', async () => {
    const h = await buildHarness(new THREE.Vector3(10, 0, 10));

    primePrompt(h);
    expect(h.pressF()).toBe(true); // board
    expect(h.session.isInVehicle()).toBe(true);

    const chassis = h.tank.getPosition().clone();

    h.pressE();

    // Player is back on foot.
    expect(h.session.isInVehicle()).toBe(false);
    expect(h.tank.getPilotId()).toBeNull();

    // Ejected to the side of the hull (clear of the chassis center on the
    // horizontal plane), not left inside / under the tank.
    const horizontalOffset = new THREE.Vector2(
      h.playerState.position.x - chassis.x,
      h.playerState.position.z - chassis.z,
    ).length();
    expect(horizontalOffset).toBeGreaterThanOrEqual(2.5);
  });

  it('FIX: E dismounts from the GUNNER station too (after an F swap)', async () => {
    const h = await buildHarness(new THREE.Vector3(10, 0, 10));

    primePrompt(h);
    expect(h.pressF()).toBe(true); // board (driver)
    expect(h.pressF()).toBe(true); // swap to gunner
    expect(h.tank.getSeats().find((s) => s.role === 'gunner')?.occupantId).toBe('player');

    h.pressE();

    expect(h.session.isInVehicle()).toBe(false);
    // Both crew seats freed so an NPC can re-crew the chassis.
    expect(h.tank.getPilotId()).toBeNull();
    expect(h.tank.getSeats().every((s) => s.occupantId !== 'player')).toBe(true);
  });

  it('F still swaps the driver<->gunner seat while seated (seat-swap preserved)', async () => {
    const h = await buildHarness(new THREE.Vector3(10, 0, 10));

    primePrompt(h);
    expect(h.pressF()).toBe(true); // board at driver hatch
    expect(h.tank.getPilotId()).toBe('player');

    // F swaps to the gunner station.
    expect(h.pressF()).toBe(true);
    expect(h.tank.getPilotId()).toBeNull();
    expect(h.tank.getSeats().find((s) => s.role === 'gunner')?.occupantId).toBe('player');

    // F swaps back to the driver hatch.
    expect(h.pressF()).toBe(true);
    expect(h.tank.getPilotId()).toBe('player');
  });

  it('E is a no-op on foot (falls through to the enter-aircraft attempt without exiting)', async () => {
    const h = await buildHarness(new THREE.Vector3(10, 0, 10));

    // Not in any vehicle: pressing E must not throw and must leave the
    // player on foot (requestVehicleExit returns false -> enter fallback).
    expect(h.session.isInVehicle()).toBe(false);
    h.pressE();
    expect(h.session.isInVehicle()).toBe(false);
  });
});
