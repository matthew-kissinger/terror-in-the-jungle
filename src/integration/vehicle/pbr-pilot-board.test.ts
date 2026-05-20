import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PBR } from '../../systems/vehicle/PBR';
import { PBR_SCENARIO_SPAWNS } from '../../systems/vehicle/PBRSpawn';
import {
  WatercraftPlayerAdapter,
  type WatercraftIVehicle,
} from '../../systems/vehicle/WatercraftPlayerAdapter';
import type {
  VehicleTransitionContext,
  VehicleUpdateContext,
} from '../../systems/vehicle/PlayerVehicleAdapter';
import type { PlayerState } from '../../types';
import type { BuoyancySamplerLike } from '../../systems/environment/water/BuoyancyForce';
import type {
  WaterInteractionOptions,
  WaterInteractionSample,
} from '../../systems/environment/water/WaterSurfaceSampler';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

/**
 * L3 integration test for the PBR pilot-seat boarding wire
 * (cycle-vekhikl-player-boarding-wire, task
 * vekhikl-board-watercraft-and-emplacement-wire).
 *
 * Scope (per brief): PILOT SEAT ONLY via WatercraftPlayerAdapter. The
 * twin M2HB mounts on the PBR are NOT wired this cycle — gunner-seat
 * swaps land in the owner-gated cycle-vekhikl-seat-swaps follow-up.
 *
 * Sibling factory + F-key router PRs are not yet on master, so the
 * boarding round-trip uses an inline harness mirroring m48-board.test.ts.
 *
 * NOTE on adapter binding: WatercraftPlayerAdapter consumes the
 * WatercraftIVehicle structural surface (direct position/quaternion
 * accessors + setControls/getForwardSpeed/isGrounded). The PBR's
 * IVehicle surface exposes getPosition()/getQuaternion() instead, so
 * the test adapts it inline. When the per-category factory lands it
 * will own this adaptation centrally; this test demonstrates the
 * contract the factory needs to satisfy.
 */

const DEFAULT_IMMERSION_DEPTH_METERS = 1.6;

function makeFlatWater(surfaceY = 0): BuoyancySamplerLike {
  return {
    sampleWaterInteraction(
      position: THREE.Vector3,
      options?: WaterInteractionOptions,
    ): WaterInteractionSample {
      const depth = Math.max(0, surfaceY - position.y);
      const immersionDepth = options?.immersionDepthMeters
        && options.immersionDepthMeters > 0.01
        ? options.immersionDepthMeters
        : DEFAULT_IMMERSION_DEPTH_METERS;
      const immersion01 = Math.min(1, depth / immersionDepth);
      return {
        source: depth > 0 ? 'global' : 'none',
        surfaceY: depth > 0 ? surfaceY : null,
        depth,
        submerged: depth > 0,
        immersion01,
        buoyancyScalar: immersion01,
        flowVelocity: new THREE.Vector3(),
      };
    },
  };
}

function makeFlatTerrain(height = -200): ITerrainRuntime {
  return {
    getHeightAt: () => height,
    getEffectiveHeightAt: () => height,
    getSlopeAt: () => 0,
    getNormalAt: (_x, _z, target) => {
      const v = target ?? new THREE.Vector3();
      return v.set(0, 1, 0);
    },
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

function createPlayerState(at = new THREE.Vector3(0, 1, 0)): PlayerState {
  return {
    position: at.clone(),
    velocity: new THREE.Vector3(3, 4, 2),
    speed: 5, runSpeed: 10, isRunning: true, isGrounded: true, isJumping: false,
    jumpForce: 12, gravity: -25, isCrouching: false,
    isInHelicopter: false, helicopterId: null,
    isInFixedWing: false, fixedWingId: null,
  };
}

function makeInput(keyMap: Record<string, boolean> = {}) {
  return {
    setInHelicopter: vi.fn(), setFlightVehicleMode: vi.fn(), setInputContext: vi.fn(),
    isKeyPressed: vi.fn((k: string) => !!keyMap[k.toLowerCase()]),
    getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })),
    clearMouseMovement: vi.fn(),
    getIsPointerLocked: vi.fn(() => false),
    getTouchControls: vi.fn(() => null),
    getTouchMovementVector: vi.fn(() => ({ x: 0, z: 0 })),
    relockPointer: vi.fn(),
  };
}

function makeCtx(playerState: PlayerState, hullPosition: THREE.Vector3, vehicleId: string) {
  const input = makeInput();
  const camera = { saveInfantryAngles: vi.fn(), restoreInfantryAngles: vi.fn() };
  const hud = { setVehicleContext: vi.fn(), updateElevation: vi.fn(), showMessage: vi.fn() };
  const renderer = { setCrosshairMode: vi.fn() };
  const setPosition = vi.fn((next: THREE.Vector3) => { playerState.position.copy(next); });
  return {
    ctx: {
      playerState,
      vehicleId,
      position: hullPosition.clone(),
      setPosition,
      input: input as any,
      cameraController: camera as any,
      hudSystem: hud as any,
      gameRenderer: renderer as any,
    } as VehicleTransitionContext,
    input, camera, hud, setPosition,
  };
}

function makeUpdateCtx(input: ReturnType<typeof makeInput>): VehicleUpdateContext {
  return {
    deltaTime: 1 / 60,
    input: input as any,
    cameraController: { saveInfantryAngles: vi.fn(), restoreInfantryAngles: vi.fn() } as any,
    hudSystem: { setVehicleContext: vi.fn(), updateElevation: vi.fn(), showMessage: vi.fn() } as any,
  };
}

/**
 * Bridge the PBR IVehicle surface (getPosition / getQuaternion) into
 * WatercraftIVehicle (live position / quaternion accessors). The
 * per-category boarding factory will own this centrally when it lands.
 */
function bridgePbrToWatercraftModel(
  pbr: PBR,
  hullObject: THREE.Object3D,
): WatercraftIVehicle {
  return {
    id: pbr.vehicleId,
    // Live references so the adapter's exit-plan math sees the latest
    // hull pose without copying every frame.
    position: hullObject.position,
    quaternion: hullObject.quaternion,
    setControls: (throttle, rudder) => pbr.setControls(throttle, rudder),
    getForwardSpeed: () => pbr.getForwardSpeed(),
    update: (dt) => pbr.update(dt),
    setTerrain: (terrain) => pbr.setTerrain(terrain),
    // PBR is an open-water craft (no isGrounded on its IVehicle
    // surface). Open Frontier river spawn is afloat by intent.
    isGrounded: () => false,
  };
}

function spawnSettledPbr(): { pbr: PBR; hullObject: THREE.Object3D } {
  const spawn = PBR_SCENARIO_SPAWNS.open_frontier;
  const scene = new THREE.Scene();
  const hullObject = new THREE.Object3D();
  hullObject.position.set(spawn.position.x, 0, spawn.position.z);
  scene.add(hullObject);
  const pbr = new PBR(spawn.vehicleId, hullObject, spawn.faction);
  pbr.setWaterSampler(makeFlatWater(0));
  pbr.setTerrain(makeFlatTerrain(-200));
  for (let i = 0; i < 60; i += 1) pbr.update(1 / 60);
  return { pbr, hullObject };
}

describe('PBR pilot-seat player boarding end-to-end (Open Frontier scenario)', () => {
  let pbr: PBR;
  let hullObject: THREE.Object3D;
  let adapter: WatercraftPlayerAdapter;

  beforeEach(() => {
    ({ pbr, hullObject } = spawnSettledPbr());
    adapter = new WatercraftPlayerAdapter(bridgePbrToWatercraftModel(pbr, hullObject));
  });

  it('F-press seats the player at the pilot seat (gunner-seat swap deferred)', () => {
    const player = createPlayerState(new THREE.Vector3(0, 1, 0));
    const { ctx, camera, hud, setPosition } = makeCtx(player, pbr.getPosition(), pbr.vehicleId);

    expect(adapter.getActiveVehicleId()).toBeNull();
    adapter.onEnter(ctx);

    expect(adapter.getActiveVehicleId()).toBe(pbr.vehicleId);
    expect(adapter.playerSeat).toBe('pilot');
    expect(player.velocity.x).toBe(0);
    expect(player.velocity.y).toBe(0);
    expect(player.velocity.z).toBe(0);
    expect(player.isRunning).toBe(false);
    expect(setPosition).toHaveBeenCalledWith(ctx.position, 'watercraft.enter');
    expect(hud.setVehicleContext).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'pilot' }),
    );
    expect(camera.saveInfantryAngles).toHaveBeenCalled();
  });

  it('drives forward under sustained W throttle (positive forward speed + horizontal travel)', () => {
    const player = createPlayerState(new THREE.Vector3(0, 1, 0));
    const { ctx } = makeCtx(player, pbr.getPosition(), pbr.vehicleId);
    adapter.onEnter(ctx);

    const startPos = pbr.getPosition().clone();
    const updateCtx = makeUpdateCtx(makeInput({ keyw: true }));
    // 4 s of full throttle. Behavior-driven floor per docs/TESTING.md;
    // PBR tuning is intentionally retunable cycle-to-cycle.
    for (let i = 0; i < 240; i += 1) {
      adapter.update(updateCtx);
      pbr.update(1 / 60);
    }

    expect(pbr.getForwardSpeed()).toBeGreaterThan(0);
    const endPos = pbr.getPosition();
    const travel = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
    expect(travel).toBeGreaterThan(0.2);
  });

  it('F-press while seated exits beside the hull (in-water step) and tears the adapter down', () => {
    const player = createPlayerState(new THREE.Vector3(0, 1, 0));
    const { ctx, camera, hud } = makeCtx(player, pbr.getPosition(), pbr.vehicleId);
    adapter.onEnter(ctx);

    const driveCtx = makeUpdateCtx(makeInput({ keyw: true }));
    for (let i = 0; i < 120; i += 1) {
      adapter.update(driveCtx);
      pbr.update(1 / 60);
    }

    const plan = adapter.getExitPlan!(ctx, {});
    expect(plan.canExit).toBe(true);
    expect(plan.position).toBeDefined();
    expect(plan.message).toBe('in-water');

    const hullPos = pbr.getPosition();
    const offset = Math.hypot(plan.position!.x - hullPos.x, plan.position!.z - hullPos.z);
    expect(offset).toBeGreaterThan(1);

    const setControlsSpy = vi.spyOn(pbr, 'setControls');
    adapter.onExit(ctx);

    expect(adapter.getActiveVehicleId()).toBeNull();
    expect(adapter.getControls().throttle).toBe(0);
    expect(adapter.getControls().rudder).toBe(0);
    expect(setControlsSpy).toHaveBeenCalledWith(0, 0);
    expect(camera.restoreInfantryAngles).toHaveBeenCalled();
    expect(hud.setVehicleContext).toHaveBeenLastCalledWith(null);
  });

  it('boarding the pilot seat does not silently consume the PBR gunner seats', () => {
    // The brief defers the gunner-mount swap path. The boarding adapter
    // only takes the pilot context; the two gunner IVehicle seats stay
    // vacant for the NPC fire path and the future seat-swap wire.
    const player = createPlayerState(new THREE.Vector3(0, 1, 0));
    const { ctx } = makeCtx(player, pbr.getPosition(), pbr.vehicleId);
    expect(pbr.hasFreeSeats('gunner')).toBe(true);
    adapter.onEnter(ctx);
    expect(pbr.hasFreeSeats('gunner')).toBe(true);
  });
});
