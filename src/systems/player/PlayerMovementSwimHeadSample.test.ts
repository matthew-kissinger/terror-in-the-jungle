import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PlayerMovement, PLAYER_EYE_HEIGHT } from './PlayerMovement';
import { PlayerState } from '../../types';
import { PlayerInput } from './PlayerInput';
import type { WaterSampler } from './PlayerSwimState';
import type {
  WaterInteractionOptions,
  WaterInteractionSample,
} from '../environment/water/WaterSurfaceSampler';

vi.mock('./PlayerInput');
vi.mock('../../utils/Logger');
vi.mock('../terrain/HeightQueryCache', () => {
  const mockCache = {
    getNormalAt: vi.fn().mockReturnValue({ x: 0, y: 1, z: 0 }),
    getSlopeAt: vi.fn().mockReturnValue(0),
    getHeightAt: vi.fn().mockReturnValue(0),
  };
  return {
    getHeightQueryCache: vi.fn().mockReturnValue(mockCache),
    HeightQueryCache: vi.fn(),
  };
});

/**
 * The swim/wade/walk branch must sample submersion at the player's eye
 * (head) world Y. `PlayerMovement` stores the eye position in
 * `playerState.position` (PlayerCamera copies it straight into the camera),
 * so the head sample should be taken at `position.y` regardless of stance.
 *
 * A crouching player whose eyes are well above the water surface must NOT
 * be flipped into swim mode just because they are crouched.
 */

const WATER_SURFACE_Y = 1.0;

/**
 * Position-aware sampler: reports submerged purely from the sampled Y vs a
 * fixed global surface, matching WaterSurfaceSampler's `depth > 0` contract.
 */
class FlatWaterSampler implements WaterSampler {
  lastSampleY = Number.NaN;

  sampleWaterInteraction(
    position: THREE.Vector3,
    _options?: WaterInteractionOptions,
  ): WaterInteractionSample {
    this.lastSampleY = position.y;
    const depth = Math.max(0, WATER_SURFACE_Y - position.y);
    return {
      source: depth > 0 ? 'global' : 'none',
      surfaceY: WATER_SURFACE_Y,
      depth,
      submerged: depth > 0,
      immersion01: Math.min(1, depth / 1.6),
      buoyancyScalar: Math.min(1, depth / 1.6),
      flowVelocity: new THREE.Vector3(),
    };
  }
}

function makePlayerState(y: number): PlayerState {
  return {
    position: new THREE.Vector3(0, y, 0),
    rotation: new THREE.Euler(),
    velocity: new THREE.Vector3(0, 0, 0),
    speed: 5,
    runSpeed: 8,
    jumpForce: 10,
    gravity: -30,
    isGrounded: true,
    isJumping: false,
    isRunning: false,
    health: 100,
    maxHealth: 100,
    isADS: false,
    isCrouching: false,
    isInHelicopter: false,
    helicopterId: null,
    currentWeaponIndex: 0,
    isDead: false,
    weaponSlots: [],
    isReloading: false,
  } as PlayerState;
}

describe('PlayerMovement swim head-sample stance handling', () => {
  let mockInput: PlayerInput;
  let mockTerrain: any;
  let camera: THREE.PerspectiveCamera;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInput = {
      isKeyPressed: vi.fn().mockReturnValue(false),
      getMouseMovement: vi.fn().mockReturnValue({ x: 0, y: 0 }),
      getTouchMovementVector: vi.fn().mockReturnValue({ x: 0, z: 0 }),
    } as any;
    // Flat terrain at Y=0 everywhere.
    mockTerrain = {
      getHeightAt: vi.fn().mockReturnValue(0),
      getEffectiveHeightAt: vi.fn().mockReturnValue(0),
      getPlayableWorldSize: vi.fn().mockReturnValue(0),
      getWorldSize: vi.fn().mockReturnValue(0),
    };
    camera = new THREE.PerspectiveCamera();
    camera.position.set(0, PLAYER_EYE_HEIGHT, 0);
    camera.lookAt(0, PLAYER_EYE_HEIGHT, -1);
  });

  it('does not enter swim mode while standing with eyes above the surface', () => {
    const state = makePlayerState(PLAYER_EYE_HEIGHT); // eye at 2.2, surface at 1.0
    const movement = new PlayerMovement(state);
    movement.setTerrainSystem(mockTerrain);
    movement.setWaterSampler(new FlatWaterSampler());

    movement.updateMovement(0.016, mockInput, camera);

    expect(movement.getLocomotionMode()).not.toBe('swim');
  });

  it('does not enter swim mode while crouched with eyes above the surface', () => {
    // Crouched eye height is ~1.32, comfortably above the 1.0 surface.
    // Start the body already settled at the crouched eye height so the
    // submersion sample reflects steady-state crouch, not the spawn frame.
    const state = makePlayerState(1.32);
    const movement = new PlayerMovement(state);
    movement.setTerrainSystem(mockTerrain);
    movement.setWaterSampler(new FlatWaterSampler());
    movement.setCrouching(true);

    movement.updateMovement(0.016, mockInput, camera);

    // The player's eyes (1.32) are above the water surface (1.0), so the
    // head sample must report dry and keep the player out of swim mode.
    expect(movement.getLocomotionMode()).not.toBe('swim');
  });
});
