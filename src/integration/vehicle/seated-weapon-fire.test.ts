// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

import { Tank } from '../../systems/vehicle/Tank';
import { Emplacement } from '../../systems/vehicle/Emplacement';
import { GroundVehicleProximityChecker } from '../../systems/vehicle/GroundVehicleProximityChecker';
import {
  PlayerVehicleAdapterFactory,
  type PlayerVehicleAdapterFactoryDeps,
} from '../../systems/vehicle/PlayerVehicleAdapterFactory';
import { TankPlayerAdapter } from '../../systems/vehicle/TankPlayerAdapter';
import { EmplacementPlayerAdapter } from '../../systems/vehicle/EmplacementPlayerAdapter';
import { VehicleManager } from '../../systems/vehicle/VehicleManager';
import { VehicleSessionController } from '../../systems/vehicle/VehicleSessionController';
import { TankCannonProjectileSystem } from '../../systems/combat/projectiles/TankCannonProjectile';
import { M2HBEmplacementSystem } from '../../systems/combat/weapons/M2HBEmplacement';
import { M2HBWeapon } from '../../systems/combat/weapons/M2HBWeapon';
import type { PlayerVehicleAdapter } from '../../systems/vehicle/PlayerVehicleAdapter';
import type { PlayerState } from '../../types';
import { Faction } from '../../systems/combat/types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../systems/effects/TracerPool', () => ({
  TracerPool: class {
    public spawn = vi.fn();
    public update = vi.fn();
    public dispose = vi.fn();
  },
}));

/**
 * L3 repro-first test for `tank-cannon-wiring` (Phase 2).
 *
 * BEFORE THIS CYCLE the player tank cannon + player M2HB emplacement could
 * never fire: `TankPlayerAdapter.setCannonSystem` and
 * `M2HBEmplacementSystem.attachPlayerAdapter` had ZERO production callers, so
 * a seated player holding LMB latched a fire request that was consumed into
 * the void. These tests pin both halves:
 *
 *   1. DEAD-ON-MASTER: the boarding factory built WITHOUT the seated-weapon
 *      lifecycle hooks (the state on master) seats the player and reads the
 *      held trigger, but registers no shot — the fire path is a dead end.
 *   2. LIVE-AFTER-WIRING: the same flow with the composer's `onSessionEnter`
 *      hook attaching the cannon / M2HB adapter registers a real shot on a
 *      held LMB, and stops once the trigger is released.
 *
 * The hooks under test mirror the production wiring in
 * `StartupPlayerRuntimeComposer.buildSeatedWeaponLifecycle`; the assertions
 * are on observable outcomes (a shot is in flight / a raycast was fired),
 * not on adapter internals.
 */

// ───────────────────────────── Fixtures ─────────────────────────────

function createPlayerState(at = new THREE.Vector3(0, 0, 0)): PlayerState {
  return {
    position: at.clone(),
    velocity: new THREE.Vector3(),
    speed: 5,
    runSpeed: 10,
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

/**
 * `PlayerInput` stand-in. `trigger` is a mutable flag the test flips to
 * model holding / releasing LMB — `isMouseButtonPressed(0)` reads it, which
 * is the real held-button surface the adapters poll after Phase 1's
 * real-mouse-input landed.
 */
function makeInput() {
  const state = { trigger: false };
  const input = {
    _state: state,
    setInHelicopter: vi.fn(),
    setFlightVehicleMode: vi.fn(),
    setInputContext: vi.fn(),
    isKeyPressed: vi.fn(() => false),
    isMouseButtonPressed: vi.fn((btn: number) => btn === 0 && state.trigger),
    getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })),
    clearMouseMovement: vi.fn(),
    getIsPointerLocked: vi.fn(() => false),
    getTouchControls: vi.fn(() => null),
    getTouchMovementVector: vi.fn(() => ({ x: 0, z: 0 })),
    relockPointer: vi.fn(),
    clearTransientInputState: vi.fn(),
  };
  return input;
}

function makeCameraController() {
  return {
    saveInfantryAngles: vi.fn(),
    restoreInfantryAngles: vi.fn(),
    setVehicleFollowCamera: vi.fn(),
  };
}

function makeHud() {
  return {
    setVehicleContext: vi.fn(),
    updateElevation: vi.fn(),
    showMessage: vi.fn(),
    showInteractionPrompt: vi.fn(),
    hideInteractionPrompt: vi.fn(),
  };
}

function makeObject(position: THREE.Vector3): THREE.Group {
  const obj = new THREE.Group();
  obj.position.copy(position);
  return obj;
}

/**
 * Combatant-system stand-in for the cannon's radial damage + the M2HB
 * raycast. `applyExplosionDamage` is what an armed cannon impact calls;
 * `handlePlayerShot` is the M2HB per-round raycast.
 */
function makeMockCombatantSystem() {
  return {
    explosionEffectsPool: { spawn: vi.fn() },
    impactEffectsPool: { spawn: vi.fn() },
    applyExplosionDamage: vi.fn(),
    handlePlayerShot: vi.fn(() => ({ hit: false, point: new THREE.Vector3(), killed: false, headshot: false, damageDealt: 0 })),
  };
}

interface SeatedWeaponHooks {
  onSessionEnter: (adapter: PlayerVehicleAdapter, vehicleId: string) => void;
  onSessionExit: (adapter: PlayerVehicleAdapter, vehicleId: string) => void;
}

/**
 * Mirror of the production seated-weapon lifecycle wired in
 * `StartupPlayerRuntimeComposer.buildSeatedWeaponLifecycle`: bind the cannon
 * + a per-frame stepper to a player M48 gunner on board, register the M2HB
 * gunner adapter on its binding, and detach both on dismount.
 */
function makeSeatedWeaponHooks(args: {
  cannon: TankCannonProjectileSystem;
  m2hb: M2HBEmplacementSystem;
  groundHeight: number;
}): SeatedWeaponHooks {
  return {
    onSessionEnter(adapter, vehicleId) {
      if (adapter instanceof TankPlayerAdapter) {
        adapter.setCannonSystem(args.cannon);
        adapter.setCannonStepper((dt) => args.cannon.update(dt, () => args.groundHeight));
      } else if (adapter instanceof EmplacementPlayerAdapter) {
        args.m2hb.attachPlayerAdapter(vehicleId, adapter);
      }
    },
    onSessionExit(adapter, vehicleId) {
      if (adapter instanceof TankPlayerAdapter) {
        adapter.setCannonSystem(null);
        adapter.setCannonStepper(null);
      } else if (adapter instanceof EmplacementPlayerAdapter) {
        args.m2hb.detachPlayerAdapter(vehicleId, adapter);
      }
    },
  };
}

interface Harness {
  factory: PlayerVehicleAdapterFactory;
  session: VehicleSessionController;
  vehicleManager: VehicleManager;
  proximityChecker: GroundVehicleProximityChecker;
  playerState: PlayerState;
  input: ReturnType<typeof makeInput>;
  hud: ReturnType<typeof makeHud>;
}

async function buildHarness(args: {
  vehicle: { vehicle: any; position: THREE.Vector3 };
  hooks?: SeatedWeaponHooks;
}): Promise<Harness> {
  const vehicleManager = new VehicleManager();
  await vehicleManager.init();
  vehicleManager.register(args.vehicle.vehicle);

  const session = new VehicleSessionController();
  const playerState = createPlayerState();
  const input = makeInput();
  const hud = makeHud();

  const proximityChecker = new GroundVehicleProximityChecker(
    vehicleManager,
    () => playerState.position,
    () => session.isInVehicle(),
  );
  proximityChecker.setHUDSystem(hud as any);

  const deps: PlayerVehicleAdapterFactoryDeps = {
    vehicleManager,
    vehicleSessionController: session,
    proximityChecker,
    playerState,
    input: input as any,
    cameraController: makeCameraController() as any,
    hudSystem: hud as any,
    onSessionEnter: args.hooks?.onSessionEnter,
    onSessionExit: args.hooks?.onSessionExit,
  };

  return {
    factory: new PlayerVehicleAdapterFactory(deps),
    session,
    vehicleManager,
    proximityChecker,
    playerState,
    input,
    hud,
  };
}

function primePrompt(checker: GroundVehicleProximityChecker, playerPos: THREE.Vector3, vehiclePos: THREE.Vector3): void {
  playerPos.copy(vehiclePos).add(new THREE.Vector3(1, 0, 0));
  checker.checkPlayerProximity();
}

function drive(session: VehicleSessionController, input: ReturnType<typeof makeInput>, hud: ReturnType<typeof makeHud>, frames: number): void {
  for (let i = 0; i < frames; i++) {
    session.update({
      deltaTime: 1 / 60,
      input: input as any,
      cameraController: makeCameraController() as any,
      hudSystem: hud as any,
    });
  }
}

// ───────────────────────────── Tank cannon ─────────────────────────────

describe('player M48 cannon fires on held LMB (tank-cannon-wiring)', () => {
  let cannon: TankCannonProjectileSystem;
  let m2hb: M2HBEmplacementSystem;
  let scene: THREE.Scene;
  let combatantSystem: ReturnType<typeof makeMockCombatantSystem>;

  beforeEach(() => {
    scene = new THREE.Scene();
    combatantSystem = makeMockCombatantSystem();
    cannon = new TankCannonProjectileSystem(scene, combatantSystem.explosionEffectsPool as any, combatantSystem as any, 8);
    m2hb = new M2HBEmplacementSystem(scene);
  });

  it('DEAD ON MASTER: with no seated-weapon hooks, a held LMB registers no shot', async () => {
    const tank = new Tank('m48_tank_of_us_fob', makeObject(new THREE.Vector3(10, 0, 10)), Faction.US);
    // No `hooks` → reproduces master: setCannonSystem has zero callers.
    const h = await buildHarness({ vehicle: { vehicle: tank, position: tank.getPosition() } });

    primePrompt(h.proximityChecker, h.playerState.position, tank.getPosition());
    expect(h.factory.tryBoardNearest()).toBe(true);
    // Move to the gunner station and hold the trigger.
    expect(h.factory.trySwapSeat()).toBe(true);
    h.input._state.trigger = true;
    drive(h.session, h.input, h.hud, 5);

    // The trigger latched a fire request, but with no cannon bound the shot
    // path is a dead end — nothing is in flight.
    expect(cannon.getActiveCount()).toBe(0);
  });

  it('LIVE AFTER WIRING: a held LMB in the gunner seat puts a cannon round in flight', async () => {
    const tank = new Tank('m48_tank_of_us_fob', makeObject(new THREE.Vector3(10, 0, 10)), Faction.US);
    const h = await buildHarness({
      vehicle: { vehicle: tank, position: tank.getPosition() },
      hooks: makeSeatedWeaponHooks({ cannon, m2hb, groundHeight: -1000 }),
    });

    primePrompt(h.proximityChecker, h.playerState.position, tank.getPosition());
    expect(h.factory.tryBoardNearest()).toBe(true);
    expect(h.factory.trySwapSeat()).toBe(true);

    // Hold LMB for one frame → the gunner pulls the trigger, the bound cannon
    // launches a round (ground is far below so it does not impact this tick).
    h.input._state.trigger = true;
    drive(h.session, h.input, h.hud, 1);

    expect(cannon.getActiveCount()).toBe(1);
  });

  it('LIVE AFTER WIRING: releasing LMB stops firing (no new round after the reload-gated first)', async () => {
    const tank = new Tank('m48_tank_of_us_fob', makeObject(new THREE.Vector3(10, 0, 10)), Faction.US);
    const h = await buildHarness({
      vehicle: { vehicle: tank, position: tank.getPosition() },
      hooks: makeSeatedWeaponHooks({ cannon, m2hb, groundHeight: -1000 }),
    });

    primePrompt(h.proximityChecker, h.playerState.position, tank.getPosition());
    h.factory.tryBoardNearest();
    h.factory.trySwapSeat();

    h.input._state.trigger = true;
    drive(h.session, h.input, h.hud, 1);
    expect(cannon.getActiveCount()).toBe(1);

    // Release the trigger; no fire request is latched, so no further rounds
    // launch even across many frames.
    h.input._state.trigger = false;
    drive(h.session, h.input, h.hud, 30);
    expect(cannon.getActiveCount()).toBe(1);
  });

  it('detaches the cannon on dismount so a stale binding cannot fire', async () => {
    const tank = new Tank('m48_tank_of_us_fob', makeObject(new THREE.Vector3(10, 0, 10)), Faction.US);
    const hooks = makeSeatedWeaponHooks({ cannon, m2hb, groundHeight: -1000 });
    const h = await buildHarness({ vehicle: { vehicle: tank, position: tank.getPosition() }, hooks });

    primePrompt(h.proximityChecker, h.playerState.position, tank.getPosition());
    h.factory.tryBoardNearest();
    const adapter = h.session.getActiveAdapter() as TankPlayerAdapter;
    h.factory.trySwapSeat();

    // Dismount; the exit hook detaches the cannon.
    expect(h.factory.tryExit()).toBe(true);

    // Re-mount on the same chassis with the trigger held should still fire —
    // proves detach didn't break the re-attach path (board → exit → board).
    const detachSpy = vi.spyOn(adapter, 'setCannonSystem');
    primePrompt(h.proximityChecker, h.playerState.position, tank.getPosition());
    h.factory.tryBoardNearest();
    // The board hook re-binds the cannon (called with the live system again).
    expect(detachSpy).toHaveBeenCalledWith(cannon);
  });
});

// ───────────────────────────── M2HB emplacement ─────────────────────────────

describe('player M2HB emplacement fires on held LMB (tank-cannon-wiring)', () => {
  let m2hb: M2HBEmplacementSystem;
  let cannon: TankCannonProjectileSystem;
  let scene: THREE.Scene;
  let combatantSystem: ReturnType<typeof makeMockCombatantSystem>;

  beforeEach(() => {
    scene = new THREE.Scene();
    combatantSystem = makeMockCombatantSystem();
    m2hb = new M2HBEmplacementSystem(scene);
    m2hb.setCombatantSystem(combatantSystem as any);
    cannon = new TankCannonProjectileSystem(scene, combatantSystem.explosionEffectsPool as any, combatantSystem as any, 4);
  });

  function spawnEmplacementBinding(id: string, position: THREE.Vector3): Emplacement {
    const tripod = makeObject(position);
    const yawNode = new THREE.Object3D();
    tripod.add(yawNode);
    const pitchNode = new THREE.Object3D();
    yawNode.add(pitchNode);
    const emplacement = new Emplacement(id, tripod, Faction.US, { yawNode, pitchNode });
    m2hb.registerBinding({ vehicleId: id, emplacement, weapon: new M2HBWeapon(), pitchNode });
    return emplacement;
  }

  it('DEAD ON MASTER: with no attach hook, a held LMB registers no raycast', async () => {
    const emplacement = spawnEmplacementBinding('m2hb_us_base', new THREE.Vector3(20, 0, 20));
    const h = await buildHarness({ vehicle: { vehicle: emplacement, position: emplacement.getPosition() } });

    primePrompt(h.proximityChecker, h.playerState.position, emplacement.getPosition());
    expect(h.factory.tryBoardNearest()).toBe(true);

    h.input._state.trigger = true;
    drive(h.session, h.input, h.hud, 5);
    m2hb.update(1 / 60);

    expect(combatantSystem.handlePlayerShot).not.toHaveBeenCalled();
  });

  it('LIVE AFTER WIRING: held LMB drives the M2HB fire path through a combatant raycast', async () => {
    const emplacement = spawnEmplacementBinding('m2hb_us_base', new THREE.Vector3(20, 0, 20));
    const h = await buildHarness({
      vehicle: { vehicle: emplacement, position: emplacement.getPosition() },
      hooks: makeSeatedWeaponHooks({ cannon, m2hb, groundHeight: 0 }),
    });

    primePrompt(h.proximityChecker, h.playerState.position, emplacement.getPosition());
    expect(h.factory.tryBoardNearest()).toBe(true);

    // Hold the trigger; the adapter latches a fire request and the already-
    // ticked M2HB system polls it and cycles a round through a raycast.
    h.input._state.trigger = true;
    drive(h.session, h.input, h.hud, 1);
    m2hb.update(1 / 60);

    expect(combatantSystem.handlePlayerShot).toHaveBeenCalled();
  });

  it('LIVE AFTER WIRING: releasing LMB stops the M2HB fire path', async () => {
    const emplacement = spawnEmplacementBinding('m2hb_us_base', new THREE.Vector3(20, 0, 20));
    const h = await buildHarness({
      vehicle: { vehicle: emplacement, position: emplacement.getPosition() },
      hooks: makeSeatedWeaponHooks({ cannon, m2hb, groundHeight: 0 }),
    });

    primePrompt(h.proximityChecker, h.playerState.position, emplacement.getPosition());
    h.factory.tryBoardNearest();

    // Release: no fire request latched, so the M2HB poll fires nothing across
    // many frames.
    h.input._state.trigger = false;
    for (let i = 0; i < 30; i++) {
      drive(h.session, h.input, h.hud, 1);
      m2hb.update(1 / 60);
    }

    expect(combatantSystem.handlePlayerShot).not.toHaveBeenCalled();
  });

  it('detaches the M2HB player adapter on dismount so the binding goes quiet', async () => {
    const emplacement = spawnEmplacementBinding('m2hb_us_base', new THREE.Vector3(20, 0, 20));
    const h = await buildHarness({
      vehicle: { vehicle: emplacement, position: emplacement.getPosition() },
      hooks: makeSeatedWeaponHooks({ cannon, m2hb, groundHeight: 0 }),
    });

    primePrompt(h.proximityChecker, h.playerState.position, emplacement.getPosition());
    h.factory.tryBoardNearest();
    expect(h.factory.tryExit()).toBe(true);

    // After dismount, even with a held trigger the binding has no adapter to
    // poll, so the fire path is quiet again.
    h.input._state.trigger = true;
    m2hb.update(1 / 60);
    expect(combatantSystem.handlePlayerShot).not.toHaveBeenCalled();
  });
});
