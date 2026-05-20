import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

import { GroundVehicle } from '../../systems/vehicle/GroundVehicle';
import {
  GroundVehiclePlayerAdapter,
  type IGroundVehicleModel,
} from '../../systems/vehicle/GroundVehiclePlayerAdapter';
import { VehicleManager } from '../../systems/vehicle/VehicleManager';
import { VehicleSessionController } from '../../systems/vehicle/VehicleSessionController';
import {
  GroundVehicleProximityChecker,
  PROMPT_RADIUS_M,
} from '../../systems/vehicle/GroundVehicleProximityChecker';
import type {
  VehicleTransitionContext,
  VehicleUpdateContext,
} from '../../systems/vehicle/PlayerVehicleAdapter';
import type { PlayerState } from '../../types';
import type { IHUDSystem, ITerrainRuntime } from '../../types/SystemInterfaces';
import { Faction } from '../../systems/combat/types';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * L3 scenario test for the M151 jeep player-boarding wire-up
 * (cycle-vekhikl-player-boarding-wire, task vekhikl-board-ground-adapter-wire).
 *
 * Wires the REAL primitives already on master (GroundVehicle,
 * GroundVehiclePlayerAdapter, VehicleSessionController, VehicleManager,
 * GroundVehicleProximityChecker) plus an inline test harness that
 * satisfies the not-yet-merged sibling factory's `tryBoardNearest` /
 * `tryExit` contract (per the brief: include the factory wire inline as
 * part of the harness setup, do NOT duplicate the factory implementation).
 * When `PlayerVehicleAdapterFactory` lands, the same five assertions can
 * rebind to its surface without touching behavior.
 *
 * Behavior-only — no implementation-mirror assertions on internal phase
 * names, smoothing constants, or specific magnitudes.
 */

// ───────────────────────────── Test harness ─────────────────────────────

function createTestPlayerInput(pressed: Set<string>) {
  return {
    setInHelicopter: vi.fn(),
    setFlightVehicleMode: vi.fn(),
    setInputContext: vi.fn(),
    isKeyPressed: vi.fn((key: string) => pressed.has(key.toLowerCase())),
    getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })),
    clearMouseMovement: vi.fn(),
    getIsPointerLocked: vi.fn(() => false),
    getTouchControls: vi.fn(() => null),
    getTouchMovementVector: vi.fn(() => ({ x: 0, z: 0 })),
    relockPointer: vi.fn(),
    clearTransientInputState: vi.fn(),
  };
}

function createTestPlayerState(spawn: THREE.Vector3): PlayerState {
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

function createTestHud() {
  const hud = {
    showInteractionPrompt: vi.fn(),
    hideInteractionPrompt: vi.fn(),
    setVehicleContext: vi.fn(),
    updateElevation: vi.fn(),
    showMessage: vi.fn(),
  };
  return hud as unknown as IHUDSystem & typeof hud;
}

function createTestCameraController() {
  return {
    saveInfantryAngles: vi.fn(),
    restoreInfantryAngles: vi.fn(),
  } as any;
}

/**
 * Flat-ground terrain stub. Without one, the chassis goes airborne after
 * the first integration step and engine drive falls to zero (the physics
 * gates `driveMag` on `isGrounded`). A flat infinite plane is the simplest
 * production-shape terrain that lets the "drive 3 m" assertion run.
 */
function createFlatTerrainStub(groundY: number, halfExtent: number): ITerrainRuntime {
  const stub: Partial<ITerrainRuntime> = {
    getHeightAt: () => groundY,
    getEffectiveHeightAt: () => groundY,
    getSlopeAt: () => 0,
    getNormalAt: (_x, _z, target) => {
      const v = target ?? new THREE.Vector3();
      v.set(0, 1, 0);
      return v;
    },
    getPlayableWorldSize: () => halfExtent * 2,
    getWorldSize: () => halfExtent * 2,
    isTerrainReady: () => true,
    hasTerrainAt: () => true,
    getActiveTerrainTileCount: () => 1,
    setSurfaceWetness: () => {},
    updatePlayerPosition: () => {},
    registerCollisionObject: () => {},
    unregisterCollisionObject: () => {},
    raycastTerrain: () => ({ hit: false }),
  };
  return stub as ITerrainRuntime;
}

/** Bridges real GroundVehicle into the adapter's IGroundVehicleModel surface. */
function createGroundModel(vehicle: GroundVehicle): IGroundVehicleModel {
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
    setEngineActive(_id, active) {
      vehicle.setEngineActive(active);
    },
    // No model-supplied exit plan: the adapter's +X-side fallback eject is
    // exactly what the "beside the chassis" assertion checks.
    getPlayerExitPlan: undefined,
  };
}

/**
 * Inline harness satisfying the sibling factory's `tryBoardNearest` /
 * `tryExit` contract. Resolves the nearest drivable ground vehicle inside
 * PROMPT_RADIUS_M (the same lookup the proximity checker uses to drive the
 * HUD prompt), then dispatches through `VehicleSessionController`.
 */
function makeBoardingHarness(args: {
  vehicleManager: VehicleManager;
  session: VehicleSessionController;
  adapter: GroundVehiclePlayerAdapter;
  playerState: PlayerState;
  input: ReturnType<typeof createTestPlayerInput>;
  camera: ReturnType<typeof createTestCameraController>;
  hud: ReturnType<typeof createTestHud>;
}) {
  args.session.registerAdapter(args.adapter);

  function buildCtx(): VehicleTransitionContext {
    return {
      playerState: args.playerState,
      vehicleId: args.session.getVehicleId() ?? '',
      position: args.playerState.position.clone(),
      setPosition: (p, _reason) => {
        args.playerState.position.copy(p);
      },
      input: args.input as any,
      cameraController: args.camera,
      hudSystem: args.hud,
    };
  }

  function findNearestGroundVehicle(): GroundVehicle | null {
    const candidates = args.vehicleManager.getVehiclesInRadius(
      args.playerState.position,
      PROMPT_RADIUS_M,
    );
    let best: GroundVehicle | null = null;
    let bestDistSq = Infinity;
    for (const v of candidates) {
      if (v.category !== 'ground') continue;
      if (v.isDestroyed()) continue;
      if (!(v instanceof GroundVehicle)) continue;
      const pos = v.getPosition();
      const dx = pos.x - args.playerState.position.x;
      const dz = pos.z - args.playerState.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = v;
      }
    }
    return best;
  }

  return {
    tryBoardNearest(): boolean {
      const target = findNearestGroundVehicle();
      if (!target) return false;
      const seatIndex = target.enterVehicle('player', 'pilot');
      if (seatIndex === null) return false;
      const ctx: VehicleTransitionContext = {
        ...buildCtx(),
        vehicleId: target.vehicleId,
        position: target.getPosition(),
      };
      return args.session.enterVehicle('ground', target.vehicleId, ctx);
    },
    tryExit(): boolean {
      const vehicleId = args.session.getVehicleId();
      if (!vehicleId) return false;
      const vehicle = args.vehicleManager.getVehicle(vehicleId);
      const ctx = buildCtx();
      const result = args.session.exitVehicle(ctx, { reason: 'input' });
      if (result.exited && vehicle && vehicle instanceof GroundVehicle) {
        vehicle.exitVehicle('player');
      }
      return result.exited;
    },
    buildUpdateCtx(): VehicleUpdateContext {
      return {
        deltaTime: 1 / 60,
        input: args.input as any,
        cameraController: args.camera,
        hudSystem: args.hud,
      };
    },
  };
}

// ───────────────────────────── Tests ─────────────────────────────

describe('M151 jeep player boarding (L3 end-to-end)', () => {
  let jeepObject: THREE.Group;
  let jeep: GroundVehicle;
  let vehicleManager: VehicleManager;
  let session: VehicleSessionController;
  let adapter: GroundVehiclePlayerAdapter;
  let playerState: PlayerState;
  let pressed: Set<string>;
  let input: ReturnType<typeof createTestPlayerInput>;
  let camera: ReturnType<typeof createTestCameraController>;
  let hud: ReturnType<typeof createTestHud>;
  let proximityChecker: GroundVehicleProximityChecker;
  let harness: ReturnType<typeof makeBoardingHarness>;

  const SPAWN = new THREE.Vector3(40, 1, 60);

  beforeEach(async () => {
    jeepObject = new THREE.Group();
    jeepObject.position.copy(SPAWN);

    jeep = new GroundVehicle('motor_pool_small_m151', jeepObject, Faction.US);
    jeep.setTerrain(createFlatTerrainStub(SPAWN.y - 0.45, 1024));

    vehicleManager = new VehicleManager();
    await vehicleManager.init();
    vehicleManager.register(jeep);

    session = new VehicleSessionController();
    adapter = new GroundVehiclePlayerAdapter(createGroundModel(jeep));

    playerState = createTestPlayerState(SPAWN.clone().add(new THREE.Vector3(1, 0, 0)));
    pressed = new Set<string>();
    input = createTestPlayerInput(pressed);
    camera = createTestCameraController();
    hud = createTestHud();

    proximityChecker = new GroundVehicleProximityChecker(
      vehicleManager,
      () => playerState.position,
      () => session.isInVehicle(),
    );
    proximityChecker.setHUDSystem(hud);

    harness = makeBoardingHarness({
      vehicleManager,
      session,
      adapter,
      playerState,
      input,
      camera,
      hud,
    });
  });

  it('seats the player and tracks the active jeep when boarding from proximity', () => {
    proximityChecker.checkPlayerProximity();
    expect(hud.showInteractionPrompt).toHaveBeenCalledWith('Press F to board M151 Jeep');
    expect(session.isInVehicle()).toBe(false);

    const boarded = harness.tryBoardNearest();

    expect(boarded).toBe(true);
    expect(session.isInVehicle()).toBe(true);
    expect(session.getVehicleType()).toBe('ground');
    expect(session.getVehicleId()).toBe('motor_pool_small_m151');
    expect(adapter.getActiveVehicleId()).toBe('motor_pool_small_m151');
    expect(adapter.getActivePhysics()).toBe(jeep.getPhysics());
    expect(jeep.getPilotId()).toBe('player');
  });

  it('propagates W as forward throttle into the jeep physics through the adapter', () => {
    harness.tryBoardNearest();

    pressed.add('keyw');
    session.update(harness.buildUpdateCtx());
    expect(jeep.getPhysics().getControls().throttle).toBe(1);
    expect(jeep.getPhysics().getControls().brake).toBe(0);

    pressed.clear();
    pressed.add('space');
    session.update(harness.buildUpdateCtx());
    expect(jeep.getPhysics().getControls().throttle).toBe(0);
    expect(jeep.getPhysics().getControls().brake).toBe(1);
  });

  it('drives forward at least 3 m under sustained W throttle', () => {
    harness.tryBoardNearest();
    const startX = jeep.getPosition().x;
    const startZ = jeep.getPosition().z;

    pressed.add('keyw');
    // Step ~3 s at 60 Hz: adapter forwards input each frame, GroundVehicle
    // owns its physics step against the flat terrain stub.
    for (let frame = 0; frame < 180; frame += 1) {
      session.update(harness.buildUpdateCtx());
      jeep.update(1 / 60);
    }

    const endPos = jeep.getPosition();
    const travelled = Math.hypot(endPos.x - startX, endPos.z - startZ);
    expect(travelled).toBeGreaterThanOrEqual(3);
    expect(jeep.getPhysics().getGroundSpeed()).toBeGreaterThan(0);
  });

  it('ejects the player beside the chassis on exit (never under it)', () => {
    harness.tryBoardNearest();

    // Drive a bit so the chassis has moved off the boarding point.
    pressed.add('keyw');
    for (let frame = 0; frame < 60; frame += 1) {
      session.update(harness.buildUpdateCtx());
      jeep.update(1 / 60);
    }
    pressed.clear();

    const chassisAtExit = jeep.getPosition();
    const exited = harness.tryExit();

    expect(exited).toBe(true);
    expect(session.isInVehicle()).toBe(false);
    expect(adapter.getActiveVehicleId()).toBeNull();
    // Player must not be inside the chassis footprint (~1 m half-width on
    // the M151). The adapter's default exit plan lands the player ~2 m off
    // the +X side of the chassis.
    const dx = playerState.position.x - chassisAtExit.x;
    const dz = playerState.position.z - chassisAtExit.z;
    expect(Math.hypot(dx, dz)).toBeGreaterThan(1);
    expect(jeep.getPilotId()).toBeNull();
  });

  it('hides the proximity prompt on entry and re-shows it on exit if still within 6 m', () => {
    proximityChecker.checkPlayerProximity();
    expect(hud.showInteractionPrompt).toHaveBeenCalledTimes(1);
    expect(hud.hideInteractionPrompt).not.toHaveBeenCalled();

    harness.tryBoardNearest();
    proximityChecker.checkPlayerProximity();
    expect(hud.hideInteractionPrompt).toHaveBeenCalledTimes(1);

    harness.tryExit();
    // Adapter's exit anchor lands ~2 m +X of the chassis, inside 6 m.
    expect(playerState.position.distanceTo(jeep.getPosition())).toBeLessThan(PROMPT_RADIUS_M);

    proximityChecker.checkPlayerProximity();
    expect(hud.showInteractionPrompt).toHaveBeenCalledTimes(2);
    expect(hud.showInteractionPrompt).toHaveBeenLastCalledWith(
      'Press F to board M151 Jeep',
    );
  });
});
