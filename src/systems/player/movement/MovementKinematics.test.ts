import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { PlayerInput } from '../PlayerInput';
import { enforceWorldBoundary, resolveMovementIntent } from './MovementKinematics';

function makeInput(
  pressedKeys: readonly string[] = [],
  touchMove: { x: number; z: number } = { x: 0, z: 0 },
): PlayerInput {
  return {
    isKeyPressed: vi.fn((key: string) => pressedKeys.includes(key)),
    getTouchMovementVector: vi.fn(() => touchMove),
  } as unknown as PlayerInput;
}

function makeScratch(): {
  moveVector: THREE.Vector3;
  cameraDirection: THREE.Vector3;
  cameraRight: THREE.Vector3;
  worldMoveVector: THREE.Vector3;
  upVector: THREE.Vector3;
} {
  return {
    moveVector: new THREE.Vector3(),
    cameraDirection: new THREE.Vector3(),
    cameraRight: new THREE.Vector3(),
    worldMoveVector: new THREE.Vector3(),
    upVector: new THREE.Vector3(0, 1, 0),
  };
}

function makeCameraLookingAt(target: THREE.Vector3): THREE.Camera {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 2.2, 0);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera;
}

describe('MovementKinematics', () => {
  it('projects keyboard forward intent into camera-relative world movement', () => {
    const scratch = makeScratch();
    const result = resolveMovementIntent({
      input: makeInput(['keyw']),
      camera: makeCameraLookingAt(new THREE.Vector3(0, 2.2, -1)),
      baseSpeed: 5,
      agentMovementIntent: null,
      agentWorldMovementIntent: null,
      ...scratch,
    });

    expect(result.requestedSpeed).toBe(5);
    expect(result.hasWorldMovementIntent).toBe(false);
    expect(result.requestedMoveZ).toBeLessThan(-0.99);
    expect(Math.abs(result.requestedMoveX)).toBeLessThan(0.001);
  });

  it('lets world-space agent intent override camera-relative input', () => {
    const scratch = makeScratch();
    const result = resolveMovementIntent({
      input: makeInput(['keyd']),
      camera: makeCameraLookingAt(new THREE.Vector3(1, 2.2, 0)),
      baseSpeed: 8,
      agentMovementIntent: { forward: 1, strafe: 0 },
      agentWorldMovementIntent: { x: 0, z: -2 },
      ...scratch,
    });

    expect(result.requestedSpeed).toBe(8);
    expect(result.hasWorldMovementIntent).toBe(true);
    expect(result.requestedMoveZ).toBeLessThan(-0.99);
    expect(Math.abs(result.requestedMoveX)).toBeLessThan(0.001);
    expect(scratch.moveVector.lengthSq()).toBe(0);
  });

  it('prefers touch movement over keyboard while touch is outside the deadzone', () => {
    const scratch = makeScratch();
    const result = resolveMovementIntent({
      input: makeInput(['keyw'], { x: 1, z: 0 }),
      camera: makeCameraLookingAt(new THREE.Vector3(0, 2.2, -1)),
      baseSpeed: 5,
      agentMovementIntent: null,
      agentWorldMovementIntent: null,
      ...scratch,
    });

    expect(result.requestedMoveX).toBeGreaterThan(0.99);
    expect(Math.abs(result.requestedMoveZ)).toBeLessThan(0.001);
  });

  it('clamps boundary crossings and bounces velocity inward', () => {
    const position = new THREE.Vector3(12, 3, -13);
    const velocity = new THREE.Vector3(4, 0, -6);

    enforceWorldBoundary(position, velocity, 10, 0.5);

    expect(position.x).toBe(10);
    expect(position.z).toBe(-10);
    expect(velocity.x).toBe(-2);
    expect(velocity.z).toBe(3);
  });
});
